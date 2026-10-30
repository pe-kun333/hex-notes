// メトロノーム（M0-08、手順 10）。出どころ: m5 `clickAt` L448（そのまま: 矩形波 1400／1000 Hz、0.14 から 40 ms で
// 0.0005 へ、50 ms で止める）、m1' update L345 の拍の数え方（4 拍ごとに強拍）を pulse.timeSig の小節頭に直した。
// 拍の時刻は ms 表（src/chart/mstable.ts）。計画は純関数、鳴らすのは playClick。

import { buildMsTable } from '../chart/mstable.ts'
import type { Pulse } from '../shared/types.ts'

export const CLICK_HZ = 1000
export const CLICK_ACCENT_HZ = 1400
export const CLICK_GAIN = 0.14
export const CLICK_FLOOR = 0.0005
export const CLICK_DECAY_S = 0.04
export const CLICK_STOP_S = 0.05

export interface BeatClick {
  /** 譜面の ms */
  readonly tMs: number
  readonly beat: number
  /** 小節の頭（強拍） */
  readonly accent: boolean
}

/** 小節の拍数（拍＝4 分音符。timeSig が無ければ 4/4。m1' L345 の 4 拍ごと） */
function barBeatsAt(pulse: Pulse, beat: number): { start: number; len: number } {
  let start = 0
  let len = 4
  for (const ts of pulse.timeSig ?? []) {
    if (ts.beat > beat) break
    start = ts.beat
    len = (ts.num * 4) / ts.den
  }
  return { start, len }
}

/**
 * [fromMs, toMs) の整数拍の打点。強拍は拍子の区間の頭から小節の長さの倍数の拍（6/8 なら 3 拍ごと。半端な長さの
 * 拍子では小節の頭が整数拍に来たときだけ）。fromMs が負なら拍 0 から（予備の拍は鳴らさない。カウントインは M1）。
 */
export function beatClicks(pulse: Pulse, fromMs: number, toMs: number): BeatClick[] {
  if (!Number.isFinite(toMs) || !Number.isFinite(fromMs))
    throw new RangeError('beatClicks: 範囲は有限の ms')
  const ms = buildMsTable(pulse)
  const out: BeatClick[] = []
  for (let beat = Math.max(0, Math.ceil(ms.msToBeat(Math.max(0, fromMs)) - 1e-9)); ; beat++) {
    const tMs = ms.beatToMs(beat)
    if (tMs >= toMs) break
    if (tMs < fromMs) continue
    const bar = barBeatsAt(pulse, beat)
    const k = (beat - bar.start) / bar.len
    out.push({ tMs, beat, accent: Math.abs(k - Math.round(k)) < 1e-9 })
  }
  return out
}

/** Web Audio で 1 打（t は context の秒） */
export function playClick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  accent: boolean,
  gain = 1,
): AudioScheduledSourceNode {
  const o = ctx.createOscillator()
  o.type = 'square'
  o.frequency.value = accent ? CLICK_ACCENT_HZ : CLICK_HZ
  const g = ctx.createGain()
  g.gain.setValueAtTime(CLICK_GAIN * gain, t)
  g.gain.exponentialRampToValueAtTime(CLICK_FLOOR, t + CLICK_DECAY_S)
  o.connect(g)
  g.connect(dest)
  o.start(t)
  o.stop(t + CLICK_STOP_S)
  return o
}
