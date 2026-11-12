// 回帰ハーネスの表（M0-10、手順 13）。出どころ: design.md §5 M0-10（6 曲×2 プロファイル×2 配列の差分）、kickoff 手順 13
// （行 ＝ 曲×プロファイル×配列×SD の 72 行、列 ＝ chartId・variantId・profile・jitterSd・precision・rank・counts・selfRate・
// seed）、decisions #56（仮。列を足した: song・notes・skipped・holds・meanMs・ur・gamer）。
// 曲は tests/fixtures/charts/m1/ の 6 曲（play-dev と同じ順）、配列は play-dev と同じ ableton・vmpk の limit 2・octave。
// M2 の手順 5（m2-kickoff §7-21、decisions #56 (d)）: 練習の表（buildPracticeTable。テンポ段 0.75・SD 0 と、隣の鍵 12%）を
// tests/harness/expected/m2-03.json に分ける。M0 の表（m0-10.json）は変えない（rate・wrongRate は既定なら行に書かない）。
// M3 の手順 6（m3-kickoff §7-30、仮）: 動画ありの表（buildVideoTable。6 曲 × 2 プロファイル × 2 筋書き〔飛び ＋300・凍結 → S7c〕、
// ableton、筋書きはフレーム 120）を tests/harness/expected/m3-04.json に。列は入れ子の video（数・文字列・null だけ。diff.ts は
// 配列を === で比べる）で、行の鍵に筋書きを足す。広告の 2 筋書きは単体の試験だけ（表に載せない）。
// 純関数（ファイルの読み書きは run.ts）。

import { frameNotes } from '../../src/render/canvas/commands.ts'
import { buildKeyboardGrid } from '../../src/render/hex/grid.ts'
import { neighborOf, rulesOf } from '../../src/judge/judge.ts'
import { PROFILES } from '../../src/judge/windows.ts'
import { hexDist } from '../../src/render/hex/hex.ts'
import { mulberry32 } from '../../src/shared/random.ts'
import type {
  Chart,
  JudgeCounts,
  KeyCode,
  LayoutId,
  Profile,
  Rank,
  SelfRate,
  Variant,
} from '../../src/shared/types.ts'
import { runAutoplay } from './autoplay.ts'
import { VIDEO_AXIS, VIDEO_DUMMY, runAutoplayVideo, type VideoScenario } from './autoplay-video.ts'
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
  /** テンポ段（練習の表だけ。無ければ 1） */
  readonly rate?: number
  /** 鍵違いの割合（練習の表だけ。無ければ 0） */
  readonly wrongRate?: number
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
  /** 動画ありの表だけ（M3 の手順 6） */
  readonly video?: HarnessVideo
}

/** 動画ありの列（値は数・文字列・null だけ） */
export interface HarnessVideo {
  readonly scenario: VideoScenario
  /** 終わりの源 */
  readonly source: 'video' | 'novideo'
  /** 再アンカーの理由（出た順に「,」でつなぐ） */
  readonly resync: string
  /** 動画なしへ切り替えた時刻（開始からの ms、小数 2 桁）。無ければ null */
  readonly novideoT: number | null
  /** 筋書きの再アンカーの時点で残る最初の音の着地 − 再アンカー（ms、小数 2 桁）。開始以外の再アンカーが無ければ null */
  readonly firstLandMs: number | null
  /** 動画への要求の数 */
  readonly requests: number
  /** 回したフレームの数 */
  readonly frames: number
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

/** 練習の条件（テンポ段と鍵違い。既定 rate 1・wrongRate 0） */
export interface PracticeCondition {
  readonly rate?: number
  readonly wrongRate?: number
}

/** 鍵違いの割合（m4 autoWrong L377 の 12%） */
export const WRONG_RATE = 0.12

/**
 * 音ごとの押す鍵: 種 seed の一様乱数が rate 未満の音は、その鍵の隣（六角距離 1）の鍵を 1 つ（隣の鍵の名前の順に 2 つ目の
 * 乱数で選ぶ）。他は null（正しい鍵）。添字は譜面の notes の添字（配列が違っても同じ音は同じ乱数）
 */
export function wrongKeys(
  count: number,
  codeOf: (index: number) => KeyCode | undefined,
  byCode: ReadonlyMap<KeyCode, { row: number; col: number }>,
  rate: number,
  seed: number,
): (KeyCode | null)[] {
  const rng = mulberry32(seed)
  return Array.from({ length: count }, (_, i) => {
    const u = rng()
    const v = rng()
    const code = codeOf(i)
    const p = code === undefined ? undefined : byCode.get(code)
    if (u >= rate || p === undefined) return null
    const near = [...byCode].filter(([, q]) => hexDist(p, q) === 1).map(([c]) => c).sort()
    return near[Math.floor(v * near.length)] ?? null
  })
} // prettier-ignore

/** 1 行（1 曲・1 プロファイル・1 配列・1 SD を自動で通す。cond は練習の表のテンポ段と鍵違い） */
export function harnessRow(
  song: HarnessSong,
  layout: LayoutId,
  profile: Profile,
  jitterSd: number,
  seed: number = JITTER_SEED,
  cond: PracticeCondition = {},
): HarnessRow {
  const variant = pickVariant(song.chart, layout)
  const notes = frameNotes(song.chart, variant)
  // 位置（行・列）だけを使う。大きさ R と原点は判定に効かない
  const grid = buildKeyboardGrid(layout, 1, { left: 0, top: 0 })
  const rules = rulesOf(PROFILES[profile], { neighbor: neighborOf(grid.byCode) })
  const z = jitterZ(song.chart.notes.length, seed)
  const rate = cond.rate ?? 1
  const wrongRate = cond.wrongRate ?? 0
  const codes = new Map(notes.map((n) => [n.index, n.code]))
  const wrong =
    wrongRate > 0
      ? wrongKeys(song.chart.notes.length, (i) => codes.get(i), grid.byCode, wrongRate, seed)
      : []
  const run = runAutoplay(notes, rules, (index) => (z[index] ?? 0) * jitterSd, {
    rate,
    keyOf: (i) => wrong[i] ?? null,
  })
  const s = run.summary
  return {
    song: song.song,
    chartId: song.chart.id,
    variantId: variant.id,
    profile,
    jitterSd,
    ...(rate === 1 ? {} : { rate }),
    ...(wrongRate === 0 ? {} : { wrongRate }),
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

/** 練習の表の条件（m2-kickoff §7-21・手順 5 の期待値: rate 0.75・SD 0 で精度 100%、隣の鍵 12% で near と miss が出る） */
export const PRACTICE_CONDITIONS: readonly (PracticeCondition & { readonly jitterSd: number })[] = [
  { rate: 0.75, jitterSd: 0 },
  { wrongRate: WRONG_RATE, jitterSd: 0 },
]

/** 練習の表（曲 × プロファイル × 配列 × 条件の順。種は buildTable と同じ） */
export function buildPracticeTable(
  songs: readonly HarnessSong[],
  opts: { readonly seed?: number } = {},
): HarnessRow[] {
  const seed = opts.seed ?? JITTER_SEED
  const rows: HarnessRow[] = []
  songs.forEach((song, k) => {
    for (const profile of HARNESS_PROFILES)
      for (const layout of HARNESS_LAYOUTS)
        for (const c of PRACTICE_CONDITIONS) rows.push(harnessRow(song, layout, profile, c.jitterSd, seed + k, c))
  })
  return rows
} // prettier-ignore

/** 動画ありの表の筋書き（m3-kickoff §7-30。広告の 2 筋書きは単体の試験だけ） */
export const VIDEO_TABLE_SCENARIOS: readonly VideoScenario[] = ['jump', 'freeze']
/** 筋書きを起こすフレーム（開始から 2,000 ms） */
export const VIDEO_TABLE_FRAME = 120
/** 動画ありの表の配列 */
export const VIDEO_TABLE_LAYOUT: LayoutId = 'ableton'

/** 動画ありの 1 行（揺れ 0。seed はダミー動画の種） */
export function harnessVideoRow(song: HarnessSong, profile: Profile, scenario: VideoScenario): HarnessRow {
  const variant = pickVariant(song.chart, VIDEO_TABLE_LAYOUT)
  const notes = frameNotes(song.chart, variant)
  const grid = buildKeyboardGrid(VIDEO_TABLE_LAYOUT, 1, { left: 0, top: 0 })
  const rules = rulesOf(PROFILES[profile], { neighbor: neighborOf(grid.byCode), axis: VIDEO_AXIS })
  const run = runAutoplayVideo(notes, rules, { scenario, atFrame: VIDEO_TABLE_FRAME })
  const s = run.summary
  const novideo = run.events.find((e) => e.kind === 'novideo')
  const first = run.firstLand[0]
  return {
    song: song.song,
    chartId: song.chart.id,
    variantId: variant.id,
    profile,
    jitterSd: 0,
    seed: VIDEO_DUMMY.seed ?? 7,
    notes: notes.length,
    precision: round(s.acc, 6),
    rank: s.rank,
    counts: { ...s.counts },
    selfRate: { ...s.selfRate },
    skipped: s.skipped,
    holds: { ...s.holds },
    meanMs: roundOrNull(s.meanMs, 2),
    ur: roundOrNull(s.ur, 2),
    gamer: s.gamer === null ? null : { ...s.gamer, points: round(s.gamer.points, 6), gauge: round(s.gamer.gauge, 6) },
    video: {
      scenario,
      source: run.source,
      resync: run.events.filter((e) => e.kind === 'resync').map((e) => e.reason).join(','),
      novideoT: novideo === undefined ? null : novideo.at,
      firstLandMs: first === undefined || first === null ? null : round(first, 2),
      requests: run.requests.length,
      frames: run.frames,
    },
  }
} // prettier-ignore

/** 動画ありの表（曲 × プロファイル × 筋書きの順） */
export function buildVideoTable(songs: readonly HarnessSong[]): HarnessRow[] {
  const rows: HarnessRow[] = []
  for (const song of songs)
    for (const profile of HARNESS_PROFILES)
      for (const sc of VIDEO_TABLE_SCENARIOS) rows.push(harnessVideoRow(song, profile, sc))
  return rows
}

/** 行の鍵（差分で行を突き合わせる。曲・譜面版・プロファイル・SD、練習の表はテンポ段と鍵違い、動画ありの表は筋書きも） */
export function rowKey(
  r: Pick<
    HarnessRow,
    'song' | 'variantId' | 'profile' | 'jitterSd' | 'rate' | 'wrongRate' | 'video'
  >,
): string {
  const rate = r.rate === undefined ? '' : ` r${r.rate}`
  const wrong = r.wrongRate === undefined ? '' : ` w${r.wrongRate}`
  const video = r.video === undefined ? '' : ` v${r.video.scenario}`
  return `${r.song} ${r.variantId} ${r.profile} sd${r.jitterSd}${rate}${wrong}${video}`
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
