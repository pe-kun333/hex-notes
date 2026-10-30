// 黒鍵の位相の合否（M0-07、手順 9）。出どころ: design.md §2.2・§6.3 M-1（実機の段ずれ。1 台でも退避が要れば初回に
// 退避導線）、decisions #2、m2 `updatePhase` L453–463（そのまま: 位相 ＝ 段ずれの小数部、1/2 からの差が 0.125 以下
// なら合う、0.375 以下なら 1/4u ずれる、それより大きければ合わない〔真上〕）・LAYOUTS の gaps L212–219。
// 閾 0.125／0.375 は 1/4u 刻みの申告（0・1/4・1/2・3/4）をちょうど 3 段に分ける中点（kickoff §7-13、decisions #42、仮）。
// 純関数だけ。

import type { LayoutId } from '../shared/types.ts'
import type { Stagger } from './stagger.ts'

/** 合う／1/4u ずれる／合わない（m2 LV L454） */
export type PhaseLevel = 'ok' | 'mid' | 'ng'

/** 1/2 からの差の閾（u）。以下なら ok、MID 以下なら mid、超えれば ng（m2 L454） */
export const PHASE_OK_U = 0.125
export const PHASE_MID_U = 0.375

/**
 * 配列ごとに位相が効く段間（m2 LAYOUTS の gaps）。ableton は Q 段の黒鍵が A 段の白鍵の間に来るか（Q–A）、
 * vmpk は数字段・A 段の黒鍵（数字–Q・A–Z。Q–A はオクターブの継ぎ目なので見ない、decisions #2）、genshin は黒鍵も
 * 段またぎの意味も無い、wicki は等方で全ての段間の隣が音程の意味を持つ。
 */
export const PHASE_GAPS: Readonly<Record<LayoutId, readonly number[]>> = Object.freeze({
  ableton: [1],
  vmpk: [0, 2],
  genshin: [],
  wicki: [0, 1, 2],
})

/** 等方の配列（位相の言葉が「黒鍵」でなく「六角との位相」になる。m2 L453） */
export const ISO_LAYOUTS: ReadonlySet<LayoutId> = new Set(['wicki'])

export type GapPhase = {
  readonly gap: number
  /** 申告の段ずれ（u） */
  readonly v: number
  /** 位相（v の小数部、0..1） */
  readonly phase: number
  /** 1/2 からの差（u、0..0.5） */
  readonly err: number
  readonly level: PhaseLevel
  /** この配列で効く段間か */
  readonly relevant: boolean
}

export type LayoutPhase = {
  readonly gaps: readonly GapPhase[]
  /** 効く段間の最悪の段。効く段間が無ければ null（位相は関係なし） */
  readonly worst: PhaseLevel | null
  readonly iso: boolean
}

const RANK: Readonly<Record<PhaseLevel, number>> = { ok: 0, mid: 1, ng: 2 }

/** 段ずれ 1 つの位相の段（m2 L454） */
export function phaseLevel(v: number): { phase: number; err: number; level: PhaseLevel } {
  const phase = ((v % 1) + 1) % 1
  const err = Math.abs(phase - 0.5)
  const level: PhaseLevel = err <= PHASE_OK_U ? 'ok' : err <= PHASE_MID_U ? 'mid' : 'ng'
  return { phase, err, level }
}

/** 配列 × 段ずれの位相の表（m2 updatePhase L453–463） */
export function layoutPhase(layout: LayoutId, v: Stagger): LayoutPhase {
  const rel = PHASE_GAPS[layout]
  let worst: PhaseLevel | null = null
  const gaps = v.map((x, gap): GapPhase => {
    const p = phaseLevel(x)
    const relevant = rel.includes(gap)
    if (relevant && (worst === null || RANK[p.level] > RANK[worst])) worst = p.level
    return { gap, v: x, ...p, relevant }
  })
  return { gaps, worst, iso: ISO_LAYOUTS.has(layout) }
}
