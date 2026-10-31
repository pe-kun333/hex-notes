// 自動プレイ（M0-10、手順 13）。出どころ: m3 自動プレイ L388–395（作り直し: 音ごとの z × ジッタで押す、正しい鍵だけ）、
// play-dev の流れ（src/app/dev/play-dev.ts の startRun・onPress・onRelease・frame: 動画なしの時計を start で走らせ、
// 押下の前に sessionIdle で今の相へ進め、毎フレーム sessionTick → judgeClock → judgeSweep、t が終了を過ぎたら chartEnd）、
// kickoff 手順 13「now は手で進める」、decisions #56（仮）。
// performance.now は使わない。実時刻は START_NOW から FRAME_MS ずつ進め、押下・離しはその時刻（遅れ 0）で渡す。

import { perfAt, toChartMap } from '../../src/clock/map.ts'
import type { ClockMap } from '../../src/clock/types.ts'
import {
  endAtMs,
  initialJudge,
  isComplete,
  judgeClock,
  judgePress,
  judgeRelease,
  judgeSweep,
  summarizeJudge,
  type JudgeNote,
  type JudgeRules,
  type JudgeState,
  type JudgeSummary,
} from '../../src/judge/judge.ts'
import {
  initialSession,
  sessionIdle,
  sessionInput,
  sessionTick,
  type Session,
  type SessionStep,
} from '../../src/play/session.ts'
import type { KeyCode } from '../../src/shared/types.ts'

/** 開始から拍 0 までの予備（play-dev の LEAD_MS と同じ） */
export const LEAD_MS = 2000
/** start を押す実時刻（0 でない値にして、実時刻と譜面の軸の取り違えが表に出るようにする） */
export const START_NOW = 1000
/** フレームの間隔（60 Hz） */
export const FRAME_MS = 1000 / 60
/** 次に同じ鍵を押す前に離す間（ms） */
export const RELEASE_GAP_MS = 1

/** 自動プレイの 1 つの操作。index は譜面の notes の添字 */
export interface AutoAction {
  readonly kind: 'press' | 'release'
  readonly code: KeyCode
  readonly tsPerf: number
  readonly index: number
}

/**
 * 押す・離す時刻の列（tsPerf の順。同じ時刻なら index の順、同じ音なら押す → 離す〔作った順。sort は安定〕）。
 * 押す: 着地の実時刻 ＋ 揺れ（offsetOf(index)）。正しい鍵だけ押す（NEAR・空打ちは作らない）。
 * 離す: 終わりの実時刻 ＋ 同じ揺れ（音全体をずらす）。ただし同じ鍵を次に押す時刻の RELEASE_GAP_MS 前より後には
 * しない（押したままの鍵をもう一度押さない）。押した時刻より前にはしない。
 */
export function planActions(
  notes: readonly JudgeNote[],
  perfOf: (chartMs: number) => number,
  offsetOf: (index: number) => number,
): AutoAction[] {
  const presses = notes.map((n) => ({
    n,
    press: perfOf(n.tLandMs) + offsetOf(n.index),
    end: perfOf(n.tEndMs) + offsetOf(n.index),
  }))
  presses.sort((x, y) => x.press - y.press || x.n.index - y.n.index)
  const nextOf = new Map<KeyCode, number>()
  const out: AutoAction[] = []
  for (let i = presses.length - 1; i >= 0; i--) {
    const p = presses[i]
    if (p === undefined) continue
    const next = nextOf.get(p.n.code)
    const release = Math.max(
      p.press,
      next === undefined ? p.end : Math.min(p.end, next - RELEASE_GAP_MS),
    )
    nextOf.set(p.n.code, p.press)
    out.push({ kind: 'press', code: p.n.code, tsPerf: p.press, index: p.n.index })
    out.push({ kind: 'release', code: p.n.code, tsPerf: release, index: p.n.index })
  }
  return out.sort((a, b) => a.tsPerf - b.tsPerf || a.index - b.index)
}

export interface AutoRun {
  readonly judge: JudgeState
  readonly summary: JudgeSummary
  readonly actions: readonly AutoAction[]
  /** 回したフレームの数 */
  readonly frames: number
}

/**
 * 1 曲を自動で通す。offsetOf は音（譜面の notes の添字）ごとの揺れ ms（jitter.ts の z × SD）。
 * 終わりに全ての音が判定済みでなければ投げる（時計か判定の不具合）。
 */
export function runAutoplay(
  notes: readonly JudgeNote[],
  rules: JudgeRules,
  offsetOf: (index: number) => number,
): AutoRun {
  let session: Session = initialSession({ mode: 'novideo', t0: -LEAD_MS })
  let judge = initialJudge(notes, rules)
  let map: ClockMap = { a: 0, b: -LEAD_MS }
  let t = -LEAD_MS
  const apply = (step: SessionStep, now: number): void => {
    session = step.session
    map = step.out.map
    t = step.out.t
    judge = judgeClock(judge, step.out.events, { map, now }).state
  }

  apply(sessionInput(session, START_NOW, { kind: 'start' }), START_NOW)
  const chartMap = toChartMap(map, rules.axis)
  const actions = planActions(notes, (ms) => perfAt(chartMap, ms), offsetOf)
  const endMs = endAtMs(notes)
  const maxFrames = Math.ceil((LEAD_MS + endMs + 1000) / FRAME_MS)

  let k = 0
  let f = 0
  while (session.play.phase !== 'ended') {
    f++
    if (f > maxFrames) throw new Error(`harness: ${maxFrames} フレームで終わらない（t ${t}）`)
    const now = START_NOW + f * FRAME_MS
    for (let a = actions[k]; a !== undefined && a.tsPerf <= now; a = actions[++k]) {
      apply(sessionIdle(session, a.tsPerf), a.tsPerf)
      const clock = { map, now: a.tsPerf }
      judge =
        a.kind === 'press'
          ? judgePress(judge, { code: a.code, tsPerf: a.tsPerf }, clock).state
          : judgeRelease(judge, { code: a.code, tsPerf: a.tsPerf, forced: false }, clock).state
    }
    apply(sessionTick(session, now, null), now)
    judge = judgeSweep(judge, { map, now }).state
    if (t > endMs && session.play.phase === 'playing')
      apply(sessionInput(session, now, { kind: 'chartEnd' }), now)
  }
  if (!isComplete(judge)) throw new Error('harness: 終わったのに判定していない音がある')
  return { judge, summary: summarizeJudge(judge), actions, frames: f }
}
