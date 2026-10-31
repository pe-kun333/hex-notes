// プレイの状態機械（design.md §4.2。M0-05 の手順 7 で置いた、decisions #35、仮）。時計・判定・練習の層をつなぐ。
// (状態, 事象) → (状態, 時計への命令, 動画への要求) の純関数で、時刻を持たない（時刻は時計層）。
// 出どころ: §1.2 遷移図・§4.2・§1.3 S2／S7、decisions #11（プログラムからの pause／seek／play は Pause 再開・ループ
// 頭出し・停止検知の 3 用途）・#26（Pause 要求は冪等）、kickoff 手順 7 の申し送り。
// 待ち（S4、M2-03）と終了（最終ノート＋1.2 秒、判定層の後）は型と遷移だけを置く。
// M2 の手順 5（M2-03 前半）: 練習層から時計へ届ける seek・setRate と、待ちの解除 waitHit の t（待った音の着地 − 猶予·rate へ
// 戻して再開）を足し、待ちから入った一時停止の再開は時計を止めたまま待ちに戻す（pausedFrom。decisions #80、m2-kickoff §7-3）。

import type { PauseReason } from '../input/focus.ts'
import type { ClockCommand, ClockEvent, ClockMode, VideoRequest } from '../clock/types.ts'

/**
 * 相（§4.2）。idle ＝ 待機、syncing ＝ 同期中（S7b。猶予・広告・BUFFERING）、playing ＝ 再生、waiting ＝ 待ち（S4）、
 * paused ＝ 一時停止、ended ＝ 終了。§4.2 の「動画なし」は相でなく源 source（video／novideo）で表す
 * （動画なしでも一時停止・猶予を通るため。decisions #35）。
 */
export type PlayPhase = 'idle' | 'syncing' | 'playing' | 'waiting' | 'paused' | 'ended'

export interface PlayState {
  readonly phase: PlayPhase
  readonly source: ClockMode
  /** 待ちから入った一時停止（再開は待ちに戻す。paused の間だけ持つ） */
  readonly pausedFrom?: 'waiting'
}

/**
 * 一時停止の要求の理由（Escape の role pause と、入力層の pause イベントの blur・hidden・iframe。ime は S6 の
 * 「IME 検知時に曲を止める」が ON のときの IME の検知。M1 の手順 2）
 */
export type PlayPauseReason = 'escape' | 'ime' | PauseReason

export type PlayEvent =
  /** Space の開始（動画なし。動画ありの開始は利用者の click-to-play で、時計の resync(start) が来る） */
  | { kind: 'start' }
  | { kind: 'pause'; reason: PlayPauseReason }
  /** Space の再開（Pause メニューの「再開」） */
  | { kind: 'resume' }
  /** 「戻す」（S7c の後、動画の時計へ。手動だけ） */
  | { kind: 'return' }
  /** 判定層: 最終ノート＋1.2 秒（§4.2。手順 8 の後） */
  | { kind: 'chartEnd' }
  /** 練習層: 待ちで止める／正解で進める（S4、M2-03）。waitHit の t は再開する曲 ms（無ければ止めた t から） */
  | { kind: 'waitStop' }
  | { kind: 'waitHit'; t?: number }
  /** 練習層: ループの頭出し（時計が止まっていれば保留される） */
  | { kind: 'seek'; t: number }
  /** 練習層: テンポ段（動画なし。走っていれば再アンカーで猶予に入る） */
  | { kind: 'setRate'; rate: number }
  | { kind: 'clock'; event: ClockEvent }

export interface PlayStep {
  state: PlayState
  clock: ClockCommand[]
  video: VideoRequest[]
}

export function initialPlay(source: ClockMode): PlayState {
  return { phase: 'idle', source }
}

const stay = (state: PlayState): PlayStep => ({ state, clock: [], video: [] })

/** 一時停止へ（時計を止め、動画ありなら pauseVideo。decisions #35: #11 の「Pause 再開」の用途） */
function toPaused(s: PlayState, alreadyPaused: boolean): PlayStep {
  return {
    state: {
      phase: 'paused',
      source: s.source,
      ...(s.phase === 'waiting' ? { pausedFrom: 'waiting' as const } : {}),
    },
    clock: [{ kind: 'pause' }],
    video: s.source === 'video' && !alreadyPaused ? [{ kind: 'pauseVideo', why: 'user' }] : [],
  }
}

/** 時計の事象 → 遷移（再生・同期中・待ちで効く） */
function onClock(s: PlayState, ev: ClockEvent): PlayStep {
  switch (ev.kind) {
    case 'resync':
      // 再アンカーは全て同期中へ（猶予 300 ms）。「戻す」は源を動画へ
      return stay({ phase: 'syncing', source: ev.reason === 'return' ? 'video' : s.source })
    case 'graceEnd':
      return stay(s.phase === 'syncing' ? { ...s, phase: 'playing' } : s)
    case 'adSuspected':
      return stay({ ...s, phase: 'syncing' })
    case 'novideo':
      // S7c: 動画なしで続ける（相はそのまま、帯で知らせる）
      return stay({ ...s, source: 'novideo' })
    case 'held':
      // 利用者が iframe で止めた PAUSED と、停止検知の要求から 500 ms を過ぎて来た PAUSED は一時停止へ
      // （自動では再生し直さない。decisions #11）。BUFFERING などは同期中、ENDED は終了
      if (ev.state === 'paused') return toPaused(s, true)
      if (ev.state === 'ended') return stay({ ...s, phase: 'ended' })
      return stay({ ...s, phase: 'syncing' })
    case 'stall':
      // 要求の結果を待つ間（pauseReq）は再生のまま（時計は外挿を続ける）
      return stay(s)
  }
}

/**
 * 1 つの事象を処理する。Pause 要求（Escape・blur・hidden・iframe）は冪等: 再生・待ちと同期中で一時停止へ移し、
 * 待機・一時停止・終了では無視する。同期中の iframe（click-to-play・広告の「スキップ」の click が iframe への blur に
 * なる）も無視する（decisions #35 が #26 の「同期中では無視」を改めた）。
 */
export function playStep(s: PlayState, ev: PlayEvent): PlayStep {
  if (s.phase === 'ended') return stay(s)

  // テンポ段は待機・一時停止の間も効かせる（止まっている時計は rate だけ替える）
  if (ev.kind === 'setRate')
    return { state: s, clock: [{ kind: 'setRate', rate: ev.rate }], video: [] }

  if (s.phase === 'idle') {
    if (ev.kind === 'start' && s.source === 'novideo')
      return { state: { ...s, phase: 'syncing' }, clock: [{ kind: 'start' }], video: [] }
    if (ev.kind === 'clock' && ev.event.kind === 'resync') return onClock(s, ev.event)
    return stay(s)
  }

  if (s.phase === 'paused') {
    // 待ちから入った一時停止は、時計を止めたまま待ちに戻す（猶予に入れると待っていた音が skipped になる。§7-3）
    if (ev.kind === 'resume' && s.pausedFrom === 'waiting')
      return stay({ phase: 'waiting', source: s.source })
    if (ev.kind === 'resume')
      return {
        state: { phase: 'syncing', source: s.source },
        clock: [{ kind: 'resume' }],
        video: s.source === 'video' ? [{ kind: 'playVideo' }] : [],
      }
    // 止まっている時計の seek は保留（再開でその t から）
    if (ev.kind === 'seek') return { state: s, clock: [{ kind: 'seek', t: ev.t }], video: [] }
    return stay(s)
  }

  // syncing・playing・waiting
  switch (ev.kind) {
    case 'pause':
      if (s.phase === 'syncing' && ev.reason === 'iframe') return stay(s)
      return toPaused(s, false)
    case 'clock':
      if (s.phase === 'waiting') return stay(s)
      return onClock(s, ev.event)
    case 'chartEnd':
      return stay({ ...s, phase: 'ended' })
    case 'return':
      return s.phase === 'playing' && s.source === 'novideo'
        ? { state: s, clock: [{ kind: 'return' }], video: [] }
        : stay(s)
    case 'waitStop':
      return s.phase === 'playing'
        ? { state: { ...s, phase: 'waiting' }, clock: [{ kind: 'pause' }], video: [] }
        : stay(s)
    case 'waitHit':
      // 止めた時計の t を戻してから再開（猶予 300 ms の終わりで t が着地に戻る、decisions #80）
      return s.phase === 'waiting'
        ? {
            state: { ...s, phase: 'syncing' },
            clock: [
              ...(ev.t === undefined ? [] : [{ kind: 'seek' as const, t: ev.t }]),
              { kind: 'resume' },
            ],
            video: [],
          }
        : stay(s)
    case 'seek':
      return { state: s, clock: [{ kind: 'seek', t: ev.t }], video: [] }
    case 'start':
    case 'resume':
      return stay(s)
  }
}
