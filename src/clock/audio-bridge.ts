// AudioContext の時刻 ↔ performance の換算（M0-05、手順 7、decisions #37、仮）。音源層（手順 10）が曲 ms → perf
// （map.ts の perfAt）→ context 秒で発音を予約するときに使う。AudioContext は作らず数値だけ受ける（試験で作らない）。
// 出どころ: design.md §2.6「AudioContext.currentTime は発音予約だけ（getOutputTimestamp で対応）」、m3 `startCal`
// L442–445（getOutputTimestamp の組は出力遅延込み〔contextTime は今出力しているフレーム〕なので outputLatency は足さない。
// 組が無い環境だけ今の時刻＋outputLatency で退避）。

/** getOutputTimestamp() の戻り（無い環境・例外は null） */
export interface OutputTimestamp {
  contextTime?: number
  performanceTime?: number
}

/** 1 回分の AudioContext の読み（呼ぶ側が同じタスクの中で集める。currentTime・遅延は秒、now は ms） */
export interface AudioClockReading {
  stamp: OutputTimestamp | null
  currentTime: number
  now: number
  outputLatency?: number
  baseLatency?: number
}

/** 対応点: context の ctxSec 秒が perf の perfMs に聞こえる */
export interface AudioBridge {
  ctxSec: number
  perfMs: number
  /** 対応点の出どころ（開発ページ・計測の注記） */
  via: 'outputTimestamp' | 'latency'
}

const positive = (x: number | undefined): x is number =>
  x !== undefined && Number.isFinite(x) && x > 0

/**
 * 対応点を作る。stamp の contextTime が有限で performanceTime が有限かつ 0 より大きければ (contextTime, performanceTime)。
 * でなければ (currentTime, now ＋ 遅延·1000)。遅延は outputLatency、無いか 0 以下なら baseLatency、それも無ければ 0
 * （m3 L442 の `outputLatency || baseLatency || 0`）。
 */
export function bridgeOf(r: AudioClockReading): AudioBridge {
  const s = r.stamp
  if (
    s !== null &&
    s.contextTime !== undefined &&
    Number.isFinite(s.contextTime) &&
    positive(s.performanceTime)
  )
    return { ctxSec: s.contextTime, perfMs: s.performanceTime, via: 'outputTimestamp' }
  const lat = positive(r.outputLatency)
    ? r.outputLatency
    : positive(r.baseLatency)
      ? r.baseLatency
      : 0
  return { ctxSec: r.currentTime, perfMs: r.now + lat * 1000, via: 'latency' }
}

/** context の秒 → perf ms（その音が聞こえる時刻） */
export function perfOfContext(b: AudioBridge, ctxSec: number): number {
  return b.perfMs + (ctxSec - b.ctxSec) * 1000
}

/** perf ms → context の秒（その時刻に聞こえるように予約する時刻） */
export function contextOfPerf(b: AudioBridge, perfMs: number): number {
  return b.ctxSec + (perfMs - b.perfMs) / 1000
}
