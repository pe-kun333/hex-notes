// 六角格子の純粋な幾何（M0-03a、手順 4）。出どころ: docs/design.md §2.2、m0-layout hexDist L169・ROW_OFF L163、
// m2-layout-explorer DIRS L231–238、m1-geometry rotOf L378。
// ここは数式だけ。DOM・Canvas に触れず、配列や譜面の型にも依存しない（tools/ からも import できる）。
//
// 座標系: 鍵は (row, col) の軸座標で表す。row は KEY_ROWS の添字（0 が数字段、下へ増える）、col は段の中の左からの
// 位置。段ごとに右へ 1/2 セルずれる pointy-top 格子なので、(row, col) をそのまま六角の軸座標 (r, q) として扱える
// （3 つ目の座標は −(q + r)）。六角距離はこの 3 座標の絶対値の和の半分。

export const SQ3 = Math.sqrt(3)

/** 六角の軸座標（鍵の段と列） */
export type HexPos = { readonly row: number; readonly col: number }

/** 六角距離（m0 hexDist L169。tools/charts/m5-port.ts の写しと同じ式。試験で突き合わせる） */
export function hexDist(a: HexPos, b: HexPos): number {
  const dq = a.col - b.col
  const dr = a.row - b.row
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

/** 6 方向の id。辺の順（pointy-top、頂点 i は角度 −30°+60°i）＝ 右・右下・左下・左・左上・右上（m2 DIRS） */
export type HexDirId = 'R' | 'DR' | 'DL' | 'L' | 'UL' | 'UR'

export type HexDir = { readonly id: HexDirId; readonly dr: number; readonly dc: number }

/** 6 方向。添字 i の方向は、頂点 i と頂点 i+1 を結ぶ辺の向き（辺の中点の方向） */
export const HEX_DIRS: readonly HexDir[] = [
  { id: 'R', dr: 0, dc: 1 },
  { id: 'DR', dr: 1, dc: 0 },
  { id: 'DL', dr: 1, dc: -1 },
  { id: 'L', dr: 0, dc: -1 },
  { id: 'UL', dr: -1, dc: 0 },
  { id: 'UR', dr: -1, dc: 1 },
]

/** 方向 dir の隣の軸座標（鍵の表の中にあるかは見ない） */
export function hexNeighbor(p: HexPos, dir: HexDir): HexPos {
  return { row: p.row + dir.dr, col: p.col + dir.dc }
}

/** 六角距離 1 か */
export function isAdjacent(a: HexPos, b: HexPos): boolean {
  return hexDist(a, b) === 1
}

/** 段ごとの右へのずれ（セル幅 √3·R 単位。m0 ROW_OFF L163。正六角格子＝1/2 ずれ、decisions #2） */
export const ROW_OFF: readonly number[] = [0, 0.5, 1.0, 1.5]

/** 格子上の x（セル幅単位）。段のずれ＋列 */
export function gridX(p: HexPos): number {
  const off = ROW_OFF[p.row]
  if (off === undefined) throw new RangeError(`hex: 段 ${p.row} は 0〜3 の外`)
  return off + p.col
}

/** 黒鍵（MIDI の音名が ♯）か。黒鍵のセルは 30° 回して描く（§2.2、m1' rotOf） */
export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
}

/** セルの回転角（度）。黒鍵 30、白鍵 0。midi が null（空のキー）は 0 */
export function rotationOf(midi: number | null): 0 | 30 {
  return midi !== null && isBlackKey(midi) ? 30 : 0
}

/** 画面上の点（CSS px）。描画層のコマンドも同じ形を使う */
export type Pt = readonly [number, number]

/**
 * 六角の頂点 6 つ（m1' hexVerts L380）。頂点 i は角度 60·i − 30 + rot 度（画面座標、y は下向き）。
 * rot 0 の辺 i（頂点 i と i+1）は HEX_DIRS[i] の隣を向く。黒鍵（rot 30）は頂点が隣を向く。
 */
export function hexVertices(cx: number, cy: number, r: number, rotDeg: number = 0): Pt[] {
  const v: Pt[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30 + rotDeg)
    v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return v
}

/**
 * (cx, cy) から (tx, ty) へ最も向いた辺の添字（m1' edgeToward L381）。辺 i の中点は角度 60·i + rot 度。
 * off はその辺の向きと目標の向きの角度差（度、0〜30）。差が等しいときは添字の小さい辺。
 */
export function edgeToward(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  rotDeg: number = 0,
): { i: number; off: number } {
  const a = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI
  let best = 0
  let bd = Number.POSITIVE_INFINITY
  for (let i = 0; i < 6; i++) {
    const d = Math.abs(((((a - (60 * i + rotDeg)) % 360) + 540) % 360) - 180)
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return { i: best, off: bd }
}
