// 同期タップ（M2-02、M2 の手順 3）。動画を再生しながら拍に合わせて Space を 8 回打ち、譜面の拍 0 の動画時刻（offset）と
// 動画 BPM ÷ 譜面 BPM（rate）を最小二乗で当てはめる純関数と、タップの回の状態機械。
// 出どころ: design.md §1.3 S5 段 4・§2.6・§3.2（offset は拍 0 の動画時刻〔秒〕、rate は 動画 BPM ÷ 譜面 BPM で pulse.tempo の
// 全区間に一様に掛かる）、m5 fitTaps L365–367・finishTaps L535–540・renderSync L543–547、m6 段 4 L492–498、
// m2-kickoff 手順 3・§7-12、decisions #14・#32 (c)(e)。人の拍アノテーションの SD 27〜68 ms は
// docs/planning/research/midi-score-sources.md L40（Gadermaier & Widmer 2019 を Peter ほか TISMIR 2023 が引用）。
// 手直し: m5 の x ＝ タップの添字 → x ＝ 拍の譜面 ms（テンポ変化があっても 1 本の rate になる）、残差の RMS（n で割る）→
// fit.ts の residualSd（平均を引いて n − 1。設計の「残差 SD」）、m5 の警告の閾 → 保存の可否（SD ≤ 68 ms）とおすすめ
// 「やり直す」（SD > 30 ms）を別の欄に。タップ k は拍 k（予備拍なし、拍 0 から）。
// 時刻は ms（offset だけ秒。SyncSource の形）。DOM・performance.now に触れない。
// M3 の手順 4（decisions #98、m3-kickoff §7-6・§7-23）: 回の当てはめは rate を 1.0 に固定して offset だけ（syncTapFitOffset）。
// 今の式（syncTapFit、8 拍から rate も）は診断の値として残し（syncTapDiag の rate と標準誤差）、曲末のずれ x が門を越えた回
// だけ注意する（syncTapDrift。保存はできる）。「1 拍前へ／後ろへ」は起点の拍を ±1 して当て直す（syncTapPlan の start、
// 事象 refit）。回の始まりは利用者の ▶ の後の PLAYING の再アンカー（呼ぶ側が start を入れる）。

import { buildMsTable } from '../chart/mstable.ts'
import type { Pulse } from '../shared/types.ts'
import { lsq, residualSd } from './fit.ts'
import { songAt } from './map.ts'
import type { ClockMap } from './types.ts'

/** タップする拍の数（m6 L496） */
export const SYNC_TAP_BEATS = 8
/** 保存できる残差 SD の上限 ms（人の拍アノテーションの SD の上限。§7-12、仮） */
export const SYNC_SAVE_MAX_SD_MS = 68
/** これを超えたら「やり直す」をすすめる残差 SD ms（m5 L546、仮） */
export const SYNC_RETRY_SD_MS = 30

/** タップする拍（拍 start〜start＋n−1）の譜面 ms。start は「1 拍前へ／後ろへ」の起点（負の拍は最初のテンポで外挿） */
export function syncTapPlan(pulse: Pulse, n = SYNC_TAP_BEATS, start = 0): number[] {
  const ms = buildMsTable(pulse)
  return Array.from({ length: n }, (_, k) => ms.beatToMs(start + k))
}

/** タップの入力の時刻（tsPerf、ms）→ 動画の時刻 ms（時計の写像。M2 はダミー動画、M3 は IFrame の時計） */
export function tapVideoMs(map: ClockMap, tsPerf: number): number {
  return songAt(map, tsPerf)
}

export interface SyncTapFit {
  /** 拍 0 の動画時刻（秒） */
  readonly offset: number
  /** 動画 BPM ÷ 譜面 BPM */
  readonly rate: number
  /** 残差の SD ms（n − 1） */
  readonly residualSd: number
  /** 残差の絶対値の最大 ms */
  readonly maxAbs: number
  readonly n: number
}

/**
 * 当てはめ: 動画 ms ＝ a · 譜面 ms ＋ b（lsq の now ＝ 譜面 ms、raw ＝ 動画 ms）。rate ＝ 1／a、offset ＝ b／1000。
 * 2 点未満・長さが違う・傾きが正でなければ null
 */
export function syncTapFit(chartMs: readonly number[], videoMs: readonly number[]): SyncTapFit | null {
  if (chartMs.length !== videoMs.length) return null
  const points = chartMs.map((now, i) => ({ now, raw: videoMs[i] as number }))
  const line = lsq(points)
  if (line === null || !(line.a > 0)) return null
  const maxAbs = points.reduce((m, p) => Math.max(m, Math.abs(p.raw - (line.a * p.now + line.b))), 0)
  return { offset: line.b / 1000, rate: 1 / line.a, residualSd: residualSd(points, line), maxAbs, n: points.length }
} // prettier-ignore

/**
 * rate 1.0 固定の当てはめ（decisions #98）: offset ＝ 平均(動画 ms − 譜面 ms)／1000、残差は差から平均を引いた値の SD（n − 1）、
 * maxAbs はその絶対値の最大。2 点未満・長さが違えば null
 */
export function syncTapFitOffset(chartMs: readonly number[], videoMs: readonly number[]): SyncTapFit | null {
  const n = chartMs.length
  if (n !== videoMs.length || n < 2) return null
  const d = chartMs.map((c, i) => (videoMs[i] as number) - c)
  const mean = d.reduce((a, x) => a + x, 0) / n
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1))
  const maxAbs = d.reduce((m, x) => Math.max(m, Math.abs(x - mean)), 0)
  return { offset: mean / 1000, rate: 1, residualSd: sd, maxAbs, n }
} // prettier-ignore

/** 診断の値（今の式の rate と、その傾きの標準誤差 ＝ 残差 SD ÷ √Σ(譜面 ms − 平均)²） */
export interface SyncTapDiag {
  readonly rate: number
  readonly se: number
}

export function syncTapDiag(chartMs: readonly number[], videoMs: readonly number[]): SyncTapDiag | null {
  const f = syncTapFit(chartMs, videoMs)
  if (f === null) return null
  const m = chartMs.reduce((a, x) => a + x, 0) / chartMs.length
  const sxx = chartMs.reduce((a, x) => a + (x - m) ** 2, 0)
  return { rate: f.rate, se: sxx > 0 ? f.residualSd / Math.sqrt(sxx) : 0 }
} // prettier-ignore

export interface SyncTapDrift {
  /** 曲末のずれ ms（|診断の rate − 1| × 曲の長さ、1 ms に丸め） */
  readonly x: number
  /** 注意を出す（x ＞ 窓、かつ |rate − 1| ＞ 2 × 標準誤差。保存はできる） */
  readonly warn: boolean
}

/**
 * テンポが違う動画の注意（門は decisions #104、仮）。windowMs は画面が判定層の lateEdge から渡す（入門者の遅れ側 234 ms。
 * src/clock は judge を読まない）
 */
export function syncTapDrift(d: SyncTapDiag, songMs: number, windowMs: number): SyncTapDrift {
  const dev = Math.abs(d.rate - 1)
  const x = Math.round(dev * songMs)
  return { x, warn: x > windowMs && dev > 2 * d.se }
}

export interface SyncTapVerdict {
  /** 保存できる（残差 SD ≤ 68 ms） */
  readonly savable: boolean
  /** 「やり直す」をすすめる（残差 SD > 30 ms） */
  readonly retry: boolean
}

export function syncTapVerdict(sd: number): SyncTapVerdict {
  return { savable: sd <= SYNC_SAVE_MAX_SD_MS, retry: sd > SYNC_RETRY_SD_MS }
}

// ---------- タップの回 ----------

export interface SyncTapResult {
  /** 保存する当てはめ（rate 1.0 固定、syncTapFitOffset） */
  readonly fit: SyncTapFit
  /** 診断の値（今の式の rate と標準誤差。sync 行の rate と注意の門） */
  readonly diag: SyncTapDiag
  /** 当てた起点の拍（「1 拍前へ」で ＋1、「後ろへ」で −1） */
  readonly start: number
  readonly verdict: SyncTapVerdict
  /** 再生を始めてから 8 拍目のタップまでの秒 */
  readonly elapsedS: number
}

export interface SyncTapState {
  /** idle ＝ 始める前・中止の後、tapping ＝ 再生してタップを待つ、done ＝ 8 拍そろった */
  readonly phase: 'idle' | 'tapping' | 'done'
  /** この回のタップ（動画 ms） */
  readonly taps: readonly number[]
  /** 再生を始めた now（tapping の間） */
  readonly startedAt: number | null
  /** 8 拍そろった回の数（やり直しで増える。中止・不足は数えない） */
  readonly attempts: number
  /** 最後にそろった回の結果（やり直しの最中も、前の結果は残す） */
  readonly result: SyncTapResult | null
}

export type SyncTapEvent =
  | { readonly kind: 'start'; readonly now: number }
  | { readonly kind: 'tap'; readonly videoMs: number; readonly now: number }
  | { readonly kind: 'cancel' }
  /** 最後にそろった回を起点 start の plan で当て直す（「1 拍前へ／後ろへ」。attempts は増えない） */
  | { readonly kind: 'refit'; readonly start: number }

export function initialSyncTap(): SyncTapState {
  return { phase: 'idle', taps: [], startedAt: null, attempts: 0, result: null }
}

/**
 * 回を進める。start は始める・やり直す（taps を空に）、tap は tapping の間だけ数える（拍 k ＝ k 回目）、8 拍目で当てはめて
 * done（attempts ＋1）。cancel は idle に戻す（その回のタップは捨てる。attempts と前の結果は残す）。refit は最後の結果の
 * タップを、planOf(start) で当て直す。plan は起点 0 の syncTapPlan、planOf は起点ごとの plan（無ければ refit は効かない）
 */
export function syncTapStep(
  s: SyncTapState,
  ev: SyncTapEvent,
  plan: readonly number[],
  planOf?: (start: number) => readonly number[],
): SyncTapState {
  switch (ev.kind) {
    case 'start':
      return { ...s, phase: 'tapping', taps: [], startedAt: ev.now }
    case 'cancel':
      return s.phase === 'tapping' ? { ...s, phase: 'idle', taps: [], startedAt: null } : s
    case 'tap': {
      if (s.phase !== 'tapping') return s
      const taps = [...s.taps, ev.videoMs]
      if (taps.length < plan.length) return { ...s, taps }
      const r = resultOf(plan, taps, 0, (ev.now - (s.startedAt ?? ev.now)) / 1000)
      if (r === null) return { ...s, phase: 'idle', taps: [], startedAt: null }
      return { phase: 'done', taps, startedAt: null, attempts: s.attempts + 1, result: r }
    }
    case 'refit': {
      const prev = s.result
      if (prev === null || planOf === undefined || s.phase === 'tapping' || ev.start === prev.start)
        return s
      const r = resultOf(planOf(ev.start), s.taps, ev.start, prev.elapsedS)
      return r === null ? s : { ...s, result: r }
    }
  }
}

/** そろったタップの結果（保存する当てはめ・診断・判定）。当てはめられなければ null */
function resultOf(plan: readonly number[], taps: readonly number[], start: number, elapsedS: number): SyncTapResult | null {
  const fit = syncTapFitOffset(plan, taps)
  const diag = syncTapDiag(plan, taps)
  if (fit === null || diag === null) return null
  return { fit, diag, start, verdict: syncTapVerdict(fit.residualSd), elapsedS }
} // prettier-ignore
