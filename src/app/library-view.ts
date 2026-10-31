// 持ち込み曲ライブラリ（M2-06、M2 の手順 4）。出どころ: design.md §1.3 S1（フィルタ・「この配列／上限の版を作る」）・S6（データ:
// 持ち込み曲の削除・全持ち込み曲の版を作り直す・書き出し／取り込み）・§4.3、m6 S1 L311・visibleSongs L738–746・renderS1
// L781–786・makevariant L966・S6 L927、m2-kickoff 手順 4・§7-6・§7-18・§7-27、decisions #53・#71 (c)(f)・#83 (c)・#84・#86。
// 手直し: m6 の「持ち込み曲を削除」1 釦 → 曲ごと（記録は残す）。「動画あり」のフィルタは M3。
// 純関数（DOM は screens/settings.ts・screens/home.ts）。

import { importSpecs } from '../chart/import.ts'
import { variantMetrics } from '../chart/metrics.ts'
import { validateChart } from '../chart/validate.ts'
import { buildVariant, variantId, type VariantSpec } from '../chart/variants.ts'
import { localDay } from '../results/awards.ts'
import type { Chart, Variant } from '../shared/types.ts'
import { chartFileName } from '../storage/file.ts'
import { foldOf, type LimitChoice } from './home-view.ts'
import type { SongEntry } from './songs.ts'

// ---------- S1 のフィルタ ----------

/** S1 の絞り込み（m6 L311 の すべて／同梱／持ち込み。動画ありは M3） */
export type SongFilter = 'all' | 'bundled' | 'local'
export const FILTER_NAMES: Readonly<Record<SongFilter, string>> = {
  all: 'すべて',
  bundled: '同梱',
  local: '持ち込み',
}

/** 出すフィルタ。初回は出さない（null。§7-27 の isFirst、m6 visibleSongs L739） */
export function filterChoices(first: boolean): readonly SongFilter[] | null {
  return first ? null : ['all', 'bundled', 'local']
}

/** S1 に出すか（初回は同梱だけ、m6 visibleSongs L739–741。同梱は dev のフィクスチャを含む） */
export function songVisible(
  source: SongEntry['source'],
  filter: SongFilter,
  first: boolean,
): boolean {
  if (first) return source === 'bundled'
  return filter === 'all' || filter === source
}

/** 絞り込んで 1 曲も無いときの文 */
export function emptyListText(filter: SongFilter): string {
  return filter === 'local'
    ? '持ち込み曲はまだありません（「＋ 曲を持ち込む」から）。'
    : '曲の一覧は準備中です。'
}

// ---------- S1 の「この配列／上限の版を作る」 ----------

export const MAKE_MISSING = 'この配列／上限の版はまだありません。'
export const MAKE_BUTTON = 'この配列／上限の版を作る'

/**
 * 「この配列／上限の版を作る」を出すか（§1.3 S1、m6 renderS1 L781–786）: 持ち込み曲で、その版が無く、端末の上限以下。
 * 同梱曲は「この曲は ○○／上限 n の版を持ちません」のまま
 */
export function canMakeVariant(
  source: SongEntry['source'],
  c: Pick<LimitChoice, 'available' | 'allowed'> | undefined,
): boolean {
  return source === 'local' && c !== undefined && c.allowed && !c.available
}

/** 生成した版（難度 4 軸を付ける。同梱曲・持ち込み曲の保存と同じ形、decisions #83 (c)） */
function made(chart: Chart, spec: VariantSpec): Variant {
  const v = buildVariant(chart, spec)
  return { ...v, metrics: variantMetrics(chart, v) }
}

/** 検査を通った譜面だけを返す（作り直しで壊さない。通らなければ Error） */
function checked(chart: Chart, where: string): Chart {
  const r = validateChart(chart)
  if (!r.ok)
    throw new Error(`${where}: ${r.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`)
  return chart
}

/**
 * 版を 1 つ足す（m6 makevariant L966「折り畳みは持ち込み時の選択」＝ 曲の fold）。既にあればそのまま返す。id は変わらない
 * （variants は id に入らない、§3.3）
 */
export function withVariant(chart: Chart, spec: Pick<VariantSpec, 'layout' | 'limit'>): Chart {
  const full: VariantSpec = { ...spec, fold: foldOf(chart) }
  const id = variantId(full)
  if ((chart.variants ?? []).some((v) => v.id === id)) return chart
  return checked(
    { ...chart, variants: [...(chart.variants ?? []), made(chart, full)] },
    `withVariant(${id})`,
  )
}

// ---------- S6 の作り直し ----------

/**
 * 作り直す版（§7-18、decisions #86）: 今の版の配列・上限・fold をそのまま（「版を作る」で足した上限 4 も残す）、
 * 足りなければ曲の fold の 4 版（importSpecs）を後ろに足す。同じ id は 1 つ
 */
export function rebuildSpecs(chart: Pick<Chart, 'variants'>): VariantSpec[] {
  const out: VariantSpec[] = []
  const seen = new Set<string>()
  const add = (s: VariantSpec): void => {
    const id = variantId(s)
    if (seen.has(id)) return
    seen.add(id)
    out.push({ layout: s.layout, limit: s.limit, fold: s.fold })
  }
  for (const v of chart.variants ?? []) add(v)
  for (const s of importSpecs(foldOf(chart))) add(s)
  return out
}

/** 版を今の規則で作り直す（keys・stats・metrics。id・notes・fold は変えない） */
export function rebuildChart(chart: Chart): Chart {
  return checked(
    { ...chart, variants: rebuildSpecs(chart).map((s) => made(chart, s)) },
    `rebuildChart(${chart.name})`,
  )
}

export function rebuiltText(done: number, failed: number): string {
  if (done === 0 && failed === 0) return '持ち込み曲がありません。'
  return `${done} 曲の版を作り直しました${failed > 0 ? `（${failed} 曲は作り直せませんでした）` : ''}。`
}

// ---------- S6 の一覧 ----------

export interface LibraryRow {
  /** 譜面の id（削除・書き出しの鍵） */
  readonly id: string
  readonly name: string
  /** 曲名・作者・持ち込み日・版の 1 行 */
  readonly line: string
  readonly fileName: string
}

/** 持ち込み曲の一覧（殻の songs() と同じ曲名の順。持ち込み日は端末のローカル日付、無ければ —） */
export function libraryRows(charts: readonly Chart[]): LibraryRow[] {
  return [...charts]
    .sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id))
    .map((c) => {
      const by = c.source.composer === undefined ? '' : ` — ${c.source.composer}`
      const at = c.created === undefined || !Number.isFinite(Date.parse(c.created)) ? '—' : localDay(c.created)
      const vs = (c.variants ?? []).map((v) => v.id).join('・') || 'なし'
      return { id: c.id, name: c.name, line: `${c.name}${by} ・ 持ち込み ${at} ・ 版 ${vs}`, fileName: chartFileName(c) }
    })
} // prettier-ignore

export const LIBRARY_EMPTY = '持ち込み曲はありません（ホームの「＋ 曲を持ち込む」から）。'

export function deleteSure(name: string): string {
  return `本当に「${name}」を削除`
}

export function deletedText(name: string): string {
  return `「${name}」を削除しました（記録は残ります。曲のファイルか控えを取り込めば戻せます）。`
}

// ---------- S6 の取り込み（譜面ファイル・控え） ----------

/** 譜面ファイルの取り込み先（§7-18: 同梱曲と同じ id は断る、持ち込み済みは上書き） */
export type ChartImportKind = 'new' | 'overwrite' | 'bundled'

export function chartImportKind(
  id: string,
  bundledIds: readonly string[],
  existing: boolean,
): ChartImportKind {
  if (bundledIds.includes(id)) return 'bundled'
  return existing ? 'overwrite' : 'new'
}

export function chartImportText(kind: ChartImportKind, name: string, idChanged: boolean): string {
  if (kind === 'bundled')
    return `「${name}」は同梱曲と同じ曲なので取り込みません（同梱曲をそのまま遊べます）。`
  const fixed = idChanged ? 'id が中身と合わなかったので付け直しました。' : ''
  const over = kind === 'overwrite' ? '同じ曲があったので上書きしました（記録は残ります）。' : ''
  return `曲「${name}」を取り込みました（ホームの一覧に出ます）。${over}${fixed}`
}

/** 控えの曲から同梱曲と同じ id を除く（§7-18。記録はそのまま取り込む） */
export function backupCharts(
  charts: readonly Chart[],
  bundledIds: readonly string[],
): { keep: Chart[]; bundled: number } {
  const keep = charts.filter((c) => !bundledIds.includes(c.id))
  return { keep, bundled: charts.length - keep.length }
}
