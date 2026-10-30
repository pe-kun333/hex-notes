// 辺ヒント（M0-03b、手順 6）。出どころ: design.md §2.2「入門者のみ、鍵盤図の目標セルに着地まで ≤1.5 s のとき次の目標へ
// 最も近い辺を 3 px 明度で、六角距離 ≥2 なら数字、和音は最大 2 辺」、m1-geometry nextTargets L389・drawCell L398–400
// （手直し: 白 4 px → 3 px 明度）、edgeToward L381。decisions #31（和音の 2 辺の選び方、仮）。純関数。

import type { GridCell, KeyboardGrid } from '../hex/grid.ts'
import { edgeToward, hexDist, rotationOf } from '../hex/hex.ts'
import type { LandingMode } from '../hex/landing.ts'
import type { FrameNote } from './cells.ts'
import { CELL_SCALE, cellVertices, drawRadius } from './cells.ts'
import type { LineCmd, Rect, TextCmd } from './primitives.ts'
import { textWidthEm } from './primitives.ts'

/** 目標の着地まで何 ms 以内でヒントを出すか（§2.2） */
export const HINT_LEAD_MS = 1500
/** ヒントの線の幅 px（§2.2「3 px 明度」） */
export const HINT_WIDTH = 3
/** 和音で出す辺の最大数 */
export const HINT_MAX_EDGES = 2
/** 数字を出す六角距離の下限 */
export const HINT_DIGIT_MIN_DIST = 2

export type HintTargets = {
  /** 今の目標（着地の早い pending の音の和音） */
  readonly from: readonly FrameNote[]
  /** 次の目標（from と違う鍵を含む次の和音の、from に無い鍵の音） */
  readonly to: readonly FrameNote[]
}

/**
 * 今の目標と次の目標（m1' nextTargets を和音へ広げた物）。pending の音を着地の順に見て、最初の音の和音を from、
 * from の鍵に無い鍵を持つ次の和音を to にする。from の着地まで HINT_LEAD_MS より先なら null。
 */
export function hintTargets(notes: readonly FrameNote[], tSong: number): HintTargets | null {
  const pending = notes
    .filter((n) => n.state === 'pending')
    .sort((a, b) => a.tLandMs - b.tLandMs || a.index - b.index)
  const first = pending[0]
  if (first === undefined || first.tLandMs - tSong > HINT_LEAD_MS) return null
  const from = pending.filter((n) => n.group === first.group)
  const fromCodes = new Set(from.map((n) => n.code))
  const next = pending.find((n) => n.group !== first.group && !fromCodes.has(n.code))
  if (next === undefined) return null
  const to = pending.filter((n) => n.group === next.group && !fromCodes.has(n.code))
  return { from, to }
}

/**
 * ヒントの組（from の鍵 → to の鍵）。to を高い音から最大 2 つ取り、それぞれに六角距離が最も近い from の鍵を当てる
 * （同じ距離なら高い音）。同じ辺が 2 回出るときは 1 回にする。
 */
export function hintPairs(t: HintTargets, grid: KeyboardGrid): { from: GridCell; to: GridCell }[] {
  const cellOf = (n: FrameNote): GridCell | null => grid.byCode.get(n.code) ?? null
  const fromCells = [...t.from]
    .sort((a, b) => b.midi - a.midi || a.index - b.index)
    .map(cellOf)
    .filter((c): c is GridCell => c !== null)
  const toCells = [...t.to]
    .sort((a, b) => b.midi - a.midi || a.index - b.index)
    .map(cellOf)
    .filter((c): c is GridCell => c !== null)
  const out: { from: GridCell; to: GridCell }[] = []
  const seen = new Set<string>()
  for (const to of toCells) {
    if (out.length >= HINT_MAX_EDGES) break
    let best: GridCell | null = null
    let bd = Number.POSITIVE_INFINITY
    for (const f of fromCells) {
      const d = hexDist(f, to)
      if (d < bd) {
        bd = d
        best = f
      }
    }
    if (best === null || best.code === to.code) continue
    const e = edgeToward(best.cx, best.cy, to.cx, to.cy, rotationOf(best.midi))
    const key = `${best.code}:${e.i}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ from: best, to })
  }
  return out
}

function clampInto(x: number, y: number, hw: number, hh: number, r: Rect): [number, number] {
  return [
    Math.min(Math.max(x, r.x + hw), r.x + r.w - hw),
    Math.min(Math.max(y, r.y + hh), r.y + r.h - hh),
  ]
}

/**
 * 辺ヒントのコマンド。鍵盤図の from のセルの辺（描く径の頂点 i → i+1）を 3 px で引き、六角距離 ≥2 なら数字（0.6·r 太字）を
 * 辺の中点から外へ 0.5·r の所に置く（鍵盤図の矩形の中へ寄せる）。線を先に、数字を後に並べる。
 */
export function hintCommands(
  pairs: readonly { from: GridCell; to: GridCell }[],
  grid: KeyboardGrid,
  mode: LandingMode,
  depth: boolean,
  keys: Rect,
): { lines: LineCmd[]; digits: TextCmd[] } {
  const lines: LineCmd[] = []
  const digits: TextCmd[] = []
  for (const { from, to } of pairs) {
    const r = drawRadius(grid, from, mode, CELL_SCALE, depth)
    const rot = rotationOf(from.midi)
    const v = cellVertices(from.cx, from.cy, r, from.midi)
    const e = edgeToward(from.cx, from.cy, to.cx, to.cy, rot)
    const a = v[e.i]
    const b = v[(e.i + 1) % 6]
    if (a === undefined || b === undefined) continue
    lines.push({
      kind: 'line',
      layer: 'hints',
      region: 'keys',
      tag: 'hint',
      pts: [a, b],
      stroke: 'hint',
      width: HINT_WIDTH,
      cap: 'round',
    })
    const d = hexDist(from, to)
    if (d < HINT_DIGIT_MIN_DIST) continue
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    const ang = Math.atan2(my - from.cy, mx - from.cx)
    const px = 0.6 * r
    const s = String(d)
    const [x, y] = clampInto(
      mx + Math.cos(ang) * r * 0.5,
      my + Math.sin(ang) * r * 0.5,
      (px * textWidthEm(s)) / 2,
      px / 2,
      keys,
    )
    digits.push({
      kind: 'text',
      layer: 'hints',
      region: 'keys',
      tag: 'hintDigit',
      x,
      y,
      text: s,
      px,
      weight: 700,
      paint: 'hint',
    })
  }
  return { lines, digits }
}
