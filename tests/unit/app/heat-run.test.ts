import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  newRun,
  runClearHeat,
  runFrame,
  runInput,
  runOutcome,
  runPhase,
  runPress,
  type PracticeOptions,
  type Run,
  type RunOptions,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import { HEAT_LEGEND, heatSummaryText } from '../../../src/app/practice-view.ts'
import { resultsByIndex, neighborOf, rulesOf } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { KEY_ROWS, keyPosition } from '../../../src/layout/presets.ts'
import { buildFrame } from '../../../src/render/canvas/commands.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import {
  EMPTY_HEAT,
  heatAdd,
  heatMerge,
  heatStats,
  heatSummary,
  type HeatStat,
} from '../../../src/results/heat.ts'
import type { Chart, KeyCode } from '../../../src/shared/types.ts'
import { FRAME_MS, START_NOW } from '../../../tools/harness/autoplay.ts'
import { setup } from '../render/canvas/frame-setup.ts'

// M4 の手順 2: 回の間にヒートマップを貯める（play-runner）・S4 の要約の文・描画への挟み方。出どころ:
// docs/planning/m4-kickoff.md 手順 2 の期待値 (1)(2)・§7-8、m4 updateHeatInfo L495–496、decisions #118・#120・#121。
// きらきら星（96 BPM、ableton/2/octave）を、時計・状態機械・判定を通して回す（tests/unit/app/practice-runner.test.ts と同じ形）。

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

function startRun(practice?: Partial<PracticeOptions>): Run {
  const grid = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
  const opts: RunOptions = {
    rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode), labels: { kb: 'both', note: 'both' } }),
    sound: { melody: true, accomp: true, click: false },
    keyclick: false,
    ...(practice === undefined ? {} : { practice: { mode: 'fixed', rate: 1, autoLoop: false, autoTempo: false, ...practice } }),
  }
  return runInput(newRun(SONG, opts), START_NOW, { kind: 'start' }).run
} // prettier-ignore

/** 右隣の鍵（同じ段の次の列） */
const rightOf = (code: KeyCode): KeyCode | null => {
  const p = keyPosition(code)
  return p === null ? null : (KEY_ROWS[p.row]?.[p.col + 1] ?? null)
}

/**
 * 回を終わりまで回す。着地に達した未判定の音ごとに keyOf(音の鍵) を 1 回押す（null なら押さない）。押した音は覚え、
 * 同じ音を 2 度押さない
 */
function playThrough(r0: Run, keyOf: (code: KeyCode) => KeyCode | null): Run {
  let r = r0
  let now = START_NOW
  const done = new Set<number>()
  for (let f = 0; f < 20_000; f++) {
    if (runPhase(r) === 'ended') return r
    now += FRAME_MS
    const byIndex = resultsByIndex(r.judge)
    if (runPhase(r) === 'playing')
      for (const n of r.notes) {
        if (n.tLandMs > r.t || done.has(n.index) || (byIndex.get(n.index)?.state ?? 'pending') !== 'pending') continue
        done.add(n.index)
        const k = keyOf(n.code)
        if (k !== null) r = runPress(r, { code: k, tsPerf: now, lag: null }, now).run
      }
    r = runFrame(r, now, now).run
  }
  throw new Error('終わらない')
} // prettier-ignore

describe('回の間に貯める（期待値 (1)(2)）', () => {
  it('何も押さない回 → 要約「まだデータがありません。」（miss は数えない）', () => {
    const r = playThrough(startRun(), () => null)
    expect(r.heat.size).toBe(0)
    expect(heatSummaryText(heatSummary(heatStats(r.heat)))).toBe('まだデータがありません。')
  })

  it('全部当てた回 → 誤打 0・扇なし。ずれは鍵ごとに貯まる', () => {
    const r = playThrough(startRun(), (c) => c)
    const s = heatSummary(heatStats(r.heat))
    expect(s.wrong).toBe(0)
    expect(s.timing).toBe(r.notes.length)
    for (const st of heatStats(r.heat).values()) expect(st.dirs).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('きらきら星を右隣の鍵で弾いた入門者の回 → 狙いの鍵すべてに R の扇だけ（NEAR。ずれの標本は 0）', () => {
    const r = playThrough(startRun(), rightOf)
    const st = heatStats(r.heat)
    expect([...st.keys()].sort()).toEqual([...new Set(r.notes.map((n) => n.code))].sort())
    for (const [code, s] of st) {
      const count = r.notes.filter((n) => n.code === code).length
      expect([code, s.dirs, s.other, s.n]).toEqual([code, [count, 0, 0, 0, 0, 0], 0, 0])
    }
  })

  it('終わった回の PlayResult.heat は回の物（S3 から S4 へ持ち越す値）', () => {
    const r = playThrough(startRun(), rightOf)
    expect(runOutcome(r).heat).toBe(r.heat)
  })

  it('runClearHeat は貯めた分だけを消す（判定は変えない）', () => {
    const r = playThrough(startRun(), rightOf)
    const c = runClearHeat(r)
    expect([c.heat.size, c.judge]).toEqual([0, r.judge])
    expect(runClearHeat(c)).toBe(c)
  })
})

describe('待ちの回（§7-7、decisions #120 (a)）', () => {
  it('音待ちで止まった KeyH に右隣の KeyJ → KeyH に R の扇。その後 KeyH で当てても、ずれの標本は増えない', () => {
    let r = startRun({ mode: 'note' })
    let now = START_NOW
    const pressed = new Set<number>()
    for (let f = 0; f < 5000 && !(runPhase(r) === 'waiting' && r.practice?.wait.group?.landMs === 2500); f++) {
      now += FRAME_MS
      const byIndex = resultsByIndex(r.judge)
      if (runPhase(r) === 'playing' || runPhase(r) === 'waiting')
        for (const n of r.notes)
          if (n.tLandMs < 2500 && n.tLandMs <= r.t && !pressed.has(n.index) && (byIndex.get(n.index)?.state ?? 'pending') === 'pending') {
            pressed.add(n.index)
            r = runPress(r, { code: n.code, tsPerf: now, lag: null }, now).run
          }
      r = runFrame(r, now, now).run
    }
    expect(runPhase(r)).toBe('waiting')
    const before = heatStats(r.heat).get('KeyH')
    r = runPress(r, { code: 'KeyJ', tsPerf: now, lag: null }, now).run
    expect(heatStats(r.heat).get('KeyH')?.dirs).toEqual([1 + (before?.dirs[0] ?? 0), 0, 0, 0, 0, 0])
    const n0 = heatSummary(heatStats(r.heat)).timing
    r = runPress(r, { code: 'KeyH', tsPerf: now + 5, lag: null }, now + 5).run
    expect(heatSummary(heatStats(r.heat)).timing).toBe(n0)
  }) // prettier-ignore
})

describe('S4 の合わせ方と要約の文', () => {
  const h1 = heatAdd(EMPTY_HEAT, {
    kind: 'hit',
    index: 0,
    grade: 'near',
    dtMs: 0,
    code: 'KeyF',
    noteCode: 'KeyD',
    self: 'near',
  })
  const h2 = heatAdd(EMPTY_HEAT, {
    kind: 'hit',
    index: 1,
    grade: 'perfect',
    dtMs: 20,
    code: 'KeyD',
    noteCode: 'KeyD',
    self: 'solo',
  })
  it('heatMerge: 鍵ごとに足す。片方が空なら他方そのもの', () => {
    expect(heatStats(heatMerge(h1, h2)).get('KeyD')).toEqual({ dirs: [1, 0, 0, 0, 0, 0], other: 0, n: 1, meanMs: 20, sdMs: null })
    expect(heatMerge(h1, EMPTY_HEAT)).toBe(h1)
    expect(heatMerge(EMPTY_HEAT, h2)).toBe(h2)
  }) // prettier-ignore

  it('要約: 「n キーに記録。誤打 a 回（うち隣でない物 c 回）、タイミング b 回。」。隣でない物が 0 なら括弧を出さない', () => {
    expect(heatSummaryText({ keys: 3, wrong: 5, other: 2, timing: 9 })).toBe('3 キーに記録。誤打 5 回（うち隣でない物 2 回）、タイミング 9 回。')
    expect(heatSummaryText({ keys: 1, wrong: 1, other: 0, timing: 0 })).toBe('1 キーに記録。誤打 1 回、タイミング 0 回。')
    expect(HEAT_LEGEND.map((x) => x.cls)).toEqual(['miss', 'early', 'late', 'ring'])
  }) // prettier-ignore
})

describe('buildFrame への挟み方（decisions #120 (c)）', () => {
  const s = setup('twinkle', 'ableton/2/octave')
  const base = {
    sizing: s.sizing,
    grid: s.grid,
    mode: 'cell' as const,
    notes: [],
    t: { song: 0, real: 0 },
    pressed: new Set<KeyCode>(),
    effects: [],
    labels: { kb: 'key' as const, note: 'key' as const },
    hints: false,
    level: 0 as const,
  }
  it('heat が無ければ M3 までと同じコマンド。あればセルの後・キー文字の前', () => {
    const plain = buildFrame(base)
    const stat: HeatStat = { dirs: [2, 0, 0, 0, 0, 0], other: 0, n: 2, meanMs: 10, sdMs: 5 }
    const withHeat = buildFrame({ ...base, heat: new Map([['KeyD', stat]]) })
    expect(buildFrame({ ...base, heat: new Map() })).toEqual(plain)
    const tags = withHeat.map((c) => c.tag)
    const first = tags.indexOf('heatFan')
    expect(tags.filter((t) => t.startsWith('heat'))).toEqual(['heatFan', 'heatDot', 'heatRing'])
    expect(tags.lastIndexOf('cell', first)).toBe(first - 1)
    expect(tags[first + 3]).toBe('label')
    expect(withHeat.filter((c) => !c.tag.startsWith('heat'))).toEqual(plain)
  })
})
