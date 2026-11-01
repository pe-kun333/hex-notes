// *.hexnote.json の書き出しと取り込み（M0-09、手順 11）。出どころ: design.md §4.3（ファイル *.hexnote.json の書き出し／取り込み、
// Safari ITP の 7 日消去に備え書き出しを勧める）・§1.3 S5（保存に失敗したら書き出しを即座に出す）・S6（データの書き出し／
// 取り込み）、m5 download L435（ファイル名: 曲名の禁止文字を _ に、.配列.折り畳み.L上限.hexnote.json）、decisions #53（仮）。
// 2 種類: 譜面 1 曲（format hexnote-chart/1 の Chart そのもの。m5 が出す物と同じ形）と、控え（format hexnote-backup/1:
// 設定・足場外し・持ち込み曲・記録）。端末に属する物（hexnote.device・hexnote.calibration）と計測（手順 12 の書き出し）は
// 控えに入れない。純関数（DOM のダウンロード・ファイル選択は src/app/file-io.ts）。

import { computeChartId } from '../chart/hash.ts'
import { normalizeChart, validateChart } from '../chart/validate.ts'
import type { FadeState } from '../judge/self-rate.ts'
import { OFFSET_LIMIT_MS } from '../judge/calibration-offset.ts'
import {
  CHART_FORMAT,
  type Chart,
  type ClockKind,
  type JudgeCounts,
  type PlayMode,
  type Profile,
  type Rank,
  type ResultRecord,
  type SelfRate,
  type SyncUsed,
  type Variant,
} from '../shared/types.ts'
import { parseFade, parseSettings, PROFILES, type Settings } from './local.ts'

export const BACKUP_FORMAT = 'hexnote-backup/1' as const
export const FILE_SUFFIX = '.hexnote.json'
/** 取り込む文字数の上限（巨大なファイルで主スレッドを止めない。仮） */
export const MAX_IMPORT_CHARS = 10 * 1024 * 1024

export interface Backup {
  readonly format: typeof BACKUP_FORMAT
  readonly exportedAt: string
  readonly settings: Settings
  readonly fade: FadeState
  readonly charts: readonly Chart[]
  readonly results: readonly ResultRecord[]
}

// ---------- 書き出し ----------

/** 譜面 1 曲の中身（整形しない 1 行の JSON） */
export function chartFileText(chart: Chart): string {
  return JSON.stringify(chart) + '\n'
}

/** ファイル名に使えない文字（m5 L435 の [\\/:*?"<>|] に制御文字を足した）を _ に */
export function safeFileStem(name: string, fallback = 'chart'): string {
  const s = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return s === '' ? fallback : s
}

/** 譜面のファイル名（m5 L435）。譜面版を渡せば .配列.折り畳み.L上限 を付ける */
export function chartFileName(
  chart: Pick<Chart, 'name'>,
  variant?: Pick<Variant, 'layout' | 'fold' | 'limit'>,
): string {
  const stem = safeFileStem(chart.name)
  const v = variant === undefined ? '' : `.${variant.layout}.${variant.fold}.L${variant.limit}`
  return stem + v + FILE_SUFFIX
}

export function makeBackup(
  parts: Omit<Backup, 'format' | 'exportedAt'>,
  exportedAt: string,
): Backup {
  return { format: BACKUP_FORMAT, exportedAt, ...parts }
}

export function backupFileText(b: Backup): string {
  return JSON.stringify(b) + '\n'
}

/** 控えのファイル名（exportedAt の日付。hexnote-backup-2026-10-31.hexnote.json） */
export function backupFileName(exportedAt: string): string {
  return `hexnote-backup-${exportedAt.slice(0, 10)}${FILE_SUFFIX}`
}

// ---------- 取り込み ----------

export type ImportResult =
  | {
      readonly kind: 'chart'
      readonly chart: Chart
      /** id が中身と合わなかったので付け直した（手で直したファイルなど） */
      readonly idChanged: boolean
    }
  | {
      readonly kind: 'backup'
      readonly backup: Backup
      /** 検査を通らず捨てた件数 */
      readonly dropped: { readonly charts: number; readonly results: number }
      /** id を付け直した曲の数（その曲の記録の chartId も付け直す） */
      readonly idChanged: number
    }
  | {
      readonly kind: 'error'
      readonly reason: 'too_large' | 'json' | 'format' | 'chart'
      readonly issues: readonly string[]
    }

/**
 * variants があるのに notes が beat 昇順・同拍 midi 昇順でないか。normalizeChart は notes だけを並べ替え、keys（notes の
 * 添字で引く）は並べ替えないので、取り込むと鍵がずれる。そういうファイルは断る
 */
function unsortedWithVariants(raw: unknown): boolean {
  if (!isRec(raw) || !Array.isArray(raw['variants']) || raw['variants'].length === 0) return false
  const notes = raw['notes']
  if (!Array.isArray(notes)) return false
  for (let i = 1; i < notes.length; i++) {
    const a: unknown = notes[i - 1]
    const b: unknown = notes[i]
    if (!isRec(a) || !isRec(b) || !isNum(a['beat']) || !isNum(b['beat'])) return false
    if (!isNum(a['midi']) || !isNum(b['midi'])) return false
    if (a['beat'] > b['beat'] || (a['beat'] === b['beat'] && a['midi'] > b['midi'])) return true
  }
  return false
}

/** 譜面 1 曲を検査し、id を中身から計算し直す（normalizeChart → validateChart → computeChartId） */
export async function importChart(
  raw: unknown,
): Promise<{ ok: true; chart: Chart; idChanged: boolean } | { ok: false; issues: string[] }> {
  if (unsortedWithVariants(raw))
    return {
      ok: false,
      issues: [
        'notes: variants があるのに beat 昇順・同拍 midi 昇順でない（並べ直すと keys とずれる）',
      ],
    }
  const v = validateChart(normalizeChart(raw))
  if (!v.ok)
    return { ok: false, issues: v.issues.map((i) => `${i.path || '(全体)'}: ${i.message}`) }
  const id = await computeChartId(v.chart)
  if (id === v.chart.id) return { ok: true, chart: v.chart, idChanged: false }
  return { ok: true, chart: { ...v.chart, id }, idChanged: true }
}

/** ファイルの中身を読む。format で譜面か控えかを分ける */
export async function importText(text: string): Promise<ImportResult> {
  if (text.length > MAX_IMPORT_CHARS)
    return { kind: 'error', reason: 'too_large', issues: [`${MAX_IMPORT_CHARS} 文字を超える`] }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch (e) {
    return { kind: 'error', reason: 'json', issues: [e instanceof Error ? e.message : String(e)] }
  }
  const format = isRec(raw) ? raw['format'] : undefined
  if (format === CHART_FORMAT) {
    const r = await importChart(raw)
    return r.ok
      ? { kind: 'chart', chart: r.chart, idChanged: r.idChanged }
      : { kind: 'error', reason: 'chart', issues: r.issues }
  }
  if (format === BACKUP_FORMAT && isRec(raw)) return importBackup(raw)
  return {
    kind: 'error',
    reason: 'format',
    issues: [
      `format が ${CHART_FORMAT} でも ${BACKUP_FORMAT} でもない（${JSON.stringify(format)}）`,
    ],
  }
}

async function importBackup(raw: Rec): Promise<ImportResult> {
  const charts: Chart[] = []
  const renamed = new Map<string, string>()
  let droppedCharts = 0
  for (const c of Array.isArray(raw['charts']) ? raw['charts'] : []) {
    const r = await importChart(c)
    if (!r.ok) {
      droppedCharts++
      continue
    }
    if (r.idChanged && isRec(c) && typeof c['id'] === 'string') renamed.set(c['id'], r.chart.id)
    charts.push(r.chart)
  }
  const results: ResultRecord[] = []
  let droppedResults = 0
  for (const x of Array.isArray(raw['results']) ? raw['results'] : []) {
    const r = parseResult(x)
    if (r === null) droppedResults++
    else results.push({ ...r, chartId: renamed.get(r.chartId) ?? r.chartId })
  }
  const at = raw['exportedAt']
  return {
    kind: 'backup',
    backup: {
      format: BACKUP_FORMAT,
      exportedAt: typeof at === 'string' ? at : '',
      settings: parseSettings(raw['settings']),
      fade: parseFade(raw['fade']),
      charts,
      results,
    },
    dropped: { charts: droppedCharts, results: droppedResults },
    idChanged: renamed.size,
  }
}

// ---------- 記録の検査 ----------

type Rec = Record<string, unknown>
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string' && x !== ''
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T =>
  typeof x === 'string' && (list as readonly string[]).includes(x)

const CLOCKS: readonly ClockKind[] = ['video', 'novideo']
const MODES: readonly PlayMode[] = ['fixed', 'note', 'phrase']
const RANKS: readonly Rank[] = ['SS', 'S', 'A', 'B', 'C']
const COUNT_KEYS: readonly (keyof JudgeCounts)[] = ['perfect', 'great', 'good', 'near', 'miss']
const SELF_KEYS: readonly (keyof SelfRate)[] = ['solo', 'hinted', 'near', 'miss']

function counts<K extends string>(x: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!isRec(x)) return null
  const out = {} as Record<K, number>
  for (const k of keys) {
    const v = x[k]
    if (!isCount(v)) return null
    out[k] = v
  }
  return out
}

function syncUsed(x: unknown): SyncUsed | null {
  if (!isRec(x) || (x['kind'] !== 'audio' && x['kind'] !== 'youtube')) return null
  const out: SyncUsed = { kind: x['kind'] }
  if (x['videoId'] !== undefined) {
    if (typeof x['videoId'] !== 'string') return null
    out.videoId = x['videoId']
  }
  if (x['fallbackAt'] !== undefined) {
    if (!isNum(x['fallbackAt']) || x['fallbackAt'] < 0) return null
    out.fallbackAt = x['fallbackAt']
  }
  return out
}

/** 記録 1 件（§4.3 results）を検査する。悪ければ null。知らない項目は捨てる */
export function parseResult(x: unknown): ResultRecord | null {
  if (!isRec(x)) return null
  const { id, chartId, variantId, profile, clock, mode, rate, keyset, at, acc, rank, offsetUsed } =
    x
  if (!isStr(id) || !isStr(chartId) || !isStr(variantId) || !isStr(keyset)) return null
  if (!oneOf<Profile>(PROFILES, profile) || !oneOf(CLOCKS, clock) || !oneOf(MODES, mode))
    return null
  if (!oneOf(RANKS, rank)) return null
  if (!isNum(rate) || rate <= 0) return null
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null
  if (!isNum(acc) || acc < 0 || acc > 1) return null
  if (!isNum(offsetUsed) || Math.abs(offsetUsed) > OFFSET_LIMIT_MS) return null
  // skipped（decisions #63）が無い旧い記録（M0 の開発ページの控え）は 0 と読む。あって数でなければ壊れた記録
  const skipped = x['skipped'] === undefined ? 0 : x['skipped']
  if (!isCount(skipped)) return null
  // looped（M2-03）は無ければ偽。あって真偽値でなければ壊れた記録
  const looped = x['looped']
  if (looped !== undefined && typeof looped !== 'boolean') return null
  // aborted（M2-05）も無ければ偽
  const aborted = x['aborted']
  if (aborted !== undefined && typeof aborted !== 'boolean') return null
  const c = counts(x['counts'], COUNT_KEYS)
  const s = counts(x['selfRate'], SELF_KEYS)
  const u = syncUsed(x['syncUsed'])
  if (c === null || s === null || u === null) return null
  return {
    id,
    chartId,
    variantId,
    profile,
    clock,
    mode,
    rate,
    keyset,
    at,
    acc,
    rank,
    counts: c,
    selfRate: s,
    syncUsed: u,
    offsetUsed,
    skipped,
    ...(looped === true ? { looped: true } : {}),
    ...(aborted === true ? { aborted: true } : {}),
  }
}
