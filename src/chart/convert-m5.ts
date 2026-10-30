// m5 の内部表現 → hexnote-chart/1（M0-02 後半、手順 3）。出どころ: docs/design.md §3.3「m5 の出力は変換器
// （notes を原曲音高に戻し、keys/layout/limit を variants[0] に畳み、source と id を補う）を通してから
// バリデータに掛ける」、m0-kickoff.md §3 の移行表、decisions #22（変換の規則、仮）。
// 入力は m5 の song（mel L249／parseMidi L263–314 の戻り）と buildVariant L324–363 の戻り（src と out[].orig・key）。
// m5 の JSON 出力（buildJSON L417–424）は折り畳み後の音高で vel・orig が無いので入力にしない（照合だけ）。
// 変換: notes は src を原曲音高のまま（beat は 1/resolution に丸め、tick 昇順・同 tick は midi 昇順、
// 同 tick 同音は最初の 1 つ）。vel は m5 の 0..1（mel 0.8、parseMidi は L308 で max(0.3, v/127)）→ round(×127)。
// keys は out[] を (tick, orig) で notes に対応させ、落ちた音は null。garage→ableton、fl→vmpk。同 tick で鍵が
// 重なる・上限を超えるときは Error（m5 の 1e-3 の塊と tick がずれる手作りの入力でだけ起きる）。
// m5 の metrics・stats は生の値のまま variants[0] に写す（warnings は外す。同 tick 同音をまとめた後の notes とは
// 合わないことがある）。hand は ext.hand（/1 では見ない）。keys は m5 の規則で選んだ鍵なので、同じ chartId・
// variantId でも src/chart/variants.ts の版とは違いうる（M0 の照合用。charts・results には保存しない。decisions #22）。
// 出力は validateChart を通した物だけ返す（通らなければ Error）。グローバル状態なし。DOM・Node に触れない。

import type {
  Chart,
  ChordLimit,
  FoldId,
  KeyCode,
  LayoutId,
  Note,
  Source,
  SyncSource,
  TempoPoint,
  TimeSigPoint,
} from '../shared/types.ts'
import {
  CHART_FORMAT,
  CHORD_LIMITS,
  FOLD_IDS,
  LAYOUT_ALIASES,
  LAYOUT_IDS,
  MAX_RESOLUTION,
} from '../shared/types.ts'
import { midiOf } from '../layout/presets.ts'
import { computeChartId, round4 } from './hash.ts'
import { validateChart } from './validate.ts'
import type { VariantStats } from './variants.ts'
import { variantId } from './variants.ts'

// ---------- m5 の内部表現（m5-song-import.html の形のまま。DOM の項は持たない） ----------

/** m5 の音符。vel は 0..1（mel は 0.8、parseMidi は max(0.3, v/127)）。ch は parseMidi だけ */
export type M5Note = { midi: number; beat: number; dur: number; vel?: number; ch?: number }

export type M5Track = {
  name: string
  notes: M5Note[]
  ch: number[]
  drum?: boolean
  split?: boolean
}

/** m5 の曲（mel L249・parseMidi L313 の戻り）。timeSig は "4/4" か "（拍子なし）" */
export type M5Song = {
  name: string
  bpm: number
  division: number
  timeSig: string
  tempo: TempoPoint[]
  tracks: M5Track[]
  beats: number
  source: string
  format?: number
  sigCount?: number
}

/** m5 の鍵（KEYS の要素） */
export type M5Key = { code: KeyCode; row: number; col: number }

/** buildVariant の out[] の要素: midi は折り畳み後、orig は原曲音高 */
export type M5OutNote = M5Note & { orig: number; key: M5Key }

export type M5Metrics = {
  density: number
  srcDensity: number
  leapAvg: number
  leapMax: number
  chordRatio: number
  chordMax: number
  rowCross: number
}

/** buildVariant L324–363 の戻りのうち変換に使う物。layout は m5 の名前（garage・fl・genshin・wicki） */
export type M5Variant = {
  src: M5Note[]
  out: M5OutNote[]
  moved: number
  dropFold: number
  dropThin: number
  metrics: M5Metrics
  fold: string
  limit: number
  layout: string
}

/** m5 state.sync（動画 ID が空なら動画なし） */
export type M5Sync = { videoId: string; offset: number; rate: number; done: boolean }

export type ConvertM5Input = {
  song: M5Song
  variant: M5Variant
  sync?: M5Sync
  /** 既定 {kind: 'midi', rights: 'private'}（m0-kickoff.md §3。持ち込み曲の扱い） */
  source?: Source
}

/** 変換器が書く generator */
export const CONVERT_M5_GENERATOR = 'hexnote convert-m5 (M0-02)'

/** m5 の内部表現を /1 にする。入力が m5 の形と合わない・出力が検査を通らないときは Error */
export async function convertM5(input: ConvertM5Input): Promise<Chart> {
  const { song, variant } = input
  const resolution = song.division
  if (!(Number.isInteger(resolution) && resolution > 0 && resolution <= MAX_RESOLUTION))
    throw new RangeError(`convertM5: division は 1〜${MAX_RESOLUTION} の整数（${resolution}）`)
  const layout = layoutOf(variant.layout)
  const limit = limitOf(variant.limit)
  const fold = foldOf(variant.fold)
  const tick = (beat: number): number => Math.round(beat * resolution)

  // notes: src を原曲音高のまま、tick 昇順・同 tick は midi 昇順（安定）。同 tick 同音は最初の 1 つ
  const sorted = variant.src
    .map((n, i) => ({ n, i, t: tick(n.beat) }))
    .sort((a, b) => a.t - b.t || a.n.midi - b.n.midi || a.i - b.i)
  const notes: Note[] = []
  const indexOf = new Map<string, number>()
  for (const { n, t } of sorted) {
    const k = `${t}:${n.midi}`
    if (indexOf.has(k)) continue
    indexOf.set(k, notes.length)
    notes.push(noteOf(n, resolution))
  }

  // keys: out[] を (tick, orig) で notes に対応させる。同じ音に 2 つ来たら最初を採る
  const keys: (KeyCode | null)[] = notes.map(() => null)
  const hand: ('R' | 'L' | null)[] = notes.map(() => null)
  for (const [j, o] of variant.out.entries()) {
    const i = indexOf.get(`${tick(o.beat)}:${o.orig}`)
    if (i === undefined)
      throw new Error(`convertM5: out[${j}]（beat ${o.beat}, orig ${o.orig}）が src に無い`)
    const code = o.key.code
    if (midiOf(layout, code) !== o.midi)
      throw new Error(
        `convertM5: out[${j}] の鍵 ${code} は ${layout} で ${String(midiOf(layout, code))}（midi ${o.midi} と合わない）`,
      )
    if (keys[i] !== null) continue
    keys[i] = code
    // m5 buildJSON L418 の hand（折り畳み後の音高で 60 以上が R）
    hand[i] = o.midi >= 60 ? 'R' : 'L'
  }
  checkChords(notes, keys, limit, tick)

  const m = variant.metrics
  const stats: VariantStats = {
    srcNotes: variant.src.length,
    droppedFold: variant.dropFold,
    movedFold: variant.moved,
    droppedThin: variant.dropThin,
    chordMax: m.chordMax,
  }
  const chart: Chart = {
    format: CHART_FORMAT,
    id: '',
    name: song.name,
    bpm: song.bpm,
    beats: song.beats,
    notes,
    pulse: pulseOf(song, resolution),
    sync: { sources: syncOf(input.sync) },
    source: input.source ?? { kind: 'midi', rights: 'private' },
    variants: [
      {
        id: variantId({ layout, limit, fold }),
        layout,
        limit,
        fold,
        keys,
        stats: { ...stats },
        metrics: {
          density: round4(m.density),
          leap: round4(m.leapAvg),
          leapMax: m.leapMax,
          chord: round4(m.chordRatio),
          rowCross: round4(m.rowCross),
        },
      },
    ],
    generator: CONVERT_M5_GENERATOR,
    ext: { hand },
  }
  chart.id = await computeChartId(chart)

  const r = validateChart(chart)
  if (!r.ok)
    throw new Error(
      `convertM5: 出力が /1 の検査を通らない: ${r.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
    )
  return chart
}

/**
 * 同 tick の鍵が重ならず上限以下か。m5 は差 1e-3 の塊で間引き、round(beat×1000) で重複を見るので、目盛りに
 * 乗らない拍（例 1 と 1.0015 を division 240 で）では同じ tick に塊が 2 つ入りうる。そのまま返すと遊べない
 */
function checkChords(
  notes: readonly Note[],
  keys: readonly (KeyCode | null)[],
  limit: number,
  tick: (beat: number) => number,
): void {
  const byTick = new Map<number, KeyCode[]>()
  for (const [i, k] of keys.entries()) {
    if (k === null) continue
    const t = tick((notes[i] as Note).beat)
    const list = byTick.get(t) ?? []
    if (list.includes(k))
      throw new Error(`convertM5: tick ${t} で鍵 ${k} が重なる（m5 の形と合わない入力）`)
    list.push(k)
    if (list.length > limit)
      throw new Error(`convertM5: tick ${t} で鍵が上限 ${limit} を超える（m5 の形と合わない入力）`)
    byTick.set(t, list)
  }
}

/** m5 の音符 → /1 の Note。vel は 0..1 → 0..127 の整数（省略はそのまま省略＝既定 80） */
function noteOf(n: M5Note, resolution: number): Note {
  const note: Note = {
    midi: n.midi,
    beat: Math.round(n.beat * resolution) / resolution,
    dur: n.dur,
  }
  if (n.vel !== undefined) {
    if (!(Number.isFinite(n.vel) && n.vel >= 0 && n.vel <= 1))
      throw new RangeError(`convertM5: m5 の vel は 0..1（${n.vel}）`)
    note.vel = Math.round(n.vel * 127)
  }
  return note
}

/** garage・fl は正規名へ。4 値以外（harmonic など）は RangeError */
function layoutOf(name: string): LayoutId {
  const canonical = Object.hasOwn(LAYOUT_ALIASES, name) ? LAYOUT_ALIASES[name] : name
  const found = LAYOUT_IDS.find((id) => id === canonical)
  if (found === undefined)
    throw new RangeError(`convertM5: layout は ${LAYOUT_IDS.join('|')}・garage・fl（${name}）`)
  return found
}

function limitOf(limit: number): ChordLimit {
  const found = CHORD_LIMITS.find((l) => l === limit)
  if (found === undefined)
    throw new RangeError(`convertM5: limit は ${CHORD_LIMITS.join('|')}（${limit}）`)
  return found
}

function foldOf(fold: string): FoldId {
  const found = FOLD_IDS.find((f) => f === fold)
  if (found === undefined)
    throw new RangeError(`convertM5: fold は ${FOLD_IDS.join('|')}（${fold}）`)
  return found
}

/** pulse。tempo は写し、timeSig は m5 の先頭の拍子 "n/d" だけ（変化は m5 が持たない） */
function pulseOf(song: M5Song, resolution: number): Chart['pulse'] {
  const tempo = song.tempo.map((t) => ({ beat: t.beat, bpm: t.bpm }))
  const sig = /^(\d+)\/(\d+)$/.exec(song.timeSig)
  if (!sig) return { resolution, tempo }
  const timeSig: TimeSigPoint[] = [{ beat: 0, num: Number(sig[1]), den: Number(sig[2]) }]
  return { resolution, tempo, timeSig }
}

/** 動画 ID があれば youtube の 1 本、無ければ空（動画なし専用） */
function syncOf(sync: M5Sync | undefined): SyncSource[] {
  if (!sync || sync.videoId === '') return []
  return [
    {
      kind: 'youtube',
      videoId: sync.videoId,
      offset: sync.offset,
      rate: sync.rate,
      measured: sync.done,
    },
  ]
}
