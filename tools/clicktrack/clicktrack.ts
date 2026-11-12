// クリックトラック（U-02 の見本の動画の素、M3 の手順 2、仮。m3-kickoff 手順 2「作る」・§7-7・§7-19、design §5.6 L297）。
// 100 BPM・頭 3.0 s・64 個・尻 3.0 s。波形は製品のクリック（src/audio/metronome.ts の矩形波 1000／1400 Hz、0.14 から 40 ms で
// 0.0005 へ、50 ms で止める）を標本で合成する。小節の頭（4 拍ごと）が強拍。48 kHz・16 bit・モノラルの WAV、S5 段 1 用の
// SMF（形式 0・1 トラック・分解能 480。音は期待値の頭 ＝ クリックの頭、MIDI 60・62・64・65 の繰り返し・半拍）、譜面
// （chartFromSmf の 4 版に sync を足す。offset は頭の 3.0 s・rate 1、measured は書かない ＝ 式の sync）。
// 純関数（バイト列と値を返し、node の API に触れない。手順 12 が pane から import）。書き出しと ffmpeg は run.ts。

import { chartFromSmf } from '../../src/chart/import.ts'
import { parseSmf } from '../../src/chart/smf.ts'
import {
  CLICK_ACCENT_HZ,
  CLICK_DECAY_S,
  CLICK_FLOOR,
  CLICK_GAIN,
  CLICK_HZ,
  CLICK_STOP_S,
} from '../../src/audio/metronome.ts'
import type { Chart } from '../../src/shared/types.ts'
import { END, noteEvents, smfBytes, tempoEv } from '../charts/smf-write.ts'

export const CLICK_BPM = 100
/** 最初のクリックまでの秒（譜面の sync の offset） */
export const CLICK_LEAD_S = 3
export const CLICK_COUNT = 64
/** 最後のクリックの後の秒 */
export const CLICK_TAIL_S = 3
export const CLICK_RATE = 48_000
export const CLICK_PPQ = 480
/** 譜面の音（拍ごとに繰り返す） */
export const CLICK_MIDIS: readonly number[] = [60, 62, 64, 65]
/** 譜面の名前 */
export const CLICK_NAME = 'クリック 100 BPM（U-02）'

const SPB = 60 / CLICK_BPM

/** 全長（秒） */
export const clickLengthS = (): number => CLICK_LEAD_S + (CLICK_COUNT - 1) * SPB + CLICK_TAIL_S

/** クリック k の頭（標本の番号） */
export const clickSample = (k: number): number => Math.round((CLICK_LEAD_S + k * SPB) * CLICK_RATE)

/** 1 打の振幅（打の頭からの秒。指数で 40 ms に床へ、そこから 50 ms までは床。Web Audio の exponentialRamp と同じ） */
function envelope(t: number): number {
  if (t < 0 || t >= CLICK_STOP_S) return 0
  if (t >= CLICK_DECAY_S) return CLICK_FLOOR
  return CLICK_GAIN * (CLICK_FLOOR / CLICK_GAIN) ** (t / CLICK_DECAY_S)
}

/** 標本の列（−1〜1）。矩形波は打の頭を位相 0 に */
export function clickSamples(): Float32Array {
  const n = Math.round(clickLengthS() * CLICK_RATE)
  const out = new Float32Array(n)
  const len = Math.ceil(CLICK_STOP_S * CLICK_RATE)
  for (let k = 0; k < CLICK_COUNT; k++) {
    const s0 = clickSample(k)
    const hz = k % 4 === 0 ? CLICK_ACCENT_HZ : CLICK_HZ
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / CLICK_RATE
      const sq = (t * hz) % 1 < 0.5 ? 1 : -1
      out[s0 + i] = sq * envelope(t)
    }
  }
  return out
}

/** 16 bit・モノラルの WAV（RIFF の頭 44 バイト ＋ 標本） */
export function wavBytes(samples: Float32Array, rate = CLICK_RATE): Uint8Array {
  const data = samples.length * 2
  const buf = new ArrayBuffer(44 + data)
  const v = new DataView(buf)
  const str = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + data, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, data, true)
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i] ?? 0))
    v.setInt16(44 + i * 2, Math.round(x * 32767), true)
  }
  return new Uint8Array(buf)
}

/** S5 段 1 用の SMF（形式 0・1 トラック。音は拍の頭 ＝ クリックの頭） */
export function clickSmf(): Uint8Array {
  const notes = Array.from({ length: CLICK_COUNT }, (_, k) => ({
    midi: CLICK_MIDIS[k % CLICK_MIDIS.length] ?? 60,
    tick: k * CLICK_PPQ,
    dtick: CLICK_PPQ / 2,
  }))
  return smfBytes(0, CLICK_PPQ, [[[0, tempoEv(CLICK_BPM)], ...noteEvents(0, notes), [0, END]]])
}

/**
 * 譜面（chartFromSmf の 4 版）。videoId を渡せば sync（sources[0] ＝ youtube・offset 3.0 s・rate 1。measured は書かない）を
 * 足す。id は旋律とテンポだけで決まるので sync を足しても同じ（§3.3）
 */
export async function clickChart(videoId?: string): Promise<Chart> {
  const base = await chartFromSmf({
    smf: parseSmf(clickSmf()),
    play: 0,
    fold: 'octave',
    name: CLICK_NAME,
  })
  if (videoId === undefined) return base
  return {
    ...base,
    sync: { sources: [{ kind: 'youtube', videoId, offset: CLICK_LEAD_S, rate: 1 }] },
  }
}
