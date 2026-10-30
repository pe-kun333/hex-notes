// 低負荷モード（M0-03b、手順 6）。出どころ: design.md §2.8「rAF 間隔の 95 パーセンタイルが 20 ms 超を 10 秒続けたら
// 『演出なし→殻なし→奥行きなし』の順に自動で落とし帯で知らせる（仮、M-7）」、kickoff §7-18（低負荷の閾は自作値）、
// decisions #29（窓と数え方、仮）。自動では上げない（戻すのは S6 の設定、M1-07）。
// フレームの時刻（rAF の引数か performance.now。app/ が読む）を値で受ける純関数。

/** 0 ＝ 通常、1 ＝ 演出なし、2 ＝ 殻なし（＋演出なし）、3 ＝ 奥行きなし（＋殻なし・演出なし） */
export type LowLoadLevel = 0 | 1 | 2 | 3

/** p95 を取る窓 ms（直近のフレーム間隔。仮） */
export const LOWLOAD_WINDOW_MS = 1000
/** 遅いとみなす p95 の閾 ms（§2.8） */
export const LOWLOAD_P95_MS = 20
/** 遅い状態が続いたら 1 段落とす長さ ms（§2.8） */
export const LOWLOAD_HOLD_MS = 10_000

export type LowLoadState = {
  readonly level: LowLoadLevel
  /** 直前のフレームの時刻 */
  readonly lastMs: number | null
  /** 窓の中のフレーム間隔（終わりの時刻と間隔） */
  readonly samples: readonly { readonly atMs: number; readonly dt: number }[]
  /** p95 が閾を超え続けている区間の始まり（その間隔の始まりの時刻）。超えていなければ null */
  readonly slowSinceMs: number | null
}

export function initialLowLoad(level: LowLoadLevel = 0): LowLoadState {
  return { level, lastMs: null, samples: [], slowSinceMs: null }
}

/** 95 パーセンタイル（最近接順位: 昇順の ⌈0.95·n⌉ 番目） */
export function p95(values: readonly number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[Math.max(0, Math.ceil(0.95 * s.length) - 1)] ?? 0
}

/**
 * 1 フレームを数える。窓の p95 が 20 ms を超えた最初の間隔の始まりから 10 秒続いたら 1 段落とし（3 で止まる）、
 * 数え直す。p95 が閾以下に戻ったら区間を切る。1,000 ms を超える間隔は途切れとして窓と区間を捨てる（呼ぶ側は
 * 一時停止・非表示の間はフレームを渡さない）。changed は段が変わった回（帯で知らせる）。
 */
export function feedFrame(
  state: LowLoadState,
  frameMs: number,
): { state: LowLoadState; changed: boolean } {
  if (state.lastMs === null || !(frameMs > state.lastMs))
    return { state: { ...state, lastMs: frameMs }, changed: false }
  const dt = frameMs - state.lastMs
  // 窓より長い間隔は途切れ（非表示・一時停止で rAF が止まった）とみなし、数え直す（遅さに数えない）
  if (dt > LOWLOAD_WINDOW_MS)
    return {
      state: { level: state.level, lastMs: frameMs, samples: [], slowSinceMs: null },
      changed: false,
    }
  const samples = [...state.samples, { atMs: frameMs, dt }].filter(
    (s) => frameMs - s.atMs < LOWLOAD_WINDOW_MS,
  )
  const slow = p95(samples.map((s) => s.dt)) > LOWLOAD_P95_MS
  let slowSince = slow ? (state.slowSinceMs ?? state.lastMs) : null
  let level = state.level
  let changed = false
  if (slowSince !== null && frameMs - slowSince >= LOWLOAD_HOLD_MS && level < 3) {
    level = (level + 1) as LowLoadLevel
    changed = true
    slowSince = frameMs
  }
  return { state: { level, lastMs: frameMs, samples, slowSinceMs: slowSince }, changed }
}

/** 段の効き目（描画の切り替え） */
export function lowLoadEffects(level: LowLoadLevel): {
  flashes: boolean
  shells: boolean
  depth: boolean
} {
  return { flashes: level < 1, shells: level < 2, depth: level < 3 }
}
