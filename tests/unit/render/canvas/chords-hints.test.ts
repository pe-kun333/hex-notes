import { describe, expect, it } from 'vitest'
import { keyPosition } from '../../../../src/layout/presets.ts'
import type { HexPos } from '../../../../src/render/hex/hex.ts'
import type { FrameNote } from '../../../../src/render/canvas/cells.ts'
import { placeNote } from '../../../../src/render/canvas/cells.ts'
import {
  chordShapes,
  components,
  convexHull,
  isConnected,
  sharedEdges,
} from '../../../../src/render/canvas/chords.ts'
import {
  HINT_LEAD_MS,
  hintCommands,
  hintPairs,
  hintTargets,
} from '../../../../src/render/canvas/hints.ts'
import { regionsOf } from '../../../../src/render/canvas/primitives.ts'
import { setup } from './frame-setup.ts'

// src/render/canvas/chords.ts・hints.ts。出どころ: 台帳 手順 6（isConnected [A,S,D] true）、相談 B（[A,D] false・
// [A,W] true）、m1' isConnected L273・nextTargets L389、m2 components L327–328・hull L329–331、design.md §2.2、
// decisions #31（仮）。

const pos = (code: string): HexPos => {
  const p = keyPosition(code)
  if (!p) throw new Error(code)
  return p
}

function note(
  index: number,
  code: string,
  midi: number,
  tLandMs: number,
  group = tLandMs,
): FrameNote {
  return { index, code, midi, tLandMs, tEndMs: tLandMs + 300, hold: false, group, state: 'pending' }
}

describe("isConnected（m1' L273）", () => {
  it('[A,S,D] true（台帳）、[A,D] false、[A,W] true（相談 B）', () => {
    expect(isConnected(['KeyA', 'KeyS', 'KeyD'].map(pos))).toBe(true)
    expect(isConnected(['KeyA', 'KeyD'].map(pos))).toBe(false)
    expect(isConnected(['KeyA', 'KeyW'].map(pos))).toBe(true)
  })
  it('1 つは false（和音でない）。順序に依らない（[A,D,S] も true）', () => {
    expect(isConnected([pos('KeyA')])).toBe(false)
    expect(isConnected(['KeyA', 'KeyD', 'KeyS'].map(pos))).toBe(true)
  })
})

describe('components（m2 L327–328）', () => {
  it('A・S と L は 2 成分、A・W・S は 1 成分', () => {
    const lens = (codes: string[]): number[] =>
      components(codes, keyPosition)
        .map((c) => c.length)
        .sort()
    expect(lens(['KeyA', 'KeyS', 'KeyL'])).toEqual([1, 2])
    expect(lens(['KeyA', 'KeyW', 'KeyS'])).toEqual([3])
  })
})

describe('convexHull（m2 L329–331）', () => {
  it('正方形の中の点と辺の上の点を落とす', () => {
    const h = convexHull([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [1, 1],
      [1, 0],
    ])
    expect(h).toHaveLength(4)
    expect(h).toEqual(
      expect.arrayContaining([
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ]),
    )
  })
})

describe('塊と殻（§2.2、decisions #31）', () => {
  const s = setup('canon', 'ableton/2/octave')
  const byPos = (q: HexPos): string | null =>
    s.grid.cells.find((c) => c.row === q.row && c.col === q.col)?.code ?? null
  const place = (n: FrameNote) => {
    const p = placeNote(n, s.grid, 'cell', s.sizing.v, 0, s.sizing.fallTop, true)
    if (!p) throw new Error('見えない')
    return p
  }

  it('A・S の塊: A の右の辺（辺 0）と S の左の辺（辺 3）を消す', () => {
    const a = place(note(0, 'KeyA', 60, 500, 1))
    const b = place(note(1, 'KeyS', 62, 500, 1))
    expect(sharedEdges(a, new Set(['KeyA', 'KeyS']), byPos)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
    ])
    expect(sharedEdges(b, new Set(['KeyA', 'KeyS']), byPos)).toEqual([
      true,
      true,
      true,
      false,
      true,
      true,
    ])
    const shapes = chordShapes([a, b], byPos, s.sizing.fallTop, true)
    expect(shapes.hulls).toHaveLength(0)
    expect(shapes.edges.get(0)).toEqual([false, true, true, true, true, true])
  })

  it('黒鍵（30° 回したセル）は辺を消さない: A・W の W は全部の辺を描く', () => {
    const w = place(note(1, 'KeyW', 61, 500, 1))
    expect(sharedEdges(w, new Set(['KeyA', 'KeyW']), byPos)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ])
  })

  it('A・D はつながらない → 殻 1 つ（実線 1.5 px・35%、塗らない）。shells false なら出さない', () => {
    const a = place(note(0, 'KeyA', 60, 500, 1))
    const d = place(note(1, 'KeyD', 64, 500, 1))
    const shapes = chordShapes([a, d], byPos, s.sizing.fallTop, true)
    expect(shapes.hulls).toHaveLength(1)
    expect(shapes.hulls[0]).toMatchObject({ tag: 'hull', stroke: 'hull', width: 1.5, alpha: 0.35 })
    expect(shapes.hulls[0]?.fill).toBeUndefined()
    expect(chordShapes([a, d], byPos, s.sizing.fallTop, false).hulls).toHaveLength(0)
  })
})

describe("辺ヒント（§2.2、m1' nextTargets）", () => {
  const s = setup('twinkle', 'ableton/2/octave')
  const keys = regionsOf(s.sizing).keys

  it('目標の着地まで 1,500 ms ちょうどで出し、1,501 ms では出さない', () => {
    const ns = [note(0, 'KeyA', 60, 1500), note(1, 'KeyG', 67, 2000)]
    expect(hintTargets(ns, 0)).not.toBeNull()
    expect(hintTargets(ns, -1)).toBeNull()
    expect(HINT_LEAD_MS).toBe(1500)
  })

  it('同じ鍵の続きは飛ばし、違う鍵の次の音へ（A→A→G は A→G）', () => {
    const t = hintTargets(
      [note(0, 'KeyA', 60, 100), note(1, 'KeyA', 60, 600), note(2, 'KeyG', 67, 1100)],
      0,
    )
    expect(t?.from.map((n) => n.code)).toEqual(['KeyA'])
    expect(t?.to.map((n) => n.code)).toEqual(['KeyG'])
  })

  it('六角距離 1 は線だけ、≥2 は数字も（A→S は 1、A→G は 4）。線は 3 px・明度（hint）・round', () => {
    const near = hintCommands(
      hintPairs({ from: [note(0, 'KeyA', 60, 0)], to: [note(1, 'KeyS', 62, 500)] }, s.grid),
      s.grid,
      'cell',
      true,
      keys,
    )
    expect(near.lines).toHaveLength(1)
    expect(near.lines[0]).toMatchObject({ tag: 'hint', stroke: 'hint', width: 3, cap: 'round' })
    expect(near.digits).toHaveLength(0)
    const far = hintCommands(
      hintPairs({ from: [note(0, 'KeyA', 60, 0)], to: [note(1, 'KeyG', 67, 500)] }, s.grid),
      s.grid,
      'cell',
      true,
      keys,
    )
    expect(far.digits.map((d) => d.text)).toEqual(['4'])
  })

  it('和音は最大 2 辺。to を高い音から見て、各々に最も近い from の鍵（同じ距離は高い音）。同じ辺は 1 回', () => {
    const t = {
      from: [note(0, 'KeyA', 60, 0, 1), note(1, 'KeyD', 64, 0, 1)],
      to: [note(2, 'KeyS', 62, 500, 2), note(3, 'KeyF', 65, 500, 2), note(4, 'KeyH', 69, 500, 2)],
    }
    // H（69）← D（距離 3、右の辺）。F（65）← D も右の辺なので出さない。S（62）← D と A が距離 1 で同点 → 高い D、左の辺
    const pairs = hintPairs(t, s.grid)
    expect(pairs.map((p) => `${p.from.code}>${p.to.code}`)).toEqual(['KeyD>KeyH', 'KeyD>KeyS'])
  })
})
