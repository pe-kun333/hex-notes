// 曲の一覧と譜面版の選び方（M1 の手順 3）。出どころ: m1-kickoff 手順 3（完了条件「手弾きで 6 曲〔フィクスチャ〕を S2 で
// 通す」。play-dev の曲・配列の select → 設定とプロファイルから）・§7-10（版の自動選択は手順 8）、decisions #7（上限の既定 2）・
// #23（同梱曲の版は ableton×{2,3}・vmpk×{2,3}、fold octave）。同梱曲（content/charts/）と S1 の一覧は手順 6・8 で、
// それまでは回帰ハーネスのフィクスチャ 6 曲を dev のときだけ S1 に出す（src/main.ts。build では空）。純関数。

import { validateChart } from '../chart/validate.ts'
import { buildVariant, type VariantSpec } from '../chart/variants.ts'
import type { Chart, Variant } from '../shared/types.ts'
import type { RunSong } from './play-runner.ts'

/** 一覧の 1 曲（url は譜面の JSON） */
export interface SongEntry {
  readonly id: string
  readonly name: string
  readonly url: string
}

/** 手順 3 の曲: tests/fixtures/charts/m1/ の 6 曲（vite dev が配る。play-dev と同じ）。名前は譜面の name */
export const FIXTURE_SONGS: readonly SongEntry[] = [
  ['twinkle', 'きらきら星'],
  ['ode', '歓喜の歌'],
  ['scale', 'スケール走り'],
  ['chroma', '半音階ドリル'],
  ['duet', '二声（旋律＋ベース）'],
  ['canon', 'カノン進行（三和音）'],
].map(([id, name]) => ({
  id: `fixture:${id}`,
  name: name ?? '',
  url: `/tests/fixtures/charts/m1/${id}.hexnote.json`,
}))

/** 譜面にその版があればそれ、無ければ作る（持ち込み曲は M2-01 で全部の版を作るので、ここは足りない版の埋め合わせ） */
export function variantFor(chart: Chart, spec: VariantSpec): Variant {
  const hit = chart.variants?.find(
    (v) => v.layout === spec.layout && v.limit === spec.limit && v.fold === spec.fold,
  )
  return hit ?? buildVariant(chart, spec)
}

/** 読んだ JSON → 演奏する曲。譜面として通らなければ最初の問題の文（画面に出す） */
export function songOf(json: unknown, spec: VariantSpec): RunSong | string {
  const r = validateChart(json)
  if (!r.ok) {
    const i = r.issues[0]
    return i === undefined ? '譜面が読めません' : `譜面が読めません（${i.path}: ${i.message}）`
  }
  // validateChart は notes の並び（拍の順・同拍は midi 昇順）も見るので、buildVariant は投げない
  const chart = r.chart
  return { chartId: chart.id, name: chart.name, chart, variant: variantFor(chart, spec) }
}
