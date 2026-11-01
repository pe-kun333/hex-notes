// S2 プレイ、動画なし形態（M1-03、M1 の手順 3。骨組みは手順 2）。出どころ: design.md §1.3 S2（左右分割: 左列にプレイヤー
// 矩形 480×270 と HUD、右列の全高を落下域＋鍵盤図。通知もプレイヤー矩形の外。Pause は再開／最初から／やめる）・§2.5
// （右列の箱と R・v ＝ src/render/hex/sizing.ts の sizeForViewport）・§4.1（rAF 1 本、音は 25 ms 周期）・§4.2（動画なしは
// Space で同期中、曲末 ＋1.2 秒で終了 → 結果）、decisions #24・#35・#60（ラベルは鍵盤側・ノート側を別に）・#65（帯は左列の
// HUD の下、仮）、m1-kickoff 手順 3・§7-3（動画なし形態は矩形の場所に音源のカード、仮）、m6 S2 L326–358・renderS2
// L805–831、play-dev L177–791（DOM の配線。ループの中身は src/app/play-runner.ts の純関数）。
// 曲・配列・着地・文字・辺ヒント・音は設定（hexnote.settings）とプロファイルから（開発用の切替は出さない）。Salamander が
// 未同梱の間は合成音で鳴る（audio/context.ts）。
// M2 の手順 6: S4 練習室は同じ画面に練習のパネル（practice-panel.ts）を左列のプレイヤー矩形の場所に置いた物（room 真。
// m2-kickoff §7-9）。練習の設定は殻の practice()（S4 に入るたびに既定、§7-7）。S0d の段階は音待ちで流す（decisions #61・#82）。
// M2 の手順 9（M2-05）: 音ゲー向けの HUD（ランク・コンボ・ゲージ・ハイスピード・FAST／SLOW を 3 行に。m6 renderS2
// L823–826）、流れる時間にハイスピード（settings.hispeed。両プロファイル）、ゲージ 0 の途中終了は play-runner が終了にする。

import {
  PART_GAINS,
  cancelFrom,
  playKeyclick,
  playScheduled,
  readAudioClock,
  resumeAudio,
  type AudioOut,
} from '../../audio/context.ts'
import { PUMP_MS, lateBand } from '../../audio/scheduler.ts'
import { bridgeOf } from '../../clock/audio-bridge.ts'
import { perfNow } from '../../clock/clock-source.ts'
import type { InputEvent } from '../../input/keyboard.ts'
import { neighborOf, rulesOf, summarizeJudge } from '../../judge/judge.ts'
import { fadeOf, type FadeState } from '../../judge/self-rate.ts'
import { defaultLegendKind, legendOf, type Legend } from '../../layout/legend.ts'
import { labelsFor } from '../../layout/fallback.ts'
import { LAYOUTS } from '../../layout/presets.ts'
import { physOffFor } from '../../layout/stagger.ts'
import { ROW_OFF } from '../../render/hex/hex.ts'
import type { PlayPhase } from '../../play/state.ts'
import { buildFrame } from '../../render/canvas/commands.ts'
import { pruneEffects, type FxIntent } from '../../render/canvas/feedback.ts'
import { flush } from '../../render/canvas/flush.ts'
import { feedFrame, initialLowLoad, type LowLoadState } from '../../render/canvas/lowload.ts'
import { regionsOf } from '../../render/canvas/primitives.ts'
import { buildKeyboardGrid, type KeyboardGrid } from '../../render/hex/grid.ts'
import type { Sizing } from '../../render/hex/sizing.ts'
import type { KeyCode, LayoutId } from '../../shared/types.ts'
import { offsetFor } from '../../storage/local.ts'
import { playRow } from '../../telemetry/collect.ts'
import { gamerHudOf, hudOf } from '../hud.ts'
import type { ControlInput } from '../play-control.ts'
import {
  DEFAULT_PRACTICE,
  TUTORIAL_PRACTICE,
  newRun,
  runBar,
  runBars,
  runSetPractice,
  runControl,
  runFrame,
  runInput,
  runNotes,
  finishedPlay,
  runPhase,
  runPress,
  runPump,
  runRelease,
  type Run,
  type RunEffect,
  type PracticeOptions,
  type RunOptions,
  type RunStep,
} from '../play-runner.ts'
import { practicePanel, type PracticePanel } from '../practice-panel.ts'
import { keysetShown, loopBandText, practiceNote } from '../practice-view.ts'
import type { KeysetId } from '../../chart/keyset.ts'
import { profileOf, travelOf } from '../profile.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { songOf } from '../songs.ts'
import { stageOf, type Stage } from '../stage.ts'
import { TUTORIAL_TIPS, nextTutorial, secondsSince, tutorialKeyset } from '../onboard-flow.ts'
import { KEYSET_NAMES, TUTORIAL_KEYSETS } from '../../chart/keyset.ts'
import { markBooted } from '../../storage/session.ts'
import { onboardRow } from '../../telemetry/rows.ts'
import { newRecordId } from '../../results/record.ts'
import { button, h } from './frame.ts'
import { pauseOverlay } from './pause.ts'

export { LEAD_MS } from '../play-runner.ts'

/** 相ごとの案内（HUD の下の 1 行） */
export const PHASE_TEXT: Readonly<Record<PlayPhase, string>> = {
  idle: 'Space で開始',
  syncing: '同期中（300 ms は判定を猶予します）',
  playing: '再生中（Esc で一時停止）',
  waiting: '待ち（正しいキーを押すと進みます。Esc で一時停止）',
  paused: '一時停止中',
  ended: '終わりました',
}

/** 低負荷の段の初め（S6「自動／ON／OFF」。on は段 3 固定、off は段 0 固定、auto は 0 から自動で落とす。#29） */
const LOWLOAD_START = { auto: 0, on: 3, off: 0 } as const

export function playScreen(ctx: ScreenContext, room = false): ScreenView {
  const { doc } = ctx
  const settings = ctx.settings()
  const prof = profileOf(settings.profile)
  // 流れる時間（プロファイルの T ÷ ハイスピード。R は変えない、§2.5）
  const travelMs = travelOf(settings.profile, settings.hispeed)
  const entry = ctx.song()
  // 鍵数制限（S4 は入門者だけ選べる。音ゲー向けは全鍵、M2-07）
  const keyset = room && !keysetShown(settings.profile) ? 'all' : ctx.keyset()
  // 幾何（S6、decisions #45）: 物理せん断は段ずれの物理座標で鍵盤図の x をずらす。退避はキー文字を必ず出す
  const rowOff = settings.geometry === 'physical' ? physOffFor(settings.stagger) : ROW_OFF
  // S4 の 9 マスで替えられる（待機中だけ、M2-04）
  let shownLabels = {
    kb: labelsFor(settings.geometry, settings.labels.kb),
    note: labelsFor(settings.geometry, settings.labels.note),
  }
  // 退避の間は足場外しを止める（キー文字を常に出し、hinted に数え、α を動かさない。m2-kickoff §7-13）
  const fadeFrozen = settings.geometry === 'fallback'
  // 鍵盤図の配列は演奏する譜面版の配列（読むまでは設定の配列。チュートリアル曲は Ableton 型だけ、songs.ts の variantFor）
  let layoutId: LayoutId = settings.layout

  let run: Run | null = null
  let sizing: Sizing | null = null
  let grid: KeyboardGrid | null = null
  let legend: Legend = legendOf(
    null,
    settings.legend === 'auto' ? defaultLegendKind(navigator.language) : settings.legend,
  ).legend
  let dpr = 1
  let effects: FxIntent[] = []
  let low: LowLoadState = initialLowLoad(LOWLOAD_START[settings.fx.lowload])
  const pressed = new Set<KeyCode>()
  let out: AudioOut | null = null
  let lateShown = false
  let raf: number | null = null
  let pump: ReturnType<typeof setInterval> | null = null
  // 外した後に同じ回の入力・フレーム（「やめる」の後の事象）を効かせない
  let alive = true

  // 左列: プレイヤー矩形（動画なし形態は音源のカード）→ HUD → 案内 →（待機中だけ）ホームへ → 帯
  const player = h(
    doc,
    'div',
    { className: 'player' },
    h(
      doc,
      'div',
      { className: 'card source' },
      h(doc, 'b', { text: '自前音源' }),
      h(doc, 'span', { text: 'ピアノ音で鳴らします（動画なし）' }),
    ),
  )
  player.id = 'player'
  // S4: 練習の設定（無ければ既定）。S0d の段階は音待ち（自動ループ・自動昇降なし）。通常の S2 は練習なし
  const practiceOf = (): PracticeOptions | undefined =>
    room
      ? (ctx.practice() ?? DEFAULT_PRACTICE)
      : ctx.tutorial() !== null
        ? TUTORIAL_PRACTICE
        : undefined
  // S4 のパネル（左列のプレイヤー矩形の場所。ループ中の帯と練習記録の注記もここ）
  const loopNote = h(doc, 'div', { className: 'loopnote' })
  const practiceLine = h(doc, 'p', { className: 'note' })
  let panel: PracticePanel | null = null
  if (room) {
    panel = practicePanel(doc, {
      change: (patch) => changePractice(patch),
      keyset: (k) => changeKeyset(k),
      labels: (l) => changeLabels(l),
      fade: (patch) => changeFade(patch),
      fullPlay: () => {
        // 通しで弾く ＝ 同じ曲・同じ譜面版の通常プレイ（固定テンポ・1.0・全鍵、§1.2）
        ctx.setPractice(null)
        const e = ctx.song()
        if (e !== null) ctx.pickSong(e, 'all', ctx.variantSpec() ?? undefined)
        ctx.go('S2')
      },
      home: () => {
        ctx.setPractice(null)
        goHome()
      },
    })
    player.className = 'player room'
    player.replaceChildren(loopNote, panel.el)
  }
  const hud = h(doc, 'dl', { className: 'hud' })
  const hudRow = (label: string, ...dd: Node[]): HTMLElement => {
    const v = h(doc, 'dd', {}, ...dd)
    hud.append(h(doc, 'dt', { text: label }), v)
    return v
  }
  const title = hudRow('曲名')
  const bar = h(doc, 'i')
  const barText = h(doc, 'span', { text: '0%' })
  hudRow('進行', h(doc, 'span', { className: 'bar' }, bar), barText)
  // 音ゲー向け（prof.hud にランク以下の項目があるときだけ）: 精度の行の後ろに「ランク S ・ コンボ 48」（m6 L824 の横並び。
  // 1093×514 の左列に入るよう行を足さない）、ゲージの棒と数、「×1.0（1.0 s） ・ FAST 37 ／ SLOW 22」
  const gamerHud = prof.hud.includes('rank')
  const accuracy = h(doc, 'span')
  const rank = h(doc, 'b')
  const combo = h(doc, 'b')
  const gaugeBar = h(doc, 'i')
  const gaugeText = h(doc, 'span')
  const hispeed = h(doc, 'b')
  const fast = h(doc, 'b')
  const slow = h(doc, 'b')
  const t = (x: string): Text => doc.createTextNode(x)
  const accRow = hudRow('精度', accuracy, ...(gamerHud ? [h(doc, 'small', {}, t(' ランク '), rank, t(' ・ コンボ '), combo)] : [])) // prettier-ignore
  accRow.className = 'big'
  if (gamerHud) {
    hudRow('ゲージ', h(doc, 'span', { className: 'bar' }, gaugeBar), gaugeText)
    hudRow('ハイスピード', hispeed, t(' ・ FAST '), fast, t(' ／ SLOW '), slow)
  }
  const status = h(doc, 'p', { className: 'status', text: '読み込み中…' })
  const home = button(doc, 'ホームへ', () => goHome(), 'small')
  // S0d のチュートリアル曲（手順 9）: 段階の並びと吹き出し 3 つを左列に出す
  const stages = h(doc, 'ol', { className: 'steps tutorial' })
  const tips = h(
    doc,
    'ul',
    { className: 'tips' },
    ...TUTORIAL_TIPS.map((t) => h(doc, 'li', { text: t })),
  )
  const tutorialBox = h(doc, 'div', { className: 'tutorial-box' }, stages, tips)
  const showStages = (): void => {
    const t = ctx.tutorial()
    tutorialBox.hidden = t === null
    stages.replaceChildren(
      ...TUTORIAL_KEYSETS.map((k, i) => h(doc, 'li', { className: t !== null && i === t.stage ? 'on' : t !== null && i < t.stage ? 'done' : '', text: KEYSET_NAMES[k] })),
    )
  } // prettier-ignore
  showStages()
  const bandSlot = h(doc, 'div', { className: 'bands' })
  bandSlot.setAttribute('role', 'status')
  bandSlot.setAttribute('aria-live', 'polite')
  const left = h(
    doc,
    'div',
    { className: 'left' },
    player,
    hud,
    status,
    practiceLine,
    tutorialBox,
    h(doc, 'div', { className: 'btnrow' }, home),
    bandSlot,
  )

  // 右列: 落下域＋鍵盤図の canvas と Pause の覆い（右列だけを覆う）
  const canvas = h(doc, 'canvas')
  canvas.setAttribute('aria-label', '落ちる六角セルと鍵盤図')
  // 色の確認（S6「グレースケール確認」）: 色に頼らず読めるかを見る
  if (settings.grayscale) canvas.style.filter = 'grayscale(1)'
  const g2d = canvas.getContext('2d')
  const pause = pauseOverlay(doc, (choice) => control({ kind: 'choice', choice }))
  const stage = h(doc, 'div', { className: 'stage' }, canvas, pause.el)
  const root = h(doc, 'section', { className: 'screen play' }, left, stage)
  root.tabIndex = -1

  const layout = (): void => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    let st: Stage
    try {
      st = stageOf({ w: vw, h: vh }, LAYOUTS[layoutId].rowsUsed, travelMs)
    } catch (e) {
      // 箱が R 24 の鍵盤図より低い（decisions #24 (e)）。描かずに知らせ、resize で組み直す
      sizing = null
      grid = null
      status.textContent = `窓 ${vw}×${vh} では鍵盤図が入りません。窓を広げてください（${e instanceof Error ? e.message : String(e)}）`
      return
    }
    const { box, player: p } = st
    left.style.width = `${p.w}px`
    // S4 はパネルがプレイヤー矩形の場所を使う（高さはパネルの中身、左列の中で縦に流す）
    if (room) player.style.minHeight = `${p.h}px`
    else player.style.height = `${p.h}px`
    Object.assign(stage.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    })
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(box.width * dpr)
    canvas.height = Math.round(box.height * dpr)
    sizing = st.sizing
    grid = buildKeyboardGrid(layoutId, sizing.R, { left: sizing.kbLeft, top: sizing.kbTop }, legend, rowOff)
    show()
  } // prettier-ignore

  const show = (): void => {
    if (run === null) return
    const phase = runPhase(run)
    // 鍵盤図が入らない窓の知らせは残す
    const t = ctx.tutorial()
    if (sizing !== null)
      status.textContent =
        t !== null && phase === 'idle'
          ? `段階 ${t.stage + 1}／${TUTORIAL_KEYSETS.length}: ${KEYSET_NAMES[tutorialKeyset(t)]} ― Space で開始`
          : PHASE_TEXT[phase]
    home.hidden = room || phase !== 'idle'
    showPractice()
    if (phase === 'paused') pause.show()
    else if (!pause.el.hidden) {
      pause.hide()
      root.focus({ preventScroll: true })
    }
  }

  /** S4 のパネル・ループ中の帯・練習記録の注記を今の回から描く（変わった所だけ。毎フレーム） */
  const initialRange = ctx.practice()?.loop ?? null
  const weak = ctx.lastPlay()?.weak ?? null
  function showPractice(): void {
    const r = run
    if (r === null) return
    const p = r.practice
    const note = p === null || ctx.tutorial() !== null ? null : practiceNote({ mode: p.mode, rate: p.rate }, r.opts.keyset ?? 'all')
    if (practiceLine.textContent !== (note ?? '')) practiceLine.textContent = note ?? ''
    if (panel === null || p === null) return
    const range = p.loop.range
    // 区間が S3 の苦手区間のままなら「引き継ぎました」
    const inherited = range !== null && initialRange !== null && weak !== null && range.startBar === weak.from && range.endBar === weak.to
    const b = loopBandText(range, inherited)
    const text = b === null ? '' : `${b.title}。${b.detail}`
    if (loopNote.textContent !== text) {
      loopNote.replaceChildren(...(b === null ? [] : [h(doc, 'b', { text: b.title }), h(doc, 'span', { text: b.detail })]))
      loopNote.hidden = b === null
    }
    panel.update({ opts: { ...p.opts, mode: p.mode }, rate: p.pendingRate ?? p.rate, range, laps: p.loop.laps, bars: runBars(r), nowBar: runBar(r), self: r.judge.selfRate, keyset: r.opts.keyset ?? 'all', keysetShown: keysetShown(settings.profile), layout: r.song.variant.layout, idle: runPhase(r) === 'idle', labels: ctx.settings().labels, fade: r.judge.fade, pitches: r.notes.map((n) => n.midi), fadeFrozen })
  } // prettier-ignore

  /**
   * 鍵数制限を替えた（S4。判定する音の集合が変わるので、替えられるのは待機中だけ ＝ 回を作り直す。殻に覚えて S3 の
   * 「もう一度」でも同じ制限、M2-07）
   */
  function changeKeyset(k: KeysetId): void {
    if (!alive || run === null || runPhase(run) !== 'idle') return
    const e = ctx.song()
    if (e !== null) ctx.pickSong(e, k, ctx.variantSpec() ?? undefined)
    run = newRun(run.song, { ...run.opts, keyset: k })
    showHud(run)
    show()
  }

  /** ラベル 9 マス（S4、待機中だけ。設定に書き、自力率の数え方も替えるので回を作り直す。M2-04） */
  function changeLabels(l: {
    kb: 'key' | 'note' | 'both' | 'none'
    note: 'key' | 'note' | 'both' | 'none'
  }): void {
    if (!alive || run === null || runPhase(run) !== 'idle') return
    ctx.saveSettings({ ...ctx.settings(), labels: l })
    shownLabels = {
      kb: labelsFor(settings.geometry, l.kb),
      note: labelsFor(settings.geometry, l.note),
    }
    run = newRun(run.song, { ...run.opts, rules: { ...run.opts.rules, labels: shownLabels } })
    show()
  }

  /** 透明度（手動／成績連動・手動の値・リセット）。走っている回にもすぐ効かせ、保存する（M2-04） */
  function changeFade(patch: Partial<FadeState>): void {
    if (!alive || run === null) return
    const fade: FadeState = { ...run.judge.fade, ...patch }
    run = { ...run, judge: { ...run.judge, fade } }
    ctx.saveFade(fade)
    show()
  }

  /** パネルで設定を替えた: 殻に覚え、待機中の回は作り直し（区間なら始点の 1 小節前から）、走っている回には途中から効かせる */
  function changePractice(patch: Partial<PracticeOptions>): void {
    const next: PracticeOptions = { ...(ctx.practice() ?? DEFAULT_PRACTICE), ...patch }
    ctx.setPractice(next)
    if (!alive || run === null) return
    if (runPhase(run) === 'idle') run = newRun(run.song, { ...run.opts, practice: next })
    else apply(runSetPractice(run, perfNow(), patch))
    showHud(run)
    show()
  }

  // HUD は変わった所だけ書く（毎フレーム同じ文字を入れ直すと text node が替わり、レイアウトが走る）
  const put = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text
  }
  const showHud = (r: Run): void => {
    const sum = summarizeJudge(r.judge)
    const v = hudOf(r.song.name, r.t, r.lastEndMs, sum)
    put(title, v.title)
    const w = `${(v.progress * 100).toFixed(1)}%`
    if (bar.style.width !== w) bar.style.width = w
    put(barText, v.progressText)
    put(accuracy, v.accuracy)
    const g = gamerHud
      ? gamerHudOf(sum, r.judge.score.combo, settings.profile, settings.hispeed)
      : null
    if (g === null) return
    put(rank, g.rank)
    put(combo, g.combo)
    const gw = `${g.gauge.toFixed(1)}%`
    if (gaugeBar.style.width !== gw) gaugeBar.style.width = gw
    if (gaugeBar.classList.contains('clear') !== g.clear)
      gaugeBar.classList.toggle('clear', g.clear)
    put(gaugeText, g.gaugeText)
    put(hispeed, g.hispeed)
    put(fast, g.fast)
    put(slow, g.slow)
  }

  /** 音を出す準備（Space・Pause のボタンの中で。自動再生の制限） */
  const wake = (): void => {
    if (out === null) {
      out = ctx.audio()
      out.buses.accomp.gain.value = PART_GAINS.accomp * settings.audio.accompVolume
    }
    void resumeAudio(out)
  }

  const effect = (e: RunEffect): void => {
    if (e.kind === 'fx') effects = [...effects, e.fx]
    else if (out === null) return
    else if (e.kind === 'keyclick') playKeyclick(out, e.plan)
    else cancelFrom(out, out.ctx.currentTime)
  }

  const apply = (step: RunStep): void => {
    const before = run === null ? null : runPhase(run)
    run = step.run
    for (const e of step.effects) effect(e)
    if (runPhase(run) !== before) show()
  }

  function control(i: ControlInput): void {
    if (!alive || run === null) return
    // 鍵盤図が入らない窓では始めない（描けない回を走らせない）
    if (sizing === null && runPhase(run) === 'idle') return
    const now = perfNow()
    const r = runControl(run, now, i, { imeStop: settings.imeStop })
    if (r.go !== null) {
      goHome()
      return
    }
    if (r.step === null) return
    if (runPhase(r.step.run) === 'syncing') wake()
    if (r.fresh) {
      // 新しい回の始め: 予約の遅れの帯を下ろす（#65 (c)）、演出を捨てる
      lateShown = false
      ctx.band({ kind: 'audioLate', on: false })
      effects = []
    }
    apply(r.step)
  } // prettier-ignore

  const onEvents = (events: readonly InputEvent[]): void => {
    for (const ev of events) {
      if (!alive || run === null) return
      if (ev.kind === 'press') {
        pressed.add(ev.code)
        apply(runPress(run, ev, perfNow()))
      } else if (ev.kind === 'release') {
        pressed.delete(ev.code)
        apply(runRelease(run, ev, perfNow()))
      } else control({ kind: 'key', event: ev })
    }
  }

  /** 終わった回: 記録を results に（#51）、計測の play 行を telemetry に足し、S3 へ（保存の失敗はメモリ内で続く、#50） */
  const finish = (r: Run): void => {
    const at = new Date().toISOString()
    const o = finishedPlay(r, { id: newRecordId(globalThis.crypto, Date.now(), Math.random), at, profile: prof.profile })
    // 足場外しの α を回の終わりに保存（m4 の判定ごとの保存 → 回の終わり、§7-13）
    ctx.saveFade(r.judge.fade)
    ctx.setLastPlay(o)
    const row = playRow(
      r.collect,
      { chartId: o.chartId, variantId: o.variantId, profile: prof.profile, clock: 'novideo', mode: o.mode, rate: o.rate, keyset: o.keyset, ...(o.practice === null ? {} : { practice: o.practice }), aborted: o.aborted },
      o.judge,
      o.audioLateMaxMs,
      at,
    )
    void ctx.booted.db.putResult(o.record).catch(() => {})
    void ctx.booted.db.appendTelemetry(row).catch(() => {})
    // S0d: 段階 1・2 の曲末は次の段階をこの画面のまま待機に（Space で開始）。最後の段階の後に導線を終えて S3 へ
    const t = ctx.tutorial()
    if (t !== null) {
      const next = nextTutorial(t)
      if (next !== null) {
        const k = tutorialKeyset(next)
        ctx.setTutorial(next)
        const entry = ctx.song()
        if (entry !== null) ctx.pickSong(entry, k)
        run = newRun(r.song, { ...r.opts, keyset: k, fade: r.judge.fade })
        lateShown = false
        ctx.band({ kind: 'audioLate', on: false })
        effects = []
        showStages()
        show()
        return
      }
      endTutorial(false)
      ctx.setLastPlay({ ...o, onboardEnd: true })
    }
    ctx.go('S3')
  } // prettier-ignore

  /** S0d を閉じる（onboard 行の S0d・booted。left は途中でやめた） */
  function endTutorial(left: boolean): void {
    const t = ctx.tutorial()
    if (t === null) return
    ctx.setTutorial(null)
    void ctx.booted.db.appendTelemetry(onboardRow('S0d', secondsSince(t.enteredAt, perfNow()), left, new Date().toISOString())).catch(() => {})
    markBooted(ctx.booted.session)
  } // prettier-ignore

  /** S1 へ（「ホームへ」と Pause の「やめる」。S0d の途中なら離脱として閉じる） */
  function goHome(): void {
    endTutorial(true)
    // やめた回でも動いた α は残す（回の終わりの保存、M2-04）
    if (run !== null && runPhase(run) !== 'idle') ctx.saveFade(run.judge.fade)
    ctx.go('S1')
  }

  const draw = (now: number): void => {
    if (g2d === null || sizing === null || grid === null || run === null) return
    effects = pruneEffects(effects, now)
    const cmds = buildFrame({
      sizing,
      grid,
      mode: settings.landing,
      notes: runNotes(run),
      t: { song: run.t, real: now },
      pressed,
      effects,
      labels: shownLabels,
      ...(fadeFrozen
        ? {}
        : { fade: (midi: number) => fadeOf(run?.judge.fade ?? ctx.fade(), midi) }),
      hints: settings.hints,
      level: low.level,
    })
    flush(g2d, cmds, {
      regions: regionsOf(sizing),
      width: sizing.box.width,
      height: sizing.box.height,
      dpr,
    })
  }

  const frame = (ts: number): void => {
    if (!alive) return
    const now = perfNow()
    if (run !== null) {
      const phase = runPhase(run)
      // 低負荷: 走っている間のフレームだけ数える（一時停止・待機の間は渡さない。lowload.ts）
      if (settings.fx.lowload === 'auto' && (phase === 'playing' || phase === 'syncing')) {
        const lo = feedFrame(low, ts)
        low = lo.state
        if (lo.changed) ctx.band({ kind: 'lowLoad', level: low.level })
      }
      apply(runFrame(run, now, ts))
      if (runPhase(run) === 'ended') {
        finish(run)
        // 画面を移った（unmount の cancel は走っている回に効かない）ので次を取らない
        if (!alive) return
      }
      showHud(run)
      showPractice()
    }
    draw(now)
    raf = requestAnimationFrame(frame)
  }

  const pumpOnce = (): void => {
    if (!alive || run === null || out === null) return
    const now = perfNow()
    const p = runPump(run, now, bridgeOf(readAudioClock(out.ctx, now)))
    run = p.run
    for (const s of p.play) playScheduled(out, s)
    if (!lateShown && lateBand(run.sched)) {
      lateShown = true
      ctx.band({ kind: 'audioLate', on: true })
    }
  }

  const load = async (): Promise<void> => {
    if (entry === null) {
      status.textContent = '曲が選ばれていません。ホームで選んでください。'
      return
    }
    title.textContent = entry.name
    let json: unknown
    try {
      json = await entry.load()
    } catch (e) {
      if (alive) status.textContent = `曲が読めません（${e instanceof Error ? e.message : String(e)}）`
      return
    }
    if (!alive) return
    // S1 で選んだ版、無ければ設定の配列・プロファイルの上限（手順 8）
    const song = songOf(json, ctx.variantSpec() ?? { layout: settings.layout, limit: prof.limit, fold: settings.fold })
    if (typeof song === 'string') {
      status.textContent = song
      return
    }
    // 隣は六角の位置だけで決まる（R に依らない）ので、鍵盤図が入らない窓でも規則を作れる
    const byCode = buildKeyboardGrid(song.variant.layout, 1, { left: 0, top: 0 }).byCode
    const opts: RunOptions = {
      rules: rulesOf(prof.rules, {
        neighbor: neighborOf(byCode),
        offsetMs: offsetFor(ctx.calibration(), 'audio'),
        // 自力率は見えているラベルで数える（退避はキー文字を必ず出す）
        labels: shownLabels,
        fadeFrozen,
      }),
      fade: ctx.fade(),
      sound: { melody: settings.audio.guide, accomp: true, click: settings.audio.metronome },
      keyclick: settings.audio.keyclick,
      keyset,
      ...(practiceOf() === undefined ? {} : { practice: practiceOf() }),
    }
    run = newRun(song, opts)
    if (song.variant.layout !== layoutId) {
      layoutId = song.variant.layout
      layout()
    }
    showHud(run)
    show()
  } // prettier-ignore

  // 刻印: auto は getLayoutMap（読めれば鍵盤図を組み直す。§2.1）
  if (settings.legend === 'auto') {
    const kb = (navigator as Navigator & {
      keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> }
    }).keyboard
    void kb?.getLayoutMap?.()
      .then((m) => {
        if (!alive) return
        legend = legendOf(m, defaultLegendKind(navigator.language)).legend
        layout()
      })
      .catch(() => {})
  } // prettier-ignore

  home.hidden = true
  if (room) loopNote.hidden = true
  layout()
  void load().then(() => {
    if (alive && run === null) home.hidden = false
  })
  raf = requestAnimationFrame(frame)
  pump = setInterval(pumpOnce, PUMP_MS)

  return {
    root,
    bandSlot,
    player,
    onInput: onEvents,
    onResize: layout,
    unmount: () => {
      alive = false
      if (raf !== null) cancelAnimationFrame(raf)
      if (pump !== null) clearInterval(pump)
      raf = null
      pump = null
      if (out !== null) cancelFrom(out, out.ctx.currentTime)
    },
  }
}
