// SMF のフィクスチャをバイト列で組む生成関数（M2-01 前半、M2 の手順 1。バイナリは git に入れない、m2-kickoff §7-25）。
// 出どころ: m2-kickoff 手順 1 の「作る」（形式 0 の 2 音、形式 1 の旋律＋和音＋ch 10 ドラムの 3 トラック、テンポ変化 2 点、
// Shift_JIS と UTF-8 のトラック名、mel 形 → 形式 1 の SMF）、M1 の tests/unit/chart/metrics-smf.test.ts の smf()（ここへ移した）。

import type { MelSong } from '../../../tools/charts/mel-songs.ts'

/** 1 つのイベント: [差分 tick, バイト列] */
export type SmfEvent = readonly [number, readonly number[]]

/** 可変長の数 */
export function vlq(n: number): number[] {
  const out = [n & 0x7f]
  for (n >>= 7; n > 0; n >>= 7) out.unshift((n & 0x7f) | 0x80)
  return out
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
const u32 = (x: number): number[] => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]
const u16 = (x: number): number[] => [(x >>> 8) & 255, x & 255]

/** SMF を組む（形式・division・トラックごとのイベントの列） */
export function smfBytes(format: number, division: number, tracks: readonly (readonly SmfEvent[])[]): Uint8Array {
  const out = [...ascii('MThd'), ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(division)]
  for (const ev of tracks) {
    const body = ev.flatMap(([dt, b]) => [...vlq(dt), ...b])
    out.push(...ascii('MTrk'), ...u32(body.length), ...body)
  }
  return new Uint8Array(out)
}

/** テンポ（BPM）のメタ */
export function tempoEv(bpm: number): number[] {
  const us = Math.round(60_000_000 / bpm)
  return [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]
}

/** トラック名のメタ（バイト列のまま） */
export function nameEv(bytes: readonly number[]): number[] {
  return [0xff, 0x03, ...vlq(bytes.length), ...bytes]
}

export const END: readonly number[] = [0xff, 0x2f, 0]
export const TEMPO_120: readonly number[] = tempoEv(120)

/** Shift_JIS の「メロ」・UTF-8 の「メロ」 */
export const SJIS_MERO: readonly number[] = [0x83, 0x81, 0x83, 0x8d]
export const UTF8_MERO: readonly number[] = [...new TextEncoder().encode('メロ')]

/** 音の列 → 1 チャンネルのイベント（同じ tick の音は同時。off は全て on の後） */
export function noteEvents(
  ch: number,
  notes: readonly { midi: number; tick: number; dtick: number; vel?: number }[],
): SmfEvent[] {
  const ev: { tick: number; order: number; bytes: number[] }[] = []
  for (const n of notes) {
    ev.push({ tick: n.tick, order: 1, bytes: [0x90 | ch, n.midi, n.vel ?? 100] })
    ev.push({ tick: n.tick + n.dtick, order: 0, bytes: [0x80 | ch, n.midi, 0] })
  }
  ev.sort((a, b) => a.tick - b.tick || a.order - b.order)
  let at = 0
  return ev.map((e) => {
    const dt = e.tick - at
    at = e.tick
    return [dt, e.bytes] as const
  })
}

/** 形式 0 の 2 音（M1 手順 6 と同じ: on 60 vel 100 @0、off @480、on 64 @480、off @960、tempo 120、PPQ 480） */
export function format0TwoNotes(): Uint8Array {
  return smfBytes(0, 480, [[[0, TEMPO_120], [0, [0x90, 60, 100]], [480, [0x80, 60, 0]], [0, [0x90, 64, 100]], [480, [0x80, 64, 0]], [0, END]]]) // prettier-ignore
}

/**
 * 形式 1 の 3 トラック＋テンポのトラック（PPQ 480）: 旋律「Melody」（ch 1、8 音）、和音「Chords」（ch 2、2 拍ごとの三和音 ×2 ＝ 6 音）、
 * 「Drums」（ch 10、4 音）。テンポは拍 0 で 100、拍 4 で 120 の 2 点、拍子 4/4
 */
export function format1ThreeTracks(): Uint8Array {
  const q = 480
  const melody = [60, 62, 64, 65, 67, 69, 71, 72].map((m, i) => ({ midi: m, tick: i * q, dtick: q }))
  const chords = [[48, 52, 55], [53, 57, 60]].flatMap((c, i) => c.map((m) => ({ midi: m, tick: i * 2 * q, dtick: 2 * q })))
  const drums = [36, 38, 36, 38].map((m, i) => ({ midi: m, tick: i * q, dtick: q / 2 }))
  return smfBytes(1, q, [
    [[0, tempoEv(100)], [0, [0xff, 0x58, 4, 4, 2, 24, 8]], [4 * q, tempoEv(120)], [0, END]],
    [[0, nameEv(ascii('Melody'))], ...noteEvents(0, melody), [0, END]],
    [[0, nameEv(ascii('Chords'))], ...noteEvents(1, chords), [0, END]],
    [[0, nameEv(ascii('Drums'))], ...noteEvents(9, drums), [0, END]],
  ])
} // prettier-ignore

/** トラック名だけを変えた 1 音の形式 0 */
export function namedTrack(name: readonly number[]): Uint8Array {
  return smfBytes(0, 96, [[[0, nameEv(name)], [0, [0x90, 60, 64]], [96, [0x80, 60, 0]], [0, END]]])
}

/** mel 形（mel-songs.ts）→ 形式 1 の SMF（テンポのトラック＋旋律 1 トラック、PPQ 480、vel 80） */
export function melToSmf(song: MelSong): Uint8Array {
  const q = 480
  const notes: { midi: number; tick: number; dtick: number; vel: number }[] = []
  let b = 0
  for (const [p, d] of song.seq) {
    if (p !== null)
      for (const m of Array.isArray(p) ? p : [p])
        notes.push({ midi: m as number, tick: Math.round(b * q), dtick: Math.round(d * q), vel: 80 })
    b += d
  }
  return smfBytes(1, q, [
    [[0, tempoEv(song.bpm)], [0, END]],
    [[0, nameEv(ascii('mel'))], ...noteEvents(0, notes), [0, END]],
  ])
} // prettier-ignore
