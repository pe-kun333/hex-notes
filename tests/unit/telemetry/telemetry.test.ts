import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { clockTick, initialClock } from '../../../src/clock/clock-source.ts'
import { createDummyVideo } from '../../../src/clock/dummy-video.ts'
import type { ClockEvent, ClockOutput } from '../../../src/clock/types.ts'
import { proposeOffset, tapOffset } from '../../../src/judge/calibration-offset.ts'
import { sampleSd } from '../../../src/judge/score.ts'
import { p95 } from '../../../src/render/canvas/lowload.ts'
import { mulberry32 } from '../../../src/shared/random.ts'
import type { TelemetryRow } from '../../../src/shared/types.ts'
import { TELEMETRY_RING_SIZE } from '../../../src/shared/types.ts'
import { memoryDb } from '../../../src/storage/fallback.ts'
import {
  EMPTY_WELFORD,
  FRAME_BINS,
  FRAME_GAP_MS,
  collectClock,
  collectFrame,
  collectPress,
  fallbackAtMs,
  initialCollect,
  playRow,
  welfordAdd,
  welfordSd,
  type PlayCollect,
  type PlayMeta,
} from '../../../src/telemetry/collect.ts'
import {
  TELEMETRY_FORMAT,
  countByKind,
  telemetryExport,
  telemetryFileName,
  telemetryFileText,
} from '../../../src/telemetry/export.ts'
import { pushRing } from '../../../src/telemetry/ring.ts'
import {
  calibRow,
  deviceRow,
  embedErrorRow,
  onboardRow,
  quitRow,
  uaClass,
} from '../../../src/telemetry/rows.ts'

// src/telemetry/。出どころ: design.md §4.6・§6.3、kickoff 手順 12 の期待値（sd([1,2,3,4]) ＝ 1.2909944〔m3 L248〕、1,001 行目で
// 先頭が消える）、m3 mean／sd L247–248・welford L404（行番号で切り出して照合）、decisions #25・#32 (f)・#47・#54（仮）。

const AT = '2026-10-31T00:00:00.000Z'
const M3 = readFileSync(
  fileURLToPath(new URL('../../../docs/planning/mocks/m3-clock-judge.html', import.meta.url)),
  'utf8',
).split('\n')
function m3Line(n: number, head: string): string {
  const s = M3[n - 1] ?? ''
  if (!s.trimStart().startsWith(head)) throw new Error(`モックの行がずれた: m3 L${n}`)
  return s
}

const m3 = new Function(
  [
    m3Line(247, 'const mean ='),
    m3Line(248, 'const sd ='),
    m3Line(404, 'const welford ='),
    'return { mean, sd, welford }',
  ].join('\n'),
)() as {
  mean: (a: number[]) => number
  sd: (a: number[]) => number
  welford: () => { add(x: number): void; sd(): number; m: number; n: number }
}

const welfordOf = (xs: readonly number[]): ReturnType<typeof welfordAdd> =>
  xs.reduce(welfordAdd, EMPTY_WELFORD)

describe('平均と SD（m3 L247–248・L404）', () => {
  it('kickoff の期待値: sd([1,2,3,4]) ＝ 1.2909944（m3 の sd・welford と同じ）', () => {
    expect(m3.sd([1, 2, 3, 4])).toBeCloseTo(1.2909944, 7)
    expect(welfordSd(welfordOf([1, 2, 3, 4]))).toBeCloseTo(1.2909944, 7)
    expect(sampleSd([1, 2, 3, 4])).toBeCloseTo(1.2909944, 7)
  })

  it('乱数の列 50 本で、逐次の平均・SD が m3 の welford と sd に合う', () => {
    const rng = mulberry32(12)
    for (let k = 0; k < 50; k++) {
      const xs = Array.from({ length: 2 + Math.floor(rng() * 200) }, () => (rng() - 0.5) * 80)
      const w = m3.welford()
      for (const x of xs) w.add(x)
      const ours = welfordOf(xs)
      expect(ours.n).toBe(w.n)
      expect(ours.m).toBeCloseTo(w.m, 9)
      expect(welfordSd(ours)).toBeCloseTo(w.sd(), 9)
      expect(welfordSd(ours)).toBeCloseTo(m3.sd(xs), 9)
    }
  })

  it('2 つ未満は null（m3 の welford は NaN、sd は 0）', () => {
    expect(welfordSd(EMPTY_WELFORD)).toBe(null)
    expect(welfordSd(welfordOf([5]))).toBe(null)
    const w = m3.welford()
    w.add(5)
    expect(w.sd()).toBeNaN()
    expect(m3.sd([5])).toBe(0)
  })
})

describe('リング pushRing（1,000 行）', () => {
  it('kickoff の期待値: 1,001 行目で先頭が消える', () => {
    let ring: number[] = []
    for (let i = 1; i <= TELEMETRY_RING_SIZE; i++) ring = pushRing(ring, i)
    expect(ring).toHaveLength(1000)
    expect(ring[0]).toBe(1)
    ring = pushRing(ring, 1001)
    expect(ring).toHaveLength(1000)
    expect(ring[0]).toBe(2)
    expect(ring.at(-1)).toBe(1001)
  })

  it('元の配列は変えない。size 1 は最後の 1 つ、size 0 は RangeError', () => {
    const a = [1, 2, 3]
    expect(pushRing(a, 4, 3)).toEqual([2, 3, 4])
    expect(a).toEqual([1, 2, 3])
    expect(pushRing(a, 9, 1)).toEqual([9])
    expect(() => pushRing(a, 1, 0)).toThrow(RangeError)
  })

  it('保存層の memoryDb と同じ規則（1,001 行目で先頭が消える。§4.6 の行が貯まる）', async () => {
    const db = memoryDb()
    let ring: TelemetryRow[] = []
    for (let i = 1; i <= 1001; i++) {
      const row = embedErrorRow(i, AT)
      ring = pushRing(ring, row)
      await db.appendTelemetry(row)
    }
    expect(await db.listTelemetry()).toEqual(ring)
  })
})

// ---------- 時計 ----------

const out = (
  events: ClockEvent[],
  phase: ClockOutput['phase'] = 'locked',
  dev: number | null = null,
): Pick<ClockOutput, 'events' | 'phase' | 'dev'> => ({ events, phase, dev })

const resync = (reason: Extract<ClockEvent, { kind: 'resync' }>['reason']): ClockEvent => ({
  kind: 'resync',
  reason,
  t: 0,
  graceUntil: 300,
  nominal: { a: 1, b: 0 },
})

describe('時計の集計 collectClock（decisions #32 (f)）', () => {
  it('再同期回数は jump・unheld・adEnd だけ（start・resume・seek・rate・return・fallback は数えない）', () => {
    let c = initialCollect()
    for (const r of ['start', 'resume', 'seek', 'rate', 'return', 'fallback'] as const)
      c = collectClock(c, out([resync(r)]))
    expect(c.resyncCount).toBe(0)
    c = collectClock(c, out([resync('jump'), resync('unheld')]))
    c = collectClock(c, out([resync('adEnd')]))
    expect(c.resyncCount).toBe(3)
  })

  it('動画なしへの切替は最初の novideo の t。曲の ms は軸で写す', () => {
    let c = collectClock(initialCollect(), out([{ kind: 'novideo', t: 4000 }]))
    c = collectClock(c, out([{ kind: 'novideo', t: 9000 }]))
    expect(c.fallbackT).toBe(4000)
    expect(fallbackAtMs(c, { offset: 1.5, rate: 1 })).toBe(2500)
    expect(fallbackAtMs(initialCollect(), { offset: 0, rate: 1 })).toBeUndefined()
  })

  it('残差は locked で dev のある出力だけ。変わらない出力は同じ物を返す', () => {
    let c = initialCollect()
    c = collectClock(c, out([], 'grace', 9))
    c = collectClock(c, out([], 'locked', null))
    expect(c.clockDev.n).toBe(0)
    const same = collectClock(c, out([{ kind: 'graceEnd' }], 'held', 5))
    expect(same).toBe(c)
    for (const d of [1, 2, 3, 4]) c = collectClock(c, out([], 'locked', d))
    expect(welfordSd(c.clockDev)).toBeCloseTo(1.2909944, 7)
  })

  it('ダミー動画（15 ms 切り捨て・60 fps）で飛び 1 回＋2 秒の凍結: 再同期 1・切替あり・残差 SD は量子化の雑音（≈ 4.3）', () => {
    const d = createDummyVideo({ pauseLatencyMs: 100 })
    let s = initialClock({ mode: 'video', t0: 0 })
    d.play(0)
    let c = initialCollect()
    let jumped = false
    let stuck = false
    for (let i = 0; i * (1000 / 60) <= 8000; i++) {
      const now = i * (1000 / 60)
      if (!jumped && now >= 1500) {
        jumped = true
        d.jump(400, now)
      }
      if (!stuck && now >= 4000) {
        stuck = true
        d.stuck(5000, now)
      }
      const r = clockTick(s, now, d.sample(now))
      s = r.state
      c = collectClock(c, r.out)
      for (const q of r.out.requests) if (q.kind === 'pauseVideo') d.pauseVideo(now)
    }
    expect(c.resyncCount).toBe(1)
    expect(c.fallbackT).not.toBe(null)
    const sd = welfordSd(c.clockDev)
    expect(sd).toBeGreaterThan(3.5)
    expect(sd).toBeLessThan(5)
  })
})

// ---------- フレーム ----------

const frames = (c0: PlayCollect, intervals: readonly number[], start = 0): PlayCollect => {
  let c = collectFrame(c0, start)
  let t = start
  for (const dt of intervals) {
    t += dt
    c = collectFrame(c, t)
  }
  return c
}

describe('フレーム間隔 collectFrame（SD と p95、M-7）', () => {
  it('60 fps ちょうど: SD ≈ 0、p95 は 16.67（階級の上端 17 を見た最大で押さえる）', () => {
    const c = frames(initialCollect(), new Array<number>(600).fill(1000 / 60))
    const row = playRow(c, META, SUMMARY, null, AT)
    expect(row.frameIntervalSd).toBeCloseTo(0, 9)
    expect(row.frameIntervalP95).toBeCloseTo(1000 / 60, 9)
  })

  it('p95 は最近接順位（低負荷の p95 と同じ順位）で、生の値との差は 1 ms 未満', () => {
    const rng = mulberry32(3)
    for (let k = 0; k < 40; k++) {
      const xs = Array.from({ length: 20 + Math.floor(rng() * 400) }, () =>
        rng() < 0.9 ? 14 + rng() * 6 : 20 + rng() * 60,
      )
      const c = frames(initialCollect(), xs)
      const got = playRow(c, META, SUMMARY, null, AT).frameIntervalP95 ?? NaN
      const want = p95(xs)
      expect(got).toBeGreaterThanOrEqual(want)
      expect(got - want).toBeLessThan(1)
    }
  })

  it('95 個が 16 ms・5 個が 40 ms なら p95 は 17（16 の階級の上端）。94・6 なら 40（40 の階級の上端 41 を最大 40 で押さえる）', () => {
    const p = (a: number, b: number): number | null =>
      playRow(
        frames(initialCollect(), [
          ...new Array<number>(a).fill(16),
          ...new Array<number>(b).fill(40),
        ]),
        META,
        SUMMARY,
        null,
        AT,
      ).frameIntervalP95
    expect(p(95, 5)).toBe(17)
    expect(p(94, 6)).toBe(40)
  })

  it(`${FRAME_BINS} ms 以上の階級に入れば見た最大。${FRAME_GAP_MS} ms を超える間隔（途切れ）と戻る時刻は入れない`, () => {
    let c = frames(initialCollect(), [...new Array<number>(10).fill(16), 250, 300])
    expect(playRow(c, META, SUMMARY, null, AT).frameIntervalP95).toBe(300)
    c = frames(initialCollect(), [16, 16, FRAME_GAP_MS + 1, 16])
    expect(c.frames.n).toBe(3)
    expect(c.frameMax).toBe(16)
    c = collectFrame(c, (c.lastFrameMs ?? 0) - 5)
    expect(c.frames.n).toBe(3)
    expect(playRow(c, META, SUMMARY, null, AT).frameIntervalP95).toBe(16)
  })

  it('標本が無ければ SD と p95 は null', () => {
    const row = playRow(collectFrame(initialCollect(), 10), META, SUMMARY, null, AT)
    expect(row.frameIntervalSd).toBe(null)
    expect(row.frameIntervalP95).toBe(null)
  })
})

// ---------- 押下と行 ----------

const META: PlayMeta = {
  chartId: 'sha256:' + '0'.repeat(64),
  variantId: 'ableton/2/octave',
  profile: 'beginner',
  clock: 'video',
  mode: 'fixed',
}
const SUMMARY = { ur: 123.4, hist: { '-10': 3, '0': 5 }, acc: 0.91, nearRate: 0.05 }

describe('押下 collectPress・play 行 playRow', () => {
  it('入力遅延は ok の押下の lag の中央値（m3 の mean を直した。decisions #25）。lag が無い押下は数だけ', () => {
    let c = initialCollect()
    for (const lag of [3, null, 8, 1, null, 20]) c = collectPress(c, lag)
    const row = playRow(c, META, SUMMARY, null, AT)
    expect(row.inputLatencyMedian).toBe(5.5)
    expect(row.pressCount).toBe(6)
    expect(row.pressNoLag).toBe(2)
    expect(
      playRow(collectPress(initialCollect(), null), META, SUMMARY, null, AT).inputLatencyMedian,
    ).toBe(null)
  })

  it('§4.6 の項目が揃い、動画 ID は入らない（動画ありの回でも）', () => {
    let c = initialCollect()
    c = collectClock(c, out([resync('jump'), { kind: 'novideo', t: 100 }]))
    c = collectPress(c, 4)
    const row = playRow(c, META, { ...SUMMARY, ur: null }, 18.5, AT)
    expect(row).toEqual({
      kind: 'play',
      at: AT,
      ...META,
      ur: null,
      hist: SUMMARY.hist,
      acc: 0.91,
      nearRate: 0.05,
      resyncCount: 1,
      fallback: true,
      inputLatencyMedian: 4,
      pressCount: 1,
      pressNoLag: 0,
      frameIntervalSd: null,
      frameIntervalP95: null,
      clockResidualSd: null,
      audioLateMaxMs: 18.5,
    })
    expect(JSON.stringify(row)).not.toMatch(/videoId/)
    // hist は写し（判定層の物を共有しない）
    expect(row.hist).not.toBe(SUMMARY.hist)
  })
})

describe('他の行（rows.ts）', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'chrome/windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'edge/windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0',
      'firefox/macos',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'safari/macos',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'safari/ios',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
      'chrome/ios',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'chrome/android',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      'samsung/android',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'chrome/chromeos',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
      'opera/linux',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0', 'firefox/linux'],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Claude/4.4212.0 Chrome/152.0.7977.167 Safari/537.36 MSIX',
      'chrome/windows',
    ],
    ['curl/8.0', 'other/other'],
  ])('UA の大分類 %#: %s → %s', (ua, want) => {
    expect(uaClass(ua)).toBe(want)
  })

  it('device 行: UA は大分類、画面は整数、tsResolution は正の数のときだけ', () => {
    const base = {
      ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36',
      screenPx: [1536.4, 864] as const,
      dpr: 1.25,
    }
    expect(
      deviceRow(
        { ...base, device: { limit: 3, at: AT, layoutMapOk: true, tsResolution: 0.1 } },
        AT,
      ),
    ).toEqual({
      kind: 'device',
      at: AT,
      ua: 'chrome/windows',
      screenPx: [1536, 864],
      dpr: 1.25,
      limit: 3,
      layoutMapOk: true,
      tsResolution: 0.1,
    })
    for (const tsResolution of [undefined, 0])
      expect(
        deviceRow(
          {
            ...base,
            device: {
              limit: 2,
              at: AT,
              layoutMapOk: false,
              ...(tsResolution === undefined ? {} : { tsResolution }),
            },
          },
          AT,
        ),
      ).not.toHaveProperty('tsResolution')
  })

  it('calib 行: 段 1・段 2 の判定から。満たさなければ applied は偽・proposed は null・理由付き', () => {
    const errs = Array.from({ length: 24 }, (_, i) => 30 + (i % 3))
    expect(calibRow('tap', tapOffset(errs), errs.length, true, AT)).toEqual({
      kind: 'calib',
      at: AT,
      stage: 'tap',
      n: 24,
      sd: expect.closeTo(0.834, 3) as number,
      applied: true,
      proposed: -31,
    })
    expect(calibRow('tap', tapOffset([1, 2, 3]), 3, true, AT)).toEqual({
      kind: 'calib',
      at: AT,
      stage: 'tap',
      n: 3,
      sd: 1,
      applied: false,
      proposed: null,
      reason: 'count',
    })
    const dts = [12, 14, 11, 13, 15, 12, 14, 13]
    expect(calibRow('propose', proposeOffset(dts, 5), 8, false, AT)).toMatchObject({
      stage: 'propose',
      applied: false,
      proposed: 5 - 13,
    })
    expect(calibRow('propose', proposeOffset([1, 2], 0), 2, true, AT).sd).toBeCloseTo(0.7071, 4)
  })

  it('onboard・quit・embedError 行', () => {
    expect(onboardRow('S0b', 12.5, false, AT)).toEqual({
      kind: 'onboard',
      at: AT,
      step: 'S0b',
      seconds: 12.5,
      left: false,
    })
    expect(quitRow('S2', 40, '61250', AT)).toEqual({
      kind: 'quit',
      at: AT,
      step: 'S2',
      seconds: 40,
      left: true,
      where: '61250',
    })
    expect(embedErrorRow(150, AT)).toEqual({ kind: 'embedError', at: AT, code: 150 })
  })
})

describe('書き出し export.ts', () => {
  const rows: TelemetryRow[] = [
    embedErrorRow(101, AT),
    onboardRow('S0a', 3, false, AT),
    playRow(collectPress(initialCollect(), 2), META, SUMMARY, null, AT),
  ]

  it('JSON として読み戻すと同じ。行は 1 行に 1 つ。空でも読める', () => {
    const x = telemetryExport(rows, AT)
    const text = telemetryFileText(x)
    expect(JSON.parse(text)).toEqual({ format: TELEMETRY_FORMAT, exportedAt: AT, rows })
    expect(text.trimEnd().split('\n')).toHaveLength(rows.length + 2)
    expect(JSON.parse(telemetryFileText(telemetryExport([], AT)))).toEqual({
      format: TELEMETRY_FORMAT,
      exportedAt: AT,
      rows: [],
    })
  })

  it('リングの上限（新しい 1,000 行）まで。名前は日付', () => {
    const many = Array.from({ length: 1005 }, (_, i) => embedErrorRow(i, AT))
    const x = telemetryExport(many, AT)
    expect(x.rows).toHaveLength(1000)
    expect(x.rows[0]).toEqual(embedErrorRow(5, AT))
    expect(telemetryFileName(AT)).toBe('hexnote-telemetry-2026-10-31.json')
  })

  it('種類ごとの数（無い種類は 0）', () => {
    expect(countByKind(rows)).toEqual({
      play: 1,
      calib: 0,
      onboard: 1,
      quit: 0,
      device: 0,
      storageFail: 0,
      embedError: 1,
    })
  })
})
