// 着地（M0-03a、手順 4）。出どころ: decisions #3（段別着地＋奥行きを既定、一本線は対照）、design.md §2.2（奥行き係数:
// 最下段 1.0、1 段ごと ×0.96、下限 max(0.88, 24/R)）、§2.5（段別着地のセルは y ＝ 段の中心 − v·(着地時刻 − 今)。
// 箱の上端で切れる。奥行きは描く径にだけ掛ける）、m0 yLine L238（LINE_GAP 0.8）、m1' targetY L376・rowScale L377・
// DEPTH_SCALE L211。グローバル状態を持たない。時刻は ms。

import type { GridCell, KeyboardGrid } from './grid.ts'

/** 着地の方式。cell ＝ 段別（セルが自分の鍵に重なった瞬間が押し時、既定）、line ＝ 一本線（対照オプション） */
export type LandingMode = 'cell' | 'line'
export const DEFAULT_LANDING: LandingMode = 'cell'

/** 一本線と鍵盤図の上端の隙間（R 単位。m0 LINE_GAP L196、m1' yLine L373） */
export const LINE_GAP = 0.8
/** 奥行き: 1 段上がるごとの倍率と下限（§2.2） */
export const DEPTH_STEP = 0.96
export const DEPTH_FLOOR = 0.88
/** セル径の最小 px（奥行きで縮んでもこれを割らない。§2.2 の 24/R） */
export const DEPTH_MIN_PX = 24

/** 一本線の y（鍵盤図の上端から 0.8·R 上） */
export function lineY(grid: Pick<KeyboardGrid, 'top' | 'R'>): number {
  return grid.top - LINE_GAP * grid.R
}

/** 着地の y。cell なら鍵のセル中心、line なら一本線 */
export function targetY(
  mode: LandingMode,
  cell: Pick<GridCell, 'cy'>,
  grid: Pick<KeyboardGrid, 'top' | 'R'>,
): number {
  return mode === 'cell' ? cell.cy : lineY(grid)
}

/**
 * 奥行きの係数（描く径に掛ける。鍵盤図の寸法 k_n・段の中心には掛けない）。
 * 最下段から k 段上で 0.96^k、下限は max(0.88, 24/R)。R ≤ 24 では下限 1 になり奥行きは消える。
 */
export function depthScale(stepsAboveBottom: number, R: number): number {
  if (!Number.isInteger(stepsAboveBottom) || stepsAboveBottom < 0)
    throw new RangeError(`landing: 段数 ${stepsAboveBottom} は 0 以上の整数でない`)
  if (!(R > 0)) throw new RangeError(`landing: R ${R} は正の数でない`)
  const floor = Math.max(DEPTH_FLOOR, DEPTH_MIN_PX / R)
  return Math.max(DEPTH_STEP ** stepsAboveBottom, Math.min(1, floor))
}

/** 方式を見た係数。一本線では奥行きを付けない（m1' rowScale L377） */
export function rowScale(
  mode: LandingMode,
  cell: Pick<GridCell, 'stepsAboveBottom'>,
  R: number,
): number {
  return mode === 'cell' ? depthScale(cell.stepsAboveBottom, R) : 1
}

/**
 * 落下中のセルの y。着地時刻 tLandMs、今 tNowMs、流速 v px/ms。全段同じ v・同じ時間写像で、
 * y ＝ 着地 y − v·(tLand − tNow)。着地の後（tNow > tLand）は着地 y より下へ進む（判定層が消す）。
 */
export function noteY(landingY: number, tLandMs: number, tNowMs: number, v: number): number {
  return landingY - v * (tLandMs - tNowMs)
}

/**
 * セルが落下域に現れているか（箱の上端で切れる）。中心 y ＋ 描く径 が fallTop より下なら見える。
 * 一本線では着地 y を越えても見せる判断は判定層のもので、ここは上端だけを見る。
 */
export function isVisible(y: number, drawR: number, fallTop: number): boolean {
  return y + drawR > fallTop
}
