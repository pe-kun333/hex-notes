import { describe, expect, it } from 'vitest'
import type { InputEvent, KeyEventRecord } from '../../../src/input/keyboard.ts'
import { emptyInputState, handleKey } from '../../../src/input/keyboard.ts'
import {
  TS_COARSE_MS,
  TS_GRID_LADDER,
  estimateTsResolution,
  isCoarse,
} from '../../../src/input/resolution.ts'
import { TS_STALE_MS, median, toTsPerf } from '../../../src/input/timestamp.ts'

// src/input/timestamp.ts・resolution.ts。出どころ: decisions #25（仮、相談 E、docs/planning/consult/E-tsperf.md）。
// 期待値は相談 E の起草役と批判役が node で別々に計算し一致した物（標本の式は記録の「試験の系列」）。

describe('tsPerf の式 toTsPerf（decisions #25）', () => {
  it('timeStamp ≤ now かつ now − ts ≤ 1000 は ok（ts のまま、lag ＝ now − ts）。境界を含む', () => {
    expect(toTsPerf(1000, 1003.5)).toEqual({ tsPerf: 1000, reason: 'ok', lag: 3.5 })
    expect(toTsPerf(500, 500)).toEqual({ tsPerf: 500, reason: 'ok', lag: 0 })
    expect(toTsPerf(2000, 3000)).toEqual({ tsPerf: 2000, reason: 'ok', lag: 1000 })
  })

  it('1000 ms より古い（長いタスクの後）は stale で ts を保つ。lag は null', () => {
    expect(TS_STALE_MS).toBe(1000)
    expect(toTsPerf(1999, 3000)).toEqual({ tsPerf: 1999, reason: 'stale', lag: null })
    expect(toTsPerf(10000, 11200)).toEqual({ tsPerf: 10000, reason: 'stale', lag: null })
  })

  it('now より後（少しの先行・エポック基準の値）は now に落とし、lag は null', () => {
    expect(toTsPerf(1010, 1000)).toEqual({ tsPerf: 1000, reason: 'future', lag: null })
    expect(toTsPerf(1000.001, 1000)).toEqual({ tsPerf: 1000, reason: 'future', lag: null })
    expect(toTsPerf(1.7e12, 1000)).toEqual({ tsPerf: 1000, reason: 'future', lag: null })
  })

  it('0 以下・非有限は now に落とす', () => {
    expect(toTsPerf(0, 500)).toEqual({ tsPerf: 500, reason: 'nonpositive', lag: null })
    expect(toTsPerf(-5, 500)).toEqual({ tsPerf: 500, reason: 'nonpositive', lag: null })
    expect(toTsPerf(Number.NaN, 500)).toEqual({ tsPerf: 500, reason: 'nonfinite', lag: null })
    expect(toTsPerf(Number.POSITIVE_INFINITY, 500)).toEqual({
      tsPerf: 500,
      reason: 'nonfinite',
      lag: null,
    })
  })
})

describe('入力層が tsPerf を使う（keydown・keyup・役割）', () => {
  const rec = (type: 'keydown' | 'keyup', code: string, timeStamp: number): KeyEventRecord => ({
    type,
    code,
    timeStamp,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  })

  it('長いタスクで 1,200 ms 遅れて届いた押下は timeStamp のまま（今のノートに当たらない）', () => {
    const r = handleKey(emptyInputState(), rec('keydown', 'KeyA', 10000), 11200)
    expect(r.events).toEqual([{ kind: 'press', code: 'KeyA', tsPerf: 10000, lag: null }])
  })

  it('timeStamp 0 の押下は now、エポック基準の keyup は now', () => {
    const a = handleKey(emptyInputState(), rec('keydown', 'KeyA', 0), 2000)
    expect(a.events).toEqual([{ kind: 'press', code: 'KeyA', tsPerf: 2000, lag: null }])
    const b = handleKey(a.state, rec('keyup', 'KeyA', 1.7e12), 2100)
    expect(b.events).toEqual([{ kind: 'release', code: 'KeyA', tsPerf: 2100, forced: false }])
  })

  it('Space（校正タップ）も同じ式: (3000, 3001) → 3000', () => {
    const r = handleKey(emptyInputState(), rec('keydown', 'Space', 3000), 3001)
    expect(r.events).toEqual([{ kind: 'role', role: 'primary', code: 'Space', tsPerf: 3000 }])
  })

  it('入力遅延中央値の標本: (1000, 1001.5)・(1200, 1200)・(1400, 1403) の ok だけ、未来・NaN・0・repeat・229 は入らない → 1.5', () => {
    const steps: [number, number, Partial<KeyEventRecord>?][] = [
      [1000, 1001.5],
      [1200, 1200],
      [1400, 1403],
      [1610, 1600],
      [Number.NaN, 1800],
      [0, 2000],
      [2100, 2101, { repeat: true }],
      [2200, 2205, { keyCode: 229 }],
    ]
    const codes = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK']
    let s = emptyInputState()
    const events: InputEvent[] = []
    steps.forEach(([ts, now, over], i) => {
      const r = handleKey(s, { ...rec('keydown', codes[i] as string, ts), ...over }, now)
      s = r.state
      events.push(...r.events)
    })
    const lags = events.flatMap((e) => (e.kind === 'press' && e.lag !== null ? [e.lag] : []))
    expect(lags).toEqual([1.5, 0, 3])
    expect(median(lags)).toBe(1.5)
  })
})

describe('中央値 median', () => {
  it('[] → null、[5] → 5、[3,1,2] → 2、[4,1,3,2] → 2.5、[0,0,7.5] → 0。入力は並べ替えない', () => {
    expect(median([])).toBeNull()
    expect(median([5])).toBe(5)
    const xs = [3, 1, 2]
    expect(median(xs)).toBe(2)
    expect(xs).toEqual([3, 1, 2])
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([0, 0, 7.5])).toBe(0)
  })
})

// ---------- 刻みの推定 ----------

/** 疎な標本 T_i ＝ 10000 + 157.3·i + 41.9·((5i) mod 7) + √2·√(i+1)（i ＝ 0..19。T_0 ＝ 10001.414、T_19 ＝ 13162.625） */
const T = Array.from(
  { length: 20 },
  (_, i) => 10000 + 157.3 * i + 41.9 * ((5 * i) % 7) + Math.SQRT2 * Math.sqrt(i + 1),
)
const floorTo = (xs: readonly number[], q: number): number[] => xs.map((t) => Math.floor(t / q) * q)
const plus = (xs: readonly number[], add: Record<number, number>): number[] =>
  xs.map((t, i) => Math.floor(t) + (add[i] ?? 0))
/** 区間ごとに閾を置いて切り上げる 16.667 格子（確率的丸めの模型）: k ＝ floor(t/q)、m_k ＝ ((7919k) mod 13)/13·q */
const S5 = T.map((t) => {
  const q = 16.667
  const k = Math.floor(t / q)
  const m = (((7919 * k) % 13) / 13) * q
  return (t - k * q < m ? k : k + 1) * q
})
/** Windows の入力時刻の tick（15.625 ms ごとに進む時刻を整数 ms に） */
const TICK = T.map((t) => Math.floor(Math.floor(t / 15.625) * 15.625))
const D04 = Array.from({ length: 1000 }, (_, j) => 5000.00731 + 0.4 * j)
const D037 = Array.from({ length: 1000 }, (_, j) => 5000.00731 + 0.037 * j)

describe('刻みの推定 estimateTsResolution（decisions #25）', () => {
  it('系列の端の値（検算の確かめ）', () => {
    expect(T[0]).toBeCloseTo(10001.414, 3)
    expect(T[19]).toBeCloseTo(13162.625, 3)
    expect(TICK.slice(0, 5)).toEqual([10000, 10359, 10437, 10515, 10875])
  })

  it('梯子は 100・16.667・15.625・1・0.1・0.02・0.005 の順', () => {
    expect(TS_GRID_LADDER.map((s) => s.q)).toEqual([100, 16.667, 15.625, 1, 0.1, 0.02, 0.005])
  })

  it.each([
    ['S1 丸めない', T, 0, 0],
    ['S2 100 ms 格子', floorTo(T, 100), 100, 1],
    ['S3 16.667 格子', floorTo(T, 16.667), 16.667, 1],
    ['S4 50/3 格子（16.667 と取り違えない）', floorTo(T, 50 / 3), 16.667, 1],
    ['S5 16.667 の確率的丸め', S5, 16.667, 1],
    ['S6 1 ms 格子', T.map(Math.floor), 1, 1],
    ['S7 0.1 ms 格子', T.map((t) => Math.floor(10 * t) / 10), 0.1, 1],
    ['S8 0.02 ms 格子', floorTo(T, 0.02), 0.02, 1],
    ['S9 0.005 ms 格子', floorTo(T, 0.005), 0.005, 1],
    ['S10 1 ms に外れ値 2 個（i 5・12）', plus(T, { 5: 0.3712, 12: 0.6131 }), 1, 0.9],
    ['S11 外れ値 3 個で当てはまらない', plus(T, { 5: 0.3712, 12: 0.6131, 17: 0.2219 }), 0, 0],
    ['S12 隣り合う外れ値（i 5・6）', plus(T, { 5: 0.3712, 6: 0.6131 }), 1, 0.9],
    ['S14 同じ値を 2 回ずつ', [...floorTo(T, 16.667), ...floorTo(T, 16.667)], 16.667, 1],
    ['S15 NaN・±Infinity は捨てる', [...T.map(Math.floor), NaN, Infinity, -Infinity], 1, 1],
    ['K1 Windows の tick', TICK, 15.625, 1],
    ['K2 tick ＋ 0.37', TICK.map((x) => x + 0.37), 15.625, 1],
    ['K3 tick を 1 ms に丸め直す', TICK.map((x) => Math.floor(x + 0.37)), 15.625, 1],
  ] as const)('%s → q %s・fit %s・n 20', (_, xs, q, fit) => {
    const r = estimateTsResolution(xs)
    expect(r.q).toBe(q)
    expect(r.fit).toBeCloseTo(fit, 12)
    expect(r.n).toBe(20)
  })

  it('S13 重複を除いて 19 値は推定しない（null）', () => {
    expect(estimateTsResolution(floorTo(T, 16.667).slice(0, 19))).toEqual({
      q: null,
      fit: 0,
      n: 19,
    })
  })

  it('密な標本 D1〜D5（0.4 ms・0.037 ms 間隔の 1000 点を丸める）', () => {
    expect(estimateTsResolution(floorTo(D04, 16.667))).toEqual({ q: 16.667, fit: 1, n: 25 })
    expect(estimateTsResolution(D04.map(Math.floor))).toEqual({ q: 1, fit: 1, n: 400 })
    expect(estimateTsResolution(D04.map((t) => Math.floor(10 * t) / 10))).toEqual({
      q: 0.1,
      fit: 1,
      n: 1000,
    })
    expect(estimateTsResolution(floorTo(D037, 16.667))).toEqual({ q: null, fit: 0, n: 4 })
    expect(estimateTsResolution(floorTo(D037, 0.005))).toEqual({ q: 0.005, fit: 1, n: 1000 })
  })

  it('限界（記録に書く）: 2・5・10 ms の格子は 1 と出る。端の外れ値 2 個で 1 ms 格子が 0.1 と出る', () => {
    for (const g of [2, 5, 10]) expect(estimateTsResolution(floorTo(T, g)).q).toBe(1)
    expect(estimateTsResolution(plus(T, { 1: 0.3712, 10: 0.4 }))).toEqual({
      q: 0.1,
      fit: 0.9,
      n: 20,
    })
  })

  it('isCoarse: 8 以上が粗い。null・0 は分からないので false', () => {
    expect(TS_COARSE_MS).toBe(8)
    expect(isCoarse(100)).toBe(true)
    expect(isCoarse(16.667)).toBe(true)
    expect(isCoarse(15.625)).toBe(true)
    expect(isCoarse(8)).toBe(true)
    expect(isCoarse(7.99)).toBe(false)
    expect(isCoarse(1)).toBe(false)
    expect(isCoarse(0)).toBe(false)
    expect(isCoarse(null)).toBe(false)
  })
})
