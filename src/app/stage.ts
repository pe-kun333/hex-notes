// S2 の箱（M1-03、M1 の手順 3）。出どころ: design.md §2.5（右列の箱と R・v）、decisions #24（sizeForViewport。R が足りなければ
// プレイヤーを 356×200 に縮めて 1 回だけ組み直す）、m1-kickoff 手順 3 の期待値（3 視口の R・v・最下段の可視時間）・§7-3（動画
// なし形態もプレイヤーの既定 480×270 の箱、仮）、play-dev relayout L350–397（canvas が箱を覆うので箱の原点を 0 にして組む）。
// 純関数（DOM は screens/play.ts）。

import {
  computeSizing,
  sizeForViewport,
  type ColumnBox,
  type Size,
  type Sizing,
} from '../render/hex/sizing.ts'

export interface Stage {
  /** 視口の中の箱（右列の位置と寸法。canvas の要素をここに置く） */
  readonly box: ColumnBox
  /** 使うプレイヤー矩形（左列の幅と矩形の高さ） */
  readonly player: Size
  /** canvas の座標（箱の左上が原点）で組んだ sizing */
  readonly sizing: Sizing
}

/**
 * 視口から S2 の箱を組む。R・v・流れる時間は箱の幅と高さだけで決まるので、原点に移しても sizeForViewport と同じ。
 * 箱が R 24 の鍵盤図より低ければ RangeError（呼ぶ側は描かずに知らせる。decisions #24 (e)）
 */
export function stageOf(viewport: Size, rowsUsed: readonly number[], travelMs: number): Stage {
  const outer = sizeForViewport(viewport, rowsUsed, travelMs)
  const b = outer.box
  return {
    box: b,
    player: outer.player,
    sizing: computeSizing(
      { left: 0, top: 0, width: b.width, height: b.height },
      rowsUsed,
      travelMs,
      outer.player,
    ),
  }
}
