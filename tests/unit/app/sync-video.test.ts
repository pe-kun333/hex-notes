import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withVideoId } from '../../../src/app/dev/dev-songs.ts'
import { DUMMY_VIDEOS, dummyScenarioOf, scenarioPort } from '../../../src/app/dev/dummy-port.ts'
import {
  newRun,
  runFrame,
  runInput,
  runOutcome,
  runPhase,
  runPortEvent,
  runPress,
  runRelease,
  type Run,
  type RunSong,
  type RunStep,
} from '../../../src/app/play-runner.ts'
import { PHASE_TEXT, phaseText } from '../../../src/app/screens/play.ts'
import { songOf } from '../../../src/app/songs.ts'
import {
  AUTOPLAY_WAIT_MS,
  NOT_VISIBLE_DETAIL,
  NOT_VISIBLE_TITLE,
  SYNC_TEXT,
  syncNotice,
  zenkakuLength,
} from '../../../src/app/sync-notice.ts'
import { createDummyVideo } from '../../../src/clock/dummy-video.ts'
import type { ClockEvent, VideoRequest, VideoState } from '../../../src/clock/types.ts'
import { neighborOf, rulesOf } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import type { PlayPhase } from '../../../src/play/state.ts'
import {
  SYNC_BAND_MS,
  syncCauseBlock,
  syncCauseStep,
  type SyncCause,
} from '../../../src/play/sync-cause.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import type { Chart, Profile } from '../../../src/shared/types.ts'
import { FRAME_MS, START_NOW, type AutoAction } from '../../../tools/harness/autoplay.ts'
import {
  VIDEO_DUMMY,
  VIDEO_SCENARIOS,
  pressPlanner,
  type VideoScenario,
} from '../../../tools/harness/autoplay-video.ts'
import {
  HARNESS_SONGS,
  VIDEO_TABLE_SCENARIOS,
  buildVideoTable,
  pickVariant,
  type HarnessSong,
} from '../../../tools/harness/table.ts'

// S7b の案内と動画ありの回（M3 の手順 6、M3-04、仮）。出どころ: m3-kickoff 手順 6 の期待値 (6)(7)(9) と「作る」の
// play-runner-video の照合（表の 24 行と同じ値を runFrame で）、§7-28・§7-29・§7-30、m6 bandsHtml L792・L801・S7b L939、
// design §1.3 S2 L79・S7 L89、decisions #35・#65。訳は src/play/sync-cause.ts、文と帯は src/app/sync-notice.ts。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const resync = (reason: Extract<ClockEvent, { kind: 'resync' }>['reason']): ClockEvent => ({
  kind: 'resync',
  reason,
  t: 0,
  graceUntil: 0,
  nominal: { a: 1, b: 0 },
})
const held = (state: VideoState): ClockEvent => ({ kind: 'held', state, late: false })
const PLAY: VideoRequest = { kind: 'playVideo' }
const step = (
  prev: SyncCause | null,
  now: number,
  events: readonly ClockEvent[] = [],
  video: readonly VideoRequest[] = [],
  phase: PlayPhase = 'syncing',
  source: 'video' | 'novideo' = 'video',
): SyncCause | null => syncCauseStep(prev, { phase, source, events, video, now })

describe('S7b の訳と案内の行（期待値 (6)、§7-28）', () => {
  it('開始・再開の resync は今の文・帯なし、resync(jump) は飛びの文・帯なし', () => {
    const g = step(null, 1000, [resync('start')])
    expect(g).toEqual({ kind: 'grace', since: 1000, bandFrom: null })
    expect(syncNotice(g, 1299)).toEqual({ text: PHASE_TEXT.syncing, band: false, autoplay: null })
    expect(step(null, 1000, [resync('resume')])?.kind).toBe('grace')
    const j = step(null, 4500, [resync('jump')])
    expect(syncNotice(j, 4799)).toEqual({ text: '同期中（動画の時刻が飛びました）', band: false, autoplay: null })
    // 事象も要求も無い歩は前の訳のまま
    expect(step(j, 4600)).toBe(j)
  }) // prettier-ignore

  it('held(buffering) から 1,999 ms は帯なし・2,000 ms で帯 sync。同じ訳の held は入った now を保つ', () => {
    const b = step(null, 5000, [held('buffering')])
    expect(b).toEqual({ kind: 'buffering', since: 5000, bandFrom: 5000 + SYNC_BAND_MS })
    expect(syncNotice(b, 6999)).toEqual({ text: '同期中（動画の読み込み待ち）', band: false, autoplay: null })
    expect(syncNotice(b, 7000).band).toBe(true)
    expect(step(b, 6000, [held('cued')])).toBe(b)
    expect(step(b, 6000, [held('unstarted')])).toBe(b)
  }) // prettier-ignore

  it('帯 sync が出た後: PLAYING の resync・Esc（一時停止）・held(paused)・held(ended) で下りる', () => {
    const b = step(null, 5000, [held('buffering')])
    expect(syncNotice(step(b, 7500, [resync('unheld')]), 7500).band).toBe(false)
    expect(step(b, 7500, [], [], 'paused')).toBeNull()
    // 状態機械は held(paused) で一時停止、held(ended) で終了（src/play/state.ts）。訳は相で消える
    expect(step(b, 7500, [held('paused')], [], 'paused')).toBeNull()
    expect(step(b, 7500, [held('ended')], [], 'ended')).toBeNull()
    expect(syncNotice(null, 7500)).toEqual({ text: null, band: false, autoplay: null })
  })

  it('adSuspected はその場で帯（広告の文）、resync(adEnd) で下りる。広告の後の buffering は帯を下ろさない', () => {
    const a = step(null, 6983.33, [{ kind: 'adSuspected', t: 6983.44 }])
    expect(syncNotice(a, 6983.33)).toEqual({ text: '同期中（動画が進みません。Esc で一時停止）', band: true, autoplay: null })
    expect(syncNotice(step(a, 12500, [resync('adEnd')]), 12500)).toEqual({ text: PHASE_TEXT.syncing, band: false, autoplay: null })
    const ab = step(a, 7500, [held('buffering')])
    expect(ab).toEqual({ kind: 'buffering', since: 7500, bandFrom: 6983.33 })
    expect(syncNotice(ab, 7500).band).toBe(true)
  }) // prettier-ignore

  it('5 つの文は全角換算で 17.5・16・14・21・12 字（24 字以内。半角は 0.5 字）、grace は PHASE_TEXT.syncing と同じ', () => {
    const ks = ['grace', 'jump', 'buffering', 'ad', 'resumeWait'] as const
    expect(ks.map((k) => zenkakuLength(SYNC_TEXT[k]))).toEqual([17.5, 16, 14, 21, 12])
    expect(SYNC_TEXT.grace).toBe(PHASE_TEXT.syncing)
    expect(SYNC_TEXT.resumeWait).toBe('同期中（動画の再生待ち）')
  }) // prettier-ignore

  it('訳を持つのは源 video の同期中だけ。phaseText は訳があればその文、無ければ PHASE_TEXT', () => {
    expect(step(null, 1000, [resync('start')], [], 'playing')).toBeNull()
    expect(step(null, 1000, [resync('start')], [], 'syncing', 'novideo')).toBeNull()
    expect(step(null, 1000, [], [PLAY], 'idle')).toBeNull()
    const j = step(null, 4500, [resync('jump')])
    expect(phaseText({ phase: 'syncing', source: 'video', ready: true, cause: j })).toBe(SYNC_TEXT.jump)
    expect(phaseText({ phase: 'syncing', source: 'video', ready: true, cause: null })).toBe(PHASE_TEXT.syncing)
    expect(phaseText({ phase: 'syncing', source: 'novideo', ready: true, cause: j })).toBe(PHASE_TEXT.syncing)
    expect(phaseText({ phase: 'syncing', source: 'video', ready: true })).toBe(PHASE_TEXT.syncing)
  }) // prettier-ignore
})

describe('自動再生ブロックの帯（期待値 (7)、AUTOPLAY_WAIT_MS 1,000、§7-28）', () => {
  const w = step(null, 10_000, [], [PLAY])

  it('再開の playVideo @10,000 → 10,999 は帯なし・11,000 で帯（今の文）。10,400 に PLAYING なら出ない', () => {
    expect(AUTOPLAY_WAIT_MS).toBe(1000)
    expect(w).toEqual({ kind: 'resumeWait', since: 10_000, bandFrom: null })
    expect(syncNotice(w, 10_999)).toEqual({ text: SYNC_TEXT.resumeWait, band: false, autoplay: null })
    expect(syncNotice(w, 11_000).autoplay).toBe('blocked')
    expect(syncNotice(step(w, 10_400, [resync('resume')]), 11_000).autoplay).toBeNull()
  }) // prettier-ignore

  it('10,300 に held(buffering) なら 11,000 は帯なし（N ms を数えない）、12,300 に帯 sync', () => {
    const b = step(w, 10_300, [held('buffering')])
    expect(syncNotice(b, 11_000)).toEqual({ text: SYNC_TEXT.buffering, band: false, autoplay: null })
    expect(syncNotice(b, 12_299).band).toBe(false)
    expect(syncNotice(b, 12_300)).toEqual({ text: SYNC_TEXT.buffering, band: true, autoplay: null })
  }) // prettier-ignore

  it('autoplayBlocked の事象 @10,200 はその場で帯（今の文）。notVisible @10,000 はその場で別の文、11,000 の後も同じ文', () => {
    expect(syncNotice(syncCauseBlock(w, 'autoplayBlocked'), 10_200).autoplay).toBe('blocked')
    const nv = syncCauseBlock(w, 'notVisible')
    expect(syncNotice(nv, 10_000).autoplay).toBe('notVisible')
    expect(syncNotice(nv, 12_000).autoplay).toBe('notVisible')
    // 控えるのは最初の 1 つ
    expect(syncCauseBlock(nv, 'autoplayBlocked')).toBe(nv)
    // PLAYING の resync か Esc で下りる
    expect(syncNotice(step(nv, 12_000, [resync('resume')]), 12_000).autoplay).toBeNull()
    expect(step(nv, 10_500, [], [], 'paused')).toBeNull()
    expect([NOT_VISIBLE_TITLE, NOT_VISIBLE_DETAIL]).toEqual(['プレイヤーが隠れています', '半分以上が見える位置に戻し、プレイヤーの ▶ を押してください。'])
  }) // prettier-ignore

  it('再生中（訳なし）・猶予の訳の 2 つの事象、待機、源 novideo の再開では出ない', () => {
    expect(syncCauseBlock(null, 'autoplayBlocked')).toBeNull()
    const g = step(null, 1000, [resync('start')])
    expect(syncCauseBlock(g, 'notVisible')).toBe(g)
    expect(step(null, 10_000, [], [PLAY], 'idle')).toBeNull()
    expect(step(null, 10_000, [], [], 'syncing', 'novideo')).toBeNull()
  })
})

// ---------- 回（play-runner）で ----------

const CLICK = JSON.parse(
  readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm3', 'click.hexnote.json'), 'utf8'),
) as Chart
const SPEC = { layout: 'ableton', limit: 2, fold: 'octave' } as const
const rel = (now: number): number => Math.round((now - START_NOW) * 100) / 100

function clickRun(videoId: string): Run {
  const song = songOf(withVideoId(CLICK, videoId), SPEC)
  if (typeof song === 'string') throw new Error(song)
  const grid = buildKeyboardGrid(song.variant.layout, 1, { left: 0, top: 0 })
  return newRun(song, {
    rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode) }),
    sound: { melody: false, accomp: false, click: false },
    keyclick: false,
    video: { videoId },
  })
}

describe('回の訳と DEV の筋書き「playVideo 無効」（期待値 (7)、src/app/dev/dummy-port.ts）', () => {
  it('表に 1 行（ID は 11 文字）。一時停止 → Space の再開の playVideo は効かず、1 秒後に自動再生ブロックの帯、利用者の ▶ で下りる', () => {
    const sc = dummyScenarioOf('hexDmyNoPly')
    expect(sc?.blockPlay).toBe(true)
    expect(DUMMY_VIDEOS.filter((d) => d.blockPlay === true).map((d) => d.id)).toEqual(['hexDmyNoPly'])
    const sp = scenarioPort(sc as NonNullable<typeof sc>)
    let r = clickRun('hexDmyNoPly')
    const take = (s: RunStep, now: number): void => {
      r = s.run
      for (const e of s.effects) if (e.kind === 'video') sp.port.apply(now, [e.request])
    }
    sp.play(START_NOW)
    let f = 0
    const frame = (): number => {
      f++
      const now = START_NOW + f * FRAME_MS
      take(runFrame(r, now, FRAME_MS, sp.port.sample(now)), now)
      return now
    }
    while (rel(START_NOW + (f + 1) * FRAME_MS) <= 5000) frame()
    expect(runPhase(r)).toBe('playing')
    take(runInput(r, START_NOW + 5000, { kind: 'pause', reason: 'escape' }), START_NOW + 5000)
    while (rel(START_NOW + (f + 1) * FRAME_MS) <= 6000) frame()
    expect(sp.video.state).toBe('paused')
    take(runInput(r, START_NOW + 6000, { kind: 'resume' }), START_NOW + 6000)
    expect(r.syncCause).toEqual({ kind: 'resumeWait', since: START_NOW + 6000, bandFrom: null })
    // pass が playVideo を落としたのでダミーは止まったまま
    let last = 0
    while (rel(START_NOW + (f + 1) * FRAME_MS) < 7000) last = frame()
    expect(sp.video.state).toBe('paused')
    expect(runPhase(r)).toBe('syncing')
    expect(syncNotice(r.syncCause, last).autoplay).toBeNull()
    const at7 = frame()
    expect(rel(at7)).toBeGreaterThanOrEqual(7000)
    expect(syncNotice(r.syncCause, at7)).toEqual({ text: SYNC_TEXT.resumeWait, band: false, autoplay: 'blocked' })
    // 利用者の ▶（ダミーの釦は口を通らない）→ PLAYING → resync(resume) → 猶予 → 再生
    sp.play(at7)
    frame()
    expect(r.syncCause?.kind).toBe('grace')
    expect(syncNotice(r.syncCause, at7 + FRAME_MS).autoplay).toBeNull()
    for (let i = 0; i < 30; i++) frame()
    expect(runPhase(r)).toBe('playing')
    expect(r.syncCause).toBeNull()
  }) // prettier-ignore

  it('notVisible（口が apply の中で同期に知らせる）を再開の待ちの回へ渡すと別の文、再生中の回は変えない', () => {
    let r = clickRun('hexDmyPlain')
    const sp = scenarioPort(dummyScenarioOf('hexDmyPlain') as NonNullable<ReturnType<typeof dummyScenarioOf>>)
    sp.play(START_NOW)
    for (let f = 1; f <= 120; f++) r = runFrame(r, START_NOW + f * FRAME_MS, FRAME_MS, sp.port.sample(START_NOW + f * FRAME_MS)).run
    expect(runPhase(r)).toBe('playing')
    expect(runPortEvent(r, 'notVisible')).toBe(r)
    r = runInput(r, START_NOW + 2100, { kind: 'pause', reason: 'escape' }).run
    const s = runInput(r, START_NOW + 2500, { kind: 'resume' })
    expect(s.effects.filter((e) => e.kind === 'video').map((e) => e.kind === 'video' && e.request.kind)).toEqual(['playVideo'])
    const nv = runPortEvent(s.run, 'notVisible')
    expect(syncNotice(nv.syncCause, START_NOW + 2500)).toEqual({ text: SYNC_TEXT.resumeWait, band: false, autoplay: 'notVisible' })
    expect(runPortEvent(nv, 'autoplayBlocked')).toBe(nv)
  }) // prettier-ignore
})

// ---------- 表の 24 行を runFrame で（§7-30。押下の予定は表と同じ pressPlanner） ----------

const SONGS: readonly HarnessSong[] = HARNESS_SONGS.map((song) => ({
  song,
  chart: JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', `${song}.hexnote.json`), 'utf8')) as Chart,
})) // prettier-ignore

interface RunnerDrive {
  readonly run: Run
  readonly frames: number
  readonly requests: number
  readonly novideoT: number | null
  /** フレームごとの帯 sync の変わり目（at は START_NOW からの ms） */
  readonly bandEdges: readonly { readonly at: number; readonly band: boolean }[]
}

function driveRunner(
  song: HarnessSong,
  profile: Profile,
  scenario: VideoScenario,
  atFrame = 120,
  drop: (q: VideoRequest) => boolean = () => false,
): RunnerDrive {
  const variant = pickVariant(song.chart, 'ableton')
  const rs: RunSong = {
    chartId: song.chart.id,
    name: song.chart.name,
    chart: song.chart,
    variant,
    sync: { sources: [{ kind: 'youtube', videoId: 'hexDmyPlain', offset: 2, rate: 1 }] },
  }
  const grid = buildKeyboardGrid('ableton', 1, { left: 0, top: 0 })
  let r = newRun(rs, {
    rules: rulesOf(PROFILES[profile], { neighbor: neighborOf(grid.byCode) }),
    sound: { melody: false, accomp: false, click: false },
    keyclick: false,
    video: { videoId: 'hexDmyPlain' },
  })
  const sc = VIDEO_SCENARIOS[scenario]
  const d = createDummyVideo({ ...VIDEO_DUMMY, ...sc.options })
  const planner = pressPlanner(r.notes, r.axis)
  let requests = 0
  let novideoT: number | null = null
  let band = false
  const bandEdges: { at: number; band: boolean }[] = []
  const take = (s: RunStep, now: number): void => {
    r = s.run
    for (const e of s.effects) {
      if (e.kind !== 'video' || drop(e.request)) continue
      requests++
      const q = e.request
      if (q.kind === 'pauseVideo') d.pauseVideo(now)
      else if (q.kind === 'playVideo') d.play(now)
      else d.seek(q.t, now)
    }
  }
  d.play(START_NOW)
  const actions: AutoAction[] = []
  let f = 0
  while (runPhase(r) !== 'ended') {
    f++
    if (f > 6000) throw new Error('終わらない')
    const now = START_NOW + f * FRAME_MS
    if (f === atFrame) sc.op(d, now)
    actions.sort((a, b) => a.tsPerf - b.tsPerf || a.index - b.index)
    while (actions.length > 0 && (actions[0] as AutoAction).tsPerf <= now) {
      const a = actions.shift() as AutoAction
      take(a.kind === 'press' ? runPress(r, { code: a.code, tsPerf: a.tsPerf, lag: 0 }, a.tsPerf) : runRelease(r, { code: a.code, tsPerf: a.tsPerf, forced: false }, a.tsPerf), a.tsPerf)
    }
    take(runFrame(r, now, FRAME_MS, d.sample(now)), now)
    if (novideoT === null && r.session.play.source === 'novideo') novideoT = rel(now)
    const b = syncNotice(r.syncCause, now).band
    if (b !== band) bandEdges.push({ at: rel(now), band: (band = b) })
    actions.push(...planner.plan(now, r.session.play.source, r.map, d))
  }
  return { run: r, frames: f, requests, novideoT, bandEdges }
} // prettier-ignore

describe('動画ありの表の 24 行を play-runner の runFrame で（§7-30、期待値 (8)）', () => {
  const TABLE = buildVideoTable(SONGS)

  it('判定の数・skipped・ホールド・平均・UR・ゲージ・源・要求の数・切替の時刻・フレームが表と同じ', () => {
    expect(TABLE).toHaveLength(24)
    let i = 0
    for (const song of SONGS)
      for (const profile of ['beginner', 'gamer'] as const)
        for (const sc of VIDEO_TABLE_SCENARIOS) {
          const row = TABLE[i++]
          const d = driveRunner(song, profile, sc)
          const s = runOutcome(d.run).judge
          expect({ song: row?.song, profile: row?.profile, sc: row?.video?.scenario }).toEqual({ song: song.song, profile, sc })
          expect({
            counts: s.counts,
            skipped: s.skipped,
            holds: s.holds,
            meanMs: s.meanMs === null ? null : Math.round(s.meanMs * 100) / 100,
            ur: s.ur === null ? null : Math.round(s.ur * 100) / 100,
            failed: s.gamer?.failed ?? null,
            source: d.run.session.play.source,
            requests: d.requests,
            novideoT: d.novideoT,
            frames: d.frames,
            resyncCounted: d.run.collect.resyncCount,
          }).toEqual({
            counts: row?.counts,
            skipped: row?.skipped,
            holds: row?.holds,
            meanMs: row?.meanMs,
            ur: row?.ur,
            failed: row?.gamer?.failed ?? null,
            source: row?.video?.source,
            requests: row?.video?.requests,
            novideoT: row?.video?.novideoT,
            frames: row?.video?.frames,
            resyncCounted: sc === 'jump' ? 1 : 0,
          })
          // 途中終了・動画の終わりは無い（記録の aborted 偽）
          expect(runOutcome(d.run).aborted).toBe(false)
        }
  }, 60_000) // prettier-ignore

  it('排他（期待値 (9)）: 凍結（フレーム 270）で 1 回目の pauseVideo だけ渡さない → 6,983.33 に帯 sync、9,000 に源 novideo で下りる', () => {
    let n = 0
    const d = driveRunner(SONGS[0] as HarnessSong, 'beginner', 'freeze', 270, (q) => q.kind === 'pauseVideo' && n++ === 0)
    expect(d.bandEdges).toEqual([{ at: 6983.33, band: true }, { at: 9000, band: false }])
    expect(d.novideoT).toBe(9000)
    expect(d.run.session.play.source).toBe('novideo')
  }) // prettier-ignore

  it('途中終了は runFrame だけ: 音ゲー向け・scale・時刻も止まる広告をフレーム 110 → ゲージ 0 で終わり、記録は aborted（期待値 (5)）', () => {
    const d = driveRunner(SONGS[2] as HarnessSong, 'gamer', 'adHold', 110)
    const o = runOutcome(d.run)
    expect(o.judge.gamer?.failed).toBe(true)
    expect(o.aborted).toBe(true)
    // 表の道具（途中終了を入れない）は最後まで 1,212 フレーム回す
    expect(d.frames).toBeLessThan(1212)
  }) // prettier-ignore
})
