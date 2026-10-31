// 練習層の小節とフレーズ（M2-03 前半、M2 の手順 5）。出どころ: design.md §2.7（フレーズ待ち ＝ 2 小節の頭、自動ループ ＝
// 2 小節）、m4 phraseOf・bars（フレーズ ＝ 2 小節、曲頭 0 始まり）、m2-kickoff 手順 5・§7-10（barOf を共有、timeSig 無しは
// 4/4）。小節は 1 始まり（results/analysis.ts の barOf と同じ数え方）、フレーズは 0 始まり（フレーズ k ＝ 小節 2k＋1〜2k＋2）。
// 純関数。

import type { MsTable } from '../chart/mstable.ts'
import { barOf } from '../results/analysis.ts'
import type { Pulse } from '../shared/types.ts'

/** フレーズの小節数（§2.7「2 小節」） */
export const PHRASE_BARS = 2

/** 小節（1 始まり）の頭の拍。barOf の逆（拍子の区間の途中で変わった半端な小節も 1 つに数える） */
export function barStartBeat(pulse: Pick<Pulse, 'timeSig'>, bar: number): number {
  let bars = 0
  let start = 0
  let len = 4
  for (const ts of pulse.timeSig ?? []) {
    if (ts.beat > start) {
      const inSeg = Math.ceil((ts.beat - start) / len - 1e-9)
      if (bar <= bars + inSeg) break
      bars += inSeg
    }
    start = ts.beat
    len = (ts.num * 4) / ts.den
  }
  return start + (bar - bars - 1) * len
}

/** 小節の頭の曲 ms */
export function barStartMs(ms: MsTable, pulse: Pick<Pulse, 'timeSig'>, bar: number): number {
  return ms.beatToMs(barStartBeat(pulse, bar))
}

/** 小節 → フレーズ（0 始まり） */
export function phraseOfBar(bar: number): number {
  return Math.floor((bar - 1) / PHRASE_BARS)
}

/** フレーズの最初の小節 */
export function phraseFirstBar(phrase: number): number {
  return phrase * PHRASE_BARS + 1
}

/** 拍 → フレーズ */
export function phraseOfBeat(pulse: Pick<Pulse, 'timeSig'>, beat: number): number {
  return phraseOfBar(barOf(pulse, beat))
}
