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
// M3 の手順 2（M3-03 前半）: 動画の回（video-run.ts の videoRunOf。門 VIDEO_FEATURE は手順 12 まで開発時だけ真で、門を外す PR〔decisions #114〕で外した）はプレイヤー矩形に
// ctx.videoPort の口（前に何も置かない。同意の門は mountPlayer）、毎フレームの標本を runFrame へ、要求の効果を口の apply へ。
// 開始は利用者の ▶ だけ（decisions #95）。音を出す準備は S2 を作る時（S1 の釦の click の中）にも呼ぶ（m3-kickoff §7-14）。
// M3 の手順 3（M3-01 後半＋M3-02）: 左列を 480×270 のまま詰めた（HUD 13 px・「ホームへ」を案内の行へ・曲名 1 行。動画なしの
// S2 も同じ形、m3-kickoff §7-21）。動画ありの矩形は class `video`（縁・背景なし）。寸法の注記と入らない窓の文は折り返してよい
// 別の行。dev の assert に配置モデル（placement.ts）と、矩形と交差してはならない物を渡す（layoutProbe、§7-20）。
// M3 の手順 5（M3-05 前半、m3-kickoff §7-26・§7-27・§7-32）: 源が動画の間に読込の失敗・応答なし・onError を受けたら S7a。
// embedError 行（iframe 1 つに 1 回）と埋め込み不可の印（100・101・150）、iframe を外して（dispose）矩形の場所にカード（釦
// 「ピアノ音で遊ぶ」「ホームへ」）。走っていた回は捨てて待機に戻し（記録しない）、以後の標本は渡さない。「ピアノ音で遊ぶ」は
// 「動画を使う」を偽にして、自前音源の普通の回に作り直す（対象プレイ）。印のある動画で最初の PLAYING が来たら印を外す。
// M3 の手順 6（M3-04、m3-kickoff §7-28）: 源 video の同期中は案内の行に訳ごとの文（sync-notice.ts）、長引けば帯 sync、再開の
// playVideo が効かなければ自動再生ブロックの帯。毎フレーム訳と now から作り直す（1,000・2,000 ms には事象が無い）。口の
// autoplayBlocked・notVisible は種類だけ回へ（runPortEvent）。画面を離れる時に 2 つの帯を下ろす。
// M3 の手順 7（M3-05 後半、§7-4 の案 A ＝ #96・§7-14・§7-15・§7-22・§7-31・§7-32）: S7c の帯 videoFallback（fallbackBand。切替・
// ▶ の案内・戻せない の 3 つの形、毎フレーム作り直し）と「戻す」の釦（▶ の案内に替えるだけ。戻るのは利用者の ▶）、案内の行の
// S7c の 3 文。予約と打鍵音に門（AudioContext が running）。切替の後の口の失敗は回を続け、行と印だけ書いて以後の標本を渡さない。

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
import type { ClockMode, VideoPort } from '../../clock/types.ts'
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
import { calibKindOf, calibOffset } from '../calibration.ts'
import { offsetFor } from '../../storage/local.ts'
import { playRow } from '../../telemetry/collect.ts'
import { deviceAfterPlay } from '../../input/resolution.ts'
import { saveDeviceTsResolution } from '../chord-test-panel.ts'
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
  runClearHeat,
  runPress,
  runPump,
  runRelease,
  runPortEvent,
  runVideoGone,
  untilNextMs,
  type Run,
  type RunEffect,
  type PracticeOptions,
  type RunOptions,
  type RunSong,
  type RunStep,
} from '../play-runner.ts'
import { practicePanel, type PracticePanel } from '../practice-panel.ts'
import { heatSummaryText, keysetShown, loopBandText, practiceNote } from '../practice-view.ts'
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
import {
  EMPTY_HEAT,
  heatMerge,
  heatStats,
  heatSummary,
  type Heat,
  type HeatStat,
} from '../../results/heat.ts'
import type { PortEvent } from '../../youtube/port.ts'
import { videoRunOf } from '../video-run.ts'
import { embedFailPlan, isEmbedFail, type EmbedFailEvent, type EmbedView } from '../embed-view.ts'
import { unmarkNoEmbed } from '../../storage/local.ts'
import type { SyncCause } from '../../play/sync-cause.ts'
import {
  NOT_VISIBLE_DETAIL,
  NOT_VISIBLE_TITLE,
  S7C_TEXT,
  SYNC_TEXT,
  fallbackBand,
  syncNotice,
} from '../sync-notice.ts'
import { placementOf, sizeNote, type Placement } from '../placement.ts'
import { button, h } from './frame.ts'
import { pauseOverlay } from './pause.ts'

export { LEAD_MS } from '../play-runner.ts'

/** 相ごとの案内（HUD の下の 1 行） */
export const PHASE_TEXT: Readonly<Record<PlayPhase, string>> = {
  idle: 'Space で開始',
  syncing: SYNC_TEXT.grace,
  playing: '再生中（Esc で一時停止）',
  waiting: '待ち（正しいキーを押すと進みます。Esc で一時停止）',
  paused: '一時停止中',
  ended: '終わりました',
}

/** 案内文の入力（束 1 つ。後の手順が欄を足す、m3-kickoff §7-15） */
export interface PhaseTextInput {
  readonly phase: PlayPhase
  /** 回の今の源（動画の回は video、S7c の後は novideo） */
  readonly source: ClockMode
  /** 動画が読めた（口の標本が null でなくなった。動画なしは真） */
  readonly ready: boolean
  /** 同期中の訳（源 video の同期中と戻りを待つ間だけ。無ければ PHASE_TEXT。M3 の手順 6・7） */
  readonly cause?: SyncCause | null
  /** 訳 × now の文（sync-notice の syncNotice。渡せば cause より先。戻りを待つ間の 2,000 ms の後の文） */
  readonly syncText?: string | null
  /** 動画なしへ切り替えた回（M3 の手順 7） */
  readonly switched?: boolean
  /** AudioContext が running か（省けば真。M3 の手順 7） */
  readonly audioRunning?: boolean
  /** 戻りの後、次の未判定の音の着地までの ms（play-runner の untilNextMs。M3 の手順 7） */
  readonly untilNextMs?: number | null
}

/**
 * HUD の下の 1 行（動画の回の待機は ▶ の案内・読込中、他は PHASE_TEXT）。勝つ順は 切替の後に音が出ない間 → 戻りの後の
 * 「あと n 秒」→ 同期中の訳 → 切替の後の再生 → 相の文（入らない窓の知らせと S0d の段階は画面が先に決める。M3 の手順 7）
 */
export function phaseText(i: PhaseTextInput): string {
  if (i.source === 'video' && i.phase === 'idle')
    return i.ready ? 'プレイヤーの ▶ を押すと始まります' : '動画を読み込み中…'
  const s7c = i.switched === true && i.source === 'novideo'
  if (s7c && i.phase === 'playing' && i.audioRunning === false) return S7C_TEXT.silent
  if (
    (i.phase === 'playing' || i.phase === 'syncing') &&
    i.untilNextMs != null &&
    i.untilNextMs > 0
  )
    return S7C_TEXT.countdown(i.untilNextMs)
  if (i.phase === 'syncing') {
    if (i.syncText != null) return i.syncText
    if (i.cause != null && (i.source === 'video' || i.cause.kind === 'returnWait'))
      return SYNC_TEXT[i.cause.kind]
  }
  if (s7c && i.phase === 'playing') return S7C_TEXT.piano
  return PHASE_TEXT[i.phase]
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
  // 動画の回の口（鍵盤図が入る窓になってから作る。「最初から」と画面を離れる時に dispose）
  let port: VideoPort | null = null
  // 口の標本が null でなくなった（読込済み）
  let videoReady = false
  // S7a に入った（読込の失敗・onError。「ピアノ音で遊ぶ」で戻る。M3 の手順 5）
  let failed = false
  // この iframe で embedError 行を書いた（iframe 1 つに 1 回）
  let failWritten = false
  // この iframe で PLAYING を見た（印を外すのは最初の 1 回）
  let playingSeen = false
  // 読んだ曲（S7a の後の作り直し）
  let loadedSong: RunSong | null = null
  // S7c の帯: 「戻す」を押した（▶ の案内）・切替の後に口が失敗を知らせた（戻せない。以後の標本を渡さない）。M3 の手順 7
  let fbGuide = false
  let fbFailed = false
  const videoHost = h(doc, 'div', { className: 'video-host' })
  videoHost.style.cssText = 'width:100%;height:100%'

  // 左列: プレイヤー矩形（動画なし形態は音源のカード）→ HUD → 案内 →（待機中だけ）ホームへ → 帯
  // 動画なしの音源のカード（m6 L817–818。S7a の「ピアノ音で遊ぶ」の後もこれに戻す）
  const sourceCard = h(
    doc,
    'div',
    { className: 'card source' },
    h(doc, 'b', { text: '自前音源' }),
    h(doc, 'span', { text: 'ピアノ音で鳴らします（動画なし）' }),
  )
  const player = h(doc, 'div', { className: 'player' }, sourceCard)
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
  // S4 のヒートマップ（M4 の手順 2）: 前の回から持ち越した分と、この部屋で「最初から」の前の回の分（heatBase）に、今の回の
  // 分（run.heat）を合わせて出す。S3 から持ち越したら ON で始める。消すまで残し、保存しない（decisions #118・#121）
  const carried = room ? ctx.heatCarry() : null
  if (room) ctx.setHeatCarry(null)
  let heatBase: Heat = carried ?? EMPTY_HEAT
  let heatOn = carried !== null && carried.size > 0
  let heatMemo: { base: Heat; cur: Heat; stats: Map<KeyCode, HeatStat> } | null = null
  const heatShown = (r: Run): Map<KeyCode, HeatStat> => {
    if (heatMemo === null || heatMemo.base !== heatBase || heatMemo.cur !== r.heat)
      heatMemo = { base: heatBase, cur: r.heat, stats: heatStats(heatMerge(heatBase, r.heat)) }
    return heatMemo.stats
  }
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
      heatShow: (v) => {
        heatOn = v
        showPractice()
      },
      heatClear: () => {
        heatBase = EMPTY_HEAT
        if (run !== null) run = runClearHeat(run)
        showPractice()
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
  // 曲名は 1 行で省略（全文は title。左列の予算、§7-21）
  title.className = 'songname'
  const bar = h(doc, 'i')
  const barText = h(doc, 'span', { text: '0%' })
  hudRow('進行', h(doc, 'span', { className: 'bar' }, bar), barText)
  // 音ゲー向け（prof.hud にランク以下の項目があるときだけ）: 精度の行の後ろに「ランク S ・ コンボ 48」（m6 L824 の横並び。
  // 1093×514 の左列に入るよう行を足さない）、ゲージの棒と数、「×1.0（1.0 s） ・ FAST 37 ／ SLOW 22」
  // S0d（チュートリアル曲）は design L75 の「S2 の入門者形態」で、音ゲー向けでも入門者の HUD（左列の予算、m3-kickoff §7-21 の
  // 案 A。判定・流れる時間はプロファイルのまま）
  const gamerHud = prof.hud.includes('rank') && ctx.tutorial() === null
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
  const status = h(doc, 'p', { className: 'status' })
  /** 案内の行の文（1 行で省略するので全文は title にも） */
  const setStatus = (text: string): void => {
    if (status.textContent !== text) status.textContent = text
    if (status.title !== text) status.title = text
  }
  setStatus('読み込み中…')
  // 「ホームへ」は案内の行の右（待機中だけ。行の高さは釦の 28.4 px のまま。S4 はパネルに持つので出さない。M3 の手順 3、§7-21）
  const home = button(doc, 'ホームへ', () => goHome(), 'small')
  const statusRow = h(doc, 'div', { className: 'statusrow' }, status, home)
  // 寸法の注記・入らない窓の文（折り返してよい別の行。空なら消える）
  const sizeLine = h(doc, 'p', { className: 'note sizenote' })
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
    statusRow,
    sizeLine,
    practiceLine,
    tutorialBox,
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
  // 配置モデル（鍵盤図が入らない窓は null）。dev の assert が実 DOM と突き合わせる
  let placement: Placement | null = null

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
      placement = null
      // 相の文は消す（入らない窓では Space で始めない）。曲を読めなかった文などは回が無いので残す
      if (run !== null) setStatus('')
      sizeLine.textContent = `窓 ${vw}×${vh} では鍵盤図が入りません。窓を広げてください（${e instanceof Error ? e.message : String(e)}）`
      return
    }
    placement = placementOf({ w: vw, h: vh }, st)
    sizeLine.textContent = sizeNote(st.sizing, travelMs) ?? ''
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
    // 窓が広がって鍵盤図が入った: 待っていた動画の回の口を作る
    mountVideo()
    show()
  } // prettier-ignore

  const show = (): void => {
    if (run === null) return
    const phase = runPhase(run)
    // 鍵盤図が入らない窓の知らせは残す
    const t = ctx.tutorial()
    if (sizing !== null)
      setStatus(
        t !== null && phase === 'idle'
          ? `段階 ${t.stage + 1}／${TUTORIAL_KEYSETS.length}: ${KEYSET_NAMES[tutorialKeyset(t)]} ― Space で開始`
          : phaseText(textInput(run, perfNow())),
      )
    // S7a の間は案内の行の文と「ホームへ」を隠す（カードの釦が出口）
    if (failed) setStatus('')
    home.hidden = room || phase !== 'idle' || failed
    // S0d の吹き出しは待機中だけ（演奏中は段階の 1 行だけにして帯の場所を空ける。§7-21 の案 A）
    tips.hidden = phase !== 'idle'
    showPractice()
    if (phase === 'paused') pause.show()
    else if (!pause.el.hidden) {
      pause.hide()
      root.focus({ preventScroll: true })
    }
    // 相の変わり目（dev では配置の assert を回す）
    ctx.layoutChanged()
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
    panel.update({ opts: { ...p.opts, mode: p.mode }, rate: p.pendingRate ?? p.rate, range, laps: p.loop.laps, bars: runBars(r), nowBar: runBar(r), self: r.judge.selfRate, keyset: r.opts.keyset ?? 'all', keysetShown: keysetShown(settings.profile), layout: r.song.variant.layout, idle: runPhase(r) === 'idle', labels: ctx.settings().labels, fade: r.judge.fade, pitches: r.notes.map((n) => n.midi), fadeFrozen, ...heatPanel(r) })
  } // prettier-ignore

  /** パネルのヒートマップの行（要約は今の回までの合わせた分） */
  function heatPanel(r: Run): { heatOn: boolean; heatText: string; heatEmpty: boolean } {
    const s = heatSummary(heatShown(r))
    return { heatOn, heatText: heatSummaryText(s), heatEmpty: s.keys === 0 }
  }

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
    if (title.title !== v.title) title.title = v.title
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

  /** 口の事象。源が動画の間（相を問わない）の読込の失敗・応答なし・onError は S7a（S7c の後の失敗は手順 7、§7-32） */
  const onVideoEvent = (e: PortEvent): void => {
    if (!alive || failed || run === null || run.video === null) return
    // 切替の後（源 novideo）の失敗: 回は続け、行と印だけ書いて以後の標本を渡さない（帯は戻せない形。§7-32）
    if (run.session.play.source !== 'video') {
      if (!fbFailed && isEmbedFail(e)) failAfterSwitch(e, run.video.videoId)
      return
    }
    // 自動再生ブロック・プレイヤーが隠れている: 再開の待ちの訳に控える（notVisible は口の apply の中で同期に来る。run は
    // apply が先に歩の後の回にしている）
    if (e.kind === 'autoplayBlocked' || e.kind === 'notVisible') {
      run = runPortEvent(run, e.kind)
      showSync(perfNow())
      return
    }
    if (!isEmbedFail(e)) return
    enterS7a(e, run.video.videoId)
  }

  /**
   * 同期中の案内の行の文と帯（毎フレームと口の事象の後。訳 × now から作り直す。変わらなければ殻も描き直さない）。源 video の
   * 同期中でなければ訳は null で、2 つの帯は下りる
   */
  function showSync(now: number): void {
    const r = run
    if (r === null) return
    const n = syncNotice(failed ? null : r.syncCause, now)
    const phase = runPhase(r)
    // 案内の行は毎フレーム（「あと n 秒」・2,000 ms の後の文。S0d の待機と S7a は show が決める）
    if (sizing !== null && !failed && !(ctx.tutorial() !== null && phase === 'idle'))
      setStatus(phaseText(textInput(r, now)))
    ctx.band({ kind: 'sync', on: n.band })
    // S7c の帯（切替の後の源 novideo の間。戻りを待つ間は帯 sync だけ。待ちに入ったら ▶ の案内は役目を終える）
    const waiting = r.syncCause?.kind === 'returnWait'
    if (waiting) fbGuide = false
    ctx.band(
      fallbackBand({
        switched: switchedOf(r),
        running: phase !== 'idle' && phase !== 'ended' && !failed,
        waiting,
        guide: fbGuide,
        failed: fbFailed,
      }),
    )
    ctx.band(
      n.autoplay === null
        ? { kind: 'autoplayBlocked', on: false }
        : n.autoplay === 'notVisible'
          ? {
              kind: 'autoplayBlocked',
              on: true,
              title: NOT_VISIBLE_TITLE,
              detail: NOT_VISIBLE_DETAIL,
            }
          : { kind: 'autoplayBlocked', on: true },
    )
  }

  /** 動画なしへ切り替えた回で、今の源が novideo（S7c の後） */
  const switchedOf = (r: Run): boolean =>
    r.collect.fallbackT !== null && r.session.play.source === 'novideo'

  /** 案内の行の入力（訳 × now の文、S7c の 3 文の材料） */
  function textInput(r: Run, now: number): PhaseTextInput {
    return {
      phase: runPhase(r),
      source: r.session.play.source,
      ready: r.video === null || videoReady,
      cause: r.syncCause,
      syncText: syncNotice(r.syncCause, now).text,
      switched: switchedOf(r),
      audioRunning: out !== null && out.ctx.state === 'running',
      untilNextMs: untilNextMs(r),
    }
  }

  /** 切替の後に口が失敗を知らせた: embedError 行（iframe 1 つに 1 回）と印、以後の標本を渡さない。回は続ける（§7-32） */
  function failAfterSwitch(e: EmbedFailEvent, videoId: string): void {
    const plan = embedFailPlan(e, videoId, ctx.noEmbed(), failWritten, new Date().toISOString())
    if (plan.row !== null) {
      failWritten = true
      void ctx.booted.db.appendTelemetry(plan.row).catch(() => {})
    }
    ctx.setNoEmbed(plan.list)
    fbFailed = true
    // 戻りを待つ間に失われたら、止めた t からピアノで続ける（最後の PLAYING を捨てて予約の門を開く）
    if (run !== null) apply(runVideoGone(run, perfNow()))
    showSync(perfNow())
  }

  /** 帯の釦（S7c の「戻す」: ▶ の案内に替えるだけ。戻るのは利用者の ▶、§7-4 の案 A） */
  function onBandAction(id: string): void {
    if (id !== 'return' || run === null || !switchedOf(run) || fbFailed) return
    fbGuide = true
    showSync(perfNow())
  }

  /** S7a に入る（行・印・iframe を外す・回を捨てて待機・カード） */
  function enterS7a(e: EmbedFailEvent, videoId: string): void {
    const plan = embedFailPlan(e, videoId, ctx.noEmbed(), failWritten, new Date().toISOString())
    if (plan.row !== null) {
      failWritten = true
      void ctx.booted.db.appendTelemetry(plan.row).catch(() => {})
    }
    ctx.setNoEmbed(plan.list)
    failed = true
    port?.dispose()
    port = null
    if (out !== null) cancelFrom(out, out.ctx.currentTime)
    // 走っていた回は捨てる（記録しない）。待機の動画の回に戻し、標本は渡さない
    const song = loadedSong
    if (song !== null) run = newRun(song, runOptionsOf(song, videoId))
    effects = []
    player.className = 'player'
    player.replaceChildren(s7aCard(plan.view))
    show()
    ctx.layoutChanged()
  }

  /** S7a のカード（見出し・本文・釦 2 つ。矩形の場所、案 A） */
  function s7aCard(v: EmbedView): HTMLElement {
    const piano = button(doc, 'ピアノ音で遊ぶ', () => playPiano(), 'primary')
    return h(doc, 'div', { className: 'card source s7a' },
      h(doc, 'b', { text: v.title }),
      h(doc, 'span', { text: v.body }),
      h(doc, 'div', { className: 'btnrow' }, piano, button(doc, 'ホームへ', () => goHome())),
    )
  } // prettier-ignore

  /** 「ピアノ音で遊ぶ」: 「動画を使う」を偽にして、自前音源の普通の回を待機で作り直す（対象プレイ、§7-24・§7-33） */
  function playPiano(): void {
    const song = loadedSong
    if (!alive || song === null) return
    wake()
    ctx.setUseVideo(false)
    failed = false
    fbGuide = false
    fbFailed = false
    run = newRun(song, runOptionsOf(song, null))
    player.className = 'player'
    player.replaceChildren(sourceCard)
    showHud(run)
    show()
    root.focus({ preventScroll: true })
    ctx.layoutChanged()
  }

  /** 動画の回の口を作る（鍵盤図が入らない窓の間は作らない。描けない回を走らせない、control と同じ訳） */
  const mountVideo = (): void => {
    if (!alive || failed || port !== null || run === null || run.video === null || sizing === null)
      return
    videoReady = false
    failWritten = false
    playingSeen = false
    port = ctx.videoPort({ host: videoHost, videoId: run.video.videoId, onEvent: onVideoEvent })
    ctx.layoutChanged()
  }

  const effect = (e: RunEffect): void => {
    switch (e.kind) {
      case 'fx':
        effects = [...effects, e.fx]
        return
      case 'video':
        port?.apply(perfNow(), [e.request])
        return
      case 'videoReset':
        // 「最初から」: iframe を作り直して利用者の ▶ を待つ（decisions #95）
        port?.dispose()
        port = null
        mountVideo()
        return
      case 'keyclick':
        // 門: AudioContext が running の間だけ（suspended の間に予約すると再開の時に重なる。M3 の手順 7）
        if (out !== null && out.ctx.state === 'running') playKeyclick(out, e.plan)
        return
      case 'cancelSounds':
        if (out !== null) cancelFrom(out, out.ctx.currentTime)
        return
    }
  }

  const apply = (step: RunStep): void => {
    const before = run === null ? null : runPhase(run)
    run = step.run
    for (const e of step.effects) effect(e)
    if (runPhase(run) !== before) show()
  }

  function control(i: ControlInput): void {
    // S7a の間はカードの釦だけ（Space で始めない）
    if (!alive || run === null || failed) return
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
    // S4 の「最初から」: 前の回のヒートマップを残す（消すまで。M4 の手順 2）
    if (r.fresh && room) heatBase = heatMerge(heatBase, run.heat)
    if (r.fresh) {
      // 新しい回の始め: 予約の遅れの帯を下ろす（#65 (c)）、演出を捨てる。S7c の帯の形も初めに戻す（帯は次のフレームで下りる）
      fbGuide = false
      fbFailed = false
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
        // 切替の後に音が出ない間（AudioContext が止まっている）は押下の中で起こす（§7-14）
        if (switchedOf(run) && (out === null || out.ctx.state !== 'running')) wake()
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
    ctx.devProbe?.finished(o)
    const row = playRow(
      r.collect,
      { chartId: o.chartId, variantId: o.variantId, profile: prof.profile, clock: o.clock, mode: o.mode, rate: o.rate, keyset: o.keyset, ...(o.practice === null ? {} : { practice: o.practice }), aborted: o.aborted },
      o.judge,
      o.audioLateMaxMs,
      at,
    )
    void ctx.booted.db.putResult(o.record).catch(() => {})
    void ctx.booted.db.appendTelemetry(row).catch(() => {})
    // 刻みが決まった・変わった回だけ端末プロファイルと device 行（M3 の手順 11、§7-38）
    const dev = deviceAfterPlay(ctx.device(), ctx.stamps())
    if (dev !== null) saveDeviceTsResolution(ctx, dev)
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
    // ヒートマップは S4 で ON の間、待機と一時停止の間だけ重ねる（演奏中は落ちる音と重なる。§7-8）。重ねている間は落ちるセルを
    // 描かない（区間の前の音は待機中に着地のセルに留まり、そのセルの重ね描きを隠すため。decisions #121 (c)）
    const heatNow = room && heatOn && (runPhase(run) === 'idle' || runPhase(run) === 'paused')
    const cmds = buildFrame({
      sizing,
      grid,
      mode: settings.landing,
      notes: heatNow ? [] : runNotes(run),
      t: { song: run.t, real: now },
      pressed,
      effects,
      labels: shownLabels,
      ...(fadeFrozen
        ? {}
        : { fade: (midi: number) => fadeOf(run?.judge.fade ?? ctx.fade(), midi) }),
      hints: settings.hints,
      level: low.level,
      ...(heatNow ? { heat: heatShown(run) } : {}),
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
      // 動画の回はこのフレームの読み（読めない・準備前は null）
      // 切替の後の失敗（fbFailed）の後も標本を渡さない（M3 の手順 7）
      const read = failed || fbFailed ? null : (port?.sample(now) ?? null)
      // 読んだ時に口が失敗を知らせたら（S7a に入った）、その読みも新しい回へ渡さない
      const sample = failed || fbFailed ? null : read
      if (!videoReady && sample !== null) {
        videoReady = true
        show()
      }
      // 埋め込み不可の印のある動画で最初の PLAYING が来たら印を外す（再生できた。§7-27）
      if (!playingSeen && sample?.state === 'playing' && run.video !== null) {
        playingSeen = true
        ctx.setNoEmbed(unmarkNoEmbed(ctx.noEmbed(), run.video.videoId))
      }
      apply(runFrame(run, now, ts, sample))
      ctx.devProbe?.play({
        phase: runPhase(run),
        source: run.session.play.source,
        audio: out?.ctx.state ?? null,
      })
      if (runPhase(run) === 'ended') {
        finish(run)
        // 画面を移った（unmount の cancel は走っている回に効かない）ので次を取らない
        if (!alive) return
      }
      showHud(run)
      showPractice()
      showSync(now)
    }
    draw(now)
    raf = requestAnimationFrame(frame)
  }

  const pumpOnce = (): void => {
    if (!alive || run === null || out === null) return
    const now = perfNow()
    // 門: running でない間は予約せず、開いた回に今の譜面 ms へ数え直す（M3 の手順 7）
    const p = runPump(run, now, bridgeOf(readAudioClock(out.ctx, now)), out.ctx.state === 'running')
    run = p.run
    for (const s of p.play) playScheduled(out, s)
    if (!lateShown && lateBand(run.sched)) {
      lateShown = true
      ctx.band({ kind: 'audioLate', on: true })
    }
  }

  /** 回の作り（videoId が null なら動画なし。S7a の後の作り直しも同じ形） */
  function runOptionsOf(song: RunSong, videoId: string | null): RunOptions {
    const practice = practiceOf()
    // 隣は六角の位置だけで決まる（R に依らない）ので、鍵盤図が入らない窓でも規則を作れる
    const byCode = buildKeyboardGrid(song.variant.layout, 1, { left: 0, top: 0 }).byCode
    return {
      rules: rulesOf(prof.rules, {
        neighbor: neighborOf(byCode),
        // 校正の種別は回から（動画の回は youtube、段 4 のタップで合わせた sync〔measured 真〕は 0。M3 の手順 9、§7-34）
        offsetMs: calibOffset(
          ctx.calibration(),
          calibKindOf({ video: videoId !== null, measured: song.sync?.sources[0]?.measured }),
        ),
        // 自力率は見えているラベルで数える（退避はキー文字を必ず出す）
        labels: shownLabels,
        fadeFrozen,
      }),
      fade: ctx.fade(),
      sound: { melody: settings.audio.guide, accomp: true, click: settings.audio.metronome },
      keyclick: settings.audio.keyclick,
      keyset,
      ...(practice === undefined ? {} : { practice }),
      ...(videoId === null ? {} : { video: { videoId } }),
      // 動画なしへ切り替えた後の部（旋律は設定のガイド音によらず鳴らす・伴奏は常に・クリックは設定。§7-31）
      ...(videoId === null
        ? {}
        : { fallbackSound: { melody: true, accomp: true, click: settings.audio.metronome } }),
    }
  }

  const load = async (): Promise<void> => {
    if (entry === null) {
      setStatus('曲が選ばれていません。ホームで選んでください。')
      return
    }
    title.textContent = entry.name
    title.title = entry.name
    let json: unknown
    try {
      json = await entry.load()
    } catch (e) {
      if (alive) setStatus(`曲が読めません（${e instanceof Error ? e.message : String(e)}）`)
      return
    }
    if (!alive) return
    // S1 で選んだ版、無ければ設定の配列・プロファイルの上限（手順 8）
    const song = songOf(json, ctx.variantSpec() ?? { layout: settings.layout, limit: prof.limit, fold: settings.fold })
    if (typeof song === 'string') {
      setStatus(song)
      return
    }
    // 動画の回か（sources[0] が youtube・「動画を使う」・練習室でない・門が真。練習〔S0d の段階も〕とは併せない、#94）
    const videoId = practiceOf() === undefined ? videoRunOf(song.sync, ctx.useVideo(), room) : null
    loadedSong = song
    run = newRun(song, runOptionsOf(song, videoId))
    if (run.video !== null) {
      // 動画の回: 矩形は口だけ（前に何も置かない、design §2.9。縁・背景なしで iframe は矩形ちょうど、§7-21）
      player.className = 'player video'
      player.replaceChildren(videoHost)
      mountVideo()
    }
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
  // 音を出す準備は S2 を作る時にも（S1 の釦の click の中で同期に走る。動画の回の ▶ は iframe の中の操作なので、そこでは
  // AudioContext を起こせない。m3-kickoff §7-14）
  wake()
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
    onBandAction,
    // 矩形と交差してはならない物（帯は殻が足す）。左列の予算は S2 の通常の回だけ見る（S4・S0d は外す、§7-21）
    layoutProbe: () => ({
      outside: [hud, statusRow, sizeLine, practiceLine, tutorialBox, stage, pause.el],
      column: room || ctx.tutorial() !== null ? null : left,
      placement: room ? null : placement,
      canvas: stage,
    }),
    unmount: () => {
      alive = false
      if (raf !== null) cancelAnimationFrame(raf)
      if (pump !== null) clearInterval(pump)
      raf = null
      pump = null
      if (out !== null) cancelFrom(out, out.ctx.currentTime)
      port?.dispose()
      port = null
      // 同期中の 2 つの帯は殻にあるので、画面を離れる時に下ろす（S1 へ付いて行かない）
      ctx.band({ kind: 'sync', on: false })
      ctx.band({ kind: 'autoplayBlocked', on: false })
      ctx.band({ kind: 'videoFallback', on: false })
    },
  }
}
