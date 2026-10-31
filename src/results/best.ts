// 自己ベストと完走（M1-08、M1 の手順 8）。出どころ: design.md §1.3 S1（自己ベストはプロファイル×譜面版、完走印）・§4.3
// （results の索引 best ＝ [chartId, variantId, profile, clock]、decisions #51）・§4.4（完走 ＝ 固定テンポ・1.0 倍・全鍵・
// skipped 0 で最後まで、decisions #63）、m1-kickoff 手順 8（自己ベスト ＝ その鍵で完走の条件を満たす回の acc の最大、完走 ＝
// 同じ条件の回が 1 つ以上。keyset dfjk の回は入らない）。純関数（記録は呼ぶ側が IndexedDB の listResults で読む）。

import type { ClockKind, Profile, ResultRecord } from '../shared/types.ts'
import { isFinished } from './record.ts'

/** 自己ベストの単位（§4.3 の索引 best） */
export interface BestKey {
  readonly chartId: string
  readonly variantId: string
  readonly profile: Profile
  readonly clock: ClockKind
}

const sameKey = (r: ResultRecord, k: BestKey): boolean =>
  r.chartId === k.chartId &&
  r.variantId === k.variantId &&
  r.profile === k.profile &&
  r.clock === k.clock

/** その単位の自己ベスト（完走の条件を満たす回の acc の最大。同じ acc なら先の回）。無ければ null */
export function bestOf(records: readonly ResultRecord[], key: BestKey): ResultRecord | null {
  let best: ResultRecord | null = null
  for (const r of records)
    if (sameKey(r, key) && isFinished(r) && (best === null || r.acc > best.acc)) best = r
  return best
} // prettier-ignore

/** その曲をそのプロファイルで完走したか（譜面版・clock を問わず 1 回以上。曲カードの完走印） */
export function finishedSong(records: readonly ResultRecord[], chartId: string, profile: Profile): boolean {
  return records.some((r) => r.chartId === chartId && r.profile === profile && isFinished(r))
} // prettier-ignore
