import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { computeChartId, verifyChartId } from '../../../src/chart/hash.ts'
import { buildMsTable } from '../../../src/chart/mstable.ts'
import { normalizeChart, validateChart } from '../../../src/chart/validate.ts'
import { midiOf } from '../../../src/layout/presets.ts'
import type { Chart, Note } from '../../../src/shared/types.ts'

// tests/fixtures/charts/minimal.hexnote.json（きらきら星の冒頭 7 音、bpm 100）が /1 の見本として
// 正規化 → 検査 → id の照合 → ms 表を通ること。出どころ: design.md §3.2・§3.3、m0-kickoff.md 手順 2。

const FIXTURE = fileURLToPath(
  new URL('../../fixtures/charts/minimal.hexnote.json', import.meta.url),
)
/** computeChartId で計算し node:crypto で別計算して照合した固定値（回帰用） */
const FIXTURE_ID = 'sha256:f33acca604a12c03fe51f9f1e0cf7879a15e193f7d4520f8aa62abb8f8c553a7'

function loadRaw(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>
}

/** normalize → validate を通した Chart。通らなければ問題を並べて落とす */
function loadChart(): Chart {
  const r = validateChart(normalizeChart(loadRaw()))
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.path} ${i.message}`).join('\n'))
  return r.chart
}

describe('見本譜面 minimal.hexnote.json（きらきら星の冒頭）', () => {
  it('normalize → validate を問題 0 件で通る', () => {
    const r = validateChart(normalizeChart(loadRaw()))
    expect(r.ok ? [] : r.issues).toEqual([])
  })

  it('正規化で midi・beat・dur と順序は変わらず、vel 80 が埋まるだけ', () => {
    const raw = loadRaw()
    const norm = normalizeChart(raw) as { notes: Note[] }
    expect(norm.notes.map(({ midi, beat, dur }) => ({ midi, beat, dur }))).toEqual(raw['notes'])
    expect(norm.notes.every((n) => n.vel === 80)).toBe(true)
  })

  it('id が中身と一致する（verifyChartId）。固定値と同じ', async () => {
    const chart = loadChart()
    expect(await verifyChartId(chart)).toBe(true)
    expect(chart.id).toBe(FIXTURE_ID)
    expect(await computeChartId(chart)).toBe(FIXTURE_ID)
  })

  it('7 音は C4 C4 G4 G4 A4 A4 G4、各 1 拍で最後は 2 拍', () => {
    const chart = loadChart()
    expect(chart.notes.map((n) => n.midi)).toEqual([60, 60, 67, 67, 69, 69, 67])
    expect(chart.notes.map((n) => n.beat)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(chart.notes.map((n) => n.dur)).toEqual([1, 1, 1, 1, 1, 1, 2])
  })

  it('ms 表で最後の音の終わりが 4800 ms（8 拍 × 600 ms、bpm 100）', () => {
    const chart = loadChart()
    const table = buildMsTable(chart.pulse)
    const last = chart.notes[chart.notes.length - 1]!
    expect(table.beatToMs(last.beat + last.dur)).toBe(4800)
    expect(table.msToBeat(4800)).toBe(8)
    expect(table.segments).toEqual([{ beat: 0, bpm: 100, ms: 0 }])
  })

  it('variants[0] は ableton/2/octave。keys は notes と同じ長さで配列表の MIDI と合う', () => {
    const chart = loadChart()
    const v = chart.variants?.[0]
    expect(v?.id).toBe('ableton/2/octave')
    expect(v?.keys).toHaveLength(chart.notes.length)
    v!.keys.forEach((k, i) => {
      expect(k, `keys[${i}]`).not.toBeNull()
      expect(midiOf('ableton', k!), `keys[${i}] ${k}`).toBe(chart.notes[i]!.midi)
    })
  })
})
