import { describe, expect, it } from 'vitest'
import {
  matchPress,
  sampleSd,
  summarize,
  type NoteOutcome,
} from '../../../src/app/dev/readability.ts'

// src/app/dev/readability.ts（「位置で読めるか」の集計。開発ページ play-dev が使う）。出どころ: 相談 B の 5 観点、
// ADR 0006。標本標準偏差は m3 sd L248 と同じ（[1,2,3,4] → 1.2909944、台帳 手順 12 の値）。

const o = (
  index: number,
  code: string,
  rowIndex: number,
  tLandMs: number,
  group: number,
  pressMs: number | null = null,
  pressedCode: string | null = null,
): NoteOutcome => ({
  index,
  code,
  rowIndex,
  tLandMs,
  group,
  pressMs,
  pressedCode: pressMs === null ? null : (pressedCode ?? code),
})

describe('sampleSd', () => {
  it('[1,2,3,4] → 1.2909944（n − 1）、1 つは null', () => {
    expect(sampleSd([1, 2, 3, 4])).toBeCloseTo(1.2909944, 7)
    expect(sampleSd([5])).toBeNull()
  })
})

describe('matchPress（±300 ms）', () => {
  const ns = [o(0, 'KeyA', 1, 1000, 0), o(1, 'KeyS', 1, 1200, 1), o(2, 'KeyA', 1, 1400, 2)]
  it('同じ鍵で最も近い音、無ければ最も近い音（鍵違い）、±300 の外は null', () => {
    expect(matchPress(ns, 'KeyA', 1350)).toBe(2)
    expect(matchPress(ns, 'KeyA', 1180)).toBe(0)
    expect(matchPress(ns, 'KeyD', 1190)).toBe(1)
    expect(matchPress(ns, 'KeyA', 1701)).toBeNull()
    expect(matchPress(ns, 'KeyA', 699)).toBeNull()
  })
  it('対応済みの音は取らない', () => {
    const done = [o(0, 'KeyA', 1, 1000, 0, 1010), ns[1] as NoteOutcome]
    expect(matchPress(done, 'KeyA', 1005)).toBe(1)
  })
})

describe('summarize（5 観点のうち数で出す 4 つ）', () => {
  it('外し率・dt SD・段ごとの SD・入れ違い・和音の幅', () => {
    const s = summarize([
      o(0, 'KeyA', 1, 1000, 0, 1010),
      o(1, 'KeyW', 0, 1000, 0, 1030),
      o(2, 'KeyS', 1, 1500, 1, 1490),
      o(3, 'KeyE', 0, 1800, 2, 1480),
      o(4, 'KeyD', 1, 2100, 3, 2110, 'KeyF'),
      o(5, 'KeyF', 1, 2400, 4),
    ])
    expect(s.notes).toBe(6)
    expect(s.missed).toBe(1)
    expect(s.wrongKey).toBe(1)
    expect(s.missRate).toBeCloseTo(2 / 6, 12)
    expect(s.dtSd).toBeCloseTo(sampleSd([10, 30, -10, -320]) ?? Number.NaN, 9)
    expect(s.dtSdByRow[1]).toBeCloseTo(sampleSd([10, -10]) ?? Number.NaN, 9)
    expect(s.dtSdByRow[0]).toBeCloseTo(sampleSd([30, -320]) ?? Number.NaN, 9)
    // 着地の順 A(1000)・W(1000)・S(1500)・E(1800): S は 1490、E は 1480 → S→E で 1 回
    expect(s.inversions).toBe(1)
    expect(s.chordSpreadMedian).toBe(20)
  })
})
