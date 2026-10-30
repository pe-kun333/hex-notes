// ホールド（M0-06、手順 8）。出どころ: design.md §2.3「音価 ≥500 ms。離し窓は終点の 1.5×GOOD 前から」、
// m1' `releaseHold` L327（作り直し: 離し窓 1.3×／1.0×GOOD → 1.5×GOOD）・`completeHold` L326、kickoff §7-16、
// decisions #25（全離し forced は早離しとして採点しない）・#39（仮）。
// 時刻は実時間の ms（押下と同じく校正のオフセットを足した離しの時刻と、終点の実時刻を比べる）。

/** ホールドにする最短の音価（譜面の ms。再生レートでは変えない。§2.3。kickoff の HOLD_MIN 0.55 s を直した） */
export const HOLD_MIN_MS = 500

/**
 * ホールドの閉じ方。ok ＝ 離し窓の中で離した・終点まで押し続けた、early ＝ 離し窓より前に離した（はやい）、
 * forced ＝ 全離し（blur・非表示・iframe・コンテキストメニュー・Meta の keyup）か、時計が止まっている間の離し。
 * forced は早離しとして採点しない（decisions #25 (a)・#39）。
 */
export type HoldResult = 'ok' | 'early' | 'forced'

/** 音価からホールドか（tEnd − tLand ≥ 500） */
export function isHold(tLandMs: number, tEndMs: number): boolean {
  return tEndMs - tLandMs >= HOLD_MIN_MS
}

/**
 * 離しの結果。releaseReal は離した実時刻（校正込み）、endReal は終点の実時刻、releaseMs は離し窓。
 * 終点の releaseMs 前（境界を含む）より後なら ok。終点を過ぎた離しは来ない（終点でホールドを閉じる）。
 */
export function releaseResult(releaseReal: number, endReal: number, releaseMs: number): HoldResult {
  return releaseReal >= endReal - releaseMs ? 'ok' : 'early'
}
