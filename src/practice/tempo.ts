// テンポ段と自動昇降（M2-03 前半、M2 の手順 5）。出どころ: design.md §2.7「テンポ段」（動画なし 7 段・動画あり 4 段、
// 正答率 >90% で上げ <70% で下げ）・§2.6（レート変更の後 300 ms は判定保留）、m4 setRate L410–413・evalPhrase L414–417
// （判定 ≥4 音）・classify L420（正解 ＝ self＋hint）・評価の時刻 L311・L482、m6 TEMPO_NOVIDEO／TEMPO_VIDEO L585–586、
// m2-kickoff 手順 5・§7-4・§7-11、decisions #81。
// 描画は曲時間軸のまま（テンポ段で跳ばない、#81）。状態は値で持つ純関数で、setRate の事象は呼ぶ側（app/play-runner.ts）が
// 「未判定の音の窓の終わりが猶予の中に掛からない」フレームまで遅らせて出す（切替の直後に skipped を出さない）。

import { GRACE_MS } from '../clock/grace.ts'
import type { Judgment } from '../shared/types.ts'
import type { SelfCategory } from '../judge/self-rate.ts'

/** 動画なしの段（m6 L585） */
export const TEMPO_NOVIDEO: readonly number[] = [0.5, 0.6, 0.75, 0.9, 1.0, 1.1, 1.25]
/** 動画ありの段（m6 L586。M3-02） */
export const TEMPO_VIDEO: readonly number[] = [0.5, 0.75, 1.0, 1.25]

/** 自動昇降が評価する最少の音（m4 L416） */
export const TEMPO_MIN_JUDGED = 4
export const TEMPO_UP_ABOVE = 0.9
export const TEMPO_DOWN_BELOW = 0.7

/** 最も近い段（同じ近さなら遅い方） */
export function nearestStep(rate: number, steps: readonly number[] = TEMPO_NOVIDEO): number {
  let best = steps[0] ?? 1
  for (const x of steps) if (Math.abs(x - rate) < Math.abs(best - rate) - 1e-9) best = x
  return best
}

/** 正解の音か（正しい鍵の perfect／great／good。NEAR・miss・待ち中の誤打〔自力率 miss〕は不正解。§7-11） */
export function isCorrect(grade: Judgment | null, self: SelfCategory | null): boolean {
  return (grade === 'perfect' || grade === 'great' || grade === 'good') && self !== 'miss'
}

/**
 * 2 小節の評価 → 次の段（変わらなければ今の rate）。判定 ≥4 音、正答率 >0.9 で 1 段上、<0.7 で 1 段下、端では据え置き
 * （厳密な不等号。m4 evalPhrase L416）
 */
export function tempoAfter(
  rate: number,
  judged: number,
  correct: number,
  steps: readonly number[] = TEMPO_NOVIDEO,
): number {
  if (judged < TEMPO_MIN_JUDGED) return rate
  const ratio = correct / judged
  const i = steps.indexOf(nearestStep(rate, steps))
  if (ratio > TEMPO_UP_ABOVE) return steps[Math.min(steps.length - 1, i + 1)] ?? rate
  if (ratio < TEMPO_DOWN_BELOW) return steps[Math.max(0, i - 1)] ?? rate
  return rate
}

/**
 * setRate を今出してよいか: 未判定の音のうち、窓の終わり（着地の実時刻 ＋ 遅れ側の窓）が今から猶予 300 ms の中に掛かる物が
 * 無い（再アンカーの猶予で skipped にしない。§7-11）。windowEnds は未判定の音の窓の終わりの実時刻
 */
export function rateChangeSafe(windowEnds: Iterable<number>, now: number): boolean {
  for (const e of windowEnds) if (e <= now + GRACE_MS) return false
  return true
}
