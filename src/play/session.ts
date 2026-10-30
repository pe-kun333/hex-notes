// プレイの状態機械と時計をつなぐ（M0-05、手順 7、decisions #35、仮）。入力の事象・毎フレームの動画の読みを受け、
// 状態機械の命令を時計に効かせ、時計の事象を状態機械へ返す。動画への要求（YouTube 連携層かダミー動画が受ける）と
// 時計の出力を返す純関数。開発ページ play-dev・clock-dev と M1 の S2 がこれを使う。

import {
  clockCommand,
  clockIdle,
  clockTick,
  initialClock,
  type ClockOptions,
  type ClockState,
} from '../clock/clock-source.ts'
import type { ClockEvent, ClockOutput, VideoRequest, VideoSample } from '../clock/types.ts'
import { initialPlay, playStep, type PlayEvent, type PlayState } from './state.ts'

export interface Session {
  readonly play: PlayState
  readonly clock: ClockState
}

export interface SessionStep {
  session: Session
  /** 最後の時計の出力（events・requests はこの回に起きた物を全部まとめた物） */
  out: ClockOutput
  /** 動画への要求（状態機械の pauseVideo・playVideo と時計の停止検知の pauseVideo。出た順） */
  video: VideoRequest[]
}

export function initialSession(opts: ClockOptions): Session {
  return { play: initialPlay(opts.mode), clock: initialClock(opts) }
}

/** 時計の事象 → 状態機械 → 命令 → 時計 … を事象が尽きるまで回す（命令が事象を生むのは resync だけで、それは命令を生まない） */
function route(session: Session, now: number, first: ClockOutput, queue: PlayEvent[]): SessionStep {
  let play = session.play
  let clock = session.clock
  let out = first
  const events: ClockEvent[] = [...first.events]
  const video: VideoRequest[] = [...first.requests]
  for (let guard = 0; queue.length > 0; guard++) {
    if (guard > 64) throw new Error('play/session: 事象が尽きない')
    const ev = queue.shift()
    if (ev === undefined) break
    const r = playStep(play, ev)
    play = r.state
    video.push(...r.video)
    for (const cmd of r.clock) {
      const c = clockCommand(clock, now, cmd)
      clock = c.state
      out = c.out
      events.push(...c.out.events)
      video.push(...c.out.requests)
      for (const ce of c.out.events) queue.push({ kind: 'clock', event: ce })
    }
  }
  return { session: { play, clock }, out: { ...out, events, requests: [] }, video }
}

/** 毎フレーム。sample は動画の読み（動画なしは null） */
export function sessionTick(s: Session, now: number, sample: VideoSample | null): SessionStep {
  const r = clockTick(s.clock, now, sample)
  const queue: PlayEvent[] = r.out.events.map((event) => ({ kind: 'clock', event }))
  return route({ ...s, clock: r.state }, now, r.out, queue)
}

/** 入力も読みも無い 1 歩（猶予の終わりだけを見る）。押下を判定する前に、その時点の相へ進める */
export function sessionIdle(s: Session, now: number): SessionStep {
  const r = clockIdle(s.clock, now)
  const queue: PlayEvent[] = r.out.events.map((event) => ({ kind: 'clock', event }))
  return route({ ...s, clock: r.state }, now, r.out, queue)
}

/**
 * 入力の事象（start・pause・resume・return・chartEnd・waitStop・waitHit）。now は入力のハンドラの now。
 * 先に今の時計を 1 歩進め（猶予の終わり）、その事象の後に入力を処理する。
 */
export function sessionInput(s: Session, now: number, ev: PlayEvent): SessionStep {
  const r = clockIdle(s.clock, now)
  const queue: PlayEvent[] = [
    ...r.out.events.map((event) => ({ kind: 'clock' as const, event })),
    ev,
  ]
  return route({ ...s, clock: r.state }, now, r.out, queue)
}
