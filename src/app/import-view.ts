// S5 曲の持ち込みの中身（M2-01 後半、M2 の手順 2）。段の状態機械と各段の文言の純関数（DOM は screens/import.ts）。
// 出どころ: design.md §1.3 S5（MIDI → トラック → 折り畳み → 同期 → 保存。段ごとに戻れる縦積み）、m6 S5 L454–518（段 1・2・3・5 の
// 文言、帯「保存できません」L457）・ACT s5next／s5back／s5save L990–998、m5 の段 1（handleFile L568–577・トラック表 L385–393）、
// m2-kickoff 手順 2・§7-2（段 4 は M3-03）・§7-6（同じ id は上書き）・§7-18（同梱曲と同じ id は断る）、decisions #79・#83。
// 段 4（同期）は M2 では無いので 3 の次は 5、5 の前は 3。途中でやめた段の状態は捨てる（殻に持たない）。

import {
  cautions,
  defaultAccomp,
  fingeringWarnings,
  foldPreview,
  trackDefaults,
  type ChartParts,
} from '../chart/import.ts'
import { buildMsTable } from '../chart/mstable.ts'
import type { Smf } from '../chart/smf.ts'
import { noteName } from '../render/canvas/cells.ts'
import { barOf } from '../results/analysis.ts'
import { soundItems, type SoundItem } from '../audio/scheduler.ts'
import { FOLD_IDS, type Chart, type FoldId, type LayoutId, type Variant } from '../shared/types.ts'
import { clockText } from './home-view.ts'

/** 段（段 4 は M3-03） */
export type ImportStep = 1 | 2 | 3 | 5
export const IMPORT_STEPS: readonly ImportStep[] = [1, 2, 3, 5]

export interface ImportFile {
  readonly fileName: string
  readonly smf: Smf
}

export interface ImportState {
  readonly step: ImportStep
  readonly file: ImportFile | null
  /** 段 1 で読めなかった理由（読めたら null） */
  readonly error: string | null
  readonly play: number
  readonly accomp: readonly number[]
  readonly fold: FoldId
  readonly name: string
  readonly composer: string
}

export type ImportEvent =
  | { readonly kind: 'loaded'; readonly file: ImportFile }
  | { readonly kind: 'failed'; readonly why: string }
  | { readonly kind: 'next' }
  | { readonly kind: 'back' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'play'; readonly track: number }
  | { readonly kind: 'accomp'; readonly track: number; readonly on: boolean }
  | { readonly kind: 'fold'; readonly fold: FoldId }
  | { readonly kind: 'name'; readonly text: string }
  | { readonly kind: 'composer'; readonly text: string }

/** 段 1 の始まり（fold の既定は設定の fold） */
export function initialImport(fold: FoldId): ImportState {
  return { step: 1, file: null, error: null, play: 0, accomp: [], fold, name: '', composer: '' }
}

/** 曲名の既定（ファイル名から .mid／.midi を外す。m5 L313） */
export function fileStem(fileName: string): string {
  return fileName.replace(/\.(mid|midi)$/i, '')
}

/** その段で「次へ」が押せるか（段 1 は読めたとき、段 5 は無い） */
export function canNext(s: ImportState): boolean {
  if (s.step === 1) return s.file !== null
  return s.step !== 5
}

/** 保存が押せるか（段 5 で曲名が空でない） */
export function canSave(s: ImportState): boolean {
  return s.step === 5 && s.file !== null && s.name.trim() !== ''
}

const NEXT_STEP: Readonly<Record<ImportStep, ImportStep>> = { 1: 2, 2: 3, 3: 5, 5: 5 }
const BACK_STEP: Readonly<Record<ImportStep, ImportStep>> = { 1: 1, 2: 1, 3: 2, 5: 3 }

/** 段を進める。'exit' は S1 へ（やめる） */
export function importStep(s: ImportState, ev: ImportEvent): ImportState | 'exit' {
  switch (ev.kind) {
    case 'loaded': {
      const d = trackDefaults(ev.file.smf)
      return { ...s, file: ev.file, error: null, play: d.play, accomp: d.accomp, name: fileStem(ev.file.fileName) }
    }
    case 'failed':
      return { ...s, file: null, error: ev.why }
    case 'next':
      return canNext(s) ? { ...s, step: NEXT_STEP[s.step] } : s
    case 'back':
      return { ...s, step: BACK_STEP[s.step] }
    case 'cancel':
      return 'exit'
    case 'play':
      if (s.file === null || ev.track === s.play || s.file.smf.tracks[ev.track] === undefined) return s
      // 弾くトラックを伴奏から外す。他の伴奏の選択は保つ
      return { ...s, play: ev.track, accomp: s.accomp.filter((i) => i !== ev.track) }
    case 'accomp': {
      if (s.file === null || ev.track === s.play || s.file.smf.tracks[ev.track] === undefined) return s
      const rest = s.accomp.filter((i) => i !== ev.track)
      return { ...s, accomp: ev.on ? [...rest, ev.track].sort((a, b) => a - b) : rest }
    }
    case 'fold':
      return { ...s, fold: ev.fold }
    case 'name':
      return { ...s, name: ev.text }
    case 'composer':
      return { ...s, composer: ev.text }
  }
} // prettier-ignore

/** 伴奏を既定に戻す（弾く以外の全部でドラムを除く） */
export function resetAccomp(s: ImportState): ImportState {
  return s.file === null ? s : { ...s, accomp: defaultAccomp(s.file.smf, s.play) }
}

// ---------- 段 1 ----------

/** 読めなかった理由（形式 2・SMPTE は対応の範囲を言う。他は読み取りの文のまま） */
export function loadErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/形式 \d+ の MIDI|SMPTE/.test(msg)) return '読めませんでした（SMF 形式 0／1 だけ対応）'
  return `読めませんでした（${msg}）`
}

/** 曲の長さ（秒、どのトラックでも最後の音の終わり） */
function smfSeconds(smf: Smf): number {
  const ms = buildMsTable({ resolution: 240, tempo: smf.tempo.map((t) => ({ ...t })) })
  let end = 0
  for (const t of smf.tracks) for (const n of t.notes) end = Math.max(end, n.beat + n.dur)
  return ms.beatToMs(end) / 1000
}

/** 曲の情報（m6 L462: 名 ・ 形式 ・ トラック数 ・ BPM ・ 長さ、と拍子） */
export function songInfo(f: ImportFile): string {
  const s = f.smf
  const t0 = s.tempo[0]?.bpm ?? 120
  const bpm = s.tempo.length > 1 ? `${t0} BPM（テンポ変化 ${s.tempo.length - 1} 回）` : `${t0} BPM`
  const sig = s.timeSig[0]
  const sigText = sig === undefined ? '拍子なし（4/4 とみなす）' : `${sig.num}/${sig.den}${s.timeSig.length > 1 ? '（変化あり）' : ''}`
  return `${f.fileName} ・ 形式 ${s.format} ・ ${s.tracks.length} トラック ・ ${bpm} ・ ${sigText} ・ ${clockText(smfSeconds(s))}`
} // prettier-ignore

// ---------- 段 2 ----------

export type TrackRole = 'play' | 'accomp' | 'off'

export interface TrackRow {
  readonly index: number
  readonly name: string
  /** 1 始まり */
  readonly ch: number
  readonly drum: boolean
  readonly notes: number
  /** 「C4〜G5」 */
  readonly range: string
  /** 最後の音の終わりの拍（小数 2 桁） */
  readonly beats: string
  readonly role: TrackRole
}

export function trackRows(s: ImportState): TrackRow[] {
  if (s.file === null) return []
  return s.file.smf.tracks.map((t, i) => {
    const ps = t.notes.map((n) => n.midi)
    const end = t.notes.reduce((m, n) => Math.max(m, n.beat + n.dur), 0)
    return {
      index: i,
      name: t.name,
      ch: t.ch + 1,
      drum: t.drum,
      notes: t.notes.length,
      range: ps.length === 0 ? '—' : `${noteName(Math.min(...ps))}〜${noteName(Math.max(...ps))}`,
      beats: String(Math.round(end * 100) / 100),
      role: i === s.play ? 'play' : s.accomp.includes(i) ? 'accomp' : 'off',
    }
  })
}

export const ROLE_TEXT: Readonly<Record<TrackRole, string>> = {
  play: '弾く',
  accomp: '伴奏',
  off: '除外',
}

/** 段 2 の注記（m6 L474） */
export const TRACKS_NOTE =
  '既定: 弾く以外の全トラックを伴奏（ドラムは除く）。伴奏はピアノの音で鳴らします。'

// ---------- 段 3 ----------

/** 折り畳みの名前と説明（m6 L483–485） */
export const FOLD_TEXT: Readonly<
  Record<FoldId, { readonly title: string; readonly desc: string }>
> = {
  octave: { title: 'オクターブ寄せ', desc: '音域の外の音を 1 オクターブずつ寄せる。' },
  cut: { title: '切り捨て', desc: '音域の外の音を落とす。' },
  nearest: { title: '最寄りの鍵', desc: '配列に無い音を最も近い鍵に寄せる（音高が変わる）。' },
}

const LAYOUT_SHORT: Readonly<Record<string, string>> = { ableton: 'Ableton', vmpk: 'VMPK' }

export interface FoldCard {
  readonly fold: FoldId
  readonly title: string
  readonly desc: string
  /** 配列ごとの「失われる音 n・位置が変わる音 m」（上限 2 の版で数える。間引きは別の行） */
  readonly lines: readonly string[]
  /** 同時押し上限で間引く音（上限 2・3） */
  readonly thin: string
}

/** 段 3 の 3 択のカード（版ごとの数は foldPreview） */
export function foldCards(parts: Pick<ChartParts, 'notes' | 'pulse' | 'collapsed'>): FoldCard[] {
  return FOLD_IDS.map((fold) => {
    const rows = foldPreview(parts, fold).rows
    const at = (layout: string, limit: number) => rows.find((r) => r.id === `${layout}/${limit}/${fold}`)
    const lines = ['ableton', 'vmpk'].map((l) => {
      const r = at(l, 2)
      return `${LAYOUT_SHORT[l]}: 失われる音 ${r?.droppedFold ?? 0}・位置が変わる音 ${r?.movedFold ?? 0}`
    })
    const a2 = at('ableton', 2)?.droppedThin ?? 0
    const a3 = at('ableton', 3)?.droppedThin ?? 0
    return { fold, ...FOLD_TEXT[fold], lines, thin: `同時押し上限で間引く音: 上限 2 で ${a2}・上限 3 で ${a3}（Ableton）` }
  })
} // prettier-ignore

/** 1/240 拍に丸めて潰れた音の知らせ（0 なら null、仮 §7-19） */
export function collapsedText(n: number): string | null {
  return n > 0
    ? `拍の 1/240 に丸めたとき、同じ拍・同じ音高に重なった ${n} 音を 1 つにまとめました（長い方を残す）。`
    : null
}

/** 試聴の長さ（小節、§7-19 の自作値） */
export const PREVIEW_BARS = 8

/** 試聴の音の列: 折り畳み後の旋律＋伴奏、最初の 8 小節（拍子が無ければ 4/4）。メトロノームは鳴らさない */
export function previewItems(chart: Pick<Chart, 'notes' | 'pulse' | 'accompaniment'>, v: Pick<Variant, 'layout' | 'keys'>, bars = PREVIEW_BARS): SoundItem[] {
  // barOf は 1 始まり
  const keep = (beat: number): boolean => barOf(chart.pulse, beat) <= bars
  const idx = chart.notes.flatMap((n, i) => (keep(n.beat) ? [i] : []))
  const cut = {
    notes: idx.map((i) => chart.notes[i] as Chart['notes'][number]),
    pulse: chart.pulse,
    accompaniment: (chart.accompaniment ?? []).filter((n) => keep(n.beat)),
  }
  return soundItems(cut, { layout: v.layout, keys: idx.map((i) => v.keys[i] ?? null) }, { melody: true, accomp: true, click: false })
} // prettier-ignore

// ---------- 段 5 ----------

/** 権利印（m6 L509） */
export const RIGHTS_NOTE = '端末の外には出しません。'

/** 生成する版（m6 L510） */
export function variantsNote(fold: FoldId): string {
  return `Ableton×{2,3}・VMPK×{2,3}（折り畳み: ${FOLD_TEXT[fold].title}）`
}

/** 段 5 の難度・警告を見せる版（設定の配列、上限 2。無ければ最初の版） */
export function summaryVariant(
  chart: Pick<Chart, 'variants'>,
  layout: LayoutId,
): Variant | undefined {
  const vs = chart.variants ?? []
  return vs.find((v) => v.layout === layout && v.limit === 2) ?? vs[0]
}

export interface SaveSummary {
  /** 「Ableton／上限 2」 */
  readonly variant: string
  /** 難度 4 軸（m6 L507） */
  readonly axes: string
  /** 注意（密度 > 3.5・最大跳躍 ≥ 6）。無ければ空 */
  readonly cautions: readonly string[]
  /** 運指の警告の件数と先頭の数件 */
  readonly warnCount: number
  readonly warnings: readonly string[]
}

/** 段 5 の要約（警告は先頭 5 件） */
export function saveSummary(chart: Chart, layout: LayoutId): SaveSummary | null {
  const v = summaryVariant(chart, layout)
  if (v === undefined) return null
  const m = v.metrics ?? {}
  const warns = fingeringWarnings(chart, buildMsTable(chart.pulse), v)
  return {
    variant: `${LAYOUT_SHORT[v.layout] ?? v.layout}／上限 ${v.limit}`,
    axes: `密度 ${(m.density ?? 0).toFixed(1)} 音/秒 ・ 跳躍 最大 ${m.leapMax ?? 0} ・ 同時押し率 ${Math.round((m.chord ?? 0) * 100)}% ・ 段またぎ率 ${Math.round((m.rowCross ?? 0) * 100)}%`,
    cautions: cautions(m).map((c) => (c.kind === 'density' ? `密度が ${c.limit} 音/秒を超える` : `最大跳躍が ${c.limit} 以上`)),
    warnCount: warns.length,
    warnings: warns.slice(0, 5).map((w) => `${w.kind === 'fast' ? '速い横移動' : '矩形の同時押し'}: ${w.text}`),
  }
} // prettier-ignore

/** 既にある曲との関係（同じ id） */
export type Duplicate = 'none' | 'local' | 'bundled'

/** 保存の前の 1 行（§7-6・§7-18、仮）。同梱曲と同じ id は保存できない */
export function duplicateText(d: Duplicate): string | null {
  if (d === 'local')
    return '同じ曲が既に持ち込まれています。保存すると上書きします（記録は残ります）。'
  if (d === 'bundled') return '同梱曲と同じ曲なので保存しません（同梱曲をそのまま遊べます）。'
  return null
}

/** 保存に失敗したときの箱（m6 L457） */
export const SAVE_FAIL_TITLE = '保存できません'
export const SAVE_FAIL_DETAIL =
  'この端末では保存に失敗しました。譜面をファイルに書き出して残せます。'
export const SAVE_FAIL_EXPORT = '*.hexnote.json を書き出す'
