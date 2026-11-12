import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUDIO_BADGE,
  USE_VIDEO_NOTES,
  VIDEO_BADGE,
  songCard,
  songSeconds,
  useVideoDefault,
  versionChoice,
  videoBadge,
  videoPlayable,
  type CardContext,
} from '../../../src/app/home-view.ts'
import {
  SYNC_NARROW_TEXT,
  SYNC_TEMPO_NOTE,
  canEmbedSync,
  canNext,
  headRoom,
  importStep,
  importSteps,
  initialImport,
  syncSourceOf,
  type ImportEvent,
  type ImportState,
} from '../../../src/app/import-view.ts'
import { withSync, withVariant } from '../../../src/app/library-view.ts'
import { GOOGLE_PRIVACY_URL, TERMS_TEXT, YOUTUBE_TERMS_URL } from '../../../src/app/terms.ts'
import { parseSmf } from '../../../src/chart/smf.ts'
import { computeChartId } from '../../../src/chart/hash.ts'
import { validateChart } from '../../../src/chart/validate.ts'
import { clockRead, clockTick, initialClock } from '../../../src/clock/clock-source.ts'
import { createDummyVideo } from '../../../src/clock/dummy-video.ts'
import { axisOf, fromChartMs } from '../../../src/clock/map.ts'
import {
  initialSyncTap,
  syncTapDiag,
  syncTapDrift,
  syncTapFitOffset,
  syncTapPlan,
  syncTapStep,
  syncTapVerdict,
  tapVideoMs,
  type SyncTapState,
} from '../../../src/clock/sync-tap.ts'
import { lateEdge, PROFILES } from '../../../src/judge/windows.ts'
import { gauss, mulberry32 } from '../../../src/shared/random.ts'
import type { Chart, Pulse, ResultRecord, SyncSource } from '../../../src/shared/types.ts'
import { chartFileText, importChart } from '../../../src/storage/file.ts'
import { syncRow } from '../../../src/telemetry/rows.ts'
import { format0TwoNotes } from '../../fixtures/smf/build.ts'

// S5 段 4 と S1 の印・切替（M3 の手順 4、M3-03 後半、仮）。出どころ: m3-kickoff 手順 4 の期待値 (1)〜(10)（2026-11-11・12 に
// 実物と原型で検算した値）・§7-6・§7-23・§7-24・§7-25、decisions #98（rate 1.0 固定）・#100（規約へのリンク）・#104（注意の
// 門）、m6 段 4 L491–500・S1 L763・L772–780。100 BPM ＝ 拍 600 ms。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const P100: Pulse = { resolution: 240, tempo: [{ beat: 0, bpm: 100 }] }
const PLAN = syncTapPlan(P100)
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4
const r1 = (x: number): number => Math.round(x * 10) / 10
const TAPS = [1.8, 2.42, 2.98, 3.62, 4.18, 4.82, 5.38, 6.02].map((x) => x * 1000)
const TWINKLE = JSON.parse(
  readFileSync(path.join(root, 'content', 'charts', 'pd', 'twinkle.json'), 'utf8'),
) as Chart
const YT: SyncSource = {
  kind: 'youtube',
  videoId: 'M7lc1UVf-VE',
  offset: 1.8025,
  rate: 1,
  measured: true,
}
const W = lateEdge(PROFILES.beginner.windows)

const run = (events: readonly ImportEvent[], s: ImportState): ImportState =>
  events.reduce((cur, ev) => {
    const n = importStep(cur, ev)
    if (n === 'exit') throw new Error('exit')
    return n
  }, s)
const FILE = { fileName: 'two.mid', smf: parseSmf(format0TwoNotes()) }
const loaded = (): ImportState => run([{ kind: 'loaded', file: FILE }], initialImport('octave'))

describe('段の状態機械（期待値 (1)）', () => {
  it('既定（動画なし）で next×4・back×4 → [1,2,3,5,5,3,2,1,1]（今のまま）', () => {
    let s = loaded()
    const seen = [s.step]
    for (const k of ['next', 'next', 'next', 'next', 'back', 'back', 'back', 'back'] as const) {
      s = run([{ kind: k }], s)
      seen.push(s.step)
    }
    expect(seen).toEqual([1, 2, 3, 5, 5, 3, 2, 1, 1])
    expect(importSteps(s)).toEqual([1, 2, 3, 5])
  })

  it('段 5 で attachVideo → 段 4・video 真。結果なしで canNext 偽、保存できる結果で next → 5、そこから back×4 → [4,3,2,1]', () => {
    let s = run(
      [{ kind: 'next' }, { kind: 'next' }, { kind: 'next' }, { kind: 'attachVideo' }],
      loaded(),
    )
    expect([s.step, s.video]).toEqual([4, true])
    expect(importSteps(s)).toEqual([1, 2, 3, 4, 5])
    expect(canNext(s)).toBe(false)
    expect(run([{ kind: 'next' }], s).step).toBe(4)
    s = run(
      [{ kind: 'videoId', id: 'M7lc1UVf-VE' }, { kind: 'synced', source: YT }, { kind: 'next' }],
      s,
    )
    expect(s.step).toBe(5)
    const seen: number[] = []
    for (let i = 0; i < 4; i++) {
      s = run([{ kind: 'back' }], s)
      seen.push(s.step)
    }
    expect(seen).toEqual([4, 3, 2, 1])
  })

  it('skipVideo → 段 5・video 偽（sync を捨てる）。ID を替える・段 1 の読み直しは sync だけ捨てる（video・videoId は残す）', () => {
    const at4 = run([{ kind: 'next' }, { kind: 'next' }, { kind: 'next' }, { kind: 'attachVideo' }, { kind: 'videoId', id: 'M7lc1UVf-VE' }, { kind: 'synced', source: YT }], loaded())
    expect(run([{ kind: 'skipVideo' }], at4)).toMatchObject({ step: 5, video: false, sync: null })
    expect(run([{ kind: 'videoId', id: 'aaaaaaaaaaa' }], at4)).toMatchObject({ video: true, videoId: 'aaaaaaaaaaa', sync: null })
    expect(run([{ kind: 'videoId', id: 'M7lc1UVf-VE' }], at4)).toBe(at4)
    expect(run([{ kind: 'loaded', file: FILE }], at4)).toMatchObject({ video: true, videoId: 'M7lc1UVf-VE', sync: null })
  }) // prettier-ignore

  it('箱の内寸 479 px → iframe を作らず 1 文、480 px → 作る。段 4 に常に出す 1 文', () => {
    expect([canEmbedSync(479), canEmbedSync(480)]).toEqual([false, true])
    expect(SYNC_NARROW_TEXT).toBe('動画の同期は幅 512 px 以上の窓で行ってください。')
    expect(SYNC_TEMPO_NOTE).toBe('テンポが MIDI と違う演奏の動画は、初版では合わせられません。')
  })
})

/** ダミー動画（刻み 15 ms・種 7・rate 1.0）を now 0 で再生し 60 fps で時計を回す。真の offset 1.8 s、拍 k は 1,800＋600k＋jitter */
function dummyTaps(jitter: (k: number) => number): number[] {
  const d = createDummyVideo({ stepMs: 15, seed: 7, rate: 1 })
  let s = initialClock({ mode: 'video', t0: 0 })
  d.play(0)
  const pending = PLAN.map((c, k) => 1800 + c + jitter(k)).sort((a, b) => a - b)
  const video: number[] = []
  const F = 1000 / 60
  for (let i = 0; video.length < pending.length; i++) {
    const now = i * F
    s = clockTick(s, now, d.sample(now)).state
    while (video.length < pending.length && (pending[video.length] as number) < now + F)
      video.push(tapVideoMs(clockRead(s, now).map, pending[video.length] as number))
  }
  return video
}

describe('当てはめ（rate 1.0 固定。期待値 (2)・(3)・(7)、decisions #98）', () => {
  it('(2a) タップ [1.80 … 6.02] s → offset 1.8025・rate 1・残差 SD 19.8 ms・保存できる・おすすめ無し、診断 0.9996（2 × 標準誤差 1.02%）で注意なし', () => {
    const f = syncTapFitOffset(PLAN, TAPS)
    const d = syncTapDiag(PLAN, TAPS)
    if (f === null || d === null) throw new Error('fit')
    expect([r4(f.offset), f.rate, r1(f.residualSd), f.n]).toEqual([1.8025, 1, 19.8, 8])
    expect(syncTapVerdict(f.residualSd)).toEqual({ savable: true, retry: false })
    expect([r4(d.rate), r4(2 * d.se)]).toEqual([0.9996, 0.0102])
    expect(syncTapDrift(d, 180_000, W).warn).toBe(false)
  })

  it('(2b) 雑音あり（ダミー動画＋ガウス SD 30 ms、種 99）→ 残差 SD 31.5 ms・offset の誤差 19.9 ms・保存できる・おすすめあり、診断 1.0012（2 × 標準誤差 1.62%）で注意なし', () => {
    const rng = mulberry32(99)
    const jit = PLAN.map(() => gauss(rng) * 30)
    const v = dummyTaps((k) => jit[k] as number)
    const f = syncTapFitOffset(PLAN, v)
    const d = syncTapDiag(PLAN, v)
    if (f === null || d === null) throw new Error('fit')
    expect([r1(f.residualSd), r1((f.offset - 1.8) * 1000)]).toEqual([31.5, 19.9])
    expect(syncTapVerdict(f.residualSd)).toEqual({ savable: true, retry: true })
    expect([r4(d.rate), r4(2 * d.se)]).toEqual([1.0012, 0.0162])
    expect(syncTapDrift(d, 180_000, W).warn).toBe(false)
  }) // prettier-ignore

  it('(3) 1 拍遅れて打った回（真の offset 1.5）→ 起点 0 で 2.1000・残差 0、「1 拍前へ」（起点 1）で 1.5000、attempts は増えない、「1 拍後ろへ」で戻る', () => {
    const late = PLAN.map((_, k) => 1500 + 600 * (k + 1))
    const planOf = (start: number): number[] => syncTapPlan(P100, 8, start)
    let s: SyncTapState = syncTapStep(initialSyncTap(), { kind: 'start', now: 0 }, PLAN)
    for (const [i, v] of late.entries()) s = syncTapStep(s, { kind: 'tap', videoMs: v, now: 1000 + i * 600 }, PLAN)
    expect([s.phase, r4(s.result?.fit.offset ?? NaN), r1(s.result?.fit.residualSd ?? NaN), s.result?.start]).toEqual(['done', 2.1, 0, 0])
    const e = syncTapStep(s, { kind: 'refit', start: 1 }, PLAN, planOf)
    expect([r4(e.result?.fit.offset ?? NaN), e.result?.start, e.attempts]).toEqual([1.5, 1, 1])
    expect(r4(syncTapStep(e, { kind: 'refit', start: 0 }, PLAN, planOf).result?.fit.offset ?? NaN)).toBe(2.1)
    // 起点 −1（拍 −1 は最初のテンポで外挿）
    expect(planOf(-1)[0]).toBe(-600)
    // planOf が無い・tapping の間・同じ起点は効かない
    expect(syncTapStep(s, { kind: 'refit', start: 1 }, PLAN)).toBe(s)
  }) // prettier-ignore

  it('(7) sync 行（(2a) の回）→ {residualSd 19.8, attempts 1, offset 1.8025, rate 0.9996}、動画 ID を持たない', () => {
    let s: SyncTapState = syncTapStep(initialSyncTap(), { kind: 'start', now: 0 }, PLAN)
    for (const [i, v] of TAPS.entries())
      s = syncTapStep(s, { kind: 'tap', videoMs: v, now: 1000 + i * 600 }, PLAN)
    if (s.result === null) throw new Error('result')
    const row = syncRow('sha256:x', s.result, s.attempts, '2026-11-12T00:00:00.000Z')
    expect(row).toMatchObject({ residualSd: 19.8, attempts: 1, offset: 1.8025, rate: 0.9996 })
    expect('videoId' in row).toBe(false)
  })
})

describe('テンポが違う動画の注意（期待値 (4)。門は x ＞ 入門者の遅れ側の窓 234 ms かつ |rate − 1| ＞ 2 × 標準誤差、#104）', () => {
  const periodic = (rate: number): number[] =>
    PLAN.map((x) => fromChartMs(x, { offset: 1.5, rate }))
  it('窓は lateEdge（入門者 234 ms）', () => {
    expect(W).toBe(234)
  })

  it('(a) rate 1.04: rate 1 固定の残差 SD 56.5 ms で保存できる、診断 1.0400・x は 180 秒で 7,200、30 秒で 1,200 → どちらも注意', () => {
    const v = periodic(1.04)
    const f = syncTapFitOffset(PLAN, v)
    const d = syncTapDiag(PLAN, v)
    if (f === null || d === null) throw new Error('fit')
    expect(r1(f.residualSd)).toBe(56.5)
    expect(syncTapVerdict(f.residualSd).savable).toBe(true)
    expect(r4(d.rate)).toBe(1.04)
    expect(syncTapDrift(d, 180_000, W)).toEqual({ x: 7200, warn: true })
    expect(syncTapDrift(d, 30_000, W)).toEqual({ x: 1200, warn: true })
  })

  it('(b) 180 秒で 1.0012（x 216）→ 注意なし、1.0014（x 252）→ 注意', () => {
    const at = (rate: number) => syncTapDrift(syncTapDiag(PLAN, periodic(rate)) ?? { rate: NaN, se: 0 }, 180_000, W)
    expect(at(1.0012)).toEqual({ x: 216, warn: false })
    expect(at(1.0014)).toEqual({ x: 252, warn: true })
  }) // prettier-ignore

  it('(d) 雑音のある回（200 BPM のタップ、180 秒）→ 診断 1.0219・2 × 標準誤差 2.27% で注意なし（x 3,942）', () => {
    const plan = syncTapPlan({ resolution: 240, tempo: [{ beat: 0, bpm: 200 }] })
    const taps = [1.84, 2.08, 2.42, 2.68, 3.02, 3.28, 3.6, 3.86].map((x) => x * 1000)
    const d = syncTapDiag(plan, taps)
    if (d === null) throw new Error('diag')
    expect([r4(d.rate), r4(2 * d.se)]).toEqual([1.0219, 0.0227])
    expect(syncTapDrift(d, 180_000, W)).toEqual({ x: 3942, warn: false })
  })
})

describe('保存に sync を載せる・外す（期待値 (5)・(10)）', () => {
  it('(5) twinkle に syncSourceOf の sync を載せる → 検査 ok・id 同じ・書き出し → 取り込みと版を足した後も同じ。拍 0 → 1,802.5・拍 7（4,375 ms）→ 6,177.5', async () => {
    const src = syncSourceOf('M7lc1UVf-VE', { offset: 1.80249 })
    expect(src).toEqual(YT)
    const c = withSync(TWINKLE, src)
    expect(validateChart(c).ok).toBe(true)
    expect(await computeChartId(c)).toBe(TWINKLE.id)
    expect(c.id).toBe(TWINKLE.id)
    const back = await importChart(JSON.parse(chartFileText(c)))
    if (!back.ok) throw new Error(back.issues.join())
    expect([back.idChanged, back.chart.sync]).toEqual([false, { sources: [YT] }])
    const v4 = withVariant(c, { layout: 'ableton', limit: 4 })
    expect(v4.sync).toEqual({ sources: [YT] })
    const ax = axisOf([src])
    expect([fromChartMs(0, ax), fromChartMs(4375, ax)]).toEqual([1802.5, 6177.5])
    // (2a) の診断 0.9996 なら、この曲（約 30 秒）の x は 12 ms で注意の門を越えない
    const d = syncTapDiag(PLAN, TAPS)
    if (d === null) throw new Error('diag')
    expect(syncTapDrift(d, songSeconds(TWINKLE) * 1000, W)).toEqual({ x: 12, warn: false })
  })

  it('(10) withSync(c, null) → sources 空、offset 1.5 でやり直し → その値・measured 真（どちらも id 同じ・検査 ok）', async () => {
    const c = withSync(TWINKLE, YT)
    const off = withSync(c, null)
    expect(off.sync).toEqual({ sources: [] })
    const redo = withSync(c, syncSourceOf('M7lc1UVf-VE', { offset: 1.5 }))
    expect(redo.sync?.sources[0]).toMatchObject({ offset: 1.5, measured: true })
    for (const x of [off, redo]) {
      expect(validateChart(x).ok).toBe(true)
      expect(await computeChartId(x)).toBe(TWINKLE.id)
    }
  })

  it('(10) 持ち込み直し: 前の譜面の sync を 1 度写し（inherit）、そのまま保存すれば前の sync（measured も）。外す・やり直すとその後は写し直さない', () => {
    const prev: SyncSource = { ...YT, measured: false }
    const at5 = run([{ kind: 'next' }, { kind: 'next' }, { kind: 'next' }], loaded())
    const inh = run([{ kind: 'inherit', source: prev }], at5)
    expect([inh.sync, inh.inherited, inh.inheritSeen]).toEqual([prev, true, true])
    expect(run([{ kind: 'inherit', source: YT }], inh)).toBe(inh)
    const removed = run([{ kind: 'removeVideo' }, { kind: 'inherit', source: prev }], inh)
    expect([removed.sync, removed.inherited]).toEqual([null, false])
    // やり直し: その動画 ID で段 4 へ。前の同期は新しい結果が来るまで残す（段 4 から戻っても失わない。次へも押せる）
    const redo = run([{ kind: 'attachVideo' }], inh)
    expect(redo).toMatchObject({ step: 4, video: true, videoId: 'M7lc1UVf-VE', sync: prev, inherited: true })
    expect(canNext(redo)).toBe(true)
    expect(run([{ kind: 'synced', source: YT }], redo)).toMatchObject({ sync: YT, inherited: false })
  }) // prettier-ignore
})

describe('頭の余白（期待値 (6)）', () => {
  const head = (offset: number) =>
    headRoom({ notes: [{ midi: 60, beat: 0, dur: 1 }], pulse: P100 }, { offset, rate: 1 })
  it('最初の音が拍 0: offset 3.0 → 注意なし、1.2 → 注意（流れる時間）、0.2 → 注意 2 つ、−0.2 → 保存不可', () => {
    expect(head(3)).toEqual({ ms: 3000, savable: true, notes: [] })
    expect([head(1.2).savable, head(1.2).notes.length]).toEqual([true, 1])
    expect(head(0.2).notes).toHaveLength(2)
    expect(head(0.2).notes[0]).toBe('最初の音が判定されないことがあります。')
    expect(head(-0.2).savable).toBe(false)
    // validateChart は負の offset を通す（段 4 で断る）
    expect(validateChart(withSync(TWINKLE, { ...YT, offset: -0.2 })).ok).toBe(true)
  })
})

describe('S1 の印・既定・自己ベストの clock（期待値 (8)）', () => {
  const yt = withSync(TWINKLE, YT)
  const pick = versionChoice(yt, 'ableton', null).pick
  if (pick === null) throw new Error('pick')
  const vid = `${pick.layout}/${pick.limit}/${pick.fold}`
  const rec = (id: string, clock: 'video' | 'novideo', acc: number): ResultRecord => ({
    id, chartId: TWINKLE.id, variantId: vid, profile: 'beginner', clock, mode: 'fixed', rate: 1, keyset: 'all', at: '2026-11-12T00:00:00.000Z', acc, rank: 'A',
    counts: { perfect: 1, great: 0, good: 0, near: 0, miss: 0 }, selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 },
    syncUsed: clock === 'video' ? { kind: 'youtube', videoId: 'M7lc1UVf-VE' } : { kind: 'audio' }, offsetUsed: 0, skipped: 0,
  }) // prettier-ignore
  const ctx = (clock?: 'video' | 'novideo'): CardContext => ({
    preferred: 'ableton',
    deviceLimit: null,
    profile: 'beginner',
    records: [rec('a', 'novideo', 0.942), rec('b', 'video', 0.99)],
    tutorialId: 'tut',
    ...(clock === undefined ? {} : { clock }),
  })

  it('sources 空 → 印「自前音源」・既定 偽・切替なし。youtube →「動画あり／なしで遊べる」・既定 はい', () => {
    expect([videoBadge(TWINKLE.sync), useVideoDefault(TWINKLE.sync?.sources[0]), videoPlayable(TWINKLE.sync)]).toEqual([AUDIO_BADGE, false, false])
    expect([videoBadge(yt.sync), useVideoDefault(yt.sync?.sources[0]), videoPlayable(yt.sync)]).toEqual([VIDEO_BADGE, true, true])
    expect([AUDIO_BADGE, VIDEO_BADGE]).toEqual(['自前音源', '動画あり／なしで遊べる'])
    expect(songCard('x', yt, ctx()).badge).toBe(VIDEO_BADGE)
  }) // prettier-ignore

  it('自己ベスト: はい（video）99.0%／いいえ（novideo）94.2%、clock を省けば 94.2%', () => {
    expect(songCard('x', yt, ctx('video')).best).toMatch(/^自己ベスト 99\.0% /)
    expect(songCard('x', yt, ctx('novideo')).best).toMatch(/^自己ベスト 94\.2% /)
    expect(songCard('x', yt, ctx()).best).toMatch(/^自己ベスト 94\.2% /)
  })

  it('門が偽（build）→ youtube の曲も印「自前音源」・切替なし（clock は novideo で 94.2%）', () => {
    expect([videoBadge(yt.sync, false), videoPlayable(yt.sync, false)]).toEqual([
      AUDIO_BADGE,
      false,
    ])
  })

  it('「動画を使う」の注記は はい／いいえ の 2 文（m6 L778–780）', () => {
    // 手順 5 で埋め込み不可を記録した曲の 1 文（noEmbed）を足した
    expect(USE_VIDEO_NOTES).toMatchObject({
      yes: '動画の音に合わせて遊びます。称号・ストリークの対象外（スコアと自己ベストは残ります）。',
      no: 'ピアノ音＋伴奏で遊びます。称号・ストリークの対象。',
    })
  })
})

describe('部品の走り出しと止まり（期待値 (9)）', () => {
  it('ダミー動画を再生 → 止める → 再生し直す: 時計の事象は resync(start) → held(paused) → resync(unheld)（start でない再アンカーでも走り出す）', () => {
    const d = createDummyVideo({ stepMs: 15, seed: 7 })
    let s = initialClock({ mode: 'video', t0: 0 })
    const evs: string[] = []
    const F = 1000 / 60
    for (let i = 0; i <= 360; i++) {
      const now = i * F
      if (i === 1) d.play(now)
      if (i === 120) d.setState('paused', now)
      if (i === 240) d.setState('playing', now)
      const r = clockTick(s, now, d.sample(now))
      s = r.state
      for (const e of r.out.events) if (e.kind === 'resync' || e.kind === 'held') evs.push(e.kind === 'resync' ? `resync(${e.reason})` : `held(${e.state})`)
    }
    expect(evs).toEqual(['resync(start)', 'held(paused)', 'resync(unheld)'])
  }) // prettier-ignore

  it('videoStarted の前の Space は数えない、tapping 中の videoStopped → idle・タップ 0・attempts 不変、次の再アンカーで再び tapping・タップ 0', () => {
    let s = syncTapStep(initialSyncTap(), { kind: 'tap', videoMs: 1, now: 0 }, PLAN)
    expect(s).toEqual(initialSyncTap())
    s = syncTapStep(s, { kind: 'start', now: 0 }, PLAN)
    s = syncTapStep(s, { kind: 'tap', videoMs: 1800, now: 100 }, PLAN)
    s = syncTapStep(s, { kind: 'cancel' }, PLAN)
    expect([s.phase, s.taps.length, s.attempts]).toEqual(['idle', 0, 0])
    s = syncTapStep(s, { kind: 'start', now: 5000 }, PLAN)
    expect([s.phase, s.taps.length]).toEqual(['tapping', 0])
  })
})

describe('規約へのリンクの行（decisions #100、文は仮）', () => {
  it('YouTube 利用規約と Google プライバシーポリシー（URL は Developer Policies III.A.1・III.A.2 に書かれた物。M3 の手順 10 で照合）', () => {
    expect(`${TERMS_TEXT.before}${TERMS_TEXT.terms}${TERMS_TEXT.middle}${TERMS_TEXT.privacy}${TERMS_TEXT.after}`).toBe('YouTube の動画は YouTube 利用規約と Google プライバシーポリシーのもとで再生されます。')
    expect([YOUTUBE_TERMS_URL, GOOGLE_PRIVACY_URL]).toEqual(['https://www.youtube.com/t/terms', 'http://www.google.com/policies/privacy'])
  }) // prettier-ignore
})
