import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FIT_WINDOW_MS,
  LATTICE_MIN,
  LATTICE_TOL_MS,
  QHAT_MAX_MS,
  QHAT_MIN_SPAN_MS,
  STEP_MIN_MS,
  estimateQ,
  latticeRate,
  latticeStep,
  lineOf,
  lsq,
  residualSd,
  spanOf,
  trimWindow,
  type FitPoint,
} from '../../../src/clock/fit.ts'
import { JUMP_MS, classifySample, devOf } from '../../../src/clock/jump.ts'

// src/clock/fit.ts・jump.ts。出どころ: 相談 C の表（傾き 0.99986452 の生成式 x_i ＝ i·2000/120、y_i ＝ floor(x_i/15)·15、
// i ＝ 0..120）を主担当が node で計算し直した値、m3 `lsq` L321–323（元のコードを評価して照合）、design.md §2.6、
// decisions #33（仮）。残差の SD は n − 1 で割る（m3 `sd` L248）: 4.327・q̂ 14.99（n で割れば 4.309・14.93）。

const M3_LINES = readFileSync(
  fileURLToPath(new URL('../../../docs/planning/mocks/m3-clock-judge.html', import.meta.url)),
  'utf8',
).split('\n')

const GRID: FitPoint[] = Array.from({ length: 121 }, (_, i) => {
  const now = (i * 2000) / 120
  return { now, raw: Math.floor(now / 15) * 15 }
})

describe('最小二乗 lsq（2 秒窓・15 ms 切り捨ての 121 点）', () => {
  it('傾き 0.99986452・切片 −6.393（相談 C を検算。kickoff §7-18 の自作値から外す）', () => {
    const f = lsq(GRID)
    expect(f).not.toBeNull()
    expect(f?.a).toBeCloseTo(0.99986452, 7)
    expect(f?.b).toBeCloseTo(-6.393443, 5)
  })

  it('m3 の lsq（秒の単位、a ＝ 切片・b ＝ 傾き）と同じ直線', () => {
    const src = [321, 322, 323].map((n) => M3_LINES[n - 1] ?? '').join('\n')
    if (!src.startsWith('function lsq(pts)')) throw new Error('モックの行がずれた: L321')
    const m3lsq = new Function(`${src}\nreturn lsq`)() as (pts: { now: number; raw: number }[]) => {
      a: number
      b: number
      x0: number
    }
    const ref = m3lsq(GRID.map((p) => ({ now: p.now, raw: p.raw / 1000 })))
    const f = lsq(GRID)
    expect(f?.a).toBeCloseTo(ref.b, 9)
    expect(f?.b).toBeCloseTo(ref.a * 1000 - ref.b * ref.x0, 6)
  })

  it('四捨五入なら傾き 1.000023（相談 C）', () => {
    const round = GRID.map((p) => ({ now: p.now, raw: Math.round(p.now / 15) * 15 }))
    expect(lsq(round)?.a).toBeCloseTo(1.000023, 6)
  })

  it('残差の SD は n − 1 で 4.327、q̂ ＝ √12·SD ＝ 14.99。格子率 1.0', () => {
    const f = lsq(GRID)
    if (f === null) throw new Error('lsq')
    const sd = residualSd(GRID, f)
    expect(sd).toBeCloseTo(4.327193, 5)
    expect(Math.sqrt(12) * sd).toBeCloseTo(14.989835, 5)
    expect(latticeRate(GRID, Math.sqrt(12) * sd)).toBe(1)
    expect(estimateQ(GRID, 0)).toBeCloseTo(14.989835, 5)
  })

  it('2 点未満・now が同じなら null', () => {
    expect(lsq([{ now: 0, raw: 0 }])).toBeNull()
    expect(
      lsq([
        { now: 5, raw: 0 },
        { now: 5, raw: 15 },
      ]),
    ).toBeNull()
  })
})

describe('窓と線', () => {
  it('窓は最新から 2,000 ms（境界は残す）、2 点は残す', () => {
    const pts = [0, 500, 1000, 2500, 3000].map((now) => ({ now, raw: now }))
    expect(trimWindow(pts).map((p) => p.now)).toEqual([1000, 2500, 3000])
    expect(FIT_WINDOW_MS).toBe(2000)
    const two = [
      { now: 0, raw: 0 },
      { now: 9000, raw: 9000 },
    ]
    expect(trimWindow(two)).toEqual(two)
  })

  it('span < 300 は最新の標本から傾き rate、≥ 300 は最小二乗', () => {
    const short = [
      { now: 1000, raw: 2000 },
      { now: 1299, raw: 2400 },
    ]
    expect(spanOf(short)).toBe(299)
    expect(lineOf(short, 0.5)).toEqual({ a: 0.5, b: 2400 - 0.5 * 1299 })
    const long = [
      { now: 1000, raw: 2000 },
      { now: 1300, raw: 2300 },
    ]
    expect(lineOf(long, 0.5)?.a).toBeCloseTo(1, 12)
    expect(lineOf([], 1)).toBeNull()
  })
})

describe('q̂ の門（span ≥ 1000、刻みの格子率 ≥ 0.8、上限 50、持ち越し）', () => {
  it('span < 1000 は前の値を持ち越す。1000 ちょうどで推定する', () => {
    expect(QHAT_MIN_SPAN_MS).toBe(1000)
    const pts = GRID.filter((p) => p.now < 999)
    expect(estimateQ(pts, 7)).toBe(7)
    expect(estimateQ(pts, 0)).toBe(0)
    const almost = [...pts, { now: 999.9, raw: 990 }]
    expect(spanOf(almost)).toBeCloseTo(999.9, 9)
    expect(estimateQ(almost, 7)).toBe(7)
    const full = GRID.slice(0, 61)
    expect(spanOf(full)).toBe(1000)
    const q = estimateQ(full, 7)
    expect(q).not.toBe(7)
    expect(q).toBeGreaterThan(14)
  })

  it('格子に乗らない（連続の読み）は 0', () => {
    // 刻みの無い読みに ±4 ms の揺れ（決まった並び）: 残差の SD はあるが、増分が q̂ の倍数に乗らない
    const jitter = [0, 3, -4, 1, 4, -2, -3, 2]
    const pts = Array.from({ length: 121 }, (_, i) => {
      const now = (i * 2000) / 120
      return { now, raw: now + (jitter[i % jitter.length] ?? 0) }
    })
    expect(estimateQ(pts, 15)).toBe(0)
  })

  it('上限は 50 ms（200 ms 刻みの読みは √12·SD ≈ 200 を 50 に切る）', () => {
    expect(QHAT_MAX_MS).toBe(50)
    const pts = Array.from({ length: 121 }, (_, i) => {
      const now = (i * 2000) / 120
      return { now, raw: Math.floor(now / 200) * 200 }
    })
    expect(latticeStep(pts)).toBe(200)
    expect(estimateQ(pts, 0)).toBe(50)
  })

  it('格子率: 増分 15・30 は乗る、22 は乗らない、0 以下は数えない。許しは ±1 ms ちょうどまで', () => {
    const pts = [0, 15, 45, 67, 67, 60].map((raw, i) => ({ now: i, raw }))
    expect(latticeRate(pts, 15)).toBeCloseTo(2 / 3, 12)
    expect(latticeRate(pts, 0)).toBe(0)
    expect(LATTICE_TOL_MS).toBe(1)
    const two = (d: number) => [
      { now: 0, raw: 0 },
      { now: 1, raw: d },
    ]
    expect(latticeRate(two(16), 15)).toBe(1)
    expect(latticeRate(two(14), 15)).toBe(1)
    expect(latticeRate(two(16.01), 15)).toBe(0)
    expect(latticeRate(two(31.01), 15)).toBe(0)
  })

  it('刻みの推定 latticeStep: 増分 15 → 15、30 fps の増分 30・45 → 15（最小の増分の約数）、刻みの無い読み → 0', () => {
    const seq = (ds: number[]) => {
      let raw = 0
      return [{ now: 0, raw: 0 }, ...ds.map((d, i) => ({ now: i + 1, raw: (raw += d) }))]
    }
    expect(latticeStep(seq([15, 15, 30, 15]))).toBe(15)
    expect(latticeStep(seq([30, 45, 30, 30, 45]))).toBe(15)
    expect(latticeStep(GRID)).toBe(15)
    expect(latticeStep(seq([16.7, 16.6, 16.7]))).toBeCloseTo(16.6, 9)
    expect(latticeStep([{ now: 0, raw: 0 }])).toBe(0)
    expect(STEP_MIN_MS).toBe(4)
  })

  it('刻みの門は格子率 0.8 ちょうどで開き、0.79 で閉じる（増分 15 と、どの候補にも乗らない 27.5）', () => {
    expect(LATTICE_MIN).toBe(0.8)
    const seq = (hits: number, misses: number) => {
      let raw = 0
      const ds = [...Array<number>(hits).fill(15), ...Array<number>(misses).fill(27.5)]
      return [{ now: 0, raw: 0 }, ...ds.map((d, i) => ({ now: i + 1, raw: (raw += d) }))]
    }
    expect(latticeStep(seq(80, 20))).toBe(15)
    expect(latticeStep(seq(79, 21))).toBe(0)
  })
})

describe('標本の受け入れ classifySample（境界 250 は飛びでない、251 は飛び）', () => {
  const line = { a: 1, b: 0 }
  const ctx = {
    lastRead: 990,
    fresh: false,
    lastAccepted: 990,
    line,
    anchor: { now: 0, t: 0 },
    rate: 1,
  }

  it('dev ＝ raw − (a·now ＋ b)。250 → accept、251 → jump、−251 → jump', () => {
    expect(JUMP_MS).toBe(250)
    expect(devOf(1250, 1000, line)).toBe(250)
    expect(classifySample(1250, 1000, ctx)).toEqual({ kind: 'accept', dev: 250 })
    expect(classifySample(1251, 1000, ctx)).toEqual({ kind: 'jump', dev: 251 })
    expect(classifySample(749, 1000, { ...ctx, lastAccepted: 700 })).toEqual({
      kind: 'jump',
      dev: -251,
    })
  })

  it('同じ読みは same。逆行（最後に受け入れた標本以下）は back で捨てる', () => {
    expect(classifySample(990, 1000, ctx)).toEqual({ kind: 'same' })
    expect(classifySample(985, 1000, { ...ctx, lastRead: 1005, lastAccepted: 1005 })).toEqual({
      kind: 'back',
      dev: -15,
    })
    expect(classifySample(1005, 1000, { ...ctx, lastRead: 1000, lastAccepted: 1005 }).kind).toBe(
      'back',
    )
  })

  it('再アンカーの後: 読みが分からなければ base、変われば first（下は保持の値 − 250、上は名目の進み ＋ 250 まで）', () => {
    const fresh = { ...ctx, fresh: true, anchor: { now: 1500, t: 9990 } }
    expect(classifySample(9990, 1500, { ...fresh, lastRead: null })).toEqual({ kind: 'base' })
    expect(classifySample(9990, 1740, { ...fresh, lastRead: 9990 })).toEqual({ kind: 'same' })
    // 名目の進み ＝ 9990 ＋ 1·(1740 − 1500) ＝ 10230
    expect(classifySample(10005, 1740, { ...fresh, lastRead: 9990 })).toEqual({ kind: 'first' })
    expect(classifySample(9740, 1740, { ...fresh, lastRead: 9990 })).toEqual({ kind: 'first' })
    expect(classifySample(9739, 1740, { ...fresh, lastRead: 9990 })).toEqual({
      kind: 'jump',
      dev: 9739 - 10230,
    })
    expect(classifySample(10480, 1740, { ...fresh, lastRead: 9990 })).toEqual({ kind: 'first' })
    expect(classifySample(10481, 1740, { ...fresh, lastRead: 9990 })).toEqual({
      kind: 'jump',
      dev: 251,
    })
    // レート 0.5 なら名目の進みも半分（9990 ＋ 120 ＋ 250 ＝ 10360 まで）
    expect(classifySample(10360, 1740, { ...fresh, lastRead: 9990, rate: 0.5 }).kind).toBe('first')
    expect(classifySample(10361, 1740, { ...fresh, lastRead: 9990, rate: 0.5 }).kind).toBe('jump')
  })
})
