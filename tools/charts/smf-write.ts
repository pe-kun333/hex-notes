// SMF の書き手（M3 の手順 2 で tests/fixtures/smf/build.ts から移した。m3-kickoff 手順 2・§7-9）。tools/clicktrack/ が S5 段 1 用の
// SMF を書き、試験のフィクスチャ（build.ts）は元の名前で再 export する（試験の import は不変）。node の API に触れない純関数。

/** 1 つのイベント: [差分 tick, バイト列] */
export type SmfEvent = readonly [number, readonly number[]]

/** 可変長の数 */
export function vlq(n: number): number[] {
  const out = [n & 0x7f]
  for (n >>= 7; n > 0; n >>= 7) out.unshift((n & 0x7f) | 0x80)
  return out
}

export const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))
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
} // prettier-ignore

/** テンポ（BPM）のメタ */
export function tempoEv(bpm: number): number[] {
  const us = Math.round(60_000_000 / bpm)
  return [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]
}

export const END: readonly number[] = [0xff, 0x2f, 0]

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
