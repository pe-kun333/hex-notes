// 和音の塊と殻（M0-03b、手順 6）。出どころ: design.md §2.2「同じ拍の構成音が六角距離 1 で全連結なら共有辺を消す、
// 否なら凸包 1.5 px・35%」、m1-geometry isConnected L273・drawNotes L410–420、m2-layout-explorer components L327–328・
// hull L329–331（そのまま）、塊／殻 L353–362（手直し: 破線 → 実線、色で上書き → 共有辺を消す）。decisions #31（仮）。
// 純関数。DOM・Canvas に触れない。

import type { KeyCode } from '../../shared/types.ts'
import type { HexPos } from '../hex/hex.ts'
import { HEX_DIRS, hexDist, hexNeighbor } from '../hex/hex.ts'
import type { NotePlace } from './cells.ts'
import type { PolyCmd, Pt } from './primitives.ts'
import { clipPolyTop } from './primitives.ts'

/** 殻の線の幅 px と不透明度（§2.2） */
export const HULL_WIDTH = 1.5
export const HULL_ALPHA = 0.35

/** 構成音の鍵が六角距離 1 の隣接で全部つながるか（m1' isConnected L273。2 つ未満は false） */
export function isConnected(keys: readonly HexPos[]): boolean {
  if (keys.length < 2) return false
  const seen = new Set<number>([0])
  const stack = [0]
  while (stack.length > 0) {
    const a = stack.pop()
    if (a === undefined) break
    const ka = keys[a]
    if (ka === undefined) continue
    keys.forEach((k, i) => {
      if (!seen.has(i) && hexDist(ka, k) === 1) {
        seen.add(i)
        stack.push(i)
      }
    })
  }
  return seen.size === keys.length
}

/** 鍵の集合を隣接でつながる成分に分ける（m2 components L327–328）。pos は code → 段・列 */
export function components(
  codes: Iterable<KeyCode>,
  pos: (code: KeyCode) => HexPos | null,
): KeyCode[][] {
  const set = new Set(codes)
  const byPos = new Map<string, KeyCode>()
  for (const c of set) {
    const p = pos(c)
    if (p) byPos.set(`${p.row},${p.col}`, c)
  }
  const seen = new Set<KeyCode>()
  const comps: KeyCode[][] = []
  for (const code of set) {
    if (seen.has(code)) continue
    const comp: KeyCode[] = []
    const st = [code]
    seen.add(code)
    while (st.length > 0) {
      const c = st.pop()
      if (c === undefined) break
      comp.push(c)
      const p = pos(c)
      if (!p) continue
      for (const d of HEX_DIRS) {
        const q = hexNeighbor(p, d)
        const n = byPos.get(`${q.row},${q.col}`)
        if (n !== undefined && !seen.has(n)) {
          seen.add(n)
          st.push(n)
        }
      }
    }
    comps.push(comp)
  }
  return comps
}

/** 凸包（m2 hull L329–331、単調鎖。共線の点は落とす。3 点未満はそのまま） */
export function convexHull(input: readonly Pt[]): Pt[] {
  const pts = [...input].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: Pt, a: Pt, b: Pt): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: Pt[] = []
  for (const p of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2] as Pt, lo[lo.length - 1] as Pt, p) <= 0)
      lo.pop()
    lo.push(p)
  }
  const up: Pt[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as Pt
    while (up.length >= 2 && cross(up[up.length - 2] as Pt, up[up.length - 1] as Pt, p) <= 0)
      up.pop()
    up.push(p)
  }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}

/**
 * 塊の共有辺。白鍵（回していないセル）の辺 i は HEX_DIRS[i] の隣を向くので、その隣が同じ和音の構成音なら辺を消す
 * （false）。黒鍵（30° 回したセル）は頂点が隣を向き辺が重ならないので、辺を消さない（仮、decisions #31）。
 */
export function sharedEdges(
  p: NotePlace,
  mates: ReadonlySet<KeyCode>,
  byPos: (q: HexPos) => KeyCode | null,
): boolean[] {
  const edges = [true, true, true, true, true, true]
  if (p.rot !== 0) return edges
  HEX_DIRS.forEach((d, i) => {
    const n = byPos(hexNeighbor(p.cell, d))
    if (n !== null && mates.has(n)) edges[i] = false
  })
  return edges
}

export type ChordShapes = {
  /** 塊の構成音ごとの辺の表示（index → edges） */
  readonly edges: ReadonlyMap<number, readonly boolean[]>
  /** 殻（つながらない和音の凸包） */
  readonly hulls: PolyCmd[]
}

/**
 * 見えている pending の音を和音（同じ group）ごとにまとめ、2 つ以上なら塊か殻にする。塊は共有辺を消し、
 * 殻は構成音の頂点の凸包を 1.5 px・35% の実線で囲む（塗らない。上端で切る）。shells false は殻を出さない（低負荷の段 2）。
 */
export function chordShapes(
  places: readonly NotePlace[],
  byPos: (q: HexPos) => KeyCode | null,
  fallTop: number,
  shells: boolean,
): ChordShapes {
  const groups = new Map<number, NotePlace[]>()
  for (const p of places) {
    if (p.note.state !== 'pending') continue
    const g = groups.get(p.note.group)
    if (g) g.push(p)
    else groups.set(p.note.group, [p])
  }
  const edges = new Map<number, readonly boolean[]>()
  const hulls: PolyCmd[] = []
  for (const members of [...groups.values()].sort(
    (a, b) => (b[0]?.note.tLandMs ?? 0) - (a[0]?.note.tLandMs ?? 0),
  )) {
    if (members.length < 2) continue
    if (isConnected(members.map((m) => m.cell))) {
      const codes = new Set(members.map((m) => m.note.code))
      for (const m of members) {
        const e = sharedEdges(m, codes, byPos)
        if (e.some((x) => !x)) edges.set(m.note.index, e)
      }
    } else if (shells) {
      const hull = convexHull(members.flatMap((m) => m.pts))
      const clipped = clipPolyTop(hull, fallTop + HULL_WIDTH / 2)
      if (clipped.pts.length >= 3)
        hulls.push({
          kind: 'poly',
          layer: 'notes',
          region: 'stage',
          tag: 'hull',
          pts: clipped.pts,
          stroke: 'hull',
          width: HULL_WIDTH,
          alpha: HULL_ALPHA,
          ...(clipped.edges !== undefined && clipped.edges.some((x) => !x)
            ? { edges: clipped.edges }
            : {}),
        })
    }
  }
  return { edges, hulls }
}
