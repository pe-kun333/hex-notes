// ヒートマップの描画コマンド（M4-04、M4 の手順 1）。出どころ: m4-practice の drawHeat L514–519・lateColor L513・凡例 L188、
// m6-flow の色の名前（--heat-early・--heat-late・--heat-miss）、docs/planning/m4-kickoff.md 手順 1・§7-9、decisions #120。
// 鍵盤図のセルに重ねる多角形だけを返す（Canvas に触れない）。呼ぶ側は keyboardCommands の polys の後・texts の前に挟む
// （キー文字を上に残す）。
//
// 寸法は描くセルの径 r（drawRadius。grid.R × 0.93 × 奥行き、端の黒鍵は縮む）に対して決める:
// - 扇: 誤打の向きごと。中心から HEX_DIRS の向き ±30° の扇形で、長さ 0.25〜0.85·r を回数（その回の全部の鍵の最大で割る）に
//   比例させる。0.85·r は辺の中点 0.866·r の内側なので、白鍵（辺が隣を向く）も黒鍵（30° 回して頂点が隣を向く）も外へ出ない。
// - 丸: ずれの平均。半径 0.3·r、中心はラベルの下へ 0.35·r ずらす（m4 L517）。早い（負）は heatEarly、遅い（0 以上）は
//   heatLate で、濃さ（alpha 0.35〜1）を |平均| 60 ms で飽和させる（m4 の明度の段の代わり。色は名前で持つため）。
// - 輪: ずれの SD（n − 1）。半径 0.3〜0.5·r を SD 0〜100 ms に比例させる。標本が 2 つ未満の鍵は描かない。m4 の 0.75·r は
//   セルの外へ出る（黒鍵の下の辺は中心から 0.866·r、輪の中心からは 0.516·r）ので 0.5·r に縮めた。

import type { KeyboardGrid } from '../hex/grid.ts'
import { HEX_DIRS } from '../hex/hex.ts'
import type { LandingMode } from '../hex/landing.ts'
import type { HeatStat } from '../../results/heat.ts'
import type { KeyCode } from '../../shared/types.ts'
import { CELL_SCALE, drawRadius } from './cells.ts'
import type { PolyCmd, Pt } from './primitives.ts'

export const HEAT_FAN_MIN = 0.25
export const HEAT_FAN_MAX = 0.85
export const HEAT_DOT = 0.3
export const HEAT_DROP = 0.35
export const HEAT_RING_MIN = 0.3
export const HEAT_RING_MAX = 0.5
/** 輪が最大になる SD ms */
export const HEAT_SD_FULL_MS = 100
/** 丸の濃さが飽和する |平均| ms（m4 lateColor の ±60） */
export const HEAT_MEAN_FULL_MS = 60
export const HEAT_DOT_ALPHA_MIN = 0.35
export const HEAT_FAN_ALPHA = 0.85
/** 扇の弧と丸を多角形で近似する刻み（度） */
const ARC_STEP_DEG = 7.5
const CIRCLE_VERTS = 24

const meta = { layer: 'keys', region: 'keys' } as const

/** 扇の長さ px（count 回、全部の鍵の最大 max 回） */
export function fanLength(r: number, count: number, max: number): number {
  const t = max > 0 ? Math.min(1, count / max) : 0
  return r * (HEAT_FAN_MIN + (HEAT_FAN_MAX - HEAT_FAN_MIN) * t)
}

/** 輪の半径 px */
export function ringRadius(r: number, sdMs: number): number {
  return (
    r *
    (HEAT_RING_MIN +
      (HEAT_RING_MAX - HEAT_RING_MIN) * Math.min(1, Math.abs(sdMs) / HEAT_SD_FULL_MS))
  )
}

/** 丸の濃さ */
export function dotAlpha(meanMs: number): number {
  return (
    HEAT_DOT_ALPHA_MIN +
    (1 - HEAT_DOT_ALPHA_MIN) * Math.min(1, Math.abs(meanMs) / HEAT_MEAN_FULL_MS)
  )
}

function circle(cx: number, cy: number, rad: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < CIRCLE_VERTS; i++) {
    const a = (2 * Math.PI * i) / CIRCLE_VERTS
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)])
  }
  return pts
}

/** 向き d（HEX_DIRS の添字、辺の中点の角度 60·d 度）の扇形（中心＋弧） */
function fan(cx: number, cy: number, len: number, d: number): Pt[] {
  const pts: Pt[] = [[cx, cy]]
  for (let a = 60 * d - 30; a <= 60 * d + 30 + 1e-9; a += ARC_STEP_DEG) {
    const rad = (Math.PI / 180) * a
    pts.push([cx + len * Math.cos(rad), cy + len * Math.sin(rad)])
  }
  return pts
}

/** 1 つのセルのヒートマップ（扇 → 丸 → 輪）。r は描くセルの径、maxDir は全部の鍵の扇の最大回数 */
export function heatCellCommands(
  cx: number,
  cy: number,
  r: number,
  stat: HeatStat,
  maxDir: number,
): PolyCmd[] {
  const out: PolyCmd[] = []
  stat.dirs.forEach((c, d) => {
    if (!(c > 0) || HEX_DIRS[d] === undefined) return
    out.push({
      ...meta,
      tag: 'heatFan',
      kind: 'poly',
      pts: fan(cx, cy, fanLength(r, c, maxDir), d),
      fill: 'heatMiss',
      stroke: 'paper',
      width: 1,
      alpha: HEAT_FAN_ALPHA,
    })
  })
  if (stat.meanMs !== null) {
    const y = cy + HEAT_DROP * r
    out.push({
      ...meta,
      tag: 'heatDot',
      kind: 'poly',
      pts: circle(cx, y, HEAT_DOT * r),
      fill: stat.meanMs < 0 ? 'heatEarly' : 'heatLate',
      alpha: dotAlpha(stat.meanMs),
    })
    if (stat.sdMs !== null)
      out.push({
        ...meta,
        tag: 'heatRing',
        kind: 'poly',
        pts: circle(cx, y, ringRadius(r, stat.sdMs)),
        stroke: 'heatRing',
        width: 1.5,
      })
  }
  return out
}

/** 全部の鍵の扇の最大回数（扇の長さの分母） */
export function maxDirOf(stats: ReadonlyMap<KeyCode, HeatStat>): number {
  let m = 0
  for (const s of stats.values()) for (const c of s.dirs) if (c > m) m = c
  return m
}

/** 鍵盤図に重ねるヒートマップ（セルの順）。鍵盤図に無い鍵・空のキーは描かない */
export function heatCommands(
  grid: KeyboardGrid,
  stats: ReadonlyMap<KeyCode, HeatStat>,
  o: { readonly mode: LandingMode; readonly depth: boolean },
): PolyCmd[] {
  const max = maxDirOf(stats)
  const out: PolyCmd[] = []
  for (const c of grid.cells) {
    const s = stats.get(c.code)
    if (s === undefined || c.midi === null) continue
    out.push(
      ...heatCellCommands(c.cx, c.cy, drawRadius(grid, c, o.mode, CELL_SCALE, o.depth), s, max),
    )
  }
  return out
}
