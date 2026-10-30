// 校正のオフセット（M0-06、手順 8）。出どころ: design.md §2.7（段 1: 24 打で SD<30 ms のときだけ平均を適用。
// 段 2〔プレイ後の提案〕: ヒット ≥8 かつ |平均| ≥10 ms かつ SD<30 ms で 1 ms 丸め、範囲 ±120）、m3 `clockAt` L354–355
// （曲の時刻に ＋offset）・`finishCal` L456・`onEnd` L396、decisions #32 (e)（時計層に入れない）・#40（仮）。
// オフセットは判定だけに効かせる: 押した実時刻に足してから窓と比べる（描画・時計・音源の予約には足さない）。
// 正のオフセットは押下を遅く読む（早押しの人の窓を前へ）、負は早く読む（遅押しの人の窓を後ろへ）。単位は実時間の ms。

import { mean, sampleSd } from './score.ts'

/** 範囲（§2.7「範囲 ±120」） */
export const OFFSET_LIMIT_MS = 120
/** 段 1 の打数と SD の上限（§2.7） */
export const TAP_COUNT = 24
export const SD_LIMIT_MS = 30
/** 段 2 の門: ヒット数・平均の絶対値の下限（§2.7） */
export const PROPOSE_MIN_HITS = 8
export const PROPOSE_MIN_MEAN_MS = 10

/** 押した実時刻（tsPerf）に校正を足した、判定に使う実時刻 */
export function judgedTime(tsPerf: number, offsetMs: number): number {
  return tsPerf + offsetMs
}

export function clampOffset(x: number): number {
  return Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, Math.round(x)))
}

export type OffsetVerdict =
  | { readonly ok: true; readonly offset: number; readonly mean: number; readonly sd: number }
  | {
      readonly ok: false
      readonly reason: 'count' | 'sd' | 'small'
      readonly mean: number | null
      readonly sd: number | null
    }

/**
 * 段 1（校正タップ）。errs は 打った − クリックの実時刻（校正を足さない生の値、正が遅れ）。24 打以上で SD < 30 なら
 * オフセット ＝ −平均（1 ms 丸め、±120）。m3 finishCal L456 は前のオフセットから平均を引くが、打つ時刻に前の
 * オフセットを足していないので、2 回目の校正で二重に引く。生の値から作り直す（decisions #40）。
 */
export function tapOffset(errs: readonly number[]): OffsetVerdict {
  const m = mean(errs)
  const sd = sampleSd(errs)
  if (errs.length < TAP_COUNT || m === null || sd === null)
    return { ok: false, reason: 'count', mean: m, sd }
  if (!(sd < SD_LIMIT_MS)) return { ok: false, reason: 'sd', mean: m, sd }
  return { ok: true, offset: clampOffset(-m), mean: m, sd }
}

/**
 * 段 2（プレイ後の提案）。dts は 正しい鍵で当てた音の 判定に使った実時刻 − 着地の実時刻（used を足した後、正が遅れ）。
 * ヒット ≥8・|平均| ≥10・SD < 30 の全てで、提案 ＝ used − 平均（1 ms 丸め、±120。m3 onEnd L396 の offset ＋ m と同じ。
 * m3 の m は −dt の平均）。母集団（通常プレイだけ）と音源種別ごとの保存は呼ぶ側。
 */
export function proposeOffset(dts: readonly number[], used: number): OffsetVerdict {
  const m = mean(dts)
  const sd = sampleSd(dts)
  if (dts.length < PROPOSE_MIN_HITS || m === null || sd === null)
    return { ok: false, reason: 'count', mean: m, sd }
  if (!(sd < SD_LIMIT_MS)) return { ok: false, reason: 'sd', mean: m, sd }
  if (Math.abs(m) < PROPOSE_MIN_MEAN_MS) return { ok: false, reason: 'small', mean: m, sd }
  return { ok: true, offset: clampOffset(used - m), mean: m, sd }
}
