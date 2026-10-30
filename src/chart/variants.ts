// 譜面版（配列 × 同時押し上限 × 折り畳み）の生成（M0-02 後半、手順 3）。出どころ: docs/design.md §2.1・§2.4・
// §3.2、decisions #7・#12・#20・#21・#23、m5 buildVariant L324–363 の手直し。
// そのまま: 折り畳み 3 種（octave は音域の中へオクターブで寄せ、音名が無ければ落とす／cut は無い音を落とす／
// nearest は最も近い音へ、等距離は上へ）と、統計の数え方（movedFold は重複・間引きで落ちた音も数える）。
// 手直し: 同拍の目盛りは round(beat×1000)・差 1e-3 → 1/resolution の tick。重複（同拍で同じ音高へ畳まれた音）と
// 間引きは原曲音高で比べ、高い方を残す（m5 は畳んだ後の音高で比べ、重複は低い方を残す。decisions #20、仮）。
// 同音の鍵は前の音からの六角距離 → 既定の規則（decisions #21、仮）。指標 metrics は作らない（M2-01）。
// 入力の notes は正規化済み（tick 昇順・同 tick は midi 昇順・同 tick 同音なし）。keys は notes と同じ長さで
// 落とした音は null。鳴る音高は配列表の map[keys[i]]（折り畳み後）。
// 純関数だけ（グローバル状態・DOM・Node に触れない。tools/ からも import する）。

import type { Chart, ChordLimit, FoldId, KeyCode, LayoutId, Variant } from '../shared/types.ts'
import { CHORD_LIMITS, FOLD_IDS, LAYOUT_IDS, MAX_RESOLUTION } from '../shared/types.ts'
import { KEY_CODES, LAYOUTS, midiRange } from '../layout/presets.ts'

export type VariantSpec = {
  readonly layout: LayoutId
  readonly limit: ChordLimit
  readonly fold: FoldId
}

/**
 * 同梱曲に自動生成する譜面版。配列と上限は design.md §2.9（Ableton×{2,3}・VMPK×{2,3}）、
 * fold は octave（decisions #23、仮。§2.9 は fold を書いていない）
 */
export const BUNDLED_VARIANT_SPECS: readonly VariantSpec[] = Object.freeze(
  (
    [
      { layout: 'ableton', limit: 2, fold: 'octave' },
      { layout: 'ableton', limit: 3, fold: 'octave' },
      { layout: 'vmpk', limit: 2, fold: 'octave' },
      { layout: 'vmpk', limit: 3, fold: 'octave' },
    ] as const
  ).map((s) => Object.freeze(s)),
)

/**
 * variants[].stats の中身。数え方は m5 の stats と同じ。buildVariant の出力では srcNotes ＝ notes.length、
 * droppedFold ＋ droppedThin ＝ keys の null が成り立つ（convertM5 は m5 の生の数を写すので成り立たないことがある。
 * decisions #22）
 */
export type VariantStats = {
  /** 入力の音数（notes.length） */
  srcNotes: number
  /** 折り畳みで落とした音（cut の音域外・octave で音名が無い・同拍で同じ音高への重複） */
  droppedFold: number
  /** 折り畳みで音高を動かした音（後で重複・間引きで落ちた音も数える） */
  movedFold: number
  /** 同時押し上限で落とした音 */
  droppedThin: number
  /** 残った音の同拍の最大数（0 は全部落ちた） */
  chordMax: number
}

/** 譜面版の id（decisions #12）。例 "ableton/2/octave" */
export function variantId(spec: VariantSpec): string {
  return `${spec.layout}/${spec.limit}/${spec.fold}`
}

/** 折り畳みの結果。null は落とす（cut の音域外、octave で音名が配列に無い） */
export type FoldResult = { midi: number; moved: boolean } | null

/** その配列で鳴らせる音高（昇順、重複なし） */
function pitchesOf(layout: LayoutId): number[] {
  return [...new Set(Object.values(LAYOUTS[layout].map))].sort((a, b) => a - b)
}

/** 1 音の折り畳み（m5 buildVariant L329–337 と同じ手順）。音域の内で配列にある音はそのまま */
export function foldPitch(midi: number, layout: LayoutId, fold: FoldId): FoldResult {
  const pitches = pitchesOf(layout)
  return foldIn(midi, new Set(pitches), pitches, midiRange(layout), fold)
}

function foldIn(
  midi: number,
  has: ReadonlySet<number>,
  pitches: readonly number[],
  range: { min: number; max: number },
  fold: FoldId,
): FoldResult {
  if (has.has(midi)) return { midi, moved: false }
  if (fold === 'cut') return null
  if (fold === 'octave') {
    let m = midi
    while (m < range.min) m += 12
    while (m > range.max) m -= 12
    // 音域の中で同じ音名を上へ探し、無ければ下へ（原神型の黒鍵などは見つからず落ちる）
    for (let x = m; x <= range.max; x += 12) if (has.has(x)) return { midi: x, moved: true }
    for (let x = m - 12; x >= range.min; x -= 12) if (has.has(x)) return { midi: x, moved: true }
    return null
  }
  // nearest: 最も近い音。等距離なら上の音
  let best = pitches[0]
  let bestDist = Number.POSITIVE_INFINITY
  for (const x of pitches) {
    const d = Math.abs(x - midi)
    if (d < bestDist || (d === bestDist && x > midi)) {
      best = x
      bestDist = d
    }
  }
  if (best === undefined) throw new Error('配列表が空')
  return { midi: best, moved: true }
}

/**
 * 音高 → 押す鍵の既定（decisions #21、仮）。候補が 1 つならそれ。複数（vmpk の 60〜64、wicki）なら
 * 60 以上は上の段、60 未満は下の段（design.md §2.1「60 以上は Q 段側」を全配列に広げた）。無ければ null
 */
export function defaultKeyOf(layout: LayoutId, midi: number): KeyCode | null {
  return pickKey(candidatesOf(layout).get(midi), midi)
}

/** 音高 → 候補の鍵（KEY_CODES の順＝上の段が先） */
function candidatesOf(layout: LayoutId): Map<number, KeyCode[]> {
  const map = LAYOUTS[layout].map
  const byPitch = new Map<number, KeyCode[]>()
  for (const code of KEY_CODES) {
    if (!Object.hasOwn(map, code)) continue
    const midi = map[code]
    if (midi === undefined) continue
    const list = byPitch.get(midi)
    if (list) list.push(code)
    else byPitch.set(midi, [code])
  }
  return byPitch
}

function pickKey(cands: readonly KeyCode[] | undefined, midi: number): KeyCode | null {
  if (!cands || cands.length === 0) return null
  return (midi >= 60 ? cands[0] : cands[cands.length - 1]) ?? null
}

/**
 * 譜面版を 1 つ作る。chart は notes と pulse.resolution だけ見る（validateChart を通った物）。
 * 手順: 折り畳み → 同拍で同じ音高への重複を落とす（原曲音高の高い方を残す）→ 同拍の数が上限を超えたら
 * 原曲音高の低い方から落とす（最上声を残す。design.md §2.4）→ 残った音に既定の鍵。
 * notes が正規化済みでなければ RangeError（添字が keys の番号なので、並べ替えずに止める。beat が有限でない・
 * midi が整数でない・resolution が 1〜MAX_RESOLUTION の整数でないときも止める）
 */
export function buildVariant(chart: Pick<Chart, 'notes' | 'pulse'>, spec: VariantSpec): Variant {
  checkSpec(spec)
  const { notes } = chart
  const resolution = chart.pulse.resolution
  if (!(Number.isInteger(resolution) && resolution > 0 && resolution <= MAX_RESOLUTION))
    throw new RangeError(`buildVariant: resolution は 1〜${MAX_RESOLUTION} の整数（${resolution}）`)
  const ticks = notes.map((n) => Math.round(n.beat * resolution))
  for (const [i, n] of notes.entries()) {
    const t1 = ticks[i] as number
    if (!Number.isFinite(t1) || !Number.isInteger(n.midi))
      throw new RangeError(
        `buildVariant: notes[${i}] の beat は有限の数、midi は整数（beat ${n.beat}・midi ${n.midi}）`,
      )
    if (i === 0) continue
    const t0 = ticks[i - 1] as number
    const m0 = (notes[i - 1] as { midi: number }).midi
    if (t1 < t0 || (t1 === t0 && n.midi <= m0))
      throw new RangeError(
        `buildVariant: notes は正規化済みで渡す（notes[${i}]: tick ${t0}・midi ${m0} の次に tick ${t1}・midi ${n.midi}）`,
      )
  }

  const pitches = pitchesOf(spec.layout)
  const has = new Set(pitches)
  const range = midiRange(spec.layout)
  const byPitch = candidatesOf(spec.layout)
  const target: (number | null)[] = []
  const stats: VariantStats = {
    srcNotes: notes.length,
    droppedFold: 0,
    movedFold: 0,
    droppedThin: 0,
    chordMax: 0,
  }
  for (const n of notes) {
    const f = foldIn(n.midi, has, pitches, range, spec.fold)
    if (f === null) stats.droppedFold++
    else if (f.moved) stats.movedFold++
    target.push(f === null ? null : f.midi)
  }

  const keys: (KeyCode | null)[] = notes.map(() => null)
  // 同 tick の塊ごと。notes は同 tick で midi 昇順なので、後の音ほど原曲音高が高い
  for (let start = 0; start < notes.length;) {
    let end = start + 1
    while (end < notes.length && ticks[end] === ticks[start]) end++
    // 重複: 同じ音高へ畳まれた音は最後（原曲音高の最も高い音）だけ残す
    const lastOf = new Map<number, number>()
    for (let i = start; i < end; i++) {
      const t = target[i]
      if (t === null || t === undefined) continue
      if (lastOf.has(t)) stats.droppedFold++
      lastOf.set(t, i)
    }
    const kept = [...lastOf.values()].sort((a, b) => a - b)
    // 間引き: 上限を超えた分を原曲音高の低い方（添字の小さい方）から落とす
    const drop = Math.max(0, kept.length - spec.limit)
    stats.droppedThin += drop
    const live = kept.slice(drop)
    for (const i of live) keys[i] = pickKey(byPitch.get(target[i] as number), target[i] as number)
    stats.chordMax = Math.max(stats.chordMax, live.length)
    start = end
  }

  return {
    id: variantId(spec),
    layout: spec.layout,
    limit: spec.limit,
    fold: spec.fold,
    keys,
    stats: { ...stats },
  }
}

/** 譜面版を並べて作る（既定は同梱曲の 4 版）。同じ id が 2 度出たら RangeError */
export function buildVariants(
  chart: Pick<Chart, 'notes' | 'pulse'>,
  specs: readonly VariantSpec[] = BUNDLED_VARIANT_SPECS,
): Variant[] {
  const seen = new Set<string>()
  return specs.map((spec) => {
    const id = variantId(spec)
    if (seen.has(id)) throw new RangeError(`buildVariants: 同じ譜面版が 2 度ある（${id}）`)
    seen.add(id)
    return buildVariant(chart, spec)
  })
}

/** 型の外から来た値（tools の引数など）を止める */
function checkSpec(spec: VariantSpec): void {
  if (!LAYOUT_IDS.includes(spec.layout))
    throw new RangeError(
      `buildVariant: layout は ${LAYOUT_IDS.join('|')}（${String(spec.layout)}）`,
    )
  if (!CHORD_LIMITS.includes(spec.limit))
    throw new RangeError(
      `buildVariant: limit は ${CHORD_LIMITS.join('|')}（${String(spec.limit)}）`,
    )
  if (!FOLD_IDS.includes(spec.fold))
    throw new RangeError(`buildVariant: fold は ${FOLD_IDS.join('|')}（${String(spec.fold)}）`)
}
