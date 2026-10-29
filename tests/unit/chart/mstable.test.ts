import { describe, expect, it } from 'vitest'
import { buildMsTable, quantizeBeat, scaleMs } from '../../../src/chart/mstable.ts'
import type { Pulse, TempoPoint } from '../../../src/shared/types.ts'

// 出どころ: docs/design.md §3.2「読み込み時に ms 表へ」、m5 makeClock。期待値は手順 2 の指示のもの。
const pulse = (tempo: TempoPoint[], resolution = 240): Pulse => ({ resolution, tempo })
const TWO = [
  { beat: 0, bpm: 120 },
  { beat: 4, bpm: 60 },
]

describe('ms 表（design.md §3.2、m5 makeClock）', () => {
  it('beatToMs(4) = 2000（120 bpm で 4 拍）', () => {
    expect(buildMsTable(pulse(TWO)).beatToMs(4)).toBe(2000)
  })

  it('beatToMs(6) = 4000（60 bpm の区間で 2 拍）', () => {
    expect(buildMsTable(pulse(TWO)).beatToMs(6)).toBe(4000)
  })

  it('msToBeat(3000) = 5', () => {
    expect(buildMsTable(pulse(TWO)).msToBeat(3000)).toBe(5)
  })

  it('tempo が空なら RangeError（既定 120 は持たない。validateChart の empty と同じ）', () => {
    expect(() => buildMsTable(pulse([]))).toThrow(RangeError)
  })

  it('3 区間の開始 ms を累積する', () => {
    const t = buildMsTable(
      pulse([
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
        { beat: 8, bpm: 240 },
      ]),
    )
    expect(t.segments.map((s) => s.ms)).toEqual([0, 2000, 6000])
    expect(t.beatToMs(8)).toBe(6000)
    expect(t.beatToMs(12)).toBe(7000)
    expect(t.msToBeat(6500)).toBe(10)
  })

  it('msToBeat と beatToMs は互いに逆（往復誤差 1e-9）', () => {
    const t = buildMsTable(
      pulse([
        { beat: 0, bpm: 97.3 },
        { beat: 3.25, bpm: 141 },
        { beat: 10, bpm: 60.5 },
        { beat: 16, bpm: 200 },
      ]),
    )
    for (let beat = -2; beat <= 24; beat += 0.37) {
      expect(Math.abs(t.msToBeat(t.beatToMs(beat)) - beat)).toBeLessThan(1e-9)
    }
    for (let ms = -1000; ms <= 20000; ms += 333.3) {
      expect(Math.abs(t.beatToMs(t.msToBeat(ms)) - ms)).toBeLessThan(1e-9)
    }
  })

  it('scaleMs: rate 0.75 で ms は 1/0.75 倍、rate 1 で不変', () => {
    expect(scaleMs(3000, 0.75)).toBe(4000)
    expect(scaleMs(3000, 1)).toBe(3000)
    expect(scaleMs(3000, 1.25)).toBe(2400)
  })

  it('scaleMs: rate が 0 以下・非数なら RangeError', () => {
    expect(() => scaleMs(1000, 0)).toThrow(RangeError)
    expect(() => scaleMs(1000, -1)).toThrow(RangeError)
    expect(() => scaleMs(1000, Number.NaN)).toThrow(RangeError)
  })

  it('quantizeBeat(0.3333, 240) = 80/240', () => {
    expect(quantizeBeat(0.3333, 240)).toBe(80 / 240)
    expect(quantizeBeat(1.0005, 240)).toBe(1)
    expect(quantizeBeat(1.0025, 240)).toBe(241 / 240)
    expect(() => quantizeBeat(1, 0)).toThrow(RangeError)
  })

  it('安全網（validate 済みなら到達しない）: 先頭の beat が 0 でない tempo は beat 0 から先頭の bpm を使う', () => {
    const t = buildMsTable(pulse([{ beat: 4, bpm: 60 }]))
    expect(t.segments).toEqual([
      { beat: 0, bpm: 60, ms: 0 },
      { beat: 4, bpm: 60, ms: 4000 },
    ])
    expect(t.beatToMs(2)).toBe(2000)
    expect(t.beatToMs(4)).toBe(4000)
    expect(t.msToBeat(5000)).toBe(5)
  })

  it('負の beat は 0 に丸めず先頭区間で外挿する', () => {
    const t = buildMsTable(pulse(TWO))
    expect(t.beatToMs(-1)).toBe(-500)
    expect(t.msToBeat(-500)).toBe(-1)
  })

  it('安全網（validate 済みなら到達しない）: 先頭の beat が負なら拍 0 を 0 ms に合わせる', () => {
    const t = buildMsTable(
      pulse([
        { beat: -2, bpm: 120 },
        { beat: 2, bpm: 60 },
      ]),
    )
    expect(t.beatToMs(0)).toBe(0)
    expect(t.segments.map((s) => s.ms)).toEqual([-1000, 1000])
    expect(t.beatToMs(-2)).toBe(-1000)
    expect(t.beatToMs(3)).toBe(2000)
  })

  it('ms は float のまま（丸めない）', () => {
    const ms = buildMsTable(pulse([{ beat: 0, bpm: 90 }])).beatToMs(1)
    expect(ms).toBeCloseTo(666.6667, 3)
    expect(Number.isInteger(ms)).toBe(false)
  })

  it('安全網（validate 済みなら到達しない）: tempo の並びは beat 昇順に直し、同じ拍は後勝ち。元の配列は触らない', () => {
    const tempo: TempoPoint[] = [
      { beat: 4, bpm: 60 },
      { beat: 0, bpm: 100 },
      { beat: 0, bpm: 120 },
    ]
    const copy = tempo.map((t) => ({ ...t }))
    const t = buildMsTable(pulse(tempo))
    expect(t.segments).toEqual([
      { beat: 0, bpm: 120, ms: 0 },
      { beat: 4, bpm: 60, ms: 2000 },
    ])
    expect(tempo).toEqual(copy)
  })

  it('resolution を写す。正でなければ既定の 240', () => {
    expect(buildMsTable(pulse(TWO, 480)).resolution).toBe(480)
    expect(buildMsTable(pulse(TWO, 0)).resolution).toBe(240)
  })

  it('bpm が 0 以下・非数なら RangeError', () => {
    expect(() => buildMsTable(pulse([{ beat: 0, bpm: 0 }]))).toThrow(RangeError)
    expect(() => buildMsTable(pulse([{ beat: 0, bpm: Number.NaN }]))).toThrow(RangeError)
    expect(() => buildMsTable(pulse([{ beat: Number.NaN, bpm: 120 }]))).toThrow(RangeError)
  })
})
