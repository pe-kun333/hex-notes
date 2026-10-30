// 合成音（M0-08、手順 10）。出どころ: m5 `playNoteAt` L443–447（そのまま: 6 倍音の正弦波＋短い雑音、音域で明るさを
// 変える減衰）、design.md §2.9（Salamander を読み終えるまで合成音で先に鳴らす）。係数は試作の自作値（kickoff §7-18、
// decisions #47、仮）。計画（純関数、試験する）と Web Audio で鳴らす薄い関数 playSynth を分ける。
// 雑音は m5 の Math.random を種付きの mulberry32（src/shared/random.ts）に替えた（鳴るたびに同じ雑音）。

import { mulberry32 } from '../shared/random.ts'

/** midi → Hz（A4 ＝ 69 ＝ 440 Hz。m5 L443） */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** 倍音 [倍率, 振幅]（m5 L444） */
export const SYNTH_PARTIALS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 0.5],
  [3, 0.26],
  [4, 0.12],
  [5.01, 0.06],
  [6.02, 0.03],
]

/** 振幅の頭（vel 1 で倍音 1 の頂点 0.28）・立ち上がり 3 ms・減衰の終わりの値（m5 L446） */
export const SYNTH_PEAK = 0.28
export const SYNTH_ATTACK_S = 0.003
export const SYNTH_FLOOR = 0.0003
/** 雑音（打鍵の当たり）: 2205 標本・時定数 300 標本・帯域 2·f（上限 12 kHz）・振幅 vel·0.08（m5 L447） */
export const NOISE_SAMPLES = 2205
export const NOISE_TAU = 300
export const NOISE_BAND_MAX_HZ = 12000
export const NOISE_GAIN = 0.08
/** 鳴らす長さの上限 s（m5 pump L462 の min(2.5, dur + 0.3)） */
export const SYNTH_MAX_S = 2.5
export const SYNTH_TAIL_S = 0.3

/** 音域の明るさ（低い音ほど長く減衰。0.35..1.3。m5 L444） */
export function brightness(midi: number): number {
  return Math.max(0.35, Math.min(1.3, 1.4 - (midi - 48) / 40))
}

export interface PartialPlan {
  readonly freq: number
  /** 頂点の振幅 */
  readonly peak: number
  /** 頂点から SYNTH_FLOOR まで落ちる時間 s */
  readonly decayS: number
}

export interface SynthPlan {
  readonly freq: number
  readonly partials: readonly PartialPlan[]
  readonly noise: { readonly gain: number; readonly bandHz: number }
  /** 最後の発振器を止める時刻（発音からの s） */
  readonly stopS: number
}

/** 譜面の vel（0–127）→ 0..1 */
export function vel01(vel: number): number {
  return Math.max(0, Math.min(1, vel / 127))
}

/**
 * 1 音の計画。v は 0..1、holdS は鳴らす長さ s（音価＋余韻。SYNTH_MAX_S で切る）。
 * 倍音 h の減衰 ＝ holdS·明るさ / (0.35 ＋ h·0.5)（m5 L445）。
 */
export function synthPlan(midi: number, v: number, holdS: number): SynthPlan {
  const freq = midiToHz(midi)
  const b = brightness(midi)
  const hold = Math.min(SYNTH_MAX_S, holdS)
  const partials = SYNTH_PARTIALS.map(([h, a]) => ({
    freq: freq * h,
    peak: a * v * SYNTH_PEAK,
    decayS: (hold * b) / (0.35 + h * 0.5),
  }))
  const stopS = Math.max(...partials.map((p) => p.decayS)) + 0.05
  return {
    freq,
    partials,
    noise: { gain: v * NOISE_GAIN, bandHz: Math.min(NOISE_BAND_MAX_HZ, freq * 2) },
    stopS,
  }
}

/** 雑音の標本（種付き。指数で減る白色雑音。m5 L447） */
export function noiseSamples(n = NOISE_SAMPLES, tau = NOISE_TAU, seed = 7): Float32Array {
  const rnd = mulberry32(seed)
  const d = new Float32Array(n)
  for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * Math.exp(-i / tau)
  return d
}

/** 文脈ごとに 1 回だけ作る雑音のバッファ（閉包で持つ。グローバルに置かない） */
export type NoiseCache = WeakMap<BaseAudioContext, AudioBuffer>

/** Web Audio で鳴らす（t は context の秒）。止めるときのために作った発振器・音源を返す */
export function playSynth(
  ctx: BaseAudioContext,
  dest: AudioNode,
  plan: SynthPlan,
  t: number,
  noise: NoiseCache,
): AudioScheduledSourceNode[] {
  const out = ctx.createGain()
  out.connect(dest)
  const nodes: AudioScheduledSourceNode[] = []
  for (const p of plan.partials) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = p.freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(p.peak, t + SYNTH_ATTACK_S)
    g.gain.exponentialRampToValueAtTime(SYNTH_FLOOR, t + Math.max(SYNTH_ATTACK_S * 2, p.decayS))
    o.connect(g)
    g.connect(out)
    o.start(t)
    o.stop(t + p.decayS + 0.05)
    nodes.push(o)
  }
  let buf = noise.get(ctx)
  if (buf === undefined) {
    buf = ctx.createBuffer(1, NOISE_SAMPLES, ctx.sampleRate)
    buf.getChannelData(0).set(noiseSamples())
    noise.set(ctx, buf)
  }
  const n = ctx.createBufferSource()
  n.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = plan.noise.bandHz
  const ng = ctx.createGain()
  ng.gain.value = plan.noise.gain
  n.connect(bp)
  bp.connect(ng)
  ng.connect(out)
  n.start(t)
  nodes.push(n)
  return nodes
}
