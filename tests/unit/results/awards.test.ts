import { describe, expect, it } from 'vitest'
import {
  awardsFor,
  bundledDone,
  countsForAwards,
  isFirstClear,
  isTargetPlay,
  localDay,
  prevDay,
  streakDays,
} from '../../../src/results/awards.ts'
import type { ResultRecord } from '../../../src/shared/types.ts'
import { rewardView } from '../../../src/app/result-view.ts'

// src/results/awards.ts（M1-11、M1 の手順 11）。出どころ: design.md §4.4、m6 renderS3 L859–868、m1-kickoff 手順 11 の期待値・
// §7-16・§7-21、decisions #63、tests-inventory「M1 手順 11」。日付は試験の中で決める（dayOf ＝ at の先頭 10 文字。タイムゾーンに
// 依らない）。

const DAY = (iso: string): string => iso.slice(0, 10)
let n = 0
const rec = (over: Partial<ResultRecord> = {}): ResultRecord => ({
  id: `r${++n}`,
  chartId: 'c1',
  variantId: 'ableton/2/octave',
  profile: 'beginner',
  clock: 'novideo',
  mode: 'fixed',
  rate: 1,
  keyset: 'all',
  at: '2026-10-31T12:00:00.000Z',
  acc: 0.9,
  rank: 'A',
  counts: { perfect: 1, great: 0, good: 0, near: 0, miss: 0 },
  selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 },
  syncUsed: { kind: 'audio' },
  offsetUsed: 0,
  skipped: 0,
  ...over,
})
const on = (day: string, over: Partial<ResultRecord> = {}): ResultRecord =>
  rec({ at: `${day}T12:00:00.000Z`, ...over })

describe('対象プレイと集計に入る回（§4.4）', () => {
  it('audio・fallbackAt 無し → 対象、video・途中で動画なし → 対象外（M1 では型だけ）', () => {
    expect(isTargetPlay(rec())).toBe(true)
    expect(isTargetPlay(rec({ syncUsed: { kind: 'youtube', videoId: 'x' } }))).toBe(false)
    expect(isTargetPlay(rec({ syncUsed: { kind: 'audio', fallbackAt: 1200 } }))).toBe(false)
  })

  it('練習記録（keyset dfjk・テンポ違い・待ち）は称号・ストリークに入らない。中断あり（skipped）はストリークには入る', () => {
    expect(countsForAwards(rec({ keyset: 'dfjk' }))).toBe(false)
    expect(countsForAwards(rec({ rate: 0.75 }))).toBe(false)
    expect(countsForAwards(rec({ mode: 'note' }))).toBe(false)
    expect(countsForAwards(rec({ skipped: 2 }))).toBe(true)
  })
})

describe('ストリーク（端末のローカル日付の連続、§7-16）', () => {
  it('10/29・10/30・10/31 → 3 日、10/29・10/31 → 1 日、同じ日に 2 回 → 1 日', () => {
    expect(
      streakDays([on('2026-10-29'), on('2026-10-30'), on('2026-10-31')], '2026-10-31', DAY),
    ).toBe(3)
    expect(streakDays([on('2026-10-29'), on('2026-10-31')], '2026-10-31', DAY)).toBe(1)
    expect(streakDays([on('2026-10-31'), on('2026-10-31')], '2026-10-31', DAY)).toBe(1)
  })

  it('今日がまだでも昨日まで続いていれば数える、2 日空けば 0。対象外・練習記録の日は数えない。月またぎ', () => {
    expect(streakDays([on('2026-10-29'), on('2026-10-30')], '2026-10-31', DAY)).toBe(2)
    expect(streakDays([on('2026-10-29')], '2026-10-31', DAY)).toBe(0)
    expect(streakDays([on('2026-10-30', { keyset: 'd' }), on('2026-10-31')], '2026-10-31', DAY)).toBe(1)
    expect(streakDays([on('2026-10-30', { syncUsed: { kind: 'youtube' } }), on('2026-10-31')], '2026-10-31', DAY)).toBe(1)
    expect(streakDays([on('2026-10-31'), on('2026-11-01')], '2026-11-01', DAY)).toBe(2)
    expect(streakDays([], '2026-11-01', DAY)).toBe(0)
  }) // prettier-ignore

  it('前の日（暦。うるう年・年またぎ）とローカル日付', () => {
    expect([prevDay('2026-11-01'), prevDay('2028-03-01'), prevDay('2027-01-01')]).toEqual(['2026-10-31', '2028-02-29', '2026-12-31'])
    const at = new Date(2026, 9, 31, 23, 59).toISOString()
    expect(localDay(at)).toBe('2026-10-31')
  }) // prettier-ignore
})

describe('初クリアと同梱曲の完走', () => {
  it('譜面版ごとの最初の完走だけ。同じ譜面版の 2 回目は違う、別の版は初クリア、完走でない回・対象外は違う', () => {
    const a = on('2026-10-30')
    const b = on('2026-10-31')
    expect(isFirstClear([a, b], a)).toBe(true)
    expect(isFirstClear([a, b], b)).toBe(false)
    const v = on('2026-10-31', { variantId: 'vmpk/2/octave' })
    expect(isFirstClear([a, v], v)).toBe(true)
    const partial = on('2026-10-29', { skipped: 1 })
    expect(isFirstClear([partial, a], a)).toBe(true)
    expect(isFirstClear([partial], partial)).toBe(false)
    expect(isFirstClear([], on('2026-10-31', { syncUsed: { kind: 'youtube' } }))).toBe(false)
  }) // prettier-ignore

  it('先に動画の回で完走していても、自前音源の最初の完走は初クリア。同じ時刻の 2 回は id の順', () => {
    const video = on('2026-10-30', { syncUsed: { kind: 'youtube', videoId: 'v' } })
    const audio = on('2026-10-31')
    expect(isFirstClear([video, audio], audio)).toBe(true)
    const x = rec({ id: 'a1', at: '2026-10-31T12:00:00.000Z' })
    const y = rec({ id: 'a2', at: '2026-10-31T12:00:00.000Z' })
    expect([isFirstClear([x, y], x), isFirstClear([x, y], y)]).toEqual([true, false])
  })

  it('10 曲の chartId で完走 → 10、9 曲 → 9。練習記録（チュートリアルの段階 1・2）は数えない', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `b${i}`)
    expect(
      bundledDone(
        ids.map((id) => rec({ chartId: id })),
        ids,
      ),
    ).toBe(10)
    expect(
      bundledDone(
        ids.slice(1).map((id) => rec({ chartId: id })),
        ids,
      ),
    ).toBe(9)
    expect(bundledDone([rec({ chartId: 'b0', keyset: 'dfjk' }), rec({ chartId: 'zz' })], ids)).toBe(
      0,
    )
  })
})

describe('この回の称号（§7-21）', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `b${i}`)
  const opts = { today: '2026-10-31', bundledIds: ids, dayOf: DAY }

  it('3 日目の最初の回で「初クリア」「3 日連続」、10 曲目で「同梱 10 曲完走」。同じ日の 2 回目は増えない', () => {
    const past = [on('2026-10-29', { chartId: 'b1' }), on('2026-10-30', { chartId: 'b2' })]
    const r = on('2026-10-31', { chartId: 'b0' })
    expect(awardsFor(past, r, opts)).toEqual({
      titles: ['初クリア', '3 日連続'],
      streak: 3,
      done: 3,
      total: 10,
      counted: true,
    })
    const again = on('2026-10-31', { chartId: 'b0' })
    expect(awardsFor([...past, r], again, opts).titles).toEqual([])
    const nine = ids.slice(1).map((id) => on('2026-10-31', { chartId: id }))
    const tenth = on('2026-10-31', { chartId: 'b0' })
    expect(awardsFor(nine, tenth, opts).titles).toEqual(['初クリア', '同梱 10 曲完走'])
    expect(awardsFor([...nine, tenth], on('2026-10-31', { chartId: 'b0' }), opts).titles).toEqual(
      [],
    )
  })

  it('7 日目に「7 日連続」（3 日連続は既に得ている）。保存済みの回を渡しても二重に数えない', () => {
    const days = [
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]
    const past = days.map((d) => on(d, { chartId: 'zz', variantId: 'vmpk/2/octave' }))
    const r = on('2026-10-31', { chartId: 'zz', variantId: 'vmpk/2/octave' })
    expect(awardsFor(past, r, opts)).toMatchObject({ titles: ['7 日連続'], streak: 7 })
    expect(awardsFor([...past, r], r, opts)).toMatchObject({ titles: ['7 日連続'], streak: 7 })
  })

  it('練習記録・動画の回は称号なし（counted 偽）、ストリークはそのまま見せる', () => {
    const past = [on('2026-10-30')]
    expect(awardsFor(past, on('2026-10-31', { keyset: 'd' }), opts)).toEqual({ titles: [], streak: 1, done: 0, total: 10, counted: false })
    expect(awardsFor(past, on('2026-10-31', { syncUsed: { kind: 'youtube' } }), opts).counted).toBe(false)
  }) // prettier-ignore
})

describe('S3 の称号・ストリークの節（m6 renderS3 L859–868）', () => {
  it('対象の回は称号の印・ストリーク・同梱曲の残り、練習記録は対象外の文', () => {
    expect(rewardView({ titles: ['初クリア', '3 日連続'], streak: 3, done: 4, total: 10, counted: true })).toEqual({
      pills: ['初クリア', '3 日連続'],
      lines: ['ストリーク 3 日（自前音源のプレイがある日の連続）。同梱 10 曲完走まであと 6 曲。', '対象プレイ ＝ 開始から動画を使っていない回だけ。'],
    })
    expect(rewardView({ titles: [], streak: 1, done: 3, total: 3, counted: true }).lines[0]).toBe('ストリーク 1 日（自前音源のプレイがある日の連続）。同梱 3 曲をすべて完走しました。')
    expect(rewardView({ titles: [], streak: 1, done: 0, total: 0, counted: true }).lines[0]).toBe('ストリーク 1 日（自前音源のプレイがある日の連続）。')
    expect(rewardView({ titles: [], streak: 2, done: 0, total: 10, counted: false })).toEqual({ pills: [], lines: ['練習記録は称号・ストリークの対象になりません。'] })
  }) // prettier-ignore
})
