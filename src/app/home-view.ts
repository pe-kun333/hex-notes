// S1 ホーム／選曲の中身（M1-08、M1 の手順 8）。出どころ: design.md §1.3 S1（曲カード: 曲名・許諾・音源の印・長さ・難度 4 軸・
// 自己ベスト〔プロファイル×譜面版〕・完走印。譜面版の選択: 配列〔推奨が先頭〕× 上限〔端末の上限以下。3〜4 は「保証なし」〕、
// 並び〔おすすめは密度の低い順〕）・§2.4（注意の目安: 密度 > 3.5・最大跳躍 ≥ 6）、m6 S1 L298–324・renderS1 L748–788
// （カード・版の選択・版が無いときの文言 L784–786・上限の注記 L771）・visibleSongs L738–747、m1-kickoff 手順 8・§7-10（端末に
// 合う版の自動選択: 配列は設定の配列、ただし ableton 版に落ちる音があり vmpk 版の方が少なければ vmpk を推奨して先頭に。
// 上限は 2 を選び、端末の上限までは選べる）。M1 で隠す物（プロファイル切替・持ち込み・動画の切替・絞り込み）は出さない。
// 純関数（DOM は screens/home.ts）。

import { LAYOUTS } from '../layout/presets.ts'
import {
  DEFAULT_CHORD_LIMIT,
  type Chart,
  type ChordLimit,
  type LayoutId,
  type Metrics,
  type Profile,
  type ResultRecord,
  type Variant,
} from '../shared/types.ts'
import { DENSITY_CAUTION, LEAP_CAUTION, variantMetrics } from '../chart/metrics.ts'
import { buildMsTable } from '../chart/mstable.ts'
import { bestOf, finishedSong } from '../results/best.ts'
import type { VariantSpec } from '../chart/variants.ts'

/** 注意の目安（§2.4、仮）。定義は chart/metrics.ts（S5 の注意と共有、M2-01） */
export { DENSITY_CAUTION, LEAP_CAUTION }

/** 上限 3〜4 の注記（m6 L771） */
export const LIMIT_NOTE = '保証なし: 和音で 3 キー目が無反応なら設定で上限を戻せます。'

const dropped = (v: Variant): number => v.keys.filter((k) => k === null).length

/** 譜面が持つ版（fold は octave だけ、§2.9 の同梱曲） */
function variantsOf(chart: Pick<Chart, 'variants'>): Variant[] {
  return (chart.variants ?? []).filter((v) => v.fold === 'octave')
}

export interface LimitChoice {
  readonly limit: ChordLimit
  /** 譜面がこの配列・上限の版を持つ */
  readonly available: boolean
  /** 端末の上限以下 */
  readonly allowed: boolean
}

export interface VersionChoice {
  /** 選べる配列（推奨が先頭） */
  readonly layouts: readonly LayoutId[]
  /** 推奨の配列（落ちる音で決めた。layouts の先頭） */
  readonly recommended: LayoutId
  /** 選んだ配列での上限の選択肢（2・3・4） */
  readonly limits: readonly LimitChoice[]
  /** 自動で選ぶ版（推奨の配列・上限 2。2 が無ければ選べる最小） */
  readonly pick: VariantSpec | null
}

/**
 * 端末に合う版（§7-10）。preferred は設定の配列、deviceLimit は端末の上限（未診断は null ＝ 既定 2）。layout を渡すと
 * その配列での上限の選択肢と版を返す（利用者が配列を選び直したとき）
 */
export function versionChoice(
  chart: Pick<Chart, 'variants'>,
  preferred: LayoutId,
  deviceLimit: ChordLimit | null,
  layout?: LayoutId,
): VersionChoice {
  const vs = variantsOf(chart)
  const have = [...new Set(vs.map((v) => v.layout))]
  const at2 = (l: LayoutId): Variant | undefined => vs.find((v) => v.layout === l && v.limit === DEFAULT_CHORD_LIMIT)
  let recommended: LayoutId = have.includes(preferred) ? preferred : (have[0] ?? preferred)
  // ableton 版に落ちる音があり、vmpk 版の方が少なければ vmpk を推奨（上限 2 の版で比べる）
  const a = at2('ableton')
  const m = at2('vmpk')
  if (a !== undefined && m !== undefined && dropped(m) < dropped(a)) recommended = 'vmpk'
  const layouts = [recommended, ...have.filter((l) => l !== recommended)]
  const use = layout !== undefined && layouts.includes(layout) ? layout : recommended
  const max = deviceLimit ?? DEFAULT_CHORD_LIMIT
  const limits: LimitChoice[] = ([2, 3, 4] as const).map((limit) => ({
    limit,
    available: vs.some((v) => v.layout === use && v.limit === limit),
    allowed: limit <= max,
  }))
  // 上限 2 から昇順で、選べて版のある最小（ふつうは 2）
  const first = limits.find((c) => c.available && c.allowed)
  return { layouts, recommended, limits, pick: first === undefined ? null : { layout: use, limit: first.limit, fold: 'octave' } }
} // prettier-ignore

/** 曲の長さ（最終ノートの終わり、秒） */
export function songSeconds(chart: Pick<Chart, 'notes' | 'pulse'>): number {
  const ms = buildMsTable(chart.pulse)
  return chart.notes.reduce((m, n) => Math.max(m, ms.beatToMs(n.beat + n.dur)), 0) / 1000
}

/** m:ss（秒を四捨五入） */
export function clockText(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const RIGHTS_TEXT: Readonly<Record<string, string>> = {
  pd: 'PD',
  own: '自作',
  cc0: 'CC0',
  'cc-by': 'CC BY',
  private: '持ち込み（private）',
}

export interface Axis {
  readonly label: string
  readonly text: string
  /** 棒の幅 0–100 */
  readonly pct: number
  /** 注意の目安を超えた（§2.4） */
  readonly caution: boolean
}

/** 難度 4 軸（版の metrics。棒は 密度 5 音/秒・跳躍 8・割合 100% を満とする、仮） */
export function axesOf(m: Metrics | undefined): Axis[] {
  const d = m?.density ?? 0
  const lx = m?.leapMax ?? 0
  const pct = (x: number, full: number): number => Math.round(Math.min(1, Math.max(0, x / full)) * 100)
  return [
    { label: '密度', text: `${d.toFixed(1)} 音/秒`, pct: pct(d, 5), caution: d > DENSITY_CAUTION },
    { label: '跳躍', text: `最大 ${lx}（平均 ${(m?.leap ?? 0).toFixed(1)}）`, pct: pct(lx, 8), caution: lx >= LEAP_CAUTION },
    { label: '同時押し', text: `${Math.round((m?.chord ?? 0) * 100)}%`, pct: pct(m?.chord ?? 0, 1), caution: false },
    { label: '段またぎ', text: `${Math.round((m?.rowCross ?? 0) * 100)}%`, pct: pct(m?.rowCross ?? 0, 1), caution: false },
  ]
} // prettier-ignore

export interface SongCard {
  readonly id: string
  readonly name: string
  readonly rights: string
  readonly bpm: string
  readonly length: string
  readonly seconds: number
  /** 選んだ版の密度（おすすめの並び） */
  readonly density: number
  readonly tutorial: boolean
  readonly finished: boolean
  readonly axes: readonly Axis[]
  readonly best: string
  /** 譜面版の一覧（m6 variantsText: Ableton×{2,3}・VMPK×{2,3}） */
  readonly variants: string
  readonly choice: VersionChoice
}

/** 譜面版の一覧の文字（m6 variantsText L606–609） */
export function variantsText(chart: Pick<Chart, 'variants'>): string {
  const by = new Map<LayoutId, number[]>()
  for (const v of variantsOf(chart)) by.set(v.layout, [...(by.get(v.layout) ?? []), v.limit])
  return [...by].map(([l, ls]) => `${l === 'ableton' ? 'Ableton' : l === 'vmpk' ? 'VMPK' : LAYOUTS[l].name}×{${[...ls].sort().join(',')}}`).join('・') || 'なし'
} // prettier-ignore

export interface CardContext {
  readonly preferred: LayoutId
  readonly deviceLimit: ChordLimit | null
  readonly profile: Profile
  readonly records: readonly ResultRecord[]
  readonly tutorialId: string
}

const PROFILE_NAMES: Readonly<Record<Profile, string>> = { beginner: '入門者', gamer: '音ゲー向け' }

export function songCard(id: string, chart: Chart, c: CardContext): SongCard {
  const choice = versionChoice(chart, c.preferred, c.deviceLimit)
  const pickId = choice.pick === null ? null : `${choice.pick.layout}/${choice.pick.limit}/${choice.pick.fold}`
  const v = (chart.variants ?? []).find((x) => x.id === pickId)
  // 版が難度を持たなければ（フィクスチャ・持ち込み曲）ここで計算する
  const metrics = v === undefined ? undefined : (v.metrics ?? variantMetrics(chart, v))
  const sec = songSeconds(chart)
  const tempo = chart.pulse.tempo
  const b = pickId === null ? null : bestOf(c.records, { chartId: chart.id, variantId: pickId, profile: c.profile, clock: 'novideo' })
  return {
    id,
    name: chart.name,
    rights: `出どころ ${RIGHTS_TEXT[chart.source.rights] ?? chart.source.rights}`,
    bpm: tempo.length === 1 ? `${tempo[0]?.bpm ?? '?'} BPM` : `${tempo[0]?.bpm ?? '?'} BPM〜`,
    length: clockText(sec),
    seconds: sec,
    density: metrics?.density ?? 0,
    tutorial: id === c.tutorialId,
    finished: finishedSong(c.records, chart.id, c.profile),
    axes: axesOf(metrics),
    best: b === null
      ? `自己ベスト —（${PROFILE_NAMES[c.profile]}）`
      : `自己ベスト ${(b.acc * 100).toFixed(1)}% ${b.rank}（${PROFILE_NAMES[c.profile]} ・ ${b.variantId}）`,
    variants: variantsText(chart),
    choice,
  }
} // prettier-ignore

export type SortKey = 'rec' | 'name' | 'len'
export const SORT_NAMES: Readonly<Record<SortKey, string>> = {
  rec: 'おすすめ（密度の低い順）',
  name: '曲名',
  len: '長さ',
}

/** 並べる（m6 visibleSongs: おすすめ ＝ 密度 → 長さ、曲名 ＝ 日本語の順、長さ ＝ 短い順。同じなら元の順） */
export function sortCards(cards: readonly SongCard[], key: SortKey): SongCard[] {
  const cmp: Record<SortKey, (a: SongCard, b: SongCard) => number> = {
    rec: (a, b) => a.density - b.density || a.seconds - b.seconds,
    name: (a, b) => a.name.localeCompare(b.name, 'ja'),
    len: (a, b) => a.seconds - b.seconds,
  }
  return [...cards].sort(cmp[key])
}

/** 版が無いときの文言（m6 L784–786） */
export function missingText(layout: LayoutId, limit: ChordLimit, tutorial: boolean): string {
  return `この曲は ${LAYOUTS[layout].name}／上限 ${limit} の版を持ちません${tutorial ? '（チュートリアル曲は Ableton 型／上限 2 だけ）' : ''}。`
}
