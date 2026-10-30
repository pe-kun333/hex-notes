// 唯一の ClockSource（M0-05、手順 7）。出どころ: design.md §2.6「主時計: 全モードで performance.now 単独。t＝a·now＋b を
// 時計層が一本だけ持つ」・§4.1・§4.2、decisions #11、kickoff 手順 7（m3 `clk` L324–350・`nvTime` L351・`clockAt`
// L354–355・`resync` L376–382・`enterNoVideo／leaveNoVideo` L383–384・`frame` L599–610 の手直し）、相談 C（案 A-2・B-4・
// C-2）、decisions #32〜#34（仮）。
// 状態は値で持ち、clockTick（毎フレーム、動画の読み 1 つ）と clockCommand（入力のハンドラの now）が新しい状態と出力を
// 返す純関数。now は値で受け、1 tick に 1 回だけ読む。performance.now の直呼びはこのファイルの perfNow と src/app/ だけ。
// 校正のオフセットは足さない（手順 8 の judge/calibration-offset.ts）。t は動画の軸（map.ts の toChartMs で譜面の軸へ）。

import type { NowFn } from '../shared/types.ts'
import { estimateQ, lineOf, trimWindow, type FitPoint } from './fit.ts'
import { graceEnd } from './grace.ts'
import { classifySample } from './jump.ts'
import { songAt } from './map.ts'
import { isMoving, isStalled, pauseOutcome, reRequestDue } from './stall.ts'
import type {
  ClockCommand,
  ClockEvent,
  ClockMap,
  ClockMode,
  ClockOutput,
  ClockPhase,
  ResyncReason,
  VideoRequest,
  VideoSample,
  VideoState,
} from './types.ts'

/** 量子化の補正の係数 β（出力に ＋β·q̂。0.5 は getCurrentTime が切り捨てと仮定。四捨五入なら 0。M3-07 で決める、仮） */
export const BETA_DEFAULT = 0.5

/** 唯一の performance.now の直呼び（時計層の中で）。試験は now を手で進め、これを使わない */
export const perfNow: NowFn = () => performance.now()

export interface ClockOptions {
  mode: ClockMode
  /** 開始前に保持する t（動画なしは開始の t。動画ありは最初の PLAYING の読みで決まる） */
  t0: number
  /** 再生レート（テンポ段。既定 1） */
  rate?: number
  beta?: number
}

export interface ClockState {
  readonly mode: ClockMode
  readonly phase: ClockPhase
  readonly rate: number
  readonly beta: number
  /** stopped・held・ad で保つ t（β·q̂ を含む出力の値） */
  readonly holdT: number
  /** 再アンカーの点。novideo は線の起点（t ＝ anchor.t ＋ (now − anchor.now)·rate）、video は fresh の間に保つ読み */
  readonly anchor: { readonly now: number; readonly t: number }
  readonly graceUntil: number
  /** held から PLAYING で再アンカーするときの理由（start・resume・seek・unheld など） */
  readonly pending: ResyncReason
  /** 最後の再アンカーの理由（読みが変わる前に BUFFERING を挟んだら、PLAYING での再アンカーもこの理由にする） */
  readonly anchorReason: ResyncReason
  /** 再アンカーの後、読みがまだ変わっていない（video。t を保持し外挿しない） */
  readonly fresh: boolean
  /** 当てはめの窓（受け入れた標本だけ） */
  readonly window: readonly FitPoint[]
  /** 窓の当てはめの線（β·q̂ を含まない）。窓が空なら null */
  readonly line: ClockMap | null
  /** 直前の読み（捨てた読みも含む）。分からなければ null */
  readonly lastRead: number | null
  /** 読みが最後に変わった now（再アンカー・可視への復帰でも now にする） */
  readonly lastChange: number
  readonly lastState: VideoState | null
  readonly visible: boolean
  /** 量子化の刻みの推定（持ち越す） */
  readonly qHat: number
  /** 単調の床（video の走っている相の直前の出力。再アンカーで null） */
  readonly floorT: number | null
  /** 停止検知の pauseVideo を最後に要求した now */
  readonly reqAt: number
}

export interface ClockStep {
  state: ClockState
  out: ClockOutput
}

export function initialClock(opts: ClockOptions): ClockState {
  return {
    mode: opts.mode,
    // 動画ありは利用者の click-to-play で PLAYING が来るのを待つ（decisions #11）。動画なしは start の命令を待つ
    phase: opts.mode === 'video' ? 'held' : 'stopped',
    rate: opts.rate ?? 1,
    beta: opts.beta ?? BETA_DEFAULT,
    holdT: opts.t0,
    anchor: { now: 0, t: opts.t0 },
    graceUntil: -Infinity,
    pending: 'start',
    anchorReason: 'start',
    fresh: false,
    window: [],
    line: null,
    lastRead: null,
    lastChange: -Infinity,
    lastState: null,
    visible: true,
    qHat: 0,
    floorT: null,
    reqAt: -Infinity,
  }
}

const RUNNING: ReadonlySet<ClockPhase> = new Set(['grace', 'locked', 'pauseReq'])

/** 次の tick まで有効な写像（床を含まない） */
export function mapOf(s: ClockState): ClockMap {
  if (!RUNNING.has(s.phase)) return { a: 0, b: s.holdT }
  if (s.mode === 'novideo') return { a: s.rate, b: s.anchor.t - s.rate * s.anchor.now }
  const bias = s.beta * s.qHat
  if (s.fresh || s.line === null) return { a: 0, b: s.anchor.t + bias }
  return { a: s.line.a, b: s.line.b + bias }
}

/** この now での t（video の走っている相は単調の床を掛ける） */
function valueAt(s: ClockState, now: number): number {
  const t = songAt(mapOf(s), now)
  return s.mode === 'video' && RUNNING.has(s.phase) && s.floorT !== null && t < s.floorT
    ? s.floorT
    : t
}

/** 「戻す」が押せるか（novideo で、動画が PLAYING のまま読みが 2,000 ms 未満の間に変わった） */
export function canReturn(s: ClockState, now: number): boolean {
  return (
    s.mode === 'novideo' &&
    RUNNING.has(s.phase) &&
    s.lastRead !== null &&
    s.lastState === 'playing' &&
    isMoving(s.lastChange, now)
  )
}

/** 状態を変えずに今の t と写像を読む */
export function clockRead(s: ClockState, now: number): { t: number; map: ClockMap } {
  return { t: valueAt(s, now), map: mapOf(s) }
}

function resyncEvent(s: ClockState, reason: ResyncReason, devMs?: number): ClockEvent {
  const t = valueAt(s, s.anchor.now)
  const ev: ClockEvent = {
    kind: 'resync',
    reason,
    t,
    graceUntil: s.graceUntil,
    nominal: { a: s.rate, b: t - s.rate * s.anchor.now },
  }
  return devMs === undefined ? ev : { ...ev, devMs }
}

/**
 * video の再アンカー。raw は今の読み（null ＝ まだ分からない。seek の命令の後で、次の読みを保持の値にする）。
 * 窓を捨て（レート変更・飛びの前の標本は傾きが違う）、q̂ は持ち越し、猶予 300 ms を始め直す。
 */
function anchorVideo(
  s: ClockState,
  now: number,
  raw: number | null,
  target: number,
  reason: ResyncReason,
  events: ClockEvent[],
  devMs?: number,
): ClockState {
  const next: ClockState = {
    ...s,
    phase: 'grace',
    anchor: { now, t: raw ?? target },
    graceUntil: graceEnd(now),
    anchorReason: reason,
    fresh: true,
    window: [],
    line: null,
    lastRead: raw,
    lastChange: now,
    floorT: null,
  }
  events.push(resyncEvent(next, reason, devMs))
  return next
}

/** novideo の再アンカー（t から rate で進める）。猶予 300 ms */
function anchorNoVideo(
  s: ClockState,
  now: number,
  t: number,
  reason: ResyncReason,
  events: ClockEvent[],
): ClockState {
  const next: ClockState = {
    ...s,
    phase: 'grace',
    anchor: { now, t },
    graceUntil: graceEnd(now),
    anchorReason: reason,
    floorT: null,
  }
  events.push(resyncEvent(next, reason))
  return next
}

/** t を止める（stopped・held・ad）。holdT は止める前の出力 */
function hold(s: ClockState, now: number, phase: ClockPhase): ClockState {
  return { ...s, holdT: valueAt(s, now), phase }
}

/** 動画なしへ（S7c）。今の出力から performance.now 単独で続ける（猶予なし。m3 enterNoVideo L383） */
function toNoVideo(s: ClockState, now: number, events: ClockEvent[]): ClockState {
  const t = valueAt(s, now)
  events.push({ kind: 'novideo', t })
  return {
    ...s,
    mode: 'novideo',
    phase: 'locked',
    anchor: { now, t },
    holdT: t,
    fresh: false,
    window: [],
    line: null,
    floorT: null,
  }
}

/**
 * 止めていた t（広告中・held）から動画なしで走り出す（S7c）。t が止まっていたので、一時停止からの再開と同じく猶予
 * 300 ms を通す（resync(fallback)。プレイの状態機械はこの猶予の終わりで再生へ戻る。decisions #34）
 */
function fallback(s: ClockState, now: number, events: ClockEvent[]): ClockState {
  events.push({ kind: 'novideo', t: s.holdT })
  return anchorNoVideo(
    { ...s, mode: 'novideo', fresh: false, window: [], line: null },
    now,
    s.holdT,
    'fallback',
    events,
  )
}

/** 停止検知の要求から 500 ms 以内の PAUSED を、止まっていた相（held・ad）か走っている相かで動画なしへ移す */
function toNoVideoFrom(s: ClockState, now: number, events: ClockEvent[]): ClockState {
  return s.phase === 'held' || s.phase === 'ad'
    ? fallback(s, now, events)
    : toNoVideo(s, now, events)
}

/** 有限の読みとレートを持つ標本だけを使う（他は読みの無い tick と同じ） */
function usable(sample: VideoSample | null): VideoSample | null {
  return sample !== null &&
    Number.isFinite(sample.timeMs) &&
    Number.isFinite(sample.rate) &&
    sample.rate > 0
    ? sample
    : null
}

/** 読みを覚える（標本にはしない）。変われば lastChange ＝ now */
function track(s: ClockState, sample: VideoSample, now: number): ClockState {
  const changed = sample.timeMs !== s.lastRead
  return {
    ...s,
    lastRead: sample.timeMs,
    lastChange: changed ? now : s.lastChange,
    lastState: sample.state,
  }
}

function finish(
  s0: ClockState,
  now: number,
  events: ClockEvent[],
  requests: VideoRequest[],
  dev: number | null,
): ClockStep {
  let s = s0
  if (s.phase === 'grace' && now >= s.graceUntil) {
    s = { ...s, phase: 'locked' }
    events.push({ kind: 'graceEnd' })
  }
  const t = valueAt(s, now)
  if (s.mode === 'video' && RUNNING.has(s.phase)) s = { ...s, floorT: t }
  return {
    state: s,
    out: {
      t,
      map: mapOf(s),
      mode: s.mode,
      phase: s.phase,
      events,
      requests,
      canReturn: canReturn(s, now),
      dev,
      qHat: s.qHat,
    },
  }
}

/** 命令も読みも無い 1 歩（猶予の終わりだけを見る）。入力の事象の前に今の出力を作る */
export function clockIdle(s: ClockState, now: number): ClockStep {
  return finish(s, now, [], [], null)
}

/**
 * 1 フレームを進める。sample は動画の読み（動画が無い・まだ無いなら null）。
 * video の相: held → PLAYING で再アンカー（猶予）。held の間に状態が変われば held の事象を出し直す。走っている相で
 * PLAYING でなくなれば held。停止検知の要求から 500 ms 以内の PAUSED は、どの相で来ても動画なしへ（止まっていた
 * 相からは猶予つき）。読みは jump.ts で判定し、受け入れた標本で当てはめと q̂ を更新する。locked で可視・PLAYING・
 * 2 秒凍結なら pauseVideo を要求し（pauseReq）、500 ms を過ぎるか呼べなければ広告中（ad、t は止まる）。pauseReq の間に
 * 読みが動き出せば locked へ戻す（要求の結果の PAUSED が 500 ms 以内に来れば動画なしへ。仮）。広告中は読みが動けば
 * 再アンカー、凍結が続けば 2.5 s ごとに要求し直す。
 */
export function clockTick(s0: ClockState, now: number, sample0: VideoSample | null): ClockStep {
  const events: ClockEvent[] = []
  const requests: VideoRequest[] = []
  let dev: number | null = null
  let s = s0
  const sample = usable(sample0)

  if (s.mode === 'novideo' || sample === null) {
    // 動画なしは読みを覚えるだけ（「戻す」の条件）。動画ありで読みが無い tick は外挿を続け、停止検知もしない
    if (sample !== null) s = { ...track(s, sample, now), visible: sample.visible }
    return finish(s, now, events, requests, dev)
  }

  // 非表示から戻った直後に凍結とみなさない（§2.6「非表示中は停止検知しない」、相談 C）
  if (sample.visible && !s.visible) s = { ...s, lastChange: now }
  s = { ...s, visible: sample.visible }

  if (s.phase === 'stopped') {
    s = { ...track(s, sample, now), rate: sample.rate }
    return finish(s, now, events, requests, dev)
  }

  if (s.phase === 'held') {
    if (sample.state === 'playing') {
      s = anchorVideo({ ...s, rate: sample.rate }, now, sample.timeMs, 0, s.pending, events)
      s = { ...s, lastState: sample.state }
    } else if (pauseOutcome(sample, s.reqAt, now) === 'paused') {
      // 停止検知の要求に応えた PAUSED（BUFFERING を挟んだ）
      s = toNoVideoFrom(track(s, sample, now), now, events)
    } else {
      // held の間の状態の変化（BUFFERING の後に利用者が iframe で止めた PAUSED・ENDED）をプレイの状態機械へ届ける
      if (s.lastState !== null && sample.state !== s.lastState)
        events.push({ kind: 'held', state: sample.state, late: false })
      s = track(s, sample, now)
    }
    return finish(s, now, events, requests, dev)
  }

  // grace・locked・pauseReq・ad
  if (sample.state !== 'playing') {
    if (pauseOutcome(sample, s.reqAt, now) === 'paused') {
      s = toNoVideoFrom(track(s, sample, now), now, events)
      return finish(s, now, events, requests, dev)
    }
    const waiting = s.phase === 'pauseReq' || s.phase === 'ad'
    events.push({ kind: 'held', state: sample.state, late: waiting && sample.state === 'paused' })
    // 再アンカーの直後（読みがまだ変わらない）の BUFFERING は、PLAYING での再アンカーも同じ理由にする（seek の後など）
    const pending: ResyncReason = s.fresh ? s.anchorReason : 'unheld'
    s = { ...hold(track(s, sample, now), now, 'held'), pending }
    return finish(s, now, events, requests, dev)
  }

  if (sample.rate !== s.rate) {
    // onPlaybackRateChange（§2.6「レート: 再同期」）。今の読みで再アンカーし、前の窓を捨てる
    s = anchorVideo({ ...s, rate: sample.rate }, now, sample.timeMs, 0, 'rate', events)
    s = { ...s, lastState: sample.state }
    return finish(s, now, events, requests, dev)
  }

  if (s.phase === 'ad') {
    if (sample.timeMs !== s.lastRead && s.lastRead !== null) {
      s = anchorVideo(s, now, sample.timeMs, 0, 'adEnd', events)
    } else {
      s = track(s, sample, now)
      if (reRequestDue(sample, s.reqAt, s.lastChange, now)) {
        requests.push({ kind: 'pauseVideo', why: 'stall' })
        s = { ...s, reqAt: now }
      }
    }
    s = { ...s, lastState: sample.state }
    return finish(s, now, events, requests, dev)
  }

  const raw = sample.timeMs
  const last = s.window[s.window.length - 1]
  const v = classifySample(raw, now, {
    lastRead: s.lastRead,
    fresh: s.fresh,
    lastAccepted: last === undefined ? null : last.raw,
    line: s.line,
    anchor: s.anchor,
    rate: s.rate,
  })
  switch (v.kind) {
    case 'same':
      break
    case 'base':
      // seek の後の最初の読み（凍結の値）を保持の値にする（target からずれた分は床も付け直す）
      s = { ...s, anchor: { now: s.anchor.now, t: raw }, lastRead: raw, floorT: null }
      break
    case 'first': {
      const window = [{ now, raw }]
      s = {
        ...s,
        fresh: false,
        window,
        line: lineOf(window, s.rate),
        lastRead: raw,
        lastChange: now,
      }
      break
    }
    case 'jump':
      s = anchorVideo(s, now, raw, 0, 'jump', events, v.dev)
      break
    case 'back':
      s = { ...s, lastRead: raw, lastChange: now }
      break
    case 'accept': {
      const window = trimWindow([...s.window, { now, raw }])
      s = {
        ...s,
        window,
        line: lineOf(window, s.rate),
        qHat: estimateQ(window, s.qHat),
        lastRead: raw,
        lastChange: now,
      }
      dev = v.dev
      break
    }
  }
  s = { ...s, lastState: sample.state }

  if (s.phase === 'locked' && isStalled(sample, s.lastChange, now)) {
    events.push({ kind: 'stall', t: valueAt(s, now) })
    requests.push({ kind: 'pauseVideo', why: 'stall' })
    s = { ...s, phase: 'pauseReq', reqAt: now }
  } else if (s.phase === 'pauseReq') {
    if (isMoving(s.lastChange, now)) s = { ...s, phase: 'locked' }
    else {
      const o = pauseOutcome(sample, s.reqAt, now)
      if (o === 'failed' || o === 'timeout') {
        s = hold(s, now, 'ad')
        events.push({ kind: 'adSuspected', t: s.holdT })
      }
    }
  }
  return finish(s, now, events, requests, dev)
}

/**
 * 命令を効かせる（入力のハンドラの now で。tick を待たない）。
 * start: 動画なしは保持の t から猶予つきで走らせる（動画ありは何もしない。開始は利用者の click-to-play の PLAYING）。
 * pause: t を止める。resume: 動画なしは止めた t から猶予つきで、動画ありは PLAYING を待って読みで再アンカー。
 * seek: 動画なしはその t へ、動画ありは読みが分かるまで target を保持（広告中も同じ。止まっていれば保持の値だけ
 * 変え、held なら PLAYING での再アンカーを seek にする）。
 * setRate: 動画なしのテンポ段（動画ありは標本の rate で効く）。return: 「戻す」（canReturn のときだけ）。
 */
export function clockCommand(s0: ClockState, now: number, cmd: ClockCommand): ClockStep {
  const events: ClockEvent[] = []
  let s = s0
  const running = RUNNING.has(s.phase)
  switch (cmd.kind) {
    case 'start':
      if (s.mode === 'novideo' && s.phase === 'stopped')
        s = anchorNoVideo(s, now, s.holdT, 'start', events)
      break
    case 'pause':
      if (s.phase !== 'stopped') s = hold(s, now, 'stopped')
      break
    case 'resume':
      if (s.phase !== 'stopped') break
      if (s.mode === 'novideo') s = anchorNoVideo(s, now, s.holdT, 'resume', events)
      else {
        s = { ...s, phase: 'held', pending: 'resume' }
        // 一時停止の間に動画が終わっていたら、再開で終了を知らせる（PLAYING は来ない）
        if (s.lastState === 'ended') events.push({ kind: 'held', state: 'ended', late: false })
      }
      break
    case 'seek':
      if (s.phase === 'ad') s = anchorVideo(s, now, null, cmd.t, 'seek', events)
      else if (!running)
        s = { ...s, holdT: cmd.t, pending: s.phase === 'held' ? 'seek' : s.pending }
      else if (s.mode === 'novideo') s = anchorNoVideo(s, now, cmd.t, 'seek', events)
      else s = anchorVideo(s, now, null, cmd.t, 'seek', events)
      break
    case 'setRate':
      if (s.mode === 'video' || cmd.rate === s.rate || !(cmd.rate > 0)) break
      s = running
        ? anchorNoVideo({ ...s, rate: cmd.rate }, now, valueAt(s, now), 'rate', events)
        : { ...s, rate: cmd.rate }
      break
    case 'return':
      if (canReturn(s, now))
        s = anchorVideo({ ...s, mode: 'video' }, now, s.lastRead, 0, 'return', events)
      break
  }
  return finish(s, now, events, [], null)
}

/** 状態を閉包に持つ薄い包み（開発ページ用）。now は 1 回の tick・命令に 1 回だけ読む */
export interface ClockSource {
  tick(sample: VideoSample | null): ClockOutput
  command(cmd: ClockCommand): ClockOutput
  read(): { t: number; map: ClockMap }
  state(): ClockState
}

export function createClockSource(opts: ClockOptions, now: NowFn = perfNow): ClockSource {
  let state = initialClock(opts)
  return {
    tick: (sample) => {
      const r = clockTick(state, now(), sample)
      state = r.state
      return r.out
    },
    command: (cmd) => {
      const r = clockCommand(state, now(), cmd)
      state = r.state
      return r.out
    },
    read: () => clockRead(state, now()),
    state: () => state,
  }
}
