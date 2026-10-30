import { describe, expect, it } from 'vitest'
import {
  clockCommand,
  clockTick,
  createClockSource,
  initialClock,
  type ClockState,
} from '../../../src/clock/clock-source.ts'
import {
  createDummyVideo,
  type DummyVideo,
  type DummyVideoOptions,
} from '../../../src/clock/dummy-video.ts'
import { songAt, toChartMs } from '../../../src/clock/map.ts'
import type { ClockEvent, ClockOutput, VideoSample } from '../../../src/clock/types.ts'

// src/clock/clock-source.ts をダミー動画で流す（now は手で進め、実時間を待たない）。出どころ: design.md §2.6・§5.1 M0-05
// の完了条件「傾き 1.00±0.01。非表示・広告模擬で切り替わらない」、相談 C の表、tests-inventory 手順 7、decisions #32〜#34
// （仮）。生成式に依る値（逆行・q̂ の出力−真、格子率）は相談 C の値でなく、このダミー（種 7）で計算し直して固定した。

const F = 1000 / 60

type Row = { now: number; out: ClockOutput; sample: VideoSample; tt: number }

/**
 * ダミー動画を流す（既定 60 fps）。hook は各 tick の前に呼ぶ。時計の pauseVideo 要求はダミーへ渡す（pass が偽を返した
 * 要求は渡さない）
 */
function drive(
  opts: DummyVideoOptions,
  ms: number,
  hook: (now: number, d: DummyVideo) => void = () => {},
  beta?: number,
  fps = 60,
  pass: (now: number) => boolean = () => true,
): { rows: Row[]; state: ClockState; video: DummyVideo } {
  const F = 1000 / fps
  const d = createDummyVideo(opts)
  let s = initialClock(
    beta === undefined ? { mode: 'video', t0: 0 } : { mode: 'video', t0: 0, beta },
  )
  d.play(0)
  const rows: Row[] = []
  for (let i = 0; i * F <= ms; i++) {
    const now = i * F
    hook(now, d)
    const sample = d.sample(now)
    const r = clockTick(s, now, sample)
    s = r.state
    rows.push({ now, out: r.out, sample, tt: d.trueTime(now) })
    for (const q of r.out.requests) if (q.kind === 'pauseVideo' && pass(now)) d.pauseVideo(now)
  }
  return { rows, state: s, video: d }
}

/** at 以降の最初の tick で 1 回だけ f を呼ぶ */
function at(
  t: number,
  f: (now: number, d: DummyVideo) => void,
): (now: number, d: DummyVideo) => void {
  let fired = false
  return (now, d) => {
    if (!fired && now >= t) {
      fired = true
      f(now, d)
    }
  }
}

const eventsOf = (rows: Row[]): { now: number; ev: ClockEvent }[] =>
  rows.flatMap((r) => r.out.events.map((ev) => ({ now: r.now, ev })))

const kindOf = (ev: ClockEvent): string =>
  ev.kind === 'resync' ? `resync:${ev.reason}` : ev.kind === 'held' ? `held:${ev.state}` : ev.kind

const kinds = (rows: Row[]): string[] =>
  eventsOf(rows).map(({ ev }) => (ev.kind === 'held' ? 'held' : kindOf(ev)))

const fullKinds = (rows: Row[]): string[] => eventsOf(rows).map(({ ev }) => kindOf(ev))

/** 手で作った標本 */
const play = (timeMs: number, extra: Partial<VideoSample> = {}): VideoSample => ({
  state: 'playing',
  timeMs,
  rate: 1,
  visible: true,
  ...extra,
})

function stats(xs: number[]): { mean: number; sd: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1))
  return { mean, sd }
}

describe('M0-05 の完了条件: 傾き 1.00±0.01', () => {
  it('15 ms 切り捨て・60 fps・10 秒で locked の間の傾きが 1.00±0.01（逆行ありでも）', () => {
    for (const opts of [{}, { backPerSec: 0.6 }]) {
      const { rows } = drive(opts, 10_000)
      const locked = rows.filter((r) => r.now >= 1000 && r.out.phase === 'locked')
      expect(locked.length).toBeGreaterThan(500)
      for (const r of locked) expect(Math.abs(r.out.map.a - 1)).toBeLessThanOrEqual(0.01)
    }
  })

  it('始まりは resync(start) と 300 ms 後の graceEnd だけ', () => {
    const { rows } = drive({}, 3000)
    expect(kinds(rows)).toEqual(['resync:start', 'graceEnd'])
    expect(eventsOf(rows)[1]?.now).toBeCloseTo(300, 6)
  })
})

describe('飛び（期待値との差 >250 ms で再アンカー）', () => {
  it('1500 ms で jump(+300) → resync(jump)・猶予の再始動（差は +307 前後）', () => {
    const { rows } = drive(
      {},
      2500,
      at(1500, (n, d) => d.jump(300, n)),
    )
    expect(kinds(rows)).toEqual(['resync:start', 'graceEnd', 'resync:jump', 'graceEnd'])
    const j = eventsOf(rows)[2]
    expect(j?.now).toBeCloseTo(1500, 6)
    if (j?.ev.kind !== 'resync') throw new Error('resync')
    expect(j.ev.devMs).toBeGreaterThan(300)
    expect(j.ev.devMs).toBeLessThan(320)
    expect(j.ev.graceUntil).toBeCloseTo(1800, 6)
  })

  it('jump(+200) は何も起きない', () => {
    const { rows } = drive(
      {},
      2500,
      at(1500, (n, d) => d.jump(200, n)),
    )
    expect(kinds(rows)).toEqual(['resync:start', 'graceEnd'])
  })

  it('seek の凍結（240 ms）: 動画側の seek は飛びとして 1 回だけ再アンカーし、凍結明けに飛びを出さない。凍結の間は保持', () => {
    for (const freezeHold of [false, true]) {
      const { rows } = drive(
        { freezeHold },
        2500,
        at(1500, (n, d) => d.seek(10_000, n)),
      )
      expect(kinds(rows)).toEqual(['resync:start', 'graceEnd', 'resync:jump', 'graceEnd'])
      const held = rows.filter((r) => r.now >= 1500 && r.now < 1740)
      const first = held[0]?.out.t
      expect(first).toBeCloseTo(9990 + 0.5 * (rows.find((r) => r.now >= 1500)?.out.qHat ?? 0), 6)
      for (const r of held) expect(r.out.t).toBe(first)
      expect(rows.find((r) => r.now >= 1760)?.out.t).toBeGreaterThan(9990)
    }
  })
})

describe('停止検知（可視・PLAYING で 2 秒凍結 → pauseVideo 要求 → 500 ms 以内に PAUSED なら動画なし）', () => {
  /** 5 ms ごとに手で標本を渡す。読みは 990 で止まる（最後の変化は now 990） */
  function manual(
    endMs: number,
    sampleAt: (now: number) => VideoSample,
  ): { log: { now: number; out: ClockOutput }[]; state: ClockState } {
    let s = initialClock({ mode: 'video', t0: 0 })
    const log: { now: number; out: ClockOutput }[] = []
    for (let now = 0; now <= endMs; now += 1) {
      if (now % 5 !== 0 && now !== 2989 && now !== 3489) continue
      const r = clockTick(s, now, sampleAt(now))
      s = r.state
      log.push({ now, out: r.out })
    }
    return { log, state: s }
  }
  const frozenAt990 = (now: number): VideoSample => ({
    state: 'playing',
    timeMs: Math.floor(Math.min(now, 990) / 15) * 15,
    rate: 1,
    visible: true,
  })

  it('最後の変化 990 から 1999 の tick（2989）はまだ、2000 の tick（2990）で stall と pauseVideo（境界）', () => {
    const { log } = manual(3000, frozenAt990)
    const by = (n: number) => log.find((l) => l.now === n)?.out
    expect(by(2989)?.events).toEqual([])
    expect(by(2989)?.phase).toBe('locked')
    expect(by(2990)?.events.map((e) => e.kind)).toEqual(['stall'])
    expect(by(2990)?.requests).toEqual([{ kind: 'pauseVideo', why: 'stall' }])
    expect(by(2990)?.phase).toBe('pauseReq')
  })

  it('要求から ＋500 の tick で PAUSED でなければ広告中（＋499 はまだ待つ）', () => {
    const { log } = manual(3500, frozenAt990)
    const by = (n: number) => log.find((l) => l.now === n)?.out
    expect(by(3489)?.phase).toBe('pauseReq')
    expect(by(3490)?.events.map((e) => e.kind)).toEqual(['adSuspected'])
    expect(by(3490)?.phase).toBe('ad')
    // 広告中は t が止まる
    expect(by(3500)?.t).toBe(by(3490)?.t)
  })

  it('非表示（visible false）では要求もイベントも無い。表示に戻ると最後の変化を now にして数え直す', () => {
    const { log } = manual(6000, (now) => ({
      ...frozenAt990(now),
      visible: now < 500 || now >= 4000,
    }))
    const after = log.filter((l) => l.now > 300).flatMap((l) => l.out.events.map((e) => e.kind))
    // 4000 で表示に戻り、6000 で凍結 2 秒
    expect(after).toEqual(['stall'])
    expect(log.find((l) => l.out.events.some((e) => e.kind === 'stall'))?.now).toBe(6000)
  })

  it('pauseLatencyMs 100: 要求＋100 の tick で動画なし（novideo）。t は続き、canReturn は読みが動くまで偽', () => {
    const { rows } = drive(
      { pauseLatencyMs: 100 },
      6000,
      at(1000, (n, d) => d.stuck(3000, n)),
    )
    const ev = eventsOf(rows)
    const stall = ev.find((e) => e.ev.kind === 'stall')
    const nv = ev.find((e) => e.ev.kind === 'novideo')
    if (stall === undefined || nv === undefined) throw new Error('stall・novideo が無い')
    // 最後の変化は 983.3（読み 975）→ 2,000 ms 後の tick
    expect(stall.now).toBeCloseTo(983.333 + 2000, 2)
    expect(nv.now).toBeCloseTo(stall.now + 100, 6)
    const i = rows.findIndex((r) => r.now === nv.now)
    expect(rows[i]?.out.mode).toBe('novideo')
    expect(rows[i]?.out.t).toBeGreaterThan(rows[i - 1]?.out.t ?? Infinity)
    expect(rows.slice(i).every((r) => r.out.mode === 'novideo' && !r.out.canReturn)).toBe(true)
    // 動画なしの傾きは再生レートそのもの
    expect(rows[rows.length - 1]?.out.map.a).toBe(1)
  })

  it('pauseLatencyMs never（広告の模擬）: ＋500 で adSuspected、以後動画なしへ切り替わらない。2.5 s ごとに要求し直し、読みが動けば adEnd', () => {
    const { rows } = drive(
      { pauseLatencyMs: 'never' },
      9500,
      at(1000, (n, d) => d.stuck(8000, n)),
    )
    expect(kinds(rows)).toEqual([
      'resync:start',
      'graceEnd',
      'stall',
      'adSuspected',
      'resync:adEnd',
      'graceEnd',
    ])
    expect(rows.some((r) => r.out.mode === 'novideo')).toBe(false)
    const ev = eventsOf(rows)
    const stallAt = ev[2]?.now ?? NaN
    expect(ev[3]?.now).toBeCloseTo(stallAt + 500, 6)
    const reqs = rows.filter((r) => r.out.requests.length > 0).map((r) => r.now - stallAt)
    expect(reqs.map((x) => Math.round(x))).toEqual([0, 2500, 5000])
    expect(ev[4]?.now).toBeCloseTo(9000, 6)
  })

  it('遅い PAUSED（pauseLatencyMs 700）: ＋500 で広告中、＋700 で held（late）（仮）', () => {
    const { rows } = drive(
      { pauseLatencyMs: 700 },
      6000,
      at(1000, (n, d) => d.stuck(3000, n)),
    )
    const ev = eventsOf(rows)
    const stallAt = ev.find((e) => e.ev.kind === 'stall')?.now ?? NaN
    expect(ev.find((e) => e.ev.kind === 'adSuspected')?.now).toBeCloseTo(stallAt + 500, 6)
    const held = ev.find((e) => e.ev.kind === 'held')
    expect(held?.now).toBeCloseTo(stallAt + 700, 6)
    expect(held?.ev).toEqual({ kind: 'held', state: 'paused', late: true })
    expect(rows.some((r) => r.out.mode === 'novideo')).toBe(false)
  })

  it('呼べなかった（pauseFailed）ら 500 ms を待たずに広告中', () => {
    let s = initialClock({ mode: 'video', t0: 0 })
    for (let now = 0; now <= 2990; now += 5) s = clockTick(s, now, frozenAt990(now)).state
    expect(s.phase).toBe('pauseReq')
    const r = clockTick(s, 2995, { ...frozenAt990(2995), pauseFailed: true })
    expect(r.out.phase).toBe('ad')
  })

  it('非表示（visible false）のダミーで 3 秒凍結しても何も起きない', () => {
    const { rows } = drive(
      { visible: false },
      6000,
      at(1000, (n, d) => d.stuck(3000, n)),
    )
    expect(kinds(rows)).toEqual(['resync:start', 'graceEnd'])
  })
})

describe('逆行と量子化の補正 q̂（β·q̂。値はダミーの種 7 で計算し直した）', () => {
  it('逆行（backPerSec 0.6・backMaxMs 10、20 秒）は標本に入らず（窓は狭義の増加）、出力−真 平均 +0.83・SD 0.15', () => {
    const { rows, state } = drive({ backPerSec: 0.6 }, 20_000)
    const backs = rows.filter(
      (r, i) => i > 0 && r.sample.timeMs < (rows[i - 1]?.sample.timeMs ?? 0),
    )
    expect(backs.length).toBe(16)
    expect(kinds(rows)).toEqual(['resync:start', 'graceEnd'])
    const w = state.window.map((p) => p.raw)
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThan(w[i - 1] ?? Infinity)
    const st = stats(rows.filter((r) => r.now >= 2000).map((r) => r.out.t - r.tt))
    expect(st.mean).toBeCloseTo(0.829, 2)
    expect(st.sd).toBeCloseTo(0.148, 2)
  })

  it('切り捨て: span < 1000 の間 q̂ 0、窓が 2 秒満ちた後（2000〜3000）は 15.0±0.3。出力−真 平均 +0.81・SD 0.11（生の読みは −6.80）', () => {
    const { rows } = drive({}, 3000)
    for (const r of rows.filter((x) => x.now < 1000)) expect(r.out.qHat).toBe(0)
    const late = rows.filter((r) => r.now >= 2000)
    for (const r of late) expect(Math.abs(r.out.qHat - 15)).toBeLessThanOrEqual(0.3)
    const out = stats(late.map((r) => r.out.t - r.tt))
    expect(out.mean).toBeCloseTo(0.813, 2)
    expect(out.sd).toBeCloseTo(0.114, 2)
    expect(stats(late.map((r) => r.sample.timeMs - r.tt)).mean).toBeCloseTo(-6.803, 2)
  })

  it('四捨五入: β 0.5 なら出力−真 ＋7.47、β 0 なら −0.01（≈0）', () => {
    const m = (beta: number) =>
      stats(
        drive({ quant: 'round' }, 3000, () => {}, beta)
          .rows.filter((r) => r.now >= 2000)
          .map((r) => r.out.t - r.tt),
      ).mean
    expect(m(0.5)).toBeCloseTo(7.473, 2)
    expect(m(0)).toBeCloseTo(-0.011, 2)
  })

  it('刻みの門: 刻みの無い読み＋ガウス 3 ms は q̂ 0（格子に乗らない）、切り捨ては刻み 15 の格子に乗って q̂ が付く', () => {
    expect(drive({ stepMs: 0, noiseSd: 3 }, 3000).state.qHat).toBe(0)
    expect(drive({}, 3000).state.qHat).toBeGreaterThan(14)
  })

  it('PLAYING 中の出力は逆行しない（逆行・揺れありでも単調）', () => {
    const { rows } = drive({ backPerSec: 2, noiseSd: 2 }, 8000)
    for (let i = 1; i < rows.length; i++)
      if (rows[i]?.out.events.length === 0)
        expect(rows[i]?.out.t).toBeGreaterThanOrEqual(rows[i - 1]?.out.t ?? Infinity)
  })
})

describe('再生レートの変更（onPlaybackRateChange で再アンカー・猶予、窓を捨てる）', () => {
  it('動画が 0.5 倍になると resync(rate)、1 秒後の傾きは 0.5±0.01', () => {
    const { rows } = drive(
      {},
      4000,
      at(1500, (n, d) => d.setRate(0.5, n)),
    )
    expect(kinds(rows)).toEqual(['resync:start', 'graceEnd', 'resync:rate', 'graceEnd'])
    const last = rows[rows.length - 1]?.out
    expect(Math.abs((last?.map.a ?? 0) - 0.5)).toBeLessThanOrEqual(0.01)
  })
})

describe('最初から動画なし（S2A・play-dev。sample は常に null）', () => {
  it('stopped → start で猶予 300 → locked。pause で止まり、resume で止めた t から猶予つき。canReturn は偽', () => {
    let s = initialClock({ mode: 'novideo', t0: -2000 })
    expect(s.phase).toBe('stopped')
    let r = clockTick(s, 100, null)
    expect(r.out.t).toBe(-2000)
    r = clockCommand(r.state, 1000, { kind: 'start' })
    expect(r.out.events).toMatchObject([
      { kind: 'resync', reason: 'start', t: -2000, graceUntil: 1300 },
    ])
    s = r.state
    expect(clockTick(s, 1299, null).out.phase).toBe('grace')
    r = clockTick(s, 1300, null)
    expect(r.out.events).toEqual([{ kind: 'graceEnd' }])
    expect(r.out.t).toBe(-1700)
    r = clockCommand(r.state, 2000, { kind: 'pause' })
    expect(r.out.phase).toBe('stopped')
    expect(r.out.t).toBe(-1000)
    expect(clockTick(r.state, 9000, null).out.t).toBe(-1000)
    r = clockCommand(r.state, 9000, { kind: 'resume' })
    expect(r.out.events).toMatchObject([{ kind: 'resync', reason: 'resume', t: -1000 }])
    expect(clockTick(r.state, 9500, null).out).toMatchObject({
      t: -500,
      phase: 'locked',
      canReturn: false,
    })
  })

  it('テンポ段の変更（setRate 0.5）は今の t から再アンカーし猶予を通す', () => {
    let s = clockCommand(initialClock({ mode: 'novideo', t0: 0 }), 0, { kind: 'start' }).state
    const r = clockCommand(s, 1000, { kind: 'setRate', rate: 0.5 })
    expect(r.out.events).toMatchObject([{ kind: 'resync', reason: 'rate', t: 1000 }])
    s = r.state
    expect(clockTick(s, 3000, null).out.t).toBe(2000)
  })

  it('seek は動画なしならその t へ（止まっていれば保持の値だけ）', () => {
    const s = clockCommand(initialClock({ mode: 'novideo', t0: 0 }), 0, { kind: 'start' }).state
    const r = clockCommand(s, 1000, { kind: 'seek', t: 5000 })
    expect(r.out.events).toMatchObject([{ kind: 'resync', reason: 'seek', t: 5000 }])
    const p = clockCommand(clockCommand(s, 1000, { kind: 'pause' }).state, 1000, {
      kind: 'seek',
      t: 7000,
    })
    expect(p.out).toMatchObject({ t: 7000, phase: 'stopped', events: [] })
  })
})

describe('動画ありの命令（pause・resume・seek・戻す）', () => {
  it('pause で止まり（動画が動き続けても）、resume は PLAYING を待ってその読みで resync(resume)', () => {
    const d = createDummyVideo()
    d.play(0)
    let s = initialClock({ mode: 'video', t0: 0 })
    for (let now = 0; now <= 1000; now += 10) s = clockTick(s, now, d.sample(now)).state
    let r = clockCommand(s, 1000, { kind: 'pause' })
    const held = r.out.t
    expect(r.out.phase).toBe('stopped')
    s = r.state
    for (let now = 1010; now <= 2000; now += 10) {
      r = clockTick(s, now, d.sample(now))
      s = r.state
      expect(r.out.t).toBe(held)
    }
    r = clockCommand(s, 2000, { kind: 'resume' })
    expect(r.out.phase).toBe('held')
    r = clockTick(r.state, 2010, d.sample(2010))
    expect(r.out.events).toMatchObject([{ kind: 'resync', reason: 'resume' }])
  })

  it('seek の命令: 次の読み（凍結の値）を保持し、動き出しで窓を始め直す（飛びを出さない）', () => {
    const d = createDummyVideo()
    d.play(0)
    let s = initialClock({ mode: 'video', t0: 0 })
    for (let now = 0; now <= 1500; now += 10) s = clockTick(s, now, d.sample(now)).state
    let r = clockCommand(s, 1500, { kind: 'seek', t: 10_000 })
    expect(r.out.events).toMatchObject([{ kind: 'resync', reason: 'seek' }])
    d.seek(10_000, 1500)
    s = r.state
    const kindsSeen: string[] = []
    for (let now = 1510; now <= 2500; now += 10) {
      r = clockTick(s, now, d.sample(now))
      s = r.state
      kindsSeen.push(...r.out.events.map((e) => e.kind))
      if (now < 1740) expect(r.out.t).toBeCloseTo(9990 + 0.5 * r.out.qHat, 9)
    }
    expect(kindsSeen).toEqual(['graceEnd'])
    expect(r.out.t).toBeGreaterThan(10_700)
  })

  it('動画なしの後、動画が動き出すと canReturn、「戻す」で resync(return) して動画の読みに合わせる', () => {
    const d = createDummyVideo({ pauseLatencyMs: 50 })
    d.play(0)
    let s = initialClock({ mode: 'video', t0: 0 })
    let r = clockTick(s, 0, d.sample(0))
    for (let now = 10; now <= 4000; now += 10) {
      if (now === 1000) d.stuck(10_000, now)
      r = clockTick(r.state, now, d.sample(now))
      for (const q of r.out.requests) if (q.kind === 'pauseVideo') d.pauseVideo(now)
    }
    expect(r.out.mode).toBe('novideo')
    expect(r.out.canReturn).toBe(false)
    expect(clockCommand(r.state, 4000, { kind: 'return' }).out.mode).toBe('novideo')
    // 利用者が iframe で再生し直す（読みは止めた所から動く）
    d.setState('playing', 4000)
    d.stuck(0, 4000)
    r = clockTick(r.state, 4010, d.sample(4010))
    expect(r.out.canReturn).toBe(true)
    s = r.state
    const back = clockCommand(s, 4010, { kind: 'return' })
    expect(back.out.mode).toBe('video')
    expect(back.out.events).toMatchObject([{ kind: 'resync', reason: 'return' }])
    expect(back.out.t).toBeCloseTo(d.sample(4010).timeMs + 0.5 * back.out.qHat, 9)
  })

  it('PAUSED（利用者が iframe で止めた）・BUFFERING は held、PLAYING で resync(unheld)', () => {
    const d = createDummyVideo()
    d.play(0)
    let s = initialClock({ mode: 'video', t0: 0 })
    const seen: string[] = []
    for (let now = 0; now <= 3000; now += 10) {
      if (now === 1000) d.setState('buffering', now)
      if (now === 1500) d.setState('playing', now)
      if (now === 2000) d.setState('paused', now)
      const r = clockTick(s, now, d.sample(now))
      s = r.state
      seen.push(
        ...r.out.events.map((e) =>
          e.kind === 'held'
            ? `held:${e.state}`
            : e.kind === 'resync'
              ? `resync:${e.reason}`
              : e.kind,
        ),
      )
    }
    expect(seen).toEqual([
      'resync:start',
      'graceEnd',
      'held:buffering',
      'resync:unheld',
      'graceEnd',
      'held:paused',
    ])
  })
})

describe('計測の値を出力から作れる（PlayTelemetry.resyncCount・fallback・clockResidualSd、SyncUsed.fallbackAt）', () => {
  it('飛び 1 回＋停止→動画なしの走りから、再同期 1・切替あり・切替の曲 ms・残差 SD を作る', () => {
    const hookJump = at(1500, (n, d) => d.jump(400, n))
    const hookStuck = at(4000, (n, d) => d.stuck(5000, n))
    const run = drive({ pauseLatencyMs: 100 }, 8000, (n, d) => {
      hookJump(n, d)
      hookStuck(n, d)
    }).rows
    const evs = eventsOf(run).map((e) => e.ev)
    const resyncCount = evs.filter(
      (e) =>
        e.kind === 'resync' &&
        (e.reason === 'jump' || e.reason === 'unheld' || e.reason === 'adEnd'),
    ).length
    const nv = evs.find((e) => e.kind === 'novideo')
    const axis = { offset: 1.5, rate: 1 }
    const fallbackAt = nv?.kind === 'novideo' ? toChartMs(nv.t, axis) : undefined
    const devs = run
      .filter((r) => r.out.phase === 'locked' && r.out.dev !== null)
      .map((r) => r.out.dev ?? 0)
    expect(resyncCount).toBe(1)
    expect(nv).toBeDefined()
    expect(fallbackAt).toBeCloseTo((nv?.kind === 'novideo' ? nv.t : 0) - 1500, 9)
    // 15 ms の切り捨ての読みの残差（量子化の雑音が主: ≈ q/√12 ＝ 4.3）
    expect(stats(devs).sd).toBeGreaterThan(3.5)
    expect(stats(devs).sd).toBeLessThan(5)
  })
})

describe('createClockSource（NowFn を注入し 1 tick に 1 回だけ読む）', () => {
  it('tick・命令・read ごとに now を 1 回呼ぶ', () => {
    let calls = 0
    let t = 0
    const src = createClockSource({ mode: 'novideo', t0: 0 }, () => {
      calls++
      return t
    })
    src.command({ kind: 'start' })
    t = 500
    expect(src.tick(null).t).toBe(500)
    expect(songAt(src.read().map, 600)).toBe(600)
    expect(calls).toBe(3)
    expect(src.state().phase).toBe('locked')
  })
})

describe('「疑う」で足した場面（手順 7）', () => {
  it('q̂ の門は表示のリフレッシュレートと再生レートで閉じない（3〜20 秒の q̂ は常に正、出力−真の平均 ＋0.1〜＋1.2）', () => {
    const cases: [number, number, number][] = [
      // [fps, 再生レート, 出力−真の平均]（このダミー、種 7 で計算した値）
      [30, 1, 0.845],
      [75, 1, 0.81],
      [120, 1, 0.763],
      [144, 1, 0.144],
      [60, 0.5, 0.788],
      [60, 0.75, 1.144],
    ]
    for (const [fps, rate, mean] of cases) {
      const late = drive({ rate }, 20_000, () => {}, undefined, fps).rows.filter(
        (r) => r.now >= 3000,
      )
      for (const r of late) expect(r.out.qHat).toBeGreaterThan(0)
      expect(stats(late.map((r) => r.out.t - r.tt)).mean).toBeCloseTo(mean, 2)
    }
  })

  it('q̂ は再アンカーで持ち越す: 飛びの直後の保持は 読み ＋ 0.5·q̂（q̂ は飛びの前の 14.99 のまま）', () => {
    const { rows } = drive(
      {},
      3200,
      at(3000, (n, d) => d.jump(300, n)),
    )
    const i = rows.findIndex((r) =>
      r.out.events.some((e) => e.kind === 'resync' && e.reason === 'jump'),
    )
    expect(i).toBeGreaterThan(0)
    for (const r of rows.slice(i, i + 4)) {
      expect(r.out.phase).toBe('grace')
      expect(r.out.qHat).toBeCloseTo(14.99, 2)
      expect(r.out.t - r.sample.timeMs).toBeCloseTo(7.495, 2)
    }
  })

  it('seek の命令の後に古い読みが 1 回来ても、次の読みで飛びとして直り t が真の時刻に付いて行く', () => {
    let s = initialClock({ mode: 'video', t0: 0 })
    const tt = (now: number): number => (now < 61_000 ? now : 10_000 + (now - 61_000))
    const read = (now: number): number => Math.floor(tt(now) / 15) * 15
    const seen: string[] = []
    let last: ClockOutput | null = null
    for (let i = 0; i * F <= 64_000; i++) {
      const now = i * F
      // seek の直後の 1 tick だけ、古い位置の読みを返すプレイヤー
      const first = now >= 61_000 && now - F < 61_000
      if (first) {
        const c = clockCommand(s, now, { kind: 'seek', t: 10_000 })
        s = c.state
        seen.push(...c.out.events.map(kindOf))
      }
      const r = clockTick(s, now, play(first ? 60_000 : read(now)))
      s = r.state
      seen.push(...r.out.events.map(kindOf))
      last = r.out
      if (now >= 62_000) expect(Math.abs(r.out.t - tt(now))).toBeLessThan(10)
    }
    expect(seen).toEqual(['resync:start', 'graceEnd', 'resync:seek', 'resync:jump', 'graceEnd'])
    expect(last?.phase).toBe('locked')
  })

  it('凍結中の 2 度目の後ろ向きの seek も飛び: 床に張り付かず、猶予を始め直す', () => {
    const h1 = at(5000, (n, d) => d.seek(3000, n))
    const h2 = at(5100, (n, d) => d.seek(1000, n))
    const { rows } = drive({}, 8000, (n, d) => {
      h1(n, d)
      h2(n, d)
    })
    expect(kinds(rows)).toEqual([
      'resync:start',
      'graceEnd',
      'resync:jump',
      'resync:jump',
      'graceEnd',
    ])
    for (const r of rows.filter((x) => x.now >= 5400))
      expect(Math.abs(r.out.t - r.tt)).toBeLessThan(10)
  })

  it('再アンカーの名目の写像の傾き ＝ 再生レート（動画の 0.5 倍・動画なしの setRate 0.5）', () => {
    const { rows } = drive(
      {},
      2000,
      at(1500, (n, d) => d.setRate(0.5, n)),
    )
    const ev = eventsOf(rows).find(({ ev }) => ev.kind === 'resync' && ev.reason === 'rate')?.ev
    expect(ev?.kind === 'resync' ? ev.nominal.a : null).toBe(0.5)
    let s = clockCommand(initialClock({ mode: 'novideo', t0: 0 }), 0, { kind: 'start' }).state
    const c = clockCommand(clockTick(s, 1000, null).state, 1000, { kind: 'setRate', rate: 0.5 })
    expect(c.out.events).toMatchObject([{ kind: 'resync', reason: 'rate', nominal: { a: 0.5 } }])
    s = c.state
    expect(clockTick(s, 2000, null).out.t).toBeCloseTo(1500, 9)
  })

  it('最後の変化は再アンカーで now にする: BUFFERING 3 秒の後、読みが止まったままなら停止検知は PLAYING から 2,000 ms 後', () => {
    const h1 = at(1000, (n, d) => d.setState('buffering', n))
    const h2 = at(4000, (n, d) => {
      d.setState('playing', n)
      d.stuck(5000, n)
    })
    const { rows } = drive({}, 7000, (n, d) => {
      h1(n, d)
      h2(n, d)
    })
    expect(fullKinds(rows).slice(0, 6)).toEqual([
      'resync:start',
      'graceEnd',
      'held:buffering',
      'resync:unheld',
      'graceEnd',
      'stall',
    ])
    const un =
      eventsOf(rows).find(({ ev }) => ev.kind === 'resync' && ev.reason === 'unheld')?.now ?? 0
    const st = eventsOf(rows).find(({ ev }) => ev.kind === 'stall')?.now ?? 0
    expect(st - un).toBeGreaterThanOrEqual(2000 - 1e-6)
    expect(st - un).toBeLessThanOrEqual(2000 + F + 1e-6)
  })

  it('捨てた逆行の読みでも最後の変化を now にする（逆行のまま凍結したら、その tick から 2,000 ms で停止検知）', () => {
    let s = initialClock({ mode: 'video', t0: 0 })
    let backAt = -1
    let stallAt = -1
    for (let i = 0; i * F <= 6000; i++) {
      const now = i * F
      // 3000 ms まで 15 ms の切り捨てで進み、その次の tick で 5 ms 戻ってそのまま止まる
      const raw = now <= 3000 ? Math.floor(now / 15) * 15 : 2980
      if (backAt < 0 && now > 3000) backAt = now
      const r = clockTick(s, now, play(raw))
      s = r.state
      if (stallAt < 0 && r.out.events.some((e) => e.kind === 'stall')) stallAt = now
    }
    expect(backAt).toBeGreaterThan(0)
    expect(stallAt - backAt).toBeGreaterThanOrEqual(2000 - 1e-6)
    expect(stallAt - backAt).toBeLessThanOrEqual(2000 + F + 1e-6)
  })

  it('canReturn は clockTick を通しても、最後の変化から 1999 ms で真・2000 ms で偽', () => {
    let s = clockCommand(initialClock({ mode: 'novideo', t0: 0 }), 0, { kind: 'start' }).state
    s = clockTick(s, 500, null).state
    s = clockTick(s, 1000, play(500)).state
    expect(clockTick(s, 2999, play(500)).out.canReturn).toBe(true)
    expect(clockTick(s, 3000, play(500)).out.canReturn).toBe(false)
    expect(clockTick(s, 2999, play(500, { state: 'paused' })).out.canReturn).toBe(false)
  })

  it('setRate の 0・負・NaN は無視し、止まっている間の setRate は再開後の傾きに効く', () => {
    let s = clockCommand(initialClock({ mode: 'novideo', t0: 0 }), 0, { kind: 'start' }).state
    for (const rate of [0, -1, Number.NaN]) {
      const c = clockCommand(s, 100, { kind: 'setRate', rate })
      expect(c.out.events).toEqual([])
      expect(c.state.rate).toBe(1)
    }
    s = clockCommand(s, 1000, { kind: 'pause' }).state
    const c = clockCommand(s, 1500, { kind: 'setRate', rate: 0.5 })
    expect(c.out.events).toEqual([])
    s = clockCommand(c.state, 2000, { kind: 'resume' }).state
    expect(clockTick(s, 3000, null).out.t).toBeCloseTo(1500, 9)
  })

  it('有限でない読み・レートの標本は読みの無い tick と同じ（t は有限のまま、resync を出し続けない）', () => {
    let s = initialClock({ mode: 'video', t0: 0 })
    const seen: string[] = []
    for (let i = 0; i * F <= 4000; i++) {
      const now = i * F
      const raw = Math.floor(now / 15) * 15
      const sample =
        i === 90
          ? play(Number.NaN)
          : now >= 2000 && now < 3000
            ? play(raw, { rate: Number.NaN })
            : play(raw)
      const r = clockTick(s, now, sample)
      s = r.state
      seen.push(...r.out.events.map(kindOf))
      expect(Number.isFinite(r.out.t)).toBe(true)
    }
    expect(seen).toEqual(['resync:start', 'graceEnd'])
  })

  it('命令の seek の後の BUFFERING を挟んだ再アンカーも seek（resyncCount に入れない）。広告中の seek も再アンカーする', () => {
    const d = createDummyVideo()
    let s = initialClock({ mode: 'video', t0: 0 })
    d.play(0)
    const seen: string[] = []
    for (let i = 0; i * F <= 5000; i++) {
      const now = i * F
      if (now >= 3000 && now - F < 3000) {
        const c = clockCommand(s, now, { kind: 'seek', t: 10_000 })
        s = c.state
        seen.push(...c.out.events.map(kindOf))
        d.seek(10_000, now)
        d.setState('buffering', now)
      }
      if (now >= 3200 && now - F < 3200) d.setState('playing', now)
      const r = clockTick(s, now, d.sample(now))
      s = r.state
      seen.push(...r.out.events.map(kindOf))
    }
    expect(seen).toEqual([
      'resync:start',
      'graceEnd',
      'resync:seek',
      'held:buffering',
      'resync:seek',
      'graceEnd',
    ])
    const ad = drive(
      { pauseLatencyMs: 'never' },
      3600,
      at(1000, (n, v) => v.stuck(9000, n)),
    )
    expect(ad.state.phase).toBe('ad')
    const c = clockCommand(ad.state, 3600, { kind: 'seek', t: 20_000 })
    expect(c.out.events).toMatchObject([{ kind: 'resync', reason: 'seek' }])
    expect(c.out.phase).toBe('grace')
  })

  it('pauseReq の間に読みが動き出して locked へ戻っても、要求から 500 ms 以内の PAUSED は動画なし（利用者の一時停止にしない）', () => {
    const { rows, state } = drive(
      { pauseLatencyMs: 200 },
      4000,
      at(1000, (n, d) => d.stuck(2100, n)),
    )
    expect(fullKinds(rows)).toEqual(['resync:start', 'graceEnd', 'stall', 'novideo'])
    const stall = rows.findIndex((r) => r.out.events.some((e) => e.kind === 'stall'))
    const nv = rows.findIndex((r) => r.out.events.some((e) => e.kind === 'novideo'))
    expect(rows.slice(stall + 1, nv).map((r) => r.out.phase)).toContain('locked')
    expect((rows[nv]?.now ?? 0) - (rows[stall]?.now ?? 0)).toBeCloseTo(200, 6)
    expect(state.mode).toBe('novideo')
  })

  it('要求の後に BUFFERING を挟んで来た 500 ms 以内の PAUSED も動画なし。止めていた t から猶予つき（resync(fallback)）', () => {
    let reqAt: number | null = null
    const { rows, state } = drive(
      { pauseLatencyMs: 'never' },
      4000,
      (n, d) => {
        if (n >= 1000 && n - F < 1000) d.stuck(9000, n)
        if (reqAt !== null && n >= reqAt + 100 && d.state === 'playing') d.setState('buffering', n)
        if (reqAt !== null && n >= reqAt + 200 && d.state === 'buffering') d.setState('paused', n)
      },
      undefined,
      60,
      (n) => {
        reqAt ??= n
        return false
      },
    )
    expect(fullKinds(rows)).toEqual([
      'resync:start',
      'graceEnd',
      'stall',
      'held:buffering',
      'novideo',
      'resync:fallback',
      'graceEnd',
    ])
    expect(state.mode).toBe('novideo')
    expect(state.phase).toBe('locked')
  })

  it('held の間の状態の変化を出す: BUFFERING → PAUSED・ENDED。一時停止中に終わった動画は再開で held(ended)', () => {
    const run = (next: 'paused' | 'ended'): string[] => {
      const h1 = at(1000, (n, d) => d.setState('buffering', n))
      const h2 = at(1500, (n, d) => d.setState(next, n))
      return fullKinds(
        drive({}, 2000, (n, d) => {
          h1(n, d)
          h2(n, d)
        }).rows,
      )
    }
    expect(run('paused')).toEqual(['resync:start', 'graceEnd', 'held:buffering', 'held:paused'])
    expect(run('ended')).toEqual(['resync:start', 'graceEnd', 'held:buffering', 'held:ended'])
    const { state } = drive({}, 1000)
    let s = clockCommand(state, 1000, { kind: 'pause' }).state
    s = clockTick(s, 3500, play(3000, { state: 'ended' })).state
    expect(clockCommand(s, 4000, { kind: 'resume' }).out.events).toEqual([
      { kind: 'held', state: 'ended', late: false },
    ])
  })
})
