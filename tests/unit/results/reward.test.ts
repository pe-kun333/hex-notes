import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { proposalFor } from '../../../src/app/calibration.ts'
import { clockText } from '../../../src/app/home-view.ts'
import {
  finishedPlay,
  newRun,
  runFrame,
  runInput,
  runPhase,
  runPress,
  runRelease,
  type FinishedPlay,
  type Run,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import {
  offTargetLines,
  resultView,
  rewardView,
  switchedNote,
} from '../../../src/app/result-view.ts'
import { perfAt } from '../../../src/clock/map.ts'
import {
  beginnerRules,
  initialJudge,
  neighborOf,
  rulesOf,
  summarizeJudge,
} from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import {
  awardsFor,
  bundledDone,
  isFirstClear,
  isTargetPlay,
  streakDays,
} from '../../../src/results/awards.ts'
import { bestOf, finishedSong } from '../../../src/results/best.ts'
import { isFinished } from '../../../src/results/record.ts'
import { offTargetWhy, rewardFor, type RewardLoad } from '../../../src/results/reward.ts'
import type { Chart, ResultRecord } from '../../../src/shared/types.ts'
import { parseResult } from '../../../src/storage/file.ts'
import { FRAME_MS, START_NOW, planActions } from '../../../tools/harness/autoplay.ts'
import { drive } from '../app/fallback-drive.ts'

// 報酬の切り分け（M3 の手順 8、M3-06、仮）。出どころ: m3-kickoff 手順 8 の期待値 (1)〜(9)（原型で検算した値）・§7-17・§7-33、
// design §4.4 L194（対象プレイ）・§5.4 L273（動画を使った回から称号集計が呼ばれない）・§6.1 L320（§4.4 のガードを単体試験）・
// §1.3 S1 L77・S3 L81、m6 renderS3 L833–869、decisions #5・#63・#71 (b)・#74・#91 (a)。記録は c1・ableton/2/octave・
// beginner・固定・1.0・全鍵・skipped 0・at 2026-11-11T12:00:00.000Z（today。昨日は 11-10）、dayOf は at の先頭 10 文字、
// 同梱曲 ['c1']。A ＝ 自前音源、V ＝ 動画の回、W ＝ 切替の回（V に fallbackAt 9001）、W2 ＝ W に skipped 2。

const TODAY = '2026-11-11'
const DAY = (iso: string): string => iso.slice(0, 10)
const VID = 'M7lc1UVf-VE'
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
  at: `${TODAY}T12:00:00.000Z`,
  acc: 0.8,
  rank: 'A',
  counts: { perfect: 1, great: 0, good: 0, near: 0, miss: 0 },
  selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 },
  syncUsed: { kind: 'audio' },
  offsetUsed: 0,
  skipped: 0,
  ...over,
})
const A = (over: Partial<ResultRecord> = {}): ResultRecord => rec(over)
const V = (over: Partial<ResultRecord> = {}): ResultRecord =>
  rec({
    clock: 'video',
    acc: 0.95,
    syncUsed: { kind: 'youtube', videoId: VID, offset: 3, rate: 1 },
    ...over,
  })
const W = (over: Partial<ResultRecord> = {}): ResultRecord =>
  rec({
    clock: 'video',
    acc: 0.99,
    syncUsed: { kind: 'youtube', videoId: VID, offset: 3, rate: 1, fallbackAt: 9001 },
    ...over,
  })

describe('対象プレイの述語（期待値 (1)）', () => {
  it('isTargetPlay: A 真、V・W・fallbackAt 0・{audio, fallbackAt 1200} 偽（offset・rate は読まない）', () => {
    expect([A(), V(), W(), W({ syncUsed: { kind: 'youtube', videoId: VID, offset: 3, rate: 1, fallbackAt: 0 } }), rec({ syncUsed: { kind: 'audio', fallbackAt: 1200 } })].map(isTargetPlay)).toEqual([true, false, false, false, false])
    expect([A(), V(), W()].map(offTargetWhy)).toEqual([null, 'video', 'switched'])
  }) // prettier-ignore
})

describe('S3 の門 rewardFor（期待値 (2)、design §5.4 L273）', () => {
  const run = async (r: ResultRecord, saved: readonly ResultRecord[] = []): Promise<{ calls: number; out: Awaited<ReturnType<typeof rewardFor>> }> => {
    const load = vi.fn(async (): Promise<RewardLoad> => ({ records: saved, bundledIds: ['c1'] }))
    const out = await rewardFor(r, load, { today: TODAY, dayOf: DAY })
    return { calls: load.mock.calls.length, out }
  } // prettier-ignore

  it('動画を使った回は集計を呼ばない（load 0 回・awards 無し）: V・W・W2・fallbackAt 0・rate 0.75 の動画の回・動画が先に ENDED の回', async () => {
    const cases: [ResultRecord, string][] = [
      [V(), 'video'],
      [W(), 'switched'],
      [W({ skipped: 2 }), 'switched'],
      [
        W({ syncUsed: { kind: 'youtube', videoId: VID, offset: 3, rate: 1, fallbackAt: 0 } }),
        'switched',
      ],
      [V({ rate: 0.75 }), 'video'],
      [V({ aborted: true }), 'video'],
    ]
    for (const [r, why] of cases) {
      const x = await run(r)
      expect(x.calls).toBe(0)
      expect(x.out).toEqual({ target: false, why })
      expect('awards' in x.out).toBe(false)
    }
  })

  it('自前音源の回は 1 回: A（保存 0 件）→ 初クリア・同梱 1 曲完走、keyset dfjk と途中終了も通す（counted は集計の側）', async () => {
    const a = await run(A())
    expect(a.calls).toBe(1)
    expect(a.out).toEqual({ target: true, awards: { titles: ['初クリア', '同梱 1 曲完走'], streak: 1, done: 1, total: 1, counted: true } })
    for (const r of [A({ keyset: 'dfjk' }), A({ aborted: true })]) expect((await run(r)).calls).toBe(1)
  }) // prettier-ignore
})

describe('対象外の文と、直す前の誤り（期待値 (3)）', () => {
  it('「この回は対象外です。…」: デイリーなし、主語は切替の回だけ別、括弧は完走の回だけ「スコアと自己ベスト」', () => {
    expect(offTargetLines('video', isFinished(V()))).toEqual(['この回は対象外です。YouTube 再生の曲は端末内だけに記録します。称号・ストリークは自前音源のプレイだけが対象です（スコアと自己ベストは残ります）。'])
    expect(offTargetLines('switched', isFinished(W()))).toEqual(['この回は対象外です。途中で動画なしに切り替わった回は端末内だけに記録します。称号・ストリークは自前音源のプレイだけが対象です（スコアは残ります）。'])
    for (const r of [W({ skipped: 2 }), V({ rate: 0.75 }), V({ aborted: true })]) expect(offTargetLines(offTargetWhy(r) ?? 'video', isFinished(r))[0]).toMatch(/（スコアは残ります）。$/)
    expect(offTargetLines('video', true).join('')).not.toContain('デイリー')
    // 直す前: 動画の回でも集計して counted 偽 →「練習記録は…」と出ていた
    const before = awardsFor([A()], V(), { today: TODAY, bundledIds: ['c1'], dayOf: DAY })
    expect(before).toEqual({ titles: [], streak: 1, done: 1, total: 1, counted: false })
    expect(rewardView(before).lines).toEqual(['練習記録は称号・ストリークの対象になりません。'])
  }) // prettier-ignore
})

describe('集計の側は変えない（期待値 (4)）', () => {
  it('今日が V と W だけならストリーク 0、昨日に自前音源 1 件で 1。同梱曲の完走 0、初クリアは自前音源の回だけ', () => {
    expect(streakDays([V(), W()], TODAY, DAY)).toBe(0)
    expect(streakDays([V(), W(), A({ at: '2026-11-10T12:00:00.000Z' })], TODAY, DAY)).toBe(1)
    expect(bundledDone([V(), W()], ['c1'])).toBe(0)
    const v = V()
    expect(isFirstClear([v], v)).toBe(false)
    const a = A()
    expect(isFirstClear([V(), W(), a], a)).toBe(true)
  })
})

describe('切替の回は完走・自己ベストの外（期待値 (5)、手順 2 の安全弁の後の不変）', () => {
  const key = {
    chartId: 'c1',
    variantId: 'ableton/2/octave',
    profile: 'beginner',
    clock: 'video',
  } as const
  it('isFinished は W・fallbackAt 0 で偽。video の箱は V（0.95）、novideo の箱は A、W だけなら null。parseResult は 9001・0 を通し −500 は null', () => {
    const a = A()
    const v = V()
    const w = W()
    expect([isFinished(w), isFinished(W({ syncUsed: { kind: 'youtube', videoId: VID, offset: 3, rate: 1, fallbackAt: 0 } }))]).toEqual([false, false])
    expect(bestOf([a, v, w], key)).toBe(v)
    expect(bestOf([a, v, w], { ...key, clock: 'novideo' })).toBe(a)
    expect(bestOf([w], key)).toBeNull()
    expect(parseResult(W())).not.toBeNull()
    expect(parseResult(W({ syncUsed: { kind: 'youtube', videoId: VID, offset: 3, rate: 1, fallbackAt: 0 } }))).not.toBeNull()
    expect(parseResult(W({ syncUsed: { kind: 'youtube', videoId: VID, offset: 3, rate: 1, fallbackAt: -500 } }))).toBeNull()
  }) // prettier-ignore
})

describe('S1 の完走印は対象プレイだけ（期待値 (6)、§7-33 を採った）', () => {
  it('finishedSong: [V]・[W]・[V, W] 偽、[V, A] 真、自前音源の練習記録（dfjk）だけ 偽', () => {
    const f = (rs: ResultRecord[]): boolean => finishedSong(rs, 'c1', 'beginner')
    expect([f([V()]), f([W()]), f([V(), W()]), f([V(), A()]), f([A({ keyset: 'dfjk' })])]).toEqual([false, false, false, true, false])
  }) // prettier-ignore
})

/** S3 の入力（記録から。判定のまとめは要る欄だけ） */
function play(r: ResultRecord, over: Partial<FinishedPlay> = {}): FinishedPlay {
  const judge = { ...summarizeJudge(initialJudge([], beginnerRules())), acc: r.acc, rank: r.rank, counts: r.counts, selfRate: r.selfRate, skipped: r.skipped }
  return {
    chartId: r.chartId, variantId: r.variantId, name: 'きらきら星', judge, audioLateMaxMs: 0, samples: [], offsetUsed: 0,
    keyset: r.keyset as FinishedPlay['keyset'], mode: r.mode, rate: r.rate, practice: null, calibEligible: r.clock === 'novideo', weak: null,
    chords: { hit: 0, total: 0 }, shapes: { total: 0, cluster: 0, shell: 0, cross: 0 }, aborted: r.aborted === true,
    clock: r.clock, syncUsed: r.syncUsed, videoEnded: false, record: r, ...over,
  }
} // prettier-ignore

describe('S3 の曲の行・完走の行・切替の注記（期待値 (7)）', () => {
  const v = (r: ResultRecord, over: Partial<FinishedPlay> = {}): ReturnType<typeof resultView> =>
    resultView(play(r, over))
  const finRow = (r: ResultRecord): string | undefined => new Map(v(r).rows).get('完走')

  it('曲の行の末: A「自前音源」、V「YouTube」、W と W2「YouTube（途中で動画なしへ切替）」、ENDED が先の回は V と同じ', () => {
    expect(v(A()).song).toMatch(/ ・ 自前音源$/)
    expect(v(V()).song).toMatch(/ ・ YouTube$/)
    expect(v(W()).song).toMatch(/ ・ YouTube（途中で動画なしへ切替）$/)
    expect(v(W({ skipped: 2 })).song).toMatch(/ ・ YouTube（途中で動画なしへ切替）$/)
    expect(v(V({ aborted: true }), { videoEnded: true }).song).toMatch(/ ・ YouTube$/)
  }) // prettier-ignore

  it('完走の行: W・W2「いいえ（途中で動画なしへ切替。…）」（枝は 途中終了 → 切替 → 中断あり）、V は完走印の注、ENDED が先の回は途中終了', () => {
    expect(finRow(W())).toBe('いいえ（途中で動画なしへ切替。自己ベストと完走の対象外）')
    expect(finRow(W({ skipped: 2 }))).toBe('いいえ（途中で動画なしへ切替。自己ベストと完走の対象外）')
    expect(finRow(V())).toBe('はい（固定テンポ・1.0 倍・全鍵。完走印は自前音源の回だけ）')
    expect(finRow(A())).toBe('はい（固定テンポ・1.0 倍・全鍵）')
    expect(finRow(V({ aborted: true }))).toBe('いいえ（途中終了。自己ベストと完走の対象外）')
    expect(v(V({ aborted: true }), { videoEnded: true }).notes).toEqual(['動画が先に終わりました'])
  }) // prettier-ignore

  it('切替の注記「曲の頭から m:ss で動画なしに切り替わりました。」は秒を切り捨てる: 8,990 → 0:08、9,001・9,500・9,999 → 0:09、10,000 → 0:10', () => {
    expect([8990, 9001, 9500, 9999, 10_000].map((ms) => switchedNote(ms))).toEqual(['0:08', '0:09', '0:09', '0:09', '0:10'].map((t) => `曲の頭から ${t} で動画なしに切り替わりました。`))
    // 切り捨てずに渡すと 0:10 になる
    expect(clockText(9.5)).toBe('0:10')
    expect(v(W()).notes).toEqual(['曲の頭から 0:09 で動画なしに切り替わりました。'])
  }) // prettier-ignore
})

describe('校正の提案（期待値 (8)。この手順は校正の門に触らない）', () => {
  it('切替の回の proposalFor は null（calibEligible 偽 ＝ 手順 2 の安全弁）', () => {
    expect(
      proposalFor({ ...play(W()), calibEligible: false, samples: new Array<number>(40).fill(10) }),
    ).toBeNull()
  })
})

// ---------- 実の記録（期待値 (9)、完了条件） ----------

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TWINKLE = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', 'twinkle.hexnote.json'), 'utf8')) as Chart // prettier-ignore

/** 動画なしの twinkle を SD 0 で自動プレイ（play-runner.test.ts の autoplay と同じ流れ） */
function novideoRun(): Run {
  const v = TWINKLE.variants?.find((x) => x.id === 'ableton/2/octave')
  if (v === undefined) throw new Error('譜面版が無い')
  const song: RunSong = { chartId: TWINKLE.id, name: TWINKLE.name, chart: TWINKLE, variant: v }
  const grid = buildKeyboardGrid(v.layout, 1, { left: 0, top: 0 })
  let r = runInput(newRun(song, { rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode) }), sound: { melody: true, accomp: true, click: false }, keyclick: false }), START_NOW, { kind: 'start' }).run
  const actions = planActions(r.notes, (ms) => perfAt(r.map, ms), () => 0)
  let k = 0
  for (let f = 1; runPhase(r) !== 'ended'; f++) {
    const now = START_NOW + f * FRAME_MS
    for (let a = actions[k]; a !== undefined && a.tsPerf <= now; a = actions[++k])
      r = a.kind === 'press' ? runPress(r, { code: a.code, tsPerf: a.tsPerf, lag: 0 }, a.tsPerf).run : runRelease(r, { code: a.code, tsPerf: a.tsPerf, forced: false }, a.tsPerf).run
    r = runFrame(r, now, now).run
  }
  return r
} // prettier-ignore

describe('play-runner が作った実の記録を門へ（期待値 (9)、完了条件「動画を使った回から称号集計が呼ばれない」）', () => {
  const META = { id: 'x', at: `${TODAY}T12:00:00.000Z`, profile: 'beginner' } as const
  const gate = async (r: ResultRecord): Promise<{ calls: number; out: Awaited<ReturnType<typeof rewardFor>> }> => {
    const load = vi.fn(async (): Promise<RewardLoad> => ({ records: [], bundledIds: [] }))
    const out = await rewardFor(r, load, { today: TODAY, dayOf: DAY })
    return { calls: load.mock.calls.length, out }
  } // prettier-ignore

  it('動画なしの twinkle（42 音・SD 0）: novideo・audio・acc 1 → 集計 1 回・初クリア', async () => {
    const rec0 = finishedPlay(novideoRun(), META).record
    expect([rec0.clock, rec0.syncUsed, rec0.acc]).toEqual(['novideo', { kind: 'audio' }, 1])
    const g = await gate(rec0)
    expect(g.calls).toBe(1)
    expect(g.out).toMatchObject({ target: true, awards: { titles: ['初クリア'], counted: true } })
  }) // prettier-ignore

  it('動画の回の通し（クリック譜面・ダミー）と凍結 → 切替の回（fallbackAt 9,001）: 集計 0 回・awards 無し', async () => {
    const video = finishedPlay(drive().run, META).record
    const switched = finishedPlay(drive({ script: [{ at: 10_000, run: (c) => c.d.stuck(600_000, c.now) }] }).run, META).record
    expect([video.clock, video.syncUsed.kind, video.syncUsed.fallbackAt]).toEqual(['video', 'youtube', undefined])
    expect(switched.syncUsed.fallbackAt).toBe(9001)
    for (const [r, why] of [[video, 'video'], [switched, 'switched']] as const) {
      const g = await gate(r)
      expect(g).toEqual({ calls: 0, out: { target: false, why } })
    }
  }) // prettier-ignore
})
