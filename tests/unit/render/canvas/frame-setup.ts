// 描画層の試験の共通部分: 6 曲のフィクスチャ（tests/fixtures/charts/m1/）を読み、箱 850×644（1366×668 の右列。
// decisions #24）で sizing・鍵盤図・ノートを組む。DOM に触れない。

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Chart, Variant } from '../../../../src/shared/types.ts'
import { LAYOUTS } from '../../../../src/layout/presets.ts'
import { buildKeyboardGrid, type KeyboardGrid } from '../../../../src/render/hex/grid.ts'
import { TRAVEL_MS, computeSizing, type Sizing } from '../../../../src/render/hex/sizing.ts'
import type { FrameNote } from '../../../../src/render/canvas/cells.ts'
import { frameNotes, type FrameInput } from '../../../../src/render/canvas/commands.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
export const CHART_DIR = path.resolve(here, '../../../fixtures/charts/m1')
export const FRAME_DIR = path.resolve(here, '../../../fixtures/render/frames')

export const SONGS = ['canon', 'chroma', 'duet', 'ode', 'scale', 'twinkle'] as const
export const VARIANT_IDS = ['ableton/2/octave', 'vmpk/2/octave'] as const

/** 箱 850×644 を原点に置いた物（canvas が箱を覆う） */
export const BOX_1366 = { left: 0, top: 0, width: 850, height: 644 } as const

export function loadChart(song: string): Chart {
  return JSON.parse(readFileSync(path.join(CHART_DIR, `${song}.hexnote.json`), 'utf8')) as Chart
}

export function variantOf(chart: Chart, id: string): Variant {
  const v = chart.variants?.find((x) => x.id === id)
  if (!v) throw new Error(`譜面版 ${id} が無い`)
  return v
}

export type Setup = {
  chart: Chart
  variant: Variant
  sizing: Sizing
  grid: KeyboardGrid
  notes: FrameNote[]
}

export function setup(
  song: string,
  variantId: string,
  box: { left: number; top: number; width: number; height: number } = BOX_1366,
): Setup {
  const chart = loadChart(song)
  const variant = variantOf(chart, variantId)
  const sizing = computeSizing(box, LAYOUTS[variant.layout].rowsUsed, TRAVEL_MS.beginner)
  const grid = buildKeyboardGrid(variant.layout, sizing.R, {
    left: sizing.kbLeft,
    top: sizing.kbTop,
  })
  return { chart, variant, sizing, grid, notes: frameNotes(chart, variant) }
}

/** スナップショットと同じ初期フレームの入力（t 0、押下なし、演出なし、入門者、文字 both、辺ヒントあり、段別着地） */
export function initialInput(s: Setup, over: Partial<FrameInput> = {}): FrameInput {
  return {
    sizing: s.sizing,
    grid: s.grid,
    mode: 'cell',
    notes: s.notes,
    t: { song: 0, real: 0 },
    pressed: new Set(),
    effects: [],
    labels: { kb: 'both', note: 'both' },
    hints: true,
    level: 0,
    ...over,
  }
}
