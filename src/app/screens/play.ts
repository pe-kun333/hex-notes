// S2 プレイ、動画なし形態（M1-03、M1 の手順 3。骨組みは手順 2）。出どころ: design.md §1.3 S2（左右分割: 左列にプレイヤー
// 矩形 480×270 と HUD、右列の全高を落下域＋鍵盤図。通知もプレイヤー矩形の外。Pause は再開／最初から／やめる）・§2.5
// （右列の箱と R・v ＝ src/render/hex/sizing.ts の sizeForViewport）・§4.1（rAF 1 本、音は 25 ms 周期）・§4.2（動画なしは
// Space で同期中、曲末 ＋1.2 秒で終了 → 結果）、decisions #24・#35・#60（ラベルは鍵盤側・ノート側を別に）・#65（帯は左列の
// HUD の下、仮）、m1-kickoff 手順 3・§7-3（動画なし形態は矩形の場所に音源のカード、仮）、m6 S2 L326–358・renderS2
// L805–831、play-dev L177–791（DOM の配線。ループの中身は src/app/play-runner.ts の純関数）。
// 曲・配列・着地・文字・辺ヒント・音は設定（hexnote.settings）とプロファイルから（開発用の切替は出さない）。Salamander が
// 未同梱の間は合成音で鳴る（audio/context.ts）。

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
import { defaultLegendKind, legendOf, type Legend } from '../../layout/legend.ts'
import { LAYOUTS } from '../../layout/presets.ts'
import type { PlayPhase } from '../../play/state.ts'
import { buildFrame } from '../../render/canvas/commands.ts'
import { pruneEffects, type FxIntent } from '../../render/canvas/feedback.ts'
import { flush } from '../../render/canvas/flush.ts'
import { feedFrame, initialLowLoad, type LowLoadState } from '../../render/canvas/lowload.ts'
import { regionsOf } from '../../render/canvas/primitives.ts'
import { buildKeyboardGrid, type KeyboardGrid } from '../../render/hex/grid.ts'
import type { Sizing } from '../../render/hex/sizing.ts'
import type { KeyCode } from '../../shared/types.ts'
import { offsetFor } from '../../storage/local.ts'
import { playRow } from '../../telemetry/collect.ts'
import { hudOf } from '../hud.ts'
import type { ControlInput } from '../play-control.ts'
import {
  newRun,
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
  type RunOptions,
  type RunStep,
} from '../play-runner.ts'
import { profileOf } from '../profile.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { songOf } from '../songs.ts'
import { stageOf, type Stage } from '../stage.ts'
import { newRecordId } from '../../results/record.ts'
import { button, h } from './frame.ts'
import { pauseOverlay } from './pause.ts'

export { LEAD_MS } from '../play-runner.ts'

/** 相ごとの案内（HUD の下の 1 行） */
export const PHASE_TEXT: Readonly<Record<PlayPhase, string>> = {
  idle: 'Space で開始',
  syncing: '同期中（300 ms は判定を猶予します）',
  playing: '再生中（Esc で一時停止）',
  waiting: '待ち',
  paused: '一時停止中',
  ended: '終わりました',
}

/** 低負荷の段の初め（S6「自動／ON／OFF」。on は段 3 固定、off は段 0 固定、auto は 0 から自動で落とす。#29） */
const LOWLOAD_START = { auto: 0, on: 3, off: 0 } as const

export function playScreen(ctx: ScreenContext): ScreenView {
  const { doc } = ctx
  const settings = ctx.settings()
  const prof = profileOf(settings.profile)
  const entry = ctx.song()
  const rows = LAYOUTS[settings.layout].rowsUsed

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
  const accuracy = hudRow('精度')
  accuracy.className = 'big'
  const status = h(doc, 'p', { className: 'status', text: '読み込み中…' })
  const home = button(doc, 'ホームへ', () => ctx.go('S1'), 'small')
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
    h(doc, 'div', { className: 'btnrow' }, home),
    bandSlot,
  )

  // 右列: 落下域＋鍵盤図の canvas と Pause の覆い（右列だけを覆う）
  const canvas = h(doc, 'canvas')
  canvas.setAttribute('aria-label', '落ちる六角セルと鍵盤図')
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
      st = stageOf({ w: vw, h: vh }, rows, prof.travelMs)
    } catch (e) {
      // 箱が R 24 の鍵盤図より低い（decisions #24 (e)）。描かずに知らせ、resize で組み直す
      sizing = null
      grid = null
      status.textContent = `窓 ${vw}×${vh} では鍵盤図が入りません。窓を広げてください（${e instanceof Error ? e.message : String(e)}）`
      return
    }
    const { box, player: p } = st
    left.style.width = `${p.w}px`
    player.style.height = `${p.h}px`
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
    grid = buildKeyboardGrid(settings.layout, sizing.R, { left: sizing.kbLeft, top: sizing.kbTop }, legend)
    show()
  } // prettier-ignore

  const show = (): void => {
    if (run === null) return
    const phase = runPhase(run)
    // 鍵盤図が入らない窓の知らせは残す
    if (sizing !== null) status.textContent = PHASE_TEXT[phase]
    home.hidden = phase !== 'idle'
    if (phase === 'paused') pause.show()
    else if (!pause.el.hidden) {
      pause.hide()
      root.focus({ preventScroll: true })
    }
  }

  // HUD は変わった所だけ書く（毎フレーム同じ文字を入れ直すと text node が替わり、レイアウトが走る）
  const put = (el: HTMLElement, text: string): void => {
    if (el.textContent !== text) el.textContent = text
  }
  const showHud = (r: Run): void => {
    const v = hudOf(r.song.name, r.t, r.lastEndMs, summarizeJudge(r.judge))
    put(title, v.title)
    const w = `${(v.progress * 100).toFixed(1)}%`
    if (bar.style.width !== w) bar.style.width = w
    put(barText, v.progressText)
    put(accuracy, v.accuracy)
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
      ctx.go(r.go)
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
    ctx.setLastPlay(o)
    const row = playRow(
      r.collect,
      { chartId: o.chartId, variantId: o.variantId, profile: prof.profile, clock: 'novideo', mode: 'fixed' },
      o.judge,
      o.audioLateMaxMs,
      at,
    )
    void ctx.booted.db.putResult(o.record).catch(() => {})
    void ctx.booted.db.appendTelemetry(row).catch(() => {})
    ctx.go('S3')
  } // prettier-ignore

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
      labels: settings.labels,
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
      const res = await fetch(entry.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      json = await res.json()
    } catch (e) {
      if (alive) status.textContent = `曲が読めません（${e instanceof Error ? e.message : String(e)}）`
      return
    }
    if (!alive) return
    const song = songOf(json, { layout: settings.layout, limit: prof.limit, fold: settings.fold })
    if (typeof song === 'string') {
      status.textContent = song
      return
    }
    // 隣は六角の位置だけで決まる（R に依らない）ので、鍵盤図が入らない窓でも規則を作れる
    const byCode = buildKeyboardGrid(settings.layout, 1, { left: 0, top: 0 }).byCode
    const opts: RunOptions = {
      rules: rulesOf(prof.rules, {
        neighbor: neighborOf(byCode),
        offsetMs: offsetFor(ctx.calibration(), 'audio'),
        labels: settings.labels,
      }),
      fade: ctx.booted.fade,
      sound: { melody: settings.audio.guide, accomp: true, click: settings.audio.metronome },
      keyclick: settings.audio.keyclick,
    }
    run = newRun(song, opts)
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
