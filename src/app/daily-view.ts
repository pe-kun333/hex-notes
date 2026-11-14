// デイリーの画面の中身（M4-01 後半、M4 の手順 7）。出どころ: docs/planning/m4-kickoff.md 手順 7・§7-2・§7-10、decisions #116・
// #125・#126。S1 の「今日の 1 曲」のカードと六角カレンダー、S3 の達成の行。純関数（DOM は screens/home.ts・screens/result.ts）。
//
// 六角カレンダー（§7-10 を採る）: 今月の日を 7 列（日曜はじまり）に並べ、週ごとに半セル右へずらす（鍵盤図と同じ向きの
// pointy-top）。達成した日を塗り、今日を輪で囲む。色だけにせず、日付の数字と達成の印「✓」を出す（H-5）。

import type { CalendarCell } from '../results/daily.ts'

export const DAILY_TITLE = '今日の 1 曲'

/** S1 のカードの行（曲名と達成） */
export interface DailyCard {
  readonly name: string
  readonly done: boolean
  /** 1 行の説明（達成していれば達成の文、でなければ遊び方） */
  readonly note: string
}

export function dailyCardOf(name: string, done: boolean, poolSize: number): DailyCard {
  const rot = poolSize <= 1 ? '' : `同梱曲 ${poolSize} 曲から日替わり。`
  return {
    name,
    done,
    note: done
      ? `今日は達成しました。${rot}`
      : `自前音源で最後まで弾くと達成（動画・練習記録は数えません）。${rot}`,
  }
}

/** S3 の達成の行（デイリーの曲を対象プレイで完走した回だけ） */
export const DAILY_DONE_LINE = '今日の 1 曲を達成しました。'

/** カレンダーの見出し（YYYY 年 M 月） */
export function calendarTitle(year: number, month: number): string {
  return `${year} 年 ${month} 月`
}

/** 六角の外接円の半径 px（日付の数字が入る大きさ。仮） */
export const CAL_R = 15
const SQ3 = Math.sqrt(3)

export interface PlacedDay {
  readonly cell: CalendarCell
  /** 列（曜日、0 ＝ 日曜）と週の行 */
  readonly col: number
  readonly row: number
  /** セルの中心（px、左上 0） */
  readonly x: number
  readonly y: number
}

/**
 * その月のセルを六角に並べる。列 ＝ 曜日、行 ＝ 月の 1 日の曜日から数えた週。中心 x ＝ (列 ＋ 行·0.5 ＋ 0.5)·√3·R ＋ 余白、
 * y ＝ R ＋ 1.5·R·行 ＋ 余白（鍵盤図と同じ並べ方。週ごとに半セル右へずれる）
 */
export function calendarLayout(cells: readonly CalendarCell[], R = CAL_R, pad = 2): { days: PlacedDay[]; width: number; height: number } {
  const w = SQ3 * R
  const start = cells[0]?.weekday ?? 0
  const days = cells.map((cell, i) => {
    const k = start + i
    const col = k % 7
    const row = Math.floor(k / 7)
    return { cell, col, row, x: pad + (col + row * 0.5 + 0.5) * w, y: pad + R + 1.5 * R * row }
  })
  const rows = days.length === 0 ? 0 : (days[days.length - 1]?.row ?? 0) + 1
  return {
    days,
    width: rows === 0 ? 0 : 2 * pad + (7 + (rows - 1) * 0.5) * w,
    height: rows === 0 ? 0 : 2 * pad + R * (2 + 1.5 * (rows - 1)),
  }
} // prettier-ignore

/** セルの読み上げ（title・aria-label）。曲名は名前の表から（無ければ出さない） */
export function dayLabel(cell: CalendarCell, nameOf: (id: string) => string | undefined): string {
  const [, m, d] = cell.day.split('-').map(Number)
  const name = cell.chartId === null ? undefined : nameOf(cell.chartId)
  const state = cell.done ? '達成' : cell.today ? '今日' : ''
  return [`${m ?? ''}月${d ?? ''}日`, state].filter((x) => x !== '').join(' ') + (name === undefined ? '' : `（${name}）`)
} // prettier-ignore
