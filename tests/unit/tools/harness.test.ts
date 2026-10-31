import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { beginnerRules, rulesOf, type JudgeNote } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { mulberry32 } from '../../../src/shared/random.ts'
import type { Chart } from '../../../src/shared/types.ts'
import {
  FRAME_MS,
  LEAD_MS,
  RELEASE_GAP_MS,
  START_NOW,
  planActions,
  runAutoplay,
} from '../../../tools/harness/autoplay.ts'
import { diffTables, diffText } from '../../../tools/harness/diff.ts'
import { JITTER_SDS, JITTER_SEED, jitterZ } from '../../../tools/harness/jitter.ts'
import {
  HARNESS_FORMAT,
  HARNESS_LAYOUTS,
  HARNESS_PROFILES,
  HARNESS_SONGS,
  PRACTICE_CONDITIONS,
  WRONG_RATE,
  buildPracticeTable,
  buildTable,
  harnessRow,
  parseTable,
  pickVariant,
  rowKey,
  tableText,
  type HarnessRow,
  type HarnessSong,
} from '../../../tools/harness/table.ts'

// tools/harness/（回帰ハーネス、M0-10）。出どころ: design.md §5 M0-10（6 曲×2 プロファイル×2 配列の差分）・§5.1 M0-06 の
// 完了条件（人工ジッタで精度%が単調に下がる）、kickoff 手順 13（期待値: 同じ種で差分 0、SD 0→5→10 で精度が単調に下がる）、
// m3 `mulberry32` L244・`gauss` L245・`buildNotes` L358–360（元のコードを行番号で切り出して照合）、m4 `gauss` L316・
// `sampleAuto` L377（SD の表記 28 と実際 19.8）、decisions #56（仮）。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const RUN = path.join(root, 'tools', 'harness', 'run.ts')
const EXPECTED = path.join(root, 'tests', 'harness', 'expected', 'm0-10.json')
const TIMEOUT = 60_000

function mockLines(name: string): string[] {
  return readFileSync(path.join(root, 'docs', 'planning', 'mocks', name), 'utf8').split('\n')
}
const M3 = mockLines('m3-clock-judge.html')
const M4 = mockLines('m4-practice.html')

function lineOf(lines: readonly string[], n: number, head: string): string {
  const line = lines[n - 1] ?? ''
  if (!line.startsWith(head)) throw new Error(`モックの行がずれた: L${n} ${line.slice(0, 40)}`)
  return line
}

const SONGS = HARNESS_SONGS.map((song) => ({
  song,
  chart: JSON.parse(
    readFileSync(
      path.join(root, 'tests', 'fixtures', 'charts', 'm1', `${song}.hexnote.json`),
      'utf8',
    ),
  ) as Chart,
}))
const SONG = SONGS[0] ?? { song: '', chart: {} as Chart }

/** 表は 1 回だけ作る（試験の間で使い回す） */
const TABLE = buildTable(SONGS)

function run(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [RUN, ...args], { cwd: root, encoding: 'utf8', timeout: TIMEOUT })
  if (r.error) throw r.error
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
} // prettier-ignore

let seq = 0
function note(code: string, tLandMs: number, over: Partial<JudgeNote> = {}): JudgeNote {
  return { index: seq++, code, midi: 60, tLandMs, tEndMs: tLandMs + 250, hold: false, ...over }
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
const sampleSd = (xs: readonly number[]): number => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

describe('人工ジッタ jitter.ts（m3 buildNotes の z、m4 との SD の違い）', () => {
  it('jitterZ(n, 99) は m3 buildNotes L358–360 の z（rz ＝ mulberry32(99)）と同じ列', () => {
    const m3 = new Function(
      'KEYS',
      'LEAD',
      'SPB',
      'S',
      [
        lineOf(M3, 244, 'function mulberry32'),
        lineOf(M3, 245, 'function gauss'),
        lineOf(M3, 358, 'function buildNotes'),
        lineOf(M3, 359, '  while (beat < 64)'),
        lineOf(M3, 360, '  S.notes = out; }'),
        'buildNotes(); return S.notes',
      ].join('\n'),
    ) as (keys: unknown[], lead: number, spb: number, s: object) => { z: number }[]
    const keys = Array.from({ length: 10 }, (_, i) => ({ code: `K${i}` }))
    const notes = m3(keys, 0, 1, {})
    expect(notes.length).toBeGreaterThan(50)
    expect(jitterZ(notes.length, 99)).toEqual(notes.map((n) => n.z))
    expect(JITTER_SEED).toBe(99)
  })

  it('m4 の gauss（L316）は SD 0.7071 で、sampleAuto（L377）の「× 0.028」は実際 19.8 ms。m3 の gauss は SD 1', () => {
    const src = lineOf(M4, 316, 'const gauss = () =>')
    lineOf(M4, 377, 'function sampleAuto(n) { n.autoOff = gauss() * 0.028;')
    const rnd = mulberry32(1)
    const m4gauss = new Function('Math', `${src}\nreturn gauss`)({ random: rnd }) as () => number
    const N = 200_000
    const a = Array.from({ length: N }, () => m4gauss())
    expect(sampleSd(a)).toBeCloseTo(Math.sqrt(0.25) / 0.7071, 2)
    expect(sampleSd(a) * 28).toBeCloseTo(19.8, 0)
    const b = jitterZ(N, 3)
    expect(sampleSd(b)).toBeCloseTo(1, 2)
    expect(Math.abs(mean(b))).toBeLessThan(0.01)
  })

  it('種が同じなら同じ列、違えば違う列。数の誤りは RangeError', () => {
    expect(jitterZ(30, 7)).toEqual(jitterZ(30, 7))
    expect(jitterZ(30, 7)).not.toEqual(jitterZ(30, 8))
    expect(jitterZ(0)).toEqual([])
    expect(jitterZ(5)).toEqual(jitterZ(5, JITTER_SEED))
    for (const bad of [-1, 1.5, Number.NaN]) expect(() => jitterZ(bad)).toThrow(RangeError)
  })

  it('SD は kickoff の 0／5／10 を含み、手順 8 の下見と同じ 0／5／10／20／40／80（昇順）', () => {
    expect(JITTER_SDS).toEqual([0, 5, 10, 20, 40, 80])
  })
})

describe('押す・離す時刻 planActions', () => {
  const perf = (ms: number): number => 1000 + ms

  it('押す ＝ 着地の実時刻 ＋ 揺れ、離す ＝ 終わりの実時刻 ＋ 同じ揺れ。正しい鍵だけ、時刻の順', () => {
    const ns = [note('KeyA', 0, { tEndMs: 600, hold: true }), note('KeyS', 100)]
    const off = new Map([
      [ns[0]?.index, 7],
      [ns[1]?.index, -3],
    ])
    const acts = planActions(ns, perf, (i) => off.get(i) ?? 0)
    expect(acts).toEqual([
      { kind: 'press', code: 'KeyA', tsPerf: 1007, index: ns[0]?.index },
      { kind: 'press', code: 'KeyS', tsPerf: 1097, index: ns[1]?.index },
      { kind: 'release', code: 'KeyS', tsPerf: 1347, index: ns[1]?.index },
      { kind: 'release', code: 'KeyA', tsPerf: 1607, index: ns[0]?.index },
    ])
  })

  it('同じ鍵を次に押すのが終わりより先なら、その RELEASE_GAP_MS 前に離す（押したままの鍵を押さない）', () => {
    const a = note('KeyA', 0, { tEndMs: 500 })
    const b = note('KeyA', 500, { tEndMs: 1000 })
    const acts = planActions([a, b], perf, (i) => (i === a.index ? 20 : -10))
    expect(RELEASE_GAP_MS).toBe(1)
    expect(acts.map((x) => [x.kind, x.index, x.tsPerf])).toEqual([
      ['press', a.index, 1020],
      ['release', a.index, 1490 - RELEASE_GAP_MS],
      ['press', b.index, 1490],
      ['release', b.index, 1990],
    ])
  })

  it('次の押下が 1 ms 未満の後なら、押した時刻に離す（押す → 離す の順）', () => {
    const a = note('KeyA', 0)
    const b = note('KeyA', 0.5)
    const acts = planActions([b, a], perf, () => 0)
    expect(acts.map((x) => [x.kind, x.index, x.tsPerf])).toEqual([
      ['press', a.index, 1000],
      ['release', a.index, 1000],
      ['press', b.index, 1000.5],
      ['release', b.index, 1250.5],
    ])
  })

  it('揺れで押す順が入れ替わったら、時刻の順で次の押下を見る', () => {
    const a = note('KeyA', 0, { tEndMs: 400 })
    const b = note('KeyA', 100, { tEndMs: 400 })
    // b を a より先に押す
    const acts = planActions([a, b], perf, (i) => (i === a.index ? 150 : 0))
    expect(acts.map((x) => [x.kind, x.index, x.tsPerf])).toEqual([
      ['press', b.index, 1100],
      ['release', b.index, 1150 - RELEASE_GAP_MS],
      ['press', a.index, 1150],
      ['release', a.index, 1550],
    ])
  })
})

describe('自動で通す runAutoplay（動画なしの時計を now を手で進めて回す）', () => {
  it('揺れ 0: 全て PERFECT、dt 0。押す実時刻 ＝ START_NOW ＋ LEAD_MS ＋ 着地。終了の後に止まる', () => {
    const ns = [
      note('KeyA', 0),
      note('KeyS', 500, { tEndMs: 1200, hold: true }),
      note('KeyA', 1000),
    ]
    const r = runAutoplay(ns, beginnerRules(), () => 0)
    expect(START_NOW).toBe(1000)
    expect(LEAD_MS).toBe(2000)
    expect(FRAME_MS).toBe(1000 / 60)
    expect(r.actions.filter((a) => a.kind === 'press').map((a) => a.tsPerf)).toEqual([
      3000, 3500, 4000,
    ])
    expect(r.summary.counts).toEqual({ perfect: 3, great: 0, good: 0, near: 0, miss: 0 })
    expect(r.summary.meanMs).toBe(0)
    expect(r.summary.holds).toEqual({ ok: 1, early: 0, forced: 0 })
    // 終了 ＝ 最終ノートの終わり 1,250 ＋ 1,200 ＝ 2,450（曲の ms）を過ぎた最初のフレームで chartEnd
    const endPerf = START_NOW + LEAD_MS + 2450
    expect(r.frames).toBe(Math.floor((endPerf - START_NOW) / FRAME_MS) + 1)
  })

  it('揺れはそのまま dt になる（＋40 → GREAT・dt 40、−20 → PERFECT、＋300 → 遅れ側の窓の外で MISS）', () => {
    const ns = [note('KeyA', 0), note('KeyS', 300), note('KeyD', 600)]
    const off = [40, -20, 300]
    const r = runAutoplay(ns, beginnerRules(), (i) => off[ns.findIndex((n) => n.index === i)] ?? 0)
    expect(r.summary.counts).toEqual({ perfect: 1, great: 1, good: 0, near: 0, miss: 1 })
    expect(r.judge.results.map((x) => x.dtMs)).toEqual([40, -20, null])
  })

  it('同期の軸（動画の 0.25 秒が拍 0）があっても、押す時刻は譜面の軸で写すので dt 0（時計の写像を軸で換算する）', () => {
    const ns = [note('KeyA', 0), note('KeyS', 400)]
    const rules = beginnerRules({ axis: { offset: 0.25, rate: 1 } })
    const r = runAutoplay(ns, rules, () => 0)
    expect(r.summary.counts.perfect).toBe(2)
    expect(r.judge.results.map((x) => x.dtMs)).toEqual([0, 0])
    // 拍 0 の実時刻は 250 ms 遅れる（動画の t ＝ −2,000 から走り、動画の 250 ms が譜面の 0 ms）
    expect(r.actions.filter((a) => a.kind === 'press').map((a) => a.tsPerf)).toEqual([3250, 3650])
  })

  it('猶予（開始から 300 ms）の中に窓が終わる音は skipped、猶予中の押下は猶予の終わりに判定', () => {
    // −1,950 → 実時刻 1,050、遅れ側の窓の終わり 1,284 ≤ 猶予の終わり 1,300 で skipped。−1,900 → 1,334 で残り、
    // 1,100 の押下を猶予の終わりに判定して PERFECT
    const ns = [note('KeyA', -1950), note('KeyS', -1900), note('KeyD', 0)]
    const r = runAutoplay(ns, beginnerRules(), () => 0)
    expect(r.summary.skipped).toBe(1)
    expect(r.summary.counts).toEqual({ perfect: 2, great: 0, good: 0, near: 0, miss: 0 })
  })

  it('ホールドを早く離すと early（揺れで次の同じ鍵が早まったとき）', () => {
    // A の 2 音: 1 つ目は 1,000 ms のホールド、2 つ目を −400 ms 早く押す → 1 つ目は終点の 401 ms 前に離す（離し窓 270 の外）
    const a = note('KeyA', 0, { tEndMs: 1000, hold: true })
    const b = note('KeyA', 1000)
    const r = runAutoplay([a, b], beginnerRules(), (i) => (i === b.index ? -170 : 0))
    expect(r.summary.holds.ok).toBe(1)
    const r2 = runAutoplay([a, b], beginnerRules(), (i) => (i === b.index ? -280 : 0))
    // −280 は早い側の GOOD（180）の外なので b は MISS。a は 281 ms 前に離して early
    expect(r2.summary.holds).toEqual({ ok: 0, early: 1, forced: 0 })
    expect(r2.summary.counts.miss).toBe(1)
  })
})

describe('表 table.ts', () => {
  it('行 ＝ 6 曲 × 2 プロファイル × 2 配列 × 6 SD ＝ 144（kickoff の 72 行は SD 0／5／10 の部分）。順は曲・プロファイル・配列・SD', () => {
    expect(TABLE).toHaveLength(6 * 2 * 2 * 6)
    expect(TABLE.filter((r) => [0, 5, 10].includes(r.jitterSd))).toHaveLength(72)
    let i = 0
    HARNESS_SONGS.forEach((song, k) => {
      for (const profile of HARNESS_PROFILES)
        for (const layout of HARNESS_LAYOUTS)
          for (const sd of JITTER_SDS) {
            const r = TABLE[i++]
            expect([r?.song, r?.profile, r?.variantId, r?.jitterSd, r?.seed]).toEqual([
              song,
              profile,
              `${layout}/2/octave`,
              sd,
              JITTER_SEED + k,
            ])
          }
    })
  })

  it('chartId は譜面の id、notes は keys が null でない音の数', () => {
    for (const r of TABLE) {
      const s = SONGS.find((x) => x.song === r.song)
      const v = s?.chart.variants?.find((x) => x.id === r.variantId)
      expect(r.chartId).toBe(s?.chart.id)
      expect(r.notes).toBe(v?.keys.filter((k) => k !== null).length)
      const c = r.counts
      expect(c.perfect + c.great + c.good + c.near + c.miss + r.skipped).toBe(r.notes)
      expect(r.gamer === null).toBe(r.profile === 'beginner')
    }
  })

  it('同じ種なら差分 0（kickoff 手順 13 の期待値）。種を変えれば差分が出る', () => {
    expect(diffTables(TABLE, buildTable(SONGS))).toEqual([])
    const other = buildTable(SONGS.slice(0, 1), { seed: 7, sds: [20] })
    const same = buildTable(SONGS.slice(0, 1), { sds: [20] })
    expect(diffTables(same, other).length).toBeGreaterThan(0)
  })

  it('SD 0 → 5 → 10 → 20 → 40 → 80 で精度は上がらない（24 組とも）。SD 0 は全て 100%・SS・dt 0', () => {
    for (let g = 0; g < TABLE.length; g += JITTER_SDS.length) {
      const grp = TABLE.slice(g, g + JITTER_SDS.length)
      expect(grp[0]?.precision).toBe(1)
      expect(grp[0]?.rank).toBe('SS')
      expect([grp[0]?.meanMs, grp[0]?.ur]).toEqual([0, 0])
      for (let k = 1; k < grp.length; k++)
        expect(grp[k]?.precision).toBeLessThanOrEqual(grp[k - 1]?.precision ?? 0)
    }
  })

  it('24 組の精度の平均は 10 ms から真に下がる（§5.1 M0-06 の完了条件の本測。手順 8 の下見と同じ SD）', () => {
    const avg = JITTER_SDS.map((sd) =>
      mean(TABLE.filter((r) => r.jitterSd === sd).map((r) => r.precision)),
    )
    expect(avg[0]).toBe(1)
    expect(avg[1]).toBe(1)
    for (let k = 2; k < avg.length; k++) expect(avg[k]).toBeLessThan(avg[k - 1] ?? 0)
  })

  it('PERFECT だけの行の平均と UR は、揺れ（z × SD）から直に計算した値と合う（時計が揺れに何も足さない）', () => {
    for (const r of TABLE.filter((x) => x.counts.perfect === x.notes && x.jitterSd > 0)) {
      const s = SONGS.find((x) => x.song === r.song)
      if (s === undefined) throw new Error(r.song)
      const keys = pickVariant(s.chart, r.variantId.split('/')[0] as 'ableton').keys
      const z = jitterZ(s.chart.notes.length, r.seed)
      const dts = z.filter((_, i) => keys[i] !== null).map((x) => x * r.jitterSd)
      expect(r.meanMs).toBeCloseTo(mean(dts), 2)
      expect(r.ur).toBeCloseTo(sampleSd(dts) * 10, 2)
    }
  })

  it('入れた表（tests/harness/expected/m0-10.json）と差分 0', () => {
    expect(diffTables(parseTable(readFileSync(EXPECTED, 'utf8')), TABLE)).toEqual([])
  })

  it('精度 ＝ 重み（1／0.7／0.4／NEAR 0.4）の平均の小数 6 桁、rank は精度から', () => {
    for (const r of TABLE) {
      const c = r.counts
      const judged = c.perfect + c.great + c.good + c.near + c.miss
      const acc = (c.perfect + 0.7 * c.great + 0.4 * c.good + 0.4 * c.near) / judged
      expect(r.precision).toBe(Math.round(acc * 1e6) / 1e6)
      const rank =
        acc >= 0.98 ? 'SS' : acc >= 0.95 ? 'S' : acc >= 0.9 ? 'A' : acc >= 0.8 ? 'B' : 'C'
      expect(r.rank).toBe(rank)
    }
  })

  it('判定する音が無い・1 つの譜面版: 平均と UR は null（0 にしない）、精度 1', () => {
    const v = pickVariant(SONG.chart, 'ableton')
    const only = (keep: number): HarnessSong => ({
      song: 'x',
      chart: {
        ...SONG.chart,
        variants: [{ ...v, keys: v.keys.map((k, i) => (i < keep ? k : null)) }],
      },
    })
    const none = harnessRow(only(0), 'ableton', 'beginner', 5)
    expect([none.notes, none.precision, none.rank, none.meanMs, none.ur]).toEqual([
      0,
      1,
      'SS',
      null,
      null,
    ])
    const one = harnessRow(only(1), 'ableton', 'beginner', 0)
    expect([one.notes, one.meanMs, one.ur]).toEqual([1, 0, null])
  })

  it('譜面版が無ければ投げる。limit 2・octave を並びの順によらず選ぶ。1 行は harnessRow と同じ', () => {
    const bare = { ...SONG.chart, variants: [] }
    expect(() => pickVariant(bare, 'ableton')).toThrow(/ableton\/2\/octave が無い/)
    const reversed = { ...SONG.chart, variants: [...(SONG.chart.variants ?? [])].reverse() }
    expect(pickVariant(reversed, 'ableton').id).toBe('ableton/2/octave')
    expect(pickVariant(reversed, 'vmpk').id).toBe('vmpk/2/octave')
    expect(harnessRow(SONG, 'vmpk', 'gamer', 10, JITTER_SEED)).toEqual(
      TABLE.find((r) => r.song === SONG.song && r.variantId === 'vmpk/2/octave' && r.profile === 'gamer' && r.jitterSd === 10),
    ) // prettier-ignore
  })

  it('tableText は行を 1 行に 1 つ書き、parseTable で戻る。形が違えば投げる', () => {
    const rows = TABLE.slice(0, 3)
    const text = tableText(rows)
    expect(text.split('\n')).toHaveLength(rows.length + 3)
    expect(text.startsWith(`{"format":"${HARNESS_FORMAT}","rows":[\n`)).toBe(true)
    expect(text.endsWith('\n]}\n')).toBe(true)
    expect(parseTable(text)).toEqual(rows)
    expect(() => parseTable('{"format":"x","rows":[]}')).toThrow(HARNESS_FORMAT)
    expect(() => parseTable(`{"format":"${HARNESS_FORMAT}"}`)).toThrow(HARNESS_FORMAT)
    expect(() => parseTable('null')).toThrow(HARNESS_FORMAT)
  })

  it('音ゲー向けの点とゲージ: SD 0 は全て PERFECT でフルコンボ・クリア（点 ＝ Σ 1000 × (1 ＋ min(コンボ, 50)/100)）', () => {
    for (const r of TABLE.filter((x) => x.profile === 'gamer' && x.jitterSd === 0)) {
      let pts = 0
      for (let c = 1; c <= r.notes; c++) pts += 1000 * (1 + Math.min(c, 50) / 100)
      expect(r.gamer?.points).toBeCloseTo(pts, 6)
      expect(r.gamer?.gauge).toBe(Math.min(100, 50 + 1.5 * r.notes))
      expect(r.gamer?.fullCombo).toBe(true)
      expect(r.gamer?.cleared).toBe(true)
      expect(r.gamer?.failed).toBe(false)
    }
    // 入門者と音ゲー向けは同じ揺れで窓だけが違う（SD 80 で違う行がある）
    const diff = TABLE.filter(
      (r) =>
        r.profile === 'beginner' &&
        r.jitterSd === 80 &&
        TABLE.find((g) => g.profile === 'gamer' && rowKey(g) === rowKey({ ...r, profile: 'gamer' }))
          ?.precision !== r.precision,
    )
    expect(diff.length).toBeGreaterThan(0)
  })
})

describe('差分 diff.ts', () => {
  const base = TABLE[0] as HarnessRow
  const row = (over: Partial<HarnessRow>): HarnessRow => ({ ...base, ...over })

  it('入れ子の欄は点でつなぐ。無い行・増えた行も出す（期待の順、増えた行は最後）', () => {
    const e = [row({}), row({ jitterSd: 5 }), row({ jitterSd: 10 })]
    const a = [
      row({ counts: { ...base.counts, perfect: base.counts.perfect - 1, great: 1 } }),
      row({ jitterSd: 10, rank: 'S' }),
      row({ jitterSd: 20 }),
    ]
    expect(diffTables(e, a)).toEqual([
      { kind: 'changed', key: rowKey(e[0] as HarnessRow), column: 'counts.perfect', before: base.counts.perfect, after: base.counts.perfect - 1 },
      { kind: 'changed', key: rowKey(e[0] as HarnessRow), column: 'counts.great', before: 0, after: 1 },
      { kind: 'missing', key: rowKey(e[1] as HarnessRow) },
      { kind: 'changed', key: rowKey(e[2] as HarnessRow), column: 'rank', before: 'SS', after: 'S' },
      { kind: 'extra', key: rowKey(a[2] as HarnessRow) },
    ]) // prettier-ignore
  })

  it('=== で比べる: −0 と 0 は同じ（JSON に書けば同じ）、null と 0・文字と数・無い欄は差分', () => {
    expect(diffTables([row({ meanMs: 0 })], [row({ meanMs: -0 })])).toEqual([])
    expect(diffTables([row({ ur: null })], [row({ ur: 0 })])).toHaveLength(1)
    expect(diffTables([row({ ur: 1 })], [row({ ur: '1' as unknown as number })])).toHaveLength(1)
    const g = { points: 1, gauge: 2, fullCombo: true, cleared: true, failed: false }
    expect(diffTables([row({ gamer: null })], [row({ gamer: g })]).map((d) => d.kind === 'changed' && d.column)).toEqual(
      ['gamer', 'gamer.points', 'gamer.gauge', 'gamer.fullCombo', 'gamer.cleared', 'gamer.failed'],
    ) // prettier-ignore
    const extraCol = { ...base, extra: 1 } as HarnessRow
    expect(diffTables([base], [extraCol])).toEqual([
      { kind: 'changed', key: rowKey(base), column: 'extra', before: undefined, after: 1 },
    ])
  })

  it('差分表（Markdown）: 差分なしは 1 行、ありは件数と表', () => {
    expect(diffText([], 144)).toBe('# 回帰ハーネスの差分\n\n差分なし（144 行）。\n')
    const ds = diffTables(
      [row({}), row({ jitterSd: 5 })],
      [row({ rank: 'A', seed: 1 }), row({ jitterSd: 40 })],
    )
    const t = diffText(ds, 2)
    expect(t).toContain('差分 4 件（3 行。今の表は 2 行）。')
    expect(t).toContain(`| ${rowKey(base)} | rank | "SS" | "A" |`)
    expect(t).toContain(`| ${rowKey(base)} | seed | ${base.seed} | 1 |`)
    expect(t).toContain(`| ${rowKey(row({ jitterSd: 5 }))} | （行） | 有り | 無い |`)
    expect(t).toContain(`| ${rowKey(row({ jitterSd: 40 }))} | （行） | 無い | 有り |`)
    const undef = diffText(
      [{ kind: 'changed', key: 'k', column: 'c', before: undefined, after: 1 }],
      1,
    )
    expect(undef).toContain('| k | c | （無し） | 1 |')
  })
})

describe('run.ts（子プロセス）', () => {
  it(
    '書く: 期待の表を書き、--check は入れた表と差分 0（今の表と差分表を --out に書く）',
    () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'hexnote-harness-'))
      try {
        const exp = path.join(dir, 'expected.json')
        const expP = path.join(dir, 'expected-practice.json')
        const w = run('--expected', exp, '--expected-practice', expP)
        expect(w.status).toBe(0)
        expect(w.stdout).toContain('144 行')
        expect(w.stdout).toContain('48 行')
        expect(readFileSync(exp, 'utf8')).toBe(tableText(TABLE))
        expect(readFileSync(expP, 'utf8')).toBe(tableText(buildPracticeTable(SONGS)))
        const out = path.join(dir, 'out')
        const c = run('--check', '--out', out)
        expect(c.status).toBe(0)
        expect(c.stdout).toContain('✓ 回帰ハーネス（M0の表）: 差分なし（144 行）')
        expect(c.stdout).toContain('✓ 回帰ハーネス（練習の表）: 差分なし（48 行）')
        expect(readFileSync(path.join(out, 'table.json'), 'utf8')).toBe(tableText(TABLE))
        expect(readFileSync(path.join(out, 'table-m2-03.json'), 'utf8')).toBe(
          tableText(buildPracticeTable(SONGS)),
        )
        const md = readFileSync(path.join(out, 'diff.md'), 'utf8')
        expect(md).toContain(diffText([], 144))
        expect(md).toContain(diffText([], 48))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    TIMEOUT,
  )

  it(
    '--check: 期待の表と違えば exit 1 で差分表を出す。期待の表が無くても exit 1',
    () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'hexnote-harness-'))
      try {
        const exp = path.join(dir, 'expected.json')
        const t0 = TABLE[0] as HarnessRow
        writeFileSync(exp, tableText([{ ...t0, rank: 'A' }, ...TABLE.slice(1)]))
        const out = path.join(dir, 'out')
        const c = run('--check', '--expected', exp, '--out', out)
        expect(c.status).toBe(1)
        const md = readFileSync(path.join(out, 'diff.md'), 'utf8')
        expect(md).toContain(`| ${rowKey(t0)} | rank | "A" | "SS" |`)
        expect(c.stderr).toContain('✗ 回帰ハーネスに差分がある')
        const none = run('--check', '--expected', path.join(dir, 'none.json'), '--out', out)
        expect(none.status).toBe(1)
        expect(none.stderr).toContain('期待の表')
        expect(readFileSync(path.join(out, 'diff.md'), 'utf8')).toContain('差分 144 件')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    TIMEOUT,
  )

  it(
    '不明な引数は exit 2',
    () => {
      for (const args of [['--nope'], ['extra'], ['--out']]) {
        const r = run(...args)
        expect(r.status).toBe(2)
        expect(r.stderr).toContain('使い方')
      }
    },
    TIMEOUT,
  )
})

describe('練習の表 m2-03.json（M2 の手順 5、m2-kickoff §7-21・decisions #56 (d)）', () => {
  const PRACTICE = buildPracticeTable(SONGS)
  const expected = parseTable(
    readFileSync(path.join(root, 'tests', 'harness', 'expected', 'm2-03.json'), 'utf8'),
  )

  it('6 曲 × 2 プロファイル × 2 配列 × 2 条件（rate 0.75・SD 0、隣の鍵 12%）。期待の表と差分 0', () => {
    expect(PRACTICE).toHaveLength(HARNESS_SONGS.length * HARNESS_PROFILES.length * HARNESS_LAYOUTS.length * PRACTICE_CONDITIONS.length)
    expect(diffTables(expected, PRACTICE)).toEqual([])
  }) // prettier-ignore

  it('rate 0.75・SD 0 は全ての行で精度 100%・skipped 0（判定窓は実時間のまま、時計が 0.75 倍で進む）', () => {
    const rs = PRACTICE.filter((r) => r.rate === 0.75)
    expect(rs).toHaveLength(24)
    expect(rs.every((r) => r.precision === 1 && r.skipped === 0 && r.counts.perfect === r.notes)).toBe(true)
  }) // prettier-ignore

  it('隣の鍵 12% で入門者に NEAR、音ゲー向け（NEAR なし）に MISS が出る。正しい鍵だけの行より精度が下がる', () => {
    const rs = PRACTICE.filter((r) => r.wrongRate === WRONG_RATE)
    expect(rs.filter((r) => r.profile === 'beginner').some((r) => r.counts.near > 0)).toBe(true)
    expect(rs.filter((r) => r.profile === 'gamer').every((r) => r.counts.near === 0)).toBe(true)
    expect(rs.filter((r) => r.profile === 'gamer').some((r) => r.counts.miss > 0)).toBe(true)
    expect(rs.some((r) => r.precision < 1)).toBe(true)
  }) // prettier-ignore

  it('M0 の表の行は rate・wrongRate を持たず、行の鍵も変わらない（m0-10.json は作り直さない）', () => {
    expect(TABLE.some((r) => 'rate' in r || 'wrongRate' in r)).toBe(false)
    expect(rowKey({ song: 'a', variantId: 'v', profile: 'beginner', jitterSd: 0 })).toBe('a v beginner sd0')
    expect(rowKey({ song: 'a', variantId: 'v', profile: 'beginner', jitterSd: 0, rate: 0.75 })).toBe('a v beginner sd0 r0.75')
    expect(rowKey({ song: 'a', variantId: 'v', profile: 'beginner', jitterSd: 0, wrongRate: 0.12 })).toBe('a v beginner sd0 w0.12')
  }) // prettier-ignore
})
