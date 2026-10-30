// 判定の返しと演出（M0-03b、手順 6）。出どころ: design.md §1.3 S2「NEAR はセルが押したキーへ半分滑る。判定の返しはセル内の
// 縁 2→6 px・120 ms だけ。演出は落下域と鍵盤図の領域内だけ」、§2.8（判定文字は鍵盤図の上に 600 ms）、m1-geometry
// drawEffects L429–436（手直し: ヒット輪 1.85R・450 ms → 縁、NEAR の滑りは L431 の 160 ms を流用）、m4 判定文字 L547、
// decisions #29・#31（仮）。時刻は実時間 ms（t.real）。純関数。

import type { Judgment, KeyCode } from '../../shared/types.ts'
import type { KeyboardGrid } from '../hex/grid.ts'
import { SQ3 } from '../hex/hex.ts'
import type { LandingMode } from '../hex/landing.ts'
import { lineY } from '../hex/landing.ts'
import type { FlashMode } from './budget.ts'
import { DEGRADED_WIDTH, FLASH_MS } from './budget.ts'
import { CELL_SCALE, cellVertices, drawRadius } from './cells.ts'
import type { DrawCommand, PolyCmd, Regions, TextCmd } from './primitives.ts'
import { polyArea } from './primitives.ts'

/** 縁の返し: 幅 2 → 6 px を 120 ms で（§1.3） */
export const EDGE_RETURN_MS = 120
export const EDGE_RETURN_FROM = 2
export const EDGE_RETURN_TO = 6
/** NEAR の滑り: 押した鍵へ半分を 160 ms で（m1' L431） */
export const SLIDE_MS = 160
export const SLIDE_SHARE = 0.5
/** 判定文字の表示時間 ms（§2.8、m4 L547） */
export const JUDGE_TEXT_MS = 600

/** 入門者の判定の言葉（S3 の内訳と同じ） */
export const JUDGE_WORDS: Readonly<Record<Judgment, string>> = {
  perfect: 'ぴったり',
  great: 'よい',
  good: 'おしい',
  near: 'となり',
  miss: 'はずれ',
}

/** 演出の要求（呼ぶ側が判定のときに作る。flash は budget.admitFlash の結果を mode に持つ） */
export type FxIntent =
  | {
      readonly kind: 'edgeReturn'
      readonly atMs: number
      readonly code: KeyCode
      readonly grade: Judgment
    }
  | { readonly kind: 'slide'; readonly atMs: number; readonly from: KeyCode; readonly to: KeyCode }
  | {
      readonly kind: 'judgeText'
      readonly atMs: number
      readonly grade: Judgment
      /** 押した時刻 − 着地時刻（負が早い）。表示しないなら null */
      readonly dtMs: number | null
    }
  | {
      readonly kind: 'flash'
      readonly atMs: number
      readonly codes: readonly KeyCode[]
      readonly mode: FlashMode
    }

/** 演出の寿命 ms */
export function lifetimeOf(fx: FxIntent): number {
  switch (fx.kind) {
    case 'edgeReturn':
      return EDGE_RETURN_MS
    case 'slide':
      return SLIDE_MS
    case 'judgeText':
      return JUDGE_TEXT_MS
    case 'flash':
      return FLASH_MS
  }
}

/** 終わった演出を落とす（寿命ちょうどまでは残す） */
export function pruneEffects(effects: readonly FxIntent[], realMs: number): FxIntent[] {
  return effects.filter((e) => realMs - e.atMs <= lifetimeOf(e))
}

/** 縁の返しの幅 px（経過 0 で 2、120 で 6、その外は null） */
export function edgeReturnWidth(elapsedMs: number): number | null {
  if (elapsedMs < 0 || elapsedMs > EDGE_RETURN_MS) return null
  return EDGE_RETURN_FROM + ((EDGE_RETURN_TO - EDGE_RETURN_FROM) * elapsedMs) / EDGE_RETURN_MS
}

/** セルの中に収まる縁: 線の幅 w の中心を径 r − w/√3 に置く（外へ張り出さない） */
function insetRing(cx: number, cy: number, r: number, midi: number | null, w: number) {
  return cellVertices(cx, cy, Math.max(0, r - w / SQ3), midi)
}

/** 閃光の面積（セルの六角の面積の和。CELL_SCALE・奥行き込み） */
export function flashArea(
  codes: readonly KeyCode[],
  grid: KeyboardGrid,
  mode: LandingMode,
  depth: boolean,
): number {
  let a = 0
  for (const code of codes) {
    const c = grid.byCode.get(code)
    if (!c) continue
    a += polyArea(cellVertices(c.cx, c.cy, drawRadius(grid, c, mode, CELL_SCALE, depth), c.midi))
  }
  return a
}

export type FeedbackInput = {
  readonly grid: KeyboardGrid
  readonly mode: LandingMode
  readonly depth: boolean
  readonly flashes: boolean
  readonly regions: Regions
  readonly realMs: number
}

/**
 * 演出のコマンド。fx の層の中は slide → edgeReturn → flash → judgeText の順（各種類の中は要求の順）。
 * 判定文字は最後の 1 つだけ（m1' lastJudge）。flashes false（低負荷の段 1 以上）は閃光を出さない。
 */
export function feedbackCommands(effects: readonly FxIntent[], o: FeedbackInput): DrawCommand[] {
  const slides: DrawCommand[] = []
  const edges: DrawCommand[] = []
  const flashes: DrawCommand[] = []
  let judge: Extract<FxIntent, { kind: 'judgeText' }> | null = null
  for (const fx of effects) {
    const el = o.realMs - fx.atMs
    if (el < 0 || el > lifetimeOf(fx)) continue
    if (fx.kind === 'edgeReturn') {
      const c = o.grid.byCode.get(fx.code)
      const w = edgeReturnWidth(el)
      if (!c || w === null) continue
      const r = drawRadius(o.grid, c, o.mode, CELL_SCALE, o.depth)
      edges.push({
        kind: 'poly',
        layer: 'fx',
        region: 'keys',
        tag: 'edgeReturn',
        pts: insetRing(c.cx, c.cy, r, c.midi, w),
        stroke: `judge:${fx.grade}`,
        width: w,
      })
    } else if (fx.kind === 'slide') {
      const a = o.grid.byCode.get(fx.from)
      const b = o.grid.byCode.get(fx.to)
      if (!a || !b) continue
      const q = Math.min(1, el / SLIDE_MS)
      const x = a.cx + (b.cx - a.cx) * SLIDE_SHARE * q
      const y = a.cy + (b.cy - a.cy) * SLIDE_SHARE * q
      const r = drawRadius(o.grid, a, o.mode, CELL_SCALE, o.depth)
      slides.push({
        kind: 'poly',
        layer: 'fx',
        region: 'keys',
        tag: 'slide',
        pts: cellVertices(x, y, r, a.midi),
        fill: 'judge:near',
        alpha: 0.7 * (1 - q),
      })
    } else if (fx.kind === 'flash') {
      if (!o.flashes) continue
      const p = el / FLASH_MS
      for (const code of fx.codes) {
        const c = o.grid.byCode.get(code)
        if (!c) continue
        const r = drawRadius(o.grid, c, o.mode, CELL_SCALE, o.depth)
        const cmd: PolyCmd =
          fx.mode === 'full'
            ? {
                kind: 'poly',
                layer: 'fx',
                region: 'keys',
                tag: 'flash',
                pts: cellVertices(c.cx, c.cy, r, c.midi),
                fill: 'flash',
                alpha: 0.6 * (1 - p),
              }
            : {
                kind: 'poly',
                layer: 'fx',
                region: 'keys',
                tag: 'flash',
                pts: insetRing(c.cx, c.cy, r, c.midi, DEGRADED_WIDTH),
                stroke: 'flash',
                width: DEGRADED_WIDTH,
                alpha: 1 - p,
              }
        flashes.push(cmd)
      }
    } else if (judge === null || fx.atMs >= judge.atMs) judge = fx
  }
  return [...slides, ...edges, ...flashes, ...(judge ? judgeTextCommands(judge, o) : [])]
}

/**
 * 判定文字（m1' drawEffects L434–436）。鍵盤図の上（一本線なら線の上）2.2·R に 1.3·R 太字、経過で 10 px 上がり 1 − p² で
 * 薄れる。great・good・near は 0.6·R の「±n ms」を下に添える。落下域の中へ寄せる。
 */
export function judgeTextCommands(
  fx: Extract<FxIntent, { kind: 'judgeText' }>,
  o: FeedbackInput,
): TextCmd[] {
  const R = o.grid.R
  const p = Math.min(1, Math.max(0, (o.realMs - fx.atMs) / JUDGE_TEXT_MS))
  const alpha = 1 - p * p
  const fall = o.regions.fall
  const x = fall.x + fall.w / 2
  const base = o.mode === 'line' ? lineY(o.grid) : o.grid.top
  const px = 1.3 * R
  const subPx = 0.6 * R
  const withSub =
    fx.dtMs !== null && (fx.grade === 'great' || fx.grade === 'good' || fx.grade === 'near')
  const lo = fall.y + px / 2
  const hi = fall.y + fall.h - px / 2 - (withSub ? 0.95 * R + subPx / 2 - px / 2 : 0)
  const y = Math.min(Math.max(base - 2.2 * R - p * 10, lo), Math.max(lo, hi))
  const word = JUDGE_WORDS[fx.grade]
  const out: TextCmd[] = [
    {
      kind: 'text',
      layer: 'fx',
      region: 'fall',
      tag: 'judgeText',
      x,
      y,
      text: word,
      px,
      weight: 700,
      paint: `judge:${fx.grade}`,
      alpha,
    },
  ]
  if (withSub && fx.dtMs !== null) {
    const s = `${fx.dtMs < 0 ? '−' : '+'}${Math.abs(Math.round(fx.dtMs))} ms`
    out.push({
      kind: 'text',
      layer: 'fx',
      region: 'fall',
      tag: 'judgeText',
      x,
      y: y + 0.95 * R,
      text: s,
      px: subPx,
      weight: 500,
      paint: 'ink',
      alpha,
    })
  }
  return out
}
