// AudioContext と出力の配線（M0-08、手順 10）。出どころ: m5 `ensureAudio` L440–442（そのまま: 主音量 0.7 →
// コンプレッサ −18 dB・4:1 → 出力、作った直後も resume）、design.md §2.6（AudioContext.currentTime は発音予約だけ）、
// decisions #37（audio-bridge）・#47（仮）。Web Audio に触れる薄い部分で、試験では作らない（開発ページ audio-dev で鳴らす）。
// 状態は createAudioOut が返す物に持つ（グローバルに置かない）。AudioContext は利用者の操作の中で作る（自動再生の制限）。

import type { AudioClockReading } from '../clock/audio-bridge.ts'
import type { KeyclickPlan } from './keyclick.ts'
import { playTick } from './keyclick.ts'
import { playClick } from './metronome.ts'
import { nearestSample, playSample, sampleGain } from './sampler.ts'
import type { ScheduledSound, SoundPart } from './scheduler.ts'
import { SYNTH_MAX_S, SYNTH_TAIL_S, playSynth, synthPlan, vel01, type NoiseCache } from './synth.ts'

/** 主音量とコンプレッサ（m5 L440。自作値、kickoff §7-18） */
export const MASTER_GAIN = 0.7
export const COMP_THRESHOLD_DB = -18
export const COMP_RATIO = 4

/** 部ごとの音量（ガイド音・伴奏・メトロノーム・打鍵音。S6 の音量の既定。仮） */
export const PART_GAINS: Readonly<Record<SoundPart | 'key', number>> = Object.freeze({
  melody: 0.6,
  accomp: 0.45,
  click: 1,
  key: 1,
})

export interface AudioOut {
  readonly ctx: AudioContext
  readonly master: GainNode
  readonly buses: Readonly<Record<SoundPart | 'key', GainNode>>
  readonly noise: NoiseCache
  /** 読めた Salamander の録音（音高 → バッファ）。空なら合成音 */
  samples: ReadonlyMap<number, AudioBuffer>
  /** 予約した音（止めるとき用。鳴り終われば外す） */
  readonly live: Set<{ node: AudioScheduledSourceNode; start: number }>
}

/** 出力を作る（利用者の操作の中で呼ぶ） */
export function createAudioOut(make: () => AudioContext = () => new AudioContext()): AudioOut {
  const ctx = make()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = COMP_THRESHOLD_DB
  comp.ratio.value = COMP_RATIO
  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(comp)
  comp.connect(ctx.destination)
  const bus = (gain: number): GainNode => {
    const g = ctx.createGain()
    g.gain.value = gain
    g.connect(master)
    return g
  }
  const out: AudioOut = {
    ctx,
    master,
    buses: {
      melody: bus(PART_GAINS.melody),
      accomp: bus(PART_GAINS.accomp),
      click: bus(PART_GAINS.click),
      key: bus(PART_GAINS.key),
    },
    noise: new WeakMap(),
    samples: new Map(),
    live: new Set(),
  }
  void resumeAudio(out)
  return out
}

/** suspended なら resume（作った直後も呼ぶ。m5 L441） */
export async function resumeAudio(out: AudioOut): Promise<void> {
  if (out.ctx.state === 'running') return
  try {
    await out.ctx.resume()
  } catch {
    // 利用者の操作の外では resume が拒まれる。次の操作でまた呼ぶ
  }
}

/** audio-bridge に渡す読み（同じタスクの中で集める。now は呼ぶ側が読んだ performance.now） */
export function readAudioClock(ctx: AudioContext, now: number): AudioClockReading {
  let stamp: AudioClockReading['stamp'] = null
  try {
    stamp = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null
  } catch {
    stamp = null
  }
  return {
    stamp,
    currentTime: ctx.currentTime,
    now,
    outputLatency: ctx.outputLatency,
    baseLatency: ctx.baseLatency,
  }
}

function track(out: AudioOut, nodes: readonly AudioScheduledSourceNode[], start: number): void {
  for (const node of nodes) {
    const e = { node, start }
    out.live.add(e)
    node.addEventListener('ended', () => out.live.delete(e))
  }
}

/** 予約した 1 音を鳴らす。音高のある音は Salamander が読めていればそれ、無ければ合成音 */
export function playScheduled(out: AudioOut, s: ScheduledSound): void {
  const it = s.item
  const dest = out.buses[it.part]
  if (it.part === 'click' || it.midi === null) {
    track(out, [playClick(out.ctx, dest, s.ctxSec, it.accent)], s.ctxSec)
    return
  }
  const v = vel01(it.vel)
  const near = nearestSample(it.midi, out.samples.keys())
  const buf = near === null ? undefined : out.samples.get(near.midi)
  if (near !== null && buf !== undefined) {
    track(
      out,
      [playSample(out.ctx, dest, buf, near.rate, s.ctxSec, Math.max(0.1, s.holdS), sampleGain(v))],
      s.ctxSec,
    )
    return
  }
  const plan = synthPlan(it.midi, v, Math.min(SYNTH_MAX_S, s.holdS + SYNTH_TAIL_S))
  track(out, playSynth(out.ctx, dest, plan, s.ctxSec, out.noise), s.ctxSec)
}

/** 打鍵音（誤打）を今鳴らす */
export function playKeyclick(out: AudioOut, plan: KeyclickPlan): void {
  const t = out.ctx.currentTime
  const dest = out.buses.key
  if (plan.kind === 'tick') {
    playTick(out.ctx, dest, t, plan.gain)
    return
  }
  playSynth(out.ctx, dest, synthPlan(plan.midi, plan.v, plan.holdS), t, out.noise)
}

/** ctxSec 以後に始まる予約を止める（再アンカー・一時停止。鳴り始めた音は残す）。止めた数を返す */
export function cancelFrom(out: AudioOut, ctxSec: number): number {
  let n = 0
  for (const e of [...out.live]) {
    if (e.start < ctxSec) continue
    try {
      e.node.stop()
    } catch {
      // 既に止めた音
    }
    out.live.delete(e)
    n++
  }
  return n
}
