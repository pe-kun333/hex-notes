// セル径 R と流速 v（M0-03a、手順 4）。出どころ: docs/design.md §2.5（2026-10-30 改訂）、decisions #24（仮）、
// m0-layout computeGeom L214–239（PAD・GAP・KB_BOTTOM・split の stage、kbTop）、m1-geometry layout L373
// （左右の溝 16）。相談の記録は docs/planning/consult/A-sizing.md。
// 入力は右列の箱（CSS px）。視口からの変換は columnBox。グローバル状態を持たない。DOM に触れない。
//
// 式（単位: CSS px、ms）:
//   c_n ＝ 幅の係数（セル幅単位。2 段 10.5、4 段 11.5）、k_n ＝ 高さの係数（R 単位。3.5、6.5）: grid.ts
//   R_w ＝ (W_col − 32)/(c_n·√3)、R_h ＝ (H_col − 8 − T0·v_min)/k_n、R ＝ clamp(24, 28, ⌊min(R_w, R_h)⌋)
//   D ＝ H_col − 8 − k_n·R（箱の上端から鍵盤図の上端までの落下距離）、v ＝ D/T
// R は T0 ＝ 1500 ms で決め、プロファイル（T 1500／1000）では変えない。v だけが T で変わる。
// 足りないとき（⌊min⌋ < 24）: R_w < 24 ならプレイヤーを 356×200 にして 1 回だけ再計算（split では幅にしか効かない）。
// それでも R_w < 24 なら R 24 で溝を食う（limited 'width'）。R_h < 24 なら R 24・v ＝ v_min に固定し T を D/v_min に
// 縮める（limited 'height'）。両方なら 'height'。
// 境界の比べ方: R_h の整数商は k_n（3.5・6.5）が 2 進で正確なので正確。D は 0.5 px 刻み。v ≥ v_min の判定は
// D ≥ T0·v_min（＝ 300、整数）に置き換える。R_w は √3 を含むので ⌊⌋ の後の整数だけを固定する。

import type { Profile } from '../../shared/types.ts'
import { heightUnits, widthUnits } from './grid.ts'
import { SQ3 } from './hex.ts'

/** 画面の余白（m0 PAD・GAP L195） */
export const PAD = 12
export const GAP = 12
/** 鍵盤図の左右の溝（m1' gutter L373。計 32） */
export const GUTTER_X = 16
/** 鍵盤図の下の余白（m0 KB_BOTTOM L197） */
export const KB_BOTTOM = 8
/** セル径の範囲（decisions 既定値「1080p で 28、最小 24」） */
export const R_MIN = 24
export const R_MAX = 28
/** 流速の下限 px/ms（密度 3.5 音/秒でセルが重ならない下限、仮） */
export const V_MIN = 0.2
/** R を決める基準の流れる時間 ms（入門者の 1.5 s。プロファイルで R を変えない。decisions #24、仮） */
export const T0_MS = 1500
/** 流れる時間 ms（§2.2: 入門者 1.5 s、音ゲー向け 1.0 s） */
export const TRAVEL_MS: Readonly<Record<Profile, number>> = { beginner: 1500, gamer: 1000 }

export type Size = { readonly w: number; readonly h: number }
/** プレイヤー矩形（§1.3 S2: 480×270、下限 356×200） */
export const PLAYER_DEFAULT: Size = { w: 480, h: 270 }
export const PLAYER_MIN: Size = { w: 356, h: 200 }

/** 右列の箱（落下域＋鍵盤図。CSS px） */
export type ColumnBox = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/**
 * 視口（innerWidth × innerHeight、CSS px）とプレイヤー矩形から右列の箱を出す（m0 split L224）。
 * 幅 ＝ 視口幅 − プレイヤー幅 − 36（PAD・GAP・PAD）、高さ ＝ 視口高 − 24（上下の PAD）。小数は floor。
 */
export function columnBox(viewport: Size, player: Size = PLAYER_DEFAULT): ColumnBox {
  return {
    left: PAD + player.w + GAP,
    top: PAD,
    width: Math.floor(viewport.w - player.w - PAD - GAP - PAD),
    height: Math.floor(viewport.h - 2 * PAD),
  }
}

export type Limited = 'width' | 'height' | null

export type Sizing = {
  /** セル径（整数 px、24〜28） */
  readonly R: number
  /** 幅の係数 c_n（セル幅単位）と高さの係数 k_n（R 単位） */
  readonly widthUnits: number
  readonly heightUnits: number
  /** 幅・高さで決まる径（参考値。R は ⌊min⌋ を 24〜28 に収めた物） */
  readonly rW: number
  readonly rH: number
  /** 鍵盤図の矩形（CSS px） */
  readonly kbW: number
  readonly kbH: number
  readonly kbLeft: number
  readonly kbTop: number
  /** 落下域の上端（箱の上端）。セルはここで切れる */
  readonly fallTop: number
  /** 落下距離 D ＝ kbTop − fallTop */
  readonly D: number
  /** 流速 px/ms */
  readonly v: number
  /** 実際の流れる時間 ms（高さ不足で縮めたときは T より短い） */
  readonly travelMs: number
  /** 使ったプレイヤー矩形 */
  readonly player: Size
  readonly limited: Limited
  readonly box: ColumnBox
}

type Raw = { rW: number; rH: number; floor: number; cN: number; kN: number }

function raw(box: ColumnBox, rowsUsed: readonly number[]): Raw {
  const cN = widthUnits(rowsUsed)
  const kN = heightUnits(rowsUsed)
  const rW = (box.width - 2 * GUTTER_X) / (cN * SQ3)
  const rH = (box.height - KB_BOTTOM - T0_MS * V_MIN) / kN
  return { rW, rH, floor: Math.floor(Math.min(rW, rH)), cN, kN }
}

/**
 * 右列の箱から R・鍵盤図・v を決める（プレイヤーの再計算はしない。sizeForViewport が行う）。
 * travelMs は流れる時間 T（TRAVEL_MS[profile]）。
 */
export function computeSizing(
  box: ColumnBox,
  rowsUsed: readonly number[],
  travelMs: number,
  player: Size = PLAYER_DEFAULT,
): Sizing {
  if (!(travelMs > 0)) throw new RangeError(`sizing: 流れる時間 ${travelMs} ms は正の数でない`)
  const s = raw(box, rowsUsed)
  const R = Math.min(R_MAX, Math.max(R_MIN, s.floor))
  const limited: Limited = s.floor >= R_MIN ? null : Math.floor(s.rH) < R_MIN ? 'height' : 'width'
  const kbW = s.cN * SQ3 * R
  const kbH = s.kN * R
  const kbTop = box.top + box.height - KB_BOTTOM - kbH
  const kbLeft = box.left + (box.width - kbW) / 2
  const D = box.height - KB_BOTTOM - kbH
  let v = D / travelMs
  let travel = travelMs
  if (limited === 'height' && D < T0_MS * V_MIN) {
    v = V_MIN
    travel = D / V_MIN
  }
  return {
    R,
    widthUnits: s.cN,
    heightUnits: s.kN,
    rW: s.rW,
    rH: s.rH,
    kbW,
    kbH,
    kbLeft,
    kbTop,
    fallTop: box.top,
    D,
    v,
    travelMs: travel,
    player,
    limited,
    box,
  }
}

/**
 * 視口から R と v を決める。⌊min(R_w, R_h)⌋ < 24 で R_w < 24 のときだけ、プレイヤーを 356×200 にして
 * 1 回だけ再計算する（§2.5。split ではプレイヤーの縮小は幅にしか効かない）。
 */
export function sizeForViewport(
  viewport: Size,
  rowsUsed: readonly number[],
  travelMs: number,
  player: Size = PLAYER_DEFAULT,
): Sizing {
  let p = player
  let box = columnBox(viewport, p)
  const s = raw(box, rowsUsed)
  if (s.floor < R_MIN && s.rW < R_MIN && (p.w > PLAYER_MIN.w || p.h > PLAYER_MIN.h)) {
    p = PLAYER_MIN
    box = columnBox(viewport, p)
  }
  return computeSizing(box, rowsUsed, travelMs, p)
}

/** 段 i（上から 0..n−1）のセルが見えている時間 ms ＝ (D + R + 1.5·R·i)/v（箱の上端で現れ、段の中心で着地） */
export function visibleMs(s: Sizing, rowIndex: number): number {
  return (s.D + s.R + 1.5 * s.R * rowIndex) / s.v
}
