import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSmf } from '../../../src/chart/smf.ts'
import { validateChart } from '../../../src/chart/validate.ts'
import {
  CLICK_COUNT,
  CLICK_RATE,
  clickChart,
  clickLengthS,
  clickSample,
  clickSamples,
  clickSmf,
  wavBytes,
} from '../../../tools/clicktrack/clicktrack.ts'

// tools/clicktrack/（M3 の手順 2、仮）。出どころ: m3-kickoff 手順 2 の期待値 (11)（WAV の数は式の算術、node で検算）・§7-7・§7-19、
// design §5.6 L297、src/audio/metronome.ts（波形の定数）。DEV のフィクスチャ tests/fixtures/charts/m3/click.hexnote.json は
// この道具の出力（ダミーの ID hexDmyPlain）と 1 バイトずつ同じ。

const root = fileURLToPath(new URL('../../../', import.meta.url))

describe('クリックトラック（期待値 (11)）', () => {
  it('全長 43.8 s、クリック k の頭 ＝ 144,000 ＋ 28,800k 標本、WAV 2,102,400 標本・4,204,844 バイト', () => {
    expect(clickLengthS()).toBeCloseTo(43.8, 9)
    for (const k of [0, 1, 7, 63]) expect(clickSample(k)).toBe(144_000 + 28_800 * k)
    const s = clickSamples()
    expect(s.length).toBe(2_102_400)
    const w = wavBytes(s)
    expect(w.length).toBe(4_204_844)
    const v = new DataView(w.buffer)
    expect(String.fromCharCode(...w.slice(0, 4), ...w.slice(8, 12))).toBe('RIFFWAVE')
    expect(v.getUint32(24, true)).toBe(CLICK_RATE)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint16(34, true)).toBe(16)
    expect(v.getUint32(40, true)).toBe(2_102_400 * 2)
  })

  it('波形: 打の頭から鳴り（0.14）、50 ms で止まる、打の間は無音。小節の頭（4 拍ごと）は 1,400 Hz', () => {
    const s = clickSamples()
    const at = (k: number, ms: number): number => s[clickSample(k) + Math.round((ms / 1000) * CLICK_RATE)] ?? NaN
    expect(Math.abs(at(0, 0))).toBeCloseTo(0.14, 6)
    expect(at(0, 50)).toBe(0)
    expect(at(0, 300)).toBe(0)
    expect(s[clickSample(0) - 1]).toBe(0)
    // 矩形波の半周期（1,400 Hz は 17.1 標本、1,000 Hz は 24 標本）で符号が変わる
    const firstFlip = (k: number): number => {
      const i0 = clickSample(k)
      for (let i = 1; i < 100; i++) if (Math.sign(s[i0 + i] ?? 0) !== Math.sign(s[i0] ?? 0)) return i
      return -1
    }
    expect(firstFlip(0)).toBe(Math.ceil(CLICK_RATE / 1400 / 2))
    expect(firstFlip(1)).toBe(CLICK_RATE / 1000 / 2)
  }) // prettier-ignore

  it('SMF: 分解能 480・テンポ 600,000 µs・64 音・最後の音の tick 30,240', () => {
    const bytes = clickSmf()
    const smf = parseSmf(bytes)
    expect(smf.format).toBe(0)
    expect(smf.tracks).toHaveLength(1)
    expect(smf.division).toBe(480)
    expect(smf.tempo[0]?.bpm).toBe(100)
    // テンポのメタ（FF 51 03 ＋ 3 バイトの µs）
    const i = bytes.findIndex((x, j) => x === 0xff && bytes[j + 1] === 0x51 && bytes[j + 2] === 3)
    expect(((bytes[i + 3] ?? 0) << 16) | ((bytes[i + 4] ?? 0) << 8) | (bytes[i + 5] ?? 0)).toBe(
      600_000,
    )
    const notes = smf.tracks[0]?.notes ?? []
    expect(notes).toHaveLength(CLICK_COUNT)
    expect((notes[notes.length - 1]?.beat ?? 0) * smf.division).toBe(30_240)
    expect(notes.slice(0, 5).map((n) => n.midi)).toEqual([60, 62, 64, 65, 60])
    expect(notes[0]?.dur).toBe(0.5)
  })

  it('譜面: 64 音・4 版、sync（youtube・offset 3・rate 1、measured 無し）を足しても id は同じ、検査を通る', async () => {
    const base = await clickChart()
    const c = await clickChart('hexDmyPlain')
    expect(c.notes).toHaveLength(64)
    expect(c.variants).toHaveLength(4)
    expect(c.id).toBe(base.id)
    expect(c.sync).toEqual({ sources: [{ kind: 'youtube', videoId: 'hexDmyPlain', offset: 3, rate: 1 }] })
    expect(validateChart(c).ok).toBe(true)
    const fixture = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm3', 'click.hexnote.json'), 'utf8')) as unknown
    expect(fixture).toEqual(JSON.parse(JSON.stringify(c)))
  }) // prettier-ignore
})
