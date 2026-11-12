// S2 の配置モデル（M3 の手順 3、M3-01 後半＋M3-02、仮。m3-kickoff 手順 3・§7-20・§7-21）。出どころ: m0 `computeGeom` の split
// L223–225（矩形・左列・右列の箱）、design §1.3 S2 L79・§2.5 L129–130・§2.9 L149、decisions #24 (e)・#65 (b)。
// 視口座標の矩形（プレイヤー）・左列・canvas の箱を Box で返す純関数と、左列の縦の予算（子の高さを入力で受ける。行高の定数は
// 持たない）、寸法の注記、矩形の 5 点。dev の assert（shell.ts の checkLayout）が実 DOM と突き合わせ、試験が全視口に掃く。
// 「半分超が可視」は切る関数を作らない（実行時は実物の口が host の矩形を手順 1 の述語 youtube/visible.ts へ渡す）。

import { PAD, type Size, type Sizing } from '../render/hex/sizing.ts'
import type { Box } from './bands.ts'
import type { Stage } from './stage.ts'

/** 左列の子の間（styles.css の `.play .left` の gap） */
export const COLUMN_GAP = 8
/** 帯の間（styles.css の `.bands` の gap） */
export const BAND_GAP = 6

export interface Placement {
  /** プレイヤー矩形 {PAD, PAD, PAD＋w, PAD＋h} */
  readonly player: Box
  /** 左列（矩形と同じ幅で、視口の下端 − PAD まで） */
  readonly left: Box
  /** canvas（右列の箱 Stage.box） */
  readonly canvas: Box
}

/** 視口と箱から配置を出す（stageOf の値を視口座標の Box に写すだけ） */
export function placementOf(viewport: Size, stage: Pick<Stage, 'box' | 'player'>): Placement {
  const p = stage.player
  const b = stage.box
  return {
    player: { left: PAD, top: PAD, right: PAD + p.w, bottom: PAD + p.h },
    left: { left: PAD, top: PAD, right: PAD + p.w, bottom: viewport.h - PAD },
    canvas: { left: b.left, top: b.top, right: b.left + b.width, bottom: b.top + b.height },
  }
}

export interface ColumnRows {
  /** 子ごとの矩形（上から。帯の欄は含まない） */
  readonly rows: readonly Box[]
  /** 帯の欄（最後の子の下から左列の下端まで。溢れていれば高さ 0） */
  readonly bands: Box
  /** 帯の欄の高さ（px。負なら子だけで溢れている） */
  readonly rest: number
  readonly overflow: boolean
}

/**
 * 左列の縦の予算。子（矩形・HUD・案内の行など、帯の欄より上の見えている物）の高さを上から並べ、最後に帯の欄（flex 1）を
 * 置く。子どうしと帯の欄の前に gap
 */
export function columnRows(column: Box, heights: readonly number[], gap = COLUMN_GAP): ColumnRows {
  let y = column.top
  const rows: Box[] = []
  for (const h of heights) {
    rows.push({ left: column.left, top: y, right: column.right, bottom: y + h })
    y += h + gap
  }
  const rest = column.bottom - y
  return {
    rows,
    bands: { left: column.left, top: y, right: column.right, bottom: y + Math.max(0, rest) },
    rest,
    overflow: rest < 0,
  }
}

/** 帯の欄に全部見える帯の本数（上から。帯どうしの間に gap） */
export function bandsFit(rest: number, heights: readonly number[], gap = BAND_GAP): number {
  let used = 0
  let n = 0
  for (const h of heights) {
    const next = used + (n > 0 ? gap : 0) + h
    if (next > rest) break
    used = next
    n++
  }
  return n
}

/** 寸法の注記の文（仮。m3-kickoff 手順 3） */
export const SIZE_NOTE_CUT = '鍵盤図の端が切れています'
export const SIZE_NOTE_SLOW = '流れる時間を短くしています'

/**
 * 寸法の注記（案内の行の下の、折り返してよい行）。鍵盤図の幅が箱の幅を超える（左右が canvas の外）なら切れの文、流れる
 * 時間が travelMs より短い（limited 'height' で v_min を割った）なら流れる時間の文、両方なら前者、どちらも無ければ null。
 * 溝を食うだけ（limited 'width' で kbW ≤ 箱の幅）は注記しない
 */
export function sizeNote(
  s: Pick<Sizing, 'kbW' | 'box' | 'travelMs'>,
  travelMs: number,
): string | null {
  if (s.kbW > s.box.width) return SIZE_NOTE_CUT
  if (s.travelMs < travelMs) return SIZE_NOTE_SLOW
  return null
}

export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * 矩形の 5 点（四隅の 1 px 内側と中心）のうち視口の中の点（dev の assert が elementsFromPoint で先頭を見る。視口の外の点は
 * 空の配列が返るので見ない）。角が丸い矩形（動画なしのカード、角丸 8 px）は当たりの判定が丸みを除くので、inset に角の半径を
 * 渡して隅の点を内へ寄せる（動画ありの矩形は角丸なしで 1 px）
 */
export function playerPoints(player: Box, viewport: Size, inset = 1): Point[] {
  const d = Math.max(1, inset)
  const pts: Point[] = [
    { x: player.left + d, y: player.top + d },
    { x: player.right - d, y: player.top + d },
    { x: player.left + d, y: player.bottom - d },
    { x: player.right - d, y: player.bottom - d },
    { x: (player.left + player.right) / 2, y: (player.top + player.bottom) / 2 },
  ]
  return pts.filter((p) => p.x >= 0 && p.y >= 0 && p.x < viewport.w && p.y < viewport.h)
}
