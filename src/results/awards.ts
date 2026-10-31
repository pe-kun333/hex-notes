// 称号・ストリーク・初クリア（M1-11、M1 の手順 11）。出どころ: design.md §4.4（対象プレイ ＝ syncUsed.kind audio かつ
// fallbackAt 無し。対象だけが称号・ストリーク・デイリーに入る。完走 ＝ 固定テンポ・1.0 倍・全鍵・skipped 0 で最後まで、
// decisions #63。初クリア ＝ 譜面版ごとの最初の完走。ストリーク ＝ 対象プレイがある日の連続。称号は「初クリア」「3 日連続」
// 「7 日連続」「同梱 10 曲完走」）、m6 renderS3 L859–868（練習記録は称号・ストリークの対象にならない）、m1-kickoff 手順 11・
// §7-16（日付の境界は端末のローカル日付。at は UTC の ISO 8601 なので Date に戻してローカルで切る）・§7-21（称号は S3 の
// この回の分と S1 の上帯のストリークだけ）。ResultRecord の列からの純関数（日付の切り方は差し替えられる。試験はタイムゾーンに
// 依らない）。

import type { ResultRecord } from '../shared/types.ts'
import { isFinished } from './record.ts'

/** 対象プレイ（開始から動画を使っていない回。§4.4） */
export function isTargetPlay(r: Pick<ResultRecord, 'syncUsed'>): boolean {
  return r.syncUsed.kind === 'audio' && r.syncUsed.fallbackAt === undefined
}

/** 称号・ストリークに数える回: 対象プレイの通常プレイ（固定テンポ・1.0 倍・全鍵。練習記録は入れない、m6 L866） */
export function countsForAwards(
  r: Pick<ResultRecord, 'syncUsed' | 'mode' | 'rate' | 'keyset'>,
): boolean {
  return isTargetPlay(r) && r.mode === 'fixed' && r.rate === 1 && r.keyset === 'all'
}

/** 端末のローカル日付（YYYY-MM-DD。§7-16） */
export function localDay(iso: string): string {
  const d = new Date(iso)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** YYYY-MM-DD の前の日（暦の上で。夏時間に左右されないよう UTC の正午で数える） */
export function prevDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12) - 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/**
 * ストリーク（対象プレイがある日の連続）。今日か昨日に対象プレイがあれば、その日から前へ途切れるまでの日数。
 * どちらにも無ければ 0（途切れた）。dayOf は ISO → ローカル日付
 */
export function streakDays(
  records: readonly ResultRecord[],
  today: string,
  dayOf: (iso: string) => string = localDay,
): number {
  const days = new Set(records.filter(countsForAwards).map((r) => dayOf(r.at)))
  let d = days.has(today) ? today : prevDay(today)
  if (!days.has(d)) return 0
  let n = 0
  while (days.has(d)) {
    n++
    d = prevDay(d)
  }
  return n
}

const earlier = (a: ResultRecord, b: ResultRecord): boolean =>
  a.at < b.at || (a.at === b.at && a.id < b.id)

/** 初クリア（その譜面版の対象プレイで最初の完走か） */
export function isFirstClear(records: readonly ResultRecord[], r: ResultRecord): boolean {
  if (!isTargetPlay(r) || !isFinished(r)) return false
  return !records.some(
    (x) => x.id !== r.id && x.chartId === r.chartId && x.variantId === r.variantId && isTargetPlay(x) && isFinished(x) && earlier(x, r),
  )
} // prettier-ignore

/** 同梱曲のうち対象プレイで完走した曲の数（譜面版は問わない。チュートリアル曲は全鍵の段階の完走だけ ＝ isFinished） */
export function bundledDone(
  records: readonly ResultRecord[],
  bundledIds: readonly string[],
): number {
  const done = new Set(
    records.filter((r) => isTargetPlay(r) && isFinished(r)).map((r) => r.chartId),
  )
  return new Set(bundledIds.filter((id) => done.has(id))).size
}

export type Title = '初クリア' | '3 日連続' | '7 日連続' | string

export interface Awards {
  /** この回で得た称号（S3） */
  readonly titles: readonly Title[]
  /** この回を入れたストリーク */
  readonly streak: number
  /** 同梱曲の完走の数と曲の数 */
  readonly done: number
  readonly total: number
  /** この回が称号・ストリークの対象か（練習記録・動画の回は偽） */
  readonly counted: boolean
}

/**
 * この回で得た称号（§7-21）。初クリア、ストリークが 3・7 日に届いた（この回の前は届いていなかった）、同梱曲を全部完走した
 * （この回の前は足りなかった。称号の名前は「同梱 n 曲完走」、n は同梱曲の数 ＝ §2.9 の 10 曲）
 */
export function awardsFor(
  records: readonly ResultRecord[],
  r: ResultRecord,
  opts: { readonly today: string; readonly bundledIds: readonly string[]; readonly dayOf?: (iso: string) => string },
): Awards {
  const all = records.some((x) => x.id === r.id) ? records : [...records, r]
  const before = all.filter((x) => x.id !== r.id)
  const dayOf = opts.dayOf ?? localDay
  const streak = streakDays(all, opts.today, dayOf)
  const counted = countsForAwards(r)
  const total = opts.bundledIds.length
  const done = bundledDone(all, opts.bundledIds)
  if (!counted) return { titles: [], streak, done, total, counted }
  const titles: Title[] = []
  if (isFirstClear(all, r)) titles.push('初クリア')
  const was = streakDays(before, opts.today, dayOf)
  for (const n of [3, 7]) if (was < n && streak >= n) titles.push(`${n} 日連続`)
  if (total > 0 && bundledDone(before, opts.bundledIds) < total && done >= total) titles.push(`同梱 ${total} 曲完走`)
  return { titles, streak, done, total, counted }
} // prettier-ignore
