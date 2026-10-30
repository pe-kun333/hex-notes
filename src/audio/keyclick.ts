// 打鍵音（M0-08、手順 10）。出どころ: design.md §2.9「打鍵音は誤打のみ −18 dB・300 ms（仮）」、R1 tech-10（先読み予約／
// 誤打のみ）、m5 `tapTick` L449（音の無い鍵の短い音）。正しい押下は旋律が先読みで予約されているので鳴らさず、判定層の
// 空打ち（stray の window。窓の外か鍵違い）だけを、その鍵の音高で小さく短く鳴らす（decisions #48、仮）。
// 一時停止中など時計が止まっている間の押下（stray の stopped）は鳴らさない。

import type { JudgeOutcome } from '../judge/judge.ts'
import type { KeyCode } from '../shared/types.ts'
import { SYNTH_PEAK } from './synth.ts'

export const KEYCLICK_DB = -18
export const KEYCLICK_MS = 300
/** −18 dB の振幅比（≈ 0.1259） */
export const KEYCLICK_GAIN = 10 ** (KEYCLICK_DB / 20)
/** 音の無い鍵の短い音（m5 tapTick L449: 三角波 520 Hz、0.1 から 30 ms で減衰、40 ms で止める） */
export const TICK_HZ = 520
export const TICK_GAIN = 0.1
export const TICK_DECAY_S = 0.03
export const TICK_STOP_S = 0.04

export type KeyclickPlan =
  /** その鍵の音高を合成音で（振幅は vel 1 の −18 dB、長さ 300 ms） */
  | { readonly kind: 'note'; readonly midi: number; readonly v: number; readonly holdS: number }
  /** 音の無い鍵 */
  | { readonly kind: 'tick'; readonly gain: number }

/** 判定の事象 1 つから打鍵音を決める。誤打（stray の window）だけ。他は null */
export function keyclickFor(
  o: JudgeOutcome,
  midiOfKey: (code: KeyCode) => number | null,
): KeyclickPlan | null {
  if (o.kind !== 'stray' || o.reason !== 'window') return null
  const midi = midiOfKey(o.code)
  return midi === null
    ? { kind: 'tick', gain: KEYCLICK_GAIN }
    : { kind: 'note', midi, v: KEYCLICK_GAIN, holdS: KEYCLICK_MS / 1000 }
}

/** 合成音の頂点（vel 1 で 0.28）に −18 dB を掛けた振幅（試験と開発ページの表示用） */
export function keyclickPeak(): number {
  return SYNTH_PEAK * KEYCLICK_GAIN
}

/** 音の無い鍵の短い音を鳴らす（t は context の秒） */
export function playTick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  gain: number,
): AudioScheduledSourceNode {
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.value = TICK_HZ
  const g = ctx.createGain()
  g.gain.setValueAtTime(TICK_GAIN * gain, t)
  g.gain.exponentialRampToValueAtTime(0.0005, t + TICK_DECAY_S)
  o.connect(g)
  g.connect(dest)
  o.start(t)
  o.stop(t + TICK_STOP_S)
  return o
}
