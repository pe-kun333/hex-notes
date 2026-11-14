import { describe, expect, it } from 'vitest'
import type { HeatStat } from '../../../../src/results/heat.ts'
import { CELL_SCALE, drawRadius } from '../../../../src/render/canvas/cells.ts'
import {
  HEAT_DROP,
  dotAlpha,
  fanLength,
  heatCellCommands,
  heatCommands,
  maxDirOf,
  ringRadius,
} from '../../../../src/render/canvas/heat.ts'
import type { Pt } from '../../../../src/render/canvas/primitives.ts'
import { buildKeyboardGrid } from '../../../../src/render/hex/grid.ts'
import { hexVertices } from '../../../../src/render/hex/hex.ts'

// src/render/canvas/heat.ts。出どころ: docs/planning/m4-kickoff.md 手順 1 の期待値 (3)・§7-9、m4-practice drawHeat L514–519、
// decisions #120（輪は 0.3〜0.5·r に縮めた）。r は描くセルの径（drawRadius の値をそのまま渡す）。

const stat = (over: Partial<HeatStat> = {}): HeatStat => ({
  dirs: [0, 0, 0, 0, 0, 0],
  other: 0,
  n: 0,
  meanMs: null,
  sdMs: null,
  ...over,
})

describe('寸法（期待値 (3)、式の値）', () => {
  it('r 24: 扇 6〜20.4 px、丸 7.2 px、輪 7.2〜12 px', () => {
    expect(fanLength(24, 0, 1)).toBeCloseTo(6)
    expect(fanLength(24, 3, 3)).toBeCloseTo(20.4)
    expect(fanLength(24, 1, 2)).toBeCloseTo(13.2)
    expect(ringRadius(24, 0)).toBeCloseTo(7.2)
    expect(ringRadius(24, 100)).toBeCloseTo(12)
    expect(ringRadius(24, 250)).toBeCloseTo(12)
    const dot = heatCellCommands(0, 0, 24, stat({ n: 1, meanMs: 5 }), 1).find(
      (c) => c.tag === 'heatDot',
    )
    const r = Math.max(...(dot?.pts ?? []).map(([x, y]) => Math.hypot(x, y - HEAT_DROP * 24)))
    expect(r).toBeCloseTo(7.2)
  })

  it('r 28: 扇 7〜23.8 px、丸 8.4 px、輪 8.4〜14 px', () => {
    expect(fanLength(28, 0, 1)).toBeCloseTo(7)
    expect(fanLength(28, 1, 1)).toBeCloseTo(23.8)
    expect(ringRadius(28, 0)).toBeCloseTo(8.4)
    expect(ringRadius(28, 100)).toBeCloseTo(14)
  })

  it('丸の濃さ: 平均 0 → 0.35、±30 → 0.675、±60 以上 → 1', () => {
    expect(dotAlpha(0)).toBeCloseTo(0.35)
    expect(dotAlpha(-30)).toBeCloseTo(0.675)
    expect(dotAlpha(60)).toBe(1)
    expect(dotAlpha(-200)).toBe(1)
  })
})

/** 凸多角形 poly の内側（辺の上を含む）か */
function inside(poly: readonly Pt[], [x, y]: Pt): boolean {
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i] as Pt
    const [bx, by] = poly[(i + 1) % poly.length] as Pt
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < -1e-6) return false
  }
  return true
}

describe('セルの外へ出ない', () => {
  const full = stat({ dirs: [4, 4, 4, 4, 4, 4], n: 9, meanMs: 80, sdMs: 140 })
  for (const rot of [0, 30] as const)
    for (const r of [24, 26, 28])
      it(`回転 ${rot}°・r ${r}: 扇（最大回数）・丸・輪（SD 100 ms 超）の頂点がセルの六角の内側`, () => {
        const cell = hexVertices(100, 100, r, rot)
        const cmds = heatCellCommands(100, 100, r, full, 4)
        expect(cmds.map((c) => c.tag)).toEqual(['heatFan', 'heatFan', 'heatFan', 'heatFan', 'heatFan', 'heatFan', 'heatDot', 'heatRing'])
        for (const c of cmds) for (const p of c.pts) expect(inside(cell, p)).toBe(true)
      }) // prettier-ignore
})

describe('heatCellCommands の形', () => {
  it('扇は向き d の ±30°（R は右、UL は左上）。回数 0 の向きは描かない', () => {
    const cmds = heatCellCommands(0, 0, 24, stat({ dirs: [2, 0, 0, 0, 1, 0] }), 2)
    expect(cmds.map((c) => c.tag)).toEqual(['heatFan', 'heatFan'])
    const [r, ul] = cmds
    const mid = (pts: readonly Pt[]): Pt => pts[Math.floor(pts.length / 2)] ?? [0, 0]
    const [rx, ry] = mid(r?.pts ?? [])
    expect(rx).toBeCloseTo(20.4)
    expect(ry).toBeCloseTo(0)
    const [ux, uy] = mid(ul?.pts ?? [])
    expect(Math.atan2(uy, ux) * (180 / Math.PI)).toBeCloseTo(-120)
    expect(Math.hypot(ux, uy)).toBeCloseTo(13.2)
    expect(r).toMatchObject({ fill: 'heatMiss', stroke: 'paper', layer: 'keys', region: 'keys' })
  })

  it('早いは heatEarly・遅い（0 を含む）は heatLate。標本 1 つは丸だけ', () => {
    const early = heatCellCommands(0, 0, 24, stat({ n: 1, meanMs: -20 }), 0)
    expect(early).toHaveLength(1)
    expect(early[0]).toMatchObject({ tag: 'heatDot', fill: 'heatEarly' })
    expect(heatCellCommands(0, 0, 24, stat({ n: 2, meanMs: 0, sdMs: 0 }), 0).map((c) => [c.tag, c.fill ?? c.stroke])).toEqual([
      ['heatDot', 'heatLate'],
      ['heatRing', 'heatRing'],
    ])
  }) // prettier-ignore
})

describe('heatCommands（鍵盤図に重ねる）', () => {
  const grid = buildKeyboardGrid('ableton', 26, { left: 0, top: 0 })
  it('stats の鍵のセルだけ、セルの順に。扇の長さは全部の鍵の最大回数で割る', () => {
    const stats = new Map([
      ['KeyF', stat({ dirs: [1, 0, 0, 0, 0, 0] })],
      ['KeyD', stat({ dirs: [4, 0, 0, 0, 0, 0], n: 3, meanMs: 10, sdMs: 20 })],
      ['Space', stat({ dirs: [9, 0, 0, 0, 0, 0] })],
    ])
    expect(maxDirOf(stats)).toBe(9)
    const cmds = heatCommands(grid, stats, { mode: 'cell', depth: true })
    expect(cmds.map((c) => c.tag)).toEqual(['heatFan', 'heatDot', 'heatRing', 'heatFan'])
    const d = grid.byCode.get('KeyD')
    if (d === undefined) throw new Error('KeyD')
    const r = drawRadius(grid, d, 'cell', CELL_SCALE, true)
    const tip = cmds[0]?.pts[1] ?? [0, 0]
    expect(Math.hypot(tip[0] - d.cx, tip[1] - d.cy)).toBeCloseTo(fanLength(r, 4, 9))
  })

  it('stats が空なら何も出さない', () => {
    expect(heatCommands(grid, new Map(), { mode: 'cell', depth: false })).toEqual([])
  })
})
