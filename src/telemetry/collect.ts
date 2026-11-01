// プレイ 1 回の計測を貯めて play 行にする（M0-12、手順 12）。出どころ: design.md §4.6（play 行の項目）・§6.3 M-2・M-7、
// m3 `welford` L404（そのまま: 平均と n − 1 の SD を逐次に）・`recordResult` L407–410（手直し: 文字の表 → §4.6 の行、
// 入力遅延は mean → 中央値）、decisions #25（入力遅延中央値、標本が無ければ null）・#32 (f)（再同期回数・動画なし切替・
// 時計残差の数え方）・#47（audioLateMaxMs）・#54（仮）。
// 状態を値で持つ純関数。呼ぶ側（app/）が時計の出力ごとに collectClock、rAF ごとに collectFrame、演奏の押下ごとに
// collectPress を呼び、終わりに判定層の summarizeJudge と音源層の lateMaxMs を添えて playRow で行にする。
// 動画 ID は行に入れない（§4.6。clock は video／novideo だけ）。

import { toChartMs, type SyncAxis } from '../clock/map.ts'
import type { ClockOutput, ResyncReason } from '../clock/types.ts'
import { median } from '../input/timestamp.ts'
import type { JudgeSummary } from '../judge/judge.ts'
import type { ClockKind, PlayMode, PlayTelemetry, Profile } from '../shared/types.ts'

// ---------- 逐次の平均と SD（m3 welford L404） ----------

export interface Welford {
  readonly n: number
  /** 平均 */
  readonly m: number
  /** 偏差の二乗和 */
  readonly s: number
}

export const EMPTY_WELFORD: Welford = { n: 0, m: 0, s: 0 }

export function welfordAdd(w: Welford, x: number): Welford {
  const n = w.n + 1
  const d = x - w.m
  const m = w.m + d / n
  return { n, m, s: w.s + d * (x - m) }
}

/** 標本 SD（n − 1）。2 つ未満なら null（m3 は NaN） */
export function welfordSd(w: Welford): number | null {
  return w.n > 1 ? Math.sqrt(w.s / (w.n - 1)) : null
}

// ---------- フレーム間隔の階級（p95） ----------

/** これを超える間隔は途切れ（非表示・長い停止）として入れない（低負荷の窓と同じ。decisions #29） */
export const FRAME_GAP_MS = 1000
/** p95 の階級は 1 ms 幅で [0, FRAME_BINS)、それ以上は最後の階級にまとめる */
export const FRAME_BINS = 100

/**
 * 95 パーセンタイル（最近接順位: ⌈0.95·n⌉ 番目の入る 1 ms の階級の上端。見た最大を超えない。最後の階級なら見た最大）。
 * 生の値の p95（src/render/canvas/lowload.ts の p95）以上で、差は 1 ms 未満
 */
export function p95OfBins(bins: readonly number[], max: number): number | null {
  const n = bins.reduce((a, b) => a + b, 0)
  if (n === 0) return null
  const rank = Math.ceil(0.95 * n)
  let acc = 0
  for (let k = 0; k < bins.length; k++) {
    acc += bins[k] ?? 0
    if (acc >= rank) return k >= FRAME_BINS ? max : Math.min(k + 1, max)
  }
  return max
}

// ---------- 1 回の計測 ----------

/** 再同期回数に数える理由（動画の側の飛び・PLAYING への復帰・広告明け。decisions #32 (f)） */
export const RESYNC_COUNTED: ReadonlySet<ResyncReason> = new Set(['jump', 'unheld', 'adEnd'])

export interface PlayCollect {
  readonly resyncCount: number
  /** 最初の novideo の事象の t（動画の軸）。無ければ null */
  readonly fallbackT: number | null
  /** locked の tick の dev */
  readonly clockDev: Welford
  readonly lastFrameMs: number | null
  readonly frames: Welford
  /** 長さ FRAME_BINS ＋ 1 */
  readonly frameBins: readonly number[]
  readonly frameMax: number
  /** ok の押下の now − timeStamp */
  readonly lags: readonly number[]
  readonly pressCount: number
}

export function initialCollect(): PlayCollect {
  return {
    resyncCount: 0,
    fallbackT: null,
    clockDev: EMPTY_WELFORD,
    lastFrameMs: null,
    frames: EMPTY_WELFORD,
    frameBins: new Array<number>(FRAME_BINS + 1).fill(0),
    frameMax: 0,
    lags: [],
    pressCount: 0,
  }
}

/** 時計の出力 1 つ（tick・命令・idle のどれも）。事象は出力ごとに新しいので、全ての出力を渡す */
export function collectClock(
  c: PlayCollect,
  out: Pick<ClockOutput, 'events' | 'phase' | 'dev'>,
): PlayCollect {
  let { resyncCount, fallbackT, clockDev } = c
  for (const ev of out.events) {
    if (ev.kind === 'resync' && RESYNC_COUNTED.has(ev.reason)) resyncCount++
    else if (ev.kind === 'novideo' && fallbackT === null) fallbackT = ev.t
  }
  if (out.phase === 'locked' && out.dev !== null) clockDev = welfordAdd(clockDev, out.dev)
  if (resyncCount === c.resyncCount && fallbackT === c.fallbackT && clockDev === c.clockDev)
    return c
  return { ...c, resyncCount, fallbackT, clockDev }
}

/** rAF 1 回（ms は rAF の引数か performance.now。app/ が読む） */
export function collectFrame(c: PlayCollect, ms: number): PlayCollect {
  const last = c.lastFrameMs
  if (last === null || !(ms > last)) return { ...c, lastFrameMs: ms }
  const dt = ms - last
  if (dt > FRAME_GAP_MS) return { ...c, lastFrameMs: ms }
  const bins = [...c.frameBins]
  const k = Math.min(FRAME_BINS, Math.floor(dt))
  bins[k] = (bins[k] ?? 0) + 1
  return {
    ...c,
    lastFrameMs: ms,
    frames: welfordAdd(c.frames, dt),
    frameBins: bins,
    frameMax: Math.max(c.frameMax, dt),
  }
}

/** 演奏の押下 1 つ（lag は入力層の press の lag。timeStamp が使えない・古いときは null） */
export function collectPress(c: PlayCollect, lag: number | null): PlayCollect {
  return {
    ...c,
    pressCount: c.pressCount + 1,
    lags: lag === null ? c.lags : [...c.lags, lag],
  }
}

/** SyncUsed.fallbackAt（動画なしへ切り替えた曲の ms）。切り替えていなければ undefined */
export function fallbackAtMs(c: PlayCollect, axis: SyncAxis): number | undefined {
  return c.fallbackT === null ? undefined : toChartMs(c.fallbackT, axis)
}

export interface PlayMeta {
  readonly chartId: string
  readonly variantId: string
  readonly profile: Profile
  readonly clock: ClockKind
  readonly mode: PlayMode
  /** テンポ段・鍵数制限・練習の要約（M2-03。§4.6 の改訂、m2-kickoff §7-20。無ければ行に書かない） */
  readonly rate?: number
  readonly keyset?: string
  readonly practice?: PlayTelemetry['practice']
  /** 途中終了（M2-05。無ければ行に書かない） */
  readonly aborted?: boolean
}

/**
 * play 行（§4.6）。judge は判定層の summarizeJudge、audioLateMaxMs は音源層の予約の遅れの最大（音を予約しない回は
 * null）、at は行の時刻（ISO 8601、app/ が Date で作る）
 */
export function playRow(
  c: PlayCollect,
  meta: PlayMeta,
  judge: Pick<JudgeSummary, 'ur' | 'hist' | 'acc' | 'nearRate'>,
  audioLateMaxMs: number | null,
  at: string,
): PlayTelemetry {
  return {
    kind: 'play',
    at,
    chartId: meta.chartId,
    variantId: meta.variantId,
    profile: meta.profile,
    clock: meta.clock,
    mode: meta.mode,
    ur: judge.ur,
    hist: { ...judge.hist },
    acc: judge.acc,
    nearRate: judge.nearRate,
    resyncCount: c.resyncCount,
    fallback: c.fallbackT !== null,
    inputLatencyMedian: median(c.lags),
    pressCount: c.pressCount,
    pressNoLag: c.pressCount - c.lags.length,
    frameIntervalSd: welfordSd(c.frames),
    frameIntervalP95: p95OfBins(c.frameBins, c.frameMax),
    clockResidualSd: welfordSd(c.clockDev),
    audioLateMaxMs,
    ...(meta.rate === undefined ? {} : { rate: meta.rate }),
    ...(meta.keyset === undefined ? {} : { keyset: meta.keyset }),
    ...(meta.practice === undefined ? {} : { practice: meta.practice }),
    ...(meta.aborted === undefined ? {} : { aborted: meta.aborted }),
  }
}
