import { describe, expect, it } from 'vitest'
import {
  BUNDLED_VARIANT_SPECS,
  buildVariant,
  buildVariants,
  defaultKeyOf,
  foldPitch,
  variantId,
} from '../../../src/chart/variants.ts'
import type { VariantSpec } from '../../../src/chart/variants.ts'
import { midiOf } from '../../../src/layout/presets.ts'
import { CHORD_LIMITS, FOLD_IDS, LAYOUT_IDS } from '../../../src/shared/types.ts'
import type { Chart, LayoutId, Note } from '../../../src/shared/types.ts'
import { m5BuildVariant, m5MakeClock, m5Mel } from '../../../tools/charts/m5-port.ts'
import { M1_SONGS, m1Mel } from '../../../tools/charts/mel-songs.ts'

// src/chart/variants.ts（譜面版の生成）。出どころ: design.md §2.1・§2.4・§2.9・§3.2、decisions #12・#20・#21、
// m0-kickoff.md 手順 3 の期待値「[60,64,67,72] limit 2 → 67,72」。

type Part = Pick<Chart, 'notes' | 'pulse'>

/** 拍と音高の組から正規化済みの notes（同拍は midi 昇順）を作る */
function part(pairs: [beat: number, midi: number][], resolution = 240): Part {
  const notes: Note[] = pairs
    .map(([beat, midi]) => ({ midi, beat, dur: 1 }))
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi)
  return { notes, pulse: { resolution, tempo: [{ beat: 0, bpm: 120 }] } }
}

/** m1' の曲を正規化済みの Part に */
function m1Part(key: keyof typeof M1_SONGS): Part {
  const c = m1Mel(M1_SONGS[key])
  const notes = c.notes.slice().sort((a, b) => a.beat - b.beat || a.midi - b.midi)
  return { notes, pulse: { resolution: 240, tempo: [{ beat: 0, bpm: c.bpm }] } }
}

const spec = (
  layout: LayoutId,
  limit: 2 | 3 | 4,
  fold: 'octave' | 'cut' | 'nearest',
): VariantSpec => ({
  layout,
  limit,
  fold,
})

describe('variantId と同梱曲の 4 版', () => {
  it('id は <layout>/<limit>/<fold>（decisions #12）', () => {
    expect(variantId(spec('ableton', 2, 'octave'))).toBe('ableton/2/octave')
    expect(variantId(spec('wicki', 4, 'nearest'))).toBe('wicki/4/nearest')
  })

  it('同梱曲の版は Ableton×{2,3}・VMPK×{2,3}（design.md §2.9）、fold octave（decisions #23、仮）。凍結してある', () => {
    expect(Object.isFrozen(BUNDLED_VARIANT_SPECS)).toBe(true)
    expect(BUNDLED_VARIANT_SPECS.every((x) => Object.isFrozen(x))).toBe(true)
    expect(BUNDLED_VARIANT_SPECS.map(variantId)).toEqual([
      'ableton/2/octave',
      'ableton/3/octave',
      'vmpk/2/octave',
      'vmpk/3/octave',
    ])
  })
})

describe('foldPitch（m5 の折り畳み 3 種）', () => {
  it('音域の内で配列にある音はそのまま（moved false）', () => {
    expect(foldPitch(60, 'ableton', 'octave')).toEqual({ midi: 60, moved: false })
    expect(foldPitch(61, 'ableton', 'cut')).toEqual({ midi: 61, moved: false })
    expect(foldPitch(76, 'ableton', 'nearest')).toEqual({ midi: 76, moved: false })
  })

  it('octave: 音域外はオクターブで中へ（48→60、59→71、77→65、84→72、100→76）', () => {
    expect(foldPitch(48, 'ableton', 'octave')).toEqual({ midi: 60, moved: true })
    expect(foldPitch(59, 'ableton', 'octave')).toEqual({ midi: 71, moved: true })
    expect(foldPitch(77, 'ableton', 'octave')).toEqual({ midi: 65, moved: true })
    expect(foldPitch(84, 'ableton', 'octave')).toEqual({ midi: 72, moved: true })
    expect(foldPitch(100, 'ableton', 'octave')).toEqual({ midi: 76, moved: true })
  })

  it('全 128 音 × 4 配列 × 3 折り畳みで m5 の折り畳み（m5-port）と同じ', () => {
    const notes = Array.from({ length: 128 }, (_, m) => ({ midi: m, beat: m, dur: 1, vel: 0.8 }))
    for (const [layout, m5layout] of [['ableton', 'garage'], ['vmpk', 'fl'], ['genshin', 'genshin'], ['wicki', 'wicki']] as const)
      for (const fold of FOLD_IDS) {
        const m5 = m5BuildVariant(notes, m5layout, fold, 4, m5MakeClock({ tempo: [{ beat: 0, bpm: 120 }] }))
        for (const f of m5.folded) {
          const expected = f.out ? null : { midi: f.midi, moved: f.how !== null }
          expect(foldPitch(f.orig ?? f.midi, layout, fold), `${layout} ${fold} ${f.orig ?? f.midi}`).toEqual(expected)
        }
      }
  }) // prettier-ignore

  it('octave: 音名が配列に無ければ落とす（原神型の黒鍵 61・49・85）', () => {
    expect(foldPitch(61, 'genshin', 'octave')).toBeNull()
    expect(foldPitch(49, 'genshin', 'octave')).toBeNull()
    expect(foldPitch(85, 'genshin', 'octave')).toBeNull()
    expect(foldPitch(36, 'genshin', 'octave')).toEqual({ midi: 48, moved: true })
  })

  it('octave: 音域の中で上に同じ音名が無ければ下へ（wicki の 78 → 66、80 → 68、90 → 78 → 66。m5 L334）', () => {
    expect(foldPitch(78, 'wicki', 'octave')).toEqual({ midi: 66, moved: true })
    expect(foldPitch(80, 'wicki', 'octave')).toEqual({ midi: 68, moved: true })
    expect(foldPitch(90, 'wicki', 'octave')).toEqual({ midi: 66, moved: true })
    expect(foldPitch(49, 'wicki', 'octave')).toEqual({ midi: 61, moved: true })
  })

  it('cut: 配列に無い音は落とす', () => {
    expect(foldPitch(59, 'ableton', 'cut')).toBeNull()
    expect(foldPitch(77, 'ableton', 'cut')).toBeNull()
    expect(foldPitch(61, 'genshin', 'cut')).toBeNull()
  })

  it('nearest: 最も近い音へ。等距離は上（原神型の 61 → 62、66 → 67）', () => {
    expect(foldPitch(59, 'ableton', 'nearest')).toEqual({ midi: 60, moved: true })
    expect(foldPitch(30, 'ableton', 'nearest')).toEqual({ midi: 60, moved: true })
    expect(foldPitch(100, 'ableton', 'nearest')).toEqual({ midi: 76, moved: true })
    expect(foldPitch(61, 'genshin', 'nearest')).toEqual({ midi: 62, moved: true })
    expect(foldPitch(66, 'genshin', 'nearest')).toEqual({ midi: 67, moved: true })
    expect(foldPitch(90, 'genshin', 'nearest')).toEqual({ midi: 83, moved: true })
  })
})

describe('defaultKeyOf（同音の鍵の既定。decisions #21、仮）', () => {
  it('候補が 1 つならそれ。配列に無ければ null', () => {
    expect(defaultKeyOf('ableton', 60)).toBe('KeyA')
    expect(defaultKeyOf('ableton', 61)).toBe('KeyW')
    expect(defaultKeyOf('ableton', 59)).toBeNull()
    expect(defaultKeyOf('vmpk', 48)).toBe('KeyZ')
    expect(defaultKeyOf('vmpk', 65)).toBe('KeyR')
  })

  it('vmpk の 60〜64 は Q 段側（白鍵は Q 段、黒鍵は数字段。design.md §2.1）', () => {
    expect([60, 61, 62, 63, 64].map((m) => defaultKeyOf('vmpk', m))).toEqual([
      'KeyQ',
      'Digit2',
      'KeyW',
      'Digit3',
      'KeyE',
    ])
  })

  it('wicki: 60 以上は上の段、60 未満は下の段（58 = KeyQ・KeyN → KeyN、65 = Digit2・KeyJ → Digit2）', () => {
    expect(defaultKeyOf('wicki', 58)).toBe('KeyN')
    expect(defaultKeyOf('wicki', 65)).toBe('Digit2')
    expect(defaultKeyOf('wicki', 67)).toBe('Digit3')
  })
})

describe('buildVariant', () => {
  it('和音 [60, 64, 67, 72]・上限 2 → 67・72 が残る（低い音から落とす。台帳の手順 3）', () => {
    const v = buildVariant(part([[0, 60], [0, 64], [0, 67], [0, 72]]), spec('ableton', 2, 'octave'))
    expect(v.keys).toEqual([null, null, 'KeyG', 'KeyK'])
    expect(v.stats).toEqual({ srcNotes: 4, droppedFold: 0, movedFold: 0, droppedThin: 2, chordMax: 2 })
    expect(buildVariant(part([[0, 60], [0, 64], [0, 67], [0, 72]]), spec('ableton', 3, 'octave')).keys).toEqual([null, 'KeyD', 'KeyG', 'KeyK'])
    expect(buildVariant(part([[0, 60], [0, 64], [0, 67], [0, 72]]), spec('ableton', 4, 'octave')).keys).toEqual(['KeyA', 'KeyD', 'KeyG', 'KeyK'])
  }) // prettier-ignore

  it('間引きは原曲音高で比べる: [57, 61, 64]・ableton・上限 2 → 61・64（57 は 69 に畳まれるが一番低い。decisions #20）', () => {
    const v = buildVariant(
      part([
        [0, 57],
        [0, 61],
        [0, 64],
      ]),
      spec('ableton', 2, 'octave'),
    )
    expect(v.keys).toEqual([null, 'KeyW', 'KeyD'])
    expect(v.stats).toMatchObject({ movedFold: 1, droppedThin: 1, droppedFold: 0 })
  })

  it('同拍で同じ音高に畳まれたら原曲音高の高い方を残す: [48, 60] → 60 だけ（decisions #20）', () => {
    const v = buildVariant(
      part([
        [0, 48],
        [0, 60],
      ]),
      spec('ableton', 2, 'octave'),
    )
    expect(v.keys).toEqual([null, 'KeyA'])
    expect(v.stats).toEqual({
      srcNotes: 2,
      droppedFold: 1,
      movedFold: 1,
      droppedThin: 0,
      chordMax: 1,
    })
  })

  it('重複を落としてから間引く: [48, 60, 64, 67]・上限 2 → 64・67', () => {
    const v = buildVariant(
      part([
        [0, 48],
        [0, 60],
        [0, 64],
        [0, 67],
      ]),
      spec('ableton', 2, 'octave'),
    )
    expect(v.keys).toEqual([null, null, 'KeyD', 'KeyG'])
    expect(v.stats).toMatchObject({ droppedFold: 1, droppedThin: 1, movedFold: 1 })
  })

  it('cut と原神型の黒鍵は落ちる。別の拍は同時押しに数えない', () => {
    const v = buildVariant(
      part([
        [0, 48],
        [1, 60],
        [2, 61],
      ]),
      spec('genshin', 2, 'cut'),
    )
    expect(v.keys).toEqual(['KeyZ', 'KeyA', null])
    expect(v.stats).toEqual({
      srcNotes: 3,
      droppedFold: 1,
      movedFold: 0,
      droppedThin: 0,
      chordMax: 1,
    })
  })

  it('同時押しは 1/resolution の目盛り（tick）で数える: beat 0 と 0.001 は同拍、1/240 は別拍', () => {
    const same = buildVariant(part([[0, 60], [0.001, 64], [0.001, 67]]), spec('ableton', 2, 'octave'))
    expect(same.keys).toEqual([null, 'KeyD', 'KeyG'])
    const apart = buildVariant(part([[0, 60], [1 / 240, 64], [1 / 240, 67]]), spec('ableton', 2, 'octave'))
    expect(apart.keys).toEqual(['KeyA', 'KeyD', 'KeyG'])
  }) // prettier-ignore

  it('全部落ちたら keys は全部 null、chordMax 0', () => {
    const v = buildVariant(
      part([
        [0, 61],
        [1, 63],
      ]),
      spec('genshin', 2, 'cut'),
    )
    expect(v.keys).toEqual([null, null])
    expect(v.stats).toMatchObject({ droppedFold: 2, chordMax: 0 })
  })

  it('正規化されていない notes は RangeError（逆順・同拍で midi 降順・同拍同音）', () => {
    const base = part([[0, 60], [1, 62]])
    const swap = { ...base, notes: [base.notes[1]!, base.notes[0]!] }
    expect(() => buildVariant(swap, spec('ableton', 2, 'octave'))).toThrow(RangeError)
    const desc = { ...base, notes: [{ midi: 64, beat: 0, dur: 1 }, { midi: 60, beat: 0, dur: 1 }] }
    expect(() => buildVariant(desc, spec('ableton', 2, 'octave'))).toThrow(RangeError)
    const dup = { ...base, notes: [{ midi: 60, beat: 0, dur: 1 }, { midi: 60, beat: 0.001, dur: 1 }] }
    expect(() => buildVariant(dup, spec('ableton', 2, 'octave'))).toThrow(/正規化済み/)
  }) // prettier-ignore

  it('型の外の spec と resolution は RangeError', () => {
    const p = part([[0, 60]])
    const bad = (s: Record<string, unknown>): VariantSpec => s as unknown as VariantSpec
    expect(() => buildVariant(p, bad({ layout: 'garage', limit: 2, fold: 'octave' }))).toThrow(/layout/)
    expect(() => buildVariant(p, bad({ layout: 'ableton', limit: 5, fold: 'octave' }))).toThrow(/limit/)
    expect(() => buildVariant(p, bad({ layout: 'ableton', limit: 2, fold: 'mirror' }))).toThrow(/fold/)
    expect(() => buildVariant({ ...p, pulse: { ...p.pulse, resolution: 0 } }, spec('ableton', 2, 'octave'))).toThrow(/resolution/)
    expect(() => buildVariant({ ...p, pulse: { ...p.pulse, resolution: 9601 } }, spec('ableton', 2, 'octave'))).toThrow(/resolution/)
  }) // prettier-ignore

  it('beat が有限でない・midi が整数でない notes は RangeError（NaN との比較で順序の検査をすり抜けない）', () => {
    const pulse = { resolution: 240, tempo: [{ beat: 0, bpm: 120 }] }
    const notes = (xs: [number, number][]): Note[] => xs.map(([beat, midi]) => ({ midi, beat, dur: 1 }))
    expect(() => buildVariant({ notes: notes([[1, 60], [Number.NaN, 62], [0, 64]]), pulse }, spec('ableton', 2, 'octave'))).toThrow(/有限/)
    expect(() => buildVariant({ notes: notes([[0, 60], [Infinity, 62]]), pulse }, spec('ableton', 2, 'octave'))).toThrow(/有限/)
    expect(() => buildVariant({ notes: notes([[0, 60.5]]), pulse }, spec('ableton', 2, 'octave'))).toThrow(/整数/)
  }) // prettier-ignore

  it('入力を書き換えない。同じ入力から同じ出力', () => {
    const p = m1Part('duet')
    const before = JSON.stringify(p)
    const a = buildVariant(p, spec('vmpk', 2, 'octave'))
    const b = buildVariant(p, spec('vmpk', 2, 'octave'))
    expect(JSON.stringify(p)).toBe(before)
    expect(a).toEqual(b)
  })
})

describe("buildVariant の不変条件（m1' の 6 曲 × 4 配列 × 3 折り畳み × 上限 2〜4）", () => {
  it('keys は notes と同じ長さ。null の数 ＝ droppedFold ＋ droppedThin。鍵の音高 ＝ 折り畳み後の音高。同拍の鍵は上限以下で重ならない', () => {
    let n = 0
    for (const key of Object.keys(M1_SONGS) as (keyof typeof M1_SONGS)[]) {
      const p = m1Part(key)
      for (const layout of LAYOUT_IDS)
        for (const fold of FOLD_IDS)
          for (const limit of CHORD_LIMITS) {
            const label = `${key} ${layout}/${limit}/${fold}`
            const v = buildVariant(p, { layout, limit, fold })
            expect(v.id, label).toBe(`${layout}/${limit}/${fold}`)
            expect(v.keys.length, label).toBe(p.notes.length)
            const stats = v.stats as Record<string, number>
            expect(v.keys.filter((k) => k === null).length, label).toBe(
              (stats['droppedFold'] ?? -1) + (stats['droppedThin'] ?? -1),
            )
            const perBeat = new Map<number, string[]>()
            v.keys.forEach((k, i) => {
              if (k === null) return
              const note = p.notes[i]!
              expect(midiOf(layout, k), `${label} [${i}]`).toBe(
                foldPitch(note.midi, layout, fold)?.midi,
              )
              const list = perBeat.get(note.beat) ?? []
              list.push(k)
              perBeat.set(note.beat, list)
            })
            for (const list of perBeat.values()) {
              expect(list.length, label).toBeLessThanOrEqual(limit)
              expect(new Set(list).size, label).toBe(list.length)
            }
            n++
          }
    }
    expect(n).toBe(6 * 4 * 3 * 3)
  })

  it('同音の候補が無く間引きも重複も起きない曲では m5 の buildVariant と同じ鍵（ableton・genshin の単旋律）', () => {
    for (const key of ['twinkle', 'ode', 'scale', 'chroma'] as const)
      for (const [layout, m5layout] of [['ableton', 'garage'], ['genshin', 'genshin']] as const)
        for (const fold of FOLD_IDS) {
          const song = m5Mel({ name: key, bpm: M1_SONGS[key].bpm, seq: M1_SONGS[key].seq })
          const m5 = m5BuildVariant(song.tracks[0]!.notes, m5layout, fold, 2, m5MakeClock(song))
          const v = buildVariant(m1Part(key), { layout, limit: 2, fold })
          expect(v.keys.filter((k) => k !== null), `${key} ${layout} ${fold}`).toEqual(m5.out.map((o) => o.key.code))
          expect(v.stats, `${key} ${layout} ${fold}`).toEqual({
            srcNotes: m5.src.length, droppedFold: m5.dropFold, movedFold: m5.moved, droppedThin: m5.dropThin, chordMax: m5.metrics.chordMax,
          })
        }
  }) // prettier-ignore
})

describe('buildVariants', () => {
  it('既定は同梱曲の 4 版（canon は上限 2 で各和音の最低音が落ちる）', () => {
    const vs = buildVariants(m1Part('canon'))
    expect(vs.map((v) => v.id)).toEqual(BUNDLED_VARIANT_SPECS.map(variantId))
    expect(vs.map((v) => v.keys.filter((k) => k === null).length)).toEqual([17, 0, 17, 0])
  })

  it('同じ版が 2 度あれば RangeError', () => {
    expect(() =>
      buildVariants(m1Part('twinkle'), [
        spec('ableton', 2, 'octave'),
        spec('ableton', 2, 'octave'),
      ]),
    ).toThrow(/2 度/)
  })
})
