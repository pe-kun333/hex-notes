// 1 回の記録（M1-06、M1 の手順 5）。出どころ: design.md §4.3（results の形）・§4.4（完走 ＝ 固定テンポ・1.0 倍・全鍵・
// skipped 0 で最後まで、decisions #63）、decisions #51（results の主キー id・索引 best）、m1-kickoff 手順 5（id は呼ぶ側が
// crypto.randomUUID で作る、仮）。判定のまとめ（summarizeJudge）と回の条件 → ResultRecord の純関数。保存は呼ぶ側
// （src/app/。IndexedDB の putResult）。

import type { JudgeSummary } from '../judge/judge.ts'
import type { ResultRecord } from '../shared/types.ts'

/** 回の条件（判定のまとめの外の項目） */
export type RecordMeta = Pick<
  ResultRecord,
  | 'id'
  | 'chartId'
  | 'variantId'
  | 'profile'
  | 'clock'
  | 'mode'
  | 'rate'
  | 'keyset'
  | 'at'
  | 'syncUsed'
  | 'offsetUsed'
> &
  Pick<Partial<ResultRecord>, 'looped'>

export function resultRecord(
  meta: RecordMeta,
  judge: Pick<JudgeSummary, 'acc' | 'rank' | 'counts' | 'selfRate' | 'skipped'>,
): ResultRecord {
  return {
    id: meta.id,
    chartId: meta.chartId,
    variantId: meta.variantId,
    profile: meta.profile,
    clock: meta.clock,
    mode: meta.mode,
    rate: meta.rate,
    keyset: meta.keyset,
    at: meta.at,
    acc: judge.acc,
    rank: judge.rank,
    counts: { ...judge.counts },
    selfRate: { ...judge.selfRate },
    syncUsed: { ...meta.syncUsed },
    offsetUsed: meta.offsetUsed,
    skipped: judge.skipped,
    ...(meta.looped === true ? { looped: true } : {}),
  }
}

/**
 * 記録の id（m1-kickoff 手順 5 の crypto.randomUUID）。randomUUID は安全な文脈（https・localhost）にしか無いので、
 * LAN の http で開いたときは時刻と乱数から作る（重ならなければよい。仮）
 */
export function newRecordId(
  c: { randomUUID?: () => string } | undefined,
  now: number,
  random: () => number,
): string {
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  return `r-${now.toString(36)}-${Math.floor(random() * 2 ** 48).toString(36)}`
}

/**
 * 完走か（§4.4: 固定テンポ・1.0 倍・全鍵・skipped 0 で最後まで）。M1 の回は全て最後まで弾く（途中終了は M2-05 で印を
 * 足す）ので、ここでは条件の 4 つと、ループで折り返していないこと（M2-03、decisions #87）を見る
 */
export function isFinished(
  r: Pick<ResultRecord, 'mode' | 'rate' | 'keyset' | 'skipped' | 'looped'>,
): boolean {
  return (
    r.mode === 'fixed' && r.rate === 1 && r.keyset === 'all' && r.skipped === 0 && r.looped !== true
  )
}
