// 曲の一覧と譜面版の選び方（M1 の手順 3。同梱曲は手順 6）。出どころ: m1-kickoff 手順 3（完了条件「手弾きで 6 曲〔フィクスチャ〕を S2 で
// 通す」。play-dev の曲・配列の select → 設定とプロファイルから）・§7-10（版の自動選択は手順 8）、decisions #7（上限の既定 2）・
// #23（同梱曲の版は ableton×{2,3}・vmpk×{2,3}、fold octave）。同梱曲（content/charts/）と S1 の一覧は手順 6・8 で、
// それまでは回帰ハーネスのフィクスチャ 6 曲を dev のときだけ S1 に出す（src/main.ts。build では空）。M2 の手順 2 で持ち込み曲
// （IndexedDB の charts）を足した: 一覧の 1 曲は load() で譜面を読む（同梱曲は url の fetch、持ち込みは保存した Chart）。

import { validateChart } from '../chart/validate.ts'
import { buildVariant, type VariantSpec } from '../chart/variants.ts'
import type { Chart, Variant } from '../shared/types.ts'
import type { RunSong } from './play-runner.ts'

/** 一覧の 1 曲。load は譜面の JSON（検査の前）を返す。読めなければ投げる */
export interface SongEntry {
  readonly id: string
  readonly name: string
  /** bundled ＝ 配る譜面（同梱曲と dev のフィクスチャ）、local ＝ 持ち込み（IndexedDB） */
  readonly source: 'bundled' | 'local'
  load(): Promise<unknown>
}

/** url で配る曲（同梱曲・フィクスチャ） */
export interface UrlSong extends SongEntry {
  readonly source: 'bundled'
  readonly url: string
}

/** url を fetch して JSON を読む（HTTP の失敗は投げる） */
function urlSong(id: string, name: string, url: string): UrlSong {
  return {
    id,
    name,
    source: 'bundled',
    url,
    load: async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as unknown
    },
  }
}

/** 持ち込み曲（保存した Chart をそのまま返す）。id は local: ＋ 譜面の id */
export function localSong(chart: Chart): SongEntry {
  return { id: `local:${chart.id}`, name: chart.name, source: 'local', load: async () => chart }
}

/**
 * 選べる曲: 配る曲の後に持ち込み曲（曲名の順、同じ名前は id の順。decisions #84 (f)）。殻の songs() が S1 を開くたびに
 * listCharts から作る（削除した曲は次に開いた S1 から消える、M2 の手順 4）
 */
export function songList(bundled: readonly SongEntry[], local: readonly Chart[]): SongEntry[] {
  const named = [...local].sort(
    (a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id),
  )
  return [...bundled, ...named.map(localSong)]
}

/**
 * 同梱曲（content/charts/。dev は vite が、build は copyContent が dist/content/ に写して配る。ADR 0003）。今は U-03 の
 * 代替の 3 曲（m1-kickoff §5。チュートリアル曲と PD の 2 曲）。名前は譜面の name。並びと譜面版の自動選択は手順 8
 */
export const BUNDLED_SONGS: readonly UrlSong[] = [
  ['tutorial/hajime', 'はじめの六角'],
  ['pd/twinkle', 'きらきら星'],
  ['pd/ode', '歓喜の歌'],
].map(([file, name]) => urlSong(`bundled:${file}`, name ?? '', `/content/charts/${file}.json`))

/** チュートリアル曲（S0d。手順 7 の鍵数制限の 3 段階、手順 9 の導線） */
export const TUTORIAL_SONG_ID = 'bundled:tutorial/hajime'

/** 手順 3 の曲: tests/fixtures/charts/m1/ の 6 曲（vite dev が配る。play-dev と同じ）。名前は譜面の name */
export const FIXTURE_SONGS: readonly UrlSong[] = [
  ['twinkle', 'きらきら星'],
  ['ode', '歓喜の歌'],
  ['scale', 'スケール走り'],
  ['chroma', '半音階ドリル'],
  ['duet', '二声（旋律＋ベース）'],
  ['canon', 'カノン進行（三和音）'],
].map(([id, name]) =>
  urlSong(`fixture:${id}`, name ?? '', `/tests/fixtures/charts/m1/${id}.hexnote.json`),
)

/**
 * 譜面にその版があればそれ。譜面が版を持つのにその配列の版が 1 つも無ければ（チュートリアル曲は Ableton 型の 1 版だけ、
 * §1.3 S0d「常に Ableton 型」）作らずに譜面の最初の版、他は作る（持ち込み曲は M2-01 で全部の版を作るので、ここは足りない
 * 版の埋め合わせ）。端末に合う版の自動選択は手順 8（m1-kickoff §7-10）
 */
export function variantFor(chart: Chart, spec: VariantSpec): Variant {
  const vs = chart.variants ?? []
  const hit = vs.find((v) => v.layout === spec.layout && v.limit === spec.limit && v.fold === spec.fold)
  if (hit !== undefined) return hit
  const first = vs[0]
  if (first !== undefined && !vs.some((v) => v.layout === spec.layout)) return first
  return buildVariant(chart, spec)
} // prettier-ignore

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
