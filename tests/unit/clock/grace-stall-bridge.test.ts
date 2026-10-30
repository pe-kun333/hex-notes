import { describe, expect, it } from 'vitest'
import { bridgeOf, contextOfPerf, perfOfContext } from '../../../src/clock/audio-bridge.ts'
import { GRACE_MS, endsInGrace, graceEnd, skippedAt } from '../../../src/clock/grace.ts'
import {
  IDENTITY_AXIS,
  axisOf,
  fromChartMs,
  perfAt,
  songAt,
  toChartMap,
  toChartMs,
} from '../../../src/clock/map.ts'
import {
  PAUSE_WAIT_MS,
  REREQUEST_MS,
  STALL_MS,
  isMoving,
  isStalled,
  pauseOutcome,
  reRequestDue,
} from '../../../src/clock/stall.ts'
import type { VideoSample } from '../../../src/clock/types.ts'

// src/clock/grace.ts・stall.ts・map.ts・audio-bridge.ts。出どころ: design.md §2.6（300・2000・500 は設計の値）、
// 相談 C の表（skipped の R＋50／R＋70）、kickoff 手順 7 の audio-bridge の案（台帳に行が無かったので未検算で足した）、
// m3 `startCal` L442–445、decisions #32〜#34・#37（仮）。

const playing = (over: Partial<VideoSample> = {}): VideoSample => ({
  state: 'playing',
  timeMs: 0,
  rate: 1,
  visible: true,
  ...over,
})

describe('猶予と skipped（猶予内に窓が終わるノート）', () => {
  it('猶予は 300 ms。W_late 234 で着地 R＋50 は skipped、R＋70 は pending（相談 C）', () => {
    expect(GRACE_MS).toBe(300)
    const R = 5000
    const until = graceEnd(R)
    expect(until).toBe(5300)
    expect(endsInGrace(R + 50, 234, until)).toBe(true)
    expect(endsInGrace(R + 66, 234, until)).toBe(true)
    expect(endsInGrace(R + 67, 234, until)).toBe(false)
    expect(endsInGrace(R + 70, 234, until)).toBe(false)
  })

  it('名目の写像（傾き ＝ 再生レート）で着地の実時刻を出す。レート 0.5 では曲 ms 25 が実時間 50', () => {
    const R = 5000
    const T = 12000
    const nominal = { a: 0.5, b: T - 0.5 * R }
    expect(skippedAt(T + 25, nominal, 234, R + GRACE_MS)).toBe(true)
    expect(skippedAt(T + 35, nominal, 234, R + GRACE_MS)).toBe(false)
  })
})

describe('停止検知の境界（最後の変化から 2,000 ms。「戻す」は 2,000 ms 未満で分け合う）', () => {
  it('1999 → まだ、2000 → 停止。isMoving は逆', () => {
    expect(STALL_MS).toBe(2000)
    const L = 1000
    expect(isStalled(playing(), L, L + 1999)).toBe(false)
    expect(isStalled(playing(), L, L + 2000)).toBe(true)
    expect(isMoving(L, L + 1999)).toBe(true)
    expect(isMoving(L, L + 2000)).toBe(false)
  })

  it('非表示・PLAYING でない間は停止とみなさない', () => {
    expect(isStalled(playing({ visible: false }), 0, 9000)).toBe(false)
    expect(isStalled(playing({ state: 'buffering' }), 0, 9000)).toBe(false)
  })

  it('pauseVideo の結果: ＋500 までの PAUSED は paused、＋500 で PAUSED でなければ timeout、呼べなければ failed', () => {
    expect(PAUSE_WAIT_MS).toBe(500)
    const req = 3000
    expect(pauseOutcome(playing({ state: 'paused' }), req, req + 500)).toBe('paused')
    expect(pauseOutcome(playing({ state: 'paused' }), req, req + 501)).toBe('timeout')
    expect(pauseOutcome(playing(), req, req + 499)).toBe('wait')
    expect(pauseOutcome(playing(), req, req + 500)).toBe('timeout')
    expect(pauseOutcome(playing({ pauseFailed: true }), req, req + 1)).toBe('failed')
    expect(pauseOutcome(null, req, req + 10)).toBe('wait')
  })

  it('広告中の再要求は前の要求から 2.5 s、まだ凍結しているときだけ（仮）', () => {
    expect(REREQUEST_MS).toBe(2500)
    expect(reRequestDue(playing(), 3000, 1000, 5499)).toBe(false)
    expect(reRequestDue(playing(), 3000, 1000, 5500)).toBe(true)
    expect(reRequestDue(playing(), 3000, 4000, 5500)).toBe(false)
  })
})

describe('写像と軸', () => {
  it('songAt(perfAt(x)) ＝ x。止まった時計の perfAt は Infinity', () => {
    const m = { a: 0.98, b: -1234.5 }
    for (const x of [0, 1500.25, 98765]) expect(songAt(m, perfAt(m, x))).toBeCloseTo(x, 9)
    expect(perfAt({ a: 0, b: 5 }, 10)).toBe(Infinity)
  })

  it('再生レート 0.5 で曲 ms の差 100 が実時間の差 200', () => {
    const m = { a: 0.5, b: 300 }
    expect(perfAt(m, 1100) - perfAt(m, 1000)).toBeCloseTo(200, 9)
  })

  it('譜面の軸: (t − offset·1000)·rate。sources が空か audio は恒等', () => {
    const axis = axisOf([{ kind: 'youtube', videoId: 'x', offset: 1.5, rate: 1.02 }])
    expect(toChartMs(11500, axis)).toBeCloseTo(10200, 9)
    expect(fromChartMs(10200, axis)).toBeCloseTo(11500, 9)
    const m = { a: 1, b: -200 }
    const cm = toChartMap(m, axis)
    expect(songAt(cm, 7000)).toBeCloseTo(toChartMs(songAt(m, 7000), axis), 9)
    expect(axisOf([])).toBe(IDENTITY_AXIS)
    expect(axisOf([{ kind: 'audio', offset: 0, rate: 1 }])).toBe(IDENTITY_AXIS)
  })
})

describe('audio-bridge（AudioContext の秒 ↔ perf ms。数値だけ受ける）', () => {
  it('getOutputTimestamp の組 {1.000 s, 5000} → context 1.500 s ↔ perf 5500（遅延は足さない）', () => {
    const b = bridgeOf({
      stamp: { contextTime: 1, performanceTime: 5000 },
      currentTime: 1.2,
      now: 5300,
      outputLatency: 0.04,
    })
    expect(b.via).toBe('outputTimestamp')
    expect(perfOfContext(b, 1.5)).toBeCloseTo(5500, 9)
    expect(contextOfPerf(b, 5500)).toBeCloseTo(1.5, 12)
  })

  it('組が無い: currentTime 2.000・now 8000・outputLatency 0.020 → context 2.000 ↔ perf 8020', () => {
    const b = bridgeOf({ stamp: null, currentTime: 2, now: 8000, outputLatency: 0.02 })
    expect(b).toEqual({ ctxSec: 2, perfMs: 8020, via: 'latency' })
  })

  it('performanceTime が 0 以下・非有限なら退避。outputLatency が無いか 0 なら baseLatency、それも無ければ 0', () => {
    const base = { currentTime: 2, now: 8000 }
    expect(bridgeOf({ ...base, stamp: { contextTime: 0, performanceTime: 0 } }).via).toBe('latency')
    expect(bridgeOf({ ...base, stamp: { contextTime: 1, performanceTime: NaN } }).via).toBe(
      'latency',
    )
    expect(bridgeOf({ ...base, stamp: {}, outputLatency: 0, baseLatency: 0.01 }).perfMs).toBe(8010)
    expect(bridgeOf({ ...base, stamp: null }).perfMs).toBe(8000)
  })
})
