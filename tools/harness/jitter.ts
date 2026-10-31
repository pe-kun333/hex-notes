// 人工ジッタ（M0-10、手順 13）。出どころ: m3 `buildNotes` L358–360（音ごとに z ＝ gauss(rz)、rz ＝ mulberry32(99) を 1 つ
// 引く）・自動プレイ L391（押す時刻 ＝ 着地 ＋ z × ジッタ）、m3 `mulberry32` L244・`gauss` L245（src/shared/random.ts に
// そのまま写した物）、kickoff 手順 13、decisions #56（仮）。
// m4 `sampleAuto` L377 の「gauss() × 0.028」は、m4 の gauss（L316: 一様 3 つの和 − 1.5 を 0.7071 で割る。SD は 0.7071）の
// せいで実際の SD が 19.8 ms になり、表記の 28 ms と合わない。m3 の Box–Muller（SD 1）を採り、表の jitterSd を実際の SD に
// 揃える。

import { gauss, mulberry32 } from '../../src/shared/random.ts'

/** 種の基（m3 buildNotes の rz ＝ mulberry32(99)）。曲 k（table.ts の HARNESS_SONGS の順）は基 ＋ k */
export const JITTER_SEED = 99

/**
 * 表に載せる揺れの SD（ms）。kickoff 手順 13 の 0／5／10 に、手順 8 の下見と同じ 20／40／80 を足した（短い 6 曲では
 * 10 ms まで全て PERFECT で、GREAT・GOOD・MISS・NEAR の窓が表に出ないため。decisions #56）
 */
export const JITTER_SDS: readonly number[] = [0, 5, 10, 20, 40, 80]

/**
 * 譜面の音 count 個ぶんの z（標準正規）。添字は譜面の notes の添字で、配列で keys が null の音にも 1 つ引く（配列が
 * 違っても同じ音は同じ z になる）。SD を変えても z は同じなので、どの音も |ずれ| は SD とともに増える。
 */
export function jitterZ(count: number, seed: number = JITTER_SEED): number[] {
  if (!(Number.isInteger(count) && count >= 0)) throw new RangeError(`jitter: count ${count}`)
  const rng = mulberry32(seed)
  return Array.from({ length: count }, () => gauss(rng))
}
