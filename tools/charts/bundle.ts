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

/** content/charts/ に書くファイル（path は content/charts/ からの相対、name は譜面の name ＝ 製品の一覧に書く名前） */
export async function buildBundle(
  songs: readonly BundleSong[],
): Promise<{ path: string; text: string; name: string }[]> {
  const out: { path: string; text: string; name: string }[] = []
  for (const s of songs) {
    const c = await bundledChart(s)
    out.push({ path: s.file, text: formatJson(c) + '\n', name: c.name })
  }
  return out
}

/** 製品の同梱曲の一覧（charts:bundle が書く。M4 の手順 3、decisions #122） */
export const BUNDLE_LIST_PATH = 'src/app/bundled-list.ts'

/**
 * TS の文字列（Prettier と同じ選び方: 単引用符を好み、' の方が " より多い時だけ二重引用符。\ と使った引用符を逃がす）
 */
function tsString(s: string): string {
  const q = (s.split("'").length > s.split('"').length ? '"' : "'") as '"' | "'"
  const body = s.replace(/\\/g, '\\\\').split(q).join(`\\${q}`)
  return `${q}${body}${q}`
}

/**
 * 製品の一覧のファイルの中身（src/app/songs.ts の BUNDLED_SONGS が読む）。並びは BUNDLE_SONGS の順、file は .json を外した
 * content/charts/ からの相対、name は譜面の name。Prettier の形のまま書く（試験で整形し直して同じ事を見る）
 */
export function bundleListText(
  files: readonly { readonly path: string; readonly name: string }[],
): string {
  const rows = files.map(
    (f) => `  [${tsString(f.path.replace(/\.json$/, ''))}, ${tsString(f.name)}],`,
  )
  return [
    '// 同梱曲の一覧（生成物。手で書かない: npm run charts:bundle が tools/charts/bundle-songs.ts の BUNDLE_SONGS から書き、',
    '// charts:bundle:check が照合する。M4 の手順 3、decisions #122）。file は content/charts/ からの相対（.json なし）、',
    '// name は譜面の name。src/app/songs.ts の BUNDLED_SONGS が読む。',
    '',
    'export const BUNDLED_LIST: readonly (readonly [string, string])[] = [',
    ...rows,
    ']',
    '',
  ].join('\n')
}

/**
 * 一覧・譜面ファイル・権利表が同じ曲を指すか（M4 の手順 3、decisions #122）。list は一覧の file、charts は content/charts/ の
 * 譜面（listCharts）、rights は権利表の行の file。どれも content/charts/ からの相対。食い違いを 1 件ずつ返す（空なら揃っている）
 */
export function bundleIssues(
  list: readonly string[],
  charts: readonly string[],
  rights: readonly string[],
): string[] {
  const out: string[] = []
  for (const f of list) {
    if (!charts.includes(f))
      out.push(`${f}: 一覧に在って譜面が無い（npm run charts:bundle で書く）`)
    if (!rights.includes(f))
      out.push(`${f}: 一覧に在って権利表に行が無い（content/charts/rights.json に足す）`)
  }
  for (const f of charts)
    if (!list.includes(f))
      out.push(`${f}: 譜面が在って一覧に無い（bundle-songs.ts に足すか、譜面を消す）`)
  for (const f of rights) if (!list.includes(f)) out.push(`${f}: 権利表の行が一覧に無い`)
  return out
}
