import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { variantMetrics } from '../../../src/chart/metrics.ts'
import type { Chart, Variant } from '../../../src/shared/types.ts'
import { parseSmf } from '../../../tools/charts/smf.ts'

// src/chart/metrics.ts・tools/charts/smf.ts（M1-01、M1 の手順 6）。出どころ: m1-kickoff 手順 8 の期待値（フィクスチャ 6 曲・
// ableton/2/octave の密度、2026-10-31 に node で計算）・§7-9（4 軸の定義、仮）・手順 6 の期待値（SMF 形式 0 の 2 音）、
// m5 parseMidi L263–314、decisions #59、m0-kickoff §7-22（vel は整数のまま）、tests-inventory「M1 手順 6」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const fixture = (id: string): Chart =>
  JSON.parse(
    readFileSync(
      path.join(root, 'tests', 'fixtures', 'charts', 'm1', `${id}.hexnote.json`),
      'utf8',
    ),
  ) as Chart
const variant = (c: Chart, id: string): Variant => {
  const v = c.variants?.find((x) => x.id === id)
  if (v === undefined) throw new Error(id)
  return v
} // prettier-ignore

describe('難度 4 軸（§7-9、仮）', () => {
  it('密度: フィクスチャ 6 曲の ableton/2/octave（手順 8 の表）、おすすめの並びは密度の低い順', () => {
    const want = { canon: 1.2, twinkle: 1.4, ode: 1.7, duet: 2.29, chroma: 2.98, scale: 3.67 }
    const got = Object.fromEntries(
      Object.keys(want).map((id) => {
        const c = fixture(id)
        const d = variantMetrics(c, variant(c, 'ableton/2/octave')).density ?? NaN
        return [id, Math.round(d * 100) / 100]
      }),
    )
    expect(got).toEqual(want)
    const order = Object.entries(got).sort((a, b) => a[1] - b[1]).map(([id]) => id)
    expect(order).toEqual(['canon', 'twinkle', 'ode', 'duet', 'chroma', 'scale'])
    // canon: 34 音 ／ 28.421 s（null 17 を除く）
    const canon = fixture('canon')
    expect(variantMetrics(canon, variant(canon, 'ableton/2/octave')).density).toBe(Math.round((34 / (12 * 60 / 76 * 3)) * 1000) / 1000)
  }) // prettier-ignore

  it('和音の無い曲（scale）の同時押し率は 0、三和音の canon は 0 より大きい', () => {
    const s = fixture('scale')
    expect(variantMetrics(s, variant(s, 'ableton/2/octave')).chord).toBe(0)
    const c = fixture('canon')
    expect(variantMetrics(c, variant(c, 'ableton/3/octave')).chord).toBeGreaterThan(0)
  })

  it('作った譜面: 跳躍は最上声どうし、同時押し率と段またぎ率', () => {
    const chart = {
      notes: [
        { midi: 60, beat: 0, dur: 1 },
        { midi: 67, beat: 0, dur: 1 },
        { midi: 62, beat: 1, dur: 1 },
        { midi: 61, beat: 2, dur: 1 },
      ],
      pulse: { resolution: 240, tempo: [{ beat: 0, bpm: 60 }] },
    }
    // ableton: KeyA C4（段 2・列 0）・KeyG G4（段 2・列 4）・KeyS D4（段 2・列 1）・KeyW C♯4（段 1・列 1）
    const v: Variant = { id: 'ableton/2/octave', layout: 'ableton', limit: 2, fold: 'octave', keys: ['KeyA', 'KeyG', 'KeyS', 'KeyW'] }
    const m = variantMetrics(chart, v)
    expect(m.chord).toBe(Math.round((1 / 3) * 1000) / 1000)
    expect(m.density).toBe(round3(4 / 3))
    expect(m.rowCross).toBe(0.5)
    // tick 0 の最上声は G4（KeyG）。G4 → D4 は 3（C4 → D4 なら 1）、D4 → C♯4 は 1
    expect([m.leap, m.leapMax]).toEqual([2, 3])
    // 鍵の無い譜面版は 0
    expect(variantMetrics(chart, { ...v, keys: [null, null, null, null] })).toEqual({ density: 0, leap: 0, leapMax: 0, chord: 0, rowCross: 0 })
  }) // prettier-ignore
})

const round3 = (x: number): number => Math.round(x * 1000) / 1000

/** 可変長の数 */
function vlq(n: number): number[] {
  const out = [n & 0x7f]
  for (n >>= 7; n > 0; n >>= 7) out.unshift((n & 0x7f) | 0x80)
  return out
}

/** SMF を組む（形式・division・トラックごとのイベントの列〔差分 tick とバイト〕） */
function smf(format: number, division: number, tracks: (readonly [number, number[]])[][]): Uint8Array {
  const u32 = (x: number) => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]
  const u16 = (x: number) => [(x >>> 8) & 255, x & 255]
  const out = [...'MThd'].map((c) => c.charCodeAt(0)).concat(u32(6), u16(format), u16(tracks.length), u16(division))
  for (const ev of tracks) {
    const body = ev.flatMap(([dt, b]) => [...vlq(dt), ...b])
    out.push(...[...'MTrk'].map((c) => c.charCodeAt(0)), ...u32(body.length), ...body)
  }
  return new Uint8Array(out)
} // prettier-ignore

const TEMPO_120 = [0xff, 0x51, 3, 0x07, 0xa1, 0x20]
const END = [0xff, 0x2f, 0]

describe('SMF の読み取り（m5 parseMidi）', () => {
  it('形式 0 の 2 音（on 60 vel 100 @0、off @480、on 64 @480、off @960、tempo 500000、PPQ 480）', () => {
    const r = parseSmf(
      smf(0, 480, [[[0, TEMPO_120], [0, [0x90, 60, 100]], [480, [0x80, 60, 0]], [0, [0x90, 64, 100]], [480, [0x80, 64, 0]], [0, END]]]),
    )
    expect(r.format).toBe(0)
    expect(r.tempo).toEqual([{ beat: 0, bpm: 120 }])
    expect(r.tracks).toEqual([
      { name: 'トラック 1', ch: 0, notes: [{ midi: 60, beat: 0, dur: 1, vel: 100 }, { midi: 64, beat: 1, dur: 1, vel: 100 }] },
    ])
  }) // prettier-ignore

  it('ランニングステータス・note on vel 0 は off・閉じない音は 1 拍・チャンネルで分ける・名前・拍子・テンポの後勝ち', () => {
    const name = [0xff, 0x03, 4, ...[...'lead'].map((c) => c.charCodeAt(0))]
    const r = parseSmf(
      smf(1, 96, [
        [[0, [0xff, 0x51, 3, 0x0f, 0x42, 0x40]], [0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]], [0, [0xff, 0x58, 4, 3, 2, 24, 8]], [192, [0xff, 0x51, 3, 0x0f, 0x42, 0x40]], [0, END]],
        [[0, name], [0, [0x90, 60, 90]], [48, [62, 80]], [48, [60, 0]], [0, [62, 0]], [0, [0x91, 40, 70]], [0, [0xb0, 7, 100]], [0, [0xf0, 2, 1, 0xf7]], [0, END]],
      ]),
    )
    expect(r.tempo).toEqual([{ beat: 0, bpm: 120 }, { beat: 2, bpm: 60 }])
    expect(r.timeSig).toEqual([{ beat: 0, num: 3, den: 4 }])
    expect(r.tracks.map((t) => t.name)).toEqual(['lead / ch1', 'lead / ch2'])
    expect(r.tracks[0]?.notes).toEqual([{ midi: 60, beat: 0, dur: 1, vel: 90 }, { midi: 62, beat: 0.5, dur: 0.5, vel: 80 }])
    expect(r.tracks[1]?.notes).toEqual([{ midi: 40, beat: 1, dur: 1, vel: 70 }])
  }) // prettier-ignore

  it('同じ音番号でもチャンネルが違えば別の音として開閉する（ch1 の off が ch0 の音を閉じない）', () => {
    const r = parseSmf(smf(0, 96, [[[0, [0x90, 60, 100]], [0, [0x91, 60, 50]], [48, [0x81, 60, 0]], [48, [0x80, 60, 0]], [0, END]]]))
    expect(r.tracks.map((t) => [t.ch, t.notes])).toEqual([
      [0, [{ midi: 60, beat: 0, dur: 1, vel: 100 }]],
      [1, [{ midi: 60, beat: 0, dur: 0.5, vel: 50 }]],
    ])
  }) // prettier-ignore

  it('テンポが無ければ 120、最初のテンポが拍 0 より後なら拍 0 に写す。形式 2・SMPTE・MThd なし・音符なしは Error', () => {
    const notes: (readonly [number, number[]])[] = [[0, [0x90, 60, 64]], [96, [0x80, 60, 0]], [0, END]]
    expect(parseSmf(smf(0, 96, [notes])).tempo).toEqual([{ beat: 0, bpm: 120 }])
    const late = parseSmf(smf(0, 96, [[[96, [0xff, 0x51, 3, 0x0f, 0x42, 0x40]], ...notes]]))
    expect(late.tempo).toEqual([{ beat: 0, bpm: 60 }])
    expect(() => parseSmf(smf(2, 96, [notes]))).toThrow('形式 2')
    expect(() => parseSmf(smf(0, 0xe728, [notes]))).toThrow('SMPTE')
    expect(() => parseSmf(new Uint8Array(20))).toThrow('MThd')
    expect(() => parseSmf(smf(0, 96, [[[0, END]]]))).toThrow('音符のあるトラック')
  }) // prettier-ignore
})
