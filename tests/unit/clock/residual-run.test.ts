import { describe, expect, it } from 'vitest'
import { clockTick, initialClock } from '../../../src/clock/clock-source.ts'
import {
  createDummyVideo,
  type DummyVideo,
  type DummyVideoOptions,
} from '../../../src/clock/dummy-video.ts'
import {
  runCountable,
  runSummary,
  type ResidualFrame,
  type RunSummary,
} from '../../../src/clock/residual.ts'
import { collectClock, initialCollect, welfordSd } from '../../../src/telemetry/collect.ts'

// 走の要約 runSummary・数える走 runCountable（M3 の手順 11、M3-07、仮）。出どころ: m3-kickoff 手順 11 の期待値 (1)〜(3)
// （原型で検算した値）・§7-5・§7-18、design §2.6・§5.4 L270・L274、decisions #32 (f)・#33 (c)・#97。ダミー ＝ 15 ms 切り捨て・
// 種 7・長さ 43,800 ms（U-02 の長さ）、now ＝ 原点 ＋ i·1000／fps（手順 2 の試験と同じ式）。ENDED の読みまで回す。時計残差は
// 製品の play 行と同じ collectClock → welfordSd。実装の後の値で、フレームは ENDED の読みのフレームも数える（原型より 1 多い）。

interface Opts {
  readonly fps?: number
  readonly origin?: number
  readonly dummy?: DummyVideoOptions
  /** 標本の rate を書き換える（対照の筋書き） */
  readonly reportRate?: number
  /** ここ（原点からの ms）で打ち切る */
  readonly stopMs?: number
  /** 再生の前に待つ ms（読込から ▶ までの待ち。秒数と rAF に入れない） */
  readonly leadMs?: number
  readonly hook?: (now: number, d: DummyVideo) => void
}

function runOf(o: Opts = {}): RunSummary | null {
  const fps = o.fps ?? 60
  const origin = o.origin ?? 0
  const d = createDummyVideo({ stepMs: 15, seed: 7, durationMs: 43_800, ...(o.dummy ?? {}) })
  let s = initialClock({ mode: 'video', t0: 0 })
  let c = initialCollect()
  const frames: ResidualFrame[] = []
  const lead = o.leadMs ?? 0
  let played = false
  if (lead === 0) {
    d.play(origin)
    played = true
  }
  for (let i = 0; i < 200_000; i++) {
    const now = origin + (i * 1000) / fps
    if (!played && now >= origin + lead) {
      d.play(now)
      played = true
    }
    o.hook?.(now, d)
    const smp0 = d.sample(now)
    const smp = o.reportRate === undefined ? smp0 : { ...smp0, rate: o.reportRate }
    const r = clockTick(s, now, smp)
    s = r.state
    c = collectClock(c, r.out)
    const rs = r.out.events.find((e) => e.kind === 'resync')
    frames.push({ now, raw: smp.timeMs, out: r.out.t, phase: r.out.phase, visible: smp.visible, resync: rs?.kind === 'resync' ? rs.reason : null, qHat: r.out.qHat, state: smp.state })
    if (smp.state === 'ended' || (o.stopMs !== undefined && now - origin >= o.stopMs)) break
  }
  return runSummary(frames, welfordSd(c.clockDev))
} // prettier-ignore

const r2 = (x: number | null | undefined): number => Math.round((x ?? Number.NaN) * 100) / 100
const brief = (s: RunSummary | null): Record<string, number | boolean> => {
  if (s === null) throw new Error('走が無い')
  return { frames: s.frames, n: s.n, raw: r2(s.rawSd), out: r2(s.outSd), mean: r2(s.outMean), q: r2(s.qHat), bias: r2(s.bias), slope: Math.round(s.slope * 1e5) / 1e5, ctl: r2(s.ctlSd), resyncs: s.resyncs, clock: r2(s.clockResidualSd), neg: s.negatives, sec: r2(s.seconds), raf: r2(s.rafPerSec), hidden: s.hiddenSeen, ended: s.ended, count: runCountable(s) }
} // prettier-ignore

describe('残差の 1 走（期待値 (1)）', () => {
  it('ENDED まで: n 2,448・直読み 4.28・補間後 0.09・平均 ＋7.49・q̂ 14.99・偏り −0.01・傾き 0.99999・対照 0.05・時計残差 4.38・43.8 秒・rAF 60 → 数える', () => {
    expect(brief(runOf())).toEqual({ frames: 2629, n: 2448, raw: 4.28, out: 0.09, mean: 7.49, q: 14.99, bias: -0.01, slope: 0.99999, ctl: 0.05, resyncs: 0, clock: 4.38, neg: 0, sec: 43.8, raf: 60.02, hidden: false, ended: true, count: true })
  }) // prettier-ignore

  it('数えない: 49 fps（50 fps は数える）・10,000 ms の飛び ＋300（再アンカー 1）・20,000 ms から 500 ms 隠れた・30 秒で打ち切り', () => {
    expect([brief(runOf({ fps: 49 })).raf, brief(runOf({ fps: 49 })).count]).toEqual([49.02, false])
    expect([brief(runOf({ fps: 50 })).frames, brief(runOf({ fps: 50 })).raf, brief(runOf({ fps: 50 })).count]).toEqual([2191, 50.02, true])
    let jumped = false
    const j = brief(runOf({ hook: (n, d) => { if (!jumped && n >= 10_000) { jumped = true; d.jump(300, n) } } }))
    expect([j.resyncs, j.sec, j.n, j.count]).toEqual([1, 43.5, 2250, false])
    let hid = 0
    const h = brief(runOf({ hook: (n, d) => { if (hid === 0 && n >= 20_000) { hid = 1; d.setVisible(false) } else if (hid === 1 && n >= 20_500) { hid = 2; d.setVisible(true) } } }))
    expect([h.hidden, h.n, h.count]).toEqual([true, 2418, false])
    const st = brief(runOf({ stopMs: 30_000 }))
    expect([st.frames, st.sec, st.ended, st.count]).toEqual([1801, 30, false, false])
  }) // prettier-ignore

  it('秒数と rAF は再生の始まりから（読込から ▶ まで 5 秒待っても同じ値）。始まっていなければ null', () => {
    expect(brief(runOf({ leadMs: 5000 }))).toEqual(brief(runOf()))
    expect(runSummary([{ now: 0, raw: 0, out: 0, phase: 'stopped', visible: true, resync: null, qHat: 0, state: 'cued' }], null)).toBeNull()
  }) // prettier-ignore

  it('対照の筋書き（動画が 1.001 倍、標本の rate は 1）: 対照 11.80 ＞ 直読み 4.32（補間後 0.23・傾き 1.00101）', () => {
    const c = brief(runOf({ dummy: { rate: 1.001 }, reportRate: 1 }))
    expect([c.frames, c.raw, c.out, c.ctl, c.slope]).toEqual([2627, 4.32, 0.23, 11.8, 1.00101])
  }) // prettier-ignore

  it('原点が 0 でない走（1,000.3・123,456.789）: 浮動小数の誤差で読みが 1 刻み下がる回が出て補間後 0.27・0.29、直読み 4.29 よりは小さい', () => {
    const a = brief(runOf({ origin: 1000.3 }))
    const b = brief(runOf({ origin: 123_456.789 }))
    expect([a.n, a.raw, a.out, b.n, b.raw, b.out]).toEqual([2448, 4.29, 0.27, 2449, 4.29, 0.29])
  }) // prettier-ignore
})

describe('残差の 3 走（期待値 (2)、逆行あり backPerSec 0.6）', () => {
  it('種 7・8・9: 負の増分 35・38・30、直読み 4.94・5.06・4.85、補間後 0.24・0.23・0.19、偏り ＋0.26・＋0.30・＋0.21、対照 0.20・0.19・0.15、どれも数え、補間後 ＜ 直読み', () => {
    const runs = [7, 8, 9].map((seed) => brief(runOf({ dummy: { backPerSec: 0.6, seed } })))
    expect(runs.map((r) => [r.neg, r.raw, r.out, r.q, r.bias, r.ctl, r.clock, r.n, r.count])).toEqual([
      [35, 4.94, 0.24, 15.04, 0.26, 0.2, 4.39, 2448, true],
      [38, 5.06, 0.23, 14.99, 0.3, 0.19, 4.38, 2448, true],
      [30, 4.85, 0.19, 15.01, 0.21, 0.15, 4.39, 2448, true],
    ])
    for (const r of runs) expect(r.out).toBeLessThan(r.raw as number)
  }) // prettier-ignore
})

describe('β を決めない根拠（期待値 (3)）', () => {
  it('四捨五入の読みは切り捨てと見分けられない（直読み 4.28・補間後 0.09・平均 ＋7.48・偏り −0.02）。144 Hz は n 5,876・平均 ＋3.47・q̂ 7.01・時計残差 2.03', () => {
    const r = brief(runOf({ dummy: { quant: 'round' } }))
    expect([r.raw, r.out, r.mean, r.q, r.bias]).toEqual([4.28, 0.09, 7.48, 14.99, -0.02])
    const h = brief(runOf({ fps: 144 }))
    expect([h.n, h.raw, h.out, h.mean, h.q, h.bias, h.clock]).toEqual([5876, 4.33, 0.05, 3.47, 7.01, -0.03, 2.03])
  }) // prettier-ignore
})
