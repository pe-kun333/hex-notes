// S7c と「戻す」の試験の回し方（M3 の手順 7。試験だけが使う）。手順 2 のクリック譜面（100 BPM・64 音・sync {offset 3, rate 1}）と
// ダミー（15 ms 切り捨て・種 7・60 fps、tick は i × F）を play-runner の runFrame・runPress・runRelease・runInput・runPump で
// 回す。押下は手順 6 の pressPlanner（動画の真の時刻、源 novideo の後は時計の写像）。予約は PUMP_MS ごと（フレームの前に、
// その now より前の分）。入力（script）は時刻の順で、同じ時刻の tick より先。時刻は ▶ からの ms。時計の事象の記録は、同じ
// 入力で session を 1 歩回して読む（純関数なので回と同じ事象が出る）。

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withVideoId } from '../../../src/app/dev/dev-songs.ts'
import {
  newRun,
  runFrame,
  runInput,
  runPhase,
  runPress,
  runPump,
  runRelease,
  runVideoGone,
  type Run,
  type RunOptions,
  type RunStep,
} from '../../../src/app/play-runner.ts'
import { songOf } from '../../../src/app/songs.ts'
import { PUMP_MS } from '../../../src/audio/scheduler.ts'
import {
  createDummyVideo,
  type DummyVideo,
  type DummyVideoOptions,
} from '../../../src/clock/dummy-video.ts'
import type { ClockEvent, VideoRequest } from '../../../src/clock/types.ts'
import { neighborOf, rulesOf } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import {
  sessionIdle,
  sessionInput,
  sessionTick,
  type SessionStep,
} from '../../../src/play/session.ts'
import type { PlayEvent } from '../../../src/play/state.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { FRAME_MS, START_NOW, type AutoAction } from '../../../tools/harness/autoplay.ts'
import { pressPlanner } from '../../../tools/harness/autoplay-video.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
export const CLICK = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm3', 'click.hexnote.json'), 'utf8')) as Chart // prettier-ignore

export const rel = (now: number): number => Math.round((now - START_NOW) * 100) / 100
const r2 = (x: number): number => Math.round(x * 100) / 100

/** 筋書きの手（▶ からの at ms に。入力は同じ時刻の tick より先） */
export interface Step {
  readonly at: number
  run(c: Ctl): void
}

export interface Ctl {
  readonly d: DummyVideo
  readonly now: number
  input(ev: PlayEvent): void
  /** 利用者の ▶（iframe への blur を伴う。ダミーは stuck(0) → play。DEV の ▶（ダミー）と同じ） */
  play(): void
}

export interface DriveOptions {
  readonly script?: readonly Step[]
  readonly dummy?: DummyVideoOptions
  /** ダミーへ渡す前に要求を落とす（真を返した要求は渡さない。n は 0 から数えた要求の番号） */
  readonly drop?: (q: VideoRequest, n: number) => boolean
  /** AudioContext が running か（▶ からの ms。既定は常に真） */
  readonly running?: (atMs: number) => boolean
  /** 押さない（既定は押す） */
  readonly press?: boolean
  readonly chart?: Chart
  /** 標本を渡さない（▶ からの ms 以後。切替の後の口の失敗） */
  readonly deadFrom?: number
  /** ここ（▶ からの ms）で回すのをやめる（戻らない筋書き） */
  readonly untilMs?: number
  /** 毎フレームの runFrame の後（now は実時刻） */
  readonly onFrame?: (r: Run, now: number) => void
  /** 判定の校正（rules.offsetMs。既定 0。M3 の手順 9） */
  readonly offsetMs?: number
  /** 押下・離しを遅らせる ms（既定 0。関数なら ▶ からの ms ごとの値 ＝ ずれが曲の中で動く回。M3 の手順 9） */
  readonly delayMs?: number | ((atMs: number) => number)
  /** sync を段 4 のタップで合わせた形（measured 真）にする（M3 の手順 9） */
  readonly measured?: boolean
}

export interface Played {
  readonly at: number
  readonly tMs: number
  readonly part: string
  readonly playAt: number
  readonly late: number
}

export interface Driven {
  readonly run: Run
  readonly frames: number
  /** 時計の事象（「at 種類 t=」） */
  readonly log: readonly string[]
  /** 動画への要求（渡さなかった要求も） */
  readonly reqs: readonly string[]
  readonly sounds: readonly Played[]
  /** 相と源の変わり目 */
  readonly stages: readonly string[]
}

const tag = (ev: ClockEvent): string =>
  ev.kind === 'resync'
    ? `resync:${ev.reason} t=${r2(ev.t)}`
    : ev.kind === 'held'
      ? `held:${ev.state}`
      : ev.kind === 'graceEnd'
        ? 'graceEnd'
        : `${ev.kind} t=${r2(ev.t)}`

/** 待機の回（切替の後の部は 旋律・伴奏、クリックなし ＝ メトロノーム OFF の既定） */
export function clickRun(chart: Chart = CLICK, o: { readonly offsetMs?: number; readonly measured?: boolean } = {}): Run {
  const json = withVideoId(chart, 'hexDmyPlain') as Chart
  const synced = o.measured === true && json.sync !== undefined ? { ...json, sync: { ...json.sync, sources: json.sync.sources.map((x, i) => (i === 0 ? { ...x, measured: true } : x)) } } : json
  const song = songOf(synced, { layout: 'ableton', limit: 2, fold: 'octave' })
  if (typeof song === 'string') throw new Error(song)
  const grid = buildKeyboardGrid(song.variant.layout, 1, { left: 0, top: 0 })
  const opts: RunOptions = {
    rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode), offsetMs: o.offsetMs ?? 0 }),
    sound: { melody: false, accomp: true, click: false },
    keyclick: false,
    video: { videoId: 'hexDmyPlain' },
    fallbackSound: { melody: true, accomp: true, click: false },
  }
  return newRun(song, opts)
} // prettier-ignore

export function drive(o: DriveOptions = {}): Driven {
  let r = clickRun(o.chart, { ...(o.offsetMs === undefined ? {} : { offsetMs: o.offsetMs }), ...(o.measured === undefined ? {} : { measured: o.measured }) })
  const delay = o.delayMs ?? 0
  const d = createDummyVideo({ stepMs: 15, seed: 7, ...(o.dummy ?? {}) })
  const log: string[] = []
  const reqs: string[] = []
  const sounds: Played[] = []
  const stages: string[] = []
  let nReq = 0
  const note = (s: SessionStep, now: number): void => {
    for (const ev of s.out.events) log.push(`${rel(now)} ${tag(ev)}`)
  }
  const take = (s: RunStep, now: number): void => {
    r = s.run
    for (const e of s.effects) {
      // 先の予約を止める（画面の cancelFrom と同じ: まだ鳴っていない音を消す）
      if (e.kind === 'cancelSounds') {
        const at = rel(now)
        for (let i = sounds.length - 1; i >= 0; i--) if ((sounds[i] as Played).playAt > at) sounds.splice(i, 1)
        continue
      }
      if (e.kind !== 'video') continue
      const q = e.request
      reqs.push(`${q.kind}${q.kind === 'pauseVideo' ? `(${q.why})` : ''}@${rel(now)}`)
      if (o.drop?.(q, nReq++) === true) continue
      if (q.kind === 'pauseVideo') d.pauseVideo(now)
      else if (q.kind === 'playVideo') d.play(now)
      else d.seek(q.t, now)
    }
    const st = `${r.session.play.phase}/${r.session.play.source}`
    const last = stages[stages.length - 1]
    if (last === undefined || !last.endsWith(` ${st}`)) stages.push(`${rel(now)} ${st}`)
  }
  const input = (now: number, ev: PlayEvent): void => {
    note(sessionInput(r.session, now, ev), now)
    take(runInput(r, now, ev), now)
  }
  const ctl = (now: number): Ctl => ({
    d,
    now,
    input: (ev) => input(now, ev),
    play: () => {
      input(now, { kind: 'pause', reason: 'iframe' })
      d.stuck(0, now)
      d.play(now)
    },
  })
  d.play(START_NOW)
  const planner = pressPlanner(r.notes, r.axis)
  const actions: AutoAction[] = []
  const script = [...(o.script ?? [])].sort((a, b) => a.at - b.at)
  let si = 0
  let gone = false
  let nextPump = START_NOW
  const running = o.running ?? (() => true)
  let f = 0
  while (runPhase(r) !== 'ended') {
    f++
    if (f > 20_000) throw new Error('終わらない')
    const now = START_NOW + f * FRAME_MS
    if (o.untilMs !== undefined && now > START_NOW + o.untilMs) break
    for (; nextPump < now; nextPump += PUMP_MS) {
      const p = runPump(r, nextPump, { ctxSec: nextPump / 1000, perfMs: nextPump, via: 'outputTimestamp' }, running(nextPump - START_NOW))
      r = p.run
      for (const s of p.play) sounds.push({ at: rel(nextPump), tMs: s.item.tMs, part: s.item.part, playAt: r2(s.ctxSec * 1000 - START_NOW), late: r2(s.lateMs) })
    }
    for (let e = script[si]; e !== undefined && START_NOW + e.at <= now; e = script[++si]) e.run(ctl(START_NOW + e.at))
    actions.sort((a, b) => a.tsPerf - b.tsPerf || a.index - b.index)
    while (actions.length > 0 && (actions[0] as AutoAction).tsPerf <= now) {
      const a = actions.shift() as AutoAction
      note(sessionIdle(r.session, a.tsPerf), a.tsPerf)
      take(a.kind === 'press' ? runPress(r, { code: a.code, tsPerf: a.tsPerf, lag: 0 }, a.tsPerf) : runRelease(r, { code: a.code, tsPerf: a.tsPerf, forced: false }, a.tsPerf), a.tsPerf)
    }
    const dead = o.deadFrom !== undefined && now >= START_NOW + o.deadFrom
    // 失敗を知らせた時に 1 回（画面の failAfterSwitch と同じ）
    if (dead && !gone) {
      gone = true
      take(runVideoGone(r, now), now)
    }
    const sample = dead ? null : d.sample(now)
    note(sessionTick(r.session, now, sample), now)
    take(runFrame(r, now, FRAME_MS, sample), now)
    o.onFrame?.(r, now)
    // 遅らせた押下（全押下・離しを同じだけ後ろへ。M3 の手順 9 の校正の試し）
    if (o.press !== false) actions.push(...planner.plan(now, r.session.play.source, r.map, d).map((a) => { const dl = typeof delay === 'number' ? delay : delay(a.tsPerf - START_NOW); return dl === 0 ? a : { ...a, tsPerf: a.tsPerf + dl } }))
  }
  return { run: r, frames: f, log, reqs, sounds, stages }
} // prettier-ignore
