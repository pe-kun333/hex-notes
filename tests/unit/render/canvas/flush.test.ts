import { describe, expect, it } from 'vitest'
import { DARK_PALETTE, flush, type Ctx2D } from '../../../../src/render/canvas/flush.ts'
import type { DrawCommand, Regions } from '../../../../src/render/canvas/primitives.ts'

// src/render/canvas/flush.ts。Canvas の代わりに呼び出しを記録する偽物を渡す（jsdom・ブラウザは使わない）。
// 確かめること: DPR の setTransform、背景、region が変わるたびの save・clip・restore、edges の消した辺を描かない、パレット。

type Call = [string, ...unknown[]]

function recorder(): { ctx: Ctx2D; calls: Call[] } {
  const calls: Call[] = []
  const props: Record<string, unknown> = {}
  const rec =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push([name, ...args])
    }
  const ctx = new Proxy(props, {
    get(_t, k: string) {
      if (k in props) return props[k]
      return rec(k)
    },
    set(_t, k: string, v) {
      props[k] = v
      calls.push([`set:${k}`, v])
      return true
    },
  }) as unknown as Ctx2D
  return { ctx, calls }
}

const rg: Regions = {
  fall: { x: 0, y: 0, w: 100, h: 50 },
  keys: { x: 20, y: 50, w: 60, h: 30 },
  stageArea: 6800,
}

const cmds: DrawCommand[] = [
  {
    kind: 'line',
    layer: 'bg',
    region: 'fall',
    tag: 'lane',
    pts: [
      [10, 0],
      [10, 50],
    ],
    stroke: 'lane',
    width: 1,
  },
  {
    kind: 'line',
    layer: 'bg',
    region: 'fall',
    tag: 'lane',
    pts: [
      [20, 0],
      [20, 50],
    ],
    stroke: 'lane',
    width: 1,
  },
  {
    kind: 'poly',
    layer: 'keys',
    region: 'keys',
    tag: 'cell',
    pts: [
      [30, 55],
      [40, 55],
      [40, 65],
      [30, 65],
    ],
    fill: 'shade2',
    stroke: 'noteEdge',
    width: 1.5,
    edges: [false, true, true, true],
    alpha: 0.5,
  },
  {
    kind: 'text',
    layer: 'fx',
    region: 'fall',
    tag: 'judgeText',
    x: 50,
    y: 20,
    text: 'よい',
    px: 36.4,
    weight: 700,
    paint: 'judge:great',
  },
]

describe('flush', () => {
  it('DPR を setTransform で掛け、paper で背景を塗る', () => {
    const { ctx, calls } = recorder()
    flush(ctx, cmds, { regions: rg, width: 100, height: 80, dpr: 2 })
    expect(calls[0]).toEqual(['setTransform', 2, 0, 0, 2, 0, 0])
    expect(calls).toContainEqual(['set:fillStyle', DARK_PALETTE.paper])
    expect(calls).toContainEqual(['fillRect', 0, 0, 100, 80])
  })

  it('region が変わるたびに save → 矩形 → clip、前の領域は restore（fall → keys → fall で 3 回）', () => {
    const { ctx, calls } = recorder()
    flush(ctx, cmds, { regions: rg, width: 100, height: 80, dpr: 1 })
    const names = calls.map((c) => c[0])
    expect(names.filter((n) => n === 'clip')).toHaveLength(3)
    expect(names.filter((n) => n === 'save')).toHaveLength(3)
    expect(names.filter((n) => n === 'restore')).toHaveLength(3)
    expect(calls.filter((c) => c[0] === 'rect').slice(0, 2)).toEqual([
      ['rect', 0, 0, 100, 50],
      ['rect', 20, 50, 60, 30],
    ])
  })

  it('消した辺は描かない: 上の辺を消した正方形は moveTo 1 回で 3 辺の折れ線（塗りは全体）', () => {
    const { ctx, calls } = recorder()
    flush(ctx, [cmds[2] as DrawCommand], { regions: rg, width: 100, height: 80, dpr: 1 })
    const i = calls.findIndex((c) => c[0] === 'fill')
    const after = calls.slice(i + 1)
    const strokeAt = after.findIndex((c) => c[0] === 'stroke')
    const path = after.slice(0, strokeAt).filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo')
    expect(path).toEqual([
      ['moveTo', 40, 55],
      ['lineTo', 40, 65],
      ['lineTo', 30, 65],
      ['lineTo', 30, 55],
    ])
    expect(calls).toContainEqual(['set:globalAlpha', 0.5])
    expect(calls).toContainEqual(['set:fillStyle', DARK_PALETTE.shade2])
  })

  it('文字は太さ・px・system-ui のフォントで中心に置く', () => {
    const { ctx, calls } = recorder()
    flush(ctx, [cmds[3] as DrawCommand], { regions: rg, width: 100, height: 80, dpr: 1 })
    expect(calls).toContainEqual(['set:font', '700 36.4px system-ui, sans-serif'])
    expect(calls).toContainEqual(['set:textAlign', 'center'])
    expect(calls).toContainEqual(['set:textBaseline', 'middle'])
    expect(calls).toContainEqual(['fillText', 'よい', 50, 20])
  })

  it('パレットは全部の色の名前を持つ', () => {
    expect(Object.keys(DARK_PALETTE)).toHaveLength(24)
  })
})
