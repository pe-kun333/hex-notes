import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultKeyOf as variantsDefaultKeyOf } from '../../../src/chart/variants.ts'
import {
  DEFAULT_GEOMETRY,
  fallbackRowDiffs,
  labelsFor,
  parseGeometry,
  recommendGeometry,
} from '../../../src/layout/fallback.ts'
import {
  QWERTY_LEGEND,
  defaultLegendKind,
  legendOf,
  qwertyLabel,
} from '../../../src/layout/legend.ts'
import { layoutPhase } from '../../../src/layout/phase.ts'
import { KEY_CODES } from '../../../src/layout/presets.ts'
import { defaultKeyOf, samePitchGroups } from '../../../src/layout/same-pitch.ts'
import { DEFAULT_STAGGER } from '../../../src/layout/stagger.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'

// src/layout/legend.ts・same-pitch.ts・fallback.ts。出どころ: design.md §2.1・§1.3 S0a／S6、decisions #2・#21、
// m4 getLayoutMap L668–669、m2 `updateFallbackNote` L466–468（元の式を行番号で切り出して照合）、
// m1' KEYS の label、decisions #43〜#45（仮）。

const M2 = readFileSync(
  fileURLToPath(new URL('../../../docs/planning/mocks/m2-layout-explorer.html', import.meta.url)),
  'utf8',
).split('\n')

describe('刻印 legend', () => {
  it("QWERTY の文字: KeyA → A、Digit1 → 1、Semicolon → ;、Comma → ,（m1' KEYS の label）", () => {
    expect(['KeyA', 'Digit1', 'Semicolon', 'Comma', 'Period', 'Slash'].map(qwertyLabel)).toEqual([
      'A',
      '1',
      ';',
      ',',
      '.',
      '/',
    ])
    expect(QWERTY_LEGEND.size).toBe(40)
  })

  it('getLayoutMap が無ければ JIS／US の選択で QWERTY の文字（40 鍵は JIS と US で同じ）', () => {
    for (const kind of ['jis', 'us'] as const) {
      const r = legendOf(null, kind)
      expect(r).toMatchObject({ source: kind, changed: 0 })
      expect([...r.legend]).toEqual([...QWERTY_LEGEND])
    }
  })

  it('言語の既定: ja・ja-JP は JIS、en-US・空・jav（ジャワ語）は US', () => {
    expect(['ja', 'ja-JP', 'JA-jp', ' ja '].map(defaultLegendKind)).toEqual([
      'jis',
      'jis',
      'jis',
      'jis',
    ])
    expect(['en-US', '', 'jav', 'de'].map(defaultLegendKind)).toEqual(['us', 'us', 'us', 'us'])
  })

  it('getLayoutMap（AZERTY）: 値を大文字にして差し替え、変えた数を数える（m4 L668）。1 文字でない値は QWERTY のまま', () => {
    const azerty = new Map([
      ['KeyQ', 'a'],
      ['KeyA', 'q'],
      ['KeyW', 'z'],
      ['KeyZ', 'w'],
      ['Semicolon', 'm'],
      ['KeyM', ','],
      ['Digit1', '&'],
      ['KeyE', 'e'],
      ['KeyR', 'Dead'],
      ['KeyT', ''],
    ])
    const r = legendOf(azerty, 'us')
    expect(r.source).toBe('layoutMap')
    expect(r.legend.get('KeyQ')).toBe('A')
    expect(r.legend.get('KeyA')).toBe('Q')
    expect(r.legend.get('Semicolon')).toBe('M')
    expect(r.legend.get('KeyM')).toBe(',')
    expect(r.legend.get('Digit1')).toBe('&')
    expect(r.legend.get('KeyE')).toBe('E')
    expect(r.legend.get('KeyR')).toBe('R')
    expect(r.legend.get('KeyT')).toBe('T')
    expect(r.legend.get('KeyY')).toBe('Y')
    expect(r.changed).toBe(7)
  })

  it('鍵盤図のセルの文字は刻印（既定は QWERTY、渡せばその文字）', () => {
    const q = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
    expect(q.byCode.get('KeyA')?.label).toBe('A')
    const a = buildKeyboardGrid(
      'ableton',
      28,
      { left: 0, top: 0 },
      legendOf(new Map([['KeyA', 'q']]), 'us').legend,
    )
    expect(a.byCode.get('KeyA')?.label).toBe('Q')
    expect(a.byCode.get('KeyS')?.label).toBe('S')
  })
})

describe('同音の鍵 same-pitch', () => {
  it('vmpk の同音は 60〜64 の 5 組、既定は上の段（60 以上）。ableton・genshin は無し', () => {
    const g = samePitchGroups('vmpk')
    expect(g.map((x) => [x.midi, [...x.codes], x.preferred])).toEqual([
      [60, ['KeyQ', 'Comma'], 'KeyQ'],
      [61, ['Digit2', 'KeyL'], 'Digit2'],
      [62, ['KeyW', 'Period'], 'KeyW'],
      [63, ['Digit3', 'Semicolon'], 'Digit3'],
      [64, ['KeyE', 'Slash'], 'KeyE'],
    ])
    expect(samePitchGroups('ableton')).toEqual([])
    expect(samePitchGroups('genshin')).toEqual([])
  })

  it('wicki の同音は 60 未満で下の段（58 → KeyN）、60 以上で上の段（65 → Digit2）', () => {
    const w = new Map(samePitchGroups('wicki').map((x) => [x.midi, x.preferred]))
    expect(w.get(58)).toBe('KeyN')
    expect(w.get(65)).toBe('Digit2')
  })

  it('譜面版の生成器（variants.ts）は同じ規則を引く（手順 3 の試験はそのまま通る）', () => {
    for (const layout of ['ableton', 'vmpk', 'genshin', 'wicki'] as const)
      for (let m = 40; m <= 90; m++)
        expect(variantsDefaultKeyOf(layout, m)).toBe(defaultKeyOf(layout, m))
  })
})

describe('幾何と退避 fallback', () => {
  it('既定は正六角。保存の値は 3 値だけ受ける', () => {
    expect(DEFAULT_GEOMETRY).toBe('regular')
    expect(['regular', 'physical', 'fallback', 'Regular', '', 1, null].map(parseGeometry)).toEqual([
      'regular',
      'physical',
      'fallback',
      null,
      null,
      null,
      null,
    ])
  })

  it('勧める幾何: 効く段間に ng（ortholinear × ableton）なら退避、mid（ANSI × ableton）と ok は正六角', () => {
    expect(recommendGeometry(layoutPhase('ableton', [0, 0, 0]))).toBe('fallback')
    expect(recommendGeometry(layoutPhase('ableton', DEFAULT_STAGGER))).toBe('regular')
    expect(recommendGeometry(layoutPhase('vmpk', DEFAULT_STAGGER))).toBe('regular')
    expect(recommendGeometry(layoutPhase('genshin', [0, 0, 0]))).toBe('regular')
  })

  it('物理との差（数字段を基準、u）: ANSI で Q 段 0・A 段 ＋0.25・Z 段 ＋0.25（m2 L467 と同じ式）', () => {
    expect(fallbackRowDiffs(DEFAULT_STAGGER)).toEqual([0, 0.25, 0.25])
    const line = M2[466] ?? ''
    if (!line.startsWith('  const off = physOffFor(state.stag);'))
      throw new Error('モックの行がずれた: m2 L467')
    const expr = /\[1, 2, 3\]\.map\(r => .*?\);/.exec(line)?.[0] ?? ''
    const ROW_OFF = [0, 0.5, 1.0, 1.5]
    const physOffFor = (v: number[]) => [
      0,
      v[0] ?? 0,
      (v[0] ?? 0) + (v[1] ?? 0),
      (v[0] ?? 0) + (v[1] ?? 0) + (v[2] ?? 0),
    ]
    for (const v of [
      [0.5, 0.25, 0.5],
      [0, 0, 0],
      [0.25, 0.25, 0.25],
    ]) {
      const ref = new Function(
        'off',
        'ROW_OFF',
        'state',
        'ROW_NAMES',
        'sgn',
        `return ${expr.replace(/`\$\{ROW_NAMES\[r\]\} \$\{sgn\(/, '(').replace(/\)\}u`\);$/, '))')}`,
      )(physOffFor(v), ROW_OFF, { conv: 'qw' }, [], (x: number) => x) as number[]
      expect(
        fallbackRowDiffs(v as [number, number, number]).map((d) => Math.round(d * 100) / 100),
      ).toEqual(ref)
    }
  })

  it('退避ではキー文字を必ず出す（音名だけ → 両方、なし → キー）。他の幾何はそのまま', () => {
    expect((['key', 'note', 'both', 'none'] as const).map((l) => labelsFor('fallback', l))).toEqual(
      ['key', 'both', 'both', 'key'],
    )
    expect((['key', 'note', 'both', 'none'] as const).map((l) => labelsFor('regular', l))).toEqual([
      'key',
      'note',
      'both',
      'none',
    ])
    expect(labelsFor('physical', 'none')).toBe('none')
  })

  it('40 鍵の刻印は全部 1 文字', () => {
    for (const c of KEY_CODES) expect([...qwertyLabel(c)].length).toBe(1)
  })
})
