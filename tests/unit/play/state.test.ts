import { describe, expect, it } from 'vitest'
import { createDummyVideo, type DummyVideo } from '../../../src/clock/dummy-video.ts'
import type { ClockEvent, VideoRequest, VideoSample } from '../../../src/clock/types.ts'
import {
  initialSession,
  sessionInput,
  sessionTick,
  type Session,
} from '../../../src/play/session.ts'
import { playStep, type PlayEvent, type PlayState } from '../../../src/play/state.ts'

// src/play/state.ts・session.ts。出どころ: design.md §1.2・§4.2、decisions #26（Pause 要求は冪等）・#35（仮。§4.2 の
// 「動画なし」は源 source で表し、同期中の Pause は iframe 以外で効く）、kickoff 手順 7 の申し送り（3 件）と
// next-session §6-2 の 2 件。

const S = (phase: PlayState['phase'], source: PlayState['source'] = 'video'): PlayState => ({
  phase,
  source,
})
const clock = (event: ClockEvent): PlayEvent => ({ kind: 'clock', event })
const resync = (reason: 'start' | 'jump' | 'return'): ClockEvent => ({
  kind: 'resync',
  reason,
  t: 0,
  graceUntil: 300,
  nominal: { a: 1, b: 0 },
})

describe('Pause 要求（申し送りの 3 件＋動画なしの 2 件）', () => {
  it('待機＋pause iframe → 待機のまま（click-to-play の click）。要求なし', () => {
    expect(playStep(S('idle'), { kind: 'pause', reason: 'iframe' })).toEqual({
      state: S('idle'),
      clock: [],
      video: [],
    })
  })

  it('再生＋pause → 一時停止（時計を止め、動画ありなら pauseVideo）', () => {
    expect(playStep(S('playing'), { kind: 'pause', reason: 'escape' })).toEqual({
      state: S('paused'),
      clock: [{ kind: 'pause' }],
      video: [{ kind: 'pauseVideo', why: 'user' }],
    })
  })

  it('一時停止＋pause → 一時停止のまま（タブの切替で hidden と blur の 2 件）', () => {
    const s = playStep(S('playing'), { kind: 'pause', reason: 'hidden' }).state
    const r = playStep(s, { kind: 'pause', reason: 'blur' })
    expect(r).toEqual({ state: S('paused'), clock: [], video: [] })
  })

  it('動画なし＋pause → 一時停止（動画への要求なし）', () => {
    expect(playStep(S('playing', 'novideo'), { kind: 'pause', reason: 'escape' })).toEqual({
      state: S('paused', 'novideo'),
      clock: [{ kind: 'pause' }],
      video: [],
    })
  })

  it('一時停止＋再開 → 同期中（動画なしのまま。時計の resume が猶予 300 ms を通す）', () => {
    expect(playStep(S('paused', 'novideo'), { kind: 'resume' })).toEqual({
      state: S('syncing', 'novideo'),
      clock: [{ kind: 'resume' }],
      video: [],
    })
    expect(playStep(S('paused'), { kind: 'resume' }).video).toEqual([{ kind: 'playVideo' }])
  })

  it('同期中: iframe は無視（広告の「スキップ」の click）、Escape・blur・hidden は一時停止へ', () => {
    expect(playStep(S('syncing'), { kind: 'pause', reason: 'iframe' }).state).toEqual(S('syncing'))
    for (const reason of ['escape', 'blur', 'hidden'] as const)
      expect(playStep(S('syncing'), { kind: 'pause', reason }).state).toEqual(S('paused'))
  })

  it('再生中の iframe（再生中にプレイヤーを click）も一時停止へ', () => {
    expect(playStep(S('playing'), { kind: 'pause', reason: 'iframe' }).state).toEqual(S('paused'))
  })
})

describe('時計の事象と他の遷移', () => {
  it('待機: 動画ありの開始は resync(start) で同期中。Space の start は動画なしだけ', () => {
    expect(playStep(S('idle'), clock(resync('start'))).state).toEqual(S('syncing'))
    expect(playStep(S('idle'), { kind: 'start' }).state).toEqual(S('idle'))
    expect(playStep(S('idle', 'novideo'), { kind: 'start' })).toEqual({
      state: S('syncing', 'novideo'),
      clock: [{ kind: 'start' }],
      video: [],
    })
  })

  it('graceEnd で再生、飛び・広告・BUFFERING で同期中', () => {
    expect(playStep(S('syncing'), clock({ kind: 'graceEnd' })).state).toEqual(S('playing'))
    expect(playStep(S('playing'), clock(resync('jump'))).state).toEqual(S('syncing'))
    expect(playStep(S('playing'), clock({ kind: 'adSuspected', t: 0 })).state).toEqual(S('syncing'))
    expect(
      playStep(S('playing'), clock({ kind: 'held', state: 'buffering', late: false })).state,
    ).toEqual(S('syncing'))
    expect(playStep(S('playing'), clock({ kind: 'stall', t: 0 })).state).toEqual(S('playing'))
  })

  it('PAUSED（利用者が iframe で止めた・遅い PAUSED）は一時停止（pauseVideo は出さない）、ENDED は終了', () => {
    for (const late of [false, true])
      expect(playStep(S('playing'), clock({ kind: 'held', state: 'paused', late }))).toEqual({
        state: S('paused'),
        clock: [{ kind: 'pause' }],
        video: [],
      })
    expect(
      playStep(S('syncing'), clock({ kind: 'held', state: 'ended', late: false })).state,
    ).toEqual(S('ended'))
  })

  it('動画なしへの切替（S7c）は相を保って源だけ替える。「戻す」は時計に return を頼み、resync(return) で動画へ', () => {
    expect(playStep(S('playing'), clock({ kind: 'novideo', t: 0 })).state).toEqual(
      S('playing', 'novideo'),
    )
    expect(playStep(S('playing', 'novideo'), { kind: 'return' }).clock).toEqual([
      { kind: 'return' },
    ])
    expect(playStep(S('playing', 'novideo'), clock(resync('return'))).state).toEqual(S('syncing'))
  })

  it('終了（chartEnd）の後は全て無視。待ち（S4）は型と遷移だけ', () => {
    const ended = playStep(S('playing'), { kind: 'chartEnd' }).state
    expect(ended).toEqual(S('ended'))
    expect(playStep(ended, { kind: 'resume' }).state).toEqual(S('ended'))
    const w = playStep(S('playing', 'novideo'), { kind: 'waitStop' })
    expect(w).toEqual({ state: S('waiting', 'novideo'), clock: [{ kind: 'pause' }], video: [] })
    expect(playStep(w.state, { kind: 'waitHit' }).state).toEqual(S('syncing', 'novideo'))
  })
})

describe('session（状態機械＋時計）', () => {
  it('動画なし: Space で同期中 → 300 ms で再生 → Escape で一時停止（t が止まる）→ Space で同期中（猶予 300）→ 再生', () => {
    let s: Session = initialSession({ mode: 'novideo', t0: -2000 })
    let r = sessionInput(s, 1000, { kind: 'start' })
    expect(r.session.play).toEqual(S('syncing', 'novideo'))
    r = sessionTick(r.session, 1300, null)
    expect(r.session.play).toEqual(S('playing', 'novideo'))
    expect(r.out.t).toBe(-1700)
    r = sessionInput(r.session, 1500, { kind: 'pause', reason: 'escape' })
    expect(r.session.play).toEqual(S('paused', 'novideo'))
    expect(r.out.t).toBe(-1500)
    r = sessionInput(r.session, 1600, { kind: 'pause', reason: 'hidden' })
    r = sessionInput(r.session, 1601, { kind: 'pause', reason: 'blur' })
    expect(sessionTick(r.session, 5000, null).out.t).toBe(-1500)
    r = sessionInput(r.session, 5000, { kind: 'resume' })
    expect(r.session.play).toEqual(S('syncing', 'novideo'))
    expect(r.out.events).toMatchObject([{ kind: 'resync', reason: 'resume', graceUntil: 5300 }])
    s = sessionTick(r.session, 5299, null).session
    expect(s.play.phase).toBe('syncing')
    r = sessionTick(s, 5300, null)
    expect(r.session.play).toEqual(S('playing', 'novideo'))
    expect(r.out.t).toBe(-1200)
  })

  it('動画あり: click-to-play の iframe の blur は無視、PLAYING で同期中 → 再生。Escape で pauseVideo、Space で playVideo', () => {
    const d = createDummyVideo()
    let s = initialSession({ mode: 'video', t0: 0 })
    const requests: VideoRequest[] = []
    const apply = (now: number, v: VideoRequest[]): void => {
      requests.push(...v)
      for (const q of v) {
        if (q.kind === 'pauseVideo') d.pauseVideo(now)
        if (q.kind === 'playVideo') d.play(now)
      }
    }
    let r = sessionInput(s, 0, { kind: 'pause', reason: 'iframe' })
    expect(r.session.play).toEqual(S('idle'))
    s = r.session
    d.play(10)
    for (let now = 0; now <= 1000; now += 10) {
      r = sessionTick(s, now, d.sample(now))
      s = r.session
      apply(now, r.video)
    }
    expect(s.play).toEqual(S('playing'))
    r = sessionInput(s, 1000, { kind: 'pause', reason: 'escape' })
    apply(1000, r.video)
    s = r.session
    expect(s.play).toEqual(S('paused'))
    expect(requests).toEqual([{ kind: 'pauseVideo', why: 'user' }])
    for (let now = 1010; now <= 2000; now += 10) s = sessionTick(s, now, d.sample(now)).session
    expect(d.state).toBe('paused')
    r = sessionInput(s, 2000, { kind: 'resume' })
    apply(2000, r.video)
    s = r.session
    expect(s.play).toEqual(S('syncing'))
    expect(requests.at(-1)).toEqual({ kind: 'playVideo' })
    const seen: string[] = []
    for (let now = 2010; now <= 2600; now += 10) {
      r = sessionTick(s, now, d.sample(now))
      s = r.session
      seen.push(...r.out.events.map((e) => (e.kind === 'resync' ? `resync:${e.reason}` : e.kind)))
    }
    expect(seen).toEqual(['resync:resume', 'graceEnd'])
    expect(s.play).toEqual(S('playing'))
  })

  it('動画あり: 停止検知で pauseVideo が効けば再生のまま動画なしへ（S7c）、効かなければ同期中（広告）で切り替わらない', () => {
    const run = (dv: DummyVideo): Session => {
      let s = initialSession({ mode: 'video', t0: 0 })
      dv.play(0)
      for (let now = 0; now <= 6000; now += 10) {
        if (now === 1000) dv.stuck(4000, now)
        const r = sessionTick(s, now, dv.sample(now))
        s = r.session
        for (const q of r.video) if (q.kind === 'pauseVideo') dv.pauseVideo(now)
      }
      return s
    }
    expect(run(createDummyVideo({ pauseLatencyMs: 100 })).play).toEqual(S('playing', 'novideo'))
    const ad = createDummyVideo({ pauseLatencyMs: 'never' })
    let s = initialSession({ mode: 'video', t0: 0 })
    ad.play(0)
    const phases = new Set<string>()
    for (let now = 0; now <= 4500; now += 10) {
      if (now === 1000) ad.stuck(9000, now)
      const r = sessionTick(s, now, ad.sample(now))
      s = r.session
      phases.add(`${s.play.phase}/${s.play.source}`)
    }
    expect(s.play).toEqual(S('syncing'))
    expect(phases.has('playing/novideo')).toBe(false)
  })
})

describe('session（「疑う」で足した場面）', () => {
  /** 10 ms ごとにダミーを流す。hook は各 tick の前、pass が偽の pauseVideo 要求はダミーへ渡さない */
  const run = (
    dv: DummyVideo,
    ms: number,
    hook: (now: number, d: DummyVideo, s: Session) => Session = (_n, _d, s) => s,
    pass: (now: number, nth: number) => boolean = () => true,
  ): { s: Session; seen: string[]; phases: string[] } => {
    let s = initialSession({ mode: 'video', t0: 0 })
    dv.play(0)
    const seen: string[] = []
    const phases: string[] = []
    let nth = 0
    for (let now = 0; now <= ms; now += 10) {
      s = hook(now, dv, s)
      const r = sessionTick(s, now, dv.sample(now))
      s = r.session
      seen.push(
        ...r.out.events.map((e) =>
          e.kind === 'resync'
            ? `resync:${e.reason}`
            : e.kind === 'held'
              ? `held:${e.state}`
              : e.kind,
        ),
      )
      const p = `${s.play.phase}/${s.play.source}`
      if (phases.at(-1) !== p) phases.push(p)
      for (const q of r.video) {
        if (q.kind === 'pauseVideo' && q.why === 'stall' && pass(now, nth++)) dv.pauseVideo(now)
        if (q.kind === 'pauseVideo' && q.why === 'user') dv.pauseVideo(now)
        if (q.kind === 'playVideo') dv.play(now)
      }
    }
    return { s, seen, phases }
  }

  it('広告中に要求し直した pauseVideo が効けば、止めていた t から猶予を通って再生へ戻る（動画なし）', () => {
    // 最初の要求は効かず（＋500 で広告中）、2.5 s 後の要求が 100 ms で効く
    const r = run(
      createDummyVideo({ pauseLatencyMs: 100 }),
      7000,
      (now, d, s) => {
        if (now === 1000) d.stuck(9000, now)
        return s
      },
      (_now, nth) => nth > 0,
    )
    expect(r.seen).toEqual([
      'resync:start',
      'graceEnd',
      'stall',
      'adSuspected',
      'novideo',
      'resync:fallback',
      'graceEnd',
    ])
    expect(r.phases).toEqual([
      'syncing/video',
      'playing/video',
      'syncing/video',
      'syncing/novideo',
      'playing/novideo',
    ])
  })

  it('呼べなかった（pauseFailed）要求で広告中に入っても、次の要求が効けば同じく再生へ戻る', () => {
    let s = initialSession({ mode: 'video', t0: 0 })
    let reqs = 0
    let pausedAt = Infinity
    const phases: string[] = []
    for (let now = 0; now <= 7000; now += 10) {
      const raw = Math.floor(Math.min(now, 990) / 15) * 15
      const sample: VideoSample = {
        state: now >= pausedAt ? 'paused' : 'playing',
        timeMs: raw,
        rate: 1,
        visible: true,
        pauseFailed: reqs === 1 && now < pausedAt,
      }
      const r = sessionTick(s, now, sample)
      s = r.session
      for (const q of r.video) if (q.kind === 'pauseVideo' && ++reqs === 2) pausedAt = now + 100
      const p = `${s.play.phase}/${s.play.source}`
      if (phases.at(-1) !== p) phases.push(p)
    }
    expect(reqs).toBe(2)
    expect(phases).toEqual([
      'syncing/video',
      'playing/video',
      'syncing/video',
      'syncing/novideo',
      'playing/novideo',
    ])
  })

  it('停止検知の要求の後に読みが動き出しても、500 ms 以内の PAUSED は動画なし（再生のまま）', () => {
    const r = run(createDummyVideo({ pauseLatencyMs: 200 }), 4000, (now, d, s) => {
      if (now === 1000) d.stuck(2100, now)
      return s
    })
    expect(r.seen).toEqual(['resync:start', 'graceEnd', 'stall', 'novideo'])
    expect(r.s.play).toEqual(S('playing', 'novideo'))
  })

  it('BUFFERING の後に利用者が iframe で止めた PAUSED は一時停止、ENDED は終了（同期中から）', () => {
    const go = (next: 'paused' | 'ended') =>
      run(createDummyVideo(), 3000, (now, d, s) => {
        if (now === 1000) d.setState('buffering', now)
        if (now === 1500) {
          d.setState(next, now)
          // iframe の click は同期中なので無視される（#35 (d)）。PAUSED の事象で一時停止に入る
          if (next === 'paused')
            return sessionInput(s, now, { kind: 'pause', reason: 'iframe' }).session
        }
        return s
      })
    const p = go('paused')
    expect(p.seen).toEqual(['resync:start', 'graceEnd', 'held:buffering', 'held:paused'])
    expect(p.s.play).toEqual(S('paused'))
    expect(p.s.clock.phase).toBe('stopped')
    expect(go('ended').s.play).toEqual(S('ended'))
  })

  it('一時停止の間に動画が終わっていたら、再開で終了', () => {
    const r = run(createDummyVideo({ durationMs: 2000 }), 4000, (now, d, s) => {
      if (now === 1000) return sessionInput(s, now, { kind: 'pause', reason: 'escape' }).session
      // 一時停止の間に利用者が iframe で動画を流し、最後まで届く
      if (now === 1200) d.play(now)
      if (now === 3000) return sessionInput(s, now, { kind: 'resume' }).session
      return s
    })
    expect(r.s.play).toEqual(S('ended'))
  })
})

describe('練習層の事象（M2-03、M2 の手順 5。decisions #80）', () => {
  it('waitHit {t} は止めた時計を t へ戻してから再開（seek → resume）。待ちの外では無視', () => {
    const w = playStep(S('playing', 'novideo'), { kind: 'waitStop' }).state
    expect(playStep(w, { kind: 'waitHit', t: 2200 })).toEqual({ state: S('syncing', 'novideo'), clock: [{ kind: 'seek', t: 2200 }, { kind: 'resume' }], video: [] })
    expect(playStep(S('playing', 'novideo'), { kind: 'waitHit', t: 1 }).clock).toEqual([])
  }) // prettier-ignore

  it('待ちから入った一時停止の再開は、時計を止めたまま待ちに戻す（他の一時停止は猶予を通る）', () => {
    const w = playStep(S('playing', 'novideo'), { kind: 'waitStop' }).state
    const p = playStep(w, { kind: 'pause', reason: 'escape' })
    expect(p.state).toEqual({ phase: 'paused', source: 'novideo', pausedFrom: 'waiting' })
    expect(playStep(p.state, { kind: 'resume' })).toEqual({ state: S('waiting', 'novideo'), clock: [], video: [] })
    const q = playStep(S('playing', 'novideo'), { kind: 'pause', reason: 'escape' }).state
    expect(playStep(q, { kind: 'resume' })).toEqual({ state: S('syncing', 'novideo'), clock: [{ kind: 'resume' }], video: [] })
  }) // prettier-ignore

  it('seek・setRate は時計へ渡す（待機の setRate・一時停止の seek も。終了の後は無視）', () => {
    expect(playStep(S('playing', 'novideo'), { kind: 'seek', t: 7500 }).clock).toEqual([{ kind: 'seek', t: 7500 }])
    expect(playStep(S('paused', 'novideo'), { kind: 'seek', t: 7500 }).clock).toEqual([{ kind: 'seek', t: 7500 }])
    expect(playStep(S('idle', 'novideo'), { kind: 'setRate', rate: 0.75 }).clock).toEqual([{ kind: 'setRate', rate: 0.75 }])
    expect(playStep(S('ended', 'novideo'), { kind: 'setRate', rate: 0.75 }).clock).toEqual([])
    expect(playStep(S('idle', 'novideo'), { kind: 'seek', t: 1 }).clock).toEqual([])
  }) // prettier-ignore

  it('session: 待ちの解除で猶予 300 ms の終わりに t が戻した着地へ（rate 0.75 で t 2,275 → 2,500）', () => {
    let s: Session = initialSession({ mode: 'novideo', t0: -2000, rate: 0.75 })
    s = sessionInput(s, 0, { kind: 'start' }).session
    s = sessionTick(s, 400, null).session
    s = sessionInput(s, 10_000, { kind: 'waitStop' }).session
    const r = sessionInput(s, 20_000, { kind: 'waitHit', t: 2275 })
    expect([r.session.play.phase, r.out.t]).toEqual(['syncing', 2275])
    const e = sessionTick(r.session, 20_300, null)
    expect([e.session.play.phase, e.out.t]).toEqual(['playing', 2500])
  }) // prettier-ignore
})
