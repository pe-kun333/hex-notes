import { describe, expect, it } from 'vitest'
import {
  admitFlash,
  admitMilestone,
  emptyBudget,
  type BudgetState,
} from '../../../../src/render/canvas/budget.ts'
import {
  edgeReturnWidth,
  feedbackCommands,
  flashArea,
  pruneEffects,
  type FxIntent,
} from '../../../../src/render/canvas/feedback.ts'
import {
  feedFrame,
  initialLowLoad,
  lowLoadEffects,
  p95,
  type LowLoadState,
} from '../../../../src/render/canvas/lowload.ts'
import { bboxOf, inRegion, regionsOf } from '../../../../src/render/canvas/primitives.ts'
import { setup } from './frame-setup.ts'

// src/render/canvas/feedback.ts・budget.ts・lowload.ts。出どころ: 相談 B の代表値（縁 real 0／60／120／121 → 2／4／6／
// なし、閃光 5 件 → 受理 3・格下げ 2、低負荷 25 ms × 10 s → 段 1）、design.md §1.3・§2.8、decisions #29（仮）。

describe('縁の返し（2 → 6 px・120 ms）', () => {
  it('経過 0／60／120／121 ms → 2／4／6／なし（相談 B）', () => {
    expect(edgeReturnWidth(0)).toBe(2)
    expect(edgeReturnWidth(60)).toBe(4)
    expect(edgeReturnWidth(120)).toBe(6)
    expect(edgeReturnWidth(121)).toBeNull()
    expect(edgeReturnWidth(-1)).toBeNull()
  })
})

describe('演出のコマンド', () => {
  const s = setup('twinkle', 'ableton/2/octave')
  const rg = regionsOf(s.sizing)
  const base = { grid: s.grid, mode: 'cell' as const, depth: true, flashes: true, regions: rg }
  const fx: FxIntent[] = [
    { kind: 'judgeText', atMs: 1000, grade: 'great', dtMs: -12.4 },
    { kind: 'edgeReturn', atMs: 1000, code: 'KeyA', grade: 'great' },
    { kind: 'slide', atMs: 1000, from: 'KeyA', to: 'KeyS' },
    { kind: 'flash', atMs: 1000, codes: ['KeyA', 'KeyS'], mode: 'full' },
  ]

  it('fx の層の中は slide → edgeReturn → flash → judgeText。判定文字は「よい」と「−12 ms」', () => {
    const cmds = feedbackCommands(fx, { ...base, realMs: 1060 })
    expect(cmds.map((c) => c.tag)).toEqual([
      'slide',
      'edgeReturn',
      'flash',
      'flash',
      'judgeText',
      'judgeText',
    ])
    expect(
      cmds.filter((c) => c.kind === 'text').map((c) => (c.kind === 'text' ? c.text : '')),
    ).toEqual(['よい', '−12 ms'])
    expect(cmds.every((c) => c.layer === 'fx')).toBe(true)
  })

  it('縁の返しは鍵盤図のセルの中（線の外側が描く径を越えない）、全部が領域の中', () => {
    for (const t of [1000, 1060, 1120, 1159, 1199, 1599]) {
      const cmds = feedbackCommands(fx, { ...base, realMs: t })
      for (const c of cmds) expect(inRegion(bboxOf(c), c.region, rg)).toBe(true)
    }
    const [edge] = feedbackCommands([fx[1] as FxIntent], { ...base, realMs: 1120 })
    const a = s.grid.byCode.get('KeyA')
    if (!edge || !a) throw new Error('無い')
    const b = bboxOf(edge)
    expect(b.y0).toBeGreaterThanOrEqual(a.cy - 0.93 * s.grid.R - 1e-9)
  })

  it('NEAR の滑りは 160 ms で押した鍵へ半分（0 で元の中心、80 で 1/4、160 で 1/2）、その後は消える', () => {
    const a = s.grid.byCode.get('KeyA')
    const b = s.grid.byCode.get('KeyS')
    if (!a || !b) throw new Error('無い')
    const cx = (t: number): number => {
      const [c] = feedbackCommands([fx[2] as FxIntent], { ...base, realMs: t })
      if (!c || c.kind !== 'poly') return Number.NaN
      return c.pts.reduce((sum, p) => sum + p[0], 0) / c.pts.length
    }
    expect(cx(1000)).toBeCloseTo(a.cx, 9)
    expect(cx(1080)).toBeCloseTo(a.cx + (b.cx - a.cx) / 4, 9)
    expect(cx(1160)).toBeCloseTo(a.cx + (b.cx - a.cx) / 2, 9)
    expect(feedbackCommands([fx[2] as FxIntent], { ...base, realMs: 1161 })).toHaveLength(0)
  })

  it('判定文字は 600 ms で消え、不透明度は 1 − p²。最後の要求だけを描く', () => {
    const at = (t: number) => feedbackCommands([fx[0] as FxIntent], { ...base, realMs: t })
    expect(at(1300)[0]?.alpha).toBeCloseTo(0.75, 12)
    expect(at(1600)[0]?.alpha).toBe(0)
    expect(at(1601)).toHaveLength(0)
    const two: FxIntent[] = [
      fx[0] as FxIntent,
      { kind: 'judgeText', atMs: 1100, grade: 'miss', dtMs: null },
    ]
    const texts = feedbackCommands(two, { ...base, realMs: 1150 })
    expect(texts).toHaveLength(1)
    expect(texts[0]?.kind === 'text' && texts[0].text).toBe('はずれ')
  })

  it('格下げした閃光は縁 2 px（塗らない）。flashes false（低負荷 段 1 以上）は閃光を出さない', () => {
    const deg: FxIntent = { kind: 'flash', atMs: 1000, codes: ['KeyA'], mode: 'degraded' }
    const [c] = feedbackCommands([deg], { ...base, realMs: 1000 })
    expect(c).toMatchObject({ tag: 'flash', stroke: 'flash', width: 2 })
    expect(c?.kind === 'poly' && c.fill).toBeUndefined()
    expect(
      feedbackCommands(fx, { ...base, flashes: false, realMs: 1000 }).some(
        (x) => x.tag === 'flash',
      ),
    ).toBe(false)
  })

  it('pruneEffects は寿命ちょうどまで残す', () => {
    expect(pruneEffects(fx, 1120).map((e) => e.kind)).toEqual([
      'judgeText',
      'edgeReturn',
      'slide',
      'flash',
    ])
    expect(pruneEffects(fx, 1121).map((e) => e.kind)).toEqual(['judgeText', 'slide', 'flash'])
    expect(pruneEffects(fx, 1601)).toEqual([])
  })

  it('閃光の面積は描くセルの六角の和（R 28・最下段 A は (0.93·28)² · 3√3/2）', () => {
    expect(flashArea(['KeyA'], s.grid, 'cell', true)).toBeCloseTo(
      ((3 * Math.sqrt(3)) / 2) * (0.93 * 28) ** 2,
      6,
    )
  })
})

describe('演出の予算（1 秒 3 回、面積 25%、超過は格下げ）', () => {
  const STAGE = 100_000

  function run(times: number[], area = 1000): string[] {
    let st: BudgetState = emptyBudget()
    return times.map((t) => {
      const r = admitFlash(st, t, area, STAGE)
      st = r.state
      return r.mode
    })
  }

  it('同じ秒に 5 件 → 受理 3・格下げ 2（相談 B）', () => {
    expect(run([0, 100, 200, 300, 400])).toEqual(['full', 'full', 'full', 'degraded', 'degraded'])
  })

  it('最初の閃光から 1,000 ms 経てば次を受け入れる（999 ms は格下げ）', () => {
    expect(run([0, 1, 2, 999, 1000])).toEqual(['full', 'full', 'full', 'degraded', 'full'])
  })

  it('面積: 25% ちょうどは受理、超えると格下げ。光り終わった（200 ms）閃光は面積に数えない', () => {
    expect(run([0], 25_000)).toEqual(['full'])
    expect(run([0], 25_001)).toEqual(['degraded'])
    expect(run([0, 100], 15_000)).toEqual(['full', 'degraded'])
    expect(run([0, 200], 15_000)).toEqual(['full', 'full'])
  })

  it('節目の演出は 10 秒に 1 回', () => {
    let st = emptyBudget()
    const ok = [0, 9_999, 10_000].map((t) => {
      const r = admitMilestone(st, t)
      st = r.state
      return r.ok
    })
    expect(ok).toEqual([true, false, true])
  })
})

describe('低負荷（p95 > 20 ms が 10 秒で 1 段）', () => {
  function feed(frames: number[], start: LowLoadState = initialLowLoad()) {
    let st = start
    let changes = 0
    for (const f of frames) {
      const r = feedFrame(st, f)
      st = r.state
      if (r.changed) changes++
    }
    return { st, changes }
  }
  const every = (dt: number, until: number, from = 0): number[] =>
    Array.from({ length: Math.floor((until - from) / dt) + 1 }, (_, i) => from + i * dt)

  it('p95 は最近接順位（20 値なら 19 番目）', () => {
    expect(p95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19)
    expect(p95([])).toBe(0)
  })

  it('25 ms × 10 s → 段 1（10,000 ms のフレームで落ちる。9,975 ms では 0）', () => {
    expect(feed(every(25, 9975)).st.level).toBe(0)
    const r = feed(every(25, 10_000))
    expect(r.st.level).toBe(1)
    expect(r.changes).toBe(1)
  })

  it('16.7 ms では落ちない。遅さが途中で戻ると数え直す', () => {
    expect(feed(every(16.7, 30_000)).st.level).toBe(0)
    const mixed = [...every(25, 6000), ...every(16, 8000, 6016), ...every(25, 17_000, 8025)]
    expect(feed(mixed).st.level).toBe(0)
  })

  it('1,000 ms を超える間隔（非表示・一時停止）は途切れ: 数え直し、段は保つ', () => {
    const r = feed([...every(25, 9000), 10_500, ...every(25, 15_000, 10_525)])
    expect(r.st.level).toBe(0)
    expect(feed([...every(25, 9000), 10_500], initialLowLoad(2)).st.level).toBe(2)
  })

  it('段は 3 で止まる。段の効き目は 演出なし → 殻なし → 奥行きなし', () => {
    expect(feed(every(25, 50_000)).st.level).toBe(3)
    expect(lowLoadEffects(0)).toEqual({ flashes: true, shells: true, depth: true })
    expect(lowLoadEffects(1)).toEqual({ flashes: false, shells: true, depth: true })
    expect(lowLoadEffects(2)).toEqual({ flashes: false, shells: false, depth: true })
    expect(lowLoadEffects(3)).toEqual({ flashes: false, shells: false, depth: false })
  })
})
