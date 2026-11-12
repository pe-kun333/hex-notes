import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appliedText,
  calibEligibleOf,
  calibKindOf,
  calibOffset,
  driftText,
  proposalFor,
  proposalText,
  tempoDriftOf,
} from '../../../src/app/calibration.ts'
import {
  finishedPlay,
  newRun,
  runFrame,
  runInput,
  runOutcome,
  runPhase,
  runPress,
  runRelease,
  type Run,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import { calibText } from '../../../src/app/screens/home.ts'
import { rowBrief } from '../../../src/app/telemetry-view.ts'
import { proposeOffset, type OffsetVerdict } from '../../../src/judge/calibration-offset.ts'
import { neighborOf, rulesOf } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { perfAt } from '../../../src/clock/map.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import { isTargetPlay } from '../../../src/results/awards.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { memoryStorage, safeStorage, type KvStore } from '../../../src/storage/fallback.ts'
import {
  loadCalibration,
  offsetFor,
  saveCalibration,
  type Calibration,
} from '../../../src/storage/local.ts'
import { calibRow } from '../../../src/telemetry/rows.ts'
import { FRAME_MS, START_NOW, planActions } from '../../../tools/harness/autoplay.ts'
import { drive } from './fallback-drive.ts'

// 校正 段 2（M3 の手順 9、M3-08、仮）。出どころ: m3-kickoff 手順 9 の期待値 (1)〜(10)（原型で検算した値）・§7-34・§7-38、
// design §2.7 L139・§5.4 L275（youtube／audio で別の値）・§4.6 L202、decisions #40・#52 (b)・#55 (a)・#62・#77・#85 (e)、
// m6 S3 の提案帯 L381–384・L985。標本は平均 m ± a を交互（n は偶数）。

const AT = '2026-11-11T00:00:00.000Z'
const newKv = (): KvStore =>
  safeStorage(
    'local',
    () => memoryStorage(),
    () => {},
  )
/** 平均 m ± a を交互に n 個 */
const alt = (m: number, a: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => (i % 2 === 0 ? m + a : m - a))
/** SD が s になる a（n 個の交互の標本 SD ＝ a·√(n/(n−1))） */
const aFor = (sd: number, n: number): number => sd / Math.sqrt(n / (n - 1))
const ok = (v: OffsetVerdict): OffsetVerdict & { ok: true } => {
  if (!v.ok) throw new Error(`提案なし ${v.reason}`)
  return v
}

describe('段 2 の門と文（期待値 (1)）', () => {
  it('使った 0（youtube 未校正）・平均 ＋25・SD 12・n 40 → −25、内訳と適用後は YouTube の文。自前の回の文は今のまま', () => {
    const v = ok(proposeOffset(alt(25, aFor(12, 40), 40), 0))
    expect(v.offset).toBe(-25)
    expect(proposalText(v, 40, 0, 'youtube')).toEqual({
      title: '平均 ＋25 ms（少し遅め）→ オフセットを −25 ms にしますか',
      detail: 'ばらつき 12 ms、ヒット 40。YouTube のオフセットとして保存します。',
    })
    expect(appliedText('youtube', -25)).toBe('YouTube のオフセットを −25 ms にしました。')
    expect(proposalText(v, 40, 0).detail).toBe(
      'ばらつき 12 ms、ヒット 40。自前音源のオフセットとして保存します。',
    )
    expect(appliedText('audio', -25)).toBe('自前音源のオフセットを −25 ms にしました。')
  })

  it('門の境: 使った −25・平均 0 → なし、−19・平均 −37・SD 10・n 60 → ＋18、n 8 → −25・n 7 → なし、SD 30 → なし・29.9 → −25、平均 9.9 → なし・10 → −10、平均 ＋130 → −120 と上限の注記', () => {
    expect(proposeOffset(alt(0, aFor(12, 40), 40), -25)).toMatchObject({ ok: false, reason: 'small' })
    expect(ok(proposeOffset(alt(-37, aFor(10, 60), 60), -19)).offset).toBe(18)
    const n8 = alt(25, aFor(12, 8), 8)
    expect(ok(proposeOffset(n8, 0)).offset).toBe(-25)
    expect(proposeOffset(n8.slice(1), 0)).toMatchObject({ ok: false, reason: 'count' })
    expect(proposeOffset(alt(25, aFor(30, 40), 40), 0)).toMatchObject({ ok: false, reason: 'sd' })
    expect(ok(proposeOffset(alt(25, aFor(29.9, 40), 40), 0)).offset).toBe(-25)
    expect(proposeOffset(alt(9.9, aFor(12, 40), 40), 0)).toMatchObject({ ok: false, reason: 'small' })
    expect(ok(proposeOffset(alt(10, aFor(12, 40), 40), 0)).offset).toBe(-10)
    const big = ok(proposeOffset(alt(130, aFor(10, 20), 20), 0))
    expect(big.offset).toBe(-120)
    expect(proposalText(big, 20, 0, 'youtube').title).toContain('（上限 ±120 ms。それより大きいずれは残ります）')
  }) // prettier-ignore
})

describe('種別ごとの保存の通し（期待値 (2)）', () => {
  it('空 → audio −19（tap）→ youtube −25（propose）→ 次のその回は −25・自前の回は −19 → 自前の回の提案 ＋18 を audio に。保存先を audio 固定にすると audio −25・youtube 0', () => {
    const kv = newKv()
    expect([offsetFor(loadCalibration(kv), 'audio'), offsetFor(loadCalibration(kv), 'youtube')]).toEqual([0, 0])
    saveCalibration(kv, 'audio', { offsetMs: -19, at: AT, via: 'tap' })
    expect(offsetFor(loadCalibration(kv), 'youtube')).toBe(0)
    saveCalibration(kv, 'youtube', { offsetMs: ok(proposeOffset(alt(25, aFor(12, 40), 40), 0)).offset, at: AT, via: 'propose' })
    expect(loadCalibration(kv)).toEqual({ v: 1, audio: { offsetMs: -19, at: AT, via: 'tap' }, youtube: { offsetMs: -25, at: AT, via: 'propose' } })
    const c = loadCalibration(kv)
    expect([calibOffset(c, calibKindOf({ video: true })), calibOffset(c, calibKindOf({ video: false }))]).toEqual([-25, -19])
    saveCalibration(kv, 'audio', { offsetMs: ok(proposeOffset(alt(-37, aFor(10, 60), 60), -19)).offset, at: AT, via: 'propose' })
    expect([offsetFor(loadCalibration(kv), 'audio'), offsetFor(loadCalibration(kv), 'youtube')]).toEqual([18, -25])
    // 対照: 保存先が audio 固定のまま（手順 8 までの形）
    const old = newKv()
    saveCalibration(old, 'audio', { offsetMs: -19, at: AT, via: 'tap' })
    saveCalibration(old, 'audio', { offsetMs: -25, at: AT, via: 'propose' })
    expect([offsetFor(loadCalibration(old), 'audio'), offsetFor(loadCalibration(old), 'youtube')]).toEqual([-25, 0])
  }) // prettier-ignore
})

describe('母集団の門 calibEligibleOf（期待値 (3)）', () => {
  const base = {
    keyset: 'all',
    mode: 'fixed',
    rate: 1,
    loops: 0,
    fallbackT: null,
    kind: 'audio',
  } as const
  it('自前・動画の回（measured 偽・無し）は真、measured 真・切替（12,001.06・0）・rate 1.25・鍵数 8・音待ち・ループ 1 周は偽', () => {
    expect(calibEligibleOf(base)).toBe(true)
    expect(calibEligibleOf({ ...base, kind: calibKindOf({ video: true, measured: false }) })).toBe(true)
    expect(calibEligibleOf({ ...base, kind: calibKindOf({ video: true }) })).toBe(true)
    expect(calibEligibleOf({ ...base, kind: calibKindOf({ video: true, measured: true }) })).toBe(false)
    for (const over of [{ fallbackT: 12_001.06 }, { fallbackT: 0 }, { kind: 'youtube' as const, rate: 1.25 }, { keyset: '8' as const }, { mode: 'note' as const }, { loops: 1 }])
      expect(calibEligibleOf({ ...base, ...over })).toBe(false)
  }) // prettier-ignore
})

// ---------- 回の実値 ----------

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TWINKLE = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', 'twinkle.hexnote.json'), 'utf8')) as Chart // prettier-ignore

/** 動画なしの twinkle（42 音・入門者）を、全押下を delay ms 遅らせて校正 offset で弾く */
function twinkle(delay: number, offsetMs: number): Run {
  const v = TWINKLE.variants?.find((x) => x.id === 'ableton/2/octave')
  if (v === undefined) throw new Error('譜面版が無い')
  const song: RunSong = { chartId: TWINKLE.id, name: TWINKLE.name, chart: TWINKLE, variant: v }
  const grid = buildKeyboardGrid(v.layout, 1, { left: 0, top: 0 })
  let r = runInput(newRun(song, { rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode), offsetMs }), sound: { melody: true, accomp: true, click: false }, keyclick: false }), START_NOW, { kind: 'start' }).run
  const actions = planActions(r.notes, (ms) => perfAt(r.map, ms) + delay, () => 0)
  let k = 0
  for (let f = 1; runPhase(r) !== 'ended'; f++) {
    const now = START_NOW + f * FRAME_MS
    for (let a = actions[k]; a !== undefined && a.tsPerf <= now; a = actions[++k])
      r = a.kind === 'press' ? runPress(r, { code: a.code, tsPerf: a.tsPerf, lag: 0 }, a.tsPerf).run : runRelease(r, { code: a.code, tsPerf: a.tsPerf, forced: false }, a.tsPerf).run
    r = runFrame(r, now, now).run
  }
  return r
} // prettier-ignore

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const r2 = (x: number): number => Math.round(x * 100) / 100

describe('回の実値（期待値 (4)。動画なしのきらきら星 42 音・入門者）', () => {
  it('遅れ ＋25・オフセット 0 → 標本 42・平均 ＋25・提案 −25。＋25・−25 → 平均 0・perfect 42・なし。＋25・−19 → 平均 ＋6・なし。0・−25 → 平均 −25・great 42・±0', () => {
    const a = runOutcome(twinkle(25, 0))
    expect([a.samples.length, r2(mean(a.samples))]).toEqual([42, 25])
    expect(proposalFor(a)).toMatchObject({ ok: true, offset: -25 })
    const b = runOutcome(twinkle(25, -25))
    expect([r2(mean(b.samples)), b.judge.counts.perfect, b.offsetUsed]).toEqual([0, 42, -25])
    expect(proposalFor(b)).toMatchObject({ ok: false, reason: 'small' })
    const c = runOutcome(twinkle(25, -19))
    expect(r2(mean(c.samples))).toBe(6)
    expect(proposalFor(c)).toMatchObject({ ok: false, reason: 'small' })
    const d = runOutcome(twinkle(0, -25))
    expect([r2(mean(d.samples)), d.judge.counts.great]).toEqual([-25, 42])
    const v = ok(proposalFor(d) as OffsetVerdict)
    expect(v.offset).toBe(0)
    expect(proposalText(v, 42, -25).title).toBe('平均 −25 ms（少し早め）→ オフセットを ±0 ms にしますか')
  }) // prettier-ignore
})

describe('S6 の 2 行の文（期待値 (5)。門が真のときの YouTube の行。文は calibText）', () => {
  const rows = (c: Calibration): [string, string] => [calibText(c.audio === undefined ? null : offsetFor(c, 'audio')), calibText(c.youtube === undefined ? null : offsetFor(c, 'youtube'))] // prettier-ignore
  it('何も無い → 未校正／未校正、audio −19 → 校正済み（−19 ms）／未校正、youtube −25 → 校正済み（−25 ms）、youtube に ±0 を適用 → 校正済み（±0 ms）', () => {
    const kv = newKv()
    expect(rows(loadCalibration(kv))).toEqual(['未校正', '未校正'])
    saveCalibration(kv, 'audio', { offsetMs: -19, at: AT, via: 'tap' })
    expect(rows(loadCalibration(kv))).toEqual(['校正済み（−19 ms）', '未校正'])
    saveCalibration(kv, 'youtube', { offsetMs: -25, at: AT, via: 'propose' })
    expect(rows(loadCalibration(kv))).toEqual(['校正済み（−19 ms）', '校正済み（−25 ms）'])
    const zero = ok(proposeOffset(alt(25, aFor(12, 40), 40), 25))
    expect(zero.offset).toBe(0)
    saveCalibration(kv, 'youtube', { offsetMs: zero.offset, at: AT, via: 'propose' })
    expect(rows(loadCalibration(kv))[1]).toBe('校正済み（±0 ms）')
  }) // prettier-ignore
})

describe('calib 行と計測盤の要約（期待値 (6)、§7-38）', () => {
  it('youtube の回は source 付き・要約に「・YouTube」、自前の回は今の 7 欄と文', () => {
    const v = ok(proposeOffset(alt(25, aFor(12, 40), 40), 0))
    const y = calibRow('propose', v, 40, true, AT, 'youtube')
    expect(y).toMatchObject({ kind: 'calib', at: AT, stage: 'propose', n: 40, applied: true, proposed: -25, source: 'youtube' })
    expect(y.sd).toBeCloseTo(12, 9)
    expect(rowBrief(y)).toBe('段 2（提案）・YouTube・標本 40・SD 12.0 ms・−25 ms・適用')
    const a = calibRow('propose', v, 40, true, AT)
    expect(Object.keys(a).sort()).toEqual(['applied', 'at', 'kind', 'n', 'proposed', 'sd', 'stage'])
    expect(rowBrief(a)).toBe('段 2（提案）・標本 40・SD 12.0 ms・−25 ms・適用')
  }) // prettier-ignore
})

describe('段 4 のタップと youtube の値の重なり（期待値 (7)、§7-34 の measured の門）', () => {
  it('癖 ＋30 の人: タップの曲（measured 真）は提案なし、式の曲は −30 → 適用の後はどちらも平均 0 で提案なし（往復しない）。measured を見ない形は往復する', () => {
    const s = aFor(12, 40)
    // タップの曲: 癖は sync.offset に入り平均 0。種別 null → 門の外
    expect(calibEligibleOf({ keyset: 'all', mode: 'fixed', rate: 1, loops: 0, fallbackT: null, kind: calibKindOf({ video: true, measured: true }) })).toBe(false)
    // 式の曲: 平均 ＋30 → −30
    expect(ok(proposeOffset(alt(30, s, 40), 0)).offset).toBe(-30)
    // 適用の後: タップの曲は 0 で判定（youtube −30 は掛けない）→ 平均 0、式の曲は −30 で判定 → 平均 0
    expect(calibOffset({ v: 1, youtube: { offsetMs: -30, at: AT, via: 'propose' } }, calibKindOf({ video: true, measured: true }))).toBe(0)
    expect(proposeOffset(alt(0, s, 40), -30)).toMatchObject({ ok: false, reason: 'small' })
    // 対照: measured を見ずに全部へ掛けると、タップの曲が −30 で判定されて平均 −30 → ±0 に戻す → 式の曲がまた −30（往復）
    expect(ok(proposeOffset(alt(-30, s, 40), -30)).offset).toBe(0)
    expect(ok(proposeOffset(alt(30, s, 40), 0)).offset).toBe(-30)
  }) // prettier-ignore
})

describe('ダミー動画の回の通し（期待値 (8)。手順 2 のクリック譜面 64 音・式の sync・押下 ＝ 動画の真の時刻 ＋25）', () => {
  const META = { id: 'x', at: AT, profile: 'beginner' } as const
  it('校正 {audio −19} で動画の回 → offsetUsed 0・標本 64・平均 ＋25.95・提案 −26（保存先 youtube）、適用して次の回は −26・平均 −0.05・提案なし', () => {
    const cal: Calibration = { v: 1, audio: { offsetMs: -19, at: AT, via: 'tap' } }
    const kind = calibKindOf({ video: true })
    const a = finishedPlay(drive({ delayMs: 25, offsetMs: calibOffset(cal, kind) }).run, META)
    expect([a.offsetUsed, a.samples.length, r2(mean(a.samples))]).toEqual([0, 64, 25.95])
    expect(a.calibEligible).toBe(true)
    expect(a.record.syncUsed.kind).toBe(kind)
    const v = ok(proposalFor(a) as OffsetVerdict)
    expect(v.offset).toBe(-26)
    expect(a.drift).toMatchObject({ warn: false })
    expect(a.drift?.x ?? NaN).toBeLessThan(1)
    const next: Calibration = { ...cal, youtube: { offsetMs: v.offset, at: AT, via: 'propose' } }
    const b = finishedPlay(drive({ delayMs: 25, offsetMs: calibOffset(next, kind) }).run, META)
    expect([b.offsetUsed, r2(mean(b.samples))]).toEqual([-26, -0.05])
    expect(proposalFor(b)).toMatchObject({ ok: false, reason: 'small' })
    expect(calibOffset(next, calibKindOf({ video: false }))).toBe(-19)
  }) // prettier-ignore

  it('同じ譜面の sync を measured 真にした回 → 種別 null・offsetUsed 0（youtube −26 でも）・proposalFor null。凍結 → S7c の回も null', () => {
    const cal: Calibration = { v: 1, youtube: { offsetMs: -26, at: AT, via: 'propose' } }
    const kind = calibKindOf({ video: true, measured: true })
    expect(kind).toBeNull()
    const m = finishedPlay(drive({ delayMs: 25, measured: true, offsetMs: calibOffset(cal, kind) }).run, META)
    expect([m.offsetUsed, r2(mean(m.samples)), m.calibEligible]).toEqual([0, 25.95, false])
    expect(proposalFor(m)).toBeNull()
    expect([m.record.syncUsed.kind, isTargetPlay(m.record)]).toEqual(['youtube', false])
    const f = finishedPlay(drive({ delayMs: 25, script: [{ at: 10_000, run: (c) => c.d.stuck(600_000, c.now) }] }).run, META)
    expect(f.record.syncUsed.fallbackAt).toBeDefined()
    expect(proposalFor(f)).toBeNull()
  }) // prettier-ignore
})

describe('回の種別（期待値 (9)。校正 {audio −19, youtube −25}）', () => {
  const cal: Calibration = {
    v: 1,
    audio: { offsetMs: -19, at: AT, via: 'tap' },
    youtube: { offsetMs: -25, at: AT, via: 'propose' },
  }
  it('式の sync の動画の回 → youtube・−25、measured 真 → null・0、同じ曲を「動画を使う」偽／「ピアノ音で遊ぶ」で弾いた回 → audio・−19', () => {
    expect([calibKindOf({ video: true, measured: false }), calibOffset(cal, calibKindOf({ video: true, measured: false }))]).toEqual(['youtube', -25])
    expect([calibKindOf({ video: true, measured: true }), calibOffset(cal, null)]).toEqual([null, 0])
    expect([calibKindOf({ video: false }), calibOffset(cal, calibKindOf({ video: false }))]).toEqual(['audio', -19])
    // 自前の回の calib 行は source 無し（保存先 audio）
    expect('source' in calibRow('propose', ok(proposeOffset(alt(25, aFor(12, 40), 40), -19)), 40, true, AT)).toBe(false)
  }) // prettier-ignore
})

describe('ずれの傾き（期待値 (10)）', () => {
  /** 着地 0.6 秒おき、ずれ ＝ 平均 ＋ 傾き × 秒 ＋ 決まった雑音（＋a・−a・−a・＋a） */
  const pairs = (
    n: number,
    base: number,
    slope: number,
    noise: number,
    f: (t: number) => number = () => 0,
  ): { landMs: number; dtMs: number }[] =>
    Array.from({ length: n }, (_, i) => ({
      landMs: i * 600,
      dtMs: base + slope * i * 0.6 + f(i * 600) + noise * [1, -1, -1, 1][i % 4]!,
    }))

  it('64 音・平均 ＋25・雑音 12 → 傾き 0・注意なし。100 音で動画が 1.001 倍 → 傾き −0.999・x 59・注意（雑音 12 でも）。ダミーの回で押下の遅れが伸びる → 注意・門の外・提案なし', () => {
    const flat = tempoDriftOf(pairs(64, 25, 0, 12))
    expect(flat?.slope).toBeCloseTo(0, 9)
    expect(flat?.warn).toBe(false)
    const fast = (t: number): number => t * (1 / 1.001 - 1)
    const d = tempoDriftOf(pairs(100, 0, 0, 0, fast))
    expect(d?.slope).toBeCloseTo(-0.999, 3)
    expect(Math.round(d?.x ?? 0)).toBe(59)
    expect(d?.warn).toBe(true)
    expect(driftText(d ?? { slope: 0, se: 0, x: 0, warn: false })).toBe('ずれが曲の中で約 59 ms 動きました。動画のテンポが譜面と合っていないようです。')
    expect(tempoDriftOf(pairs(100, 0, 0, 12, fast))?.warn).toBe(true)
    // 回の通し: クリック譜面の動画の回で、押下の遅れが ▶ から 1 秒ごとに 1.5 ms 伸びる（動画が譜面より遅い形）→ 傾き ＋1.5・x 約 57 ms で注意。
    // 門が無ければ提案が出る標本でも、calibEligible は偽で proposalFor は null（帯は driftText の 1 行、calib 行も無い）
    const g = finishedPlay(drive({ delayMs: (ms) => ms * 0.0015 }).run, { id: 'x', at: AT, profile: 'beginner' })
    expect(g.drift).toMatchObject({ warn: true })
    expect([r2(g.drift?.slope ?? NaN), Math.round(g.drift?.x ?? NaN)]).toEqual([1.5, 57])
    expect(proposeOffset(g.samples, g.offsetUsed).ok).toBe(true)
    expect([g.calibEligible, proposalFor(g)]).toEqual([false, null])
  }) // prettier-ignore

  // 標準誤差は最小二乗の普通の式（√(残差の平方和／(n−2)／Σ(x−x̄)²)）。手順書の原型は Σ(x−x̄)² を n／(n−1) 倍していて 8 音で 3.33・1.11
  // と出ていた（判定〔注意の有無〕はどちらでも同じ。decisions #109）
  it('40 音（23.4 秒）・雑音なしで x 19 → 注意なし、x 21 → 注意。8 音・傾き 5（x 21）・雑音 12 → 標準誤差 3.56 で注意なし、雑音 4 → 1.19 で注意。7 音は null', () => {
    const span = 39 * 0.6
    expect(tempoDriftOf(pairs(40, 25, 19 / span, 0))?.warn).toBe(false)
    expect(tempoDriftOf(pairs(40, 25, 21 / span, 0))?.warn).toBe(true)
    const n12 = tempoDriftOf(pairs(8, 25, 5, 12))
    expect([r2(n12?.se ?? 0), n12?.warn]).toEqual([3.56, false])
    const n4 = tempoDriftOf(pairs(8, 25, 5, 4))
    expect([r2(n4?.se ?? 0), n4?.warn]).toEqual([1.19, true])
    expect(tempoDriftOf(pairs(7, 25, 5, 4))).toBeNull()
  }) // prettier-ignore
})
