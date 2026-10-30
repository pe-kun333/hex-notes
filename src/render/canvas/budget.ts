// 演出の予算（M0-03b、手順 6）。出どころ: design.md §2.8「閃光 1 秒 3 回以下、同時に光る面積 25% 以下。ヒットの光はセル内のみ。
// 節目の演出も領域内だけ、10 秒に 1 回まで」、decisions 既定値「閃光は 1 秒 3 回以下」、相談 B の勘定、decisions #29（仮）。
// 閃光 ＝ 鍵盤図のセルを塗って光らせる演出（縁の返しより強く、セルの外には出ない）。M0 は flash の intent だけで、節目の演出は
// M1 以降に intent を足して admitMilestone を通す。縁の返し・NEAR の滑り・判定文字は判定の返しなので数えない。
// 受け入れは演出を出すときに 1 回だけ決める（フレームごとに決め直さない）。超過は捨てずに「縁 2 px」へ格下げする。
// 時刻は実時間 ms。純関数（状態は値で受けて値で返す）。

/** 直近の窓 ms と、その中で受け入れる閃光の数 */
export const FLASH_WINDOW_MS = 1000
export const FLASH_MAX = 3
/** 同時に光る面積の上限（落下域＋鍵盤図の面積に対する比） */
export const FLASH_AREA_MAX = 0.25
/** 閃光が光っている時間 ms（同時の面積を数える長さ。仮） */
export const FLASH_MS = 200
/** 格下げした閃光の縁の幅 px */
export const DEGRADED_WIDTH = 2
/** 節目の演出の最短の間隔 ms（§2.8「10 秒に 1 回まで」） */
export const MILESTONE_GAP_MS = 10_000

export type FlashMode = 'full' | 'degraded'

export type BudgetState = {
  /** 受け入れた閃光（時刻と面積 px²）。窓と光っている時間を過ぎた物は admitFlash が落とす */
  readonly flashes: readonly { readonly atMs: number; readonly area: number }[]
  /** 最後に通した節目の時刻 */
  readonly lastMilestoneMs: number | null
}

export function emptyBudget(): BudgetState {
  return { flashes: [], lastMilestoneMs: null }
}

/**
 * 閃光を 1 つ受け入れるか決める。直近 1,000 ms に受け入れた閃光が 3 つ未満、かつ今光っている閃光の面積＋これの面積が
 * 落下域＋鍵盤図の 25% 以下なら full、どちらかを超えたら degraded（受け入れた数・面積には入れない）。
 */
export function admitFlash(
  state: BudgetState,
  atMs: number,
  area: number,
  stageArea: number,
): { state: BudgetState; mode: FlashMode } {
  const keep = Math.max(FLASH_WINDOW_MS, FLASH_MS)
  const recent = state.flashes.filter((f) => atMs - f.atMs < keep)
  const inWindow = recent.filter((f) => atMs - f.atMs < FLASH_WINDOW_MS).length
  const lit = recent.filter((f) => atMs - f.atMs < FLASH_MS).reduce((s, f) => s + f.area, 0)
  const ok = inWindow < FLASH_MAX && lit + area <= FLASH_AREA_MAX * stageArea
  if (!ok) return { state: { ...state, flashes: recent }, mode: 'degraded' }
  return { state: { ...state, flashes: [...recent, { atMs, area }] }, mode: 'full' }
}

/** 節目の演出を出してよいか（前の節目から 10 秒以上）。出すなら時刻を記録した状態を返す */
export function admitMilestone(
  state: BudgetState,
  atMs: number,
): { state: BudgetState; ok: boolean } {
  if (state.lastMilestoneMs !== null && atMs - state.lastMilestoneMs < MILESTONE_GAP_MS)
    return { state, ok: false }
  return { state: { ...state, lastMilestoneMs: atMs }, ok: true }
}
