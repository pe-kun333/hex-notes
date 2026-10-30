import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  computeChartId,
  round4,
  sha256Hex,
  verifyChartId,
  type ChartIdInput,
} from '../../../src/chart/hash.ts'
import type { Chart } from '../../../src/shared/types.ts'

// design.md §3.3: id = "sha256:" + SHA-256(canonical JSON of {format, notes[midi,beat,dur], pulse.resolution, pulse.tempo})

/** 見本（notes は beat 昇順。dur 0.33333 は丸めの検査用） */
function sample(): ChartIdInput {
  return {
    format: 'hexnote-chart/1',
    notes: [
      { midi: 60, beat: 0, dur: 1 },
      { midi: 64, beat: 1, dur: 0.5 },
      { midi: 67, beat: 1.5, dur: 0.33333 },
    ],
    pulse: {
      resolution: 240,
      tempo: [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
      ],
    },
  }
}

const SAMPLE_CANONICAL =
  '{"format":"hexnote-chart/1","notes":[{"midi":60,"beat":0,"dur":1},{"midi":64,"beat":1,"dur":0.5},{"midi":67,"beat":1.5,"dur":0.3333}],"pulse":{"resolution":240,"tempo":[{"beat":0,"bpm":120},{"beat":4,"bpm":60}]}}'
/** SAMPLE_CANONICAL の SHA-256（node:crypto で別計算した固定値。回帰用） */
const SAMPLE_ID = 'sha256:3ba25045307d6fe1ccfeb0ed3daae573168e2215529aabae62c1887c35c72860'

const HEX64 = /^[0-9a-f]{64}$/

describe('round4（design.md §3.3 小数 4 桁）', () => {
  it('四捨五入して 4 桁にする。整数と 0.5 はそのまま', () => {
    expect(round4(0.33333)).toBe(0.3333)
    expect(round4(1.00004)).toBe(1)
    expect(round4(1.00005)).toBe(1.0001)
    // JS の 2 進丸め（10 進の四捨五入なら 0.0002）。他言語で id を再計算するときも同じ式を使う
    expect(round4(0.00015)).toBe(0.0001)
    expect(round4(1)).toBe(1)
    expect(round4(0.5)).toBe(0.5)
    expect(round4(120)).toBe(120)
  })

  it('負の値も 4 桁。0 に丸まったら -0 でなく 0', () => {
    expect(round4(-1.23456)).toBe(-1.2346)
    expect(round4(-0.5)).toBe(-0.5)
    expect(Object.is(round4(-0.00004), 0)).toBe(true)
    expect(Object.is(round4(-0), 0)).toBe(true)
  })
})

describe('canonicalJson', () => {
  it('キー順 format → notes(midi,beat,dur) → pulse(resolution,tempo(beat,bpm))、空白なし', () => {
    expect(canonicalJson(sample())).toBe(SAMPLE_CANONICAL)
  })

  it('数値は 4 桁に丸めて書き、指数表記にしない', () => {
    const s = canonicalJson({
      format: 'hexnote-chart/1',
      notes: [{ midi: 60, beat: 0.00005, dur: 0.33333 }],
      pulse: { resolution: 240, tempo: [{ beat: 0, bpm: 119.99996 }] },
    })
    expect(s).toBe(
      '{"format":"hexnote-chart/1","notes":[{"midi":60,"beat":0.0001,"dur":0.3333}],"pulse":{"resolution":240,"tempo":[{"beat":0,"bpm":120}]}}',
    )
    expect(s).not.toMatch(/e[+-]?\d/i)
  })

  it('vel・track・accompaniment・sync・variants・source・name・bpm・beats・timeSig は含めない', () => {
    const base = sample()
    const full: Chart = {
      format: 'hexnote-chart/1',
      id: 'sha256:placeholder',
      name: '見本',
      notes: base.notes.map((n, i) => ({ ...n, vel: 100, track: i === 0 ? 'lead' : undefined })),
      pulse: {
        ...base.pulse,
        timeSig: [{ beat: 0, num: 3, den: 4 }],
      },
      sync: { sources: [{ kind: 'youtube', videoId: 'x', offset: 1.5, rate: 1 }] },
      source: { kind: 'bundled', rights: 'pd', title: 't' },
      bpm: 120,
      beats: 8,
      accompaniment: [{ midi: 48, beat: 0, dur: 4, track: 'bass' }],
      variants: [{ id: 'ableton/2/octave', layout: 'ableton', limit: 2, fold: 'octave', keys: [] }],
      metrics: { density: 1 },
      created: '2026-10-30',
      generator: 'test',
      ext: { hand: ['R'] },
    }
    expect(canonicalJson(full)).toBe(SAMPLE_CANONICAL)
  })

  it('入力オブジェクトのプロパティ順に依らない', () => {
    const shuffled: ChartIdInput = {
      pulse: {
        tempo: [
          { bpm: 60, beat: 4 },
          { bpm: 120, beat: 0 },
        ].reverse(),
        resolution: 240,
      },
      notes: [
        { dur: 1, beat: 0, midi: 60 },
        { dur: 0.5, beat: 1, midi: 64 },
        { dur: 0.33333, beat: 1.5, midi: 67 },
      ],
      format: 'hexnote-chart/1',
    }
    expect(canonicalJson(shuffled)).toBe(SAMPLE_CANONICAL)
  })

  it('有限でない数は RangeError（null を書いて無意味な id にしない）', () => {
    const bad = sample()
    bad.notes[1]!.beat = Number.NaN
    expect(() => canonicalJson(bad)).toThrow(RangeError)
    const inf = sample()
    inf.pulse.tempo[0]!.bpm = Number.POSITIVE_INFINITY
    expect(() => canonicalJson(inf)).toThrow(/pulse\.tempo\[0\]\.bpm/)
  })
})

describe('sha256Hex（globalThis.crypto.subtle、UTF-8）', () => {
  it('"abc" の既知値', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('空文字と UTF-8（日本語）の既知値。小文字 64 桁', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    const ja = await sha256Hex('日本語')
    expect(ja).toBe('77710aedc74ecfa33685e33a6c7df5cc83004da1bdcef7fb280f5c2b2e97e0a5')
    expect(ja).toMatch(HEX64)
  })
})

describe('computeChartId', () => {
  it('"sha256:" + 小文字 64 桁。canonicalJson の sha256Hex と一致し、同じ入力で同じ', async () => {
    const id = await computeChartId(sample())
    expect(id.startsWith('sha256:')).toBe(true)
    expect(id.slice('sha256:'.length)).toMatch(HEX64)
    expect(id).toBe('sha256:' + (await sha256Hex(canonicalJson(sample()))))
    expect(await computeChartId(sample())).toBe(id)
  })

  it('見本の id は固定値（回帰）', async () => {
    expect(await computeChartId(sample())).toBe(SAMPLE_ID)
  })

  it('vel や accompaniment・name・sync を変えても id は変わらない', async () => {
    const a = sample()
    const b: ChartIdInput & Partial<Chart> = {
      ...sample(),
      name: '別名',
      accompaniment: [{ midi: 36, beat: 0, dur: 1 }],
      sync: { sources: [{ kind: 'audio', offset: 0, rate: 1 }] },
    }
    b.notes = b.notes.map((n) => ({ ...n, vel: 1, track: 'x' }))
    expect(await computeChartId(b)).toBe(await computeChartId(a))
  })

  it('notes の beat を変える・順を入れ替えると id が変わる', async () => {
    const base = await computeChartId(sample())
    const moved = sample()
    moved.notes[1]!.beat = 1.25
    expect(await computeChartId(moved)).not.toBe(base)
    const swapped = sample()
    swapped.notes.reverse()
    expect(await computeChartId(swapped)).not.toBe(base)
    const tiny = sample()
    tiny.notes[0]!.dur = 1.00004 // 丸めで 1 のまま → 同じ id
    expect(await computeChartId(tiny)).toBe(base)
  })

  it('tempo や resolution を変えると id が変わる', async () => {
    const base = await computeChartId(sample())
    const bpm = sample()
    bpm.pulse.tempo[0]!.bpm = 121
    expect(await computeChartId(bpm)).not.toBe(base)
    const added = sample()
    added.pulse.tempo.push({ beat: 8, bpm: 90 })
    expect(await computeChartId(added)).not.toBe(base)
    const res = sample()
    res.pulse.resolution = 480
    expect(await computeChartId(res)).not.toBe(base)
  })
})

describe('verifyChartId', () => {
  it('中身と合う id は true', async () => {
    const chart = { ...sample(), id: SAMPLE_ID }
    expect(await verifyChartId(chart)).toBe(true)
    const computed = { ...sample(), id: await computeChartId(sample()) }
    expect(await verifyChartId(computed)).toBe(true)
  })

  it('改変・大文字・接頭辞なし・中身の変更は false', async () => {
    const hex = SAMPLE_ID.slice('sha256:'.length)
    expect(await verifyChartId({ ...sample(), id: 'sha256:' + '0'.repeat(64) })).toBe(false)
    expect(await verifyChartId({ ...sample(), id: 'sha256:' + hex.toUpperCase() })).toBe(false)
    expect(await verifyChartId({ ...sample(), id: hex })).toBe(false)
    const changed = sample()
    changed.notes[0]!.midi = 61
    expect(await verifyChartId({ ...changed, id: SAMPLE_ID })).toBe(false)
  })
})
