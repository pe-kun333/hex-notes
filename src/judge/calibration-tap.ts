// 校正 段 1 のタップ（M1-05、M1 の手順 4）。出どころ: design.md §2.7（メトロノーム 24 打、SD < 30 ms のときだけ適用）、
// m3 `startCal` L435–448（100 BPM ＝ 600 ms、N 28 で先頭 4 つは予備〔measured false〕、最初のクリックは今から 0.6 s 後、
// 4 拍ごとに強拍、終わりの見張りは N × 600 ＋ 900 ms）・`calTap` L449–451（最も近いクリック、|d| ≤ 300、予備と既に当てた
// クリックは捨てる、24 打で終わる）・`finishCal` L454–457（24 打未満は不足）、decisions #37（クリックの実時刻は audio-bridge
// で context の秒から出す）・#40 (b)（生の誤差から −平均）。
// クリックの予定・タップの対応付け・進捗・終わりの判定の純関数。発音（AudioContext）と時刻の読みは src/app/ が行い、
// 値で渡す。結果は calibration-offset.ts の tapOffset。

import { contextOfPerf, perfOfContext, type AudioBridge } from '../clock/audio-bridge.ts'
import { TAP_COUNT, tapOffset, type OffsetVerdict } from './calibration-offset.ts'

/** 100 BPM の拍の間隔 ms（m3 L446 の 0.6 s） */
export const CAL_INTERVAL_MS = 600
/** 予備の拍（数えない。m3 L446 の measured: i ≥ 4） */
export const CAL_LEAD = 4
/** クリックの数（予備 4 ＋ 24 打） */
export const CAL_CLICKS = CAL_LEAD + TAP_COUNT
/** 最初のクリックまでの間 ms（m3 L446 の acT0 ＝ currentTime ＋ 0.6） */
export const CAL_START_DELAY_MS = 600
/** タップとクリックを対応付ける上限 ms（m3 calTap L450。自作値、m1-kickoff §7-18） */
export const CAL_MATCH_MS = 300
/** 最後のクリックの後、終わりを待つ ms（m3 L447 の ＋900） */
export const CAL_TAIL_MS = 900

export interface CalClick {
  /** 0 から（0〜3 は予備） */
  readonly index: number
  /** 予約する context の秒 */
  readonly ctxSec: number
  /** 聞こえる実時刻（perf ms。audio-bridge の対応点で換算） */
  readonly perf: number
  /** 数えるクリックか（予備は偽） */
  readonly measured: boolean
  /** 強拍（4 拍ごと） */
  readonly accent: boolean
}

/**
 * クリックの予定。最初のクリックは context の今の秒 ＋ 0.6、以後 0.6 s ごとに 28 個。実時刻は対応点から（m3 L442–445 の
 * getOutputTimestamp の換算。退避の outputLatency も bridgeOf が受け持つ）
 */
export function calClicks(bridge: AudioBridge, nowPerf: number): CalClick[] {
  const ctx0 = contextOfPerf(bridge, nowPerf) + CAL_START_DELAY_MS / 1000
  return Array.from({ length: CAL_CLICKS }, (_, index) => {
    const ctxSec = ctx0 + (index * CAL_INTERVAL_MS) / 1000
    return {
      index,
      ctxSec,
      perf: perfOfContext(bridge, ctxSec),
      measured: index >= CAL_LEAD,
      accent: index % 4 === 0,
    }
  })
}

export interface CalState {
  readonly clicks: readonly CalClick[]
  /** 当てたクリックの index */
  readonly hit: readonly number[]
  /** 打った − クリックの実時刻（ms、正が遅れ。校正を足さない生の値） */
  readonly errs: readonly number[]
}

export function initialCal(clicks: readonly CalClick[]): CalState {
  return { clicks, hit: [], errs: [] }
}

/** タップを捨てた理由: far ＝ 300 ms より遠い、lead ＝ 予備のクリック、dup ＝ 既に当てたクリック、full ＝ 24 打の後 */
export type CalMiss = 'far' | 'lead' | 'dup' | 'full'

export type CalTap =
  | { readonly kind: 'hit'; readonly index: number; readonly err: number }
  | { readonly kind: 'miss'; readonly reason: CalMiss }

/**
 * タップ 1 つ（tsPerf は Space の keydown の時刻）。最も近いクリック（同じ距離なら前のクリック）に対応付け、|誤差| ≤ 300
 * で、数えるクリックで、まだ当てていなければ数える（m3 calTap）
 */
export function calTap(s: CalState, tsPerf: number): { state: CalState; tap: CalTap } {
  if (s.errs.length >= TAP_COUNT) return { state: s, tap: { kind: 'miss', reason: 'full' } }
  let best: CalClick | null = null
  let bd = Infinity
  for (const c of s.clicks) {
    const d = tsPerf - c.perf
    if (Math.abs(d) < Math.abs(bd)) {
      bd = d
      best = c
    }
  }
  if (best === null || Math.abs(bd) > CAL_MATCH_MS)
    return { state: s, tap: { kind: 'miss', reason: 'far' } }
  if (!best.measured) return { state: s, tap: { kind: 'miss', reason: 'lead' } }
  if (s.hit.includes(best.index)) return { state: s, tap: { kind: 'miss', reason: 'dup' } }
  return {
    state: { ...s, hit: [...s.hit, best.index], errs: [...s.errs, bd] },
    tap: { kind: 'hit', index: best.index, err: bd },
  }
}

/** 終わりの見張りの実時刻（最後のクリック ＋ 900 ms） */
export function calDeadline(s: CalState): number {
  const last = s.clicks[s.clicks.length - 1]
  return (last?.perf ?? 0) + CAL_TAIL_MS
}

/** 終わるか: 24 打を数えた、か見張りの時刻を過ぎた */
export function calDone(s: CalState, nowPerf: number): boolean {
  return s.errs.length >= TAP_COUNT || nowPerf >= calDeadline(s)
}

/** 結果（24 打未満は count、SD ≥ 30 は sd、他は −平均） */
export function calResult(s: CalState): OffsetVerdict {
  return tapOffset(s.errs)
}
