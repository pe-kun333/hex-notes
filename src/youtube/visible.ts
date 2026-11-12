// プレイヤーの矩形が半分を超えて見えているか（M3 の手順 1、仮）。design §2.9 L149「半分超が可視になるまで再生しない」。
// 口（port.ts）が再開の playVideo の前に見る。矩形・視口・文書の表示は app 層が渡す。DOM に触れない。

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

/** 視口の中に見える面積が矩形の半分を超えるか（ちょうど半分は偽）。文書が非表示なら偽 */
export function moreThanHalfVisible(r: Rect, vp: Viewport, docVisible: boolean): boolean {
  if (!docVisible) return false
  const area = r.width * r.height
  if (!(area > 0)) return false
  const w = Math.max(0, Math.min(r.left + r.width, vp.width) - Math.max(r.left, 0))
  const h = Math.max(0, Math.min(r.top + r.height, vp.height) - Math.max(r.top, 0))
  return w * h > area / 2
}
