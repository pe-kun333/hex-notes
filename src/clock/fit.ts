// 当てはめ（M0-05、手順 7）。出どころ: design.md §2.6「最小二乗 2 秒窓、span<300 ms は直前値＋経過×rate、量子化補正」、
// m3 `lsq` L321–323・`clk.feed` L324–350（q̂ ＝ √12·SD、上限 50 ms）、相談 C の案 B-4、decisions #33（仮）。
// 窓の標本（変化した読みだけ）を値で受ける純関数。時刻は ms、傾き a は ms/ms（再生レート 1 で 1）。

import type { ClockMap } from './types.ts'

/** 標本（読みが変わった tick の now と読み） */
export interface FitPoint {
  readonly now: number
  readonly raw: number
}

/** 当てはめの窓 ms（§2.6）。最新の標本から 2,000 ms より古い物を落とす（2 点は残す。m3 L327） */
export const FIT_WINDOW_MS = 2000
/** 当てはめを使う span の下限 ms（§2.6。未満は最新の標本＋経過×rate） */
export const FIT_MIN_SPAN_MS = 300
/** q̂ を推定する span の下限 ms（m3 L329） */
export const QHAT_MIN_SPAN_MS = 1000
/** q̂ の上限 ms（m3 L329 の 0.05 s。相談 C、仮） */
export const QHAT_MAX_MS = 50
/** 格子率の下限（正の増分が q̂ の整数倍 ±1 ms に乗る割合。未満は量子化でないとみなし q̂ ＝ 0。相談 C、仮） */
export const LATTICE_MIN = 0.8
/** 格子に乗るとみなす許し ms（相談 C、仮） */
export const LATTICE_TOL_MS = 1
/** 刻みの候補の下限 ms（これより細かい格子には ±1 ms の許しで何でも乗るので見ない。仮） */
export const STEP_MIN_MS = 4
/** 刻みの候補を作るときに最小の増分を割る数の上限（仮） */
export const STEP_MAX_DIV = 8

/** 窓を最新の標本から FIT_WINDOW_MS に切る（古い順。2 点は残す） */
export function trimWindow(points: readonly FitPoint[]): FitPoint[] {
  const last = points[points.length - 1]
  if (last === undefined) return []
  let i = 0
  while (points.length - i > 2 && last.now - (points[i]?.now ?? last.now) > FIT_WINDOW_MS) i++
  return points.slice(i)
}

/** 最小二乗の直線 raw ＝ a·now ＋ b。2 点未満か now が全て同じなら null（x は先頭の now からの差で計算する） */
export function lsq(points: readonly FitPoint[]): ClockMap | null {
  const n = points.length
  const first = points[0]
  if (n < 2 || first === undefined) return null
  const x0 = first.now
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    const x = p.now - x0
    sx += x
    sy += p.raw
    sxx += x * x
    sxy += x * p.raw
  }
  const den = n * sxx - sx * sx
  if (!(den > 1e-9)) return null
  const a = (n * sxy - sx * sy) / den
  const c = (sy - a * sx) / n
  return { a, b: c - a * x0 }
}

export function spanOf(points: readonly FitPoint[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  return first === undefined || last === undefined ? 0 : last.now - first.now
}

/**
 * 当てはめの線。2 点以上で span ≥ 300 なら最小二乗、でなければ最新の標本から傾き rate（§2.6）。標本が無ければ null。
 */
export function lineOf(points: readonly FitPoint[], rate: number): ClockMap | null {
  const last = points[points.length - 1]
  if (last === undefined) return null
  if (points.length >= 2 && spanOf(points) >= FIT_MIN_SPAN_MS) {
    const f = lsq(points)
    if (f !== null) return f
  }
  return { a: rate, b: last.raw - rate * last.now }
}

/** 線からの残差の標準偏差（n − 1 で割る。m3 `sd` L248 と同じ。2 点未満は 0） */
export function residualSd(points: readonly FitPoint[], line: ClockMap): number {
  const n = points.length
  if (n < 2) return 0
  const res = points.map((p) => p.raw - (line.a * p.now + line.b))
  const m = res.reduce((s, r) => s + r, 0) / n
  return Math.sqrt(res.reduce((s, r) => s + (r - m) * (r - m), 0) / (n - 1))
}

/** 格子率: 隣り合う標本の正の増分のうち、q の整数倍（k ≥ 1）±LATTICE_TOL_MS に乗る割合。増分が無ければ 0 */
export function latticeRate(points: readonly FitPoint[], q: number): number {
  if (!(q > 0)) return 0
  let count = 0
  let hits = 0
  for (let i = 1; i < points.length; i++) {
    const d = (points[i]?.raw ?? 0) - (points[i - 1]?.raw ?? 0)
    if (!(d > 0)) continue
    count++
    const k = Math.round(d / q)
    if (k >= 1 && Math.abs(d - k * q) <= LATTICE_TOL_MS) hits++
  }
  return count === 0 ? 0 : hits / count
}

/**
 * 読みの刻みの推定（量子化の門）。正の増分の最小値 m を k ＝ 1..8 で割った候補（4 ms 以上）を大きい方から見て、
 * 格子率 ≥ 0.8 の最初の候補を返す。無ければ 0（量子化でない）。tick の間隔が刻みより長いと増分は刻みの倍数
 * （15 ms 刻みを 30 fps で読むと 30・45）になるので、最小の増分でなくその約数を見る。
 */
export function latticeStep(points: readonly FitPoint[]): number {
  let m = Infinity
  for (let i = 1; i < points.length; i++) {
    const d = (points[i]?.raw ?? 0) - (points[i - 1]?.raw ?? 0)
    if (d > 0 && d < m) m = d
  }
  if (!Number.isFinite(m)) return 0
  for (let k = 1; k <= STEP_MAX_DIV && m / k >= STEP_MIN_MS; k++)
    if (latticeRate(points, m / k) >= LATTICE_MIN) return m / k
  return 0
}

/**
 * 量子化の補正に使う q̂（相談 C の案 B-4 を改めた、decisions #33 (c)）。span ≥ 1000 で、読みが格子に乗る（latticeStep
 * ＞ 0）なら min(50, √12·SD)、乗らなければ 0。span が足りない間は前の値を持ち越す（再アンカーで 0 に戻さない）。
 * 読みの変わった tick だけを標本にするので、tick の間隔（動画の時間で rate·Δ）が刻み q より長ければ残差は q の全体に、
 * 短ければ [−rate·Δ, 0] に一様に散る。√12·SD はどちらでも切り捨ての偏りの 2 倍（q か rate·Δ）になるので、補正の大きさ
 * には √12·SD を使い、門だけを刻みの格子で見る（√12·SD の格子で見ると 75 Hz 以上やレート 1 未満で門が閉じる）。
 */
export function estimateQ(points: readonly FitPoint[], prevQ: number): number {
  if (spanOf(points) < QHAT_MIN_SPAN_MS) return prevQ
  const line = lsq(points)
  if (line === null) return prevQ
  if (latticeStep(points) === 0) return 0
  return Math.min(QHAT_MAX_MS, Math.sqrt(12) * residualSd(points, line))
}
