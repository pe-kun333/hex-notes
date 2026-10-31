import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { accuracyText, hudOf, progressOf } from '../../../src/app/hud.ts'
import {
  LEAD_MS,
  finishedPlay,
  newRun,
  runControl,
  runFrame,
  runInput,
  runNotes,
  runOutcome,
  runPhase,
  runPress,
  runPump,
  runRelease,
  type Run,
  type RunEffect,
  type RunOptions,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import { LATE_DROP_MS, LOOKAHEAD_MS, PUMP_MS } from '../../../src/audio/scheduler.ts'
import { KEYCLICK_GAIN } from '../../../src/audio/keyclick.ts'
import { GRACE_MS } from '../../../src/clock/grace.ts'
import { perfAt } from '../../../src/clock/map.ts'
import { END_TAIL_MS, neighborOf, rulesOf, summarizeJudge } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import type { Chart, Variant } from '../../../src/shared/types.ts'
import { FRAME_MS, START_NOW, planActions, runAutoplay } from '../../../tools/harness/autoplay.ts'
import { jitterZ } from '../../../tools/harness/jitter.ts'

// src/app/play-runner.ts・hud.ts（M1-03、M1 の手順 3）。出どころ: play-dev.ts の流れ（回帰ハーネス tools/harness/autoplay.ts
// と同じ順: 押下・離しの前に sessionIdle、毎フレーム sessionTick → judgeClock → judgeSweep、t が終了を過ぎたら chartEnd）、
// design.md §4.2（終了 ＝ 最終ノート＋1.2 秒）・§1.3 S2（入門者の HUD）、decisions #39（猶予内に窓が終わる音は skipped）・
// #48（打鍵音は誤打だけ）、tests-inventory「M1 手順 3」、m1-kickoff §7-18・§7-19。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const chartOf = (song: string): Chart =>
  JSON.parse(
    readFileSync(
      path.join(root, 'tests', 'fixtures', 'charts', 'm1', `${song}.hexnote.json`),
      'utf8',
    ),
  ) as Chart
const variantOf = (c: Chart, id: string): Variant => {
  const v = c.variants?.find((x) => x.id === id)
  if (v === undefined) throw new Error(`譜面版 ${id} が無い`)
  return v
}

function songOf(name: string, vid = 'ableton/2/octave'): RunSong {
  const chart = chartOf(name)
  return { chartId: chart.id, name: chart.name, chart, variant: variantOf(chart, vid) }
}

function optsOf(song: RunSong, over: Partial<RunOptions> = {}): RunOptions {
  const grid = buildKeyboardGrid(song.variant.layout, 28, { left: 0, top: 0 })
  return {
    rules: rulesOf(PROFILES.beginner, {
      neighbor: neighborOf(grid.byCode),
      labels: { kb: 'both', note: 'both' },
    }),
    sound: { melody: true, accomp: true, click: false },
    keyclick: true,
    ...over,
  }
}

/** 開始した回（start を START_NOW に） */
function started(song: RunSong, over: Partial<RunOptions> = {}): Run {
  return runInput(newRun(song, optsOf(song, over)), START_NOW, { kind: 'start' }).run
}

/** 押す・離すをハーネスと同じ時刻・同じフレームで回し、終わるまで進める */
function autoplay(song: RunSong, sd: number): { run: Run; frames: number; endedAt: number } {
  let r = started(song)
  const z = jitterZ(song.chart.notes.length)
  const actions = planActions(
    r.notes,
    (ms) => perfAt(r.map, ms),
    (i) => (z[i] ?? 0) * sd,
  )
  let k = 0
  let f = 0
  while (runPhase(r) !== 'ended') {
    f++
    if (f > 100_000) throw new Error('終わらない')
    const now = START_NOW + f * FRAME_MS
    for (let a = actions[k]; a !== undefined && a.tsPerf <= now; a = actions[++k])
      r =
        a.kind === 'press'
          ? runPress(r, { code: a.code, tsPerf: a.tsPerf, lag: 0 }, a.tsPerf).run
          : runRelease(r, { code: a.code, tsPerf: a.tsPerf, forced: false }, a.tsPerf).run
    r = runFrame(r, now, now).run
  }
  return { run: r, frames: f, endedAt: START_NOW + f * FRAME_MS }
}

describe('回帰ハーネスと同じ流れ（M1 の S2 のループ ＝ M0-10 の自動プレイ）', () => {
  it('6 曲 × 2 配列 × SD 0・20 で判定のまとめがハーネスと一致し、フレームの数も同じ', () => {
    for (const name of ['twinkle', 'ode', 'scale', 'chroma', 'duet', 'canon'])
      for (const vid of ['ableton/2/octave', 'vmpk/2/octave'])
        for (const sd of [0, 20]) {
          const song = songOf(name, vid)
          const opts = optsOf(song)
          const z = jitterZ(song.chart.notes.length)
          const want = runAutoplay(newRun(song, opts).notes, opts.rules, (i) => (z[i] ?? 0) * sd)
          const got = autoplay(song, sd)
          expect(runOutcome(got.run).judge, `${name} ${vid} SD ${sd}`).toEqual(want.summary)
          expect(got.frames).toBe(want.frames)
        }
  })

  it('SD 0 は精度 100%、全ての音が判定済み（skipped 0）、演奏の押下を数える', () => {
    const song = songOf('twinkle')
    const { run } = autoplay(song, 0)
    const s = runOutcome(run).judge
    expect(s.acc).toBe(1)
    expect(s.skipped).toBe(0)
    expect(s.counts.perfect).toBe(run.notes.length)
    expect(run.collect.pressCount).toBe(run.notes.length)
    expect(runNotes(run).every((n) => n.state === 'done')).toBe(true)
  })
})

describe('終わった回と記録（finishedPlay、M1 の手順 5）', () => {
  it('SD 0 の canon: 記録は動画なし・固定・1.0 倍・全鍵・自前音源・skipped 0、和音は全部合い、苦手区間なし', () => {
    const { run } = autoplay(songOf('canon'), 0)
    const f = finishedPlay(run, { id: 'r1', at: '2026-10-31T00:00:00.000Z', profile: 'beginner' })
    const j = runOutcome(run).judge
    expect(f.record).toEqual({
      id: 'r1',
      chartId: run.song.chartId,
      variantId: 'ableton/2/octave',
      profile: 'beginner',
      clock: 'novideo',
      mode: 'fixed',
      rate: 1,
      keyset: 'all',
      at: '2026-10-31T00:00:00.000Z',
      acc: 1,
      rank: j.rank,
      counts: j.counts,
      selfRate: j.selfRate,
      syncUsed: { kind: 'audio' },
      offsetUsed: 0,
      skipped: 0,
    })
    expect(f.chords.total).toBeGreaterThan(0)
    expect(f.chords.hit).toBe(f.chords.total)
    expect(f.weak).toBe(null)
  })

  it('何も押さずに終えた scale: 全部 miss、苦手区間は最初の 2 小節（どの組も同じ数なので前）', () => {
    let r = started(songOf('scale'))
    for (let now = START_NOW; runPhase(r) !== 'ended'; now += FRAME_MS)
      r = runFrame(r, now, now).run
    const f = finishedPlay(r, { id: 'r2', at: '2026-10-31T00:00:00.000Z', profile: 'beginner' })
    expect(f.record.counts.miss).toBe(r.notes.length)
    // 8 分音符の音階（1 小節に 8 音）
    expect(f.weak).toEqual({ from: 1, to: 2, misses: 16 })
  })
})

describe('終了（最終ノートの終わり＋1.2 秒、§4.2）', () => {
  it('t が endMs を過ぎた最初のフレームで ended。その前のフレームは playing', () => {
    const song = songOf('scale')
    let r = started(song)
    expect(r.endMs - r.lastEndMs).toBe(END_TAIL_MS)
    expect(r.lastEndMs).toBe(Math.max(...r.notes.map((n) => n.tEndMs)))
    // 実時刻 ↔ 曲 ms は傾き 1（動画なし、1.0 倍）。猶予の後は再生中
    const endPerf = perfAt(r.map, r.endMs)
    r = runFrame(r, endPerf, endPerf).run
    expect(r.t).toBe(r.endMs)
    expect(runPhase(r)).toBe('playing')
    r = runFrame(r, endPerf + 1, endPerf + 1).run
    expect(runPhase(r)).toBe('ended')
  })
})

describe('一時停止 → 再開（tests-inventory M1 手順 3、decisions #39）', () => {
  it('窓が猶予の中で終わる音は skipped（miss でない）、猶予の後に着地する音は普通に判定', () => {
    const song = songOf('scale')
    let r = started(song)
    const n0 = r.notes[0]
    const n1 = r.notes[1]
    if (n0 === undefined || n1 === undefined) throw new Error('音が足りない')
    // 最初の音の着地の直後（10 ms 後）に一時停止 → 5 秒後に再開
    const pauseAt = perfAt(r.map, n0.tLandMs) + 10
    r = runFrame(r, pauseAt - 5, pauseAt - 5).run
    r = runInput(r, pauseAt, { kind: 'pause', reason: 'escape' }).run
    expect(runPhase(r)).toBe('paused')
    const resumeAt = pauseAt + 5000
    r = runInput(r, resumeAt, { kind: 'resume' }).run
    expect(runPhase(r)).toBe('syncing')
    // 猶予の間はフレームを回す。最初の音の窓（遅れ側）は猶予の中で終わる
    for (let now = resumeAt; now <= resumeAt + GRACE_MS + 20; now += FRAME_MS)
      r = runFrame(r, now, now).run
    expect(runPhase(r)).toBe('playing')
    const s0 = summarizeJudge(r.judge)
    expect(s0.skipped).toBe(1)
    expect(s0.counts.miss).toBe(0)
    // 猶予の後に着地する最初の音（早い側の窓 180 ms も猶予の後）はちょうどに押して perfect
    const after = r.notes.find((n) => perfAt(r.map, n.tLandMs) - 180 > resumeAt + GRACE_MS)
    if (after === undefined) throw new Error('猶予の後の音が無い')
    expect(after.index).toBeGreaterThan(n1.index)
    const at = perfAt(r.map, after.tLandMs)
    r = runPress(r, { code: after.code, tsPerf: at, lag: 0 }, at).run
    const s1 = summarizeJudge(r.judge)
    expect(s1.counts.perfect).toBe(1)
    expect(s1.skipped).toBe(1)
  })

  it('一時停止に入ると先の予約を止め、再開（再アンカー）でも止めて今の t から数え直す', () => {
    const song = songOf('scale')
    let r = started(song)
    const n2 = r.notes[2]
    if (n2 === undefined) throw new Error('音が足りない')
    const at = perfAt(r.map, n2.tLandMs)
    const p = runInput(r, at, { kind: 'pause', reason: 'blur' })
    expect(p.effects).toContainEqual({ kind: 'cancelSounds' })
    // 二度目の Pause 要求（blur の後の hidden）は止め直さない
    const p2 = runInput(p.run, at + 1, { kind: 'pause', reason: 'hidden' })
    expect(p2.effects).toEqual([])
    const q = runInput(p2.run, at + 3000, { kind: 'resume' })
    expect(q.effects).toContainEqual({ kind: 'cancelSounds' })
    r = q.run
    // 数え直した位置は再開の t（＝ 一時停止の t）以後の最初の音
    const next = r.sched.next
    expect(r.items[next]?.tMs).toBeGreaterThanOrEqual(r.t)
    expect(r.items[next - 1]?.tMs ?? -Infinity).toBeLessThan(r.t)
  })
})

describe('発音の予約（25 ms 周期・100 ms 先読み、§4.1）', () => {
  const BRIDGE = { ctxSec: 0, perfMs: 0, via: 'latency' as const }

  it('待機・一時停止の間は予約しない。再生中は先読みの中の音だけ', () => {
    const song = songOf('twinkle')
    const idle = newRun(song, optsOf(song))
    expect(runPump(idle, START_NOW, BRIDGE).play).toEqual([])
    let r = started(song)
    const first = perfAt(r.map, 0)
    const a = runPump(r, first - LOOKAHEAD_MS - 1, BRIDGE)
    expect(a.play).toEqual([])
    const b = runPump(a.run, first - LOOKAHEAD_MS + PUMP_MS, BRIDGE)
    expect(b.play.map((s) => s.item.part)).toEqual(['melody'])
    expect(b.play[0]?.ctxSec).toBeCloseTo(first / 1000, 9)
    r = runInput(b.run, first + 1, { kind: 'pause', reason: 'escape' }).run
    expect(runPump(r, first + 600, BRIDGE).play).toEqual([])
  })

  it('旋律はガイド音の設定、メトロノームは設定（伴奏は譜面に無ければ鳴らない）', () => {
    const song = songOf('twinkle')
    const parts = (o: Partial<RunOptions>): string[] => [
      ...new Set(newRun(song, optsOf(song, o)).items.map((i) => i.part)),
    ]
    expect(parts({})).toEqual(['melody'])
    expect(parts({ sound: { melody: false, accomp: true, click: false } })).toEqual([])
    expect(parts({ sound: { melody: true, accomp: true, click: true } }).sort()).toEqual([
      'click',
      'melody',
    ])
  })

  it('長く止まった後の予約は 100 ms を超えて遅れた音を鳴らさず、遅れの最大を runOutcome に残す', () => {
    const song = songOf('twinkle')
    const r = started(song)
    const late = perfAt(r.map, 0) + LATE_DROP_MS + 50
    const p = runPump(r, late, BRIDGE)
    expect(p.play.some((s) => s.item.tMs === 0)).toBe(false)
    expect(runOutcome(p.run).audioLateMaxMs).toBeGreaterThan(LATE_DROP_MS)
    const silent = newRun(
      song,
      optsOf(song, { sound: { melody: false, accomp: true, click: false } }),
    )
    expect(runOutcome(silent).audioLateMaxMs).toBe(null)
  })
})

describe('押下と演出・打鍵音', () => {
  const keyclicks = (fx: readonly RunEffect[]) => fx.filter((e) => e.kind === 'keyclick')

  it('窓の外の押下（誤打）は打鍵音を 1 つ。設定で OFF なら出さない。正しい押下は出さない（#48）', () => {
    const song = songOf('scale')
    const r = started(song)
    const n0 = r.notes[0]
    if (n0 === undefined) throw new Error('音が無い')
    const early = perfAt(r.map, n0.tLandMs) - 1000
    const stray = runPress(r, { code: n0.code, tsPerf: early, lag: null }, early)
    expect(keyclicks(stray.effects)).toEqual([
      { kind: 'keyclick', plan: { kind: 'note', midi: n0.midi, v: KEYCLICK_GAIN, holdS: 0.3 } },
    ])
    const off = runPress(
      started(song, { keyclick: false }),
      { code: n0.code, tsPerf: early, lag: null },
      early,
    )
    expect(keyclicks(off.effects)).toEqual([])
    const on = perfAt(r.map, n0.tLandMs)
    const hit = runPress(r, { code: n0.code, tsPerf: on, lag: 3 }, on)
    expect(keyclicks(hit.effects)).toEqual([])
    expect(hit.effects.map((e) => (e.kind === 'fx' ? e.fx.kind : e.kind))).toEqual([
      'edgeReturn',
      'judgeText',
    ])
  })

  it('待機・一時停止の押下は判定にも計測にも入れない', () => {
    const song = songOf('scale')
    const idle = runPress(newRun(song, optsOf(song)), { code: 'KeyA', tsPerf: 5, lag: 1 }, 5)
    expect(idle.run.collect.pressCount).toBe(0)
    expect(idle.effects).toEqual([])
    const paused = runInput(started(song), START_NOW + 400, { kind: 'pause', reason: 'escape' }).run
    const p = runPress(paused, { code: 'KeyA', tsPerf: START_NOW + 500, lag: 1 }, START_NOW + 500)
    expect(p.run.collect.pressCount).toBe(0)
    expect(p.effects).toEqual([])
  })

  it('同期中の押下は数え（lag の標本）、判定は猶予の終わりまで溜める', () => {
    const song = songOf('scale')
    const r = started(song)
    const p = runPress(r, { code: 'KeyA', tsPerf: START_NOW + 10, lag: 4 }, START_NOW + 10)
    expect(runPhase(p.run)).toBe('syncing')
    expect(p.run.collect.pressCount).toBe(1)
    expect(p.run.collect.lags).toEqual([4])
    expect(p.run.judge.deferred).toHaveLength(1)
  })

  it('待機の間のフレームは計測に数えない（開始からの rAF だけ）', () => {
    const song = songOf('scale')
    let r = newRun(song, optsOf(song))
    for (let f = 0; f < 10; f++) r = runFrame(r, f * FRAME_MS, f * FRAME_MS).run
    expect(r.collect.lastFrameMs).toBe(null)
    expect(runPhase(r)).toBe('idle')
    expect(r.t).toBe(-LEAD_MS)
  })
})

describe('Pause の選択と Space（runControl）', () => {
  const OFF = { imeStop: false }
  it('やめる → S1（回は動かさない）、最初から → 新しい回を同期中から（判定は空、先の予約を止める）', () => {
    const song = songOf('scale')
    const { run } = autoplay(song, 0)
    expect(runControl(run, 0, { kind: 'choice', choice: 'quit' }, OFF)).toEqual({
      step: null,
      go: 'S1',
      fresh: false,
    })
    const re = runControl(run, 9000, { kind: 'choice', choice: 'restart' }, OFF)
    expect(re.go).toBe(null)
    expect(re.fresh).toBe(true)
    expect(re.step?.effects[0]).toEqual({ kind: 'cancelSounds' })
    const r = re.step?.run
    expect(r && runPhase(r)).toBe('syncing')
    expect(r && r.t).toBe(-LEAD_MS)
    expect(r && summarizeJudge(r.judge).counts.perfect).toBe(0)
    expect(r && r.collect.pressCount).toBe(0)
    expect(r && r.sched.next).toBe(0)
  })

  it('待機の Space で開始（同期中）、再生中の Space は何もしない', () => {
    const song = songOf('scale')
    const space = {
      kind: 'key' as const,
      event: { kind: 'role' as const, role: 'primary' as const, code: 'Space', tsPerf: 0 },
    }
    const s = runControl(newRun(song, optsOf(song)), START_NOW, space, OFF)
    expect(s.step && runPhase(s.step.run)).toBe('syncing')
    expect(s.fresh).toBe(true)
    const playing = runFrame(
      s.step?.run ?? newRun(song, optsOf(song)),
      START_NOW + GRACE_MS + 1,
      0,
    ).run
    expect(runPhase(playing)).toBe('playing')
    expect(runControl(playing, START_NOW + 400, space, OFF)).toEqual({
      step: null,
      go: null,
      fresh: false,
    })
    // 一時停止 → 再開は同じ回（fresh でない）
    const esc = {
      kind: 'key' as const,
      event: { kind: 'role' as const, role: 'pause' as const, code: 'Escape', tsPerf: 0 },
    }
    const paused = runControl(playing, START_NOW + 500, esc, OFF)
    expect(paused.fresh).toBe(false)
    const resumed = runControl(paused.step?.run ?? playing, START_NOW + 900, space, OFF)
    expect(resumed.step && runPhase(resumed.step.run)).toBe('syncing')
    expect(resumed.fresh).toBe(false)
  })
})

describe('HUD（入門者 ＝ 曲名・進行・精度%、§1.3 S2）', () => {
  const none = { acc: 1, counts: { perfect: 0, great: 0, good: 0, near: 0, miss: 0 } }
  it('進行 ＝ t ／ 最終ノートの終わり。曲の前は 0、終わりの後は 1（§7-19）', () => {
    expect(progressOf(-LEAD_MS, 10_000)).toBe(0)
    expect(progressOf(0, 10_000)).toBe(0)
    expect(progressOf(4_600, 10_000)).toBe(0.46)
    expect(progressOf(11_000, 10_000)).toBe(1)
    expect(progressOf(5, 0)).toBe(1)
    expect(progressOf(0, 0)).toBe(0)
    expect(hudOf('音階', 4_699, 10_000, none).progressText).toBe('46%')
  })

  it('精度は小数 1 桁の %、判定した音が無い間は「—」（skipped だけでも「—」、§7-18）', () => {
    expect(accuracyText(none)).toBe('—')
    expect(accuracyText({ acc: 0.9425, counts: { ...none.counts, perfect: 3, good: 1 } })).toBe(
      '94.3%',
    )
    expect(accuracyText({ acc: 0, counts: { ...none.counts, miss: 1 } })).toBe('0.0%')
    expect(hudOf('きらきら星', 0, 1, { acc: 1, counts: { ...none.counts, near: 1 } })).toEqual({
      title: 'きらきら星',
      progress: 0,
      progressText: '0%',
      accuracy: '100.0%',
    })
  })
})
