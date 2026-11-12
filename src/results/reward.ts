// S3 の称号の門（M3 の手順 8、M3-06、m3-kickoff 手順 8・§7-33、仮）。出どころ: design.md §4.4（対象プレイ ＝ 開始から動画を
// 使っていない回だけが称号・ストリークに入る）・§5.4 L273（動画を使った回から称号集計が呼ばれない）・§6.1 L320（§4.4 の
// ガードを単体試験）、m6 renderS3 L859–867。対象プレイでない回（YouTube 再生の回・途中で動画なしに切り替わった回）は
// 記録も同梱曲の id も読まず（load を呼ばない）、集計（awardsFor）を呼ばない。門の鍵は isTargetPlay だけで、自前音源の
// 練習記録・途中終了は今のまま集計へ通す（集計の側が counted で分ける）。

import { awardsFor, isTargetPlay, localDay, type Awards } from './awards.ts'
import type { ResultRecord } from '../shared/types.ts'

/** 対象外の訳（switched ＝ 途中で動画なしに切り替わった回〔fallbackAt あり、戻した回も〕、video ＝ YouTube 再生の回） */
export type OffTargetWhy = 'video' | 'switched'

export type RewardResult =
  | { readonly target: true; readonly awards: Awards }
  | { readonly target: false; readonly why: OffTargetWhy }

/** 集計に要る物（保存済みの記録と同梱曲の id）。対象プレイの回だけ 1 回読む */
export interface RewardLoad {
  readonly records: readonly ResultRecord[]
  readonly bundledIds: readonly string[]
}

/** 対象外の訳（対象プレイなら null）。門の鍵は isTargetPlay だけ */
export function offTargetWhy(record: Pick<ResultRecord, 'syncUsed'>): OffTargetWhy | null {
  if (isTargetPlay(record)) return null
  return record.syncUsed.fallbackAt === undefined ? 'video' : 'switched'
}

/**
 * この回の称号（S3 の節）。対象プレイでなければ load を呼ばずに対象外の訳を返す。対象プレイなら load を 1 回待ち、
 * awardsFor を 1 回呼ぶ
 */
export async function rewardFor(
  record: ResultRecord,
  load: () => Promise<RewardLoad>,
  opts: { readonly today: string; readonly dayOf?: (iso: string) => string },
): Promise<RewardResult> {
  const why = offTargetWhy(record)
  if (why !== null) return { target: false, why }
  const { records, bundledIds } = await load()
  return {
    target: true,
    awards: awardsFor(records, record, {
      today: opts.today,
      bundledIds,
      dayOf: opts.dayOf ?? localDay,
    }),
  }
}
