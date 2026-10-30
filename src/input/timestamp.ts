// 入力レコードの時刻 tsPerf（M0-04、手順 5）。出どころ: decisions #25（仮、相談 E、docs/planning/consult/E-tsperf.md）、
// design.md §2.8・§4.1・§4.6。tsPerf は Event.timeStamp（performance.timeOrigin 基準）。主スレッドの待ちを含まない
// ので判定に使う。使えない値（非有限・0 以下・now より後）だけハンドラ内の now に落とす。量子化の補正（+q/2）は
// しない（Chromium と Firefox の丸めは区間ごとの乱数の閾で偏りがない）。now は src/app/ がハンドラの冒頭で 1 回読む。

/** ok ＝ timeStamp をそのまま、stale ＝ 古いがそのまま、future・nonfinite・nonpositive ＝ now に落とした */
export type TsReason = 'ok' | 'stale' | 'future' | 'nonfinite' | 'nonpositive'

export interface TsPerf {
  tsPerf: number
  reason: TsReason
  /** 入力遅延の標本 now − timeStamp（ok だけ。他は null） */
  lag: number | null
}

/**
 * now − timeStamp がこれを超えたら stale（仮）。判定窓の最大（入門者の遅れ側 234 ms）より十分大きい。
 * stale でも timeStamp を保つ（長いタスクの後に now へ寄せると、古い押下が今のノートに当たる）。lag には入れない。
 */
export const TS_STALE_MS = 1000

export function toTsPerf(timeStamp: number, now: number): TsPerf {
  if (!Number.isFinite(timeStamp)) return { tsPerf: now, reason: 'nonfinite', lag: null }
  if (timeStamp <= 0) return { tsPerf: now, reason: 'nonpositive', lag: null }
  // エポック基準の値（古い Safari）や時計のずれ。少しの先行も含めて一律に now
  if (timeStamp > now) return { tsPerf: now, reason: 'future', lag: null }
  if (now - timeStamp > TS_STALE_MS) return { tsPerf: timeStamp, reason: 'stale', lag: null }
  return { tsPerf: timeStamp, reason: 'ok', lag: now - timeStamp }
}

/** 中央値（入力遅延中央値 §4.6）。空なら null。偶数個は中の 2 つの平均 */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 === 1 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}
