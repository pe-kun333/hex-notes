// ms 表（M0-02）。出どころ: docs/design.md §3.2「読み込み時に ms 表へ」、m5 makeClock（b2s／s2b）。
// tempo[] を区間に展開し、区間の開始 ms を累積する（Δbeat × 60000 / bpm）。ms は float のまま返す。
// tempo は validateChart 済み（先頭 beat 0・昇順・1 つ以上）が前提。空は RangeError（kickoff 手順 2 の
// 手直し「bpm 既定 120 → pulse.tempo 必須」。m5 の既定 120 は持たない）。並び直しと同拍の後勝ちは安全網。
// グローバル状態なし。DOM・Node のどちらにも触れない（tools/ からも import する）。

import type { MsSegment, Pulse, TempoPoint } from '../shared/types.ts'
import { DEFAULT_RESOLUTION } from '../shared/types.ts'

export interface MsTable {
  resolution: number
  /** beat 昇順。先頭の beat は 0 以下（tempo の先頭が 0 より後なら beat 0 を先頭の bpm で補う） */
  segments: MsSegment[]
  /** beat を含む区間の ms + (beat − 区間 beat) × 60000 / bpm。先頭より前は先頭区間で外挿 */
  beatToMs(beat: number): number
  /** beatToMs の逆 */
  msToBeat(ms: number): number
}

export function buildMsTable(pulse: Pulse): MsTable {
  const segments = expandSegments(pulse.tempo)
  const resolution = isPositive(pulse.resolution) ? pulse.resolution : DEFAULT_RESOLUTION
  return {
    resolution,
    segments,
    beatToMs: (beat) => beatToMsIn(segments, beat),
    msToBeat: (ms) => msToBeatIn(segments, ms),
  }
}

/** テンポ倍率 rate（§4.3 results.rate、練習のテンポ段）を掛けた時刻。rate 0.75 なら 1/0.75 倍に伸びる */
export function scaleMs(ms: number, rate: number): number {
  if (!isPositive(rate)) throw new RangeError(`rate は正の数: ${rate}`)
  return ms / rate
}

/** beat を 1/resolution の倍数へ四捨五入（§3.2 Note.beat）。validate.ts の normalizeNote も同じ式を書いている */
export function quantizeBeat(beat: number, resolution: number): number {
  if (!isPositive(resolution)) throw new RangeError(`resolution は正の数: ${resolution}`)
  return Math.round(beat * resolution) / resolution
}

/** tempo を beat 昇順の区間に展開する。同じ拍は後勝ち（安全網）、空は RangeError。元の配列は触らない */
function expandSegments(tempo: readonly TempoPoint[]): MsSegment[] {
  if (tempo.length === 0) throw new RangeError('tempo は 1 つ以上（validateChart の empty と同じ）')
  for (const t of tempo) {
    if (!Number.isFinite(t.beat)) throw new RangeError(`tempo の beat は数: ${t.beat}`)
    if (!isPositive(t.bpm)) throw new RangeError(`tempo の bpm は正の数: ${t.bpm}`)
  }
  const points: TempoPoint[] = []
  for (const t of [...tempo].sort((a, b) => a.beat - b.beat)) {
    const last = points[points.length - 1]
    if (last && last.beat === t.beat) points[points.length - 1] = t
    else points.push(t)
  }
  const first = points[0]
  if (first && first.beat > 0) points.unshift({ beat: 0, bpm: first.bpm })

  const segments: MsSegment[] = []
  let ms = 0
  for (const [i, p] of points.entries()) {
    segments.push({ beat: p.beat, bpm: p.bpm, ms })
    const next = points[i + 1]
    if (next) ms += ((next.beat - p.beat) * 60000) / p.bpm
  }
  // MsSegment.ms は拍 0 を 0 とする。先頭の拍が負のときだけずれるので引き戻す
  const origin = beatToMsIn(segments, 0)
  return origin === 0 ? segments : segments.map((s) => ({ ...s, ms: s.ms - origin }))
}

function beatToMsIn(segments: readonly MsSegment[], beat: number): number {
  const s = segmentAt(segments, 'beat', beat)
  return s.ms + ((beat - s.beat) * 60000) / s.bpm
}

function msToBeatIn(segments: readonly MsSegment[], ms: number): number {
  const s = segmentAt(segments, 'ms', ms)
  return s.beat + ((ms - s.ms) * s.bpm) / 60000
}

/** key が value 以下の最後の区間（二分探索）。value が先頭より前なら先頭区間 */
function segmentAt(segments: readonly MsSegment[], key: 'beat' | 'ms', value: number): MsSegment {
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    const s = segments[mid]
    if (s && s[key] <= value) lo = mid
    else hi = mid - 1
  }
  const found = segments[lo]
  if (!found) throw new Error('ms 表が空')
  return found
}

function isPositive(x: number): boolean {
  return Number.isFinite(x) && x > 0
}
