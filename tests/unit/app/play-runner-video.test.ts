import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withVideoId } from '../../../src/app/dev/dev-songs.ts'
import {
  DUMMY_VIDEOS,
  dummyScenarioOf,
  scenarioPort,
  type ScenarioPort,
} from '../../../src/app/dev/dummy-port.ts'
import {
  finishedPlay,
  newRun,
  runControl,
  runFrame,
  runInput,
  runNotes,
  runOutcome,
  runPhase,
  runPress,
  runRelease,
  type Run,
  type RunEffect,
  type RunOptions,
  type RunSong,
  type RunStep,
} from '../../../src/app/play-runner.ts'
import { VIDEO_ENDED_NOTE, resultView } from '../../../src/app/result-view.ts'
import { PHASE_TEXT, phaseText } from '../../../src/app/screens/play.ts'
import { songOf } from '../../../src/app/songs.ts'
import { videoRunOf } from '../../../src/app/video-run.ts'
import type { DummyVideoOptions } from '../../../src/clock/dummy-video.ts'
import { axisOf, fromChartMs, toChartMs } from '../../../src/clock/map.ts'
import type { VideoRequest } from '../../../src/clock/types.ts'
import { neighborOf, resultsByIndex, rulesOf } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { sessionInput, sessionTick, type SessionStep } from '../../../src/play/session.ts'
import type { PlayEvent } from '../../../src/play/state.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import { isTargetPlay } from '../../../src/results/awards.ts'
import { isFinished } from '../../../src/results/record.ts'
import type { Chart, Sync } from '../../../src/shared/types.ts'
import { parseResult } from '../../../src/storage/file.ts'
import { offsetFor } from '../../../src/storage/local.ts'
import { FRAME_MS, START_NOW, planActions } from '../../../tools/harness/autoplay.ts'

// S2 の動画の回（M3 の手順 2、M3-03 前半、仮）。出どころ: m3-kickoff 手順 2 の期待値 (1)〜(9)・(12)・(13)（原型で検算した値。
// クリック譜面 ＝ 100 BPM・64 音・MIDI 60・62・64・65 の繰り返し・半拍・sync {offset 3, rate 1}〔measured 無し〕、ダミー ＝ 15 ms
// 切り捨て・種 7・60 fps）・§7-3・§7-14〜§7-17、decisions #11・#94・#95、design §2.9 L149–150・§3.3 L172。時刻は ▶ からの ms。
// 流れは play-runner.test.ts の autoplay と同じ（押下・離しの前に今の相へ、毎フレーム runFrame）に、口の標本と要求を足した。
// 筋書きは DEV の表（src/app/dev/dummy-port.ts の DUMMY_VIDEOS）をそのまま使う。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const CLICK = JSON.parse(
  readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm3', 'click.hexnote.json'), 'utf8'),
) as Chart
const SPEC = { layout: 'ableton', limit: 2, fold: 'octave' } as const

function clickSong(videoId = 'hexDmyPlain'): RunSong {
  const s = songOf(withVideoId(CLICK, videoId), SPEC)
  if (typeof s === 'string') throw new Error(s)
  return s
}

function optsOf(
  song: RunSong,
  o: { profile?: 'beginner' | 'gamer'; offsetMs?: number; video?: boolean } = {},
): RunOptions {
  const grid = buildKeyboardGrid(song.variant.layout, 28, { left: 0, top: 0 })
  const videoId = song.sync?.sources[0]?.videoId
  return {
    rules: rulesOf(PROFILES[o.profile ?? 'beginner'], {
      neighbor: neighborOf(grid.byCode),
      labels: { kb: 'both', note: 'both' },
      offsetMs: o.offsetMs ?? 0,
    }),
    sound: { melody: true, accomp: true, click: true },
    keyclick: true,
    ...(o.video === false || videoId === undefined ? {} : { video: { videoId } }),
  }
}

interface Drive {
  /** DEV の表のダミーの動画 ID（既定は何もしない） */
  readonly scenario?: string
  /** 筋書きのダミーに足す作り（長さ・レート） */
  readonly dummy?: DummyVideoOptions
  readonly pauseAt?: number
  readonly resumeAt?: number
  /** 真の時刻どおりに 64 音を押す（既定 真） */
  readonly press?: boolean
  /** ▶ から at ms に口へ（iframe での操作・レートの変更） */
  readonly at?: readonly { readonly at: number; run(sp: ScenarioPort, now: number): void }[]
  readonly profile?: 'beginner' | 'gamer'
  /**
   * 動画の真の時刻が着地（動画の軸）に達した実時刻に押す（フレームの中で補間、離しは 1 ms 後。止まった・飛び越えた音は
   * 押さない）。既定は譜面どおりの実時刻（planActions）
   */
  readonly follow?: boolean
}

interface Driven {
  readonly run: Run
  readonly frames: number
  readonly reqs: readonly { readonly at: number; readonly q: VideoRequest }[]
  readonly effects: readonly RunEffect[]
  /** 時計の事象（▶ からの ms と短い文） */
  readonly log: readonly string[]
  /** 一時停止の直後の Run.t（譜面の ms） */
  readonly tPause: number | null
  readonly sp: ScenarioPort
}

const rel = (now: number): number => Math.round((now - START_NOW) * 10) / 10

function drive(o: Drive = {}): Driven {
  const id = o.scenario ?? 'hexDmyPlain'
  const song = clickSong(id)
  const sc = dummyScenarioOf(id)
  if (sc === null) throw new Error(`表に無い ${id}`)
  const sp = scenarioPort({ ...sc, options: { ...sc.options, ...(o.dummy ?? {}) } })
  let r = newRun(song, optsOf(song, o.profile === undefined ? {} : { profile: o.profile }))
  const reqs: { at: number; q: VideoRequest }[] = []
  const effects: RunEffect[] = []
  const log: string[] = []
  const note = (step: SessionStep, now: number): void => {
    for (const ev of step.out.events)
      log.push(
        `${rel(now)} ${ev.kind}` +
          (ev.kind === 'resync'
            ? `:${ev.reason} t=${ev.t.toFixed(2)} gu=${rel(ev.graceUntil)}`
            : '') +
          (ev.kind === 'held' ? `:${ev.state}` : ''),
      )
  }
  const take = (s: RunStep, now: number): void => {
    r = s.run
    for (const e of s.effects) {
      effects.push(e)
      if (e.kind !== 'video') continue
      reqs.push({ at: rel(now), q: e.request })
      sp.port.apply(now, [e.request])
    }
  }
  const input = (now: number, ev: PlayEvent): void => {
    note(sessionInput(r.session, now, ev), now)
    take(runInput(r, now, ev), now)
  }
  // 利用者の ▶ で動画が START_NOW に走り出す（Space は無変化、(2)）
  sp.play(START_NOW)
  const actions =
    o.press === false
      ? []
      : planActions(
          r.notes,
          (ms) => START_NOW + fromChartMs(ms, r.axis),
          () => 0,
        )
  const done = new Set<number>()
  let k = 0
  let pi = 0
  let f = 0
  let paused = false
  let resumed = false
  let tPause: number | null = null
  while (runPhase(r) !== 'ended') {
    f++
    if (f > 6000) throw new Error('終わらない')
    const now = START_NOW + f * FRAME_MS
    ;(o.at ?? []).forEach((e, i) => {
      if (done.has(i) || now < START_NOW + e.at) return
      done.add(i)
      e.run(sp, START_NOW + e.at)
    })
    if (o.pauseAt !== undefined && !paused && now >= START_NOW + o.pauseAt) {
      paused = true
      input(START_NOW + o.pauseAt, { kind: 'pause', reason: 'escape' })
      tPause = r.t
    }
    if (o.resumeAt !== undefined && !resumed && now >= START_NOW + o.resumeAt) {
      resumed = true
      input(START_NOW + o.resumeAt, { kind: 'resume' })
    }
    for (let a = actions[k]; a !== undefined && a.tsPerf <= now; a = actions[++k])
      take(
        a.kind === 'press'
          ? runPress(r, { code: a.code, tsPerf: a.tsPerf, lag: 0 }, a.tsPerf)
          : runRelease(r, { code: a.code, tsPerf: a.tsPerf, forced: false }, a.tsPerf),
        a.tsPerf,
      )
    for (let n = r.notes[pi]; o.follow === true && n !== undefined; n = r.notes[pi]) {
      if (sp.video.state !== 'playing') break
      const target = fromChartMs(n.tLandMs, r.axis)
      const a = sp.video.trueTime(now - FRAME_MS)
      const b = sp.video.trueTime(now)
      if (a > target + 1e-6) {
        pi++
        continue
      }
      if (!(b >= target && b > a)) break
      const at = now - FRAME_MS + ((target - a) / (b - a)) * FRAME_MS
      take(runPress(r, { code: n.code, tsPerf: at, lag: 0 }, at), at)
      take(runRelease(r, { code: n.code, tsPerf: at + 1, forced: false }, at + 1), at + 1)
      pi++
    }
    const s = sp.port.sample(now)
    note(sessionTick(r.session, now, s), now)
    take(runFrame(r, now, now, s), now)
  }
  return { run: r, frames: f, reqs, effects, log, tPause, sp }
}

const META = { id: 'r1', at: '2026-11-12T00:00:00.000Z', profile: 'beginner' } as const
const pending = (r: Run): number => runNotes(r).filter((n) => n.state === 'pending').length
/** 判定しなかった音（再開の猶予に窓が終わった音）の index */
const skippedOf = (r: Run): number[] =>
  [...resultsByIndex(r.judge)].flatMap(([i, x]) => (x.skipped === true ? [i] : []))

describe('軸と待機（期待値 (1)・(2)）', () => {
  it('(1) fromChartMs(600k) ＝ 3,000／7,200／19,200／40,800、待機中の Run.t ＝ toChartMs(0) ＝ −3,000、endMs 39,300', () => {
    const song = clickSong()
    expect(song.sync?.sources[0]).toEqual({
      kind: 'youtube',
      videoId: 'hexDmyPlain',
      offset: 3,
      rate: 1,
    })
    const axis = axisOf(song.sync?.sources ?? [])
    expect([0, 7, 27, 63].map((k) => fromChartMs(600 * k, axis))).toEqual([
      3000, 7200, 19200, 40800,
    ])
    const r = newRun(song, optsOf(song))
    expect(r.axis).toEqual(axis)
    expect(r.opts.rules.axis).toEqual(axis)
    expect(r.t).toBe(toChartMs(0, axis))
    expect(r.t).toBe(-3000)
    expect(r.endMs).toBe(39300)
    // 動画は 42,300 で譜面の終わり（全長 43,800 より前）
    expect(fromChartMs(r.endMs, axis)).toBe(42300)
    // 発音の列は空（誤打の打鍵音だけ、§7-14）
    expect(r.items).toEqual([])
    expect(r.session.play).toEqual({ phase: 'idle', source: 'video' })
  })

  it('(2) Space（start）は無変化・要求 0。最初のフレーム（16.7、読み 15）で resync(start)・graceUntil 316.7 → 同期中、その後に再生', () => {
    const song = clickSong()
    const r = newRun(song, optsOf(song))
    const s = runInput(r, START_NOW - 500, { kind: 'start' })
    expect(runPhase(s.run)).toBe('idle')
    expect(s.effects).toEqual([])
    const sp = scenarioPort(DUMMY_VIDEOS[0] as (typeof DUMMY_VIDEOS)[number])
    sp.play(START_NOW)
    const now = START_NOW + FRAME_MS
    const smp = sp.port.sample(now)
    expect(smp?.timeMs).toBe(15)
    const ev = sessionTick(s.run.session, now, smp).out.events[0]
    expect(ev?.kind === 'resync' && ev.reason).toBe('start')
    expect(ev?.kind === 'resync' && rel(ev.graceUntil)).toBe(316.7)
    const f1 = runFrame(s.run, now, now, smp)
    expect(runPhase(f1.run)).toBe('syncing')
    expect(f1.effects.filter((e) => e.kind === 'video')).toEqual([])
    // 標本は動画の回だけ使う（動画なしの回に渡しても読まない）
    const nv = newRun(song, optsOf(song, { video: false }))
    expect(nv.video).toBe(null)
    expect(runFrame(nv, now, now, smp).run.session).toEqual(
      runFrame(nv, now, now, null).run.session,
    )
  })
})

describe('通し（期待値 (3)）', () => {
  it('perfect 64・skipped 0・平均 ＋0.55 ms、2,538 フレーム目に chartEnd、要求 0、発音の列 0 → audioLateMaxMs null', () => {
    const d = drive()
    const o = runOutcome(d.run)
    expect(o.judge.counts.perfect).toBe(64)
    expect(o.judge.skipped).toBe(0)
    expect(o.judge.meanMs).toBeCloseTo(0.55, 2)
    expect(d.frames).toBe(2538)
    expect(d.reqs).toEqual([])
    expect(o.audioLateMaxMs).toBe(null)
    expect(d.run.session.play.source).toBe('video')
    expect(o.videoEnded).toBe(false)
    expect(o.aborted).toBe(false)
  })

  it('記録: clock video・syncUsed youtube（offset 3・rate 1）・offsetUsed 0（校正が {audio −19} でも）・calibEligible 偽、称号の対象外・完走', () => {
    const cal = { v: 1 as const, audio: { offsetMs: -19, at: '2026-11-01T00:00:00.000Z', via: 'tap' as const } }
    const offsetMs = offsetFor(cal, 'youtube')
    expect(offsetMs).toBe(0)
    const d = drive()
    const f = finishedPlay(d.run, META)
    expect(f.calibEligible).toBe(false)
    expect(f.clock).toBe('video')
    expect(f.record.clock).toBe('video')
    expect(f.record.syncUsed).toEqual({ kind: 'youtube', videoId: 'hexDmyPlain', offset: 3, rate: 1 })
    expect(f.record.offsetUsed).toBe(0)
    expect(f.record.aborted).toBe(undefined)
    expect(isTargetPlay(f.record)).toBe(false)
    expect(isFinished(f.record)).toBe(true)
    // 取り込みの後も同じ（offset・rate を写す、storage/file.ts）
    expect(parseResult(JSON.parse(JSON.stringify(f.record)))?.syncUsed).toEqual(f.record.syncUsed)
    // 古い記録（offset・rate が無い）も受ける
    expect(parseResult({ ...f.record, syncUsed: { kind: 'youtube', videoId: 'hexDmyPlain' } })?.syncUsed).toEqual({ kind: 'youtube', videoId: 'hexDmyPlain' })
    expect(parseResult({ ...f.record, syncUsed: { kind: 'youtube', rate: 0 } })).toBe(null)
  }) // prettier-ignore
})

describe('一時停止と再開（期待値 (4)・(5)・(13)）', () => {
  it('(4) 10,000 に Esc → [pauseVideo(user)]・Run.t 7,000.85、12,000 に Space → [playVideo]、同じ tick の PLAYING で resync(resume)（9,997.39）、skipped 0', () => {
    const d = drive({ pauseAt: 10_000, resumeAt: 12_000, press: false })
    expect(d.reqs).toEqual([
      { at: 10_000, q: { kind: 'pauseVideo', why: 'user' } },
      { at: 12_000, q: { kind: 'playVideo' } },
    ])
    expect(d.tPause).toBeCloseTo(7000.85, 2)
    expect(d.log.find((l) => l.includes('resync:resume'))).toMatch(
      /^12000 resync:resume t=9997\.39 /,
    )
    expect(runOutcome(d.run).judge.skipped).toBe(0)
  })

  it('(4) 押す回も skipped 0', () => {
    const d = drive({ pauseAt: 10_000, resumeAt: 12_000 })
    expect(runOutcome(d.run).judge.skipped).toBe(0)
  })

  it('(5) 一時停止中に iframe で再生（11,000）→ 事象なし、13,000 の Space で resync(resume)（12,007.39）、過ぎた拍 12〜15 の 4 音は skipped', () => {
    const at = [
      { at: 11_000, run: (sp: ScenarioPort, now: number) => sp.video.setState('playing', now) },
    ]
    const quiet = drive({ pauseAt: 10_000, resumeAt: 13_000, press: false, at })
    const between = quiet.log.filter((l) => {
      const t = Number(l.split(' ')[0])
      return t > 10_000 && t < 13_000
    })
    expect(between).toEqual([])
    expect(quiet.log.find((l) => l.includes('resync:resume'))).toMatch(/ t=12007\.39 /)
    const d = drive({ pauseAt: 10_000, resumeAt: 13_000, at })
    const skipped = skippedOf(d.run)
    expect(skipped).toEqual([12, 13, 14, 15])
    expect(runOutcome(d.run).judge.skipped).toBe(4)
  })

  it('(13) 一時停止の間に ENDED: 要求は pauseVideo(user) の 1 件だけ、Space で終了（Run.t 7,000.85）、perfect 12・未判定 52、aborted 真・isFinished 偽', () => {
    const d = drive({
      pauseAt: 10_000,
      resumeAt: 12_000,
      at: [{ at: 11_000, run: (sp, now) => sp.video.setState('ended', now) }],
    })
    expect(d.reqs).toEqual([{ at: 10_000, q: { kind: 'pauseVideo', why: 'user' } }])
    expect(d.run.t).toBeCloseTo(7000.85, 2)
    expect(runOutcome(d.run).judge.counts.perfect).toBe(12)
    expect(pending(d.run)).toBe(52)
    const f = finishedPlay(d.run, META)
    expect(f.aborted).toBe(true)
    expect(f.record.aborted).toBe(true)
    expect(isFinished(f.record)).toBe(false)
  })
})

describe('動画が先に終わる（期待値 (6)、§7-16）', () => {
  it('長さ 20,000: held(ended) で終了（Run.t 17,000.96 ＜ endMs）、perfect 29・未判定 35・acc 1.0 → aborted 真・isFinished 偽、S3 の注記', () => {
    const d = drive({ dummy: { durationMs: 20_000 } })
    expect(d.log.some((l) => l.includes('held:ended'))).toBe(true)
    expect(d.run.t).toBeCloseTo(17000.96, 2)
    expect(d.run.t).toBeLessThan(d.run.endMs)
    const o = runOutcome(d.run)
    expect(o.judge.counts.perfect).toBe(29)
    expect(pending(d.run)).toBe(35)
    expect(o.judge.acc).toBe(1)
    expect(o.videoEnded).toBe(true)
    const f = finishedPlay(d.run, META)
    expect(f.record.aborted).toBe(true)
    expect(isFinished(f.record)).toBe(false)
    // 印が無ければ完走に数えられてしまう
    expect(isFinished({ ...f.record, aborted: undefined })).toBe(true)
    const v = resultView(f)
    expect(v.title).toBe('途中終了')
    expect(v.note).toBe(VIDEO_ENDED_NOTE)
    expect(v.note).toBe('動画が先に終わりました')
  })

  it('音ゲー向けはゲージ終値と点が実値（ゲージ 0 の途中終了とは分ける、仮）', () => {
    const d = drive({ dummy: { durationMs: 20_000 }, profile: 'gamer' })
    const f = finishedPlay(d.run, { ...META, profile: 'gamer' })
    expect(f.judge.gamer?.failed).toBe(false)
    const rows = new Map(resultView(f).rows)
    expect(rows.get('ゲージ終値')).not.toMatch(/途中終了/)
    expect(rows.get('点')).not.toBe('—')
    expect(resultView(f).note).toBe(VIDEO_ENDED_NOTE)
  })

  it('動画が先に終わらない回は注記なし', () => {
    expect(resultView(finishedPlay(drive().run, META)).note).toBe(null)
  })
})

describe('利用者のレート変更（期待値 (7)）', () => {
  it('10,000 で 0.75 倍: resync(rate)・要求 0・resyncCount 0・53,066.7 に chartEnd、記録 rate 0.75 → isFinished 偽', () => {
    const d = drive({ press: false, at: [{ at: 10_000, run: (sp, now) => sp.video.setRate(0.75, now) }] })
    expect(d.log.some((l) => l.includes('resync:rate'))).toBe(true)
    expect(d.reqs).toEqual([])
    expect(d.run.collect.resyncCount).toBe(0)
    expect(rel(START_NOW + d.frames * FRAME_MS)).toBe(53066.7)
    const f = finishedPlay(d.run, META)
    expect(f.record.rate).toBe(0.75)
    expect(f.calibEligible).toBe(false)
    expect(isFinished(f.record)).toBe(false)
  }) // prettier-ignore

  it('20,000 で 1 に戻した回・0.75 倍で始めて 10,000 で 1 にした回も練習記録（終わりの clock.rate は 1）', () => {
    const back = drive({
      press: false,
      at: [
        { at: 10_000, run: (sp, now) => sp.video.setRate(0.75, now) },
        { at: 20_000, run: (sp, now) => sp.video.setRate(1, now) },
      ],
    })
    expect(back.run.session.clock.rate).toBe(1)
    expect(isFinished(finishedPlay(back.run, META).record)).toBe(false)
    const slow = drive({
      press: false,
      dummy: { rate: 0.75 },
      at: [{ at: 10_000, run: (sp, now) => sp.video.setRate(1, now) }],
    })
    expect(slow.run.session.clock.rate).toBe(1)
    expect(finishedPlay(slow.run, META).record.rate).toBe(0.75)
    expect(isFinished(finishedPlay(slow.run, META).record)).toBe(false)
  })
})

describe('「最初から」と案内文（期待値 (8)、§7-3・§7-15）', () => {
  it('Pause の「最初から」: 相 idle・源 video、effects は cancelSounds と videoReset、要求 0', () => {
    const song = clickSong()
    const sp = scenarioPort(DUMMY_VIDEOS[0] as (typeof DUMMY_VIDEOS)[number])
    sp.play(START_NOW)
    let r = newRun(song, optsOf(song))
    for (let f = 1; f <= 60; f++) {
      const now = START_NOW + f * FRAME_MS
      r = runFrame(r, now, now, sp.port.sample(now)).run
    }
    r = runInput(r, START_NOW + 1000, { kind: 'pause', reason: 'escape' }).run
    expect(runPhase(r)).toBe('paused')
    const c = runControl(
      r,
      START_NOW + 1500,
      { kind: 'choice', choice: 'restart' },
      { imeStop: false },
    )
    expect(c.fresh).toBe(true)
    expect(c.go).toBe(null)
    expect(c.step?.effects).toEqual([{ kind: 'cancelSounds' }, { kind: 'videoReset' }])
    expect(c.step === null ? null : runPhase(c.step.run)).toBe('idle')
    expect(c.step?.run.session.play.source).toBe('video')
    expect(c.step?.run.t).toBe(-3000)
  })

  it('phaseText: 待機 × 動画は「プレイヤーの ▶ を押すと始まります」、読込中は「動画を読み込み中…」、他は PHASE_TEXT', () => {
    expect(phaseText({ phase: 'idle', source: 'video', ready: true })).toBe('プレイヤーの ▶ を押すと始まります')
    expect(phaseText({ phase: 'idle', source: 'video', ready: false })).toBe('動画を読み込み中…')
    expect(phaseText({ phase: 'idle', source: 'novideo', ready: true })).toBe(PHASE_TEXT.idle)
    for (const p of ['syncing', 'playing', 'paused', 'ended', 'waiting'] as const)
      expect(phaseText({ phase: p, source: 'video', ready: true })).toBe(PHASE_TEXT[p])
  }) // prettier-ignore
})

describe('DEV の筋書き（期待値 (9)）', () => {
  it('飛び ＋300（10,000）→ resync(jump)・skipped 1（拍 12）・resyncCount 1', () => {
    const d = drive({ scenario: 'hexDmyJump3' })
    expect(d.log.some((l) => l.includes('resync:jump'))).toBe(true)
    const skipped = skippedOf(d.run)
    expect(skipped).toEqual([12])
    expect(d.run.collect.resyncCount).toBe(1)
  })

  it('凍結（10,000〜）→ 11,983.3 に stall と pauseVideo(stall)、12,000 に novideo、fallbackAt 9,001、源 novideo で曲末まで、isFinished 偽', () => {
    const d = drive({ scenario: 'hexDmyFreez', press: false })
    expect(d.log.find((l) => l.includes('stall'))?.split(' ')[0]).toBe('11983.3')
    expect(d.reqs[0]).toEqual({ at: 11983.3, q: { kind: 'pauseVideo', why: 'stall' } })
    expect(d.log.find((l) => l.includes('novideo'))?.split(' ')[0]).toBe('12000')
    expect(d.run.session.play.source).toBe('novideo')
    const f = finishedPlay(d.run, META)
    expect(f.record.clock).toBe('video')
    expect(f.record.syncUsed).toEqual({ kind: 'youtube', videoId: 'hexDmyFreez', offset: 3, rate: 1, fallbackAt: 9001 })
    expect(f.record.aborted).toBe(undefined)
    expect(isFinished(f.record)).toBe(false)
  }) // prettier-ignore

  it('pause 無効（凍結 6 秒）→ 12,483.3 adSuspected、14,483.3 に要求し直し、16,000 resync(adEnd)、源は video・fallbackAt 無し', () => {
    const d = drive({ scenario: 'hexDmyAdPau', press: false })
    expect(d.log.find((l) => l.includes('adSuspected'))?.split(' ')[0]).toBe('12483.3')
    expect(d.reqs.map((x) => x.at)).toEqual([11983.3, 14483.3])
    expect(d.log.find((l) => l.includes('resync:adEnd'))?.split(' ')[0]).toBe('16000')
    expect(d.run.session.play.source).toBe('video')
    expect(finishedPlay(d.run, META).record.syncUsed.fallbackAt).toBe(undefined)
  })

  it('時刻も止まる広告（6 秒）→ 12,500 adSuspected、16,016.7 resync(adEnd)、miss 4', () => {
    const d = drive({ scenario: 'hexDmyAdHld', press: false, follow: true })
    expect(d.log.find((l) => l.includes('adSuspected'))?.split(' ')[0]).toBe('12500')
    expect(d.log.find((l) => l.includes('resync:adEnd'))?.split(' ')[0]).toBe('16016.7')
    expect(runOutcome(d.run).judge.counts.miss).toBe(4)
    expect(d.run.session.play.source).toBe('video')
  })

  it('表の ID は形だけ正しい 11 文字（videoIdOf を通る）で重ならない', () => {
    const ids = DUMMY_VIDEOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(videoRunOf({ sources: [{ kind: 'youtube', videoId: id, offset: 0, rate: 1 }] }, true, false, true)).toBe(id)
  }) // prettier-ignore
})

describe('動画の回の述語（期待値 (12)）', () => {
  const yt = (videoId: string): Sync => ({
    sources: [{ kind: 'youtube', videoId, offset: 3, rate: 1 }],
  })
  it('youtube・ID 11 文字・use 真・S2・門が真 → 動画 ID', () => {
    expect(videoRunOf(yt('M7lc1UVf-VE'), true, false, true)).toBe('M7lc1UVf-VE')
  })
  it('練習室（S4）・use 偽・ID 10 文字・URL の形・sources 空・先頭が audio・門が偽（build）→ null', () => {
    expect(videoRunOf(yt('M7lc1UVf-VE'), true, true, true)).toBe(null)
    expect(videoRunOf(yt('M7lc1UVf-VE'), false, false, true)).toBe(null)
    expect(videoRunOf(yt('M7lc1UVf-V'), true, false, true)).toBe(null)
    expect(videoRunOf(yt('https://youtu.be/M7lc1UVf-VE'), true, false, true)).toBe(null)
    expect(videoRunOf({ sources: [] }, true, false, true)).toBe(null)
    expect(videoRunOf(undefined, true, false, true)).toBe(null)
    expect(videoRunOf({ sources: [{ kind: 'audio', offset: 0, rate: 1 }, ...yt('M7lc1UVf-VE').sources] }, true, false, true)).toBe(null)
    expect(videoRunOf(yt('M7lc1UVf-VE'), true, false, false)).toBe(null)
  }) // prettier-ignore
  it('試験の中の門（import.meta.env.DEV）は真', () => {
    expect(videoRunOf(yt('M7lc1UVf-VE'), true, false)).toBe('M7lc1UVf-VE')
  })
  it('練習（S4・S0d）を併せた回は動画なし（RunOptions.video を受けない、#94）', () => {
    const song = clickSong()
    const r = newRun(song, { ...optsOf(song), practice: { mode: 'fixed', rate: 1, loop: null, autoLoop: false, autoTempo: false } })
    expect(r.video).toBe(null)
    expect(r.session.play.source).toBe('novideo')
    expect(r.items.length).toBeGreaterThan(0)
  }) // prettier-ignore
})
