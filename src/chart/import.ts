// SMF → 譜面の取り込み（M2-01 前半、M2 の手順 1）。同梱曲の道具 tools/charts/bundle.ts と S5（手順 2）が同じ関数を通る。
// 出どころ: m2-kickoff 手順 1・§7-5（運指の警告）・§7-6（持ち込み曲の版）・§7-17（トラックの既定）、design.md §1.3 S5・§2.4・
// §3.2・§3.3、decisions #20〜#23・#47 (a)・#53 (c)・#59・#69 (b)、m5 parseMidi のトラックの既定 L376–378・buildVariant
// L324–345・運指の警告 L351–357、M1 の tools/charts/bundle.ts（tidy・partsOf・bundledChart をここへ移した）。
// 順は「正規化 → 版の生成 → 検査」（normalizeChart は variants[].keys を並べ替えないので、版より先に掛ける。#53 (c)）。
// 名前は storage/file.ts の importChart（譜面ファイルの取り込み）と分けて chartFromSmf。
// 純関数（DOM・ファイルに触れない。tools/ からも import する）。

import { computeChartId } from './hash.ts'
import { DENSITY_CAUTION, LEAP_CAUTION, variantMetrics } from './metrics.ts'
import type { MsTable } from './mstable.ts'
import type { Smf } from './smf.ts'
import { normalizeChart, validateChart } from './validate.ts'
import {
  BUNDLED_VARIANT_SPECS,
  buildVariant,
  buildVariants,
  foldedChords,
  variantId,
  type VariantSpec,
} from './variants.ts'
import { qwertyLabel } from '../layout/legend.ts'
import { keyPosition } from '../layout/presets.ts'
import { hexDist } from '../render/hex/hex.ts'
import type {
  Chart,
  FoldId,
  KeyCode,
  Metrics,
  Note,
  Pulse,
  Source,
  Variant,
} from '../shared/types.ts'
import { CHART_FORMAT, DEFAULT_RESOLUTION } from '../shared/types.ts'

/** chartFromSmf が書く generator */
export const IMPORT_GENERATOR = 'hexnote import (M2-01)'

/** 譜面の素（版と id の前） */
export interface ChartParts {
  readonly notes: Note[]
  readonly accompaniment: Note[]
  readonly pulse: Pulse
  /** 弾くトラックで、拍の 1/resolution に丸めて同拍同音に潰れた音の数（S5 で知らせる、仮） */
  readonly collapsed: number
}

/** 拍の 1/resolution に丸め、beat 昇順・同拍は midi 昇順、同拍同音は 1 つに（長い方。同じ長さなら先の音） */
export function tidyNotes(
  notes: readonly Note[],
  resolution: number,
): { notes: Note[]; collapsed: number } {
  const q = (b: number): number => Math.round(b * resolution) / resolution
  const byKey = new Map<string, Note>()
  for (const n of notes) {
    const m: Note = { ...n, beat: q(n.beat), dur: Math.max(1 / resolution, q(n.dur)) }
    const k = `${m.beat}:${m.midi}`
    const cur = byKey.get(k)
    if (cur === undefined || m.dur > cur.dur) byKey.set(k, m)
  }
  const out = [...byKey.values()].sort((a, b) => a.beat - b.beat || a.midi - b.midi)
  return { notes: out, collapsed: notes.length - out.length }
}

/**
 * SMF の弾くトラック 1 つと伴奏トラック（tracks の添字）→ 正規化した notes・accompaniment・pulse（resolution 240）。
 * 伴奏は原曲音高のまま（#47 (a)）。無いトラック・弾くトラックを伴奏に選ぶと RangeError
 */
export function smfParts(smf: Smf, play: number, accomp: readonly number[] = []): ChartParts {
  const track = smf.tracks[play]
  if (track === undefined)
    throw new RangeError(`smfParts: 弾くトラック ${play} が無い（${smf.tracks.length} 本）`)
  const pulse: Pulse = {
    resolution: DEFAULT_RESOLUTION,
    tempo: smf.tempo.map((t) => ({ ...t })),
    ...(smf.timeSig.length > 0 ? { timeSig: smf.timeSig.map((t) => ({ ...t })) } : {}),
  }
  const acc = accomp.flatMap((i) => {
    const t = smf.tracks[i]
    if (t === undefined || i === play)
      throw new RangeError(`smfParts: 伴奏トラック ${i} が無いか弾くトラックと同じ`)
    return t.notes
  })
  const melody = tidyNotes(track.notes, pulse.resolution)
  const draft = {
    notes: melody.notes,
    accompaniment: tidyNotes(acc, pulse.resolution).notes,
    pulse,
  }
  // tidy の後なので並びと丸めは変わらない。vel の既定などの寛容な直しを、版を作る前に掛けておく（#53 (c)）
  const n = normalizeChart(draft) as typeof draft
  return { ...n, collapsed: melody.collapsed }
}

/** 持ち込み曲の版（§7-6、仮）: 同梱曲と同じ配列と上限（ableton×{2,3}・vmpk×{2,3}）、fold は S5 の段 3 の選択 */
export function importSpecs(fold: FoldId): VariantSpec[] {
  return BUNDLED_VARIANT_SPECS.map((s) => ({ ...s, fold }))
}

/**
 * 譜面を組む（版・難度 4 軸・id を付けて検査する）。同梱曲（bundle.ts）と持ち込み（chartFromSmf）の共通の口。
 * 書くキーの順は M1 の bundledChart のまま（同梱曲のファイルが 1 バイトも変わらないように）。検査を通らなければ Error
 */
export async function assembleChart(a: {
  readonly name: string
  readonly parts: Pick<ChartParts, 'notes' | 'accompaniment' | 'pulse'>
  readonly source: Source
  readonly specs: readonly VariantSpec[]
  readonly generator: string
  readonly created?: string
  /** Error の文の頭 */
  readonly where: string
}): Promise<Chart> {
  const p = a.parts
  const beats = p.notes.reduce((m, n) => Math.max(m, n.beat + n.dur), 0)
  const first = p.pulse.tempo[0]
  const chart: Chart = {
    format: CHART_FORMAT,
    id: '',
    name: a.name,
    ...(first !== undefined && p.pulse.tempo.length === 1 ? { bpm: first.bpm } : {}),
    beats,
    notes: p.notes,
    pulse: p.pulse,
    sync: { sources: [] },
    source: { ...a.source },
    ...(p.accompaniment.length > 0 ? { accompaniment: p.accompaniment } : {}),
    variants: [],
    ...(a.created !== undefined ? { created: a.created } : {}),
    generator: a.generator,
  }
  chart.variants = buildVariants(chart, a.specs).map((v) => ({
    ...v,
    metrics: variantMetrics(chart, v),
  }))
  chart.id = await computeChartId(chart)
  const r = validateChart(chart)
  if (!r.ok)
    throw new Error(`${a.where}: ${r.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`)
  return chart
}

/**
 * トラックの既定（§7-17、仮）: 弾く ＝ ドラム以外で音数が最大のトラック（同数なら先。m5 L376–378）、伴奏 ＝ 残り全部で
 * ドラムを除く（§1.3 S5）。全部ドラムなら弾くは 0（m5 と同じ）
 */
export function trackDefaults(smf: Pick<Smf, 'tracks'>): { play: number; accomp: number[] } {
  let play = 0
  let most = -1
  smf.tracks.forEach((t, i) => {
    if (!t.drum && t.notes.length > most) {
      most = t.notes.length
      play = i
    }
  })
  return { play, accomp: defaultAccomp(smf, play) }
}

/** 弾くトラックを選び直したときの伴奏の既定: 弾くトラック以外の全部でドラムを除く（§1.3 S5） */
export function defaultAccomp(smf: Pick<Smf, 'tracks'>, play: number): number[] {
  return smf.tracks.flatMap((t, i) => (i === play || t.drum ? [] : [i]))
}

export interface ChartFromSmf {
  readonly smf: Smf
  readonly play: number
  readonly accomp?: readonly number[]
  readonly fold: FoldId
  /** 曲名（既定はファイル名から。呼ぶ側が決める） */
  readonly name: string
  readonly composer?: string
  /** ISO 8601（呼ぶ側が now から作る。無ければ書かない） */
  readonly created?: string
}

/**
 * 持ち込みの譜面（S5 の保存・CLI charts:smf）。source は midi・private（#18）、版は importSpecs(fold) の 4 版、
 * sync は空（動画 ID は M3-03、#79）。id は旋律とテンポだけで決まり、曲名・作者・伴奏を変えても同じ（§3.3）
 */
export async function chartFromSmf(o: ChartFromSmf): Promise<Chart> {
  const name = o.name.trim()
  const composer = o.composer?.trim()
  return assembleChart({
    name,
    parts: smfParts(o.smf, o.play, o.accomp),
    source: {
      kind: 'midi',
      rights: 'private',
      title: name,
      ...(composer ? { composer } : {}),
    },
    specs: importSpecs(o.fold),
    generator: IMPORT_GENERATOR,
    ...(o.created !== undefined ? { created: o.created } : {}),
    where: `chartFromSmf(${name})`,
  })
}

export interface FoldPreviewRow {
  readonly id: string
  readonly srcNotes: number
  readonly droppedFold: number
  readonly movedFold: number
  readonly droppedThin: number
  /** 残る音（鍵のある音） */
  readonly kept: number
}

/** S5 の段 3 の「失われる音」: fold での 4 版ごとの数と、1/240 に丸めて潰れた音の数 */
export function foldPreview(
  parts: Pick<ChartParts, 'notes' | 'pulse' | 'collapsed'>,
  fold: FoldId,
): { rows: FoldPreviewRow[]; collapsed: number } {
  const rows = importSpecs(fold).map((spec) => {
    const v = buildVariant(parts, spec)
    const s = v.stats ?? {}
    return {
      id: variantId(spec),
      srcNotes: s['srcNotes'] ?? 0,
      droppedFold: s['droppedFold'] ?? 0,
      movedFold: s['movedFold'] ?? 0,
      droppedThin: s['droppedThin'] ?? 0,
      kept: v.keys.filter((k) => k !== null).length,
    }
  })
  return { rows, collapsed: parts.collapsed }
}

// ---------- 運指の警告（§7-5、仮。m5 L351–357 の 2 規則） ----------

/** 速い横移動の閾（自作値、§7-19） */
export const FAST_MOVE_DIST = 4
export const FAST_MOVE_MS = 250

/** 段の名前（m5 ROW_NAMES） */
const ROW_NAMES = ['数字段', 'Q 段', 'A 段', 'Z 段']

export interface FingeringWarning {
  /** fast ＝ 速い横移動、rect ＝ 矩形 4 隅の同時押し */
  readonly kind: 'fast' | 'rect'
  readonly beat: number
  readonly text: string
}

/** 拍の表示（m5 fmtBeat L364: 小数 2 桁） */
const fmtBeat = (b: number): string => String(Math.round(b * 100) / 100)

/**
 * 同時押しの鍵が矩形 4 隅になる段の組（2 つの段が列を 2 つ以上共有）。4 音未満は見ない。
 * 段は昇順、列は先の段に出た順（m5 L356 と同じ）
 */
export function rectCorners(
  keys: readonly KeyCode[],
): { rows: [number, number]; cols: number[] }[] {
  if (keys.length < 4) return []
  const rows = new Map<number, Set<number>>()
  for (const k of keys) {
    const p = keyPosition(k)
    if (p !== null) rows.set(p.row, (rows.get(p.row) ?? new Set<number>()).add(p.col))
  }
  const rs = [...rows.keys()].sort((a, b) => a - b)
  const out: { rows: [number, number]; cols: number[] }[] = []
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i] as number
      const b = rs[j] as number
      const cols = [...(rows.get(a) ?? [])].filter((c) => rows.get(b)?.has(c))
      if (cols.length >= 2) out.push({ rows: [a, b], cols })
    }
  return out
}

/**
 * 運指の警告（拍の順。同じ拍では速い横移動が先）。
 * 速い横移動 ＝ 版の鍵で、隣り合う tick の塊どうしの最も近い組（m5 L352 の bp）が同じ段で六角距離 ≥ 4、間が 250 ms 未満。
 * 矩形 4 隅 ＝ 折り畳み後・間引き前の塊（foldedChords）で、4 音以上の塊の 2 つの段が列を 2 つ以上共有
 */
export function fingeringWarnings(
  chart: Pick<Chart, 'notes' | 'pulse'>,
  ms: MsTable,
  v: Pick<Variant, 'layout' | 'fold' | 'keys'>,
): FingeringWarning[] {
  const res = chart.pulse.resolution
  const out: FingeringWarning[] = []

  const groups = new Map<number, KeyCode[]>()
  chart.notes.forEach((n, i) => {
    const k = v.keys[i]
    if (k === null || k === undefined) return
    const tick = Math.round(n.beat * res)
    groups.set(tick, [...(groups.get(tick) ?? []), k])
  })
  const ticks = [...groups.keys()].sort((a, b) => a - b)
  for (let i = 1; i < ticks.length; i++) {
    const t0 = ticks[i - 1] as number
    const t1 = ticks[i] as number
    let best: { a: KeyCode; b: KeyCode; d: number } | null = null
    for (const a of groups.get(t0) ?? [])
      for (const b of groups.get(t1) ?? []) {
        const pa = keyPosition(a)
        const pb = keyPosition(b)
        if (pa === null || pb === null) continue
        const d = hexDist(pa, pb)
        if (best === null || d < best.d) best = { a, b, d }
      }
    if (best === null) continue
    const row = keyPosition(best.a)?.row
    const dt = ms.beatToMs(t1 / res) - ms.beatToMs(t0 / res)
    if (row === keyPosition(best.b)?.row && best.d >= FAST_MOVE_DIST && dt < FAST_MOVE_MS)
      out.push({
        kind: 'fast',
        beat: t1 / res,
        text: `拍 ${fmtBeat(t1 / res)}: ${qwertyLabel(best.a)} → ${qwertyLabel(best.b)}（${ROW_NAMES[row ?? 0]}で距離 ${best.d}、${Math.round(dt)} ms）`,
      })
  }

  for (const g of foldedChords(chart, v))
    for (const r of rectCorners(g.keys))
      out.push({
        kind: 'rect',
        beat: g.tick / res,
        text: `拍 ${fmtBeat(g.tick / res)}: 同時押し ${g.keys.map(qwertyLabel).join('+')} が矩形 4 隅（${ROW_NAMES[r.rows[0]]}と${ROW_NAMES[r.rows[1]]}の列 ${r.cols.join(',')}）`,
      })

  // 安定ソートなので同じ拍では速い横移動が先
  return out.sort((a, b) => a.beat - b.beat)
}

/** 難度の注意（§2.4: 密度 > 3.5・最大跳躍 ≥ 6。S1 のカードと同じ目安） */
export function cautions(
  m: Metrics | undefined,
): { kind: 'density' | 'leap'; value: number; limit: number }[] {
  const out: { kind: 'density' | 'leap'; value: number; limit: number }[] = []
  const d = m?.density ?? 0
  const lx = m?.leapMax ?? 0
  if (d > DENSITY_CAUTION) out.push({ kind: 'density', value: d, limit: DENSITY_CAUTION })
  if (lx >= LEAP_CAUTION) out.push({ kind: 'leap', value: lx, limit: LEAP_CAUTION })
  return out
}
