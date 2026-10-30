import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HOLD_MIN_MS, isHold, releaseResult } from '../../../src/judge/hold.ts'
import {
  GAUGE_START,
  GRADE_WEIGHT,
  accuracyOf,
  addJudgment,
  histogramOf,
  initialScore,
  isCleared,
  isFullCombo,
  rankOf,
  sampleSd,
  unstableRate,
  type ScoreState,
} from '../../../src/judge/score.ts'
import {
  PROFILES,
  gradeOf,
  inGoodWindow,
  lateEdge,
  releaseWindow,
} from '../../../src/judge/windows.ts'
import { HOLD_MIN_MS as RENDER_HOLD_MIN_MS } from '../../../src/render/canvas/cells.ts'
import type { Judgment } from '../../../src/shared/types.ts'

// src/judge/windows.ts・hold.ts・score.ts。出どころ: design.md §2.3、m1' `windows` L270・`GRADE_W` L317・
// `accuracy／rankOf` L356–357（元のコードを行番号で切り出して評価し照合）、kickoff 手順 8 の期待値、decisions #38〜#39（仮）。
// dt の符号は 押した − 着地（正が遅れ）。m1' の dt は 着地 − 今（負が遅れ）なので、台帳の「遅れ側 −30 ms」は dt ＋30。

const M1_LINES = readFileSync(
  fileURLToPath(new URL('../../../docs/planning/mocks/m1-geometry.html', import.meta.url)),
  'utf8',
).split('\n')

function m1Line(n: number, head: string): string {
  const s = M1_LINES[n - 1] ?? ''
  if (!s.startsWith(head)) throw new Error(`モックの行がずれた: m1' L${n}`)
  return s
}

const B = PROFILES.beginner.windows
const G = PROFILES.gamer.windows

describe('判定窓 windows（2 組だけ）', () => {
  it('入門者 24／100／180、遅れ側 ×1.3（遅れ側の GOOD ＝ W_late 234）', () => {
    expect(B).toEqual({ perfect: 24, great: 100, good: 180, lateFactor: 1.3 })
    expect(lateEdge(B)).toBeCloseTo(234, 9)
    expect([B.perfect, B.great, B.good].map((w) => w * B.lateFactor)).toEqual([
      expect.closeTo(31.2, 9),
      expect.closeTo(130, 9),
      expect.closeTo(234, 9),
    ])
  })

  it('音ゲー向け 30／90／200、×1.0。NEAR は入門者 1・音ゲー向け 0、点・ゲージは音ゲー向けだけ', () => {
    expect(G).toEqual({ perfect: 30, great: 90, good: 200, lateFactor: 1 })
    expect(PROFILES.beginner.near).toBe(1)
    expect(PROFILES.gamer.near).toBe(0)
    expect(PROFILES.beginner.gauge).toBe(false)
    expect(PROFILES.gamer.gauge).toBe(true)
  })

  it('入門者: 遅れ側 −30 ms（dt ＋30）→ perfect、−235 ms → 窓の外（miss。180×1.3 ＝ 234 の外）', () => {
    expect(gradeOf(B, 30)).toBe('perfect')
    expect(gradeOf(B, 235)).toBeNull()
  })

  it("境界は窓に含む（m1' judge L318 の ≤）。早い側は倍率なし", () => {
    expect(gradeOf(B, 31.2)).toBe('perfect')
    expect(gradeOf(B, 31.3)).toBe('great')
    expect(gradeOf(B, 130)).toBe('great')
    expect(gradeOf(B, 130.1)).toBe('good')
    expect(gradeOf(B, 234)).toBe('good')
    expect(gradeOf(B, 234.1)).toBeNull()
    expect(gradeOf(B, -24)).toBe('perfect')
    expect(gradeOf(B, -24.1)).toBe('great')
    expect(gradeOf(B, -100)).toBe('great')
    expect(gradeOf(B, -180)).toBe('good')
    expect(gradeOf(B, -180.1)).toBeNull()
    expect(gradeOf(G, 200)).toBe('good')
    expect(gradeOf(G, 200.1)).toBeNull()
    expect(gradeOf(G, -30)).toBe('perfect')
    expect(gradeOf(G, 31)).toBe('great')
    expect(inGoodWindow(B, 234)).toBe(true)
    expect(inGoodWindow(B, -181)).toBe(false)
  })

  it("m1' の windows（L241・L270、bemuse・beatoraja、lateWide）と同じ段を返す", () => {
    const src = [m1Line(241, 'const WINDOWS = {'), m1Line(270, 'function windows(dt) {')].join('\n')
    for (const [name, lateWide, w] of [
      ['bemuse', true, B],
      ['beatoraja', false, G],
    ] as const) {
      const m1 = new Function('state', `${src}\nreturn windows`)({
        windows: name,
        lateWide,
      }) as (dt: number) => { perfect: number; great: number; good: number }
      for (let ms = -260; ms <= 260; ms += 0.5) {
        // m1' の dt（秒）は 着地 − 今。押した − 着地 ＝ ms なら m1' の dt ＝ −ms/1000
        const dtS = -ms / 1000
        const ww = m1(dtS)
        const a = Math.abs(dtS)
        const ref: Judgment | null =
          a <= ww.perfect ? 'perfect' : a <= ww.great ? 'great' : a <= ww.good ? 'good' : null
        expect(gradeOf(w, ms), `${name} ${ms}`).toBe(ref)
      }
    }
  })

  it('離し窓 ＝ 1.5×GOOD: 入門者 270、音ゲー向け 300（§2.3「同（300 ms）」）', () => {
    expect(releaseWindow(B)).toBe(270)
    expect(releaseWindow(G)).toBe(300)
  })
})

describe('ホールド hold', () => {
  it('音価 ≥500 ms（境界を含む）。描画層の HOLD_MIN_MS も同じ値', () => {
    expect(HOLD_MIN_MS).toBe(500)
    expect(RENDER_HOLD_MIN_MS).toBe(500)
    expect(isHold(1000, 1500)).toBe(true)
    expect(isHold(1000, 1499.9)).toBe(false)
  })

  it('終点 10000・離し窓 270: 9730 で離せば ok、9729.9 は early', () => {
    expect(releaseResult(9730, 10000, 270)).toBe('ok')
    expect(releaseResult(9729.9, 10000, 270)).toBe('early')
    expect(releaseResult(10000, 10000, 270)).toBe('ok')
  })
})

describe('採点 score', () => {
  const run = (grades: Judgment[], gauge: boolean): ScoreState =>
    grades.reduce((s, g) => addJudgment(s, g, gauge), initialScore())

  it("重み 1／0.7／0.4／NEAR 0.4／0（m1' GRADE_W L317 と同じ）", () => {
    const ref = new Function(`${m1Line(317, 'const GRADE_W = {')}\nreturn GRADE_W`)() as Record<
      string,
      number
    >
    expect({ ...GRADE_WEIGHT }).toEqual(ref)
  })

  it("精度 ＝ 重みの平均。判定が無ければ 1（m1' accuracy L356）", () => {
    expect(accuracyOf(initialScore())).toBe(1)
    const s = run(['perfect', 'great', 'good', 'near', 'miss'], false)
    expect(accuracyOf(s)).toBeCloseTo((1 + 0.7 + 0.4 + 0.4 + 0) / 5, 12)
    expect(s.counts).toEqual({ perfect: 1, great: 1, good: 1, near: 1, miss: 1 })
  })

  it("ランク: accuracy 0.5 → C、境界 0.98／0.95／0.9／0.8 は上の段（m1' rankOf L357 と同じ）", () => {
    expect(rankOf(0.5)).toBe('C')
    const src = [m1Line(356, 'function accuracy() {'), m1Line(357, 'function rankOf(acc) {')].join(
      '\n',
    )
    const ref = new Function(`${src}\nreturn rankOf`)() as (a: number) => string
    for (const a of [0, 0.5, 0.7999, 0.8, 0.8999, 0.9, 0.9499, 0.95, 0.9799, 0.98, 1])
      expect(rankOf(a), String(a)).toBe(ref(a))
    expect([0.98, 0.95, 0.9, 0.8].map(rankOf)).toEqual(['SS', 'S', 'A', 'B'])
  })

  it("m1' accuracy（L356）と同じ精度（counts と accSum を渡す）", () => {
    const grades: Judgment[] = ['perfect', 'perfect', 'great', 'near', 'miss', 'good', 'great']
    const s = run(grades, false)
    const ref = new Function('state', `${m1Line(356, 'function accuracy() {')}\nreturn accuracy`)({
      counts: s.counts,
      accSum: grades.reduce((a, g) => a + GRADE_WEIGHT[g], 0),
    }) as () => number
    expect(accuracyOf(s)).toBeCloseTo(ref(), 12)
  })

  it('音ゲー向けの点: 素点 ×(1＋min(コンボ,50)/100)。足した後のコンボで取り、miss で 0 に戻る', () => {
    const one = run(['perfect'], true)
    expect(one.points).toBeCloseTo(1010, 9)
    const s = run(['perfect', 'great', 'good', 'miss', 'perfect'], true)
    expect(s.points).toBeCloseTo(1000 * 1.01 + 700 * 1.02 + 400 * 1.03 + 1000 * 1.01, 9)
    expect(s.combo).toBe(1)
    expect(s.maxCombo).toBe(3)
    const long = run(Array<Judgment>(60).fill('perfect'), true)
    let ref = 0
    for (let c = 1; c <= 60; c++) ref += 1000 * (1 + Math.min(c, 50) / 100)
    expect(long.points).toBeCloseTo(ref, 6)
  })

  it('ゲージ: 50 開始、＋1.5（perfect・great）／＋0.5（good）／−6（miss）、0..100。9 回の miss で 0 → failed', () => {
    expect(GAUGE_START).toBe(50)
    expect(run(['perfect', 'great', 'good'], true).gauge).toBeCloseTo(53.5, 12)
    expect(run(Array<Judgment>(40).fill('perfect'), true).gauge).toBe(100)
    const eight = run(Array<Judgment>(8).fill('miss'), true)
    expect(eight.gauge).toBe(2)
    expect(eight.failed).toBe(false)
    const nine = addJudgment(eight, 'miss', true)
    expect(nine.gauge).toBe(0)
    expect(nine.failed).toBe(true)
    // 一度 0 になったら、後で戻ってもクリアにしない
    expect(
      isCleared(
        run([...Array<Judgment>(9).fill('miss'), ...Array<Judgment>(60).fill('perfect')], true),
      ),
    ).toBe(false)
    expect(isCleared({ gauge: 70, failed: false })).toBe(true)
    expect(isCleared({ gauge: 69.9, failed: false })).toBe(false)
  })

  it('入門者は点・ゲージを動かさない（コンボは数える）。NEAR は音ゲー向けでも点・ゲージなし', () => {
    const s = run(['perfect', 'miss', 'miss'], false)
    expect(s.points).toBe(0)
    expect(s.gauge).toBe(50)
    expect(s.failed).toBe(false)
    const n = run(['near'], true)
    expect(n.points).toBe(0)
    expect(n.gauge).toBe(50)
    expect(n.combo).toBe(1)
  })

  it('フルコンボ ＝ 判定 1 つ以上で miss 0', () => {
    expect(isFullCombo(run([], true).counts)).toBe(false)
    expect(isFullCombo(run(['good', 'near'], true).counts)).toBe(true)
    expect(isFullCombo(run(['good', 'miss'], true).counts)).toBe(false)
  })

  it('統計: sd [1,2,3,4] ＝ 1.2909944（n − 1）、UR ＝ SD×10、標本 1 つは null', () => {
    expect(sampleSd([1, 2, 3, 4])).toBeCloseTo(1.2909944, 7)
    expect(unstableRate([1, 2, 3, 4])).toBeCloseTo(12.909944, 6)
    expect(unstableRate([5])).toBeNull()
  })

  it('早遅ヒストグラム: 10 ms の階級の下端（"-20" は [−20, −10)）', () => {
    expect(histogramOf([-25, -20, -10.5, -0.5, 0, 9.9, 10])).toStrictEqual({
      '-30': 1,
      '-20': 2,
      '-10': 1,
      '0': 2,
      '10': 1,
    })
  })
})
