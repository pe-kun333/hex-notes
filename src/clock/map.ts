// 時計の写像と軸の換算（M0-05、手順 7、decisions #32 (d)(e)、仮）。時計の出力 map（t ＝ a·perf ＋ b）で、判定層
// （tsPerf → 曲 ms、nowAt(t_n)）・音源層（曲 ms → perf）・描画（t.song）が同じ一つの写像を使う。
// 時計の t は動画の軸（動画なしで始めた曲は譜面の軸と同じ）。譜面の軸（ms 表、拍 0 ＝ 0）へは sync.sources[0] の
// offset（秒、拍 0 の動画時刻）と rate（動画 BPM ÷ 譜面 BPM）で換算する。校正のオフセットはここに入れない（手順 8）。

import type { SyncSource } from '../shared/types.ts'
import type { ClockMap } from './types.ts'

/** 換算に使う同期の値（sources が空か kind audio なら offset 0・rate 1） */
export type SyncAxis = Pick<SyncSource, 'offset' | 'rate'>

export const IDENTITY_AXIS: SyncAxis = Object.freeze({ offset: 0, rate: 1 })

/** sync.sources[0] から軸を取る（/1 は sources[0] だけ読む。§3.2） */
export function axisOf(sources: readonly SyncSource[]): SyncAxis {
  const s = sources[0]
  return s === undefined || s.kind === 'audio' ? IDENTITY_AXIS : { offset: s.offset, rate: s.rate }
}

/** perf（ms）→ 時計の t */
export function songAt(map: ClockMap, perf: number): number {
  return map.a * perf + map.b
}

/** 時計の t → perf（nowAt）。止まった時計（a ≤ 0）は届かないので Infinity */
export function perfAt(map: ClockMap, t: number): number {
  return map.a > 0 ? (t - map.b) / map.a : Infinity
}

/** 動画の軸の ms → 譜面の ms（(t − offset·1000)·rate） */
export function toChartMs(t: number, axis: SyncAxis): number {
  return (t - axis.offset * 1000) * axis.rate
}

/** 譜面の ms → 動画の軸の ms */
export function fromChartMs(chartMs: number, axis: SyncAxis): number {
  return chartMs / axis.rate + axis.offset * 1000
}

/** 写像を譜面の軸へ（線形なので係数を写すだけ） */
export function toChartMap(map: ClockMap, axis: SyncAxis): ClockMap {
  return { a: map.a * axis.rate, b: (map.b - axis.offset * 1000) * axis.rate }
}
