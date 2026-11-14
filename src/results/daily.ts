// デイリー（今日の 1 曲）の決まり（M4-01 前半、M4 の手順 6）。出どころ: docs/planning/m4-kickoff.md 手順 6・§7-2・§7-15、
// decisions #116（同梱曲を日の番号で巡回・対象プレイの完走で達成・達成した日を hexnote.daily に書き控えに入れる・専用の連続や
// 修復は作らない・曲が 2 曲の間もカードを出す）・#125、design.md §5.5 M4-01「対象プレイだけが集計」・§4.3・§4.4。
// 純関数（DOM・保存に触れない。鍵の読み書きは src/storage/local.ts、画面は手順 7）。
//
// 日は端末のローカル日付 YYYY-MM-DD（今のストリークと同じ、§7-15。時計を動かした場合は見ない）。日の通し番号は
// 1970-01-01 を 0 とする暦の日の数（UTC の暦で数えるので、夏時間に左右されない）。

import type { ResultRecord } from '../shared/types.ts'
import { isTargetPlay, localDay } from './awards.ts'
import { isFinished } from './record.ts'

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** YYYY-MM-DD の日の通し番号（1970-01-01 が 0）。形が違えば null */
export function dayNumber(day: string): number | null {
  const m = DAY_RE.exec(day)
  if (m === null) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = Date.UTC(y, mo - 1, d)
  const back = new Date(t)
  // 2026-02-30 のような無い日は断る
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d)
    return null
  return Math.round(t / 86_400_000)
}

/** 通し番号 → YYYY-MM-DD */
export function dayOfNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * その日の 1 曲（譜面の id）。pool はチュートリアル曲を除く同梱曲の id（一覧の順）。添字 ＝ 日の通し番号 mod 曲の数。
 * pool が空か日の形が違えば null（デイリーなし）
 */
export function dailyOf(day: string, pool: readonly string[]): string | null {
  const n = dayNumber(day)
  if (n === null || pool.length === 0) return null
  return pool[((n % pool.length) + pool.length) % pool.length] ?? null
}

/**
 * その回が、その日（ローカル日付）のその曲のデイリーの達成か: 対象プレイ（開始から動画を使っていない回）の完走（固定テンポ・
 * 1.0 倍・全鍵・skipped 0・ループなし・途中終了でない）。譜面版とプロファイルは問わない（#116 (b)）
 */
export function dailyDone(
  r: ResultRecord,
  day: string,
  chartId: string,
  dayOf: (iso: string) => string = localDay,
): boolean {
  return r.chartId === chartId && dayOf(r.at) === day && isTargetPlay(r) && isFinished(r)
}

// ---------- 達成の記録（鍵 hexnote.daily） ----------

/** 達成した日と、その日の曲の id（{v:1, days: {日: 曲の id}}。曲の数が変わっても過去の達成は変わらない、#116 (c)） */
export interface DailyLog {
  readonly days: Readonly<Record<string, string>>
}

export const EMPTY_DAILY: DailyLog = { days: {} }

/** 鍵の中身を読む（形の違う日・空の id は捨てる。v が 1 以外は空） */
export function parseDaily(raw: unknown): DailyLog {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return EMPTY_DAILY
  const r = raw as Record<string, unknown>
  if (r['v'] !== undefined && r['v'] !== 1) return EMPTY_DAILY
  const d = r['days']
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return EMPTY_DAILY
  const days: Record<string, string> = {}
  for (const [k, v] of Object.entries(d))
    if (dayNumber(k) !== null && typeof v === 'string' && v !== '') days[k] = v
  return { days }
}

/** 書く形 */
export function dailyJson(log: DailyLog): { v: 1; days: Readonly<Record<string, string>> } {
  return { v: 1, days: log.days }
}

/** その日の達成を足す（既に書いた日は変えない。変わらなければ同じ物を返す） */
export function dailyAdd(log: DailyLog, day: string, chartId: string): DailyLog {
  if (log.days[day] !== undefined || dayNumber(day) === null || chartId === '') return log
  return { days: { ...log.days, [day]: chartId } }
}

/** 2 つを合わせる（控えの取り込み。手元に書いた日を優先し、無い日だけ足す） */
export function dailyMerge(mine: DailyLog, other: DailyLog): DailyLog {
  let out = mine
  for (const [day, id] of Object.entries(other.days)) out = dailyAdd(out, day, id)
  return out
}

/**
 * 回の終わりに書く分: その回がその日のデイリーの達成なら、足した記録を返す（でなければ同じ物）。today は回の終わりの
 * ローカル日付、pool はその時の同梱曲（手順 7 が呼ぶ）
 */
export function dailyAfterPlay(
  log: DailyLog,
  r: ResultRecord,
  pool: readonly string[],
  dayOf: (iso: string) => string = localDay,
): DailyLog {
  const day = dayOf(r.at)
  const id = dailyOf(day, pool)
  return id !== null && dailyDone(r, day, id, dayOf) ? dailyAdd(log, day, id) : log
}

// ---------- 今月のカレンダー ----------

export interface CalendarCell {
  /** YYYY-MM-DD */
  readonly day: string
  /** 日（1〜31） */
  readonly date: number
  /** 曜日（0 ＝ 日曜） */
  readonly weekday: number
  /** 達成した日か（hexnote.daily に書いた日） */
  readonly done: boolean
  /**
   * その日の曲の id。達成した日は書いた曲、今日までの日は今の pool で決めた曲、今日より後は null（先の曲は出さない）
   */
  readonly chartId: string | null
  readonly today: boolean
}

/** その月（month は 1〜12）の日ごとのセル。today はローカル日付 YYYY-MM-DD */
export function calendarOf(
  log: DailyLog,
  pool: readonly string[],
  year: number,
  month: number,
  today: string,
): CalendarCell[] {
  const first = Date.UTC(year, month - 1, 1)
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const todayN = dayNumber(today)
  const out: CalendarCell[] = []
  for (let i = 0; i < n; i++) {
    const t = first + i * 86_400_000
    const day = new Date(t).toISOString().slice(0, 10)
    const num = Math.round(t / 86_400_000)
    const done = log.days[day] !== undefined
    const future = todayN !== null && num > todayN
    out.push({
      day,
      date: i + 1,
      weekday: new Date(t).getUTCDay(),
      done,
      chartId: done ? (log.days[day] ?? null) : future ? null : dailyOf(day, pool),
      today: day === today,
    })
  }
  return out
}
