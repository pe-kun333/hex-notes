import { describe, expect, it } from 'vitest'
import {
  cautions,
  chartFromSmf,
  defaultAccomp,
  fingeringWarnings,
  foldPreview,
  IMPORT_GENERATOR,
  importSpecs,
  rectCorners,
  smfParts,
  trackDefaults,
} from '../../../src/chart/import.ts'
import { buildMsTable } from '../../../src/chart/mstable.ts'
import { decodeText, parseSmf, type Smf } from '../../../src/chart/smf.ts'
import { validateChart } from '../../../src/chart/validate.ts'
import { buildVariant, foldPitch } from '../../../src/chart/variants.ts'
import type { Chart, Variant } from '../../../src/shared/types.ts'
import { m1Chart, M1_SONG_KEYS } from '../../../tools/charts/mel-fixtures.ts'
import { M1_SONGS, M5_EXAMPLES } from '../../../tools/charts/mel-songs.ts'
import {
  format0TwoNotes,
  format1ThreeTracks,
  melToSmf,
  namedTrack,
  SJIS_MERO,
  UTF8_MERO,
} from '../../fixtures/smf/build.ts'

// src/chart/{smf,import}.ts（M2-01 前半、M2 の手順 1）。出どころ: m2-kickoff 手順 1 の期待値・§7-5（運指の警告）・§7-6（版）・
// §7-17（トラックの既定と名前）、m5 parseMidi L263–314・L376–378・buildVariant L324–357、design.md §1.3 S5・§2.4・§3.3、
// decisions #20・#21・#53 (c)、tests-inventory「M2 手順 1」。数は 2026-11-01 に node で検算した。

const variant = (c: Chart, id: string): Variant => {
  const v = c.variants?.find((x) => x.id === id)
  if (v === undefined) throw new Error(id)
  return v
}
const fromMel = (seq: Smf, name = 'x'): Promise<Chart> =>
  chartFromSmf({ smf: seq, play: 0, fold: 'octave', name })

describe('SMF の読み取り（製品へ移した parseSmf）', () => {
  it('形式 0 の 2 音（M1 手順 6 と同じ）', () => {
    const r = parseSmf(format0TwoNotes())
    expect(r.tempo).toEqual([{ beat: 0, bpm: 120 }])
    expect(r.tracks[0]?.notes).toEqual([{ midi: 60, beat: 0, dur: 1, vel: 100 }, { midi: 64, beat: 1, dur: 1, vel: 100 }])
  }) // prettier-ignore

  it('ch 10 はドラムの印、テンポ 2 点・拍子を読む', () => {
    const r = parseSmf(format1ThreeTracks())
    expect(r.tracks.map((t) => [t.name, t.ch, t.drum, t.notes.length])).toEqual([
      ['Melody', 0, false, 8],
      ['Chords', 1, false, 6],
      ['Drums', 9, true, 4],
    ])
    expect(r.tempo).toEqual([{ beat: 0, bpm: 100 }, { beat: 4, bpm: 120 }])
    expect(r.timeSig).toEqual([{ beat: 0, num: 4, den: 4 }])
  }) // prettier-ignore

  it('トラック名（§7-17）: Shift_JIS の「メロ」・UTF-8 の「メロ」・ASCII の Piano', () => {
    expect(SJIS_MERO).toEqual([0x83, 0x81, 0x83, 0x8d])
    expect(parseSmf(namedTrack(SJIS_MERO)).tracks[0]?.name).toBe('メロ')
    expect(parseSmf(namedTrack(UTF8_MERO)).tracks[0]?.name).toBe('メロ')
    expect(parseSmf(namedTrack([...'Piano'].map((c) => c.charCodeAt(0)))).tracks[0]?.name).toBe(
      'Piano',
    )
    // Shift_JIS の列は UTF-8 として不正なので utf-8（fatal）が投げて shift_jis に落ちる。UTF-8 の列は utf-8 で読む
    expect(decodeText(new Uint8Array(UTF8_MERO))).toBe('メロ')
    expect(decodeText(new Uint8Array([0x41, 0x00]))).toBe('A\0')
  })
})

describe('トラックの既定（§7-17、m5 L376–378）', () => {
  const t = (name: string, n: number, drum = false): Smf['tracks'][number] => ({
    name,
    ch: drum ? 9 : 0,
    drum,
    notes: Array.from({ length: n }, (_, i) => ({ midi: 60, beat: i, dur: 1, vel: 80 })),
  })

  it('Melody 312・Chords 188・Bass 96・Drums（ch 10）→ 弾く Melody、伴奏 Chords・Bass、ドラムは除く（m6 L467–476 の見本）', () => {
    const smf = {
      tracks: [t('Drums', 400, true), t('Chords', 188), t('Melody', 312), t('Bass', 96)],
    }
    expect(trackDefaults(smf)).toEqual({ play: 2, accomp: [1, 3] })
  })

  it('弾くトラックが 1 本だけ → 伴奏なし。同数なら先、全部ドラムなら 0', () => {
    expect(trackDefaults({ tracks: [t('a', 5)] })).toEqual({ play: 0, accomp: [] })
    expect(trackDefaults({ tracks: [t('a', 5), t('b', 5)] })).toEqual({ play: 0, accomp: [1] })
    expect(trackDefaults({ tracks: [t('d', 5, true)] })).toEqual({ play: 0, accomp: [] })
    expect(trackDefaults(parseSmf(format1ThreeTracks()))).toEqual({ play: 0, accomp: [1] })
  })

  it('弾くトラックを選び直すと、伴奏の既定は元の弾くトラックも含む（ドラムは除く）', () => {
    const smf = {
      tracks: [t('Drums', 400, true), t('Chords', 188), t('Melody', 312), t('Bass', 96)],
    }
    expect(defaultAccomp(smf, 3)).toEqual([1, 2])
    expect(defaultAccomp(smf, 0)).toEqual([1, 2, 3])
  })
})

describe('chartFromSmf（正規化 → 版 → 検査、§7-6）', () => {
  it('形式 1 の 3 トラック: midi・private、4 版、伴奏は原曲音高、sync は空、検査を通る', async () => {
    const smf = parseSmf(format1ThreeTracks())
    const c = await chartFromSmf({ smf, play: 0, accomp: [1], fold: 'octave', name: ' three ', composer: '作者', created: '2026-11-01T00:00:00.000Z' })
    expect(validateChart(c).ok).toBe(true)
    expect(c.name).toBe('three')
    expect(c.source).toEqual({ kind: 'midi', rights: 'private', title: 'three', composer: '作者' })
    expect(c.variants?.map((v) => v.id)).toEqual(['ableton/2/octave', 'ableton/3/octave', 'vmpk/2/octave', 'vmpk/3/octave'])
    expect(c.accompaniment?.map((n) => n.midi)).toEqual([48, 52, 55, 53, 57, 60])
    expect(c.pulse).toEqual({ resolution: 240, tempo: [{ beat: 0, bpm: 100 }, { beat: 4, bpm: 120 }], timeSig: [{ beat: 0, num: 4, den: 4 }] })
    expect(c.bpm).toBeUndefined()
    expect([c.sync, c.created, c.generator]).toEqual([{ sources: [] }, '2026-11-01T00:00:00.000Z', IMPORT_GENERATOR])
    // 作者が空なら書かない、created が無ければ書かない
    const bare = await chartFromSmf({ smf, play: 0, fold: 'cut', name: 'b', composer: ' ' })
    expect(bare.source).toEqual({ kind: 'midi', rights: 'private', title: 'b' })
    expect('created' in bare).toBe(false)
    expect(bare.variants?.map((v) => v.fold)).toEqual(['cut', 'cut', 'cut', 'cut'])
  }) // prettier-ignore

  it('id（§3.3）: 同じ SMF を 2 回 → 同じ id、曲名・作者・伴奏を変えても同じ id。旋律が違えば別の id', async () => {
    const smf = parseSmf(format1ThreeTracks())
    const a = await chartFromSmf({ smf, play: 0, fold: 'octave', name: 'a' })
    const b = await chartFromSmf({ smf: parseSmf(format1ThreeTracks()), play: 0, accomp: [1, 2], fold: 'nearest', name: 'b', composer: 'c' })
    expect(b.id).toBe(a.id)
    expect((await chartFromSmf({ smf, play: 1, fold: 'octave', name: 'a' })).id).not.toBe(a.id)
  }) // prettier-ignore

  it('mel 形の 6 曲を SMF 経由で通すと、mel 経由（フィクスチャ）と同じ id・同じ variants の鍵', async () => {
    for (const key of M1_SONG_KEYS) {
      const viaMel = await m1Chart(key)
      const viaSmf = await fromMel(parseSmf(melToSmf(M1_SONGS[key])), key)
      expect(viaSmf.id, key).toBe(viaMel.id)
      expect(
        viaSmf.variants?.map((v) => [v.id, v.keys]),
        key,
      ).toEqual(viaMel.variants?.map((v) => [v.id, v.keys]))
    }
  })

  it('無いトラック・弾くトラックを伴奏に選ぶと RangeError', () => {
    const smf = parseSmf(format1ThreeTracks())
    expect(() => smfParts(smf, 5)).toThrow('弾くトラック 5')
    expect(() => smfParts(smf, 0, [0])).toThrow('伴奏トラック 0')
    expect(() => smfParts(smf, 0, [7])).toThrow('伴奏トラック 7')
  })

  it('importSpecs は同梱曲の配列と上限で fold を差し替える', () => {
    expect(importSpecs('nearest')).toEqual([
      { layout: 'ableton', limit: 2, fold: 'nearest' },
      { layout: 'ableton', limit: 3, fold: 'nearest' },
      { layout: 'vmpk', limit: 2, fold: 'nearest' },
      { layout: 'vmpk', limit: 3, fold: 'nearest' },
    ])
  })
})

describe('失われる音（foldPreview）と難度 4 軸', () => {
  const canonSmf = parseSmf(melToSmf(M5_EXAMPLES.canon))

  it('カノン進行 ableton/2/octave: 元 51・寄せ 24・落とし 0・間引き 17・残る 34（m5 と同じ数）', () => {
    const p = foldPreview(smfParts(canonSmf, 0), 'octave')
    expect(p.collapsed).toBe(0)
    expect(p.rows).toEqual([
      {
        id: 'ableton/2/octave',
        srcNotes: 51,
        droppedFold: 0,
        movedFold: 24,
        droppedThin: 17,
        kept: 34,
      },
      {
        id: 'ableton/3/octave',
        srcNotes: 51,
        droppedFold: 0,
        movedFold: 24,
        droppedThin: 0,
        kept: 51,
      },
      {
        id: 'vmpk/2/octave',
        srcNotes: 51,
        droppedFold: 0,
        movedFold: 0,
        droppedThin: 17,
        kept: 34,
      },
      { id: 'vmpk/3/octave', srcNotes: 51, droppedFold: 0, movedFold: 0, droppedThin: 0, kept: 51 },
    ])
  })

  it('拍 6 の [54,57,61] は 54 を落とし 57→KeyH・61→KeyW が残る（#20。m5 は 61 を落とす）', async () => {
    const c = await fromMel(canonSmf)
    const v = variant(c, 'ableton/2/octave')
    const at6 = c.notes.flatMap((n, i) => (n.beat === 6 ? [[n.midi, v.keys[i]]] : []))
    expect(at6).toEqual([
      [54, null],
      [57, 'KeyH'],
      [61, 'KeyW'],
    ])
  })

  it('難度 4 軸: ableton/2 は 1.196・2.125・4・1・0.25、vmpk/2 は跳躍 3.125・最大 6・段またぎ 0.5 で最大跳躍の注意 1 件', async () => {
    const c = await fromMel(canonSmf)
    expect(variant(c, 'ableton/2/octave').metrics).toEqual({ density: 1.196, leap: 2.125, leapMax: 4, chord: 1, rowCross: 0.25 })
    const vm = variant(c, 'vmpk/2/octave').metrics
    expect(vm).toEqual({ density: 1.196, leap: 3.125, leapMax: 6, chord: 1, rowCross: 0.5 })
    expect(cautions(vm)).toEqual([{ kind: 'leap', value: 6, limit: 6 }])
    expect(cautions(variant(c, 'ableton/2/octave').metrics)).toEqual([])
  }) // prettier-ignore

  it('きらきら星（96 BPM、42 音）: 4 版とも 1.4・0.829・4・0・0、速い横移動 0 件（C→G は距離 4 だが 625 ms）', async () => {
    const c = await fromMel(parseSmf(melToSmf(M1_SONGS.twinkle)))
    expect(c.notes).toHaveLength(42)
    const ms = buildMsTable(c.pulse)
    for (const v of c.variants ?? []) {
      expect(v.metrics, v.id).toEqual({
        density: 1.4,
        leap: 0.829,
        leapMax: 4,
        chord: 0,
        rowCross: 0,
      })
      expect(fingeringWarnings(c, ms, v), v.id).toEqual([])
    }
  })

  it('注意の境: 密度は 3.5 を超えたら、最大跳躍は 6 以上で', () => {
    expect(cautions({ density: 3.5, leapMax: 5 })).toEqual([])
    expect(cautions({ density: 3.501, leapMax: 6 }).map((c) => c.kind)).toEqual(['density', 'leap'])
    expect(cautions(undefined)).toEqual([])
  })

  it('1/240 に丸めて同拍同音に潰れた音を数える', () => {
    const smf: Smf = { format: 0, division: 960, tempo: [{ beat: 0, bpm: 120 }], timeSig: [], tracks: [
      { name: 'm', ch: 0, drum: false, notes: [{ midi: 60, beat: 0, dur: 1, vel: 9 }, { midi: 60, beat: 0.001, dur: 0.5, vel: 9 }, { midi: 62, beat: 1, dur: 1, vel: 9 }] },
    ] } // prettier-ignore
    const p = smfParts(smf, 0)
    expect(p.collapsed).toBe(1)
    expect(p.notes.map((n) => [n.midi, n.beat, n.dur])).toEqual([[60, 0, 1], [62, 1, 1]])
    expect(foldPreview(p, 'octave').collapsed).toBe(1)
  }) // prettier-ignore
})

describe('運指の警告（§7-5、m5 L351–357）', () => {
  const chartOf = (
    bpm: number,
    notes: [number, number, number][],
  ): Pick<Chart, 'notes' | 'pulse'> => ({
    notes: notes.map(([midi, beat, dur]) => ({ midi, beat, dur })),
    pulse: { resolution: 240, tempo: [{ beat: 0, bpm }] },
  })
  const warn = (
    c: Pick<Chart, 'notes' | 'pulse'>,
    layout: 'ableton' | 'vmpk' = 'ableton',
    limit: 2 | 3 = 2,
  ) =>
    fingeringWarnings(c, buildMsTable(c.pulse), buildVariant(c, { layout, limit, fold: 'octave' }))

  it('速い横移動: 130 BPM の 8 分で A 段の C→G は 1 件、120 BPM（ちょうど 250 ms）は 0 件', () => {
    expect(
      warn(
        chartOf(130, [
          [60, 0, 0.5],
          [67, 0.5, 0.5],
        ]),
      ),
    ).toEqual([{ kind: 'fast', beat: 0.5, text: '拍 0.5: A → G（A 段で距離 4、231 ms）' }])
    expect(
      warn(
        chartOf(120, [
          [60, 0, 0.5],
          [67, 0.5, 0.5],
        ]),
      ),
    ).toEqual([])
    // 距離 3（C→F）は数えない、段が違う最近接の組（C → C♯ の W）は数えない
    expect(
      warn(
        chartOf(130, [
          [60, 0, 0.5],
          [65, 0.5, 0.5],
        ]),
      ),
    ).toEqual([])
  })

  it('速い横移動は塊どうしの最も近い組で見る（m5 L352）: [C,G] → [G] は距離 0 で警告なし', () => {
    expect(
      warn(
        chartOf(130, [
          [60, 0, 0.5],
          [67, 0, 0.5],
          [67, 0.5, 0.5],
        ]),
      ),
    ).toEqual([])
  })

  it('矩形 4 隅: 間引き前の同拍 [61,62,63,64]（W S E D）は上限 2 の版でも 1 件', () => {
    const c = chartOf(100, [
      [61, 0, 1],
      [62, 0, 1],
      [63, 0, 1],
      [64, 0, 1],
    ])
    expect(warn(c)).toEqual([
      { kind: 'rect', beat: 0, text: '拍 0: 同時押し W+S+E+D が矩形 4 隅（Q 段とA 段の列 1,2）' },
    ])
    expect(warn(c, 'ableton', 3)).toHaveLength(1)
  })

  it('rectCorners: Q W A S → 1 組、Q W A D → 0、3 音以下は見ない', () => {
    expect(rectCorners(['KeyQ', 'KeyW', 'KeyA', 'KeyS'])).toEqual([{ rows: [1, 2], cols: [0, 1] }])
    expect(rectCorners(['KeyQ', 'KeyW', 'KeyA', 'KeyD'])).toEqual([])
    expect(rectCorners(['KeyQ', 'KeyA', 'KeyS'])).toEqual([])
  })
})

describe('折り畳み（Ableton 型 60〜76、検算済 M0 手順 3 の写し）', () => {
  it('octave で 57 → 69、78 → 66、48 → 60。nearest で 58 → 60、77 → 76。cut で 57 → null', () => {
    expect([57, 78, 48].map((m) => foldPitch(m, 'ableton', 'octave')?.midi)).toEqual([69, 66, 60])
    expect([58, 77].map((m) => foldPitch(m, 'ableton', 'nearest')?.midi)).toEqual([60, 76])
    expect(foldPitch(57, 'ableton', 'cut')).toBeNull()
  })
})
