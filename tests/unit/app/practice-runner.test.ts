import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  finishedPlay,
  newRun,
  recordRate,
  runFrame,
  runInput,
  runOutcome,
  runPhase,
  runPress,
  type PracticeOptions,
  type Run,
  type RunEffect,
  type RunOptions,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import { buildVariant } from '../../../src/chart/variants.ts'
import { perfAt } from '../../../src/clock/map.ts'
import { neighborOf, resultsByIndex, rulesOf, timingSamples } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import { isFinished } from '../../../src/results/record.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { FRAME_MS, START_NOW } from '../../../tools/harness/autoplay.ts'

// app/play-runner.ts の練習（M2-03 前半、M2 の手順 5）。きらきら星（96 BPM、1 拍 625 ms、timeSig 無し ＝ 4/4、ableton/2/octave。
// 拍 4・5 が KeyH、拍 6 が KeyG、拍 8 が KeyF）を、時計・状態機械・判定・練習層を通して回す。出どころ: m2-kickoff 手順 5 の
// 期待値・完了条件・§7-3・§7-10・§7-11、design.md §2.7・§4.2・§5.3 M2-03、decisions #39 (c)・#80・#81・#87、
// tests-inventory「M2 手順 5」。純関数の形は tests/unit/practice/practice.test.ts。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TWINKLE = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', 'twinkle.hexnote.json'), 'utf8')) as Chart // prettier-ignore
const SONG: RunSong = {
  chartId: TWINKLE.id,
  name: TWINKLE.name,
  chart: TWINKLE,
  variant: TWINKLE.variants?.find((v) => v.id === 'ableton/2/octave') as NonNullable<
    Chart['variants']
  >[number],
}
const BEAT = 625

/** 合成の曲（96 BPM）: 拍 0〜7 に KeyA（60）、拍 8 に KeyS（62）、拍 8.4 に KeyD（64）、伴奏は拍 3.75 に 1 音 */
const SMALL: Chart = {
  ...TWINKLE,
  notes: [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((beat) => ({ midi: 60, beat, dur: 0.5, vel: 80 })),
    { midi: 62, beat: 8, dur: 0.25, vel: 80 },
    { midi: 64, beat: 8.4, dur: 0.25, vel: 80 },
  ],
  accompaniment: [{ midi: 48, beat: 3.75, dur: 0.25, vel: 80 }],
}
const SMALL_SONG: RunSong = {
  chartId: 'small',
  name: 'small',
  chart: SMALL,
  variant: buildVariant(SMALL, { layout: 'ableton', limit: 2, fold: 'octave' }),
}

function practiceRun(p: Partial<PracticeOptions>, keyclick = true, song: RunSong = SONG): Run {
  const grid = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
  const opts: RunOptions = {
    rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode), labels: { kb: 'both', note: 'both' } }),
    sound: { melody: true, accomp: true, click: false },
    keyclick,
    practice: { mode: 'fixed', rate: 1, autoLoop: false, autoTempo: false, ...p },
  }
  return runInput(newRun(song, opts), START_NOW, { kind: 'start' }).run
} // prettier-ignore

interface Driven {
  run: Run
  now: number
  effects: RunEffect[]
}

/**
 * フレームを回す。毎フレーム、未判定で着地に達した音のうち press が真の音の鍵を押してから runFrame（再生中は窓の中で
 * 当てる、待ち中は組の鍵）。stop が真になったフレームで止める
 */
function drive(
  d: Driven,
  stop: (r: Run) => boolean,
  press: (landMs: number) => boolean = () => true,
  maxFrames = 20_000,
): Driven {
  let { run: r, now } = d
  const effects: RunEffect[] = []
  for (let f = 0; f < maxFrames; f++) {
    if (stop(r)) return { run: r, now, effects }
    now += FRAME_MS
    const byIndex = resultsByIndex(r.judge)
    const phase = runPhase(r)
    if (phase === 'playing' || phase === 'waiting')
      for (const n of r.notes)
        if (n.tLandMs <= r.t && press(n.tLandMs) && (byIndex.get(n.index)?.state ?? 'pending') === 'pending') {
          const s = runPress(r, { code: n.code, tsPerf: now, lag: null }, now)
          r = s.run
          effects.push(...s.effects)
        }
    const s = runFrame(r, now, now)
    r = s.run
    effects.push(...s.effects)
  }
  throw new Error(`${maxFrames} フレームで止まらない（t ${r.t}、${runPhase(r)}）`)
} // prettier-ignore

const start = (r: Run): Driven => ({ run: r, now: START_NOW, effects: [] })
const waitingAt = (land: number) => (r: Run) =>
  runPhase(r) === 'waiting' && r.practice?.wait.group?.landMs === land
const resultOf = (r: Run, index: number) => resultsByIndex(r.judge).get(index)
const skipped = (r: Run): number => r.judge.results.filter((x) => x.skipped).length

describe('音待ち（§7-3、完了条件「再開後に最初のセルが着地を越えない」）', () => {
  it('拍 4（t 2,500）で止まり 1 s 後も t は同じ。正しい鍵 → perfect・ずれの標本 0・t 2,200 から再開、猶予の終わりで t 2,500・skipped 0、次の音まで 625 ms', () => {
    const d = drive(start(practiceRun({ mode: 'note' })), waitingAt(2500), (land) => land < 2500)
    const tStop = d.run.t
    expect(tStop).toBeGreaterThanOrEqual(2500)
    // 1 s 回しても止まったまま
    let r = d.run
    let now = d.now
    for (let i = 0; i < 60; i++) {
      now += FRAME_MS
      r = runFrame(r, now, now).run
    }
    expect([runPhase(r), r.t]).toEqual(['waiting', tStop])
    const before = { perfect: r.judge.score.counts.perfect, samples: timingSamples(r.judge).length }
    const hit = runPress(r, { code: 'KeyH', tsPerf: now, lag: null }, now)
    r = hit.run
    expect(resultOf(r, 4)?.grade).toBe('perfect')
    expect(r.judge.score.counts.perfect).toBe(before.perfect + 1)
    expect(timingSamples(r.judge).length).toBe(before.samples)
    expect([runPhase(r), r.t]).toEqual(['syncing', 2200])
    const after = drive(
      { run: r, now, effects: [] },
      (x) => runPhase(x) === 'playing',
      () => false,
    )
    // 猶予の終わり（押した 300 ms 後）でちょうど t 2,500（最初のセルが着地を越えない）
    expect(perfAt(after.run.map, 2500)).toBeCloseTo(now + 300, 6)
    expect(after.run.t).toBeGreaterThanOrEqual(2500 - 1e-6)
    expect(after.run.t).toBeLessThan(2500 + FRAME_MS)
    expect(skipped(after.run)).toBe(0)
    // 次の音（拍 5、t 3,125）の着地まで 625 ms（実時間、rate 1）
    expect(perfAt(after.run.map, 5 * BEAT) - perfAt(after.run.map, 2500)).toBeCloseTo(625, 6)
  })

  it('rate 0.75 → t 2,275、1.25 → t 2,125 から再開し、どちらも猶予の終わりで t 2,500', () => {
    for (const [rate, t] of [[0.75, 2275], [1.25, 2125]] as const) {
      const d = drive(start(practiceRun({ mode: 'note', rate })), waitingAt(2500), (land) => land < 2500)
      const r = runPress(d.run, { code: 'KeyH', tsPerf: d.now, lag: null }, d.now).run
      expect(r.t).toBeCloseTo(t, 6)
      expect(perfAt(r.map, 2500) - d.now).toBeCloseTo(300, 6)
    }
  }) // prettier-ignore

  it('待ち中に Esc → 一時停止 → 再開 → 同じ音で待ちに戻る（時計は止めたまま、skipped 0）', () => {
    const d = drive(start(practiceRun({ mode: 'note' })), waitingAt(2500), (land) => land < 2500)
    const p = runInput(d.run, d.now + 100, { kind: 'pause', reason: 'escape' }).run
    expect(runPhase(p)).toBe('paused')
    const back = runInput(p, d.now + 2000, { kind: 'resume' }).run
    expect([runPhase(back), back.t, back.practice?.wait.group?.landMs, skipped(back)]).toEqual(['waiting', d.run.t, 2500, 0])
    expect(runFrame(back, d.now + 3000, d.now + 3000).run.t).toBe(d.run.t)
  }) // prettier-ignore

  it('待ち中に組の外の鍵 → tainted、counts 不変、打鍵音 1 回。その後の正解で perfect 1・selfRate.miss 1（solo 0）', () => {
    const d = drive(start(practiceRun({ mode: 'note' })), waitingAt(2500), (land) => land < 2500)
    const counts = { ...d.run.judge.score.counts }
    const self = { ...d.run.judge.selfRate }
    const wrong = runPress(d.run, { code: 'KeyZ', tsPerf: d.now, lag: null }, d.now)
    expect(wrong.run.judge.score.counts).toEqual(counts)
    expect(wrong.effects.filter((e) => e.kind === 'keyclick')).toHaveLength(1)
    expect(runPhase(wrong.run)).toBe('waiting')
    const ok = runPress(wrong.run, { code: 'KeyH', tsPerf: d.now + 50, lag: null }, d.now + 50).run
    expect(ok.judge.score.counts.perfect).toBe(counts.perfect + 1)
    expect([ok.judge.selfRate.miss - self.miss, ok.judge.selfRate.solo - self.solo]).toEqual([1, 0])
    // 空打ち発音 OFF なら鳴らさない（tainted は付く）
    const quiet = drive(start(practiceRun({ mode: 'note' }, false)), waitingAt(2500), (land) => land < 2500)
    expect(runPress(quiet.run, { code: 'KeyZ', tsPerf: quiet.now, lag: null }, quiet.now).effects.filter((e) => e.kind === 'keyclick')).toHaveLength(0)
  }) // prettier-ignore

  it('通しで弾くと最後まで止まり進み、記録は mode note・rate 1 で完走の対象外・校正の提案の母集団の外', () => {
    const d = drive(start(practiceRun({ mode: 'note' })), (r) => runPhase(r) === 'ended')
    const o = runOutcome(d.run)
    expect([o.mode, o.rate, o.calibEligible, o.judge.skipped, o.judge.counts.perfect]).toEqual(['note', 1, false, 0, 42])
    expect(o.practice).toEqual({ loops: 0, tempoFrom: 1, tempoTo: 1, waits: 42 })
    expect(timingSamples(d.run.judge)).toEqual([])
    const f = finishedPlay(d.run, { id: 'x', at: '2026-11-01T00:00:00.000Z', profile: 'beginner' })
    expect([f.record.mode, f.record.rate, isFinished(f.record), 'looped' in f.record]).toEqual(['note', 1, false, false])
  }) // prettier-ignore
})

describe('フレーズ待ち・固定テンポ', () => {
  it('フレーズ 0 では止まらず、フレーズ 1 の頭（小節 3、拍 8、t 5,000）で止まる。解除は 250 ms の空白の後 t 4,700 から', () => {
    let d = drive(start(practiceRun({ mode: 'phrase' })), (r) => runPhase(r) === 'waiting', (land) => land < 5000)
    expect(d.run.practice?.wait.group?.landMs).toBe(5000)
    expect(d.run.practice?.wait.waits).toBe(1)
    const r = runPress(d.run, { code: 'KeyF', tsPerf: d.now, lag: null }, d.now).run
    expect(runPhase(r)).toBe('waiting')
    d = { run: r, now: d.now, effects: [] }
    let t0 = d.now
    d = drive(d, (x) => runPhase(x) !== 'waiting', () => false)
    expect(d.now - t0).toBeGreaterThanOrEqual(250)
    expect(d.now - t0).toBeLessThan(250 + FRAME_MS + 1e-6)
    expect([runPhase(d.run), d.run.t]).toEqual(['syncing', 4700])
    t0 = 0
    void t0
  }) // prettier-ignore

  it('固定テンポは止まらない（最後まで待ちに入らない）', () => {
    let waited = false
    drive(start(practiceRun({ mode: 'fixed' })), (r) => {
      waited ||= runPhase(r) === 'waiting'
      return runPhase(r) === 'ended'
    })
    expect(waited).toBe(false)
  })
})

describe('ループ（§7-10、decisions #39 (c) の例外）', () => {
  it('区間 小節 5〜6 から始める: 小節 4 の頭（7,500）から。1 周目を全部判定した後の折り返しで 5〜6 の音が未判定に戻り、小節 4 は done のまま、t 7,500、周 1、戻した音は skipped でない', () => {
    const d0 = start(practiceRun({ loop: { startBar: 5, endBar: 6 } }))
    expect(d0.run.t).toBe(7500)
    const inRange = d0.run.notes.filter((n) => n.tLandMs >= 10000 && n.tLandMs < 15000)
    const bar4 = d0.run.notes.filter((n) => n.tLandMs >= 7500 && n.tLandMs < 10000)
    let lastT = 0
    const d = drive(d0, (r) => {
      if ((r.practice?.loop.loops ?? 0) === 0) lastT = r.t
      return (r.practice?.loop.loops ?? 0) === 1
    })
    expect(lastT).toBeLessThan(15000)
    expect(d.run.t).toBe(7500)
    expect(inRange.map((n) => resultOf(d.run, n.index)?.state)).toEqual(inRange.map(() => 'pending'))
    expect(inRange.some((n) => resultOf(d.run, n.index)?.skipped)).toBe(false)
    expect(bar4.map((n) => resultOf(d.run, n.index)?.state)).toEqual(bar4.map(() => 'done'))
    expect(runPhase(d.run)).toBe('syncing')
    // 2 周目は区間の音だけをもう一度判定し（小節 4 は done のまま）、点は周をまたいで積む。ノーミス 2 周で区間を外す
    const judged = (r: Run): number => r.judge.score.counts.perfect + r.judge.score.counts.great + r.judge.score.counts.good
    const j1 = judged(d.run)
    const d2 = drive(d, (r) => (r.practice?.loop.loops ?? 0) === 2)
    expect(judged(d2.run) - j1).toBe(inRange.length)
    expect([d2.run.practice?.loop.range, d2.run.t > 15000]).toEqual([null, true])
  }) // prettier-ignore

  it('自動ループ: 小節 5〜6 で同じ通過に miss 3 → 区間 5〜6 に入り、すぐ小節 4 の頭へ頭出し（5〜6 の音は未判定）', () => {
    const d = drive(start(practiceRun({ autoLoop: true })), (r) => r.practice?.loop.range !== null, (land) => land < 10000 || land >= 15000)
    expect(d.run.practice?.loop.range).toEqual({ startBar: 5, endBar: 6 })
    expect(d.run.t).toBe(7500)
    const inRange = d.run.notes.filter((n) => n.tLandMs >= 10000 && n.tLandMs < 15000)
    expect(inRange.every((n) => resultOf(d.run, n.index)?.state === 'pending')).toBe(true)
    expect(d.run.judge.score.counts.miss).toBe(3)
  }) // prettier-ignore

  it('終点が最後の小節（11〜12）: 折り返しは最終ノートの終わり、chartEnd で終わらずに折り返す。記録は looped で完走の対象外', () => {
    const d0 = start(practiceRun({ loop: { startBar: 11, endBar: 12 } }))
    const d = drive(d0, (r) => (r.practice?.loop.loops ?? 0) === 1 || runPhase(r) === 'ended')
    expect([runPhase(d.run), d.run.t]).toEqual(['syncing', 10 * 4 * BEAT - 4 * BEAT])
    const f = finishedPlay(d.run, { id: 'x', at: '2026-11-01T00:00:00.000Z', profile: 'beginner' })
    expect([f.record.looped, isFinished(f.record), f.calibEligible, f.practice?.loops]).toEqual([true, false, false, 1])
  }) // prettier-ignore
})

describe('テンポ段（§7-4・§7-11、decisions #81）', () => {
  it('自動昇降: 全部当てるとフレーズ 0 の評価で 1.0 → 1.1。切替の直後も最後まで skipped 0、記録は rate 1.25（最後に使った段）', () => {
    let first = 0
    const d = drive(start(practiceRun({ autoTempo: true })), (r) => {
      if (first === 0 && (r.practice?.rate ?? 1) !== 1) first = r.t
      return runPhase(r) === 'ended'
    })
    expect(d.run.practice?.rates.slice(0, 2)).toEqual([1, 1.1])
    expect(first).toBeGreaterThan(5000)
    expect(skipped(d.run)).toBe(0)
    const o = runOutcome(d.run)
    expect([o.rate, o.practice?.tempoFrom, o.practice?.tempoTo, o.calibEligible]).toEqual([1.25, 1, 1.25, false])
  }) // prettier-ignore

  it('setRate 0.75 の前後で同じ時刻の t が等しい（曲時間軸なので描画の y も同じ）、その後は 0.75 倍で進む', () => {
    const d = drive(start(practiceRun({})), (r) => r.t >= 6000 && runPhase(r) === 'playing')
    const now = d.now + 5
    const a = runFrame(d.run, now, now).run
    const b = runInput(a, now, { kind: 'setRate', rate: 0.75 }).run
    expect(b.t).toBeCloseTo(a.t, 9)
    expect(runFrame(b, now + 100, now + 100).run.t - b.t).toBeCloseTo(75, 6)
  }) // prettier-ignore

  it('rate 0.5 でも判定窓は実時間のまま（遅れ 90 ms は great、150 ms は good）', () => {
    const d = drive(start(practiceRun({ rate: 0.5 })), (r) => runPhase(r) === 'playing')
    const land = perfAt(d.run.map, 0)
    const great = runPress(d.run, { code: 'KeyA', tsPerf: land + 90, lag: null }, land + 90).run
    expect(resultOf(great, 0)?.grade).toBe('great')
    const good = runPress(d.run, { code: 'KeyA', tsPerf: land + 150, lag: null }, land + 150).run
    expect(resultOf(good, 0)?.grade).toBe('good')
  })

  it('記録の rate: 全て 1.0 なら 1、途中で替えたら最後に使った 1.0 以外の段（1.0 に戻っても練習記録）', () => {
    expect([recordRate([1]), recordRate([1, 1.1]), recordRate([1, 1.1, 1]), recordRate([0.75])]).toEqual([1, 1.1, 1.1, 0.75])
  }) // prettier-ignore
})

describe('解除の発音と段の切替の時機（「疑う」(b) で足した）', () => {
  it('待ちの解除は発音の予約を着地から数え直す（戻した区間の伴奏 拍 3.75 を鳴らし直さない）', () => {
    const d = drive(start(practiceRun({ mode: 'note' }, true, SMALL_SONG)), waitingAt(2500), (land) => land < 2500)
    const r = runPress(d.run, { code: 'KeyA', tsPerf: d.now, lag: null }, d.now).run
    expect(r.t).toBe(2200)
    expect(r.items[r.sched.next]?.tMs).toBe(2500)
    expect(r.items.some((x) => x.tMs > 2200 && x.tMs < 2500)).toBe(true)
  }) // prettier-ignore

  it('自動昇降の切替は、窓が猶予の中に終わる未判定の音が無くなるまで待つ（拍 8.4 を押さなくても skipped にせず miss）', () => {
    const d = drive(start(practiceRun({ autoTempo: true }, true, SMALL_SONG)), (r) => runPhase(r) === 'ended', (land) => land !== 5250)
    const late = d.run.notes.find((n) => n.tLandMs === 5250)
    expect(d.run.practice?.rates).toEqual([1, 1.1])
    expect([skipped(d.run), resultOf(d.run, late?.index ?? -1)?.grade]).toEqual([0, 'miss'])
  }) // prettier-ignore
})
