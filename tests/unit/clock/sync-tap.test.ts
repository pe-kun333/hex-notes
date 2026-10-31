import { describe, expect, it } from 'vitest'
import { clockRead, clockTick, initialClock } from '../../../src/clock/clock-source.ts'
import { createDummyVideo } from '../../../src/clock/dummy-video.ts'
import { fromChartMs } from '../../../src/clock/map.ts'
import {
  SYNC_TAP_BEATS,
  initialSyncTap,
  syncTapFit,
  syncTapPlan,
  syncTapStep,
  syncTapVerdict,
  tapVideoMs,
  type SyncTapState,
} from '../../../src/clock/sync-tap.ts'
import { gauss, mulberry32 } from '../../../src/shared/random.ts'
import type { Pulse } from '../../../src/shared/types.ts'
import { syncRow } from '../../../src/telemetry/rows.ts'
import { countByKind } from '../../../src/telemetry/export.ts'
import { KIND_NAMES, rowBrief, telemetryPanelView } from '../../../src/app/telemetry-view.ts'
import { syncResultLines } from '../../../src/app/sync-panel.ts'

// src/clock/sync-tap.ts・telemetry の sync 行（M2-02、M2 の手順 3）。出どころ: m2-kickoff 手順 3 の期待値（2026-11-01 node で
// 検算）・§7-12・§7-20、m5 fitTaps L365–367・L535–546、design.md §3.2・§5.3 M2-02、decisions #14・#36、
// research/midi-score-sources.md L40、tests-inventory「M2 手順 3」。

const P100: Pulse = { resolution: 240, tempo: [{ beat: 0, bpm: 100 }] }
const PLAN = syncTapPlan(P100)
const round = (x: number, d: number): number => Math.round(x * 10 ** d) / 10 ** d

describe('当てはめ syncTapFit（x ＝ 拍の譜面 ms）', () => {
  it('拍 0〜7 の譜面 ms（100 BPM は 600 ms ごと）。テンポ変化があれば区間ごと', () => {
    expect(PLAN).toEqual([0, 600, 1200, 1800, 2400, 3000, 3600, 4200])
    expect(
      syncTapPlan(
        {
          resolution: 240,
          tempo: [
            { beat: 0, bpm: 120 },
            { beat: 2, bpm: 60 },
          ],
        },
        4,
      ),
    ).toEqual([0, 500, 1000, 2000])
  })

  it('100 BPM・rate 1.04・offset 1.5 s の周期タップ → offset 1.5000・rate 1.0400・残差 0。全部 ＋30 ms → offset ＋0.030', () => {
    const taps = PLAN.map((c) => fromChartMs(c, { offset: 1.5, rate: 1.04 }))
    expect(taps[1]).toBeCloseTo(1500 + 576.923, 2)
    const f = syncTapFit(PLAN, taps)
    expect([
      round(f?.offset ?? NaN, 4),
      round(f?.rate ?? NaN, 4),
      round(f?.residualSd ?? NaN, 6),
    ]).toEqual([1.5, 1.04, 0])
    const g = syncTapFit(
      PLAN,
      taps.map((t) => t + 30),
    )
    expect([
      round(g?.offset ?? NaN, 4),
      round(g?.rate ?? NaN, 4),
      round(g?.residualSd ?? NaN, 6),
    ]).toEqual([1.53, 1.04, 0])
  })

  it('ばらつきのあるタップ（100 BPM）→ offset 1.8017・rate 0.9996・残差 SD 19.8 ms（n−1。m5 の RMS は 18.5）・maxAbs 23 ms', () => {
    const taps = [1.8, 2.42, 2.98, 3.62, 4.18, 4.82, 5.38, 6.02].map((s) => s * 1000)
    const f = syncTapFit(PLAN, taps)
    if (f === null) throw new Error('fit')
    expect([
      round(f.offset, 4),
      round(f.rate, 4),
      round(f.residualSd, 1),
      Math.round(f.maxAbs),
      f.n,
    ]).toEqual([1.8017, 0.9996, 19.8, 23, 8])
    // m5 の RMS（n で割る）は 18.5
    expect(round(f.residualSd * Math.sqrt(7 / 8), 1)).toBe(18.5)
    expect(syncTapVerdict(f.residualSd)).toEqual({ savable: true, retry: false })
  })

  it('判定の境: SD 30 は勧めない・30.1 は勧める、68 は保存できる・68.1 と 80 は保存できない', () => {
    expect(syncTapVerdict(30)).toEqual({ savable: true, retry: false })
    expect(syncTapVerdict(30.1)).toEqual({ savable: true, retry: true })
    expect(syncTapVerdict(68)).toEqual({ savable: true, retry: true })
    expect(syncTapVerdict(68.1).savable).toBe(false)
    expect(syncTapVerdict(80)).toEqual({ savable: false, retry: true })
  })

  it('長さが違う・2 点未満・傾きが正でない → null', () => {
    expect(syncTapFit([0, 600], [0])).toBeNull()
    expect(syncTapFit([0], [0])).toBeNull()
    expect(syncTapFit([0, 600, 1200], [1000, 900, 800])).toBeNull()
  })
})

describe('タップの回 syncTapStep', () => {
  const taps = (s: SyncTapState, ms: readonly number[], t0 = 0): SyncTapState =>
    ms.reduce(
      (cur, v, i) => syncTapStep(cur, { kind: 'tap', videoMs: v, now: t0 + 1000 + i * 600 }, PLAN),
      s,
    )
  const good = PLAN.map((c) => c + 1500)
  const noisy = good.map((v, i) => v + (i % 2 === 0 ? 45 : -45))

  it('7 タップで終わる → 不足（tapping のまま・結果なし）。8 拍目で done・attempts 1・かかった秒', () => {
    let s = syncTapStep(initialSyncTap(), { kind: 'start', now: 0 }, PLAN)
    s = taps(s, good.slice(0, 7))
    expect([s.phase, s.taps.length, s.result, s.attempts]).toEqual(['tapping', 7, null, 0])
    s = syncTapStep(s, { kind: 'tap', videoMs: good[7] as number, now: 5200 }, PLAN)
    expect([s.phase, s.attempts, s.result?.elapsedS, s.result?.verdict]).toEqual([
      'done',
      1,
      5.2,
      { savable: true, retry: false },
    ])
    expect(SYNC_TAP_BEATS).toBe(8)
  })

  it('おすすめ付きでやり直した → attempts 2。中止はその回を捨て、attempts と前の結果は残す。待つ前・済んだ後のタップは数えない', () => {
    let s = syncTapStep(initialSyncTap(), { kind: 'tap', videoMs: 1, now: 0 }, PLAN)
    expect(s).toEqual(initialSyncTap())
    s = taps(syncTapStep(s, { kind: 'start', now: 0 }, PLAN), noisy)
    expect([s.attempts, s.result?.verdict.retry]).toEqual([1, true])
    expect(syncTapStep(s, { kind: 'tap', videoMs: 9, now: 9 }, PLAN)).toBe(s)
    const first = s.result
    s = syncTapStep(s, { kind: 'start', now: 10_000 }, PLAN)
    s = syncTapStep(taps(s, good.slice(0, 3), 10_000), { kind: 'cancel' }, PLAN)
    expect([s.phase, s.taps, s.attempts, s.result]).toEqual(['idle', [], 1, first])
    s = taps(syncTapStep(s, { kind: 'start', now: 20_000 }, PLAN), good, 20_000)
    expect([s.attempts, s.result?.verdict.retry]).toEqual([2, false])
  })
})

describe('ダミー動画での検証（完了条件「ダミー時計で残差 SD が人の拍アノテーション SD 内」）', () => {
  /**
   * ダミー動画（刻み 15 ms・種 7・rate 1.0）を now 0 で再生し、60 fps で時計を回す。真の offset 1.8 s（拍 0 が動画 1,800 ms）、
   * 100 BPM。拍 k のタップは真の時刻（perf ＝ 1,800 ＋ 600k）に jitter を足した perf で押し、その時の時計の写像で動画 ms に
   */
  function run(jitter: (k: number) => number): { fit: NonNullable<ReturnType<typeof syncTapFit>> } {
    const d = createDummyVideo({ stepMs: 15, seed: 7, rate: 1 })
    let s = initialClock({ mode: 'video', t0: 0 })
    d.play(0)
    const pending = PLAN.map((c, k) => 1800 + c + jitter(k)).sort((a, b) => a - b)
    const video: number[] = []
    const F = 1000 / 60
    for (let i = 0; video.length < pending.length; i++) {
      const now = i * F
      s = clockTick(s, now, d.sample(now)).state
      // このフレームから次のフレームまでに押したタップは、このフレームの写像で読む（入力の tsPerf を値で受ける形）
      while (video.length < pending.length && (pending[video.length] as number) < now + F)
        video.push(tapVideoMs(clockRead(s, now).map, pending[video.length] as number))
    }
    const fit = syncTapFit(PLAN, video)
    if (fit === null) throw new Error('fit')
    return { fit }
  }

  it('(1) 雑音 0 → 残差 SD ≤ 10 ms・offset の誤差 ≤ 15 ms・rate の誤差 ≤ 0.5%（刻みだけ）', () => {
    const { fit } = run(() => 0)
    expect(fit.residualSd).toBeLessThanOrEqual(10)
    expect(Math.abs(fit.offset - 1.8) * 1000).toBeLessThanOrEqual(15)
    expect(Math.abs(fit.rate - 1)).toBeLessThanOrEqual(0.005)
    // 固定した値（台帳へ）: 残差 SD 0.2 ms・offset の誤差 0.6 ms・rate 1.0000
    expect([
      round(fit.residualSd, 1),
      round((fit.offset - 1.8) * 1000, 1),
      round(fit.rate, 4),
    ]).toEqual([0.2, 0.6, 1])
  })

  it('(2) 真の拍時刻にガウス SD 30 ms（種 99）→ 保存できる・offset の誤差 ≤ 30 ms', () => {
    const rng = mulberry32(99)
    const jit = PLAN.map(() => gauss(rng) * 30)
    const { fit } = run((k) => jit[k] as number)
    expect(syncTapVerdict(fit.residualSd).savable).toBe(true)
    expect(fit.residualSd).toBeLessThanOrEqual(68)
    expect(Math.abs(fit.offset - 1.8) * 1000).toBeLessThanOrEqual(30)
    // 固定した値（台帳へ）: 残差 SD 31.5 ms（人の拍アノテーションの 27〜68 ms の中）・offset の誤差 22.4 ms・rate 1.0012、
    // SD 30 を超えるので「やり直す」はすすめる
    expect([
      round(fit.residualSd, 1),
      round((fit.offset - 1.8) * 1000, 1),
      round(fit.rate, 4),
      syncTapVerdict(fit.residualSd).retry,
    ]).toEqual([31.5, 22.4, 1.0012, true])
  })
})

describe('telemetry の sync 行（§7-20）', () => {
  const AT = '2026-11-01T00:00:00.000Z'
  const s = PLAN.map((c) => c + 1500).reduce(
    (cur, v, i) =>
      syncTapStep(cur, { kind: 'tap', videoMs: v + (i === 3 ? 20 : 0), now: 1000 + i * 600 }, PLAN),
    syncTapStep(initialSyncTap(), { kind: 'start', now: 0 }, PLAN),
  )

  it('8 拍そろった回 → sync 行（丸め）、countByKind に 1、計測盤の種類が 8 で要約が 1 行', () => {
    if (s.result === null) throw new Error('result')
    const row = syncRow('sha256:abcdef0123', s.result, s.attempts, AT)
    expect(row).toEqual({ kind: 'sync', at: AT, chartId: 'sha256:abcdef0123', residualSd: 7, elapsedS: 5.2, attempts: 1, offset: 1.5033, rate: 1.0004 })
    expect(countByKind([row]).sync).toBe(1)
    expect(Object.keys(KIND_NAMES)).toHaveLength(8)
    expect(rowBrief(row)).toBe('abcdef01…・残差 SD 7.0 ms・offset 1.503 s・rate 1.0004・5.2 秒・1 回目')
    expect(telemetryPanelView([row]).recent.map((r) => r.kind)).toEqual(['同期タップ'])
  }) // prettier-ignore
})

describe('部品の結果の行 syncResultLines（m6 L497、§7-12）', () => {
  const at = (sd: number) => ({
    fit: { offset: 12.418, rate: 1.004, residualSd: sd, maxAbs: 23.4, n: 8 },
    verdict: syncTapVerdict(sd),
    elapsedS: 9.25,
  })

  it('offset・rate・残差・時間と回・判定（保存の可否とおすすめは別）', () => {
    expect(syncResultLines(at(14), 1).map((l) => l.text)).toEqual(['12.418 s', '1.0040', 'SD 14.0 ms（最大 23 ms）', '9.3 秒（1 回目）', '保存できます。'])
    expect(syncResultLines(at(40), 2)[4]?.text).toBe('保存できます。残差が 30 ms を超えています。「やり直し」をおすすめします。')
    expect(syncResultLines(at(80), 3)[4]?.text).toBe('残差が大きすぎるので保存できません。もう一度タップしてください。')
  }) // prettier-ignore
})
