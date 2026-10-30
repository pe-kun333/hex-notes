// 採点（M0-06、手順 8）。出どころ: design.md §2.3（重み 1／0.7／0.4／NEAR 0.4／0 の平均×100、ランク SS≥98・S≥95・
// A≥90・B≥80・C〔仮〕、点 1000/700/400×(1+min(コンボ,50)/100)、ゲージ 50 開始・+1.5/+0.5/−6・終了時 ≥70〔仮〕）、
// decisions #8（点・ゲージ・フルコンボは音ゲー向けだけ）、m1' `GRADE_W` L317・`accuracy／rankOf` L356–357（そのまま）・
// `judge` L318–324・`miss` L325（作り直し）。kickoff 手順 8 の手直し: ホールドの +300 点・NEAR 400 点・Wife3 は無し。
// 精度の分母は判定した音（skipped を除く。decisions #39）。状態は値で持つ（グローバル状態なし）。

import type { JudgeCounts, Judgment, Rank } from '../shared/types.ts'

/** 精度の重み（§2.3、m1' GRADE_W L317） */
export const GRADE_WEIGHT: Readonly<Record<Judgment, number>> = Object.freeze({
  perfect: 1,
  great: 0.7,
  good: 0.4,
  near: 0.4,
  miss: 0,
})

/** 音ゲー向けの点の素点（§2.3。NEAR は音ゲー向けに無い） */
export const BASE_POINTS: Readonly<Record<'perfect' | 'great' | 'good', number>> = Object.freeze({
  perfect: 1000,
  great: 700,
  good: 400,
})

/** コンボ倍率の上限（1 + min(コンボ, 50)/100） */
export const COMBO_CAP = 50
/** ゲージ: 開始・上限・クリアの線（§2.3、仮） */
export const GAUGE_START = 50
export const GAUGE_MAX = 100
export const GAUGE_CLEAR = 70
/** ゲージの増減（perfect・great ＋1.5、good ＋0.5、miss −6。m1' judge L322・miss L325） */
export const GAUGE_DELTA: Readonly<Record<'perfect' | 'great' | 'good' | 'miss', number>> =
  Object.freeze({ perfect: 1.5, great: 1.5, good: 0.5, miss: -6 })

export interface ScoreState {
  readonly counts: JudgeCounts
  /** 重みの和（精度 ＝ weightSum / 判定数） */
  readonly weightSum: number
  readonly combo: number
  readonly maxCombo: number
  /** 音ゲー向けの点（入門者は 0 のまま） */
  readonly points: number
  /** 音ゲー向けのゲージ 0–100（入門者は開始値のまま） */
  readonly gauge: number
  /** ゲージが 0 になった（音ゲー向けの途中終了。§1.3 S2） */
  readonly failed: boolean
}

export function emptyCounts(): JudgeCounts {
  return { perfect: 0, great: 0, good: 0, near: 0, miss: 0 }
}

export function initialScore(): ScoreState {
  return {
    counts: emptyCounts(),
    weightSum: 0,
    combo: 0,
    maxCombo: 0,
    points: 0,
    gauge: GAUGE_START,
    failed: false,
  }
}

/** 判定した音の数（精度の分母。skipped は入らない） */
export function judgedOf(c: JudgeCounts): number {
  return c.perfect + c.great + c.good + c.near + c.miss
}

/** 精度 0–1（m1' accuracy L356。判定した音が無ければ 1） */
export function accuracyOf(s: Pick<ScoreState, 'counts' | 'weightSum'>): number {
  const n = judgedOf(s.counts)
  return n > 0 ? s.weightSum / n : 1
}

/** ランク（m1' rankOf L357。§2.3 の線、仮） */
export function rankOf(acc: number): Rank {
  return acc >= 0.98 ? 'SS' : acc >= 0.95 ? 'S' : acc >= 0.9 ? 'A' : acc >= 0.8 ? 'B' : 'C'
}

/**
 * 1 音の判定を足す。gauge が真（音ゲー向け）のときだけ点とゲージを動かす。コンボは当てた音（NEAR を含む）で
 * 1 増え、miss で 0 に戻る。点の倍率は足した後のコンボで取る（m1' judge L320–321）。
 */
export function addJudgment(s: ScoreState, grade: Judgment, gauge: boolean): ScoreState {
  const counts = { ...s.counts, [grade]: s.counts[grade] + 1 }
  const weightSum = s.weightSum + GRADE_WEIGHT[grade]
  if (grade === 'miss') {
    const g = gauge ? Math.max(0, s.gauge + GAUGE_DELTA.miss) : s.gauge
    return { ...s, counts, weightSum, combo: 0, gauge: g, failed: s.failed || (gauge && g <= 0) }
  }
  const combo = s.combo + 1
  const maxCombo = Math.max(s.maxCombo, combo)
  if (!gauge || grade === 'near') return { ...s, counts, weightSum, combo, maxCombo }
  const points = s.points + BASE_POINTS[grade] * (1 + Math.min(combo, COMBO_CAP) / 100)
  const g = Math.min(GAUGE_MAX, s.gauge + GAUGE_DELTA[grade])
  return { ...s, counts, weightSum, combo, maxCombo, points, gauge: g }
}

/** フルコンボ（音ゲー向け。判定した音が 1 つ以上で miss が 0） */
export function isFullCombo(c: JudgeCounts): boolean {
  return judgedOf(c) > 0 && c.miss === 0
}

/** クリア（音ゲー向け。途中終了でなく、終了時のゲージ ≥ 70） */
export function isCleared(s: Pick<ScoreState, 'gauge' | 'failed'>): boolean {
  return !s.failed && s.gauge >= GAUGE_CLEAR
}

// ---------- 時刻のずれの統計（S3 の平均・計測の UR・早遅ヒストグラム） ----------

/** 早遅ヒストグラムの階級の幅 ms（§4.6 の hist。仮） */
export const HIST_BIN_MS = 10

export function mean(xs: readonly number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, x) => a + x, 0) / xs.length
}

/** 標本標準偏差（n − 1。m3 sd L248） */
export function sampleSd(xs: readonly number[]): number | null {
  const m = mean(xs)
  if (m === null || xs.length < 2) return null
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

/** UR ＝ 判定ずれの SD ×10（docs/references.md の UR の行）。標本が 2 つ未満なら null */
export function unstableRate(dts: readonly number[]): number | null {
  const sd = sampleSd(dts)
  return sd === null ? null : sd * 10
}

/** 早遅ヒストグラム。キーは階級の下端（floor(dt/10)·10 の文字列。"-20" は [−20, −10)） */
export function histogramOf(dts: readonly number[], bin = HIST_BIN_MS): Record<string, number> {
  const h: Record<string, number> = {}
  for (const d of dts) {
    const k = String(Math.floor(d / bin) * bin)
    h[k] = (h[k] ?? 0) + 1
  }
  return h
}
