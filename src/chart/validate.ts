// 譜面 hexnote-chart/1 の検査と正規化（M0-02 前半、手順 2）。出どころ: docs/design.md §3.2・§3.3、
// m4 validateChart L329–332 と m1' loadJson L478–485 の作り直し。型は src/shared/types.ts だけを使う。
// 純関数だけ（グローバル状態・DOM・Node に触れない。tools/ からも import する）。
// id は形（sha256:16 進 64 桁）だけ見る。ハッシュの一致は src/chart/hash.ts の verifyChartId。
// §3.2 の検査規則（2026-10-30 に設計書へ追記、decisions #19）: notes は 1 つ以上、同拍・同音の重複は不可
// （添字が番号になるため）、audio は videoId を持たない、vel は 0〜127 の整数、上限は resolution ≤ 9600・
// bpm ≤ 1000・beat／dur ≤ 1,000,000（仮。巨大値で丸めが効かなくなるのを防ぐ）。

import type { Chart } from '../shared/types.ts'
import {
  CHART_FORMAT,
  CHORD_LIMITS,
  DEFAULT_RESOLUTION,
  DEFAULT_VEL,
  FOLD_IDS,
  LAYOUT_ALIASES,
  LAYOUT_IDS,
  RIGHTS,
} from '../shared/types.ts'

/** 検査で見つかった問題。path は "notes[3].beat" の形、code は短い識別子、message は日本語 */
export type ChartIssue = { path: string; code: string; message: string }

export type ValidateResult = { ok: true; chart: Chart } | { ok: false; issues: ChartIssue[] }

/** 上限（§3.2、仮）。巨大値で丸めが効かなくなるのを防ぐ */
const MAX_RESOLUTION = 9600
const MAX_BPM = 1000
const MAX_BEAT = 1_000_000
/** beat が 1/resolution の倍数かを見るときの許容（拍） */
const BEAT_TOLERANCE = 1e-6
const ID_PATTERN = /^sha256:[0-9a-f]{64}$/
// 語彙（types.ts の Source.kind・SyncKind・Metrics と同じ。型だけなので実行時の配列をここに置く）
const SOURCE_KINDS = ['bundled', 'midi'] as const
const SYNC_KINDS = ['youtube', 'audio'] as const
const METRIC_KEYS = ['density', 'leap', 'leapMax', 'chord', 'rowCross', 'level'] as const

type Rec = Record<string, unknown>

// ---------- 小道具 ----------

function isRec(x: unknown): x is Rec {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}

function isInt(x: unknown): x is number {
  return Number.isInteger(x)
}

function isStr(x: unknown): x is string {
  return typeof x === 'string'
}

function isOneOf<T extends string | number>(x: unknown, list: readonly T[]): x is T {
  return (list as readonly unknown[]).includes(x)
}

/** 1/resolution の倍数か（許容 BEAT_TOLERANCE 拍）。式は mstable.ts quantizeBeat と同じ */
function isMultiple(beat: number, resolution: number): boolean {
  return Math.abs(beat - Math.round(beat * resolution) / resolution) <= BEAT_TOLERANCE
}

/** 順序・重複の比較に使う拍の目盛り（resolution が分かれば整数の tick、無ければ beat そのまま） */
function tickOf(beat: number, resolution: number | undefined): number {
  return resolution === undefined ? beat : Math.round(beat * resolution)
}

/** 別名表の引き（プロトタイプのキー constructor・toString などは引かない） */
function aliasOf(layout: unknown): string | undefined {
  return isStr(layout) && Object.hasOwn(LAYOUT_ALIASES, layout) ? LAYOUT_ALIASES[layout] : undefined
}

/** message に値を出すときの短い表記 */
function show(x: unknown): string {
  if (isStr(x)) return JSON.stringify(x)
  if (typeof x === 'number' || typeof x === 'boolean') return String(x)
  if (x === null) return 'null'
  if (Array.isArray(x)) return 'array'
  return typeof x
}

function add(issues: ChartIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message })
}

/** 必須のオブジェクト。無ければ missing、型違いなら type */
function requireRec(x: unknown, path: string, issues: ChartIssue[]): x is Rec {
  if (x === undefined) add(issues, path, 'missing', `${path} が無い`)
  else if (!isRec(x)) add(issues, path, 'type', `${path} はオブジェクト（${show(x)}）`)
  else return true
  return false
}

function requireString(x: unknown, path: string, issues: ChartIssue[]): void {
  if (x === undefined) add(issues, path, 'missing', `${path} が無い`)
  else if (!isStr(x) || x.trim().length === 0)
    add(issues, path, 'type', `${path} は空でない文字列（${show(x)}）`)
}

function optionalString(x: unknown, path: string, issues: ChartIssue[]): void {
  if (x !== undefined && !isStr(x)) add(issues, path, 'type', `${path} は文字列（${show(x)}）`)
}

// ---------- 検査 ----------

/**
 * 構造の検査（§3.2）。未知のトップレベルキーは無視する。ハッシュの一致は見ない。
 * ok のとき chart は入力そのもの。pulse.resolution が省略されていたときだけ、
 * 既定 240 を入れた浅い写しを返す（型 Pulse.resolution が必須のため。normalizeChart も同じ値を埋める）。
 */
export function validateChart(input: unknown): ValidateResult {
  if (!isRec(input)) {
    return {
      ok: false,
      issues: [{ path: '', code: 'not_object', message: `譜面はオブジェクト（${show(input)}）` }],
    }
  }
  const issues: ChartIssue[] = []

  checkFormat(input['format'], issues)
  checkId(input['id'], issues)
  requireString(input['name'], 'name', issues)
  const resolution = checkPulse(input['pulse'], issues)
  const noteCount = checkNotes(input['notes'], 'notes', resolution, false, issues)
  checkSync(input['sync'], issues)
  checkSource(input['source'], issues)

  // 任意（bpm・beats は写し。pulse との一致は見ない）
  const bpm = input['bpm']
  if (bpm !== undefined && !(isNum(bpm) && bpm > 0 && bpm <= MAX_BPM))
    add(issues, 'bpm', 'range', `bpm は 0 より大きく ${MAX_BPM} 以下（${show(bpm)}）`)
  const beats = input['beats']
  if (beats !== undefined && !(isNum(beats) && beats >= 0 && beats <= MAX_BEAT))
    add(issues, 'beats', 'range', `beats は 0〜${MAX_BEAT} の数（${show(beats)}）`)
  if (input['accompaniment'] !== undefined)
    checkNotes(input['accompaniment'], 'accompaniment', resolution, true, issues)
  if (input['variants'] !== undefined) checkVariants(input['variants'], noteCount, issues)
  if (input['metrics'] !== undefined) checkMetrics(input['metrics'], 'metrics', issues)
  optionalString(input['created'], 'created', issues)
  optionalString(input['generator'], 'generator', issues)
  const ext = input['ext']
  if (ext !== undefined && !isRec(ext))
    add(issues, 'ext', 'type', `ext はオブジェクト（中身は /1 では見ない。${show(ext)}）`)

  if (issues.length > 0) return { ok: false, issues }

  const pulse = input['pulse'] as Rec
  const chart =
    pulse['resolution'] === undefined
      ? { ...input, pulse: { ...pulse, resolution: DEFAULT_RESOLUTION } }
      : input
  return { ok: true, chart: chart as unknown as Chart }
}

/**
 * x 自体が Chart か。validateChart が写しを返したとき（pulse.resolution 省略）は x は埋まらないので false
 * （型 Pulse.resolution を嘘にしない。省略入力は normalizeChart を先に掛ける）
 */
export function isChart(x: unknown): x is Chart {
  const r = validateChart(x)
  return r.ok && r.chart === x
}

function checkFormat(format: unknown, issues: ChartIssue[]): void {
  if (format === undefined) add(issues, 'format', 'missing', `format が無い（${CHART_FORMAT}）`)
  else if (format !== CHART_FORMAT)
    add(issues, 'format', 'unsupported', `format は ${CHART_FORMAT} だけ（${show(format)}）`)
}

function checkId(id: unknown, issues: ChartIssue[]): void {
  if (id === undefined) add(issues, 'id', 'missing', 'id が無い')
  else if (!isStr(id)) add(issues, 'id', 'type', `id は文字列（${show(id)}）`)
  else if (!ID_PATTERN.test(id))
    add(issues, 'id', 'pattern', `id は "sha256:" + 16 進 64 桁（小文字）（${show(id)}）`)
}

/** pulse を検査し、notes の beat 検査に使う resolution を返す（不正なら undefined で倍数検査を飛ばす） */
function checkPulse(pulse: unknown, issues: ChartIssue[]): number | undefined {
  if (!requireRec(pulse, 'pulse', issues)) return undefined

  let resolution: number | undefined
  const r = pulse['resolution']
  if (r === undefined) resolution = DEFAULT_RESOLUTION
  else if (isInt(r) && r > 0 && r <= MAX_RESOLUTION) resolution = r
  else
    add(
      issues,
      'pulse.resolution',
      'range',
      `resolution は 1〜${MAX_RESOLUTION} の整数（既定 ${DEFAULT_RESOLUTION}。${show(r)}）`,
    )

  const tempo = pulse['tempo']
  if (tempo === undefined) add(issues, 'pulse.tempo', 'missing', 'pulse.tempo が無い')
  else if (!Array.isArray(tempo))
    add(issues, 'pulse.tempo', 'type', `tempo は配列（${show(tempo)}）`)
  else if (tempo.length === 0) add(issues, 'pulse.tempo', 'empty', 'tempo は 1 つ以上')
  else {
    let prevBeat: number | undefined
    tempo.forEach((t, i) => {
      const p = `pulse.tempo[${i}]`
      if (!isRec(t)) {
        add(issues, p, 'type', `tempo の要素はオブジェクト（${show(t)}）`)
        return
      }
      const beat = t['beat']
      const bpm = t['bpm']
      if (!(isNum(beat) && beat >= 0 && beat <= MAX_BEAT))
        add(issues, `${p}.beat`, 'range', `beat は 0〜${MAX_BEAT} の数（${show(beat)}）`)
      else {
        if (i === 0 && beat !== 0)
          add(issues, `${p}.beat`, 'first_beat', `tempo の先頭は beat 0（${beat}）`)
        if (prevBeat !== undefined && beat <= prevBeat)
          add(issues, `${p}.beat`, 'order', `tempo は beat 昇順（${prevBeat} の次に ${beat}）`)
        prevBeat = beat
      }
      if (!(isNum(bpm) && bpm > 0 && bpm <= MAX_BPM))
        add(issues, `${p}.bpm`, 'range', `bpm は 0 より大きく ${MAX_BPM} 以下（${show(bpm)}）`)
    })
  }

  const timeSig = pulse['timeSig']
  if (timeSig !== undefined) {
    if (!Array.isArray(timeSig))
      add(issues, 'pulse.timeSig', 'type', `timeSig は配列（${show(timeSig)}）`)
    else {
      let prevBeat: number | undefined
      timeSig.forEach((s, i) => {
        const p = `pulse.timeSig[${i}]`
        if (!isRec(s)) {
          add(issues, p, 'type', `timeSig の要素はオブジェクト（${show(s)}）`)
          return
        }
        const beat = s['beat']
        if (!(isNum(beat) && beat >= 0 && beat <= MAX_BEAT))
          add(issues, `${p}.beat`, 'range', `beat は 0〜${MAX_BEAT} の数（${show(beat)}）`)
        else {
          if (prevBeat !== undefined && beat <= prevBeat)
            add(issues, `${p}.beat`, 'order', `timeSig は beat 昇順（${prevBeat} の次に ${beat}）`)
          prevBeat = beat
        }
        for (const k of ['num', 'den'] as const) {
          const v = s[k]
          if (!(isInt(v) && v > 0))
            add(issues, `${p}.${k}`, 'range', `${k} は正の整数（${show(v)}）`)
        }
      })
    }
  }
  return resolution
}

/**
 * Note[] の検査。notes は 1 つ以上で beat 昇順・同拍 midi 昇順・重複なし、track 不可。
 * 同拍の判定は 1/resolution の目盛り（tick）で行い、isMultiple の許容と揃える。
 * accompaniment（allowTrack）は空でよく、順序を見ず track を許す。戻りは配列なら要素数。
 */
function checkNotes(
  notes: unknown,
  path: string,
  resolution: number | undefined,
  allowTrack: boolean,
  issues: ChartIssue[],
): number | undefined {
  if (notes === undefined) {
    add(issues, path, 'missing', `${path} が無い`)
    return undefined
  }
  if (!Array.isArray(notes)) {
    add(issues, path, 'type', `${path} は配列（${show(notes)}）`)
    return undefined
  }
  if (!allowTrack && notes.length === 0) {
    add(issues, path, 'empty', `${path} は 1 つ以上`)
    return 0
  }
  let prev: { beat: number; midi: number } | undefined
  notes.forEach((n, i) => {
    const p = `${path}[${i}]`
    const cur = checkNote(n, p, resolution, allowTrack, issues)
    if (!cur) return
    if (!allowTrack && prev) {
      const curTick = tickOf(cur.beat, resolution)
      const prevTick = tickOf(prev.beat, resolution)
      if (curTick < prevTick)
        add(issues, `${p}.beat`, 'order', `${path} は beat 昇順（${prev.beat} の次に ${cur.beat}）`)
      else if (curTick === prevTick) {
        if (cur.midi < prev.midi)
          add(
            issues,
            `${p}.midi`,
            'order',
            `同拍は midi 昇順（beat ${cur.beat}: ${prev.midi} の次に ${cur.midi}）`,
          )
        else if (cur.midi === prev.midi)
          add(
            issues,
            p,
            'duplicate',
            `同拍・同音の Note が重複（beat ${cur.beat}, midi ${cur.midi}）`,
          )
      }
    }
    prev = cur
  })
  return notes.length
}

/** 1 つの Note。順序検査に使えるとき {beat, midi} を返す */
function checkNote(
  n: unknown,
  p: string,
  resolution: number | undefined,
  allowTrack: boolean,
  issues: ChartIssue[],
): { beat: number; midi: number } | undefined {
  if (!isRec(n)) {
    add(issues, p, 'type', `Note はオブジェクト（${show(n)}）`)
    return undefined
  }
  const midi = n['midi']
  const beat = n['beat']
  const dur = n['dur']
  const vel = n['vel']
  const track = n['track']

  const midiOk = isInt(midi) && midi >= 0 && midi <= 127
  if (midi === undefined) add(issues, `${p}.midi`, 'missing', 'midi が無い')
  else if (!midiOk) add(issues, `${p}.midi`, 'range', `midi は 0〜127 の整数（${show(midi)}）`)

  const beatOk = isNum(beat) && beat >= 0 && beat <= MAX_BEAT
  if (beat === undefined) add(issues, `${p}.beat`, 'missing', 'beat が無い')
  else if (!beatOk)
    add(issues, `${p}.beat`, 'range', `beat は 0〜${MAX_BEAT} の数（${show(beat)}）`)
  else if (resolution !== undefined && !isMultiple(beat as number, resolution))
    add(issues, `${p}.beat`, 'not_multiple', `beat は 1/${resolution} の倍数（${String(beat)}）`)

  if (dur === undefined) add(issues, `${p}.dur`, 'missing', 'dur が無い')
  else if (!(isNum(dur) && dur > 0 && dur <= MAX_BEAT))
    add(issues, `${p}.dur`, 'range', `dur は 0 より大きく ${MAX_BEAT} 拍以下（${show(dur)}）`)

  if (vel !== undefined && !(isInt(vel) && vel >= 0 && vel <= 127))
    add(issues, `${p}.vel`, 'range', `vel は 0〜127 の整数（省略時 ${DEFAULT_VEL}。${show(vel)}）`)

  if (track !== undefined) {
    if (!allowTrack) add(issues, `${p}.track`, 'forbidden', 'track は accompaniment だけ')
    else if (!isStr(track)) add(issues, `${p}.track`, 'type', `track は文字列（${show(track)}）`)
  }

  return midiOk && beatOk ? { beat: beat as number, midi: midi as number } : undefined
}

/** sync。sources は空でよく、/1 は sources[0] だけ読む（sources[1..] は見ない） */
function checkSync(sync: unknown, issues: ChartIssue[]): void {
  if (!requireRec(sync, 'sync', issues)) return
  const sources = sync['sources']
  if (sources === undefined)
    add(issues, 'sync.sources', 'missing', 'sync.sources が無い（空配列でよい）')
  else if (!Array.isArray(sources))
    add(issues, 'sync.sources', 'type', `sources は配列（${show(sources)}）`)
  else if (sources.length > 0) checkSyncSource(sources[0], 'sync.sources[0]', issues)
}

function checkSyncSource(s: unknown, p: string, issues: ChartIssue[]): void {
  if (!isRec(s)) {
    add(issues, p, 'type', `SyncSource はオブジェクト（${show(s)}）`)
    return
  }
  const kind = s['kind']
  const videoId = s['videoId']
  if (!isOneOf(kind, SYNC_KINDS))
    add(issues, `${p}.kind`, 'enum', `kind は ${SYNC_KINDS.join('|')}（${show(kind)}）`)
  else if (kind === 'youtube') {
    if (!(isStr(videoId) && videoId.length > 0))
      add(issues, `${p}.videoId`, 'required', `youtube には videoId が要る（${show(videoId)}）`)
  } else if (videoId !== undefined)
    // 仮: §3.2 は「audio は file を持たない」とだけ言う。動画を使わない印なので videoId も持たせない
    add(issues, `${p}.videoId`, 'forbidden', 'audio は videoId を持たない')

  // offset・rate は audio でも必須（§3.2 の SyncSource どおり。audio では 0・1 を書く）
  const offset = s['offset']
  if (!isNum(offset)) add(issues, `${p}.offset`, 'type', `offset は数（秒。${show(offset)}）`)
  const rate = s['rate']
  if (!(isNum(rate) && rate > 0))
    add(issues, `${p}.rate`, 'range', `rate は正の数（${show(rate)}）`)
  const begin = s['begin']
  if (begin !== undefined && !(isNum(begin) && begin >= 0))
    add(issues, `${p}.begin`, 'range', `begin は 0 以上の数（${show(begin)}）`)
  optionalString(s['label'], `${p}.label`, issues)
  const measured = s['measured']
  if (measured !== undefined && typeof measured !== 'boolean')
    add(issues, `${p}.measured`, 'type', `measured は真偽値（${show(measured)}）`)
}

/** source（decisions #18）。cc-by は license 必須 */
function checkSource(src: unknown, issues: ChartIssue[]): void {
  if (!requireRec(src, 'source', issues)) return
  const kind = src['kind']
  if (!isOneOf(kind, SOURCE_KINDS))
    add(issues, 'source.kind', 'enum', `kind は ${SOURCE_KINDS.join('|')}（${show(kind)}）`)
  const rights = src['rights']
  if (!isOneOf(rights, RIGHTS))
    add(issues, 'source.rights', 'enum', `rights は ${RIGHTS.join('|')}（${show(rights)}）`)

  const license = src['license']
  if (license === undefined) {
    if (rights === 'cc-by')
      add(issues, 'source.license', 'required', 'cc-by は license {id, holder, url} が要る')
  } else if (!isRec(license))
    add(issues, 'source.license', 'type', `license はオブジェクト（${show(license)}）`)
  else
    for (const k of ['id', 'holder', 'url'] as const)
      requireString(license[k], `source.license.${k}`, issues)

  for (const k of ['title', 'composer', 'arranger', 'origin'] as const)
    optionalString(src[k], `source.${k}`, issues)
}

/** variants（decisions #12）。id は `${layout}/${limit}/${fold}`、keys は notes と同じ長さ */
function checkVariants(
  variants: unknown,
  noteCount: number | undefined,
  issues: ChartIssue[],
): void {
  if (!Array.isArray(variants)) {
    add(issues, 'variants', 'type', `variants は配列（${show(variants)}）`)
    return
  }
  const seen = new Set<string>()
  variants.forEach((v, i) => {
    const p = `variants[${i}]`
    if (!isRec(v)) {
      add(issues, p, 'type', `Variant はオブジェクト（${show(v)}）`)
      return
    }
    const layout = v['layout']
    const limit = v['limit']
    const fold = v['fold']
    let headOk = true
    if (!isOneOf(layout, LAYOUT_IDS)) {
      headOk = false
      const hint =
        aliasOf(layout) !== undefined ? `。${String(layout)} は normalizeChart で直す` : ''
      add(
        issues,
        `${p}.layout`,
        'enum',
        `layout は ${LAYOUT_IDS.join('|')}（${show(layout)}${hint}）`,
      )
    }
    if (!isOneOf(limit, CHORD_LIMITS)) {
      headOk = false
      add(issues, `${p}.limit`, 'enum', `limit は ${CHORD_LIMITS.join('|')}（${show(limit)}）`)
    }
    if (!isOneOf(fold, FOLD_IDS)) {
      headOk = false
      add(issues, `${p}.fold`, 'enum', `fold は ${FOLD_IDS.join('|')}（${show(fold)}）`)
    }

    const id = v['id']
    if (!isStr(id)) add(issues, `${p}.id`, 'type', `id は文字列（${show(id)}）`)
    else {
      const expected = `${String(layout)}/${String(limit)}/${String(fold)}`
      if (headOk && id !== expected)
        add(issues, `${p}.id`, 'mismatch', `id は "${expected}"（${show(id)}）`)
      if (seen.has(id))
        add(issues, `${p}.id`, 'duplicate', `同じ id の variant が重複（${show(id)}）`)
      seen.add(id)
    }

    const keys = v['keys']
    if (!Array.isArray(keys)) add(issues, `${p}.keys`, 'type', `keys は配列（${show(keys)}）`)
    else {
      if (noteCount !== undefined && keys.length !== noteCount)
        add(
          issues,
          `${p}.keys`,
          'length',
          `keys は notes と同じ長さ（${noteCount}）だが ${keys.length}`,
        )
      keys.forEach((k, j) => {
        if (!(k === null || (isStr(k) && k.length > 0)))
          add(issues, `${p}.keys[${j}]`, 'type', `keys の要素は code 文字列か null（${show(k)}）`)
      })
    }

    const stats = v['stats']
    if (stats !== undefined) {
      if (!isRec(stats)) add(issues, `${p}.stats`, 'type', `stats はオブジェクト（${show(stats)}）`)
      else
        for (const [k, val] of Object.entries(stats))
          if (!isNum(val)) add(issues, `${p}.stats.${k}`, 'type', `stats の値は数（${show(val)}）`)
    }
    if (v['metrics'] !== undefined) checkMetrics(v['metrics'], `${p}.metrics`, issues)
  })
}

function checkMetrics(m: unknown, p: string, issues: ChartIssue[]): void {
  if (!isRec(m)) {
    add(issues, p, 'type', `metrics はオブジェクト（${show(m)}）`)
    return
  }
  for (const k of METRIC_KEYS) {
    const v = m[k]
    if (v !== undefined && !isNum(v)) add(issues, `${p}.${k}`, 'type', `${k} は数（${show(v)}）`)
  }
}

// ---------- 正規化 ----------

/**
 * 検査の前に掛ける寛容な正規化。入力は変えず、浅い写しを返す（共有する枝: sync・source・別名でない
 * variants[i]・keys・timeSig。pulse は resolution 省略のときだけ写す）。
 * 直すのは: layout の別名（garage→ableton、fl→vmpk の完全一致。トップレベルと variants[]。id の先頭も揃える）、
 * pulse.resolution 省略→240、Note の beat を 1/resolution に丸めと vel 省略→80（notes と accompaniment）、
 * notes と accompaniment の beat 昇順・同拍 midi 昇順の安定ソート。それ以外は変えない。
 * オブジェクトでなければそのまま返す。
 */
export function normalizeChart(input: unknown): unknown {
  if (!isRec(input)) return input
  const out: Rec = { ...input }

  const topCanonical = aliasOf(out['layout'])
  if (topCanonical !== undefined) out['layout'] = topCanonical

  const variants = out['variants']
  if (Array.isArray(variants)) out['variants'] = variants.map(normalizeVariant)

  const pulse = out['pulse']
  const r = isRec(pulse) ? pulse['resolution'] : undefined
  // 採用の条件は checkPulse と同じ（正の整数）。それ以外は 240 で丸める（検査で拒まれる）
  const resolution = isInt(r) && r > 0 ? r : DEFAULT_RESOLUTION
  if (isRec(pulse) && r === undefined) out['pulse'] = { ...pulse, resolution: DEFAULT_RESOLUTION }

  for (const key of ['notes', 'accompaniment'] as const) {
    const list = out[key]
    if (!Array.isArray(list)) continue
    const copy = list.map((n) => normalizeNote(n, resolution))
    if (copy.every(isSortable)) copy.sort(byBeatThenMidi)
    out[key] = copy
  }

  return out
}

function normalizeVariant(v: unknown): unknown {
  if (!isRec(v)) return v
  const layout = v['layout']
  const canonical = aliasOf(layout)
  if (!isStr(layout) || canonical === undefined) return v
  const out: Rec = { ...v, layout: canonical }
  const id = v['id']
  if (isStr(id) && id.startsWith(`${layout}/`)) out['id'] = canonical + id.slice(layout.length)
  return out
}

function normalizeNote(n: unknown, resolution: number): unknown {
  if (!isRec(n)) return n
  const out: Rec = { ...n }
  const beat = n['beat']
  // mstable.ts quantizeBeat と同じ式（validate.ts は types.ts 以外を import しない）
  if (isNum(beat)) out['beat'] = Math.round(beat * resolution) / resolution
  if (n['vel'] === undefined) out['vel'] = DEFAULT_VEL
  return out
}

function isSortable(n: unknown): n is { beat: number; midi: number } {
  return isRec(n) && isNum(n['beat']) && isNum(n['midi'])
}

function byBeatThenMidi(
  a: { beat: number; midi: number },
  b: { beat: number; midi: number },
): number {
  return a.beat - b.beat || a.midi - b.midi
}
