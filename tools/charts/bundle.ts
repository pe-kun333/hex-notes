// 同梱曲を作る純関数（M1-01、M1 の手順 6）。tools/charts/bundle-run.ts が content/charts/ に書き、試験が照合する。
// 出どころ: m1-kickoff 手順 6（SMF か mel → 弾くトラック 1 つ＋伴奏トラック → notes・accompaniment・pulse → 4 版〔チュートリアル
// 曲は ableton/2/octave の 1 版、§1.3 S0d「常に Ableton 型」〕→ 難度 4 軸 → validateChart → content/charts/<pd|cc|own|tutorial>/）、
// decisions #13（同梱曲は動画 ID を持たない ＝ sync.sources は空）・#23（4 版）・#47 (a)（伴奏は原曲音高）・#58・#59、
// mel-fixtures.ts（m1Chart と formatJson の形）。書く文字列は決定的（日時を入れない）。
// M2-01 前半（M2 の手順 1）で tidy・SMF の partsOf・組み立てを src/chart/import.ts に移した（同梱曲の出力は不変）。

import { assembleChart, smfParts, tidyNotes, type ChartParts } from '../../src/chart/import.ts'
import type { Smf } from '../../src/chart/smf.ts'
import { BUNDLED_VARIANT_SPECS, type VariantSpec } from '../../src/chart/variants.ts'
import type { Chart, Note, Pulse, Source } from '../../src/shared/types.ts'
import { DEFAULT_RESOLUTION } from '../../src/shared/types.ts'
import { formatJson } from './mel-fixtures.ts'
import type { MelSong } from './mel-songs.ts'

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

/** 元 → 名前・旋律・伴奏・pulse（SMF は持ち込みと同じ smfParts を通る。M2-01） */
function partsOf(from: BundleFrom): { name: string; parts: Pick<ChartParts, 'notes' | 'accompaniment' | 'pulse'> } {
  if (from.kind === 'mel') {
    const pulse: Pulse = { resolution: DEFAULT_RESOLUTION, tempo: [{ beat: 0, bpm: from.song.bpm }] }
    return { name: from.song.name, parts: { notes: tidyNotes(melNotes(from.song), pulse.resolution).notes, accompaniment: [], pulse } }
  }
  return { name: from.name, parts: smfParts(from.smf, from.play, from.accomp) }
} // prettier-ignore

/** 同梱曲 1 つ（版と難度 4 軸付き。組み立ては持ち込みと同じ assembleChart。検査を通らなければ Error） */
export async function bundledChart(song: BundleSong): Promise<Chart> {
  const p = partsOf(song.from)
  return assembleChart({
    name: p.name,
    parts: p.parts,
    source: song.source,
    specs: song.specs ?? BUNDLED_VARIANT_SPECS,
    generator: BUNDLE_GENERATOR,
    where: `bundle(${song.file})`,
  })
}

/** content/charts/ に書くファイル（path は content/charts/ からの相対） */
export async function buildBundle(
  songs: readonly BundleSong[],
): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = []
  for (const s of songs) out.push({ path: s.file, text: formatJson(await bundledChart(s)) + '\n' })
  return out
}
