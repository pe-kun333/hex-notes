// m5（docs/planning/mocks/m5-song-import.html）の譜面づくりの忠実な写し（手順 3 の照合用。製品の src/ には入れない）。
// 写した物: キー表 L208–219、hexDist L223、PRESETS L226–241 の map（挿入順のまま。同音の候補の並びと先頭の音の
// cands[floor(len/2)] がこの順に依存する）、mel L249–250、makeClock L317–321、buildVariant L324–363、
// fmtBeat L364、r4 L416、buildJSON L417–424、fmtJSON L425–429。
// 挙動は変えない（同拍は差 1e-3、重複は round(beat×1000)、畳んだ後の音高で間引き、同音は前の音から六角距離が
// 最小の鍵、警告 w4・rect）。変えたのは形だけ: state・syncSession を引数にし、DOM を外した。
// tests/unit/chart/m5-port.test.ts が元のコードを評価して突き合わせる。製品の譜面版は src/chart/variants.ts
// （decisions #20・#21 の手直し入り）。

import type { M5Key, M5Metrics, M5Note, M5Song, M5Sync } from '../../src/chart/convert-m5.ts'
import { KEY_ROWS } from '../../src/layout/presets.ts'
import type { MelSong } from './mel-songs.ts'

// ---------- キー表（L208–219、L223） ----------

const ROW_OFF = [0, 0.5, 1.0, 1.5]
const ROW_NAMES = ['数字段', 'Q 段', 'A 段', 'Z 段']
const SPECIAL: Readonly<Record<string, string>> = {
  Semicolon: ';',
  Comma: ',',
  Period: '.',
  Slash: '/',
}

/** m5 KEYS の要素（label・gx は表示用だが、戻り値の照合のために持つ） */
export type M5PortKey = M5Key & { label: string; gx: number }

/** m5 KEYS（ROWS は src/layout/presets.ts の KEY_ROWS と同じ並び。試験で突き合わせる） */
export const M5_KEYS: readonly M5PortKey[] = KEY_ROWS.flatMap((codes, ri) =>
  codes.map((code, ci) => ({
    code,
    row: ri,
    col: ci,
    label: SPECIAL[code] ?? code.replace(/^Key|^Digit/, ''),
    gx: (ROW_OFF[ri] ?? 0) + ci,
  })),
)

const byCode: ReadonlyMap<string, M5PortKey> = new Map(M5_KEYS.map((k) => [k.code, k]))

function keyOf(code: string): M5PortKey {
  const k = byCode.get(code)
  if (!k) throw new Error(`m5-port: 鍵 ${code} が KEYS に無い`)
  return k
}

function rowCodes(r: number): readonly string[] {
  return KEY_ROWS[r] ?? []
}

/** m5 hexDist L223（手順 4 の src/render/hex/hex.ts の hexDist と同じ式。試験で突き合わせる） */
export function m5HexDist(a: M5Key, b: M5Key): number {
  const dq = a.col - b.col
  const dr = a.row - b.row
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

// ---------- 配列（PRESETS L226–241 の map。挿入順を変えない） ----------

export type M5LayoutKey = 'fl' | 'garage' | 'genshin' | 'wicki' | 'harmonic'
/** PRESETS のキーの順（L226–241） */
export const M5_LAYOUT_KEYS: readonly M5LayoutKey[] = [
  'fl',
  'garage',
  'genshin',
  'wicki',
  'harmonic',
]

/** PRESETS[layout].map() */
export function m5Map(layout: M5LayoutKey): Record<string, number> {
  const m: Record<string, number> = {}
  const fill = (r: number, pitches: readonly number[]): void =>
    pitches.forEach((p, i) => {
      const code = rowCodes(r)[i]
      if (code !== undefined) m[code] = p
    })
  switch (layout) {
    case 'fl':
      fill(3, [48, 50, 52, 53, 55, 57, 59, 60, 62, 64])
      Object.assign(m, {
        KeyS: 49,
        KeyD: 51,
        KeyG: 54,
        KeyH: 56,
        KeyJ: 58,
        KeyL: 61,
        Semicolon: 63,
      })
      fill(1, [60, 62, 64, 65, 67, 69, 71, 72, 74, 76])
      Object.assign(m, {
        Digit2: 61,
        Digit3: 63,
        Digit5: 66,
        Digit6: 68,
        Digit7: 70,
        Digit9: 73,
        Digit0: 75,
      })
      return m
    case 'garage':
      fill(2, [60, 62, 64, 65, 67, 69, 71, 72, 74, 76])
      Object.assign(m, { KeyW: 61, KeyE: 63, KeyT: 66, KeyY: 68, KeyU: 70, KeyO: 73, KeyP: 75 })
      return m
    case 'genshin': {
      const nat = [0, 2, 4, 5, 7, 9, 11]
      for (const [r, base] of [
        [1, 72],
        [2, 60],
        [3, 48],
      ] as const)
        for (let i = 0; i < 7; i++) {
          const code = rowCodes(r)[i]
          if (code !== undefined) m[code] = base + (nat[i] ?? 0)
        }
      return m
    }
    case 'wicki':
      for (const k of M5_KEYS) m[k.code] = 48 + 2 * k.col + 5 * (3 - k.row)
      return m
    case 'harmonic':
      for (const k of M5_KEYS) m[k.code] = 48 + k.col + 3 * (3 - k.row)
      return m
  }
}

// ---------- 曲と時計（mel L249–250、makeClock L317–321） ----------

/** m5 mel L249: vel 0.8、division 240、4/4、トラック 1 本 */
export function m5Mel(song: MelSong): M5Song {
  let b = 0
  const notes: M5Note[] = []
  for (const [p, d] of song.seq) {
    if (p !== null)
      for (const m of Array.isArray(p) ? p : [p]) notes.push({ midi: m, beat: b, dur: d, vel: 0.8 })
    b += d
  }
  return {
    name: song.name,
    bpm: song.bpm,
    division: 240,
    timeSig: '4/4',
    tempo: [{ beat: 0, bpm: song.bpm }],
    tracks: [{ name: '旋律（内蔵）', notes, ch: [0] }],
    beats: b,
    source: '内蔵',
  }
}

export type M5Clock = { b2s(beat: number): number; s2b(sec: number): number }

/** m5 makeClock L317–321（拍 ⇄ 秒。tempo が空なら 120） */
export function m5MakeClock(song: Pick<M5Song, 'tempo'>): M5Clock {
  const segs: { beat: number; bpm: number; sec: number }[] = []
  let sec = 0
  const t = song.tempo.length ? song.tempo : [{ beat: 0, bpm: 120 }]
  for (let i = 0; i < t.length; i++) {
    const cur = t[i] as { beat: number; bpm: number }
    segs.push({ beat: cur.beat, bpm: cur.bpm, sec })
    const next = t[i + 1]
    if (next) sec += ((next.beat - cur.beat) * 60) / cur.bpm
  }
  const first = segs[0] as { beat: number; bpm: number; sec: number }
  const b2s = (b: number): number => {
    let s = first
    for (const x of segs) {
      if (x.beat <= b) s = x
      else break
    }
    return s.sec + ((b - s.beat) * 60) / s.bpm
  }
  const s2b = (sc: number): number => {
    let s = first
    for (const x of segs) {
      if (x.sec <= sc) s = x
      else break
    }
    return s.beat + ((sc - s.sec) * s.bpm) / 60
  }
  return { b2s, s2b }
}

// ---------- 折り畳み → 間引き → キー割り当て → 指標（buildVariant L324–363） ----------

export type M5How = 'oct' | 'near' | null

/** folded の要素。落ちた音は out を持つ。kept の音は後で thin・key が足される（m5 と同じく同じ物を書き換える） */
export type M5Folded = M5Note & {
  out?: 'cut' | 'nopc' | 'dup'
  orig?: number
  how?: M5How
  thin?: boolean
  key?: M5PortKey
}

export type M5PortOut = M5Note & { orig: number; how: M5How; key: M5PortKey; thin?: boolean }

export type M5Warn = { type: 'w4' | 'rect'; beat: number; text: string }

export type M5PortVariant = {
  src: M5Note[]
  folded: M5Folded[]
  kept: M5Folded[]
  out: M5PortOut[]
  moved: number
  dropFold: number
  dupes: number
  dropThin: number
  metrics: M5Metrics
  warns: M5Warn[]
  fold: string
  limit: number
  layout: M5LayoutKey
  lo: number
  hi: number
  nopc: number
  cut: number
}

/** buildVariant L324–363。fold が cut・octave 以外なら nearest（元の else と同じ） */
export function m5BuildVariant(
  srcNotes: readonly M5Note[],
  layoutKey: M5LayoutKey,
  fold: string,
  limit: number,
  clock: M5Clock,
): M5PortVariant {
  const mapping = m5Map(layoutKey)
  const byPitch: Record<number, M5PortKey[]> = {}
  for (const [code, m] of Object.entries(mapping)) (byPitch[m] ||= []).push(keyOf(code))
  const pitches = Object.keys(byPitch)
    .map(Number)
    .sort((a, b) => a - b)
  const lo = pitches[0] as number
  const hi = pitches[pitches.length - 1] as number
  const src = srcNotes.slice().sort((a, b) => a.beat - b.beat || a.midi - b.midi)
  const folded: M5Folded[] = []
  let moved = 0
  let dropFold = 0
  let dupes = 0
  const seen = new Set<string>()
  for (const n of src) {
    let m = n.midi
    let how: M5How = null
    if (!byPitch[m]) {
      if (fold === 'cut') {
        dropFold++
        folded.push({ ...n, out: 'cut' })
        continue
      }
      if (fold === 'octave') {
        let mm = m
        while (mm < lo) mm += 12
        while (mm > hi) mm -= 12
        let f: number | null = null
        for (let x = mm; x <= hi; x += 12)
          if (byPitch[x]) {
            f = x
            break
          }
        if (f == null)
          for (let x = mm - 12; x >= lo; x -= 12)
            if (byPitch[x]) {
              f = x
              break
            }
        if (f == null) {
          dropFold++
          folded.push({ ...n, out: 'nopc' })
          continue
        }
        m = f
        how = 'oct'
      } else {
        let best = pitches[0] as number
        let bd = 1e9
        for (const x of pitches) {
          const d = Math.abs(x - m)
          if (d < bd || (d === bd && x > m)) {
            bd = d
            best = x
          }
        }
        m = best
        how = 'near'
      }
      moved++
    }
    const id = Math.round(n.beat * 1000) + ':' + m
    if (seen.has(id)) {
      dupes++
      dropFold++
      folded.push({ ...n, out: 'dup', midi: m, orig: n.midi })
      continue
    }
    seen.add(id)
    folded.push({ ...n, orig: n.midi, midi: m, how })
  }
  const kept = folded.filter((n) => !n.out)
  const groups: M5Folded[][] = []
  for (const n of kept) {
    const g = groups[groups.length - 1]
    if (g && Math.abs((g[0] as M5Folded).beat - n.beat) < 1e-3) g.push(n)
    else groups.push([n])
  }
  let dropThin = 0
  for (const g of groups) {
    if (g.length > limit) {
      const s = g.slice().sort((a, b) => b.midi - a.midi)
      for (let i = limit; i < s.length; i++) {
        ;(s[i] as M5Folded).thin = true
        dropThin++
      }
    }
  }
  let prev: M5PortKey | null = null
  const out: M5PortOut[] = []
  for (const g of groups) {
    const live = g.filter((n) => !n.thin).sort((a, b) => a.midi - b.midi)
    for (const n of live) {
      const cands = byPitch[n.midi] as M5PortKey[]
      const p: M5PortKey | null = prev
      const k: M5PortKey =
        p !== null
          ? cands.reduce((a, b) => (m5HexDist(a, p) <= m5HexDist(b, p) ? a : b))
          : (cands[Math.floor(cands.length / 2)] as M5PortKey)
      n.key = k
      prev = k
      out.push(n as M5PortOut)
    }
  }

  // 指標
  const og: M5PortOut[][] = []
  for (const n of out) {
    const g = og[og.length - 1]
    if (g && Math.abs((g[0] as M5PortOut).beat - n.beat) < 1e-3) g.push(n)
    else og.push([n])
  }
  const first = out[0]
  const secs = first
    ? Math.max(
        0.001,
        clock.b2s(out.reduce((a, n) => Math.max(a, n.beat + n.dur), 0)) - clock.b2s(first.beat),
      )
    : 0
  const src0 = src[0]
  const srcSecs = src0
    ? Math.max(
        0.001,
        clock.b2s(src.reduce((a, n) => Math.max(a, n.beat + n.dur), 0)) - clock.b2s(src0.beat),
      )
    : 0
  const leaps: number[] = []
  let cross = 0
  const warns: M5Warn[] = []
  for (let i = 1; i < og.length; i++) {
    const ga = og[i - 1] as M5PortOut[]
    const gb = og[i] as M5PortOut[]
    let bd = 1e9
    let bp: [M5PortOut, M5PortOut] | null = null
    for (const a of ga)
      for (const b of gb) {
        const d = m5HexDist(a.key, b.key)
        if (d < bd) {
          bd = d
          bp = [a, b]
        }
      }
    if (!bp) throw new Error('m5-port: 空の塊')
    const [pa, pb] = bp
    leaps.push(bd)
    if (pa.key.row !== pb.key.row) cross++
    const beatA = (ga[0] as M5PortOut).beat
    const beatB = (gb[0] as M5PortOut).beat
    const dt = clock.b2s(beatB) - clock.b2s(beatA)
    if (pa.key.row === pb.key.row && bd >= 4 && dt < 0.25)
      warns.push({
        type: 'w4',
        beat: beatB,
        text: `拍 ${fmtBeat(beatB)}: ${pa.key.label} → ${pb.key.label}（${ROW_NAMES[pa.key.row]}で距離 ${bd}、${Math.round(dt * 1000)} ms）`,
      })
  }
  for (const g of og) {
    if (g.length < 4) continue
    const rows: Record<string, Set<number>> = {}
    for (const n of g) (rows[n.key.row] ||= new Set()).add(n.key.col)
    const rs = Object.keys(rows)
    for (let a = 0; a < rs.length; a++)
      for (let b = a + 1; b < rs.length; b++) {
        const ra = rows[rs[a] as string] as Set<number>
        const rb = rows[rs[b] as string] as Set<number>
        const inter = [...ra].filter((c) => rb.has(c))
        if (inter.length >= 2)
          warns.push({
            type: 'rect',
            beat: (g[0] as M5PortOut).beat,
            text: `拍 ${fmtBeat((g[0] as M5PortOut).beat)}: 同時押し ${g.map((n) => n.key.label).join('+')} が矩形 4 隅（${ROW_NAMES[Number(rs[a])]}と${ROW_NAMES[Number(rs[b])]}の列 ${inter.join(',')}）`,
          })
      }
  }
  const chords = og.filter((g) => g.length > 1).length
  const metrics: M5Metrics = {
    density: out.length ? out.length / secs : 0,
    srcDensity: src.length ? src.length / srcSecs : 0,
    leapAvg: leaps.length ? leaps.reduce((a, b) => a + b, 0) / leaps.length : 0,
    leapMax: leaps.reduce((a, b) => Math.max(a, b), 0),
    chordRatio: og.length ? chords / og.length : 0,
    chordMax: og.reduce((a, g) => Math.max(a, g.length), 0),
    rowCross: leaps.length ? cross / leaps.length : 0,
  }
  return {
    src,
    folded,
    kept,
    out,
    moved,
    dropFold,
    dupes,
    dropThin,
    metrics,
    warns,
    fold,
    limit,
    layout: layoutKey,
    lo,
    hi,
    nopc: folded.filter((n) => n.out === 'nopc').length,
    cut: folded.filter((n) => n.out === 'cut').length,
  }
}

/** fmtBeat L364 */
function fmtBeat(b: number): string {
  return (Math.round(b * 100) / 100).toString()
}

// ---------- 譜面 JSON（r4 L416、buildJSON L417–424、fmtJSON L425–429） ----------

const r4 = (x: number): number => Math.round(x * 10000) / 10000

/** m5 state.sync（res・elapsed は計測済みのときだけ） */
export type M5PortSync = M5Sync & { res?: number; elapsed?: number }

export const M5_NO_SYNC: M5PortSync = { videoId: '', offset: 0, rate: 1, done: false }

/** buildJSON の戻り（m5 の照合用 JSON。/1 の形ではない） */
export type M5Json = {
  format: string
  name: string
  bpm: number
  beats: number
  notes: { midi: number; beat: number; dur: number; hand: 'R' | 'L' }[]
  pulse: { resolution: number; tempo: M5Song['tempo'] }
  sync: Record<string, string | number>
  layout: string
  keys: string[]
  limit: number
  metrics: { density: number; leap: number; chord: number; rowCross: number }
  stats: Record<string, string | number | boolean | null>
}

/**
 * buildJSON L417–424。元は state.layout・state.limit を書くが、rebuild L379 で state.variant は同じ layout・limit
 * から作るので、ここでは variant の値を使う。syncAttempts は syncSession.attempts.length
 */
export function m5BuildJson(
  song: M5Song,
  v: M5PortVariant,
  sync: M5PortSync = M5_NO_SYNC,
  syncAttempts = 0,
): M5Json {
  const m = v.metrics
  const notes = v.out.map((n) => ({
    midi: n.midi,
    beat: r4(n.beat),
    dur: r4(n.dur),
    hand: n.midi >= 60 ? ('R' as const) : ('L' as const),
  }))
  const keys = v.out.map((n) => n.key.code)
  const syncObj = {
    source: sync.videoId ? 'youtube' : 'none',
    videoId: sync.videoId,
    offset: r4(sync.offset),
    rate: r4(sync.rate),
    unit: 's',
    offsetMeaning: 'chart beat 0 の動画時刻（秒）。videoTime = offset + chartSec / rate',
    rateMeaning: 'videoBpm / chartBpm。pulse.tempo の全区間へ一様に掛ける',
  }
  return {
    format: 'hexnote-chart/1',
    name: song.name,
    bpm: song.bpm,
    beats: song.beats,
    notes,
    pulse: { resolution: song.division, tempo: song.tempo },
    sync: syncObj,
    layout: v.layout,
    keys,
    limit: v.limit,
    metrics: {
      density: r4(m.density),
      leap: r4(m.leapAvg),
      chord: r4(m.chordRatio),
      rowCross: r4(m.rowCross),
    },
    stats: {
      fold: v.fold,
      srcNotes: v.src.length,
      droppedFold: v.dropFold,
      movedFold: v.moved,
      droppedThin: v.dropThin,
      leapMax: m.leapMax,
      chordMax: m.chordMax,
      warnings: v.warns.length,
      syncMeasured: sync.done,
      syncResidualMs: sync.done ? Math.round(Number(sync.res) * 1000 * 10) / 10 : null,
      syncElapsedS: sync.done ? Math.round(Number(sync.elapsed) * 10) / 10 : null,
      syncAttempts,
    },
  }
}

/** fmtJSON L425–429（m5 の画面に出る文字列そのもの） */
export function m5FmtJson(o: M5Json): string {
  const L: string[] = []
  L.push('{')
  L.push(`  "format": ${JSON.stringify(o.format)},`)
  L.push(`  "name": ${JSON.stringify(o.name)}, "bpm": ${o.bpm}, "beats": ${o.beats},`)
  L.push(
    '  "notes": [' +
      (o.notes.length
        ? '\n    ' + o.notes.map((n) => JSON.stringify(n)).join(',\n    ') + '\n  ],'
        : '],'),
  )
  L.push(`  "pulse": ${JSON.stringify(o.pulse)},`)
  L.push(`  "sync": ${JSON.stringify(o.sync)},`)
  L.push(`  "layout": ${JSON.stringify(o.layout)},`)
  L.push(`  "keys": ${JSON.stringify(o.keys)},`)
  L.push(`  "limit": ${o.limit},`)
  L.push(`  "metrics": ${JSON.stringify(o.metrics)},`)
  L.push(`  "stats": ${JSON.stringify(o.stats)}`)
  L.push('}')
  return L.join('\n')
}
