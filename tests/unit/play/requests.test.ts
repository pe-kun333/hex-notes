import { describe, expect, it } from 'vitest'
import {
  canReturn,
  clockCommand,
  clockTick,
  initialClock,
  type ClockState,
} from '../../../src/clock/clock-source.ts'
import {
  createDummyVideo,
  type DummyVideo,
  type DummyVideoOptions,
} from '../../../src/clock/dummy-video.ts'
import type {
  ClockCommand,
  ClockMode,
  ClockPhase,
  ResyncReason,
  VideoState,
} from '../../../src/clock/types.ts'
import {
  initialSession,
  sessionInput,
  sessionTick,
  type Session,
  type SessionStep,
} from '../../../src/play/session.ts'
import {
  playStep,
  type PlayEvent,
  type PlayPhase,
  type PlayState,
} from '../../../src/play/state.ts'

// 動画への要求の網羅（M3 の手順 10、YouTube 規約の照合表のプログラム操作の一覧 ＝ design §6.1 L-5、decisions #11・#94・#95）。
// 出どころ: m3-kickoff 手順 10 の期待値 (1)〜(3)（(1)・(3) は手順書の原型の値。手順 7 の戻り〔§7-4 ＝ #96〕で変わった所は
// 試験の中に書いた）。製品の要求は pauseVideo〔user〕・pauseVideo〔stall〕・playVideo の 3 種だけで、seekTo の出し手は 0。
// 60 fps、tick は i × F（F ＝ 1000/60、手順 1 と同じ）。各 tick は 仕掛け → 入力 → 読み → sessionTick、要求はダミーへ渡す。

const F = 1000 / 60
const r2 = (x: number): number => Math.round(x * 100) / 100
const kindOf = (q: { kind: string; why?: string }): string =>
  q.kind === 'pauseVideo' ? `pauseVideo〔${q.why}〕` : q.kind

// ---------- (1) 状態機械の全組 ----------

const PHASES: readonly PlayPhase[] = ['idle', 'syncing', 'playing', 'waiting', 'paused', 'ended']
const SOURCES: readonly ClockMode[] = ['video', 'novideo']
const REASONS: readonly ResyncReason[] = [
  'start',
  'resume',
  'seek',
  'rate',
  'return',
  'jump',
  'unheld',
  'adEnd',
  'fallback',
]
const VIDEO_STATES: readonly VideoState[] = [
  'unstarted',
  'playing',
  'paused',
  'buffering',
  'ended',
  'cued',
]
const M = { a: 1, b: 0 }
/** 入力の事象 15 ＋ 時計の事象 25 ＝ 40 */
const EVENTS: readonly PlayEvent[] = [
  { kind: 'start' },
  ...(['escape', 'ime', 'blur', 'iframe', 'hidden'] as const).map((reason) => ({ kind: 'pause' as const, reason })),
  { kind: 'resume' },
  { kind: 'return' },
  { kind: 'chartEnd' },
  { kind: 'abort' },
  { kind: 'waitStop' },
  { kind: 'waitHit' },
  { kind: 'waitHit', t: 1000 },
  { kind: 'seek', t: 5000 },
  { kind: 'setRate', rate: 0.75 },
  ...REASONS.map((reason) => ({ kind: 'clock' as const, event: { kind: 'resync' as const, reason, t: 1000, graceUntil: 1300, nominal: M } })),
  { kind: 'clock', event: { kind: 'graceEnd' } },
  { kind: 'clock', event: { kind: 'stall', t: 1000 } },
  { kind: 'clock', event: { kind: 'adSuspected', t: 1000 } },
  { kind: 'clock', event: { kind: 'novideo', t: 1000 } },
  ...VIDEO_STATES.flatMap((state) => [false, true].map((late) => ({ kind: 'clock' as const, event: { kind: 'held' as const, state, late } }))),
] // prettier-ignore

/** 相 6 × 源 2 × pausedFrom（無し・waiting）× returning（無し・真）＝ 48 */
const STATES: readonly PlayState[] = PHASES.flatMap((phase) =>
  SOURCES.flatMap((source) =>
    [false, true].flatMap((pf) =>
      [false, true].map((ret) => ({
        phase,
        source,
        ...(pf ? { pausedFrom: 'waiting' as const } : {}),
        ...(ret ? { returning: true as const } : {}),
      })),
    ),
  ),
)

function tally(states: readonly PlayState[]): {
  kinds: Record<string, number>
  fromNovideo: string[]
} {
  const kinds: Record<string, number> = {}
  const fromNovideo: string[] = []
  for (const s of states)
    for (const e of EVENTS)
      for (const q of playStep(s, e).video) {
        kinds[kindOf(q)] = (kinds[kindOf(q)] ?? 0) + 1
        if (s.source === 'novideo')
          fromNovideo.push(`${s.phase}${s.returning === true ? '+returning' : ''} ${e.kind}`)
      }
  return { kinds, fromNovideo }
}

describe('状態機械の要求（期待値 (1)）', () => {
  it('48 状態 × 40 事象 ＝ 1,920 組: 要求は pauseVideo〔user〕・playVideo だけ（seekTo・pauseVideo〔stall〕は 0）', () => {
    expect([STATES.length, EVENTS.length]).toEqual([48, 40])
    expect(tally(STATES).kinds).toEqual({ 'pauseVideo〔user〕': 80, playVideo: 2 })
  })

  it('returning の無い 24 状態（手順書の原型の数）は 28 と 1 で源 novideo からは 0、型どおりの 14 状態は 14 と 1', () => {
    const r24 = STATES.filter((s) => s.returning === undefined)
    expect([r24.length, tally(r24).kinds, tally(r24).fromNovideo]).toEqual([24, { 'pauseVideo〔user〕': 28, playVideo: 1 }, []])
    const r14 = r24.filter((s) => s.pausedFrom === undefined || s.phase === 'paused')
    expect([r14.length, tally(r14).kinds]).toEqual([14, { 'pauseVideo〔user〕': 14, playVideo: 1 }])
  }) // prettier-ignore

  it('手順 7 の戻り（returning は源 novideo の同期中・再生だけ）を足した型どおりの 16 状態: 22 と 1。源 novideo から出るのは戻りを待つ間の一時停止だけ（iframe を除く 4 理由）', () => {
    const typed = STATES.filter((s) => (s.pausedFrom === undefined || s.phase === 'paused') && (s.returning === undefined || (s.source === 'novideo' && (s.phase === 'syncing' || s.phase === 'playing'))))
    const t = tally(typed)
    expect([typed.length, t.kinds]).toEqual([16, { 'pauseVideo〔user〕': 22, playVideo: 1 }])
    expect(t.fromNovideo).toEqual(['syncing+returning pause', 'syncing+returning pause', 'syncing+returning pause', 'syncing+returning pause', 'playing+returning pause', 'playing+returning pause', 'playing+returning pause', 'playing+returning pause'])
  }) // prettier-ignore
})

// ---------- (2) 時計の命令 ----------

type Hook = (now: number, d: DummyVideo) => void
const once = (t: number, f: Hook): Hook => {
  let done = false
  return (now, d) => {
    if (!done && now >= t) {
      done = true
      f(now, d)
    }
  }
}
const both =
  (...hs: Hook[]): Hook =>
  (now, d) => {
    for (const h of hs) h(now, d)
  }

/** 時計だけを回す（要求はダミーへ渡す）。各 tick の後の状態と tick の要求を返す */
function clockRun(opts: DummyVideoOptions, ms: number, hook: Hook, mode: ClockMode = 'video'): { snaps: { now: number; s: ClockState }[]; tick: string[] } {
  const d = createDummyVideo(opts)
  let s = initialClock({ mode, t0: 0 })
  if (mode === 'video') d.play(0)
  else s = clockCommand(s, 0, { kind: 'start' }).state
  const snaps: { now: number; s: ClockState }[] = []
  const tick: string[] = []
  for (let i = 0; i * F <= ms; i++) {
    const now = i * F
    hook(now, d)
    const r = clockTick(s, now, mode === 'video' ? d.sample(now) : null)
    s = r.state
    for (const q of r.out.requests) {
      tick.push(kindOf(q))
      if (q.kind === 'pauseVideo') d.pauseVideo(now)
    }
    snaps.push({ now, s })
  }
  return { snaps, tick }
} // prettier-ignore

const COMMANDS: readonly ClockCommand[] = [
  { kind: 'start' },
  { kind: 'pause' },
  { kind: 'resume' },
  { kind: 'seek', t: 5000 },
  { kind: 'setRate', rate: 0.75 },
  { kind: 'return' },
]

describe('時計の命令は動画への要求を出さない（期待値 (2)）', () => {
  it('6 命令を計 474 回（走り 450・止めた後 12・切替の後 12）当てても要求 0、相は 6 つ全部。tick の要求は pauseVideo〔stall〕だけ', () => {
    let calls = 0
    let requests = 0
    const phases = new Set<ClockPhase>()
    const tickKinds = new Set<string>()
    const hit = (s: ClockState, now: number): void => {
      for (const c of COMMANDS) {
        calls++
        phases.add(s.phase)
        requests += clockCommand(s, now, c).out.requests.length
      }
    }
    // (a) 源 video の筋書き 4 つ（ダミーは pause が効かない）と源 novideo 1 本の 7 秒間に 0.5 秒ごと
    const runs: [DummyVideoOptions, Hook, ClockMode][] = [
      [{ pauseLatencyMs: 'never' }, () => {}, 'video'],
      [{ pauseLatencyMs: 'never' }, once(1000, (n, d) => d.stuck(60_000, n)), 'video'],
      [{ pauseLatencyMs: 'never' }, once(1000, (n, d) => d.setState('paused', n)), 'video'],
      [{ pauseLatencyMs: 'never' }, once(1000, (n, d) => d.setState('buffering', n)), 'video'],
      [{}, () => {}, 'novideo'],
    ]
    for (const [opts, hook, mode] of runs) {
      const r = clockRun(opts, 7000, hook, mode)
      for (const k of r.tick) tickKinds.add(k)
      for (let p = 0; p <= 7000; p += 500) hit(([...r.snaps].reverse().find((x) => x.now <= p) as { s: ClockState }).s, p)
    }
    // (b) 通常の video と novideo の 3,000 ms に pause を当てた後（stopped）
    for (const mode of ['video', 'novideo'] as const) {
      const r = clockRun({}, 3000, () => {}, mode)
      hit(clockCommand((r.snaps.at(-1) as { s: ClockState }).s, 3000, { kind: 'pause' }).state, 3001)
    }
    // (c) 切替の後: 1,000 ms から 2.5 秒凍結 → 動画なし（3,500 ms）と、5,000 ms の利用者の ▶ の直後（戻りを待つ held）。
    // 手順 7 の後は、▶ の後の最初の動く読みで時計が自分で戻る（resync(return)）ので、この筋書きでは「戻す」の効く状態
    // （canReturn 真）が来ない（手順書の原型の (c) は手順 7 の前の形）
    const c = clockRun({ pauseLatencyMs: 100 }, 6500, both(once(1000, (n, d) => d.stuck(2500, n)), once(5000, (n, d) => d.play(n))))
    for (const r of c.tick) tickKinds.add(r)
    const at = (t: number): ClockState => ([...c.snaps].reverse().find((x) => x.now <= t) as { s: ClockState }).s
    expect([at(3500).mode, at(3500).phase, at(5000).mode, at(5000).phase, at(5017).mode]).toEqual(['novideo', 'locked', 'novideo', 'held', 'video'])
    expect([canReturn(at(3500), 3500), canReturn(at(5000), 5000)]).toEqual([false, false])
    hit(at(3500), 3500)
    hit(at(5000), 5000)
    expect([calls, requests]).toEqual([474, 0])
    expect([...phases].sort()).toEqual(['ad', 'grace', 'held', 'locked', 'pauseReq', 'stopped'])
    expect([...tickKinds]).toEqual(['pauseVideo〔stall〕'])
  }) // prettier-ignore
})

// ---------- (3) 筋書き 9 本 ----------

interface Step {
  readonly at: number
  run(c: { now: number; d: DummyVideo; input: (ev: PlayEvent) => SessionStep }): void
}

interface Scene {
  /** 層の要求（「種類@ms」） */
  readonly reqs: string[]
  /** 時計の事象（「ms 種類」） */
  readonly events: string[]
  /** 終わりの相/源 */
  readonly end: string
}

function scene(opts: DummyVideoOptions, ms: number, script: readonly Step[]): Scene {
  const d = createDummyVideo(opts)
  let s: Session = initialSession({ mode: 'video', t0: 0 })
  const reqs: string[] = []
  const events: string[] = []
  const take = (now: number, st: SessionStep): SessionStep => {
    s = st.session
    for (const e of st.out.events)
      events.push(`${r2(now)} ${e.kind}${e.kind === 'resync' ? `:${e.reason}` : e.kind === 'held' ? `:${e.state}` : ''}`)
    for (const q of st.video) {
      reqs.push(`${kindOf(q)}@${r2(now)}`)
      if (q.kind === 'pauseVideo') d.pauseVideo(now)
      else if (q.kind === 'playVideo') d.play(now)
      else d.seek(q.t, now)
    }
    return st
  }
  d.play(0)
  const sc = [...script].sort((a, b) => a.at - b.at)
  let k = 0
  for (let i = 0; i * F <= ms; i++) {
    const now = i * F
    for (let e = sc[k]; e !== undefined && e.at <= now; e = sc[++k]) e.run({ now, d, input: (ev) => take(now, sessionInput(s, now, ev)) })
    take(now, sessionTick(s, now, d.sample(now)))
  }
  return { reqs, events, end: `${s.play.phase}/${s.play.source}` }
} // prettier-ignore

const pause = (reason: 'escape' | 'blur' | 'hidden' | 'iframe' | 'ime'): PlayEvent => ({
  kind: 'pause',
  reason,
})
const only = (xs: readonly string[], re: RegExp): string[] => xs.filter((x) => re.test(x))

describe('筋書きの要求（期待値 (3)。session ＋ ダミー動画）', () => {
  it('(i) ＋300 ms の飛び → 0。(ii) 凍結 → S7c → pauseVideo〔stall〕1。(iii) pause 無効・凍結 12 秒 → 同 5（2,500 ms ごと）。(iv) 時刻も止まる広告 → 同 2', () => {
    const i = scene({ pauseLatencyMs: 100 }, 4000, [{ at: 1000, run: (c) => c.d.jump(300, c.now) }])
    expect([i.reqs, only(i.events, /resync/), i.end]).toEqual([[], ['0 resync:start', '1000 resync:jump'], 'playing/video'])
    const ii = scene({ pauseLatencyMs: 100 }, 8000, [{ at: 1000, run: (c) => c.d.stuck(20_000, c.now) }])
    expect([ii.reqs, only(ii.events, /stall|novideo/), ii.end]).toEqual([['pauseVideo〔stall〕@2983.33'], ['2983.33 stall', '3083.33 novideo'], 'playing/novideo'])
    const iii = scene({ pauseLatencyMs: 'never' }, 13_000, [{ at: 1000, run: (c) => c.d.stuck(12_000, c.now) }])
    expect(iii.reqs).toEqual(['pauseVideo〔stall〕@2983.33', 'pauseVideo〔stall〕@5483.33', 'pauseVideo〔stall〕@7983.33', 'pauseVideo〔stall〕@10483.33', 'pauseVideo〔stall〕@12983.33'])
    const iv = scene({ pauseLatencyMs: 'never', seekFreezeMs: 6000, freezeHold: true }, 9000, [{ at: 1000, run: (c) => c.d.seek(c.d.trueTime(c.now), c.now) }])
    expect([iv.reqs, only(iv.events, /stall|adSuspected|adEnd/), iv.end]).toEqual([['pauseVideo〔stall〕@3000', 'pauseVideo〔stall〕@5500'], ['3000 stall', '3500 adSuspected', '7016.67 resync:adEnd'], 'playing/video'])
  }) // prettier-ignore

  it('(v) 一時停止 5 理由 → 再開 → pauseVideo〔user〕5・playVideo 5。(vi) 利用者の PAUSED・BUFFERING・ENDED → 再開の playVideo 1 だけ。(vii) seek・setRate・waitStop・waitHit → 0', () => {
    const script: Step[] = (['escape', 'blur', 'hidden', 'iframe', 'ime'] as const).flatMap((r, n) => [
      { at: 1500 * (n + 1), run: (c) => void c.input(pause(r)) },
      { at: 1500 * (n + 1) + 600, run: (c) => void c.input({ kind: 'resume' }) },
    ])
    const v = scene({}, 9000, script)
    expect(v.reqs).toEqual(['pauseVideo〔user〕@1500', 'playVideo@2100', 'pauseVideo〔user〕@3000', 'playVideo@3600', 'pauseVideo〔user〕@4500', 'playVideo@5100', 'pauseVideo〔user〕@6000', 'playVideo@6600', 'pauseVideo〔user〕@7500', 'playVideo@8100'])
    const vi = scene({}, 6000, [
      { at: 1000, run: (c) => c.d.setState('buffering', c.now) },
      { at: 1500, run: (c) => c.d.setState('playing', c.now) },
      { at: 2500, run: (c) => c.d.setState('paused', c.now) },
      { at: 3400, run: (c) => void c.input({ kind: 'resume' }) },
      { at: 5000, run: (c) => c.d.setState('ended', c.now) },
    ])
    expect([vi.reqs, only(vi.events, / held:/), vi.end]).toEqual([['playVideo@3400'], ['1000 held:buffering', '2500 held:paused', '5000 held:ended'], 'ended/video'])
    const vii = scene({}, 3000, [
      { at: 1000, run: (c) => void c.input({ kind: 'seek', t: 9000 }) },
      { at: 1500, run: (c) => void c.input({ kind: 'setRate', rate: 0.75 }) },
      { at: 2000, run: (c) => void c.input({ kind: 'waitStop' }) },
      { at: 2500, run: (c) => void c.input({ kind: 'waitHit' }) },
    ])
    expect([vii.reqs, vii.end]).toEqual([[], 'playing/video'])
  }) // prettier-ignore

  it('(viii) 凍結 → S7c → 利用者の ▶ →「戻す」: 追加の要求 0。手順 7 の後は ▶ の後の最初の動く読み（5,016.67 ms）で戻り、6,500 ms の「戻す」は効かない。▶ が無ければ novideo のまま', () => {
    const play: Step = { at: 5000, run: (c) => { c.input(pause('iframe')); c.d.stuck(0, c.now); c.d.play(c.now) } }
    const ret: Step = { at: 6500, run: (c) => void c.input({ kind: 'return' }) }
    const viii = scene({ pauseLatencyMs: 100 }, 8000, [{ at: 1000, run: (c) => c.d.stuck(2500, c.now) }, play, ret])
    expect([viii.reqs, only(viii.events, /novideo|return/), viii.end]).toEqual([['pauseVideo〔stall〕@2983.33'], ['3083.33 novideo', '5016.67 resync:return'], 'playing/video'])
    const none = scene({ pauseLatencyMs: 100 }, 8000, [{ at: 1000, run: (c) => c.d.stuck(2500, c.now) }, ret])
    expect([none.reqs, only(none.events, /return/), none.end]).toEqual([['pauseVideo〔stall〕@2983.33'], [], 'playing/novideo'])
  }) // prettier-ignore

  it('(ix) Esc → 動画が ENDED → 再開: 層は pauseVideo〔user〕1・playVideo 1 と同じ歩の held(ended) で終了（口へ流さないのは play-runner、手順 2 (13)）', () => {
    const ix = scene({}, 4000, [
      { at: 1000, run: (c) => void c.input(pause('escape')) },
      { at: 2000, run: (c) => c.d.setState('ended', c.now) },
      { at: 3000, run: (c) => void c.input({ kind: 'resume' }) },
    ])
    expect([ix.reqs, only(ix.events, / held:/), ix.end]).toEqual([['pauseVideo〔user〕@1000', 'playVideo@3000'], ['3000 held:ended'], 'ended/video'])
  }) // prettier-ignore
})
