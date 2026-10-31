// SMF（標準 MIDI ファイル）の読み取り（M1-01、M1 の手順 6。製品の S5 は M2-01 で src/chart/smf.ts に移す、decisions #59）。
// 出どころ: m5 `parseMidi` L263–314（そのまま: MThd・形式 0／1 だけ・SMPTE は拒む、MTrk ごとに可変長の差分 tick、
// ランニングステータス、メタ 0x51 テンポ・0x58 拍子・0x03 トラック名、SysEx と システム・コモンは飛ばす、note on vel 0 は
// off、同じ音番号でもチャンネルが違えば別の音、閉じない音は 1 拍、拍は tick ／ division を 1/10000 に丸める、テンポの
// 重なりは後勝ち・同じ BPM の続きは 1 つに、拍 0 にテンポが無ければ最初のテンポを拍 0 に、テンポが無ければ 120、トラックを
// チャンネルごとに分ける）。手直し: vel は 0–127 の整数のまま（m5 の vel／127・下限 0.3 は採らない。m0-kickoff §7-22）、
// 拍子は全部の点を返す（m5 は最初の 1 つの文字列）、テキストの文字コードの推定（decodeText）は採らず latin1 のまま。
// 入力はファイルの中身（Uint8Array）。DOM・ファイルに触れない純関数。

export interface SmfNote {
  readonly midi: number
  /** 拍（4 分音符）。1/10000 に丸める */
  readonly beat: number
  readonly dur: number
  /** 1–127 の整数（note on の velocity） */
  readonly vel: number
}

export interface SmfTrack {
  /** トラック名（無ければ「トラック n」。チャンネルで分けたら「 / ch n」を足す） */
  readonly name: string
  /** 0–15 */
  readonly ch: number
  readonly notes: readonly SmfNote[]
}

export interface Smf {
  readonly format: 0 | 1
  /** 4 分音符あたりの tick */
  readonly division: number
  readonly tempo: readonly { readonly beat: number; readonly bpm: number }[]
  readonly timeSig: readonly { readonly beat: number; readonly num: number; readonly den: number }[]
  readonly tracks: readonly SmfTrack[]
}

/** システム・コモンのデータの長さ（他は 0。m5 L281） */
const COMMON_LEN: Readonly<Record<number, number>> = { 0xf1: 1, 0xf2: 2, 0xf3: 1 }

const round4 = (x: number): number => Math.round(x * 10000) / 10000

/** SMF を読む。形式 2・SMPTE・MThd が無い・音符のあるトラックが無いときは Error */
export function parseSmf(bytes: Uint8Array): Smf {
  const u8 = bytes
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let p = 0
  const str = (n: number): string => {
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(u8[p + i] ?? 0)
    p += n
    return s
  }
  const u32 = (): number => {
    const v = dv.getUint32(p)
    p += 4
    return v
  }
  const u16 = (): number => {
    const v = dv.getUint16(p)
    p += 2
    return v
  }
  if (u8.length < 14 || str(4) !== 'MThd') throw new Error('MThd ヘッダーが無いので MIDI ファイルではありません')
  const hlen = u32()
  const format = u16()
  const ntrk = u16()
  const div = u16()
  p += hlen - 6
  if (format > 1) throw new Error(`形式 ${format} の MIDI は未対応です（形式 0 / 1 のみ）`)
  if (div & 0x8000) throw new Error('SMPTE 時刻形式の MIDI は未対応です')

  type Raw = { midi: number; tick: number; dtick: number; vel: number; ch: number }
  const tracks: { name: string; notes: Raw[] }[] = []
  const tempos: { tick: number; bpm: number }[] = []
  const sigs: { tick: number; num: number; den: number }[] = []
  for (let t = 0; t < ntrk && p + 8 <= u8.length; t++) {
    const id = str(4)
    const len = u32()
    const end = Math.min(u8.length, p + len)
    if (id !== 'MTrk') {
      p = end
      continue
    }
    let tick = 0
    let status = 0
    let name = ''
    const notes: Raw[] = []
    const open = new Map<number, { tick: number; vel: number; ch: number }[]>()
    const vlq = (): number => {
      let v = 0
      let b: number
      do {
        b = u8[p++] ?? 0
        v = (v << 7) | (b & 0x7f)
      } while (b & 0x80 && p < end)
      return v
    }
    while (p < end) {
      tick += vlq()
      if (p >= end) break
      const b = u8[p] ?? 0
      if (b === 0xff) {
        p++
        const type = u8[p++] ?? 0
        const l = vlq()
        const s = p
        if (type === 0x51 && l >= 3)
          tempos.push({ tick, bpm: 60000000 / (((u8[s] ?? 0) << 16) | ((u8[s + 1] ?? 0) << 8) | (u8[s + 2] ?? 0)) })
        else if (type === 0x58 && l >= 2) sigs.push({ tick, num: u8[s] ?? 4, den: 1 << (u8[s + 1] ?? 2) })
        else if (type === 0x03 && name === '') {
          p = s
          name = str(l).replace(/\0/g, '').trim()
        }
        p = s + l
        continue
      }
      if (b === 0xf0 || b === 0xf7) {
        p++
        const l = vlq()
        p += l
        continue
      }
      if (b >= 0xf1 && b <= 0xfe) {
        p += 1 + (COMMON_LEN[b] ?? 0)
        continue
      }
      if (b & 0x80) {
        status = b
        p++
      }
      if (!status) {
        p++
        continue
      }
      const type = status & 0xf0
      const ch = status & 0x0f
      if (type === 0x90 || type === 0x80) {
        const n = u8[p++] ?? 0
        const v = u8[p++] ?? 0
        // 同じ音番号でもチャンネルが違えば別の音として開閉する
        const key = (ch << 8) | n
        if (type === 0x90 && v > 0) open.set(key, [...(open.get(key) ?? []), { tick, vel: v, ch }])
        else {
          const arr = open.get(key)
          const o = arr?.shift()
          if (o !== undefined)
            notes.push({ midi: n, tick: o.tick, dtick: Math.max(1, tick - o.tick), vel: o.vel, ch: o.ch })
        }
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) p += 2
      else if (type === 0xc0 || type === 0xd0) p += 1
      else p++
    }
    // 閉じない音は 1 拍
    for (const [k, arr] of open)
      for (const o of arr) notes.push({ midi: k & 0x7f, tick: o.tick, dtick: div, vel: o.vel, ch: o.ch })
    p = end
    tracks.push({ name, notes })
  }

  tempos.sort((a, b) => a.tick - b.tick)
  const tempo = tempos.map((t) => ({ beat: round4(t.tick / div), bpm: Math.round(t.bpm * 100) / 100 }))
  const first = tempo[0]
  if (first === undefined) tempo.push({ beat: 0, bpm: 120 })
  else if (first.beat > 0) tempo.unshift({ beat: 0, bpm: first.bpm })
  const dedup: { beat: number; bpm: number }[] = []
  for (const t of tempo) {
    const l = dedup[dedup.length - 1]
    if (l !== undefined && l.beat === t.beat) l.bpm = t.bpm
    else if (l === undefined || l.bpm !== t.bpm) dedup.push({ ...t })
  }

  // トラックをチャンネルごとに分ける（形式 0・多チャンネルのトラック。ch10 のドラムを旋律から切り離す）
  const out: SmfTrack[] = []
  tracks.forEach((tr, i) => {
    const chs = [...new Set(tr.notes.map((n) => n.ch))].sort((a, b) => a - b)
    const base = tr.name || `トラック ${i + 1}`
    for (const ch of chs) {
      const notes = tr.notes
        .filter((n) => n.ch === ch)
        .map((n) => ({ midi: n.midi, beat: round4(n.tick / div), dur: round4(n.dtick / div), vel: n.vel }))
        .sort((a, b) => a.beat - b.beat || a.midi - b.midi)
      if (notes.length > 0) out.push({ name: base + (chs.length > 1 ? ` / ch${ch + 1}` : ''), ch, notes })
    }
  })
  if (out.length === 0) throw new Error('音符のあるトラックがありません')
  sigs.sort((a, b) => a.tick - b.tick)
  return {
    format: format as 0 | 1,
    division: div,
    tempo: dedup,
    timeSig: sigs.map((s) => ({ beat: round4(s.tick / div), num: s.num, den: s.den })),
    tracks: out,
  }
} // prettier-ignore
