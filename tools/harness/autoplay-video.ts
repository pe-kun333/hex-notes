// 動画ありの自動プレイ（M3 の手順 6、M3-04、m3-kickoff 手順 6・§7-29・§7-30、仮）。出どころ: autoplay.ts の runAutoplay の回し
// （押下・離しの前に sessionIdle で今の相へ、毎フレーム sessionTick → judgeClock → judgeSweep、t が終了を過ぎたら chartEnd）を
// 動画の回に替えた物。時計は mode video・t0 0、軸は sync の offset 2.0 s・rate 1、ダミー動画（15 ms 切り捨て・種 7）を
// START_NOW に再生し、毎フレームの読みを sessionTick へ、動画への要求はダミーへ。終了は toChartMs(t, 軸) > endMs。
// 押下は次のフレームまでに着地が来る音を、動画の真の時刻から毎フレーム予定する（源 novideo の後は時計の写像。動画が進まない間は
// 押さない）。離しは音の終わりを同じ決まりで、同じ鍵の次の押下が先ならその 1 ms 前。途中終了は入れない（ゲージ 0 でも最後まで。
// 途中終了は play-runner の runFrame だけ）。m3 の自動プレイは同期中に押さない（L390）→ 猶予中も押し、溜めて猶予の終わりに
// 判定（decisions #39 (a)）。m3 の飛び ＋400（L641）→ ＋300。
// performance.now は使わない（実時刻は START_NOW から FRAME_MS ずつ）。

import {
  createDummyVideo,
  type DummyVideo,
  type DummyVideoOptions,
} from '../../src/clock/dummy-video.ts'
import { fromChartMs, perfAt, toChartMap, toChartMs, type SyncAxis } from '../../src/clock/map.ts'
import type { ClockEvent, ClockMap, ClockMode, VideoRequest } from '../../src/clock/types.ts'
import {
  endAtMs,
  initialJudge,
  isComplete,
  judgeClock,
  judgePress,
  judgeRelease,
  judgeSweep,
  resultsByIndex,
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
import { FRAME_MS, LEAD_MS, RELEASE_GAP_MS, START_NOW, type AutoAction } from './autoplay.ts'

/** 動画の回の軸（sync の offset 2.0 s・rate 1。拍 0 が動画の 2,000 ms） */
export const VIDEO_AXIS: SyncAxis = { offset: 2, rate: 1 }

/** ダミー動画の作りの既定（15 ms 切り捨て・種 7） */
export const VIDEO_DUMMY: DummyVideoOptions = { stepMs: 15, seed: 7 }

/**
 * 筋書き。jump ＝ 飛び ＋300 ms、freeze ＝ 凍結 → 停止検知 → S7c（pause の効きは既定の 0 ms）、adStuck ＝ pause の効かない
 * 凍結 8 秒（読みだけ止まる広告）、adHold ＝ 時刻も止まる広告 8 秒（seek の凍結の間は真の時刻も止まる）
 */
export type VideoScenario = 'jump' | 'freeze' | 'adStuck' | 'adHold'

export const VIDEO_SCENARIOS: Readonly<
  Record<
    VideoScenario,
    { readonly options: DummyVideoOptions; readonly op: (d: DummyVideo, now: number) => void }
  >
> = {
  jump: { options: {}, op: (d, now) => d.jump(300, now) },
  freeze: { options: {}, op: (d, now) => d.stuck(600_000, now) },
  adStuck: { options: { pauseLatencyMs: 'never' }, op: (d, now) => d.stuck(8000, now) },
  adHold: {
    options: { pauseLatencyMs: 'never', seekFreezeMs: 8000, freezeHold: true },
    op: (d, now) => d.seek(d.trueTime(now), now),
  },
}

/**
 * 押下の予定（毎フレーム、時計とダミーの 1 歩の後に呼ぶ）。次のフレームまで（now, now ＋ FRAME_MS] に着地が来る音を押し、
 * 押したままの同じ鍵はその 1 ms 前に離す。押した音の終わりが同じ窓に来れば離す。源 video は動画の真の時刻（動画が進まない
 * フレームは押さない）、源 novideo は時計の写像で予定する。play-runner の試験（tests/unit/app/play-runner-video.test.ts）も
 * これを使う（表と同じ値を runFrame で出す）
 */
export interface PressPlanner {
  plan(now: number, source: ClockMode, map: ClockMap, d: DummyVideo): AutoAction[]
}

export function pressPlanner(notes: readonly JudgeNote[], axis: SyncAxis): PressPlanner {
  const order = [...notes].sort((a, b) => a.tLandMs - b.tLandMs || a.index - b.index)
  const pressed = new Set<number>()
  const held = new Map<KeyCode, { index: number; tEndMs: number; released: boolean }>()
  return {
    plan(now, source, map, d) {
      const tt0 = d.trueTime(now)
      const moving = d.state === 'playing' && d.trueTime(now + FRAME_MS) > tt0
      const chartMap = toChartMap(map, axis)
      const perfOf = (chartMs: number): number =>
        source === 'video'
          ? moving
            ? now + (fromChartMs(chartMs, axis) - tt0)
            : NaN
          : perfAt(chartMap, chartMs)
      const out: AutoAction[] = []
      for (const n of order) {
        if (pressed.has(n.index)) continue
        const p = perfOf(n.tLandMs)
        if (!(p > now && p <= now + FRAME_MS)) continue
        pressed.add(n.index)
        const h = held.get(n.code)
        if (h !== undefined && !h.released)
          out.push({ kind: 'release', code: n.code, tsPerf: p - RELEASE_GAP_MS, index: h.index })
        out.push({ kind: 'press', code: n.code, tsPerf: p, index: n.index })
        held.set(n.code, { index: n.index, tEndMs: n.tEndMs, released: false })
      }
      for (const [code, h] of held) {
        if (h.released) continue
        const p = perfOf(h.tEndMs)
        if (!(p > now && p <= now + FRAME_MS)) continue
        h.released = true
        out.push({ kind: 'release', code, tsPerf: p, index: h.index })
      }
      return out
    },
  }
}

/** 時計の事象の記録（at は START_NOW からの ms） */
export interface VideoLogEvent {
  readonly kind: ClockEvent['kind']
  readonly at: number
  readonly reason?: string
  readonly state?: string
  readonly t?: number
  readonly devMs?: number
}

export interface VideoAutoRun {
  readonly judge: JudgeState
  readonly summary: JudgeSummary
  readonly frames: number
  /** 終わりの源 */
  readonly source: ClockMode
  readonly events: readonly VideoLogEvent[]
  /** ダミーへ渡した要求（at は START_NOW からの ms） */
  readonly requests: readonly { readonly at: number; readonly q: VideoRequest }[]
  /**
   * 開始以外の再アンカーごとに、その時点で未判定の最初の音の着地（名目の写像で実時刻にした物）− 再アンカーの now（ms。猶予内に
   * 窓が終わる音は skipped になった後に見る）。未判定の音が無ければ null
   */
  readonly firstLand: readonly (number | null)[]
}

export interface VideoAutoOptions {
  readonly scenario: VideoScenario
  /** 筋書きを起こすフレーム（開始からの番号。既定 120） */
  readonly atFrame?: number
  /** ダミー動画の作りを足す（試験の筋書きの変形） */
  readonly dummy?: DummyVideoOptions
  /** ダミーへ渡す前に要求を落とす（真を返した要求は渡さない） */
  readonly drop?: (q: VideoRequest, at: number) => boolean
}

const rel = (now: number): number => Math.round((now - START_NOW) * 100) / 100

/** 1 曲を動画ありで自動で通す。終わりに全ての音が判定済みでなければ投げる */
export function runAutoplayVideo(
  notes: readonly JudgeNote[],
  rules: JudgeRules,
  o: VideoAutoOptions,
): VideoAutoRun {
  // 軸は規則のもの（呼ぶ側が rulesOf に VIDEO_AXIS を渡す。判定と押下の予定を同じ軸で）
  const axis = rules.axis
  const sc = VIDEO_SCENARIOS[o.scenario]
  const atFrame = o.atFrame ?? 120
  const d = createDummyVideo({ ...VIDEO_DUMMY, ...sc.options, ...(o.dummy ?? {}) })
  let session: Session = initialSession({ mode: 'video', t0: 0 })
  let judge = initialJudge(notes, rules)
  let map: ClockMap = { a: 0, b: 0 }
  let t = 0
  const events: VideoLogEvent[] = []
  const requests: { at: number; q: VideoRequest }[] = []
  const firstLand: (number | null)[] = []
  const apply = (step: SessionStep, now: number): void => {
    session = step.session
    map = step.out.map
    t = step.out.t
    judge = judgeClock(judge, step.out.events, { map, now }).state
    for (const ev of step.out.events) {
      const at = rel(now)
      if (ev.kind === 'resync') {
        events.push({ kind: ev.kind, at, reason: ev.reason, t: ev.t, ...(ev.devMs === undefined ? {} : { devMs: ev.devMs }) })
        if (ev.reason === 'start') continue
        const byIndex = resultsByIndex(judge)
        const first = notes.find((n) => (byIndex.get(n.index)?.state ?? 'pending') === 'pending')
        firstLand.push(first === undefined ? null : perfAt(toChartMap(ev.nominal, axis), first.tLandMs) - now)
      } else if (ev.kind === 'held') events.push({ kind: ev.kind, at, state: ev.state })
      else if (ev.kind === 'graceEnd') events.push({ kind: ev.kind, at })
      else events.push({ kind: ev.kind, at, t: ev.t })
    }
    for (const q of step.video) {
      if (o.drop?.(q, rel(now)) === true) continue
      requests.push({ at: rel(now), q })
      if (q.kind === 'pauseVideo') d.pauseVideo(now)
      else if (q.kind === 'playVideo') d.play(now)
      else d.seek(q.t, now)
    }
  } // prettier-ignore

  d.play(START_NOW)
  const planner = pressPlanner(notes, axis)
  const endMs = endAtMs(notes)
  // 広告 8 秒と凍結の分を足した上限
  const maxFrames = Math.ceil((LEAD_MS + endMs + 1000 + 20_000) / FRAME_MS)
  const actions: AutoAction[] = []
  let f = 0
  while (session.play.phase !== 'ended') {
    f++
    if (f > maxFrames) throw new Error(`harness: ${maxFrames} フレームで終わらない（t ${t}）`)
    const now = START_NOW + f * FRAME_MS
    if (f === atFrame) sc.op(d, now)
    actions.sort((a, b) => a.tsPerf - b.tsPerf || a.index - b.index)
    while (actions.length > 0 && (actions[0] as AutoAction).tsPerf <= now) {
      const a = actions.shift() as AutoAction
      apply(sessionIdle(session, a.tsPerf), a.tsPerf)
      const clock = { map, now: a.tsPerf }
      judge =
        a.kind === 'press'
          ? judgePress(judge, { code: a.code, tsPerf: a.tsPerf }, clock).state
          : judgeRelease(judge, { code: a.code, tsPerf: a.tsPerf, forced: false }, clock).state
    }
    apply(sessionTick(session, now, d.sample(now)), now)
    judge = judgeSweep(judge, { map, now }).state
    actions.push(...planner.plan(now, session.play.source, map, d))
    if (toChartMs(t, axis) > endMs && session.play.phase === 'playing')
      apply(sessionInput(session, now, { kind: 'chartEnd' }), now)
  }
  if (!isComplete(judge)) throw new Error('harness: 終わったのに判定していない音がある')
  return {
    judge,
    summary: summarizeJudge(judge),
    frames: f,
    source: session.play.source,
    events,
    requests,
    firstLand,
  }
}
