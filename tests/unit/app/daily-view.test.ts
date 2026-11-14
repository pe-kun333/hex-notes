import { describe, expect, it, vi } from 'vitest'
import {
  CAL_R,
  DAILY_DONE_LINE,
  calendarLayout,
  calendarTitle,
  dailyCardOf,
  dayLabel,
} from '../../../src/app/daily-view.ts'
import { offTargetLines } from '../../../src/app/result-view.ts'
import { EMPTY_DAILY, calendarOf, dailyAdd } from '../../../src/results/daily.ts'
import { rewardFor } from '../../../src/results/reward.ts'
import type { ResultRecord } from '../../../src/shared/types.ts'

// src/app/daily-view.ts と S3 の行（M4 の手順 7）。出どころ: docs/planning/m4-kickoff.md 手順 7 の期待値 (1)〜(3)・§7-10、
// decisions #116・#125・#126、tests-inventory「M4 手順 7」。画面（S1 のカード・SVG、S3 の行と鍵）は pane で確かめた。

const POOL = ['tw', 'ode']

describe('期待値 (1)(2): 六角カレンダー（2026-11）', () => {
  const cells = calendarOf(EMPTY_DAILY, POOL, 2026, 11, '2026-11-14')
  const lay = calendarLayout(cells)

  it('30 セル。11-01 は日曜で 1 列目・1 行目、11-30 は月曜で 5 行目（週ごとに半セル右へずれる）', () => {
    expect(lay.days).toHaveLength(30)
    expect(lay.days[0]).toMatchObject({ col: 0, row: 0 })
    expect(lay.days[29]).toMatchObject({ col: 1, row: 4 })
    const w = Math.sqrt(3) * CAL_R
    // 中心 x ＝ 余白 2 ＋ (列 ＋ 行·0.5 ＋ 0.5)·w、y ＝ 余白 2 ＋ R ＋ 1.5·R·行
    expect(lay.days[7]?.x).toBeCloseTo(2 + 1 * w)
    expect(lay.days[7]?.y).toBeCloseTo(2 + CAL_R + 1.5 * CAL_R)
    expect(lay.width).toBeCloseTo(4 + 9 * w)
    expect(lay.height).toBeCloseTo(4 + CAL_R * 8)
  })

  it('達成 0 日 → 塗り 0、今日だけ印（今日の輪）。今日より後の日は曲を出さない', () => {
    expect(cells.filter((c) => c.done)).toHaveLength(0)
    expect(cells.filter((c) => c.today).map((c) => c.date)).toEqual([14])
    expect(cells.slice(14).every((c) => c.chartId === null)).toBe(true)
  })

  it('セルの読み上げ: 「11月14日 今日（歓喜の歌）」、達成の日は「達成」と書いた曲', () => {
    const names: Record<string, string> = { tw: 'きらきら星', ode: '歓喜の歌' }
    expect(dayLabel(cells[13] ?? cells[0]!, (id) => names[id])).toBe('11月14日 今日（歓喜の歌）')
    const done = calendarOf(dailyAdd(EMPTY_DAILY, '2026-11-13', 'tw'), POOL, 2026, 11, '2026-11-14')
    expect(dayLabel(done[12]!, (id) => names[id])).toBe('11月13日 達成（きらきら星）')
    expect(dayLabel(cells[20]!, (id) => names[id])).toBe('11月21日')
    expect(calendarTitle(2026, 11)).toBe('2026 年 11 月')
  })

  it('月の 1 日が土曜なら 6 行（2026-08: 31 日）', () => {
    const aug = calendarLayout(calendarOf(EMPTY_DAILY, POOL, 2026, 8, '2026-08-01'))
    expect(aug.days[0]).toMatchObject({ col: 6, row: 0 })
    expect(aug.days[30]).toMatchObject({ col: 1, row: 5 })
  })
})

describe('S1 のカードの文', () => {
  it('達成・未達成と、曲が 2 曲以上なら日替わりの数（#116 (f): 2 曲の間もカードを出す）', () => {
    expect(dailyCardOf('歓喜の歌', false, 2)).toEqual({ name: '歓喜の歌', done: false, note: '自前音源で最後まで弾くと達成（動画・練習記録は数えません）。同梱曲 2 曲から日替わり。' })
    expect(dailyCardOf('歓喜の歌', true, 2).note).toBe('今日は達成しました。同梱曲 2 曲から日替わり。')
    expect(dailyCardOf('X', false, 1).note).toBe('自前音源で最後まで弾くと達成（動画・練習記録は数えません）。')
  }) // prettier-ignore
})

describe('期待値 (3): 動画の回の S3', () => {
  const rec: ResultRecord = {
    id: 'r', chartId: 'ode', variantId: 'ableton/2/octave', profile: 'beginner', clock: 'video', mode: 'fixed', rate: 1, keyset: 'all',
    at: '2026-11-14T12:00:00.000Z', acc: 1, rank: 'SS', counts: { perfect: 1, great: 0, good: 0, near: 0, miss: 0 },
    selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 }, syncUsed: { kind: 'youtube', videoId: 'v' }, offsetUsed: 0, skipped: 0,
  } // prettier-ignore

  it('対象外の文に「デイリー」、門は記録を読まない（S3 はその後ろでだけデイリーを読み、鍵に書く）。達成の行は出ない', async () => {
    expect(offTargetLines('video', true)[0]).toContain(
      '称号・ストリーク・デイリーは自前音源のプレイだけが対象です',
    )
    const load = vi.fn()
    expect(await rewardFor(rec, load, { today: '2026-11-14' })).toEqual({
      target: false,
      why: 'video',
    })
    expect(load).not.toHaveBeenCalled()
    expect(DAILY_DONE_LINE).toBe('今日の 1 曲を達成しました。')
  })
})
