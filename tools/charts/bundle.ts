// 同梱曲を作る純関数（M1-01、M1 の手順 6）。tools/charts/bundle-run.ts が content/charts/ に書き、試験が照合する。
// 出どころ: m1-kickoff 手順 6（SMF か mel → 弾くトラック 1 つ＋伴奏トラック → notes・accompaniment・pulse → 4 版〔チュートリアル
// 曲は ableton/2/octave の 1 版、§1.3 S0d「常に Ableton 型」〕→ 難度 4 軸 → validateChart → content/charts/<pd|cc|own|tutorial>/）、
// decisions #13（同梱曲は動画 ID を持たない ＝ sync.sources は空）・#23（4 版）・#47 (a)（伴奏は原曲音高）・#58・#59、
// mel-fixtures.ts（m1Chart と formatJson の形）。書く文字列は決定的（日時を入れない）。

import { computeChartId } from '../../src/chart/hash.ts'
import { variantMetrics } from '../../src/chart/metrics.ts'
import { validateChart } from '../../src/chart/validate.ts'
import { BUNDLED_VARIANT_SPECS, buildVariants, type VariantSpec } from '../../src/chart/variants.ts'
import type { Chart, Note, Pulse, Source } from '../../src/shared/types.ts'
import { CHART_FORMAT, DEFAULT_RESOLUTION } from '../../src/shared/types.ts'
import { formatJson } from './mel-fixtures.ts'
import type { MelSong } from './mel-songs.ts'
import type { Smf } from './smf.ts'

/** bundle が書く generator */
export const BUNDLE_GENERATOR = 'hexnote bundle (M1-01)'

/** チュートリアル曲の版（§1.3 S0d「常に Ableton 型」、上限 2） */
export const TUTORIAL_SPECS: readonly VariantSpec[] = [
  { layout: 'ableton', limit: 2, fold: 'octave' },
]

/** 曲の元: mel（拍単位の旋律）か、読んだ SMF の弾くトラックと伴奏トラック（tracks の添字） */
export type BundleFrom =
  | { readonly kind: 'mel'; readonly song: MelSong }
  | {
      readonly kind: 'smf'
      readonly smf: Smf
      readonly name: string
      readonly play: number
      readonly accomp?: readonly number[]
    }

export interface BundleSong {
  /** content/charts/ からの相対パス（rights.json の file と同じ） */
  readonly file: string
  readonly from: BundleFrom
  readonly source: Source
  /** 作る版（既定は同梱曲の 4 版） */
  readonly specs?: readonly VariantSpec[]
} // prettier-ignore

/** 拍の 1/resolution に丸め、beat 昇順・同拍は midi 昇順、同拍同音は 1 つに（長い方） */
function tidy(notes: readonly Note[], resolution: number): Note[] {
  const q = (b: number): number => Math.round(b * resolution) / resolution
  const byKey = new Map<string, Note>()
  for (const n of notes) {
    const m: Note = { ...n, beat: q(n.beat), dur: Math.max(1 / resolution, q(n.dur)) }
    const k = `${m.beat}:${m.midi}`
    const cur = byKey.get(k)
    if (cur === undefined || m.dur > cur.dur) byKey.set(k, m)
  }
  return [...byKey.values()].sort((a, b) => a.beat - b.beat || a.midi - b.midi)
}

/** mel の旋律 → notes（m1' mel L244: 拍を積み、和音は同じ beat。vel は持たない） */
function melNotes(song: MelSong): Note[] {
  let b = 0
  const out: Note[] = []
  for (const [p, d] of song.seq) {
    if (p !== null) for (const m of Array.isArray(p) ? p : [p]) out.push({ midi: m as number, beat: b, dur: d })
    b += d
  }
  return out
} // prettier-ignore

/** 元 → 名前・旋律・伴奏・pulse */
function partsOf(from: BundleFrom): { name: string; notes: Note[]; accompaniment: Note[]; pulse: Pulse } {
  if (from.kind === 'mel') {
    const pulse: Pulse = { resolution: DEFAULT_RESOLUTION, tempo: [{ beat: 0, bpm: from.song.bpm }] }
    return { name: from.song.name, notes: tidy(melNotes(from.song), pulse.resolution), accompaniment: [], pulse }
  }
  const s = from.smf
  const play = s.tracks[from.play]
  if (play === undefined) throw new RangeError(`bundle: 弾くトラック ${from.play} が無い（${s.tracks.length} 本）`)
  const pulse: Pulse = {
    resolution: DEFAULT_RESOLUTION,
    tempo: s.tempo.map((t) => ({ ...t })),
    ...(s.timeSig.length > 0 ? { timeSig: s.timeSig.map((t) => ({ ...t })) } : {}),
  }
  const acc = (from.accomp ?? []).flatMap((i) => {
    const t = s.tracks[i]
    if (t === undefined || i === from.play) throw new RangeError(`bundle: 伴奏トラック ${i} が無いか弾くトラックと同じ`)
    return t.notes
  })
  return { name: from.name, notes: tidy(play.notes, pulse.resolution), accompaniment: tidy(acc, pulse.resolution), pulse }
} // prettier-ignore

/** 同梱曲 1 つ（版と難度 4 軸付き。検査を通らなければ Error） */
export async function bundledChart(song: BundleSong): Promise<Chart> {
  const p = partsOf(song.from)
  const beats = p.notes.reduce((m, n) => Math.max(m, n.beat + n.dur), 0)
  const first = p.pulse.tempo[0]
  const chart: Chart = {
    format: CHART_FORMAT,
    id: '',
    name: p.name,
    ...(first !== undefined && p.pulse.tempo.length === 1 ? { bpm: first.bpm } : {}),
    beats,
    notes: p.notes,
    pulse: p.pulse,
    sync: { sources: [] },
    source: { ...song.source },
    ...(p.accompaniment.length > 0 ? { accompaniment: p.accompaniment } : {}),
    variants: [],
    generator: BUNDLE_GENERATOR,
  }
  chart.variants = buildVariants(chart, song.specs ?? BUNDLED_VARIANT_SPECS).map((v) => ({
    ...v,
    metrics: variantMetrics(chart, v),
  }))
  chart.id = await computeChartId(chart)
  const r = validateChart(chart)
  if (!r.ok) throw new Error(`bundle(${song.file}): ${r.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`)
  return chart
} // prettier-ignore

/** content/charts/ に書くファイル（path は content/charts/ からの相対） */
export async function buildBundle(
  songs: readonly BundleSong[],
): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = []
  for (const s of songs) out.push({ path: s.file, text: formatJson(await bundledChart(s)) + '\n' })
  return out
}
