// 判定窓と 2 プロファイルの既定値（M0-06、手順 8）。出どころ: design.md §2.3（入門者 24／100／180 ms・遅れ側 ×1.3、
// 音ゲー向け 30／90／200 ms・×1.0、NEAR は入門者だけ、点・ゲージは音ゲー向けだけ）、decisions の既定値・#6・#8、
// m1' `windows` L270（遅れ側だけ倍率を掛ける）・`judge` L318（境界を含む）。窓の数値の出どころは docs/references.md の
// 「判定窓」の行。etterna・m1 40/80/120・甘さ倍率（m4 leniency）は持たない（2 組だけ。kickoff 手順 8 の手直し）。
// 窓は実時間の ms（再生レートで伸び縮みしない。§2.6「判定窓は実時間で固定」）。S6 で窓を変える設定は後
// （kickoff §7-11: 定数だけ持つ。decisions #38、仮）。

import type { Judgment, Profile } from '../shared/types.ts'

/** 早い側の窓（ms）と遅れ側の倍率。遅れ側の窓は 各窓 × lateFactor */
export interface JudgeWindows {
  readonly perfect: number
  readonly great: number
  readonly good: number
  readonly lateFactor: number
}

/** プロファイルの判定の規則 */
export interface ProfileRules {
  readonly windows: JudgeWindows
  /** NEAR にする六角距離（入門者 1、音ゲー向け 0 ＝ NEAR なし。decisions #6） */
  readonly near: 0 | 1
  /** 点・ゲージ・コンボの表示とゲージ 0 の途中終了（音ゲー向けだけ。decisions #8） */
  readonly gauge: boolean
}

/** 離し窓の倍率（終点の 1.5×GOOD 前から離してよい。§2.3、decisions の既定値「Quaver ×1.5 型」） */
export const RELEASE_FACTOR = 1.5

export const PROFILES: Readonly<Record<Profile, ProfileRules>> = Object.freeze({
  beginner: {
    windows: { perfect: 24, great: 100, good: 180, lateFactor: 1.3 },
    near: 1,
    gauge: false,
  },
  gamer: {
    windows: { perfect: 30, great: 90, good: 200, lateFactor: 1 },
    near: 0,
    gauge: true,
  },
})

/** 判定の段（miss と near を除く。押した時刻のずれだけで決まる） */
export type TimingGrade = Exclude<Judgment, 'near' | 'miss'>

/** dt の側の倍率（dt ＝ 押した − 着地。正が遅れ） */
function sideFactor(w: JudgeWindows, dt: number): number {
  return dt > 0 ? w.lateFactor : 1
}

/** 遅れ側の GOOD の窓（ms）。これを過ぎたら MISS、猶予内に窓が終わるかの W_late（入門者 234） */
export function lateEdge(w: JudgeWindows): number {
  return w.good * w.lateFactor
}

/** 早い側の GOOD の窓（ms）。これより前の押下は窓の外 */
export function earlyEdge(w: JudgeWindows): number {
  return w.good
}

/** GOOD の窓の中か（境界を含む）。NEAR の窓もこれ（§2.3「隣キーを GOOD 窓内で押したら NEAR」） */
export function inGoodWindow(w: JudgeWindows, dt: number): boolean {
  return Math.abs(dt) <= w.good * sideFactor(w, dt)
}

/** dt（ms、押した − 着地、正が遅れ）の段。GOOD の窓の外は null（押下は無視して空打ち） */
export function gradeOf(w: JudgeWindows, dt: number): TimingGrade | null {
  const a = Math.abs(dt)
  const k = sideFactor(w, dt)
  if (a <= w.perfect * k) return 'perfect'
  if (a <= w.great * k) return 'great'
  if (a <= w.good * k) return 'good'
  return null
}

/** 離し窓（ms）＝ 1.5 × 早い側の GOOD。入門者 270、音ゲー向け 300（§2.3「同（300 ms）」） */
export function releaseWindow(w: JudgeWindows): number {
  return RELEASE_FACTOR * w.good
}
