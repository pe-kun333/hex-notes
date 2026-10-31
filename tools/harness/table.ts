// 回帰ハーネスの表（M0-10、手順 13）。出どころ: design.md §5 M0-10（6 曲×2 プロファイル×2 配列の差分）、kickoff 手順 13
// （行 ＝ 曲×プロファイル×配列×SD の 72 行、列 ＝ chartId・variantId・profile・jitterSd・precision・rank・counts・selfRate・
// seed）、decisions #56（仮。列を足した: song・notes・skipped・holds・meanMs・ur・gamer）。
// 曲は tests/fixtures/charts/m1/ の 6 曲（play-dev と同じ順）、配列は play-dev と同じ ableton・vmpk の limit 2・octave。
// 純関数（ファイルの読み書きは run.ts）。

import { frameNotes } from '../../src/render/canvas/commands.ts'
import { buildKeyboardGrid } from '../../src/render/hex/grid.ts'
import { neighborOf, rulesOf } from '../../src/judge/judge.ts'
import { PROFILES } from '../../src/judge/windows.ts'
import type {
  Chart,
  JudgeCounts,
  LayoutId,
  Profile,
  Rank,
  SelfRate,
  Variant,
} from '../../src/shared/types.ts'
import { runAutoplay } from './autoplay.ts'
import { JITTER_SDS, JITTER_SEED, jitterZ } from './jitter.ts'

export const HARNESS_FORMAT = 'hexnote-harness/1' as const

/** 曲（tests/fixtures/charts/m1/<song>.hexnote.json。play-dev の SONGS の順） */
export const HARNESS_SONGS = ['twinkle', 'ode', 'scale', 'chroma', 'duet', 'canon'] as const
export const HARNESS_PROFILES: readonly Profile[] = ['beginner', 'gamer']
export const HARNESS_LAYOUTS: readonly LayoutId[] = ['ableton', 'vmpk']
/** 譜面版の鍵数制限と畳み方（play-dev と同じ） */
export const HARNESS_LIMIT = 2
export const HARNESS_FOLD = 'octave'

export interface HarnessRow {
  readonly song: string
  readonly chartId: string
  readonly variantId: string
  readonly profile: Profile
  readonly jitterSd: number
  readonly seed: number
  /** 判定する音の数（keys が null の音を除く） */
  readonly notes: number
  /** 精度 0–1（ResultRecord.acc と同じ。小数 6 桁） */
  readonly precision: number
  readonly rank: Rank
  readonly counts: JudgeCounts
  readonly selfRate: SelfRate
  readonly skipped: number
  readonly holds: { readonly ok: number; readonly early: number; readonly forced: number }
  /** 正しい鍵で当てた音の dt の平均（ms、小数 2 桁）。標本が無ければ null */
  readonly meanMs: number | null
  /** UR（小数 2 桁）。標本が 2 つ未満なら null */
  readonly ur: number | null
  /** 音ゲー向けだけ（入門者は null） */
  readonly gamer: {
    readonly points: number
    readonly gauge: number
    readonly fullCombo: boolean
    readonly cleared: boolean
    readonly failed: boolean
  } | null
}

export interface HarnessSong {
  readonly song: string
  readonly chart: Chart
}

const round = (x: number, digits: number): number => {
  const k = 10 ** digits
  return Math.round(x * k) / k
}
const roundOrNull = (x: number | null, digits: number): number | null =>
  x === null ? null : round(x, digits)

/** 譜面版を選ぶ（無ければ投げる） */
export function pickVariant(chart: Chart, layout: LayoutId): Variant {
  const v = (chart.variants ?? []).find(
    (x) => x.layout === layout && x.limit === HARNESS_LIMIT && x.fold === HARNESS_FOLD,
  )
  if (v === undefined)
    throw new Error(`harness: ${chart.name} に ${layout}/${HARNESS_LIMIT}/${HARNESS_FOLD} が無い`)
  return v
}

/** 1 行（1 曲・1 プロファイル・1 配列・1 SD を自動で通す） */
export function harnessRow(
  song: HarnessSong,
  layout: LayoutId,
  profile: Profile,
  jitterSd: number,
  seed: number = JITTER_SEED,
): HarnessRow {
  const variant = pickVariant(song.chart, layout)
  const notes = frameNotes(song.chart, variant)
  // 位置（行・列）だけを使う。大きさ R と原点は判定に効かない
  const grid = buildKeyboardGrid(layout, 1, { left: 0, top: 0 })
  const rules = rulesOf(PROFILES[profile], { neighbor: neighborOf(grid.byCode) })
  const z = jitterZ(song.chart.notes.length, seed)
  const run = runAutoplay(notes, rules, (index) => (z[index] ?? 0) * jitterSd)
  const s = run.summary
  return {
    song: song.song,
    chartId: song.chart.id,
    variantId: variant.id,
    profile,
    jitterSd,
    seed,
    notes: notes.length,
    precision: round(s.acc, 6),
    rank: s.rank,
    counts: { ...s.counts },
    selfRate: { ...s.selfRate },
    skipped: s.skipped,
    holds: { ...s.holds },
    meanMs: roundOrNull(s.meanMs, 2),
    ur: roundOrNull(s.ur, 2),
    gamer:
      s.gamer === null
        ? null
        : { ...s.gamer, points: round(s.gamer.points, 6), gauge: round(s.gamer.gauge, 6) },
  }
}

/**
 * 表（曲 × プロファイル × 配列 × SD の順）。曲 k の種は seed ＋ k（曲ごとに別の z の列。プロファイル・配列・SD を
 * 変えても同じ曲は同じ z）
 */
export function buildTable(
  songs: readonly HarnessSong[],
  opts: { readonly seed?: number; readonly sds?: readonly number[] } = {},
): HarnessRow[] {
  const seed = opts.seed ?? JITTER_SEED
  const sds = opts.sds ?? JITTER_SDS
  const rows: HarnessRow[] = []
  songs.forEach((song, k) => {
    for (const profile of HARNESS_PROFILES)
      for (const layout of HARNESS_LAYOUTS)
        for (const sd of sds) rows.push(harnessRow(song, layout, profile, sd, seed + k))
  })
  return rows
}

/** 行の鍵（差分で行を突き合わせる。曲・譜面版・プロファイル・SD） */
export function rowKey(r: Pick<HarnessRow, 'song' | 'variantId' | 'profile' | 'jitterSd'>): string {
  return `${r.song} ${r.variantId} ${r.profile} sd${r.jitterSd}`
}

/** 書き出す文字列（JSON として読める。行は 1 行に 1 つ） */
export function tableText(rows: readonly HarnessRow[]): string {
  const head = `{"format":${JSON.stringify(HARNESS_FORMAT)},"rows":[`
  return `${head}\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`
}

/** tableText の逆。形が違えば投げる */
export function parseTable(text: string): HarnessRow[] {
  const o: unknown = JSON.parse(text)
  if (
    typeof o !== 'object' ||
    o === null ||
    (o as { format?: unknown }).format !== HARNESS_FORMAT ||
    !Array.isArray((o as { rows?: unknown }).rows)
  )
    throw new Error(`harness: ${HARNESS_FORMAT} の表でない`)
  return (o as { rows: HarnessRow[] }).rows
}
