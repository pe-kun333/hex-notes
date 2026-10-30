import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PHASE_GAPS, layoutPhase, phaseLevel } from '../../../src/layout/phase.ts'
import {
  DEFAULT_STAGGER,
  GAP_NAMES,
  RED_DEV_U,
  STAGGER_PRESETS,
  gapDevs,
  parseStagger,
  physOffFor,
  physX,
  redPairs,
  type Stagger,
} from '../../../src/layout/stagger.ts'
import { LAYOUT_IDS } from '../../../src/shared/types.ts'

// src/layout/stagger.ts・phase.ts。出どころ: m2 `GAP_NAMES` L184・`STAG_BUILTIN` L198–203・`physOffFor` L208・
// `redPairs` L264–265・`gapDevs` L266–267・`updatePhase` L455（元のコードを行番号で切り出して評価し照合。m2 の conv は qw）、
// kickoff 手順 9 の期待値、ADR 0001、decisions #42（仮）。

const M2 = readFileSync(
  fileURLToPath(new URL('../../../docs/planning/mocks/m2-layout-explorer.html', import.meta.url)),
  'utf8',
).split('\n')

function lines(from: number, to: number, head: string): string {
  const s = M2.slice(from - 1, to).join('\n')
  if (!s.startsWith(head)) throw new Error(`モックの行がずれた: m2 L${from}`)
  return s
}

/** m2 の段ずれ・隣・赤い組の関数（conv qw） */
function m2Fns(): {
  physOffFor: (v: Stagger) => number[]
  redPairs: (v: Stagger) => { a: { code: string }; b: { code: string }; dev: number; gap: number }[]
  gapDevs: (v: Stagger) => number[]
  stag: { id: string; name: string; v: number[] }[]
  gapNames: string[]
} {
  const src = [
    lines(175, 181, 'const ROWS = ['),
    lines(182, 182, 'const SPECIAL = {'),
    lines(184, 184, "const GAP_NAMES = ['数字–Q'"),
    lines(186, 188, 'const KEYS = [];'),
    lines(198, 203, 'const STAG_BUILTIN = ['),
    lines(208, 208, 'const physOffFor = v =>'),
    lines(231, 239, 'const DIRS = ['),
    "const state = { conv: 'qw' }",
    lines(244, 247, 'let cellIndex = new Map();'),
    lines(264, 267, 'function redPairs(physV) {'),
    'rebuildIndex()',
    'return { physOffFor, redPairs, gapDevs, stag: STAG_BUILTIN, gapNames: GAP_NAMES }',
  ].join('\n')
  return new Function(src)() as ReturnType<typeof m2Fns>
}

const M = m2Fns()
const ALL: Stagger[] = [
  ...STAGGER_PRESETS.map((p) => p.v),
  [0.5, 0.5, 0.25],
  [0.75, 0.25, 1],
  [0.3, 0.6, 0.1],
  [1, 0, 0.75],
]

describe('段ずれ stagger', () => {
  it('順は [数字–Q, Q–A, A–Z]（ADR 0001。m2 GAP_NAMES L184 と同じ）', () => {
    expect([...GAP_NAMES]).toEqual(M.gapNames)
  })

  it('既定の表は m2 STAG_BUILTIN と同じ 4 つ、先頭 ANSI が既定', () => {
    expect(STAGGER_PRESETS.map((p) => ({ id: p.id, name: p.name, v: [...p.v] }))).toEqual(M.stag)
    expect(DEFAULT_STAGGER).toEqual([0.5, 0.25, 0.5])
  })

  it('physOffFor([0.5, 0.25, 0.5]) ＝ [0, 0.5, 0.75, 1.25]（m2 L208）', () => {
    expect(physOffFor([0.5, 0.25, 0.5])).toEqual([0, 0.5, 0.75, 1.25])
    for (const v of ALL) expect(physOffFor(v)).toEqual(M.physOffFor(v))
  })

  it('物理 x: ANSI で KeyA 0.75、Slash 10.25、Digit1 0、40 個の外は null', () => {
    expect(physX('KeyA', DEFAULT_STAGGER)).toBe(0.75)
    expect(physX('Slash', DEFAULT_STAGGER)).toBe(10.25)
    expect(physX('Digit1', DEFAULT_STAGGER)).toBe(0)
    expect(physX('Space', DEFAULT_STAGGER)).toBeNull()
  })

  it('格子との差 gapDevs と赤い組 redPairs は m2 と同じ（conv qw、8 通りの段ずれ）', () => {
    for (const v of ALL) {
      // m2 は累積の差を引くので 1e-16 の桁で違う
      M.gapDevs(v).forEach((d, i) => expect(gapDevs(v)[i]).toBeCloseTo(d, 12))
      const ours = redPairs(v).map((p) => `${p.a}-${p.b}-${p.gap}-${p.dev.toFixed(9)}`)
      const ref = M.redPairs(v).map((p) => `${p.a.code}-${p.b.code}-${p.gap}-${p.dev.toFixed(9)}`)
      expect(ours, String(v)).toEqual(ref)
    }
  })

  it('ANSI の赤い組は Q–A の段間だけ（左上・右上の 19 組、ずれ 1/4u）。正六角どおり 1/2 なら 0 組', () => {
    expect(RED_DEV_U).toBe(0.2)
    const red = redPairs(DEFAULT_STAGGER)
    expect(red.length).toBe(19)
    expect(new Set(red.map((p) => p.gap))).toEqual(new Set([1]))
    expect(red.every((p) => Math.abs(p.dev - 0.25) < 1e-12)).toBe(true)
    expect(redPairs([0.5, 0.5, 0.5])).toEqual([])
  })

  it('parseStagger: 3 つの 0..1 の数だけ（U-01 の小数も受ける）', () => {
    expect(parseStagger([0.5, 0.25, 0.5])).toEqual([0.5, 0.25, 0.5])
    expect(parseStagger([0.48, 0.27, 0.5])).toEqual([0.48, 0.27, 0.5])
    expect(parseStagger([0, 0, 1])).toEqual([0, 0, 1])
    for (const bad of [
      [0.5, 0.25],
      [0.5, 0.25, 0.5, 0],
      [0.5, '0.25', 0.5],
      [0.5, Number.NaN, 0.5],
      [-0.25, 0, 0],
      [0, 1.25, 0],
      null,
      'ansi',
    ])
      expect(parseStagger(bad), JSON.stringify(bad)).toBeNull()
  })
})

describe('位相の合否 phase', () => {
  /** m2 updatePhase L455 の段（0 ok・1 mid・2 ng） */
  const m2Level = new Function(
    'v',
    `${(/const ph = .*?const lv = [^;]*;/.exec(M2[454] ?? '') ?? [''])[0]}\nreturn lv`,
  ) as (v: number) => number

  it('ANSI × ableton → mid（Q–A 1/4u）、ANSI × vmpk → ok（数字–Q・A–Z 1/2u）', () => {
    expect(layoutPhase('ableton', DEFAULT_STAGGER).worst).toBe('mid')
    expect(layoutPhase('vmpk', DEFAULT_STAGGER).worst).toBe('ok')
  })

  it('閾は 1/2 からの差 0.125 以下 ok・0.375 以下 mid・超えると ng（境界を含む）。m2 L455 と同じ段', () => {
    const LV = ['ok', 'mid', 'ng']
    for (let k = 0; k <= 400; k++) {
      const v = k / 200
      expect(phaseLevel(v).level, String(v)).toBe(LV[m2Level(v)])
    }
    expect(phaseLevel(0.375).level).toBe('ok')
    expect(phaseLevel(0.374).level).toBe('mid')
    expect(phaseLevel(0.875).level).toBe('mid')
    expect(phaseLevel(0.876).level).toBe('ng')
    expect(phaseLevel(0).level).toBe('ng')
    expect(phaseLevel(1).level).toBe('ng')
    expect(phaseLevel(1.5).level).toBe('ok')
  })

  it('1/4u 刻みの申告 0・1/4・1/2・3/4 は ng・mid・ok・mid', () => {
    expect([0, 0.25, 0.5, 0.75].map((v) => phaseLevel(v).level)).toEqual(['ng', 'mid', 'ok', 'mid'])
  })

  it('効く段間（m2 gaps）: ableton [1]・vmpk [0, 2]・genshin なし・wicki 全部。最悪の段を返す', () => {
    expect(PHASE_GAPS).toEqual({ ableton: [1], vmpk: [0, 2], genshin: [], wicki: [0, 1, 2] })
    expect(layoutPhase('genshin', DEFAULT_STAGGER).worst).toBeNull()
    expect(layoutPhase('wicki', DEFAULT_STAGGER)).toMatchObject({ worst: 'mid', iso: true })
    // ortholinear（ずれ 0）は黒鍵が真上: どの配列でも ng（genshin を除く）
    for (const id of LAYOUT_IDS)
      expect(layoutPhase(id, [0, 0, 0]).worst).toBe(id === 'genshin' ? null : 'ng')
    // vmpk は Q–A（継ぎ目）を見ない
    const v = layoutPhase('vmpk', [0.5, 0, 0.5])
    expect(v.worst).toBe('ok')
    expect(v.gaps.map((g) => [g.relevant, g.level])).toEqual([
      [true, 'ok'],
      [false, 'ng'],
      [true, 'ok'],
    ])
  })
})
