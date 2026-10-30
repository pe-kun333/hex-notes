import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LAYOUTS, KEY_ROWS } from '../../../src/layout/presets.ts'
import { LAYOUT_ALIASES } from '../../../src/shared/types.ts'
import type { LayoutId } from '../../../src/shared/types.ts'
import type { M5Note, M5Song } from '../../../src/chart/convert-m5.ts'
import {
  M5_KEYS,
  M5_LAYOUT_KEYS,
  m5BuildJson,
  m5BuildVariant,
  m5FmtJson,
  m5MakeClock,
  m5Map,
  m5Mel,
} from '../../../tools/charts/m5-port.ts'
import type { M5LayoutKey, M5PortSync } from '../../../tools/charts/m5-port.ts'
import { M1_SONGS, M5_EXAMPLES, m1Mel } from '../../../tools/charts/mel-songs.ts'

// 元のモックのコードを行番号で切り出して評価し、tools/charts/m5-port.ts と mel-songs.ts の写しと突き合わせる
// （手順 3「buildVariant L324–363（TS へ移植）」の検算。モックに試験は無いので、元のコードそのものを正とする）。
// docs/planning/mocks/ は .prettierignore の写しで体裁を変えないので行は動かない。動いたら先頭・末尾の照合で落ちる。

const MOCKS = new URL('../../../docs/planning/mocks/', import.meta.url)
const M5_LINES = readFileSync(fileURLToPath(new URL('m5-song-import.html', MOCKS)), 'utf8').split(
  '\n',
)
const M1_LINES = readFileSync(fileURLToPath(new URL('m1-geometry.html', MOCKS)), 'utf8').split('\n')

/** from〜to 行（1 始まり、両端を含む）。先頭が head で始まり末尾が tail で終わらなければ止める */
function slice(lines: string[], from: number, to: number, head: string, tail: string): string {
  const part = lines.slice(from - 1, to)
  const first = part[0] ?? ''
  const last = part[part.length - 1] ?? ''
  if (!first.startsWith(head) || !last.endsWith(tail))
    throw new Error(`モックの行がずれた: L${from} ${JSON.stringify(first.slice(0, 40))}`)
  return part.join('\n')
}

type Fn = (...a: unknown[]) => unknown
type M5Original = {
  ROWS: string[][]
  KEYS: unknown[]
  PRESETS: Record<string, { map: () => Record<string, number> }>
  EXAMPLES: Record<string, () => M5Song>
  makeClock: (song: unknown) => { b2s: (b: number) => number; s2b: (s: number) => number }
  buildVariant: Fn
  buildJSON: () => unknown
  fmtJSON: (o: unknown) => string
}

/** m5 の元のコード。buildJSON が読む state・syncSession は引数で渡す（書き換えて使う） */
function loadM5(state: Record<string, unknown>, syncSession: { attempts: unknown[] }): M5Original {
  const src = [
    slice(M5_LINES, 206, 223, 'const SQ3', '/ 2; };'),
    slice(M5_LINES, 226, 241, 'const PRESETS', '};'),
    slice(M5_LINES, 249, 256, 'function mel', '};'),
    slice(M5_LINES, 317, 321, 'function makeClock', 'return { b2s, s2b }; }'),
    slice(M5_LINES, 324, 364, 'function buildVariant', 'toString(); }'),
    slice(M5_LINES, 416, 429, 'const r4', "return L.join('\\n'); }"),
  ].join('\n')
  const ret =
    'return { ROWS, KEYS, PRESETS, EXAMPLES, makeClock, buildVariant, buildJSON, fmtJSON }'
  const make = new Function('state', 'syncSession', `'use strict';\n${src}\n${ret}`) as (
    s: unknown,
    ss: unknown,
  ) => M5Original
  return make(state, syncSession)
}

/** m1' の元の mel・SONGS（L244–257） */
function loadM1Songs(): Record<string, Record<string, unknown>> {
  const src = slice(M1_LINES, 244, 257, 'function mel', '};')
  return new Function(`'use strict';\n${src}\nreturn SONGS`)() as Record<
    string,
    Record<string, unknown>
  >
}

const state: Record<string, unknown> = {}
const syncSession: { attempts: unknown[] } = { attempts: [] }
const M5 = loadM5(state, syncSession)

const FOLDS = ['octave', 'cut', 'nearest'] as const
const LIMITS = [2, 3, 4] as const

/** 分岐を通す手作りの曲: 2 区間のテンポ、未ソート、音域外、黒鍵、同拍の重複・近い拍、4 音以上の和音、速い横移動 */
function trickySong(): M5Song {
  const notes: M5Note[] = [
    { midi: 72, beat: 1, dur: 0.5, vel: 0.8 },
    { midi: 30, beat: 0, dur: 1, vel: 0.8 },
    { midi: 60, beat: 0, dur: 1, vel: 0.5 },
    { midi: 61, beat: 0, dur: 1, vel: 0.5 },
    { midi: 100, beat: 0, dur: 1, vel: 0.8 },
    { midi: 48, beat: 2, dur: 1, vel: 0.8 },
    { midi: 60, beat: 2, dur: 1, vel: 0.8 },
    { midi: 60, beat: 2.0004, dur: 1, vel: 0.8 },
    { midi: 64, beat: 2.0006, dur: 1, vel: 0.8 },
    // garage で W・E・S・D（2 段 × 2 列の矩形）
    { midi: 62, beat: 3, dur: 0.25, vel: 0.8 },
    { midi: 64, beat: 3, dur: 0.25, vel: 0.8 },
    { midi: 63, beat: 3, dur: 0.25, vel: 0.8 },
    { midi: 61, beat: 3, dur: 0.25, vel: 0.8 },
    { midi: 60, beat: 3.25, dur: 0.25, vel: 0.8 },
    { midi: 76, beat: 3.375, dur: 0.25, vel: 0.8 },
    { midi: 49, beat: 4, dur: 2, vel: 0.8 },
    { midi: 85, beat: 4, dur: 2, vel: 0.8 },
  ]
  return {
    name: 'tricky',
    bpm: 120,
    division: 240,
    timeSig: '3/4',
    tempo: [
      { beat: 0, bpm: 120 },
      { beat: 2, bpm: 60 },
    ],
    tracks: [{ name: 't', notes, ch: [0] }],
    beats: 6,
    source: '内蔵',
  }
}

/** 0〜127 の全音を別々の拍に（octave の下向き探索 L334 は wicki の 78・80 の系統でしか当たらない） */
function allPitchesSong(): M5Song {
  const notes: M5Note[] = Array.from({ length: 128 }, (_, m) => ({
    midi: m,
    beat: m,
    dur: 1,
    vel: 0.8,
  }))
  return {
    ...trickySong(),
    name: 'all',
    timeSig: '4/4',
    tempo: [{ beat: 0, bpm: 120 }],
    tracks: [{ name: 't', notes, ch: [0] }],
    beats: 128,
  }
}

const SONGS: [string, () => M5Song, () => M5Song][] = [
  ['twinkle', () => M5.EXAMPLES['twinkle']!(), () => m5Mel(M5_EXAMPLES.twinkle)],
  ['canon', () => M5.EXAMPLES['canon']!(), () => m5Mel(M5_EXAMPLES.canon)],
  ['tricky', trickySong, trickySong],
  ['all', allPitchesSong, allPitchesSong],
]

describe('m5 の写し（tools/charts/m5-port.ts）は元のコードと同じ', () => {
  it('キー表 ROWS・KEYS', () => {
    expect(M5.ROWS).toEqual(KEY_ROWS)
    expect(M5.KEYS).toEqual(M5_KEYS)
  })

  it('PRESETS の map は挿入順まで同じ（同音の候補の並びがこの順に依存する）', () => {
    expect(Object.keys(M5.PRESETS)).toEqual(M5_LAYOUT_KEYS)
    for (const l of M5_LAYOUT_KEYS)
      expect(Object.entries(m5Map(l)), l).toEqual(Object.entries(M5.PRESETS[l]!.map()))
  })

  it('harmonic 以外の map は src/layout/presets.ts の表と同じ組（順は問わない）', () => {
    const canonical = (l: string): LayoutId => (LAYOUT_ALIASES[l] ?? l) as LayoutId
    for (const l of ['fl', 'garage', 'genshin', 'wicki'] as const) {
      const sorted = (m: Record<string, number>): [string, number][] =>
        Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      expect(sorted(m5Map(l)), l).toEqual(sorted({ ...LAYOUTS[canonical(l)].map }))
    }
  })

  it('EXAMPLES（m5 の mel）', () => {
    for (const key of ['twinkle', 'canon'] as const)
      expect(m5Mel(M5_EXAMPLES[key]), key).toEqual(M5.EXAMPLES[key]!())
  })

  it('makeClock（2 区間のテンポで拍 ⇄ 秒）', () => {
    const song = trickySong()
    const a = M5.makeClock(song)
    const b = m5MakeClock(song)
    for (const beat of [-1, 0, 1.5, 2, 3.25, 10]) expect(b.b2s(beat)).toBe(a.b2s(beat))
    for (const sec of [-1, 0, 0.75, 1, 2.5, 10]) expect(b.s2b(sec)).toBe(a.s2b(sec))
  })

  it('buildVariant: 4 曲 × 5 配列 × 3 折り畳み × 上限 2〜4 の戻りが全部同じ', () => {
    let compared = 0
    for (const [name, orig, port] of SONGS)
      for (const layout of M5_LAYOUT_KEYS)
        for (const fold of FOLDS)
          for (const limit of LIMITS) {
            const so = orig()
            const sp = port()
            const vo = M5.buildVariant(so.tracks[0]!.notes, layout, fold, limit, M5.makeClock(so))
            const vp = m5BuildVariant(sp.tracks[0]!.notes, layout, fold, limit, m5MakeClock(sp))
            expect(vp, `${name} ${layout} ${fold} ${limit}`).toEqual(vo)
            compared++
          }
    expect(compared).toBe(4 * 5 * 3 * 3)
  })

  it('手作りの曲と全音の曲で落とし・重複・寄せ（上・下）・警告の分岐を全部通っている（照合が空回りしていない）', () => {
    const seen = { cut: 0, nopc: 0, dup: 0, near: 0, up: 0, down: 0, w4: 0, rect: 0 }
    for (const s of [trickySong(), allPitchesSong()])
      for (const layout of M5_LAYOUT_KEYS)
        for (const fold of FOLDS) {
          const v = m5BuildVariant(s.tracks[0]!.notes, layout, fold, 4, m5MakeClock(s))
          // 音域の内の音が下へ寄ったら下向き探索（L334）、上へ寄ったら上向き（L333）
          const inside = v.folded.filter(
            (n) => n.how === 'oct' && n.orig !== undefined && n.orig >= v.lo && n.orig <= v.hi,
          )
          seen.up += inside.filter((n) => n.midi > (n.orig as number)).length
          seen.down += inside.filter((n) => n.midi < (n.orig as number)).length
          seen.cut += v.cut
          seen.nopc += v.nopc
          seen.dup += v.dupes
          seen.near += v.folded.filter((n) => n.how === 'near').length
          seen.w4 += v.warns.filter((w) => w.type === 'w4').length
          seen.rect += v.warns.filter((w) => w.type === 'rect').length
        }
    for (const [k, n] of Object.entries(seen)) expect(n, k).toBeGreaterThan(0)
  })

  it('buildJSON → fmtJSON の文字列が同じ（同期なし、と計測済みの同期あり）', () => {
    const measured: M5PortSync = {
      videoId: 'dQw4w9WgXcQ',
      offset: 1.234567,
      rate: 1.000049,
      done: true,
      res: 0.01234,
      elapsed: 8.76,
    }
    for (const [name, orig, port] of SONGS)
      for (const layout of M5_LAYOUT_KEYS as readonly M5LayoutKey[])
        for (const fold of FOLDS)
          for (const limit of [2, 3] as const)
            for (const [sync, attempts] of [
              [{ videoId: '', offset: 0, rate: 1, done: false }, 0],
              [measured, 3],
            ] as const) {
              const so = orig()
              const sp = port()
              const vo = M5.buildVariant(so.tracks[0]!.notes, layout, fold, limit, M5.makeClock(so))
              const vp = m5BuildVariant(sp.tracks[0]!.notes, layout, fold, limit, m5MakeClock(sp))
              Object.assign(state, { song: so, variant: vo, layout, limit, sync })
              syncSession.attempts = Array.from({ length: attempts })
              const text = m5FmtJson(m5BuildJson(sp, vp, sync, attempts))
              expect(text, `${name} ${layout} ${fold} ${limit} ${sync.videoId}`).toBe(
                M5.fmtJSON(M5.buildJSON()),
              )
            }
  })

  it("m1' の 6 曲（mel・SONGS）は元と同じ。random だけ写していない", () => {
    const orig = loadM1Songs()
    expect(Object.keys(orig)).toEqual([...Object.keys(M1_SONGS), 'random'])
    for (const [key, song] of Object.entries(M1_SONGS)) expect(m1Mel(song), key).toEqual(orig[key])
  })
})
