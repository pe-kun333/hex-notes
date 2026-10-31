// 結果の分析（M1-06、M1 の手順 5）。出どころ: m6 S3 L374（「同時押しが合った割合 78%（14 ／ 18 拍）」）・L386（「ミスが
// 集まった 2 小節: 17〜18 小節」）、m1-kickoff 手順 5（苦手区間 ＝ miss が最も多い連続 2 小節〔timeSig から小節を数え、
// 1 始まり〕、同時押しが合った割合 ＝ 同じ tick に 2 音以上ある拍のうち構成音を全て当てた拍の割合）。純関数。
// 音ごとの結果は判定層（resultsByIndex）から呼ぶ側が作る。仮の所（m1-kickoff §7-18 に足す）: 苦手区間が同じ数なら前の
// 組、miss が 0 なら無し、1 小節だけの曲はその 1 小節。和音の「当てた」は正しい鍵の perfect・great・good（NEAR は
// 隣の鍵なので入れない）、skipped の音を含む和音は分母から外す。

import type { Judgment, Pulse } from '../shared/types.ts'

/** 1 音の結果（tick ＝ beat × resolution の整数。grade は未判定・skipped なら null） */
export interface NoteOutcome {
  readonly tick: number
  readonly grade: Judgment | null
  readonly skipped: boolean
}

/**
 * 拍 → 小節（1 始まり）。timeSig が無ければ 4/4。拍子の区間ごとに小節の長さ（拍 ＝ 4 分音符、num × 4 ／ den）で数え、
 * 区間の途中で拍子が変わったら、その半端な小節も 1 つに数える
 */
export function barOf(pulse: Pick<Pulse, 'timeSig'>, beat: number): number {
  let bars = 0
  let start = 0
  let len = 4
  for (const ts of pulse.timeSig ?? []) {
    if (ts.beat > beat) break
    if (ts.beat > start) bars += Math.ceil((ts.beat - start) / len - 1e-9)
    start = ts.beat
    len = (ts.num * 4) / ts.den
  }
  return bars + Math.floor((beat - start) / len + 1e-9) + 1
}

export interface WeakBars {
  /** 小節（1 始まり） */
  readonly from: number
  readonly to: number
  readonly misses: number
}

/** miss が最も多い連続 2 小節（同じ数なら前の組）。miss が 0 なら null */
export function weakBars(
  pulse: Pick<Pulse, 'resolution' | 'timeSig'>,
  notes: readonly NoteOutcome[],
): WeakBars | null {
  const perBar = new Map<number, number>()
  let last = 0
  for (const n of notes) {
    const bar = barOf(pulse, n.tick / pulse.resolution)
    last = Math.max(last, bar)
    if (n.grade === 'miss') perBar.set(bar, (perBar.get(bar) ?? 0) + 1)
  }
  if (perBar.size === 0) return null
  if (last === 1) return { from: 1, to: 1, misses: perBar.get(1) ?? 0 }
  let best: WeakBars | null = null
  for (let b = 1; b < last; b++) {
    const misses = (perBar.get(b) ?? 0) + (perBar.get(b + 1) ?? 0)
    if (best === null || misses > best.misses) best = { from: b, to: b + 1, misses }
  }
  return best
}

const HIT: ReadonlySet<Judgment | null> = new Set<Judgment | null>(['perfect', 'great', 'good'])

export interface ChordRate {
  /** 構成音を全て当てた和音の数 */
  readonly hit: number
  /** 和音（同じ tick に 2 音以上。skipped を含む和音は外す）の数 */
  readonly total: number
}

/** 同時押しが合った割合（和音が無ければ total 0） */
export function chordRate(notes: readonly NoteOutcome[]): ChordRate {
  const byTick = new Map<number, NoteOutcome[]>()
  for (const n of notes) byTick.set(n.tick, [...(byTick.get(n.tick) ?? []), n])
  let hit = 0
  let total = 0
  for (const g of byTick.values()) {
    if (g.length < 2 || g.some((n) => n.skipped)) continue
    total++
    if (g.every((n) => HIT.has(n.grade))) hit++
  }
  return { hit, total }
}
