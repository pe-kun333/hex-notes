import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLED_SONGS, FIXTURE_SONGS, songOf, variantFor } from '../../../src/app/songs.ts'
import { stageOf } from '../../../src/app/stage.ts'
import { buildVariant } from '../../../src/chart/variants.ts'
import { LAYOUTS } from '../../../src/layout/presets.ts'
import { TRAVEL_MS, visibleMs } from '../../../src/render/hex/sizing.ts'
import type { Chart } from '../../../src/shared/types.ts'

// src/app/stage.ts・songs.ts（M1-03、M1 の手順 3）。出どころ: m1-kickoff 手順 3 の期待値（2026-10-31 に sizeForViewport と
// visibleMs で検算した 3 視口 × 2 配列の表）・完了条件「3 視口で最下段の着地まで 1.5 s 以上かつ R≥24」（design.md §5.2
// L234）、decisions #7（上限の既定 2）・#23（同梱曲の版）・#24、tests-inventory「M1 手順 3」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const fixture = (id: string): Chart =>
  JSON.parse(
    readFileSync(
      path.join(root, 'tests', 'fixtures', 'charts', 'm1', `${id}.hexnote.json`),
      'utf8',
    ),
  ) as Chart

describe('S2 の箱（3 視口、入門者の流れる時間 1,500 ms）', () => {
  const VIEWPORTS = [
    { w: 1366, h: 668 },
    { w: 1280, h: 620 },
    { w: 1093, h: 514 },
  ]
  const TABLE = {
    ableton: { R: [28, 28, 28], v: [0.3587, 0.3267, 0.256], bottom: [1695, 1714, 1773] },
    vmpk: { R: [28, 28, 27], v: [0.3027, 0.2707, 0.2043], bottom: [2009, 2069, 2227] },
  } as const

  it('R・v・最下段の可視時間が手順 3 の表のとおり（limited null）。全て R ≥ 24 かつ最下段 ≥ 1,500 ms', () => {
    for (const layout of ['ableton', 'vmpk'] as const) {
      const rows = LAYOUTS[layout].rowsUsed
      const got = VIEWPORTS.map((vp) => {
        const s = stageOf(vp, rows, TRAVEL_MS.beginner).sizing
        return {
          R: s.R,
          v: Math.round(s.v * 10000) / 10000,
          bottom: Math.round(visibleMs(s, rows.length - 1)),
          limited: s.limited,
        }
      })
      const t = TABLE[layout]
      expect(got, layout).toEqual(
        VIEWPORTS.map((_, i) => ({ R: t.R[i], v: t.v[i], bottom: t.bottom[i], limited: null })),
      )
      for (const g of got) {
        expect(g.R).toBeGreaterThanOrEqual(24)
        expect(g.bottom).toBeGreaterThanOrEqual(1500)
      }
    }
  })

  it('箱は右列（左 504 ＝ 12＋480＋12、上 12）、canvas の座標は箱の左上が原点、プレイヤーは 480×270', () => {
    const st = stageOf({ w: 1366, h: 668 }, LAYOUTS.ableton.rowsUsed, TRAVEL_MS.beginner)
    expect(st.box).toEqual({ left: 504, top: 12, width: 850, height: 644 })
    expect(st.player).toEqual({ w: 480, h: 270 })
    expect(st.sizing.box).toEqual({ left: 0, top: 0, width: 850, height: 644 })
    expect(st.sizing.fallTop).toBe(0)
    expect(st.sizing.kbLeft + st.sizing.kbW / 2).toBeCloseTo(425, 9)
    expect(st.sizing.kbTop + st.sizing.kbH).toBe(644 - 8)
  })

  it('狭い視口はプレイヤーを 356×200 に縮め、それでも鍵盤図が入らなければ RangeError', () => {
    const narrow = stageOf({ w: 900, h: 600 }, LAYOUTS.vmpk.rowsUsed, TRAVEL_MS.beginner)
    expect(narrow.player).toEqual({ w: 356, h: 200 })
    expect(narrow.box.left).toBe(12 + 356 + 12)
    expect(() => stageOf({ w: 200, h: 113 }, LAYOUTS.ableton.rowsUsed, TRAVEL_MS.beginner)).toThrow(
      RangeError,
    )
  })
})

describe('曲の一覧と譜面版', () => {
  it('フィクスチャ 6 曲の名前は譜面の name と同じ、url は tests/fixtures/charts/m1/', () => {
    expect(FIXTURE_SONGS).toHaveLength(6)
    for (const s of FIXTURE_SONGS) {
      const id = s.id.replace(/^fixture:/, '')
      expect(s.url).toBe(`/tests/fixtures/charts/m1/${id}.hexnote.json`)
      expect(s.name).toBe(fixture(id).name)
    }
  })

  it('同梱曲の名前は譜面の name と同じ、url は content/charts/ の譜面', () => {
    expect(BUNDLED_SONGS.map((s) => s.url)).toEqual([
      '/content/charts/tutorial/hajime.json',
      '/content/charts/pd/twinkle.json',
      '/content/charts/pd/ode.json',
    ])
    for (const s of BUNDLED_SONGS) {
      const c = JSON.parse(readFileSync(path.join(root, ...s.url.split('/')), 'utf8')) as Chart
      expect(s.name).toBe(c.name)
    }
  })

  it('譜面にある版はそのまま使い、無い版（上限 4）は作る', () => {
    const c = fixture('canon')
    const have = c.variants?.find((v) => v.id === 'vmpk/2/octave')
    expect(variantFor(c, { layout: 'vmpk', limit: 2, fold: 'octave' })).toBe(have)
    const spec = { layout: 'ableton', limit: 4, fold: 'octave' } as const
    expect(c.variants?.some((v) => v.limit === 4)).toBe(false)
    expect(variantFor(c, spec)).toEqual(buildVariant(c, spec))
  })

  it('songOf: 通る譜面は演奏する曲（chartId・name・版）、通らなければ最初の問題の文', () => {
    const c = fixture('ode')
    const s = songOf(c, { layout: 'ableton', limit: 2, fold: 'octave' })
    if (typeof s === 'string') throw new Error(s)
    expect(s.chartId).toBe(c.id)
    expect(s.name).toBe('歓喜の歌')
    expect(s.variant.id).toBe('ableton/2/octave')
    const bad = songOf({ ...c, notes: 'x' }, { layout: 'ableton', limit: 2, fold: 'octave' })
    expect(bad).toMatch(/^譜面が読めません（notes: /)
    // 並びの崩れた譜面も検査で落ちる（版を作る前に止まる）
    const [n0, n1, ...rest] = c.notes
    if (n0 === undefined || n1 === undefined) throw new Error('音が足りない')
    expect(
      songOf(
        { ...c, notes: [{ ...n1, beat: 0 }, n0, ...rest] },
        { layout: 'ableton', limit: 2, fold: 'octave' },
      ),
    ).toMatch(/^譜面が読めません（notes\[1\]/)
    expect(songOf(null, { layout: 'ableton', limit: 2, fold: 'octave' })).toMatch(
      /^譜面が読めません/,
    )
  })
})
