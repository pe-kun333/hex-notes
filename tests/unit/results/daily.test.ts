import { describe, expect, it } from 'vitest'
import {
  EMPTY_DAILY,
  calendarOf,
  dailyAdd,
  dailyAfterPlay,
  dailyDone,
  dailyJson,
  dailyMerge,
  dailyOf,
  dayNumber,
  dayOfNumber,
  parseDaily,
} from '../../../src/results/daily.ts'
import { loadDaily, saveDaily, LOCAL_KEYS } from '../../../src/storage/local.ts'
import { backupFileText, importText, makeBackup } from '../../../src/storage/file.ts'
import { initialFade } from '../../../src/judge/self-rate.ts'
import { defaultSettings } from '../../../src/storage/local.ts'
import type { KvStore } from '../../../src/storage/fallback.ts'
import type { ResultRecord } from '../../../src/shared/types.ts'

// src/results/daily.ts と鍵 hexnote.daily（M4 の手順 6）。出どころ: docs/planning/m4-kickoff.md 手順 6 の期待値 (1)〜(3)・§7-2・
// §7-15、decisions #116・#125、design.md §5.5 L285「対象プレイだけが集計」、tests-inventory「M4 手順 6」。日付は試験の中で決める
// （dayOf ＝ at の先頭 10 文字。タイムゾーンに依らない）。

const DAY = (iso: string): string => iso.slice(0, 10)
const TW = 'sha256:twinkle'
const ODE = 'sha256:ode'
const POOL2 = [TW, ODE]
const pool = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i}`)

let n = 0
const rec = (over: Partial<ResultRecord> = {}): ResultRecord => ({
  id: `r${++n}`,
  chartId: ODE,
  variantId: 'ableton/2/octave',
  profile: 'beginner',
  clock: 'novideo',
  mode: 'fixed',
  rate: 1,
  keyset: 'all',
  at: '2026-11-14T12:00:00.000Z',
  acc: 0.9,
  rank: 'A',
  counts: { perfect: 1, great: 0, good: 0, near: 0, miss: 0 },
  selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 },
  syncUsed: { kind: 'audio' },
  offsetUsed: 0,
  skipped: 0,
  ...over,
})

describe('期待値 (1): その日の 1 曲（node で検算）', () => {
  it('2026-11-14 の通し番号は 20,771、翌日 20,772。年をまたいで 20,818 → 20,819', () => {
    expect(dayNumber('2026-11-14')).toBe(20771)
    expect(dayNumber('2026-11-15')).toBe(20772)
    expect([dayNumber('2026-12-31'), dayNumber('2027-01-01')]).toEqual([20818, 20819])
    expect(dayNumber('1970-01-01')).toBe(0)
    expect(dayOfNumber(20771)).toBe('2026-11-14')
  })

  it('添字 ＝ 通し番号 mod 曲の数: 2 曲 → 1、9 曲 → 8、29 曲 → 7。翌日は 0・0・8', () => {
    expect(dailyOf('2026-11-14', POOL2)).toBe(ODE)
    expect(dailyOf('2026-11-14', pool(9))).toBe('c8')
    expect(dailyOf('2026-11-14', pool(29))).toBe('c7')
    expect([dailyOf('2026-11-15', POOL2), dailyOf('2026-11-15', pool(9)), dailyOf('2026-11-15', pool(29))]).toEqual([TW, 'c0', 'c8'])
  }) // prettier-ignore

  it('期待値 (3) の前半: pool が空（チュートリアル曲だけ）→ デイリーなし。日の形が違う・無い日も null', () => {
    expect(dailyOf('2026-11-14', [])).toBeNull()
    expect(dailyOf('2026-11-31', POOL2)).toBeNull()
    expect(dailyOf('20261114', POOL2)).toBeNull()
  })
})

describe('期待値 (2): 達成は対象プレイの完走だけ（design L285）', () => {
  const day = '2026-11-14'
  it('その日にその曲を自前音源で完走 → 達成（譜面版とプロファイルは問わない）', () => {
    expect(dailyDone(rec(), day, ODE, DAY)).toBe(true)
    expect(dailyDone(rec({ variantId: 'vmpk/3/octave', profile: 'gamer' }), day, ODE, DAY)).toBe(
      true,
    )
  })

  it('動画で完走・途中で動画なしへ切替・練習記録（鍵数制限・待ち・テンポ・ループ）・途中終了・skipped → 達成でない', () => {
    const not = [
      rec({ clock: 'video', syncUsed: { kind: 'youtube', videoId: 'v' } }),
      rec({ clock: 'video', syncUsed: { kind: 'youtube', videoId: 'v', fallbackAt: 1200 } }),
      rec({ syncUsed: { kind: 'audio', fallbackAt: 1200 } }),
      rec({ keyset: 'dfjk' }),
      rec({ mode: 'note' }),
      rec({ rate: 0.75 }),
      rec({ looped: true }),
      rec({ aborted: true }),
      rec({ skipped: 2 }),
    ]
    expect(not.map((r) => dailyDone(r, day, ODE, DAY))).toEqual(not.map(() => false))
  }) // prettier-ignore

  it('前の日に完走・別の曲の完走 → 達成でない', () => {
    expect(dailyDone(rec({ at: '2026-11-13T23:00:00.000Z' }), day, ODE, DAY)).toBe(false)
    expect(dailyDone(rec({ chartId: TW }), day, ODE, DAY)).toBe(false)
  })

  it('回の終わりに書く分（dailyAfterPlay）: 達成なら足し、でなければ同じ物。同じ日は 2 度書かない', () => {
    const a = dailyAfterPlay(EMPTY_DAILY, rec(), POOL2, DAY)
    expect(a.days).toEqual({ '2026-11-14': ODE })
    expect(dailyAfterPlay(a, rec(), POOL2, DAY)).toBe(a)
    expect(dailyAfterPlay(EMPTY_DAILY, rec({ chartId: TW }), POOL2, DAY)).toBe(EMPTY_DAILY)
    expect(dailyAfterPlay(EMPTY_DAILY, rec({ syncUsed: { kind: 'youtube', videoId: 'v' } }), POOL2, DAY)).toBe(EMPTY_DAILY)
    expect(dailyAfterPlay(EMPTY_DAILY, rec(), [], DAY)).toBe(EMPTY_DAILY)
  }) // prettier-ignore
})

describe('期待値 (3): 達成の保存（鍵 hexnote.daily）と曲の数の変化', () => {
  it('2 曲の pool で 3 日達成した後に pool を 9 曲に替えても、前に書いた 3 日はそのまま読める（今日の曲だけ新しい pool）', () => {
    let log = EMPTY_DAILY
    for (const [day, at] of [['2026-11-12', '2026-11-12T12:00:00.000Z'], ['2026-11-13', '2026-11-13T12:00:00.000Z'], ['2026-11-14', '2026-11-14T12:00:00.000Z']] as const)
      log = dailyAfterPlay(log, rec({ at, chartId: dailyOf(day, POOL2) ?? '' }), POOL2, DAY)
    expect(Object.keys(log.days)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14'])
    const cal = calendarOf(log, pool(9), 2026, 11, '2026-11-15')
    expect(cal.filter((c) => c.done).map((c) => [c.day, c.chartId])).toEqual([
      ['2026-11-12', ODE],
      ['2026-11-13', TW],
      ['2026-11-14', ODE],
    ])
    expect(cal.find((c) => c.today)).toMatchObject({ day: '2026-11-15', done: false, chartId: 'c0' })
  }) // prettier-ignore

  it('鍵の読み書き: {v:1, days}。壊れた・形の違う日・空の id は捨てる。v が 2 は空', () => {
    const store = new Map<string, string>()
    const kv: KvStore = { area: 'local', mode: () => 'backend', get: (k) => store.get(k) ?? null, set: (k, v) => (store.set(k, v), true), remove: (k) => void store.delete(k) }
    expect(loadDaily(kv)).toEqual(EMPTY_DAILY)
    saveDaily(kv, dailyAdd(EMPTY_DAILY, '2026-11-14', ODE))
    expect(JSON.parse(store.get(LOCAL_KEYS.daily) ?? '')).toEqual({ v: 1, days: { '2026-11-14': ODE } })
    expect(loadDaily(kv).days).toEqual({ '2026-11-14': ODE })
    expect(parseDaily({ v: 1, days: { '2026-11-14': ODE, 'x': ODE, '2026-02-30': ODE, '2026-11-13': '' } }).days).toEqual({ '2026-11-14': ODE })
    expect(parseDaily({ v: 2, days: { '2026-11-14': ODE } })).toEqual(EMPTY_DAILY)
    expect(parseDaily('壊れた')).toEqual(EMPTY_DAILY)
    expect(dailyJson(EMPTY_DAILY)).toEqual({ v: 1, days: {} })
  }) // prettier-ignore

  it('控えに入れる（#116 (c)）: 書き出して取り込むと days が戻る。取り込みは手元に書いた日を優先して足す', async () => {
    const daily = dailyAdd(EMPTY_DAILY, '2026-11-14', ODE)
    const text = backupFileText(makeBackup({ settings: defaultSettings(), fade: initialFade(), charts: [], results: [], daily }, '2026-11-14T00:00:00.000Z'))
    const r = await importText(text)
    expect(r.kind === 'backup' && r.backup.daily).toEqual(daily)
    const mine = dailyAdd(EMPTY_DAILY, '2026-11-14', TW)
    expect(dailyMerge(mine, dailyAdd(daily, '2026-11-13', TW)).days).toEqual({ '2026-11-14': TW, '2026-11-13': TW })
    // M4 の前の控え（daily の欄が無い）は欄を持たない
    const old = await importText(backupFileText(makeBackup({ settings: defaultSettings(), fade: initialFade(), charts: [], results: [] }, '2026-11-01T00:00:00.000Z')))
    expect(old.kind === 'backup' && 'daily' in old.backup).toBe(false)
  }) // prettier-ignore
})

describe('今月のカレンダー', () => {
  it('2026-11 は 30 セル、11-01 は日曜（weekday 0）。今日より後は曲を出さない。今日だけ today', () => {
    const cal = calendarOf(EMPTY_DAILY, POOL2, 2026, 11, '2026-11-14')
    expect(cal).toHaveLength(30)
    expect(cal[0]).toMatchObject({ day: '2026-11-01', date: 1, weekday: 0, done: false })
    expect(cal.filter((c) => c.today).map((c) => c.day)).toEqual(['2026-11-14'])
    expect(cal.filter((c) => c.done)).toHaveLength(0)
    expect(cal[13]?.chartId).toBe(ODE)
    expect(cal[14]?.chartId).toBeNull()
    expect(calendarOf(EMPTY_DAILY, POOL2, 2028, 2, '2028-02-01')).toHaveLength(29)
  })
})
