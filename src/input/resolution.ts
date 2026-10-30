// timeStamp の刻みの推定（M0-04、手順 5）。出どころ: decisions #25（仮、相談 E、docs/planning/consult/E-tsperf.md）、
// design.md §4.3（hexnote.device.tsResolution）・§4.6（device 行の「timeStamp の刻み」）。標本は実際の keydown・keyup
// の timeStamp（合成イベントや performance.now ではブラウザの丸めしか見えず、OS の入力時刻の刻みが出ない）。
// 刻みの候補（梯子）と出どころは docs/references.md L24（ブラウザの時刻の刻み）。粗くても判定窓・tsPerf は変えず、注記だけ（呼ぶ側）。

/** 刻みの候補（ms）と、隣との差がその倍数とみなす許し。大きい順に試す */
export interface GridStep {
  q: number
  tol: number
}

/**
 * 100 ＝ 指紋対策を強めた環境、16.667 ＝ Firefox の resistFingerprinting、15.625 ＝ Windows の入力時刻の tick
 * （整数 ms に落ちた後に丸めが乗るので許しを 2 ms）、1 ＝ Firefox・Safari 既定、0.1 ＝ Chromium、0.02・0.005 ＝ 隔離時。
 * 許しは 15.625 以外 q/100。
 */
export const TS_GRID_LADDER: readonly GridStep[] = [
  { q: 100, tol: 1 },
  { q: 16.667, tol: 0.16667 },
  { q: 15.625, tol: 2 },
  { q: 1, tol: 0.01 },
  { q: 0.1, tol: 0.001 },
  { q: 0.02, tol: 0.0002 },
  { q: 0.005, tol: 0.00005 },
]

/** 重複を除いた標本がこれ未満なら推定しない（仮） */
export const TS_MIN_UNIQUE = 20
/** 近傍一致率の下限（仮） */
export const TS_FIT_MIN = 0.9
/** これ以上の刻みを「判定が粗い環境」とする（仮） */
export const TS_COARSE_MS = 8
/** 同じ値とみなす差（ms） */
const SAME_EPS = 1e-6

export interface TsResolution {
  /** 梯子の q（ms）。0 ＝ どれにも当てはまらない、null ＝ 標本不足。どちらも保存しない */
  q: number | null
  /** 選んだ q の近傍一致率（0〜1）。q が 0 か null なら 0 */
  fit: number
  /** 有限で重複を除いた標本の数 */
  n: number
}

/**
 * 刻みの推定。有限の値を昇順に並べて重複を除き、梯子の大きい q から順に、左右どちらかの隣との差 d が
 * q の倍数（k ＝ round(d/q) ≥ 1 かつ |d − k·q| ≤ tol）である値の割合（近傍一致率）を見て、TS_FIT_MIN 以上の
 * 最初の q を返す。位相（格子の起点）に依らず、孤立した外れ値は自分（と端の隣）だけを不一致にする。
 * 限界: 1 ms の倍数の格子（2〜10 ms）は 1 と出る（梯子に無いので見分けられない）。
 */
export function estimateTsResolution(samples: readonly number[]): TsResolution {
  const sorted = samples.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  const v: number[] = []
  for (const x of sorted) {
    const last = v[v.length - 1]
    if (last === undefined || x - last > SAME_EPS) v.push(x)
  }
  const n = v.length
  if (n < TS_MIN_UNIQUE) return { q: null, fit: 0, n }
  for (const { q, tol } of TS_GRID_LADDER) {
    const onGrid = (d: number): boolean => {
      const k = Math.round(d / q)
      return k >= 1 && Math.abs(d - k * q) <= tol
    }
    let hit = 0
    for (let i = 0; i < n; i++) {
      const cur = v[i] as number
      const prev = v[i - 1]
      const next = v[i + 1]
      if ((prev !== undefined && onGrid(cur - prev)) || (next !== undefined && onGrid(next - cur)))
        hit++
    }
    if (hit / n >= TS_FIT_MIN) return { q, fit: hit / n, n }
  }
  return { q: 0, fit: 0, n }
}

/** 判定が粗い環境か（注記を出すか）。q が null・0 は「分からない」で false */
export function isCoarse(q: number | null): boolean {
  return q !== null && q >= TS_COARSE_MS
}
