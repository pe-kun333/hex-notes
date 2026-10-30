import { describe, expect, it } from 'vitest'
import { SQ3, edgeToward, hexVertices, HEX_DIRS } from '../../../../src/render/hex/hex.ts'
import {
  bboxOf,
  canonicalCommand,
  canonicalFrame,
  clipPolyTop,
  edgeRuns,
  inRegion,
  polyArea,
  round2,
  type DrawCommand,
  type Regions,
} from '../../../../src/render/canvas/primitives.ts'

// src/render/canvas/primitives.ts と hex.ts の頂点。出どころ: 相談 B（六角 poly の面積 3√3/2·R² ＝ 2037.08 at R 28、
// スナップショットは 0.01 px 丸め・キー順固定）、m1' hexVerts L380・edgeToward L381、decisions #27（仮）。

describe("hexVertices・edgeToward（m1' L380–381）", () => {
  it('頂点 0 は −30°（右上）、rot 30 で 0°（右）', () => {
    const [v0] = hexVertices(0, 0, 10)
    expect(v0?.[0]).toBeCloseTo(10 * Math.cos(-Math.PI / 6), 12)
    expect(v0?.[1]).toBeCloseTo(-5, 12)
    const [w0] = hexVertices(0, 0, 10, 30)
    expect(w0?.[0]).toBeCloseTo(10, 12)
    expect(w0?.[1]).toBeCloseTo(0, 12)
  })

  it('rot 0 の辺 i は HEX_DIRS[i] の隣を向く（pointy-top、隣の中心は √3·R 先、段は 1.5·R 下）', () => {
    HEX_DIRS.forEach((d, i) => {
      const tx = SQ3 * (d.dc + d.dr / 2)
      const ty = 1.5 * d.dr
      expect(edgeToward(0, 0, tx, ty).i).toBe(i)
    })
  })

  it('rot 30 で真右は辺 0 と辺 5 の境（角度差 30 で同点）→ 添字の小さい 0', () => {
    expect(edgeToward(0, 0, 1, 0, 30)).toEqual({ i: 0, off: 30 })
  })
})

describe('polyArea（靴紐公式）', () => {
  it('六角 R 28 の面積は 3√3/2·R² ＝ 2036.89（相談 B の 2037.08 は計算違い。2.5980762 × 784 ＝ 2036.8918）', () => {
    expect(polyArea(hexVertices(100, 100, 28))).toBeCloseTo(2036.89, 2)
    expect(polyArea(hexVertices(100, 100, 28, 30))).toBeCloseTo((3 * SQ3 * 784) / 2, 9)
  })
})

describe('bboxOf（線の幅の半分を含む）', () => {
  const meta = { layer: 'bg', region: 'fall', tag: 'lane' } as const
  it('縦の線（butt）は横にだけ w/2 張り出す。round なら端も', () => {
    const butt: DrawCommand = {
      ...meta,
      kind: 'line',
      pts: [
        [10, 0],
        [10, 100],
      ],
      stroke: 'lane',
      width: 2,
    }
    expect(bboxOf(butt)).toEqual({ x0: 9, y0: 0, x1: 11, y1: 100 })
    expect(bboxOf({ ...butt, cap: 'round' })).toEqual({ x0: 9, y0: -1, x1: 11, y1: 101 })
  })

  it('折れ線の中の頂点は丸い継ぎ目（半径 w/2）', () => {
    const c: DrawCommand = {
      ...meta,
      kind: 'line',
      pts: [
        [0, 10],
        [10, 0],
        [20, 10],
      ],
      stroke: 'seam',
      width: 2,
    }
    expect(bboxOf(c).y0).toBeCloseTo(-1, 12)
  })

  it('一部の辺だけを描く多角形は、描く辺の並びと塗りの外接矩形', () => {
    const sq: DrawCommand = {
      kind: 'poly',
      layer: 'notes',
      region: 'stage',
      tag: 'note',
      pts: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      stroke: 'noteEdge',
      width: 2,
      edges: [false, true, true, true],
    }
    // 上の辺は描かない → 上には張り出さない（左右の辺の butt の端は y 0 で止まる）
    expect(bboxOf(sq)).toEqual({ x0: -1, y0: 0, x1: 11, y1: 11 })
    expect(bboxOf({ ...sq, edges: undefined })).toEqual({ x0: -1, y0: -1, x1: 11, y1: 11 })
  })

  it('文字は ASCII 0.62 em・それ以外 1 em の見積もりで中心から', () => {
    const t: DrawCommand = {
      kind: 'text',
      layer: 'fx',
      region: 'fall',
      tag: 'judgeText',
      x: 100,
      y: 50,
      text: 'AB',
      px: 10,
      weight: 700,
      paint: 'ink',
    }
    expect(bboxOf(t)).toEqual({ x0: 93.8, y0: 45, x1: 106.2, y1: 55 })
    expect(bboxOf({ ...t, text: 'よい' }).x1).toBe(110)
  })
})

describe('edgeRuns', () => {
  const pts = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const
  it('全部描くなら null、1 辺を消すと 1 本の折れ線（消した辺の後から始まる）', () => {
    expect(edgeRuns(pts, undefined)).toBeNull()
    expect(edgeRuns(pts, [true, true, true, true])).toBeNull()
    expect(edgeRuns(pts, [true, false, true, true])).toEqual([
      [
        [1, 1],
        [0, 1],
        [0, 0],
        [1, 0],
      ],
    ])
  })
  it('2 辺を離して消すと 2 本、全部消すと 0 本', () => {
    expect(edgeRuns(pts, [false, true, false, true])).toEqual([
      [
        [1, 0],
        [1, 1],
      ],
      [
        [0, 1],
        [0, 0],
      ],
    ])
    expect(edgeRuns(pts, [false, false, false, false])).toEqual([])
  })
})

describe('clipPolyTop（上端で切る）', () => {
  const sq = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ] as const
  it('全部が上端より下なら入力のまま', () => {
    expect(clipPolyTop(sq, 0)).toEqual({ pts: sq.map((p) => [...p]), edges: undefined })
  })
  it('上半分を切ると切り口の辺が false', () => {
    const c = clipPolyTop(sq, 4)
    expect(c.pts).toEqual([
      [10, 4],
      [10, 10],
      [0, 10],
      [0, 4],
    ])
    expect(c.edges).toEqual([true, true, true, false])
  })
  it('元の edges の false は切った後も残る', () => {
    const c = clipPolyTop(sq, 4, [true, true, false, true])
    expect(c.edges).toEqual([true, false, true, false])
  })
  it('全部が上なら空', () => {
    expect(clipPolyTop(sq, 11).pts).toEqual([])
  })
})

describe('inRegion（stage は T 字形）', () => {
  const rg: Regions = {
    fall: { x: 0, y: 0, w: 100, h: 50 },
    keys: { x: 20, y: 50, w: 60, h: 30 },
    stageArea: 100 * 50 + 60 * 30,
  }
  it('fall・keys はそれぞれの矩形', () => {
    expect(inRegion({ x0: 0, y0: 0, x1: 100, y1: 50 }, 'fall', rg)).toBe(true)
    expect(inRegion({ x0: 0, y0: 0, x1: 100, y1: 51 }, 'fall', rg)).toBe(false)
    expect(inRegion({ x0: 20, y0: 50, x1: 80, y1: 80 }, 'keys', rg)).toBe(true)
    expect(inRegion({ x0: 19, y0: 50, x1: 80, y1: 80 }, 'keys', rg)).toBe(false)
  })
  it('stage: 鍵盤図の上端をまたぐ物は鍵盤図の幅に収まれば可、はみ出せば不可', () => {
    expect(inRegion({ x0: 30, y0: 40, x1: 70, y1: 60 }, 'stage', rg)).toBe(true)
    expect(inRegion({ x0: 10, y0: 40, x1: 70, y1: 60 }, 'stage', rg)).toBe(false)
    expect(inRegion({ x0: 30, y0: -1, x1: 70, y1: 60 }, 'stage', rg)).toBe(false)
    expect(inRegion({ x0: 30, y0: 40, x1: 70, y1: 81 }, 'stage', rg)).toBe(false)
  })
  it('stage: 鍵盤図が箱より広い（limited width）とき、落下域の高さで箱の外（x < 0）は不可、鍵盤図の高さなら可', () => {
    const wide: Regions = {
      fall: { x: 0, y: 0, w: 100, h: 50 },
      keys: { x: -4, y: 50, w: 108, h: 30 },
      stageArea: 100 * 50 + 108 * 30,
    }
    expect(inRegion({ x0: -3, y0: 10, x1: 5, y1: 20 }, 'stage', wide)).toBe(false)
    expect(inRegion({ x0: -3, y0: 40, x1: 5, y1: 60 }, 'stage', wide)).toBe(false)
    expect(inRegion({ x0: -3, y0: 55, x1: 5, y1: 70 }, 'stage', wide)).toBe(true)
    expect(inRegion({ x0: 1, y0: 40, x1: 5, y1: 60 }, 'stage', wide)).toBe(true)
  })
})

describe('スナップショットの形', () => {
  it('0.01 px に丸め、−0 は 0', () => {
    expect(round2(1.005)).toBe(1)
    expect(round2(-0.001)).toBe(0)
    expect(Object.is(round2(-0.001), -0)).toBe(false)
    expect(round2(2.3456)).toBe(2.35)
  })
  it('キー順は kind・layer・region・tag・alpha の後に種類ごとの順。無い項目は書かない', () => {
    const c: DrawCommand = {
      tag: 'note',
      kind: 'poly',
      width: 1.5,
      stroke: 'noteEdge',
      fill: 'shade2',
      pts: [[1.234, -0.001]],
      region: 'stage',
      layer: 'notes',
      alpha: 0.333,
    }
    expect(canonicalCommand(c)).toBe(
      '{"kind":"poly","layer":"notes","region":"stage","tag":"note","alpha":0.33,"pts":[[1.23,0]],"fill":"shade2","stroke":"noteEdge","width":1.5}',
    )
  })
  it('フレームは JSON の配列で 1 行 1 コマンド', () => {
    const c: DrawCommand = {
      kind: 'text',
      layer: 'keys',
      region: 'keys',
      tag: 'label',
      x: 1,
      y: 2,
      text: 'A',
      px: 26.6,
      weight: 700,
      paint: 'ink',
    }
    const s = canonicalFrame([c, c])
    expect(s.split('\n')).toHaveLength(5)
    expect(JSON.parse(s)).toHaveLength(2)
  })
})
