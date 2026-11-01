// 鍵盤図のセルと落ちるセル（M0-03b、手順 6）。出どころ: m1-geometry drawLabel L384–388・drawCell L390–403・
// drawNotes L406–427（手直し）、design.md §2.2（黒鍵 30°＋♯ 0.4·R、明度で区別）・§2.5 L129（キー文字 0.95·R 太字、
// 音名 0.62·R、R<26 で角の補助を消す）、decisions #30（段の記号・角の補助の中身、仮）。
// 純関数。描画コマンドを返すだけで Canvas に触れない。時刻は ms（song ＝ 譜面の時刻）。

import { qwertyLabel } from '../../layout/legend.ts'
import type { KeyCode } from '../../shared/types.ts'
import type { GridCell, KeyboardGrid } from '../hex/grid.ts'
import { SQ3, hexVertices, isBlackKey, rotationOf } from '../hex/hex.ts'
import type { LandingMode } from '../hex/landing.ts'
import { noteY, rowScale, targetY } from '../hex/landing.ts'
import type { Layer, Paint, PolyCmd, Pt, RectCmd, Region, TextCmd } from './primitives.ts'
import { bboxOf, clipPolyTop } from './primitives.ts'

/** 鍵盤図のセルの径（R に対する比。セルの間に溝を残す。m1' cellR L372） */
export const CELL_SCALE = 0.93
/** 落ちるセルの径（鍵盤図のセルに対する比。m1' drawNotes L408） */
export const NOTE_SCALE = 0.97
/** 角の補助（♯）を描く最小の R（§2.5 L129「R<26 で角の補助を消す」。decisions #30、仮） */
export const CORNER_AID_MIN_R = 26
/** 接近の光り（着地の何 ms 前から鍵盤図のセルを明るくするか。m1' APPROACH L264） */
export const APPROACH_MS = 700
/** ホールドの最短の音価（§2.3「音価 ≥500 ms」）。判定層の値をそのまま使う（手順 8） */
export { HOLD_MIN_MS } from '../../judge/hold.ts'
/** ホールドの尾の幅（セル幅に対する比）と角の丸み px（m1' drawNotes L409） */
export const TAIL_WIDTH = 0.4
export const TAIL_RADIUS = 6

/** ラベルの出し方（m1' labels。入門者の既定は both） */
export type LabelMode = 'key' | 'note' | 'both' | 'none'

/** 鍵盤図（kb）と落ちるセル（note）のラベル（hexnote.settings.labels と同じ形。decisions #60） */
export type FrameLabels = { readonly kb: LabelMode; readonly note: LabelMode }

/**
 * 足場外しのラベルの透明度（音高 → α。M2-04、design §2.7「足場外し」・m2-kickoff §7-13）。無ければ全て 1。α ＝ 1 は文字に
 * alpha を付けない（描画コマンドが M1 と同じ）、0.2 未満はキー文字・音名を描かない（鍵盤側も。#30 (d) の足場外しの例外）。
 * 黒鍵の ♯ と空のキーの文字は対象外
 */
export type LabelFade = (midi: number) => number

/** ラベルを消す線（judge/self-rate.ts の FADE_HIDE_BELOW と同じ値。描画層は判定層を引かない） */
export const LABEL_HIDE_BELOW = 0.2

/** 鍵の刻印（QWERTY。m1' KEYS の label）。表は src/layout/legend.ts（手順 9）。セルの文字は GridCell.label を使う */
export function keyLabel(code: KeyCode): string {
  return qwertyLabel(code)
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

/** 音名（C4 ＝ 60。m1' noteName L217） */
export function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12] ?? '?'}${Math.floor(midi / 12) - 1}`
}

/** セルの塗り。空のキーは cellEmpty、黒鍵は black、白鍵は段の明度 shade0〜3（m1' colorFor の gray） */
export function shadeOf(row: number, midi: number | null): Paint {
  if (midi === null) return 'cellEmpty'
  if (isBlackKey(midi)) return 'black'
  return row <= 0 ? 'shade0' : row === 1 ? 'shade1' : row === 2 ? 'shade2' : 'shade3'
}

/** 塗りの上の文字の色（黒鍵の上は明るく、白鍵の上は暗く。m1' textColorOn） */
export function inkOn(shade: Paint): Paint {
  return shade === 'black' ? 'ink' : 'inkOnCell'
}

/** セルの頂点（径 r、黒鍵は 30° 回す） */
export function cellVertices(cx: number, cy: number, r: number, midi: number | null): Pt[] {
  return hexVertices(cx, cy, r, rotationOf(midi))
}

type TextBase = { layer: Layer; region: Region; paint: Paint; alpha?: number }

function text(
  base: TextBase,
  tag: TextCmd['tag'],
  x: number,
  y: number,
  s: string,
  px: number,
  weight: 500 | 700,
): TextCmd {
  const t: TextCmd = {
    kind: 'text',
    layer: base.layer,
    region: base.region,
    tag,
    x,
    y,
    text: s,
    px,
    weight,
    paint: base.paint,
  }
  return base.alpha === undefined ? t : { ...t, alpha: base.alpha }
}

/**
 * セルの中の文字（m1' drawLabel L384–388 を手直し）。r は描く径。key: キー文字 0.95·r 太字、note: 音名 0.62·r、
 * both: キー文字を上に 0.24·r、音名を下に 0.52·r ずらす。角の補助（黒鍵の ♯ 0.4·r、右上の角）は gridR ≥ 26 のときだけ。
 * label はキー文字（GridCell.label。刻印、手順 9）。
 */
export function labelCommands(
  base: TextBase,
  x: number,
  y: number,
  r: number,
  label: string,
  midi: number | null,
  mode: LabelMode,
  gridR: number,
  fade?: LabelFade,
): TextCmd[] {
  const out: TextCmd[] = []
  const k = label
  // 足場外し（音のあるキーだけ）。α ＝ 1 は alpha の欄を付けない、0.2 未満はキー文字・音名を描かない
  const a = fade === undefined || midi === null ? 1 : fade(midi)
  const lb: TextBase = a >= 1 ? base : { ...base, alpha: a }
  if (a < LABEL_HIDE_BELOW) {
    // 描かない（♯ は下で描く）
  } else if (mode === 'key' || (mode !== 'none' && midi === null)) {
    out.push(text(lb, 'label', x, y + 0.04 * r, k, 0.95 * r, 700))
  } else if (mode === 'note' && midi !== null) {
    out.push(text(lb, 'noteName', x, y + 0.04 * r, noteName(midi), 0.62 * r, 700))
  } else if (mode === 'both' && midi !== null) {
    out.push(text(lb, 'label', x, y - 0.24 * r, k, 0.95 * r, 700))
    out.push(text(lb, 'noteName', x, y + 0.52 * r, noteName(midi), 0.62 * r, 500))
  }
  if (midi !== null && isBlackKey(midi) && gridR >= CORNER_AID_MIN_R)
    out.push(text(base, 'sharp', x + 0.55 * r, y - 0.5 * r, '♯', 0.4 * r, 700))
  return out
}

/** 描く径（R × 比 × 奥行き。depth false は奥行きを付けない＝低負荷の段 3） */
export function drawRadius(
  grid: KeyboardGrid,
  cell: GridCell,
  mode: LandingMode,
  scale: number,
  depth: boolean,
): number {
  const r = grid.R * scale * (depth ? rowScale(mode, cell, grid.R) : 1)
  if (rotationOf(cell.midi) === 0) return r
  // 30° 回したセルは頂点が真横の ±r に来る。鍵盤図の左右の端の列では、最も太い縁の半分を含めて
  // 矩形の横の半幅 √3/2·R に収める（wicki の端の黒鍵。decisions #30(e)、仮）
  const [minGx, maxGx] = gxRange(grid)
  if (cell.gx !== minGx && cell.gx !== maxGx) return r
  return Math.min(r, (SQ3 / 2) * grid.R - EDGE_STROKE_HALF)
}

/** 鍵盤図の左右の端の列で、回したセルの頂点と矩形の端の間に残す幅（最も太い縁＝ホールド中の落ちるセル 3 px の半分） */
export const EDGE_STROKE_HALF = 1.5

const GX_RANGE = new WeakMap<KeyboardGrid, readonly [number, number]>()

/** 鍵盤図の gx の最小と最大（端の列） */
function gxRange(grid: KeyboardGrid): readonly [number, number] {
  const hit = GX_RANGE.get(grid)
  if (hit) return hit
  const gxs = grid.cells.map((c) => c.gx)
  const range = [Math.min(...gxs), Math.max(...gxs)] as const
  GX_RANGE.set(grid, range)
  return range
}

export type KeyboardOptions = {
  readonly mode: LandingMode
  readonly pressed: ReadonlySet<KeyCode>
  /** 鍵ごとの接近の光り（0〜1）。approachGlow で作る */
  readonly glow: ReadonlyMap<KeyCode, number>
  readonly labels: LabelMode
  readonly depth: boolean
  /** 足場外し（無ければ全て 1） */
  readonly fade?: LabelFade
}

/**
 * 鍵盤図のセル（段の順・列の順）。空のキーは薄い塗りと縁、音のあるキーは段の明度の塗り（押下中は不透明）と縁を
 * 別のコマンドで出す（塗りと縁の不透明度が違うため）。文字は全セルの後に出す（polys の後に texts を並べる）。
 */
export function keyboardCommands(
  grid: KeyboardGrid,
  o: KeyboardOptions,
): { polys: PolyCmd[]; texts: TextCmd[] } {
  const polys: PolyCmd[] = []
  const texts: TextCmd[] = []
  const meta = { layer: 'keys', region: 'keys', tag: 'cell' } as const
  for (const c of grid.cells) {
    const r = drawRadius(grid, c, o.mode, CELL_SCALE, o.depth)
    const pts = cellVertices(c.cx, c.cy, r, c.midi)
    if (c.midi === null) {
      polys.push({
        ...meta,
        kind: 'poly',
        pts,
        fill: 'cellEmpty',
        stroke: 'cellEmptyEdge',
        width: 1,
      })
      texts.push(
        ...labelCommands(
          { layer: 'keys', region: 'keys', paint: 'inkDim' },
          c.cx,
          c.cy,
          r,
          c.label,
          null,
          'key',
          grid.R,
        ),
      )
      continue
    }
    const shade = shadeOf(c.row, c.midi)
    const pressed = o.pressed.has(c.code)
    const g = pressed ? 0 : (o.glow.get(c.code) ?? 0)
    polys.push({ ...meta, kind: 'poly', pts, fill: shade, alpha: pressed ? 1 : 0.16 + 0.5 * g })
    polys.push(
      pressed
        ? { ...meta, kind: 'poly', pts, stroke: 'pressedEdge', width: 2.5 }
        : { ...meta, kind: 'poly', pts, stroke: shade, width: 1.5, alpha: 0.55 + 0.45 * g },
    )
    // 鍵盤図ではキー文字を消さない（m1' drawCell L401: none → key、note → both。decisions #30(d)）
    const mode = o.labels === 'none' ? 'key' : o.labels === 'note' ? 'both' : o.labels
    const paint: Paint = pressed ? inkOn(shade) : 'ink'
    texts.push(
      ...labelCommands(
        { layer: 'keys', region: 'keys', paint },
        c.cx,
        c.cy,
        r,
        c.label,
        c.midi,
        mode,
        grid.R,
        o.fade,
      ),
    )
  }
  return { polys, texts }
}

// ---------- 落ちるセル ----------

/** 描画層が受け取るノート（譜面版の keys が null の音は入れない） */
export type FrameNote = {
  /** notes の添字 */
  readonly index: number
  readonly code: KeyCode
  /** 鍵の MIDI（畳んだ後。明度・音名・黒鍵の判定に使う） */
  readonly midi: number
  readonly tLandMs: number
  readonly tEndMs: number
  readonly hold: boolean
  /** 和音の印（同じ拍の tick。round(beat·resolution)） */
  readonly group: number
  /** pending ＝ 未判定、holding ＝ ホールド中、done ＝ 判定済み・取り逃し（描かない） */
  readonly state: 'pending' | 'holding' | 'done'
}

/** 落ちるセルの位置と形（和音の殻・塊が使う） */
export type NotePlace = {
  readonly note: FrameNote
  readonly cell: GridCell
  readonly x: number
  readonly y: number
  /** 着地の y（段別なら段の中心、一本線なら線） */
  readonly landY: number
  readonly r: number
  readonly rot: 0 | 30
  readonly pts: Pt[]
}

/**
 * 落ちるセルの置き場。pending は y ＝ min(着地 y − v·(着地 − 今), 着地 y)（着地を過ぎたら判定まで着地に留める）、
 * holding は着地に留める。中心＋径が箱の上端より上（見えない）なら null。
 */
export function placeNote(
  n: FrameNote,
  grid: KeyboardGrid,
  mode: LandingMode,
  v: number,
  tSong: number,
  fallTop: number,
  depth: boolean,
): NotePlace | null {
  if (n.state === 'done') return null
  const cell = grid.byCode.get(n.code)
  if (cell === undefined) return null
  const landY = targetY(mode, cell, grid)
  const y = n.state === 'holding' ? landY : Math.min(noteY(landY, n.tLandMs, tSong, v), landY)
  const r = drawRadius(grid, cell, mode, CELL_SCALE * NOTE_SCALE, depth)
  if (y + r <= fallTop) return null
  const rot = rotationOf(n.midi)
  return { note: n, cell, x: cell.cx, y, landY, r, rot, pts: hexVertices(cell.cx, y, r, rot) }
}

/** 落ちるセルを描く順（着地の遅い順 → 段の順 → 列の順。早い音が上に重なる） */
export function compareDrawOrder(a: NotePlace, b: NotePlace): number {
  return (
    b.note.tLandMs - a.note.tLandMs ||
    a.cell.row - b.cell.row ||
    a.cell.col - b.cell.col ||
    a.note.index - b.note.index
  )
}

/** ホールドの尾（カプセル）。上端は fallTop で切る。セルの中心より上に伸びる部分だけ（m1' drawNotes L409） */
export function tailCommand(
  p: NotePlace,
  grid: KeyboardGrid,
  v: number,
  tSong: number,
  fallTop: number,
): RectCmd | null {
  if (!p.note.hold) return null
  const top = Math.max(fallTop, p.landY - v * (p.note.tEndMs - tSong))
  if (!(p.y > top)) return null
  const w = TAIL_WIDTH * grid.hexW
  return {
    kind: 'rect',
    layer: 'notes',
    region: 'stage',
    tag: 'tail',
    x: p.x - w / 2,
    y: top,
    w,
    h: p.y - top,
    r: Math.min(TAIL_RADIUS, w / 2, (p.y - top) / 2),
    fill: shadeOf(p.cell.row, p.note.midi),
    alpha: 0.4,
  }
}

/**
 * 落ちるセルの多角形（塗り＋縁）。edges は和音の塊で消す共有辺（chords.ts）。箱の上端で切る。
 * holding は縁を白く太く（m1' L418）。
 */
export function noteCommand(
  p: NotePlace,
  fallTop: number,
  edges?: readonly boolean[],
): PolyCmd | null {
  const holding = p.note.state === 'holding'
  const width = holding ? 3 : 1.5
  // 線が上端を越えないよう、切り口を線の幅の半分だけ下に置く（塗りも同じ所で切れる）
  const clipped = clipPolyTop(p.pts, fallTop + width / 2, edges)
  if (clipped.pts.length < 3) return null
  const cmd: PolyCmd = {
    kind: 'poly',
    layer: 'notes',
    region: 'stage',
    tag: 'note',
    pts: clipped.pts,
    fill: shadeOf(p.cell.row, p.note.midi),
    stroke: holding ? 'pressedEdge' : 'noteEdge',
    width,
  }
  return clipped.edges !== undefined && clipped.edges.some((e) => !e)
    ? { ...cmd, edges: clipped.edges }
    : cmd
}

/** 落ちるセルの文字（箱の上端にかかる文字は出さない） */
export function noteLabelCommands(
  p: NotePlace,
  mode: LabelMode,
  gridR: number,
  fallTop: number,
  fade?: LabelFade,
): TextCmd[] {
  if (mode === 'none') return []
  const base = {
    layer: 'notes',
    region: 'stage',
    paint: inkOn(shadeOf(p.cell.row, p.note.midi)),
  } as const
  return labelCommands(base, p.x, p.y, p.r, p.cell.label, p.note.midi, mode, gridR, fade).filter(
    (t) => bboxOf(t).y0 >= fallTop,
  )
}

/** 鍵ごとの接近の光り: 着地まで 0〜700 ms の pending の音のうち最も近い物で 1 − (着地 − 今)/700 */
export function approachGlow(notes: readonly FrameNote[], tSong: number): Map<KeyCode, number> {
  const glow = new Map<KeyCode, number>()
  for (const n of notes) {
    if (n.state !== 'pending') continue
    const dt = n.tLandMs - tSong
    if (dt < 0 || dt > APPROACH_MS) continue
    const g = 1 - dt / APPROACH_MS
    if (g > (glow.get(n.code) ?? 0)) glow.set(n.code, g)
  }
  return glow
}
