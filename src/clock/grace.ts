// 猶予と skipped（M0-05、手順 7）。出どころ: design.md §2.6「seek・一時停止・BUFFERING・飛び・レート変更の後 300 ms は
// 判定保留＋S7b、猶予内に窓が終わるノートは skipped」、kickoff 手順 7 の手直し（m3 resync L376–382 の「n.t < T＋0.3」→
// 「猶予内に窓が終わるノート」、判定窓は実時間で固定）、相談 C、decisions #33（仮）。

import { perfAt } from './map.ts'
import type { ClockMap } from './types.ts'

/** 猶予 ms（§2.6。再アンカーごとに始め直す） */
export const GRACE_MS = 300

export function graceEnd(anchorNow: number): number {
  return anchorNow + GRACE_MS
}

/**
 * 猶予内に窓が終わるか。perfLand はノートの着地の実時刻（nowAt(t_n)）、wLate は遅れ側の窓の実時間 ms（入門者
 * 180 × 1.3 ＝ 234）。窓の終わり perfLand ＋ wLate が猶予の終わり以下なら skipped（判定しない）。
 */
export function endsInGrace(perfLand: number, wLate: number, graceUntil: number): boolean {
  return perfLand + wLate <= graceUntil
}

/**
 * 再アンカーの事象（resync）の名目の写像で、時計の軸のノート t を skipped にするか。猶予の間は時計が止まって
 * いる（seek の凍結の保持）ことがあるので、出力の map でなく名目の写像（傾き ＝ 再生レート）で着地の実時刻を出す。
 */
export function skippedAt(
  t: number,
  nominal: ClockMap,
  wLate: number,
  graceUntil: number,
): boolean {
  return endsInGrace(perfAt(nominal, t), wLate, graceUntil)
}
