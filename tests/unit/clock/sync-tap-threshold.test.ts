import { describe, expect, it } from 'vitest'
import { syncTapFit, syncTapFitOffset } from '../../../src/clock/sync-tap.ts'
import { gauss, mulberry32 } from '../../../src/shared/random.ts'

// 同期タップの閾の物差し（M3 の手順 11、m3-kickoff 手順 11 の期待値 (8)・§7-37、仮）。閾 68／30 ms（残差 SD）は値を変えず、
// 物差しを offset の標準誤差に替える提案の根拠の模擬。拍 0〜7（100 BPM、譜面 ms 0〜4,200）、真値 offset 3.0・rate 1、
// 打つ人の真の散らばり σ。模擬は真の拍にガウス SD σ を足して 4,000 回（mulberry32(99)、σ ごとに種を戻す）。
// 関数と閾は変えない（syncTapVerdict はこの手順で触らない）。値は原型の値と同じ。

const BEATS = Array.from({ length: 8 }, (_, k) => k * 600)
const SXX = BEATS.reduce((s, b) => s + (b - 2100) ** 2, 0)
const sd = (a: readonly number[]): number => {
  const m = a.reduce((s, x) => s + x, 0) / a.length
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}
const mean = (a: readonly number[]): number => a.reduce((s, x) => s + x, 0) / a.length
const r2 = (x: number): number => Math.round(x * 100) / 100

function simulate(sigma: number): {
  fixed: number
  full: number
  resFixed: number
  resFull: number
} {
  const rng = mulberry32(99)
  const fo: number[] = []
  const ff: number[] = []
  const ro: number[] = []
  const rf: number[] = []
  for (let k = 0; k < 4000; k++) {
    const v = BEATS.map((b) => b + 3000 + sigma * gauss(rng))
    const a = syncTapFitOffset(BEATS, v)
    const b = syncTapFit(BEATS, v)
    if (a === null || b === null) throw new Error('当てはまらない')
    fo.push(a.offset * 1000)
    ff.push(b.offset * 1000)
    ro.push(a.residualSd)
    rf.push(b.residualSd)
  }
  return { fixed: r2(sd(fo)), full: r2(sd(ff)), resFixed: r2(mean(ro)), resFull: r2(mean(rf)) }
}

describe('同期タップの閾の物差し（期待値 (8)）', () => {
  it('式: rate 固定の offset の標準誤差 σ／√8 → 24.04・10.61・4.95、今の式 0.6455σ → 43.89・19.36・9.04、傾きの標準誤差 × 180 秒 3,148・1,389・648 ms、× 37.8 秒 661・292・136 ms', () => {
    const at = (s: number): number[] => [r2(s / Math.sqrt(8)), r2(s * Math.sqrt(1 / 8 + 2100 ** 2 / SXX)), Math.round((s / Math.sqrt(SXX)) * 180_000), Math.round((s / Math.sqrt(SXX)) * 37_800)]
    expect([68, 30, 14].map(at)).toEqual([
      [24.04, 43.89, 3148, 661],
      [10.61, 19.36, 1389, 292],
      [4.95, 9.04, 648, 136],
    ])
  }) // prettier-ignore

  it('模擬（4,000 回）: σ 68 → rate 固定 24.13・今の式 43.42、残差 SD の平均 65.42・60.31。σ 30 → 10.65・19.16、28.86・26.61', () => {
    expect(simulate(68)).toEqual({ fixed: 24.13, full: 43.42, resFixed: 65.42, resFull: 60.31 })
    expect(simulate(30)).toEqual({ fixed: 10.65, full: 19.16, resFixed: 28.86, resFull: 26.61 })
  }) // prettier-ignore
})
