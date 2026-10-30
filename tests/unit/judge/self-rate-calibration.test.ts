import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  OFFSET_LIMIT_MS,
  clampOffset,
  judgedTime,
  proposeOffset,
  tapOffset,
} from '../../../src/judge/calibration-offset.ts'
import {
  classify,
  emptySelfRate,
  fadeAfter,
  fadeOf,
  initialFade,
  labelVisible,
  selfRatio,
  type FadeState,
  type LabelSides,
} from '../../../src/judge/self-rate.ts'

// src/judge/self-rate.ts・calibration-offset.ts。出どころ: design.md §2.7、decisions #6、m4 `fadeOf` L314・
// `labelVisible` L315（元のコードを行番号で切り出して評価し照合）・`classify` L420–421、m3 `finishCal` L456・`onEnd` L396、
// kickoff 手順 8 の期待値（α 0.2 → hint、0.19 → self）、decisions #40（仮）。

const M4_LINES = readFileSync(
  fileURLToPath(new URL('../../../docs/planning/mocks/m4-practice.html', import.meta.url)),
  'utf8',
).split('\n')

function m4Line(n: number, head: string): string {
  const s = M4_LINES[n - 1] ?? ''
  if (!s.startsWith(head)) throw new Error(`モックの行がずれた: m4 L${n}`)
  return s
}

const BOTH: LabelSides = { kb: 'both', note: 'both' }
const linked = (alpha: Record<number, number>): FadeState => ({ ...initialFade(), alpha })

describe('足場外し labelVisible・fadeOf', () => {
  it('α 0.2 → ヒント付き（hinted）、0.19 → 自力（solo）（m4 L314–315）', () => {
    expect(labelVisible(linked({ 60: 0.2 }), 60, BOTH)).toBe(true)
    expect(labelVisible(linked({ 60: 0.19 }), 60, BOTH)).toBe(false)
    expect(classify('hit', labelVisible(linked({ 60: 0.2 }), 60, BOTH))).toBe('hinted')
    expect(classify('hit', labelVisible(linked({ 60: 0.19 }), 60, BOTH))).toBe('solo')
  })

  it('α の無い音は 1、manual は全音一律', () => {
    expect(fadeOf(initialFade(), 61)).toBe(1)
    const m: FadeState = { mode: 'manual', manual: 0.1, alpha: { 61: 0.9 } }
    expect(fadeOf(m, 61)).toBe(0.1)
    expect(labelVisible(m, 61, BOTH)).toBe(false)
  })

  it('両側 none なら α 1 でも見えない。片側だけ出していれば見える（鍵盤側／ノート側を別スイッチ）', () => {
    const f = initialFade()
    expect(labelVisible(f, 60, { kb: 'none', note: 'none' })).toBe(false)
    expect(labelVisible(f, 60, { kb: 'none', note: 'key' })).toBe(true)
    expect(labelVisible(f, 60, { kb: 'note', note: 'none' })).toBe(true)
  })

  it('m4 の fadeOf・labelVisible と同じ値（α と側の組み合わせ）', () => {
    const src = [m4Line(314, 'const fadeOf = midi =>'), m4Line(315, 'const labelVisible = midi =>')]
    const sides = ['key', 'note', 'none'] as const
    for (const mode of ['linked', 'manual'] as const)
      for (const a of [0, 0.19, 0.2, 0.5, 1])
        for (const kb of sides)
          for (const note of sides) {
            const state = {
              fadeMode: mode,
              manualAlpha: a,
              fade: { 60: a },
              kbLabel: kb,
              noteLabel: note,
            }
            const ref = new Function('state', `${src.join('\n')}\nreturn labelVisible`)(state) as (
              midi: number,
            ) => boolean
            const f: FadeState = { mode, manual: a, alpha: { 60: a } }
            expect(labelVisible(f, 60, { kb, note }), `${mode} ${a} ${kb} ${note}`).toBe(ref(60))
          }
  })
})

describe('自力率 classify・fadeAfter', () => {
  it('区分: miss・tainted は miss、NEAR は near、当てた音は見えれば hinted・見えなければ solo', () => {
    expect(classify('miss', true)).toBe('miss')
    expect(classify('hit', true, true)).toBe('miss')
    expect(classify('near', false)).toBe('near')
    expect(classify('hit', true)).toBe('hinted')
    expect(classify('hit', false)).toBe('solo')
  })

  it('成績連動: 当てた −0.12、外した ＋0.30、NEAR 不変、0..1・小数 3 桁（m4 classify L421）', () => {
    const f = initialFade()
    const a1 = fadeAfter(f, 60, 'hinted')
    expect(fadeOf(a1, 60)).toBe(0.88)
    expect(fadeOf(fadeAfter(a1, 60, 'solo'), 60)).toBe(0.76)
    expect(fadeOf(fadeAfter(linked({ 60: 0.1 }), 60, 'solo'), 60)).toBe(0)
    expect(fadeOf(fadeAfter(linked({ 60: 0.88 }), 60, 'miss'), 60)).toBe(1)
    expect(fadeOf(fadeAfter(linked({ 60: 0.5 }), 60, 'miss'), 60)).toBe(0.8)
    expect(fadeAfter(linked({ 60: 0.5 }), 60, 'near')).toEqual(linked({ 60: 0.5 }))
    const m: FadeState = { mode: 'manual', manual: 1, alpha: {} }
    expect(fadeAfter(m, 60, 'miss')).toBe(m)
  })

  it('7 回当てると α 0.16 で 8 回目は solo（1, .88, .76, .64, .52, .40, .28 → .16）', () => {
    let f = initialFade()
    const cats: string[] = []
    for (let k = 0; k < 8; k++) {
      const cat = classify('hit', labelVisible(f, 60, BOTH))
      cats.push(cat)
      f = fadeAfter(f, 60, cat)
    }
    expect(cats).toEqual([...Array<string>(7).fill('hinted'), 'solo'])
    expect(fadeOf(f, 60)).toBe(0.04)
  })

  it('自力率 ＝ solo / 4 区分の和（S4 の 31／50 ＝ 62%）。区分が無ければ null', () => {
    expect(selfRatio(emptySelfRate())).toBeNull()
    expect(selfRatio({ solo: 31, hinted: 10, near: 4, miss: 5 })).toBeCloseTo(0.62, 12)
  })
})

describe('校正のオフセット', () => {
  it('判定に使う実時刻 ＝ tsPerf ＋ オフセット', () => {
    expect(judgedTime(1000, -20)).toBe(980)
    expect(judgedTime(1000, 15)).toBe(1015)
  })

  it('±120 に丸める（1 ms 丸め）', () => {
    expect(OFFSET_LIMIT_MS).toBe(120)
    expect(clampOffset(200)).toBe(120)
    expect(clampOffset(-130.4)).toBe(-120)
    expect(clampOffset(-17.5)).toBe(-17)
    expect(clampOffset(17.5)).toBe(18)
  })

  it('段 1: 24 打で SD < 30 ならオフセット ＝ −平均（遅れ 20 → −20）。23 打・SD ≥ 30 は適用しない', () => {
    const late = Array.from({ length: 24 }, (_, i) => 20 + (i % 2 === 0 ? 5 : -5))
    expect(tapOffset(late)).toMatchObject({ ok: true, offset: -20 })
    expect(tapOffset(late.slice(0, 23))).toMatchObject({ ok: false, reason: 'count' })
    const wide = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? 40 : -40))
    expect(tapOffset(wide)).toMatchObject({ ok: false, reason: 'sd' })
  })

  it('段 1 は前のオフセットに依らない（m3 finishCal L456 の S.offset − m は 2 回目で二重に引く）', () => {
    const late = Array.from({ length: 24 }, () => 20)
    const a = tapOffset(late)
    const b = tapOffset(late)
    expect(a).toMatchObject({ ok: true, offset: -20 })
    expect(b).toMatchObject({ ok: true, offset: -20 })
  })

  it('段 2: ヒット ≥8・|平均| ≥10・SD < 30 で 提案 ＝ used − 平均（m3 onEnd L396 の offset ＋ mean(−dt)）', () => {
    const dts = [12, 18, 14, 16, 15, 15, 13, 17]
    expect(proposeOffset(dts, 0)).toMatchObject({ ok: true, offset: -15 })
    expect(proposeOffset(dts, -10)).toMatchObject({ ok: true, offset: -25 })
    expect(proposeOffset(dts.slice(0, 7), 0)).toMatchObject({ ok: false, reason: 'count' })
    expect(
      proposeOffset(
        dts.map((d) => d - 6),
        0,
      ),
    ).toMatchObject({ ok: false, reason: 'small' })
    expect(
      proposeOffset(
        dts.map((d) => d - 5),
        0,
      ),
    ).toMatchObject({ ok: true, offset: -10 })
    expect(
      proposeOffset(
        dts.map((d) => d - 5.1),
        0,
      ),
    ).toMatchObject({ ok: false, reason: 'small' })
    expect(proposeOffset([60, -40, 60, -40, 60, -40, 60, -40], 0)).toMatchObject({
      ok: false,
      reason: 'sd',
    })
    expect(proposeOffset(dts, 110)).toMatchObject({ ok: true, offset: 95 })
    expect(
      proposeOffset(
        dts.map((d) => d - 140),
        0,
      ),
    ).toMatchObject({ ok: true, offset: 120 })
  })
})
