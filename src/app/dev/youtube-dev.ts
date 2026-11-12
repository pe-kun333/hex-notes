// YouTube の実プレイヤーの開発ページ（M3 の手順 1、仮）。実物の口（mountPlayer＋playerPort）で IFrame を読み、rAF ごとの
// 読みを play/session（源 video）に当てて、時計の t と相・事象・要求・onStateChange の時刻を記録し、JSON に書き出す。
// 測る値（decisions #34 の申し送り、m3-kickoff 手順 1）: onReady まで、再生 → PLAYING → 最初の読みの変化、pauseVideo →
// PAUSED（事象の時刻と標本の tick）、seekTo の後の古い読みの回数と ms、読みの刻み、最初の PLAYING から 10 秒の読みの傾き。
// 「再生（ミュート）」と「seekTo」はこのページだけの計測用（decisions #95 の開発ページの例外。mountPlayer の player に直に
// 呼び、製品の束に呼び出しを残さない）。「pauseVideo を今出す」は利用者の click で口の apply へ 1 件（例外に数えない）。
// 製品画面ではない（導線は開発時だけ、src/main.ts）。performance.now の直呼びは src/app/ だけ（src/README.md）。
// M3 の手順 2: 残差の道具（src/clock/residual.ts）の値を読み出しと JSON の residual に出す（m3-kickoff §7-18。完了条件 (b)
// ＝ 見本の動画を 40 秒以上・可視・rAF 50 回/秒以上で回し、補間後 SD ＜ 直読み SD を数値で残す）。

import '../styles.css'
import type {
  ClockEvent,
  ClockOutput,
  VideoPort,
  VideoRequest,
  VideoSample,
  VideoState,
} from '../../clock/types.ts'
import { residualOf, type ResidualFrame, type ResidualSummary } from '../../clock/residual.ts'
import type { InputEvent } from '../../input/keyboard.ts'
import {
  initialSession,
  sessionInput,
  sessionTick,
  type Session,
  type SessionStep,
} from '../../play/session.ts'
import type { PlayEvent } from '../../play/state.ts'
import { playerPort, type PortEvent } from '../../youtube/port.ts'
import { videoIdOf } from '../../youtube/video-id.ts'
import { moreThanHalfVisible } from '../../youtube/visible.ts'
import { attachKeyboard } from '../dom-input.ts'
import { mountPlayer, type MountedPlayer, type YtPlayer } from '../youtube-player.ts'
import { SAMPLE_VIDEO_ID as SAMPLE_ID } from './dev-songs.ts'

/** 傾きを取る長さ（最初の PLAYING から） */
const SLOPE_MS = 10_000
/** 「pauseVideo を今出す」の後に state を残す長さ */
const WATCH_MS = 500
/** 数える回の rAF の下限（回／秒） */
const MIN_RAF = 50
/** JSON に残すフレームの上限 */
const MAX_FRAMES = 6000

/** 残差の 1 行（n・直読み SD・補間後 SD・平均・q̂・偏り・傾き・再アンカー・対照。数えられる回かも） */
function residualText(r: ResidualSummary | null, wallMs: number | null): string {
  if (r === null) return '残差 —（locked・可視・再アンカーから 3 秒以後のフレームを待つ）'
  const f = (x: number, d = 2): string => x.toFixed(d)
  const long = wallMs !== null && wallMs >= 40_000
  return `残差 n ${r.n}  直読み SD ${f(r.rawSd)}  補間後 SD ${f(r.outSd)}${r.outSd < r.rawSd ? '（＜ 直読み）' : '（≥ 直読み）'}  平均 ${f(r.outMean)}  q̂ ${f(r.qHat)}  偏り ${f(r.bias)}  傾き ${f(r.slope, 5)}  再アンカー ${r.resyncs}  対照 ${f(r.ctlSd)}  ${long ? '40 秒以上' : `${Math.round((wallMs ?? 0) / 1000)} 秒（40 秒に満たない）`}`
}

/** 開発ページだけが呼ぶ口（計測用。製品の型には書かない） */
interface DevPlayer extends YtPlayer {
  mute(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
}

const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id)
  if (e === null) throw new Error(`#${id} が無い`)
  return e
}

const button = (label: string, onClick: () => void): HTMLButtonElement => {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.addEventListener('click', onClick)
  return b
}

const r1 = (x: number): number => Math.round(x * 10) / 10

interface PlayMark {
  by: 'button' | 'space' | 'iframe'
  at: number
  playingMs: number | null
  firstChangeMs: number | null
}
interface PauseMark {
  why: 'user' | 'stall' | 'button'
  at: number
  pausedEventMs: number | null
  pausedSampleMs: number | null
  states: Array<[number, VideoState | null]>
}
interface SeekMark {
  at: number
  fromMs: number | null
  toMs: number
  staleReads: number
  staleMs: number | null
}

interface DevRecord {
  videoId: string
  ua: string
  mountAt: number | null
  readyMs: number | null
  hiddenSeen: boolean
  rafMin: number | null
  plays: PlayMark[]
  pauses: PauseMark[]
  seeks: SeekMark[]
  deltas: number[]
  slope: { slope: number; advancedMs: number; wallMs: number; n: number; ok: boolean | null } | null
  /** 残差の道具の値（最初の PLAYING から。数えたフレームが 2 未満なら null） */
  residual: ResidualSummary | null
  /** 残差に渡したフレームの長さ（ms。最初と最後の now の差） */
  residualWallMs: number | null
  events: Array<{ at: number; text: string }>
  requests: Array<{ at: number; kind: string; why?: string }>
  frames: Array<[number, number | null, VideoState | null, number | null, number, string, string]>
}

const fresh = (videoId: string): DevRecord => ({
  videoId,
  ua: navigator.userAgent,
  mountAt: null,
  readyMs: null,
  hiddenSeen: document.hidden,
  rafMin: null,
  plays: [],
  pauses: [],
  seeks: [],
  deltas: [],
  slope: null,
  residual: null,
  residualWallMs: null,
  events: [],
  requests: [],
  frames: [],
})

/** 最小二乗の傾き（読みの ms ／ 実時間の ms） */
function slopeOf(pts: Array<[number, number]>): number {
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p[0], 0) / n
  const my = pts.reduce((s, p) => s + p[1], 0) / n
  const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0)
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0)
  return sxx > 0 ? sxy / sxx : NaN
}

function describe(ev: ClockEvent): string {
  switch (ev.kind) {
    case 'resync':
      return `resync（${ev.reason}）`
    case 'held':
      return `held（${ev.state}${ev.late ? '、遅い PAUSED' : ''}）`
    default:
      return ev.kind
  }
}

function main(): void {
  const host = $('host')
  const focusTarget = $('app')
  const idBox = document.createElement('input')
  idBox.value = SAMPLE_ID
  idBox.size = 40
  idBox.setAttribute('aria-label', '動画 ID か URL')

  let mounted: MountedPlayer | null = null
  let port: VideoPort | null = null
  let session: Session = initialSession({ mode: 'video', t0: 0 })
  let last: ClockOutput | null = null
  let rec: DevRecord = fresh(SAMPLE_ID)
  let prev: VideoSample | null = null
  let slopePts: Array<[number, number]> = []
  // 残差の道具に渡すフレーム（読込から。1 秒ごとと JSON の書き出しで数え直す）
  let resFrames: ResidualFrame[] = []
  const updateResidual = (): void => {
    rec.residual = residualOf(resFrames)
    const a = resFrames[0]
    const b = resFrames[resFrames.length - 1]
    rec.residualWallMs = a === undefined || b === undefined ? null : r1(b.now - a.now)
  }
  let slopeDone = false
  const frameTimes: number[] = []

  const log = (at: number, text: string): void => {
    rec.events.push({ at: r1(at), text })
    const li = document.createElement('li')
    li.textContent = `${(at / 1000).toFixed(3)} s  ${text}`
    $('log').prepend(li)
    while (($('log').childElementCount ?? 0) > 60) $('log').lastElementChild?.remove()
  }

  const onPortEvent = (e: PortEvent): void => {
    const extra =
      e.kind === 'state'
        ? ` ${e.state}`
        : e.kind === 'rate'
          ? ` ${e.rate}`
          : 'code' in e
            ? ` code ${e.code}${'group' in e ? `（${e.group}）` : ''}`
            : ''
    log(e.at, `口: ${e.kind}${extra}`)
    if (e.kind !== 'state') return
    if (e.state === 'playing') {
      const p = [...rec.plays].reverse().find((x) => x.playingMs === null)
      if (p !== undefined) p.playingMs = r1(e.at - p.at)
      else rec.plays.push({ by: 'iframe', at: r1(e.at), playingMs: 0, firstChangeMs: null })
    }
    if (e.state === 'paused') {
      const q = [...rec.pauses].reverse().find((x) => x.pausedEventMs === null)
      if (q !== undefined) q.pausedEventMs = r1(e.at - q.at)
    }
  }

  const applyReqs = (now: number, reqs: readonly VideoRequest[], why?: 'button'): void => {
    for (const q of reqs) {
      rec.requests.push({
        at: r1(now),
        kind: q.kind,
        ...(q.kind === 'pauseVideo' ? { why: why ?? q.why } : {}),
      })
      log(now, `要求: ${q.kind}${q.kind === 'pauseVideo' ? `〔${why ?? q.why}〕` : ''}`)
      if (q.kind === 'pauseVideo')
        rec.pauses.push({
          why: why ?? q.why,
          at: r1(now),
          pausedEventMs: null,
          pausedSampleMs: null,
          states: [],
        })
      if (q.kind === 'playVideo')
        rec.plays.push({ by: 'space', at: r1(now), playingMs: null, firstChangeMs: null })
    }
    port?.apply(now, reqs)
  }

  const applyStep = (now: number, step: SessionStep): void => {
    const before = session.play
    session = step.session
    last = step.out
    for (const ev of step.out.events) log(now, `時計: ${describe(ev)}`)
    applyReqs(now, step.video)
    const p = session.play
    if (p.phase !== before.phase || p.source !== before.source)
      log(now, `相: ${before.phase}/${before.source} → ${p.phase}/${p.source}`)
  }

  const playInput = (ev: PlayEvent): void => {
    const now = performance.now()
    applyStep(now, sessionInput(session, now, ev))
  }

  const load = (): void => {
    port?.dispose()
    mounted?.dispose()
    const text = idBox.value
    const id = videoIdOf(text) ?? text.trim()
    rec = fresh(id)
    session = initialSession({ mode: 'video', t0: 0 })
    last = null
    prev = null
    slopePts = []
    slopeDone = false
    resFrames = []
    $('log').replaceChildren()
    const now = performance.now()
    rec.mountAt = r1(now)
    log(now, `読み込む ${id}`)
    const m = mountPlayer({ host, videoId: id, onEvent: onPortEvent })
    mounted = m
    const docVisible = (): boolean => document.visibilityState === 'visible'
    port = playerPort({
      player: () => m.player(),
      visible: docVisible,
      halfVisible: () =>
        moreThanHalfVisible(
          host.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
          docVisible(),
        ),
      onEvent: onPortEvent,
    })
    focusTarget.focus({ preventScroll: true })
  }

  const devPlayer = (): DevPlayer | null => (mounted?.player() as DevPlayer | null) ?? null

  const exportJson = (): void => {
    updateResidual()
    const text = JSON.stringify(
      { page: 'youtube-dev', at: new Date().toISOString(), ...rec },
      null,
      1,
    )
    const box = $('json') as HTMLTextAreaElement
    box.value = text
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    a.download = `youtube-dev-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  $('controls').append(
    idBox,
    button('読み込む', load),
    button('再生（ミュート。開発ページだけ）', () => {
      const p = devPlayer()
      if (p === null) return
      const now = performance.now()
      rec.plays.push({ by: 'button', at: r1(now), playingMs: null, firstChangeMs: null })
      log(now, 'mute → playVideo（開発ページだけ）')
      p.mute()
      p.playVideo()
      focusTarget.focus({ preventScroll: true })
    }),
    button('seekTo −5 秒（開発ページだけ）', () => seekBy(-5)),
    button('seekTo ＋5 秒（開発ページだけ）', () => seekBy(5)),
    button('pauseVideo を今出す', () => {
      applyReqs(performance.now(), [{ kind: 'pauseVideo', why: 'user' }], 'button')
      focusTarget.focus({ preventScroll: true })
    }),
    button('JSON を書き出す', exportJson),
  )

  function seekBy(sec: number): void {
    const p = devPlayer()
    if (p === null) return
    const now = performance.now()
    const from = prev?.timeMs ?? null
    const target = Math.max(0, (from ?? 0) / 1000 + sec)
    rec.seeks.push({ at: r1(now), fromMs: from, toMs: target * 1000, staleReads: 0, staleMs: null })
    log(now, `seekTo ${target.toFixed(2)} s（開発ページだけ）`)
    p.seekTo(target, true)
    focusTarget.focus({ preventScroll: true })
  }

  attachKeyboard(
    window,
    (events: InputEvent[]) => {
      for (const ev of events) {
        if (ev.kind === 'role' && ev.role === 'primary') playInput({ kind: 'resume' })
        else if (ev.kind === 'role' && ev.role === 'pause')
          playInput({ kind: 'pause', reason: 'escape' })
        else if (ev.kind === 'pause') playInput({ kind: 'pause', reason: ev.reason })
      }
    },
    { focusTarget },
  )

  const frame = (): void => {
    const now = performance.now()
    frameTimes.push(now)
    while ((frameTimes[0] ?? now) < now - 1000) frameTimes.shift()
    rec.hiddenSeen ||= document.hidden
    const m = mounted
    if (m !== null && rec.readyMs === null && m.player() !== null && rec.mountAt !== null)
      rec.readyMs = r1(now - rec.mountAt)
    const sample = port?.sample(now) ?? null
    applyStep(now, sessionTick(session, now, sample))
    observe(now, sample)
    const o = last
    if (o !== null && rec.frames.length < MAX_FRAMES)
      rec.frames.push([
        r1(now),
        sample === null ? null : r1(sample.timeMs),
        sample?.state ?? null,
        sample?.rate ?? null,
        r1(o.t),
        o.phase,
        `${session.play.phase}/${session.play.source}`,
      ])
    if (o !== null && sample !== null) {
      const rs = o.events.find((e) => e.kind === 'resync')
      resFrames.push({
        now,
        raw: sample.timeMs,
        out: o.t,
        phase: o.phase,
        visible: sample.visible,
        resync: rs?.kind === 'resync' ? rs.reason : null,
        qHat: o.qHat,
      })
      if (resFrames.length % 60 === 0) updateResidual()
    }
    const raf = frameTimes.length
    if (mounted !== null && rec.readyMs !== null) rec.rafMin = Math.min(rec.rafMin ?? raf, raf)
    $('readout').textContent = [
      `読込 ${mounted?.phase() ?? '—'}   onReady まで ${rec.readyMs ?? '—'} ms   rAF ${raf} 回／秒（最小 ${rec.rafMin ?? '—'}）   hidden を見た ${rec.hiddenSeen ? 'はい' : 'いいえ'}${rec.hiddenSeen || (rec.rafMin !== null && rec.rafMin < MIN_RAF) ? '（この回は数えない）' : ''}`,
      `プレイ ${session.play.phase}/${session.play.source}   時計 ${o?.mode ?? '—'}・${o?.phase ?? '—'}   t ${o === null ? '—' : o.t.toFixed(1)} ms`,
      `標本 ${sample === null ? 'null' : `${sample.state} ${sample.timeMs.toFixed(1)} ms ×${sample.rate}`}`,
      `傾き ${rec.slope === null ? `取得中 ${slopePts.length} 点` : `${rec.slope.slope.toFixed(4)}（${rec.slope.ok === null ? '数えない' : rec.slope.ok ? '0.9〜1.1 の中' : '外'}）`}`,
      residualText(rec.residual, rec.residualWallMs),
    ].join('\n')
    requestAnimationFrame(frame)
  }

  /** 計測（再生 → 最初の読みの変化、PAUSED の tick、seek の後の古い読み、刻み、10 秒の傾き） */
  function observe(now: number, s: VideoSample | null): void {
    if (s === null) return
    const changed = prev !== null && s.timeMs !== prev.timeMs
    if (s.state === 'playing' && changed && prev !== null) {
      const d = s.timeMs - prev.timeMs
      if (d > 0 && rec.deltas.length < 2000) rec.deltas.push(r1(d))
      for (const p of rec.plays)
        if (p.playingMs !== null && p.firstChangeMs === null) p.firstChangeMs = r1(now - p.at)
    }
    for (const q of rec.pauses) {
      if (q.pausedSampleMs === null && s.state === 'paused') q.pausedSampleMs = r1(now - q.at)
      if (q.why === 'button' && now - q.at <= WATCH_MS)
        q.states.push([Math.round(now - q.at), s.state])
    }
    for (const k of rec.seeks) {
      if (k.staleMs !== null) continue
      if (Math.abs(s.timeMs - k.toMs) > 1000) k.staleReads++
      else k.staleMs = r1(now - k.at)
    }
    if (!slopeDone && s.state === 'playing') {
      slopePts.push([now, s.timeMs])
      const first = slopePts[0]
      if (first !== undefined && now - first[0] >= SLOPE_MS) finishSlope()
    } else if (!slopeDone && slopePts.length > 0 && s.state !== 'playing') finishSlope()
    prev = s
  }

  function finishSlope(): void {
    slopeDone = true
    const n = slopePts.length
    const first = slopePts[0]
    const lastPt = slopePts[n - 1]
    if (n < 2 || first === undefined || lastPt === undefined) return
    const slope = slopeOf(slopePts)
    const advancedMs = Math.round(lastPt[1] - first[1])
    const wallMs = Math.round(lastPt[0] - first[0])
    rec.slope = {
      slope: Math.round(slope * 10000) / 10000,
      advancedMs,
      wallMs,
      n,
      // 数える回は visible・rAF 50 回／秒以上・hidden を見ない（m3-kickoff §0）。そうでない回は null
      ok:
        rec.hiddenSeen || (rec.rafMin ?? 0) < MIN_RAF || wallMs < SLOPE_MS * 0.9
          ? null
          : slope > 0.9 && slope < 1.1,
    }
    log(nowMs(), `10 秒の傾き ${rec.slope.slope}（${n} 点、${wallMs} ms）`)
  }

  const nowMs = (): number => performance.now()

  focusTarget.focus({ preventScroll: true })
  requestAnimationFrame(frame)
}

main()
