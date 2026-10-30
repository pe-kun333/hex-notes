// 「位置で読めるか」の記録と集計（手順 6 の 1 日目、開発ページ play-dev が使う）。出どころ: 相談 B の 5 観点
// （docs/planning/consult/B-render-commands.md）、ADR 0006（確認の方法）。製品の判定層（手順 8）ではない。
// keydown を着地 ±300 ms の音に対応付け、外し率・時刻のばらつき・入れ違い・和音の揃いを数える。純関数（DOM に触れない）。

import type { KeyCode } from '../../shared/types.ts'

/** 対応付けの幅 ms（相談 B） */
export const MATCH_MS = 300

export type NoteOutcome = {
  readonly index: number
  readonly code: KeyCode
  /** 使う段の中での上からの順（0 が最上段） */
  readonly rowIndex: number
  readonly tLandMs: number
  readonly group: number
  /** 押した時刻（譜面の ms）。対応する keydown が無ければ null */
  readonly pressMs: number | null
  /** 対応した keydown の鍵（鍵違いなら code と違う） */
  readonly pressedCode: KeyCode | null
}

export type ReadabilitySummary = {
  readonly notes: number
  /** ±300 ms に keydown が無い音 */
  readonly missed: number
  /** ±300 ms の keydown が別の鍵だった音 */
  readonly wrongKey: number
  /** (missed + wrongKey) / notes */
  readonly missRate: number
  /** 正しい鍵の dt（押した − 着地）の標本標準偏差 ms。2 つ未満は null */
  readonly dtSd: number | null
  /** 段ごとの dt の標本標準偏差（rowIndex → SD） */
  readonly dtSdByRow: Readonly<Record<number, number | null>>
  /**
   * 正しく押した音を和音（group）ごとにまとめ、着地の順に隣り合う和音の組で「前の和音の押した時刻の最大 ＞ 次の和音の
   * 押した時刻の最小」になった回数（和音の中の音の並びに依らない。ADR 0006 の判断は単音の負荷譜面で使う）
   */
  readonly inversions: number
  /** 2 音以上の和音で全部を正しく押した物の、押した時刻の幅（最大 − 最小）の中央値 ms。無ければ null */
  readonly chordSpreadMedian: number | null
}

/** 標本標準偏差（n − 1。m3 sd L248 と同じ） */
export function sampleSd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null
  const m = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const h = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? (s[h] ?? null) : ((s[h - 1] ?? 0) + (s[h] ?? 0)) / 2
}

/**
 * keydown を音に対応付ける。±300 ms にまだ対応の無い音のうち、同じ鍵で最も近い音を取る。同じ鍵が無ければ最も近い音を
 * 鍵違いとして取る。どれも無ければ null（空打ち）。
 */
export function matchPress(
  outcomes: readonly NoteOutcome[],
  code: KeyCode,
  pressMs: number,
): number | null {
  let same = -1
  let sameD = Number.POSITIVE_INFINITY
  let any = -1
  let anyD = Number.POSITIVE_INFINITY
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i]
    if (o === undefined || o.pressMs !== null) continue
    const d = Math.abs(pressMs - o.tLandMs)
    if (d > MATCH_MS) continue
    if (o.code === code && d < sameD) {
      same = i
      sameD = d
    }
    if (d < anyD) {
      any = i
      anyD = d
    }
  }
  const pick = same >= 0 ? same : any
  return pick >= 0 ? pick : null
}

export function summarize(outcomes: readonly NoteOutcome[]): ReadabilitySummary {
  const ok = outcomes.filter((o) => o.pressMs !== null && o.pressedCode === o.code)
  const missed = outcomes.filter((o) => o.pressMs === null).length
  const wrongKey = outcomes.filter((o) => o.pressMs !== null && o.pressedCode !== o.code).length
  const dt = (o: NoteOutcome): number => (o.pressMs ?? 0) - o.tLandMs
  const rows = [...new Set(outcomes.map((o) => o.rowIndex))].sort((a, b) => a - b)
  const dtSdByRow: Record<number, number | null> = {}
  for (const r of rows) dtSdByRow[r] = sampleSd(ok.filter((o) => o.rowIndex === r).map(dt))
  const pressedGroups = new Map<number, { land: number; min: number; max: number }>()
  for (const o of ok) {
    const p = o.pressMs ?? 0
    const g = pressedGroups.get(o.group)
    if (g)
      pressedGroups.set(o.group, {
        land: Math.min(g.land, o.tLandMs),
        min: Math.min(g.min, p),
        max: Math.max(g.max, p),
      })
    else pressedGroups.set(o.group, { land: o.tLandMs, min: p, max: p })
  }
  const chordOrder = [...pressedGroups.values()].sort((a, b) => a.land - b.land)
  let inversions = 0
  for (let i = 1; i < chordOrder.length; i++) {
    const a = chordOrder[i - 1]
    const b = chordOrder[i]
    if (a && b && a.max > b.min) inversions++
  }
  const groups = new Map<number, NoteOutcome[]>()
  for (const o of outcomes) groups.set(o.group, [...(groups.get(o.group) ?? []), o])
  const spreads: number[] = []
  for (const g of groups.values()) {
    if (g.length < 2 || !g.every((o) => o.pressMs !== null && o.pressedCode === o.code)) continue
    const ps = g.map((o) => o.pressMs ?? 0)
    spreads.push(Math.max(...ps) - Math.min(...ps))
  }
  return {
    notes: outcomes.length,
    missed,
    wrongKey,
    missRate: outcomes.length === 0 ? 0 : (missed + wrongKey) / outcomes.length,
    dtSd: sampleSd(ok.map(dt)),
    dtSdByRow,
    inversions,
    chordSpreadMedian: median(spreads),
  }
}
