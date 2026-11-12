import { describe, expect, it } from 'vitest'
import {
  createDummyVideo,
  dummyPort,
  type DummyPortOptions,
  type DummyVideo,
  type DummyVideoOptions,
} from '../../../src/clock/dummy-video.ts'
import type { VideoPort, VideoRequest, VideoState } from '../../../src/clock/types.ts'
import {
  initialSession,
  sessionInput,
  sessionTick,
  type Session,
} from '../../../src/play/session.ts'
import type { PlayEvent } from '../../../src/play/state.ts'
import { playerPort, type PlayerLike, type PortEvent } from '../../../src/youtube/port.ts'

// 動画の口（M3 の手順 1。期待値は m3-kickoff 手順 1 の (7)〜(9)、tests-inventory「M3 手順 1」）。ダミー動画の口と、
// ダミー動画を包んだ偽のプレイヤーに実物の口（playerPort）を被せた物を、play/session で 60 fps に回す。tick は i × F
// （clock-source.test.ts の drive と同じ掛け方）。凍結と入力は同じ tick の sample の前、時刻は Math.round。

const F = 1000 / 60

type Line = string

interface Run {
  lines: Line[]
  session: Session
  calls: string[]
}

interface Script {
  /** tick の前（凍結・入力）。入力は session を返す形で渡す */
  hook?: (now: number, d: DummyVideo) => void
  inputs?: ReadonlyArray<{ at: number; ev: PlayEvent }>
}

/** 口と session を回し、事象と要求を「時刻 名」の行で返す */
function run(
  port: VideoPort,
  d: DummyVideo,
  ms: number,
  script: Script,
  calls: string[] = [],
): Run {
  let s = initialSession({ mode: 'video', t0: 0 })
  const lines: Line[] = []
  const pending = [...(script.inputs ?? [])]
  const log = (now: number, video: VideoRequest[], events: { kind: string; reason?: string }[]) => {
    const at = Math.round(now)
    for (const e of events)
      lines.push(`${at} ${e.kind}${e.reason === undefined ? '' : `(${e.reason})`}`)
    for (const q of video)
      lines.push(`${at} ${q.kind}${q.kind === 'pauseVideo' ? `[${q.why}]` : ''}`)
  }
  d.play(0)
  for (let i = 0; i * F <= ms; i++) {
    const now = i * F
    script.hook?.(now, d)
    while (pending.length > 0 && (pending[0]?.at ?? Infinity) <= now) {
      const ev = pending.shift()
      if (ev === undefined) break
      const r = sessionInput(s, now, ev.ev)
      s = r.session
      log(now, r.video, r.out.events)
      port.apply(now, r.video)
    }
    const r = sessionTick(s, now, port.sample(now))
    s = r.session
    log(now, r.video, r.out.events)
    port.apply(now, r.video)
  }
  return { lines, session: s, calls }
}

/** at 以降の最初の tick で 1 回だけ */
const once = (at: number, f: (now: number, d: DummyVideo) => void) => {
  let done = false
  return (now: number, d: DummyVideo) => {
    if (!done && now >= at) {
      done = true
      f(now, d)
    }
  }
}

const freezeFrom = (at: number) => once(at, (now, d) => d.stuck(1e9, now))

const ESC_RESUME: Script['inputs'] = [
  { at: 1000, ev: { kind: 'pause', reason: 'escape' } },
  { at: 2000, ev: { kind: 'resume' } },
]

const dummy = (o: DummyVideoOptions = {}) => createDummyVideo({ pauseLatencyMs: 100, ...o })

describe('dummyPort ＋ session（期待値 (7)）', () => {
  it('Esc 1000 → pauseVideo〔user〕、再開 2000 → playVideo・resync(resume)・graceEnd 2300', () => {
    const d = dummy()
    const r = run(dummyPort(d), d, 2500, { inputs: ESC_RESUME })
    expect(r.lines).toEqual([
      '0 resync(start)',
      '300 graceEnd',
      '1000 pauseVideo[user]',
      '2000 playVideo',
      '2000 resync(resume)',
      '2300 graceEnd',
    ])
  })

  it('1000 から凍結 → stall・pauseVideo〔stall〕2983 → novideo 3083', () => {
    const d = dummy()
    const r = run(dummyPort(d), d, 3500, { hook: freezeFrom(1000) })
    expect(r.lines.slice(2)).toEqual(['2983 stall', '2983 pauseVideo[stall]', '3083 novideo'])
    expect(r.session.play.source).toBe('novideo')
  })

  it('1 回目の pauseVideo だけ呼べない → adSuspected 3000 → 出し直し 5483 → novideo・fallback 5583 → graceEnd 5883', () => {
    const d = dummy()
    let n = 0
    const callable: DummyPortOptions['callable'] = (_, q) => !(q.kind === 'pauseVideo' && n++ === 0)
    const r = run(dummyPort(d, { callable }), d, 6000, { hook: freezeFrom(1000) })
    expect(r.lines.slice(2)).toEqual([
      '2983 stall',
      '2983 pauseVideo[stall]',
      '3000 adSuspected',
      '5483 pauseVideo[stall]',
      '5583 novideo',
      '5583 resync(fallback)',
      '5883 graceEnd',
    ])
  })

  it('呼べたが効かない（pass 偽）なら adSuspected 3483', () => {
    const d = dummy()
    const r = run(dummyPort(d, { pass: () => false }), d, 3600, { hook: freezeFrom(1000) })
    expect(r.lines.slice(2)).toEqual(['2983 stall', '2983 pauseVideo[stall]', '3483 adSuspected'])
  })
})

/** PlayerState の数（ダミーの状態を戻す） */
const STATE_NUM: Record<VideoState, number> = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
}

interface Fake {
  player: PlayerLike
  calls: string[]
  /** 今の tick（口の呼び出しの前に置く） */
  setNow(now: number): void
}

/** ダミー動画を包んだ偽のプレイヤー。unreadable が真の tick は時刻を undefined で返す */
function fakePlayer(
  d: DummyVideo,
  o: {
    throwFirstPause?: boolean
    unreadable?: (now: number) => boolean
    rateUnreadable?: (now: number) => boolean
  } = {},
): Fake {
  let cur = 0
  let snapAt = NaN
  let snap = d.sample(0)
  const calls: string[] = []
  let pauses = 0
  const read = () => {
    if (snapAt !== cur) {
      snapAt = cur
      snap = d.sample(cur)
    }
    return snap
  }
  return {
    calls,
    setNow: (now) => {
      cur = now
    },
    player: {
      getPlayerState: () => STATE_NUM[read().state],
      getCurrentTime: () => (o.unreadable?.(cur) ? undefined : read().timeMs / 1000),
      getPlaybackRate: () => (o.rateUnreadable?.(cur) ? undefined : read().rate),
      pauseVideo: () => {
        calls.push(`${Math.round(cur)} pauseVideo()`)
        if (o.throwFirstPause === true && pauses++ === 0) throw new Error('呼べない')
        d.pauseVideo(cur)
      },
      playVideo: () => {
        calls.push(`${Math.round(cur)} playVideo()`)
        d.play(cur)
      },
    },
  }
}

/** 偽のプレイヤーに実物の口を被せる（now を偽のプレイヤーへ渡す包み） */
function realPort(f: Fake, halfVisible = true, events: PortEvent[] = []): VideoPort {
  const p = playerPort({
    player: () => f.player,
    visible: () => true,
    halfVisible: () => halfVisible,
    onEvent: (e) => events.push(e),
  })
  return {
    sample: (now) => {
      f.setNow(now)
      return p.sample(now)
    },
    apply: (now, q) => {
      f.setNow(now)
      p.apply(now, q)
    },
    dispose: () => p.dispose(),
  }
}

describe('playerPort ＋ 偽のプレイヤー（期待値 (8)）', () => {
  it('1 回目の pauseVideo() だけ例外 → 呼べない口と同じ値', () => {
    const d = dummy()
    const f = fakePlayer(d, { throwFirstPause: true })
    const r = run(realPort(f), d, 6000, { hook: freezeFrom(1000) })
    expect(r.lines.slice(2)).toEqual([
      '2983 stall',
      '2983 pauseVideo[stall]',
      '3000 adSuspected',
      '5483 pauseVideo[stall]',
      '5583 novideo',
      '5583 resync(fallback)',
      '5883 graceEnd',
    ])
  })

  it('例外の後の 3 tick（3000〜3033）が読めない → pauseFailed は 3050 の標本に（捨てれば 3483）', () => {
    const d = dummy()
    const f = fakePlayer(d, {
      throwFirstPause: true,
      unreadable: (now) => now >= 2999 && now < 3040,
    })
    const r = run(realPort(f), d, 3600, { hook: freezeFrom(1000) })
    expect(r.lines.slice(2, 5)).toEqual([
      '2983 stall',
      '2983 pauseVideo[stall]',
      '3050 adSuspected',
    ])
  })

  it('pause の効かない動画で凍結 1000〜3500・7000〜 → adSuspected 3000・adEnd 3500・stall 8983・adSuspected 9483', () => {
    const d = createDummyVideo({ pauseLatencyMs: 'never' })
    const f = fakePlayer(d, { throwFirstPause: true })
    const hook = (now: number, dv: DummyVideo) => {
      first(now, dv)
      second(now, dv)
    }
    const first = once(1000, (now, dv) => dv.stuck(2500, now))
    const second = freezeFrom(7000)
    const r = run(realPort(f), d, 9600, { hook })
    expect(r.lines.slice(2)).toEqual([
      '2983 stall',
      '2983 pauseVideo[stall]',
      '3000 adSuspected',
      '3500 resync(adEnd)',
      '3800 graceEnd',
      '8983 stall',
      '8983 pauseVideo[stall]',
      '9483 adSuspected',
    ])
  })
})

describe('同じ口の読めない tick と可視（期待値 (9)）', () => {
  it('1000〜4000 ms 時刻が読めない → 事象は resync(start)・graceEnd だけ、pauseVideo() 0 回', () => {
    const d = dummy()
    const f = fakePlayer(d, { unreadable: (now) => now >= 1000 && now < 4000 })
    const r = run(realPort(f), d, 4500, {})
    expect(r.lines).toEqual(['0 resync(start)', '300 graceEnd'])
    expect(f.calls).toEqual([])
  })

  it('レート 1.25 で tick 2000 だけ rate が読めない → resync(rate) 0 回', () => {
    const d = dummy({ rate: 1.25 })
    const f = fakePlayer(d, { rateUnreadable: (now) => Math.abs(now - 2000) < 1 })
    const r = run(realPort(f), d, 3000, {})
    expect(r.lines.filter((l) => l.includes('resync(rate)'))).toEqual([])
  })

  it('再開 2000 で半分超が見えない → playVideo() 0 回・notVisible 1 件・同期中のまま（見えれば 1 回・事象 0）', () => {
    const d = dummy()
    const f = fakePlayer(d)
    const events: PortEvent[] = []
    const r = run(realPort(f, false, events), d, 2500, { inputs: ESC_RESUME })
    expect(f.calls.filter((c) => c.includes('playVideo'))).toEqual([])
    expect(events.map((e) => `${Math.round(e.at)} ${e.kind}`)).toEqual(['2000 notVisible'])
    expect(r.session.play.phase).toBe('syncing')
    expect(r.session.play.source).toBe('video')

    const d2 = dummy()
    const f2 = fakePlayer(d2)
    const events2: PortEvent[] = []
    run(realPort(f2, true, events2), d2, 2500, { inputs: ESC_RESUME })
    expect(f2.calls.filter((c) => c.includes('playVideo'))).toEqual(['2000 playVideo()'])
    expect(events2).toEqual([])
  })
})
