import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CONVERT_M5_GENERATOR, convertM5 } from '../../../src/chart/convert-m5.ts'
import type { M5Note, M5Song, M5Variant } from '../../../src/chart/convert-m5.ts'
import { canonicalJson, verifyChartId } from '../../../src/chart/hash.ts'
import { normalizeChart, validateChart } from '../../../src/chart/validate.ts'
import { buildVariant, foldPitch } from '../../../src/chart/variants.ts'
import { midiOf } from '../../../src/layout/presets.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { m5BuildVariant, m5MakeClock, m5Mel } from '../../../tools/charts/m5-port.ts'
import type { M5LayoutKey, M5Json } from '../../../tools/charts/m5-port.ts'
import { m1Chart, m5Default } from '../../../tools/charts/mel-fixtures.ts'
import { M1_SONGS, M5_EXAMPLES } from '../../../tools/charts/mel-songs.ts'

// src/chart/convert-m5.ts（m5 内部表現 → /1）。出どころ: design.md §3.3、m0-kickoff.md 手順 3 の期待値
// （canon・ableton・octave・上限 2 → out 34・dropThin 17、変換後 notes 51・id ableton/2/octave・keys 51 で null 17）と
// §3 の移行表、decisions #22。m5 の内部表現は tools/charts/m5-port.ts（元のコードと同じことを m5-port.test.ts で確かめた）。

/** 見本 id（computeChartId で計算し node:crypto で別計算して照合した固定値。m1' と m5 の canon・twinkle で同じ） */
const CANON_ID = 'sha256:ee99a59361ca73f0612a4e16b25a40c7a715039faa136dda7cc1d3d4d3fa373b'
const TWINKLE_ID = 'sha256:8ee244ea59ab605ee5b43e71fa422c83ae9946023ea9233f50127a1f28f866ae'

function m5Json(key: 'canon' | 'twinkle'): M5Json {
  const url = new URL(`../../fixtures/m5-json/${key}.garage.octave.L2.json`, import.meta.url)
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as M5Json
}

/** 手で作る m5 の曲（トラック 1 本） */
function song(notes: M5Note[], over: Partial<M5Song> = {}): M5Song {
  return {
    name: 's',
    bpm: 120,
    division: 240,
    timeSig: '4/4',
    tempo: [{ beat: 0, bpm: 120 }],
    tracks: [{ name: 't', notes, ch: [0] }],
    beats: 4,
    source: 'MIDI',
    ...over,
  }
}

/** 曲を m5 の buildVariant（m5-port）に通して変換する */
async function convert(
  s: M5Song,
  layout: M5LayoutKey = 'garage',
  fold = 'octave',
  limit = 2,
): Promise<Chart> {
  const variant = m5BuildVariant(s.tracks[0]!.notes, layout, fold, limit, m5MakeClock(s))
  return convertM5({ song: s, variant })
}

describe('手順 3 の期待値（canon・garage→ableton・octave・上限 2）', () => {
  it('m5 の buildVariant: out 34、dropThin 17、src 51（台帳の「仮」を検算）', () => {
    const { variant } = m5Default('canon')
    expect(variant.src.length).toBe(51)
    expect(variant.out.length).toBe(34)
    expect(variant.dropThin).toBe(17)
    expect(variant.dropFold).toBe(0)
    expect(variant.moved).toBe(24)
  })

  it('変換後: notes 51（原曲音高）、variants[0].id ableton/2/octave、keys 51 で null 17', async () => {
    const chart = await convertM5(m5Default('canon'))
    expect(chart.notes.length).toBe(51)
    expect(chart.notes.slice(0, 6).map((n) => n.midi)).toEqual([62, 66, 69, 57, 61, 64])
    expect(chart.variants?.length).toBe(1)
    const v = chart.variants![0]!
    expect(v.id).toBe('ableton/2/octave')
    expect([v.layout, v.limit, v.fold]).toEqual(['ableton', 2, 'octave'])
    expect(v.keys.length).toBe(51)
    expect(v.keys.filter((k) => k === null).length).toBe(17)
    expect(v.stats).toEqual({
      srcNotes: 51,
      droppedFold: 0,
      movedFold: 24,
      droppedThin: 17,
      chordMax: 2,
    })
  })

  it('canon の keys 51 個（固定値。元のモックの out[].orig・key と 1 つずつ突き合わせて確かめた値）', async () => {
    const chart = await convertM5(m5Default('canon'))
    // 和音ごとに原曲音高の昇順。例: [57,61,64] は 57→69 が KeyH、61 は間引き、64 が KeyD（m5 は畳んだ後の音高で間引く）
    expect(chart.variants![0]!.keys).toEqual([
      null, 'KeyT', 'KeyH', 'KeyH', null, 'KeyD', 'KeyJ', null, 'KeyT', 'KeyT', 'KeyH', null, 'KeyG', 'KeyJ', null,
      null, 'KeyT', 'KeyH', 'KeyG', 'KeyJ', null, 'KeyH', null, 'KeyD', null, 'KeyT', 'KeyH', 'KeyH', null, 'KeyD',
      'KeyJ', null, 'KeyT', 'KeyT', 'KeyH', null, 'KeyG', 'KeyJ', null, null, 'KeyT', 'KeyH', 'KeyG', 'KeyJ', null,
      'KeyH', null, 'KeyD', null, 'KeyT', 'KeyH',
    ])
  }) // prettier-ignore

  it('同じ chartId・variantId でも variants.ts の版とは keys が違う（canon で 24 か所。decisions #20・#22）', async () => {
    const chart = await convertM5(m5Default('canon'))
    const ours = buildVariant(chart, { layout: 'ableton', limit: 2, fold: 'octave' })
    expect(ours.id).toBe(chart.variants![0]!.id)
    const theirs = chart.variants![0]!.keys
    expect(ours.keys.filter((k, i) => k !== theirs[i]).length).toBe(24)
    expect(ours.keys.slice(3, 6)).toEqual([null, 'KeyW', 'KeyD'])
    expect(theirs.slice(3, 6)).toEqual(['KeyH', null, 'KeyD'])
  })

  it('検査を通り、正規化しても midi・beat・dur と順序が変わらない（strict の条件）', async () => {
    const chart = await convertM5(m5Default('canon'))
    expect(validateChart(chart).ok).toBe(true)
    const norm = normalizeChart(chart) as Chart
    const shape = (c: Chart): number[][] => c.notes.map((n) => [n.midi, n.beat, n.dur])
    expect(shape(norm)).toEqual(shape(chart))
  })

  it("id は中身と合い、m1' の同じ曲と同じ（id は source・variants・vel を含まない）。node:crypto で別計算", async () => {
    for (const [key, id] of [['canon', CANON_ID], ['twinkle', TWINKLE_ID]] as const) {
      const chart = await convertM5(m5Default(key))
      expect(chart.id, key).toBe(id)
      expect(await verifyChartId(chart), key).toBe(true)
      expect((await m1Chart(key)).id, key).toBe(id)
      expect('sha256:' + createHash('sha256').update(canonicalJson(chart), 'utf8').digest('hex')).toBe(id)
    }
  }) // prettier-ignore

  it('vel は m5 の 0.8 → round(0.8 × 127) ＝ 102。pulse・sync・source・写しの欄', async () => {
    const chart = await convertM5(m5Default('canon'))
    expect(new Set(chart.notes.map((n) => n.vel))).toEqual(new Set([102]))
    expect(chart.pulse).toEqual({
      resolution: 240,
      tempo: [{ beat: 0, bpm: 76 }],
      timeSig: [{ beat: 0, num: 4, den: 4 }],
    })
    expect(chart.sync).toEqual({ sources: [] })
    expect(chart.source).toEqual({ kind: 'midi', rights: 'private' })
    expect([chart.name, chart.bpm, chart.beats]).toEqual(['カノン進行（三和音）', 76, 36])
    expect(chart.generator).toBe(CONVERT_M5_GENERATOR)
  })
})

describe('m5 の JSON 出力（tests/fixtures/m5-json）と突き合わせる', () => {
  for (const key of ['canon', 'twinkle'] as const) {
    it(`${key}: 鍵のある音を拍ごとに並べると m5 の notes・keys・hand と同じ。metrics・stats も同じ`, async () => {
      const json = m5Json(key)
      const chart = await convertM5(m5Default(key))
      const v = chart.variants![0]!
      const hand = (chart.ext as { hand: (string | null)[] }).hand
      expect(hand.length).toBe(chart.notes.length)
      // 和音の中の並びは m5 が畳んだ後の音高順、/1 は原曲音高順なので、拍ごとに鍵で並べて比べる。midi は鍵からでなく
      // notes[i] を畳んで求める（鍵が別の音に付いていれば食い違う）
      const ours = chart.notes.flatMap((n, i) => {
        const k = v.keys[i]
        return k === null || k === undefined ? [] : [{ midi: foldPitch(n.midi, v.layout, v.fold)?.midi, beat: n.beat, dur: n.dur, hand: hand[i], key: k }]
      })
      const theirs = json.notes.map((n, k) => ({ ...n, key: json.keys[k] }))
      const order = (a: { beat: number; key?: string }, b: { beat: number; key?: string }): number =>
        a.beat - b.beat || String(a.key).localeCompare(String(b.key))
      expect(ours.sort(order)).toEqual(theirs.sort(order))
      expect(v.layout).toBe('ableton')
      expect(json.layout).toBe('garage')
      expect(v.limit).toBe(json.limit)
      expect(v.fold).toBe(json.stats['fold'])
      expect(v.metrics).toEqual({ ...json.metrics, leapMax: json.stats['leapMax'] })
      expect(v.stats).toEqual({
        srcNotes: json.stats['srcNotes'], droppedFold: json.stats['droppedFold'], movedFold: json.stats['movedFold'],
        droppedThin: json.stats['droppedThin'], chordMax: json.stats['chordMax'],
      })
      expect(json.notes.length).toBe(v.keys.filter((k) => k !== null).length)
    }) // prettier-ignore
  }
})

describe("鍵と音の対応（m5 の 2 曲＋m1' の 6 曲 × 4 配列 × 3 折り畳み × 上限 2〜4）", () => {
  it('鍵の音高 ＝ notes[i] を畳んだ音高。(tick, 原曲音高, 鍵) の集まりが m5 の out[] と同じ。同 tick の鍵は重ならず上限以下', async () => {
    const songs = [
      ...Object.entries(M5_EXAMPLES).map(([k, s]) => [`m5 ${k}`, m5Mel(s)] as const),
      ...Object.entries(M1_SONGS).map(([k, s]) => [`m1 ${k}`, m5Mel({ name: s.name, bpm: s.bpm, seq: s.seq })] as const),
    ]
    let n = 0
    for (const [name, s] of songs)
      for (const [m5layout, layout] of [['garage', 'ableton'], ['fl', 'vmpk'], ['genshin', 'genshin'], ['wicki', 'wicki']] as const)
        for (const fold of ['octave', 'cut', 'nearest'] as const)
          for (const limit of [2, 3, 4]) {
            const label = `${name} ${layout}/${limit}/${fold}`
            const variant = m5BuildVariant(s.tracks[0]!.notes, m5layout, fold, limit, m5MakeClock(s))
            const chart = await convertM5({ song: s, variant })
            const keys = chart.variants![0]!.keys
            const tick = (beat: number): number => Math.round(beat * s.division)
            const ours = new Set<string>()
            const perTick = new Map<number, string[]>()
            keys.forEach((k, i) => {
              if (k === null) return
              const note = chart.notes[i]!
              expect(midiOf(layout, k), `${label} [${i}]`).toBe(foldPitch(note.midi, layout, fold)?.midi)
              ours.add(`${tick(note.beat)}:${note.midi}:${k}`)
              perTick.set(tick(note.beat), [...(perTick.get(tick(note.beat)) ?? []), k])
            })
            const theirs = new Set(variant.out.map((o) => `${tick(o.beat)}:${o.orig}:${o.key.code}`))
            expect(ours, label).toEqual(theirs)
            for (const list of perTick.values()) {
              expect(new Set(list).size, label).toBe(list.length)
              expect(list.length, label).toBeLessThanOrEqual(limit)
            }
            n++
          }
    expect(n).toBe(8 * 4 * 3 * 3)
  }) // prettier-ignore
})

describe('変換の規則（decisions #22）', () => {
  it('目盛りに乗らない拍で m5 の塊と tick がずれ、同 tick で鍵が重なる・上限を超えるなら Error', async () => {
    // m5 は [60@1, 64@1] と [48@1.0015, 67@1.0015] を別の塊として 4 音とも残す。tick は全部 240、48 も 60 も KeyA
    const s = song([
      { midi: 60, beat: 1, dur: 1 },
      { midi: 64, beat: 1, dur: 1 },
      { midi: 48, beat: 1.0015, dur: 1 },
      { midi: 67, beat: 1.0015, dur: 1 },
    ])
    const variant = m5BuildVariant(s.tracks[0]!.notes, 'garage', 'octave', 2, m5MakeClock(s))
    expect(variant.out.length).toBe(4)
    await expect(convertM5({ song: s, variant })).rejects.toThrow(/重なる/)
    const over = song([
      { midi: 60, beat: 1, dur: 1 },
      { midi: 64, beat: 1, dur: 1 },
      { midi: 67, beat: 1.0015, dur: 1 },
    ])
    const v2 = m5BuildVariant(over.tracks[0]!.notes, 'garage', 'octave', 2, m5MakeClock(over))
    await expect(convertM5({ song: over, variant: v2 })).rejects.toThrow(/上限/)
  })

  it('fl → vmpk、genshin・wicki はそのまま。harmonic は RangeError', async () => {
    const s = song([{ midi: 60, beat: 0, dur: 1 }, { midi: 62, beat: 1, dur: 1 }])
    expect((await convert(s, 'fl')).variants![0]!.id).toBe('vmpk/2/octave')
    expect((await convert(s, 'genshin', 'cut', 3)).variants![0]!.id).toBe('genshin/3/cut')
    expect((await convert(s, 'wicki', 'nearest', 4)).variants![0]!.id).toBe('wicki/4/nearest')
    await expect(convert(s, 'harmonic')).rejects.toThrow(RangeError)
  }) // prettier-ignore

  it('m5 が持つ同音の鍵（前の音からの六角距離で選んだ物）をそのまま keys に写す（vmpk の 59 → 60 は Comma）', async () => {
    // 60 の候補は Comma（Z 段、KeyM の隣で距離 1）と KeyQ（距離 8）。既定の規則（decisions #21）なら KeyQ だが、
    // 変換器は m5 の選択を変えない。先頭の 60 だけなら候補の真ん中 cands[1]（m5 の map の挿入順 [Comma, KeyQ]）
    const after59 = await convert(song([{ midi: 59, beat: 0, dur: 1 }, { midi: 60, beat: 1, dur: 1 }]), 'fl')
    expect(after59.variants![0]!.keys).toEqual(['KeyM', 'Comma'])
    const alone = await convert(song([{ midi: 60, beat: 0, dur: 1 }]), 'fl')
    expect(alone.variants![0]!.keys).toEqual(['KeyQ'])
  }) // prettier-ignore

  it('limit・fold・division が範囲の外なら RangeError', async () => {
    const s = song([{ midi: 60, beat: 0, dur: 1 }])
    const base = m5BuildVariant(s.tracks[0]!.notes, 'garage', 'octave', 2, m5MakeClock(s))
    const bad = (over: Partial<M5Variant>): Promise<Chart> => convertM5({ song: s, variant: { ...base, ...over } })
    await expect(bad({ limit: 5 })).rejects.toThrow(/limit/)
    await expect(bad({ limit: 1 })).rejects.toThrow(/limit/)
    await expect(bad({ fold: 'mirror' })).rejects.toThrow(/fold/)
    for (const division of [0, 9601, 1.5])
      await expect(convertM5({ song: { ...s, division }, variant: base })).rejects.toThrow(/division/)
  }) // prettier-ignore

  it('vel: 0..1 は round(×127)（parseMidi の床 0.3 → 38）、省略は省略のまま、範囲外は RangeError', async () => {
    const chart = await convert(
      song([
        { midi: 60, beat: 0, dur: 1, vel: 0.3 },
        { midi: 62, beat: 1, dur: 1, vel: 1 },
        { midi: 64, beat: 2, dur: 1 },
        { midi: 65, beat: 3, dur: 1, vel: 0 },
      ]),
    )
    expect(chart.notes.map((n) => n.vel)).toEqual([38, 127, undefined, 0])
    expect('vel' in chart.notes[2]!).toBe(false)
    await expect(convert(song([{ midi: 60, beat: 0, dur: 1, vel: 100 }]))).rejects.toThrow(/vel/)
    await expect(convert(song([{ midi: 60, beat: 0, dur: 1, vel: -0.1 }]))).rejects.toThrow(/vel/)
  })

  it('src の順は問わない（tick 昇順・同 tick は midi 昇順に並べ替える）。beat は 1/resolution に丸める', async () => {
    const chart = await convert(
      song([
        { midi: 67, beat: 1, dur: 1 },
        { midi: 64, beat: 0.0004, dur: 1 },
        { midi: 60, beat: 0, dur: 1 },
      ]),
      'garage',
      'octave',
      3,
    )
    expect(chart.notes.map((n) => [n.midi, n.beat])).toEqual([[60, 0], [64, 0], [67, 1]])
    expect(chart.variants![0]!.keys).toEqual(['KeyA', 'KeyD', 'KeyG'])
  }) // prettier-ignore

  it('同 tick 同音は最初の 1 つにまとめる（m5 は重複として落とす／近い拍で両方残すが、/1 は 1 つ）', async () => {
    // 60@0 と 60@0（m5 の重複）、64@1 と 64@1.0006（m5 は round(beat×1000) が 1000・1001 で違うので両方に鍵を
    // 付ける。tick は round(240.144) ＝ 240 で同じ）
    const s = song([
      { midi: 60, beat: 0, dur: 1, vel: 0.5 },
      { midi: 60, beat: 0, dur: 2, vel: 1 },
      { midi: 64, beat: 1, dur: 1 },
      { midi: 64, beat: 1.0006, dur: 3 },
    ])
    const variant = m5BuildVariant(s.tracks[0]!.notes, 'garage', 'octave', 2, m5MakeClock(s))
    expect(variant.out.length).toBe(3)
    const chart = await convertM5({ song: s, variant })
    expect(chart.notes).toEqual([
      { midi: 60, beat: 0, dur: 1, vel: 64 },
      { midi: 64, beat: 1, dur: 1 },
    ])
    expect(chart.variants![0]!.keys).toEqual(['KeyA', 'KeyD'])
  })

  it('out の音が src に無い・鍵の音高が out.midi と合わないときは Error（m5 の形と合わない入力）', async () => {
    const s = song([{ midi: 60, beat: 0, dur: 1 }, { midi: 62, beat: 1, dur: 1 }])
    const base = m5BuildVariant(s.tracks[0]!.notes, 'garage', 'octave', 2, m5MakeClock(s))
    const o0 = base.out[0]!
    await expect(convertM5({ song: s, variant: { ...base, out: [{ ...o0, orig: 61 }] } })).rejects.toThrow(/src に無い/)
    await expect(convertM5({ song: s, variant: { ...base, out: [{ ...o0, midi: 62 }] } })).rejects.toThrow(/合わない/)
  }) // prettier-ignore

  it('同期: 動画 ID があれば youtube の 1 本（measured は計測済みか）、空なら sources は空', async () => {
    const { song: s, variant } = m5Default('twinkle')
    const yt = await convertM5({ song: s, variant, sync: { videoId: 'abcdefghijk', offset: 1.25, rate: 1.01, done: true } })
    expect(yt.sync.sources).toEqual([{ kind: 'youtube', videoId: 'abcdefghijk', offset: 1.25, rate: 1.01, measured: true }])
    const none = await convertM5({ song: s, variant, sync: { videoId: '', offset: 3, rate: 2, done: false } })
    expect(none.sync.sources).toEqual([])
    expect(yt.id).toBe(none.id)
  }) // prettier-ignore

  it('source を渡せばそれを使う。拍子なし・3/4・複数テンポ', async () => {
    const { song: s, variant } = m5Default('twinkle')
    const src = { kind: 'bundled', rights: 'pd', title: 'きらきら星' } as const
    expect((await convertM5({ song: s, variant, source: src })).source).toEqual(src)
    const noSig = await convert(song([{ midi: 60, beat: 0, dur: 1 }], { timeSig: '（拍子なし）' }))
    expect(noSig.pulse.timeSig).toBeUndefined()
    const tempo = [{ beat: 0, bpm: 90 }, { beat: 4, bpm: 120.5 }]
    const waltz = await convert(song([{ midi: 60, beat: 0, dur: 1 }], { timeSig: '3/4', tempo }))
    expect(waltz.pulse.timeSig).toEqual([{ beat: 0, num: 3, den: 4 }])
    expect(waltz.pulse.tempo).toEqual(tempo)
  }) // prettier-ignore

  it('入力を書き換えない', async () => {
    const input = m5Default('canon')
    const before = JSON.stringify(input)
    await convertM5(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})
