// 1 フレームの描画コマンド列を返す純関数（M0-03b、手順 6）。出どころ: design.md §4.1（描画層: 領域と予算を層で強制、
// 低負荷の段階）、相談 B の描く順、decisions #27（コマンドの型・描く順・領域、仮）、m1-geometry draw L446–451（背景の
// 縦線・一本線）。Canvas へ流すのは flush.ts だけ。時刻は引数 t（song ＝ 譜面の ms、real ＝ 実時間 ms）で受ける。
//
// 描く順: bg（縦線 → 継ぎ目 → 一本線）→ keys（セル → 文字）→ hints（線 → 数字）→ notes（尾 → 殻 → セル → 文字。
// 各段の中は着地の遅い順 → 段 → 列）→ fx（滑り → 縁の返し → 閃光 → 判定文字）。

import { buildMsTable } from '../../chart/mstable.ts'
import { midiOf } from '../../layout/presets.ts'
import type { Chart, KeyCode, Variant } from '../../shared/types.ts'
import type { KeyboardGrid } from '../hex/grid.ts'
import type { HexPos, Pt } from '../hex/hex.ts'
import type { LandingMode } from '../hex/landing.ts'
import { lineY } from '../hex/landing.ts'
import type { Sizing } from '../hex/sizing.ts'
import type { FrameNote, LabelMode, NotePlace } from './cells.ts'
import {
  HOLD_MIN_MS,
  approachGlow,
  compareDrawOrder,
  keyboardCommands,
  noteCommand,
  noteLabelCommands,
  placeNote,
  tailCommand,
} from './cells.ts'
import { chordShapes } from './chords.ts'
import type { FxIntent } from './feedback.ts'
import { feedbackCommands } from './feedback.ts'
import { hintCommands, hintPairs, hintTargets } from './hints.ts'
import type { LowLoadLevel } from './lowload.ts'
import { lowLoadEffects } from './lowload.ts'
import type { DrawCommand, LineCmd, Rect, Regions } from './primitives.ts'
import { regionsOf } from './primitives.ts'

/** 継ぎ目の二重線（VMPK 型の Q 段と A 段の間）: 線 1 本の幅と、境の折れ線からのずれ px（§2.2「2 px の二重線」、仮） */
export const SEAM_WIDTH = 1
export const SEAM_OFFSET = 1
/** 一本線の幅と左右のはみ出し px（m1' L447） */
export const LANDING_LINE_WIDTH = 2
export const LANDING_LINE_OVERHANG = 6

/**
 * 譜面版から描画層のノートを作る。keys が null の音は入れない。鍵の MIDI は配列の表から（畳んだ後の音）。
 * 時刻は ms 表、和音の印は 1/resolution の tick。全部 pending で始まる。
 */
export function frameNotes(chart: Pick<Chart, 'notes' | 'pulse'>, variant: Variant): FrameNote[] {
  const ms = buildMsTable(chart.pulse)
  const out: FrameNote[] = []
  chart.notes.forEach((n, index) => {
    const code = variant.keys[index]
    if (code === null || code === undefined) return
    const midi = midiOf(variant.layout, code)
    if (midi === null) return
    const tLandMs = ms.beatToMs(n.beat)
    const tEndMs = ms.beatToMs(n.beat + n.dur)
    out.push({
      index,
      code,
      midi,
      tLandMs,
      tEndMs,
      hold: tEndMs - tLandMs >= HOLD_MIN_MS,
      group: Math.round(n.beat * ms.resolution),
      state: 'pending',
    })
  })
  return out
}

export type FrameInput = {
  /** 箱の座標で作った sizing（canvas が箱を覆うなら box.left・top は 0） */
  readonly sizing: Sizing
  /** sizing の R と kbLeft・kbTop で組んだ鍵盤図 */
  readonly grid: KeyboardGrid
  readonly mode: LandingMode
  readonly notes: readonly FrameNote[]
  readonly t: { readonly song: number; readonly real: number }
  readonly pressed: ReadonlySet<KeyCode>
  readonly effects: readonly FxIntent[]
  readonly labels: LabelMode
  /** 辺ヒント（入門者だけ） */
  readonly hints: boolean
  readonly level: LowLoadLevel
}

/** 背景の縦線（音のある鍵の上。同じ x は 1 本。落下域の中だけ。m1' L446） */
function laneCommands(grid: KeyboardGrid, mode: LandingMode, fallTop: number): LineCmd[] {
  const end = mode === 'cell' ? grid.top : lineY(grid) - grid.R
  if (!(end > fallTop)) return []
  const xs = [
    ...new Set(grid.cells.filter((c) => c.midi !== null).map((c) => Math.round(c.cx * 100) / 100)),
  ]
  return xs
    .sort((a, b) => a - b)
    .map((x) => ({
      kind: 'line',
      layer: 'bg',
      region: 'fall',
      tag: 'lane',
      pts: [
        [x, fallTop],
        [x, end],
      ],
      stroke: 'lane',
      width: 1,
    }))
}

/**
 * 継ぎ目（VMPK 型の Q 段と A 段の間の 2 本線、§2.2）。A 段のセル（全径 R）の左上・上・右上の頂点を左から結ぶ折れ線を、
 * 上下に SEAM_OFFSET ずらして 2 本引く。Q 段と A 段の両方を使う 4 段の配列だけ。
 */
export function seamCommands(grid: KeyboardGrid): LineCmd[] {
  if (!(grid.rowsUsed.includes(1) && grid.rowsUsed.includes(2) && grid.rowsUsed.length === 4))
    return []
  const aRow = grid.cells.filter((c) => c.row === 2).sort((a, b) => a.col - b.col)
  const h = (Math.sqrt(3) / 2) * grid.R
  const pts: Pt[] = []
  for (const c of aRow) {
    if (pts.length === 0) pts.push([c.cx - h, c.cy - grid.R / 2])
    pts.push([c.cx, c.cy - grid.R])
    pts.push([c.cx + h, c.cy - grid.R / 2])
  }
  return [-SEAM_OFFSET, SEAM_OFFSET].map((dy) => ({
    kind: 'line',
    layer: 'bg',
    region: 'keys',
    tag: 'seam',
    pts: pts.map(([x, y]) => [x, y + dy] as Pt),
    stroke: 'seam',
    width: SEAM_WIDTH,
  }))
}

/** 一本線（line のときだけ。m1' L447）。左右のはみ出しは落下域（箱の幅）の中まで */
function landingLineCommands(grid: KeyboardGrid, mode: LandingMode, fall: Rect): LineCmd[] {
  if (mode !== 'line') return []
  const y = lineY(grid)
  const x0 = Math.max(fall.x, grid.left - LANDING_LINE_OVERHANG)
  const x1 = Math.min(fall.x + fall.w, grid.left + grid.width + LANDING_LINE_OVERHANG)
  return [
    {
      kind: 'line',
      layer: 'bg',
      region: 'fall',
      tag: 'landingLine',
      pts: [
        [x0, y],
        [x1, y],
      ],
      stroke: 'landingLine',
      width: LANDING_LINE_WIDTH,
    },
  ]
}

/** 鍵盤図の段・列 → code（塊の共有辺を引く） */
function codeAt(grid: KeyboardGrid): (q: HexPos) => KeyCode | null {
  const m = new Map(grid.cells.map((c) => [`${c.row},${c.col}`, c.code]))
  return (q) => m.get(`${q.row},${q.col}`) ?? null
}

/** 1 フレームのコマンド列 */
export function buildFrame(input: FrameInput): DrawCommand[] {
  const { sizing: s, grid, mode, t } = input
  const fx = lowLoadEffects(input.level)
  const regions: Regions = regionsOf(s)
  const fallTop = s.fallTop

  const bg = [
    ...laneCommands(grid, mode, fallTop),
    ...seamCommands(grid),
    ...landingLineCommands(grid, mode, regions.fall),
  ]

  const kb = keyboardCommands(grid, {
    mode,
    pressed: input.pressed,
    glow: approachGlow(input.notes, t.song),
    labels: input.labels,
    depth: fx.depth,
  })

  const targets = input.hints ? hintTargets(input.notes, t.song) : null
  const hint = targets
    ? hintCommands(hintPairs(targets, grid), grid, mode, fx.depth, regions.keys)
    : { lines: [], digits: [] }

  const places: NotePlace[] = []
  for (const n of input.notes) {
    const p = placeNote(n, grid, mode, s.v, t.song, fallTop, fx.depth)
    if (p) places.push(p)
  }
  places.sort(compareDrawOrder)
  const chords = chordShapes(places, codeAt(grid), fallTop, fx.shells)
  const tails = places.flatMap((p) => tailCommand(p, grid, s.v, t.song, fallTop) ?? [])
  const cells = places.flatMap((p) => noteCommand(p, fallTop, chords.edges.get(p.note.index)) ?? [])
  const texts = places.flatMap((p) => noteLabelCommands(p, input.labels, grid.R, fallTop))

  const effects = feedbackCommands(input.effects, {
    grid,
    mode,
    depth: fx.depth,
    flashes: fx.flashes,
    regions,
    realMs: t.real,
  })

  return [
    ...bg,
    ...kb.polys,
    ...kb.texts,
    ...hint.lines,
    ...hint.digits,
    ...tails,
    ...chords.hulls,
    ...cells,
    ...texts,
    ...effects,
  ]
}
