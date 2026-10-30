// 描画コマンドの型と、コマンドだけで閉じる計算（M0-03b、手順 6）。出どころ: 相談 B の案 C
// （docs/planning/consult/B-render-commands.md）、decisions #27（仮）。
// コマンドは図形のプリミティブ（poly・line・rect・text）に 3 つの印を付けた物: layer（描く順）、region（許される領域。
// flush はここでクリップする）、tag（意味。試験はこれで数える）。色は名前（Paint）で持ち、実色は flush のパレット。
// 座標は CSS px で、右列の箱（canvas）の左上が原点。DPR は flush の setTransform が掛ける。DOM・Canvas に触れない。

import type { Judgment } from '../../shared/types.ts'
import type { Pt } from '../hex/hex.ts'
import type { Sizing } from '../hex/sizing.ts'

export type { Pt }

/** 描く順（この順に重ねる） */
export type Layer = 'bg' | 'keys' | 'hints' | 'notes' | 'fx'
export const LAYERS: readonly Layer[] = ['bg', 'keys', 'hints', 'notes', 'fx']

/** 許される領域。fall ＝ 落下域（箱の上端〜鍵盤図の上端、箱の全幅）、keys ＝ 鍵盤図の矩形、stage ＝ fall ∪ keys */
export type Region = 'fall' | 'keys' | 'stage'

/** 意味の印 */
export type Tag =
  | 'lane'
  | 'seam'
  | 'landingLine'
  | 'cell'
  | 'label'
  | 'noteName'
  | 'sharp'
  | 'hint'
  | 'hintDigit'
  | 'note'
  | 'tail'
  | 'hull'
  | 'slide'
  | 'edgeReturn'
  | 'flash'
  | 'judgeText'

/**
 * 色の名前。shade0〜3 は白鍵のセル（KEY_ROWS の段ごとの明度。数字段が暗く Z 段が明るい）、black は黒鍵のセル。
 * 色相に頼らない（decisions 既定値「段の記号・明度」、#30）。判定の色だけは判定文字と縁の返しに使う。
 */
export type Paint =
  | 'paper'
  | 'lane'
  | 'seam'
  | 'landingLine'
  | 'cellEmpty'
  | 'cellEmptyEdge'
  | 'shade0'
  | 'shade1'
  | 'shade2'
  | 'shade3'
  | 'black'
  | 'pressedEdge'
  | 'noteEdge'
  | 'ink'
  | 'inkDim'
  | 'inkOnCell'
  | 'hint'
  | 'hull'
  | 'flash'
  | `judge:${Judgment}`

type Meta = {
  readonly layer: Layer
  readonly region: Region
  readonly tag: Tag
  /** 不透明度（0〜1、コマンド全体に掛かる）。無ければ 1 */
  readonly alpha?: number
}

/**
 * 閉じた多角形。edges[i] は頂点 i → i+1 の辺を線で描くか（無ければ全部描く）。塗りは edges に関係なく全体。
 * 線の継ぎ目は丸（flush の lineJoin round）なので、線の外側への張り出しは width/2 を超えない。
 */
export type PolyCmd = Meta & {
  readonly kind: 'poly'
  readonly pts: readonly Pt[]
  readonly fill?: Paint
  readonly stroke?: Paint
  readonly width?: number
  readonly edges?: readonly boolean[]
}

/** 折れ線（閉じない） */
export type LineCmd = Meta & {
  readonly kind: 'line'
  readonly pts: readonly Pt[]
  readonly stroke: Paint
  readonly width: number
  readonly cap?: 'butt' | 'round'
}

/** 矩形（r は角の丸み） */
export type RectCmd = Meta & {
  readonly kind: 'rect'
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly r?: number
  readonly fill?: Paint
  readonly stroke?: Paint
  readonly width?: number
}

/** 文字（(x, y) が中心。textAlign center・textBaseline middle） */
export type TextCmd = Meta & {
  readonly kind: 'text'
  readonly x: number
  readonly y: number
  readonly text: string
  readonly px: number
  readonly weight: 500 | 700
  readonly paint: Paint
}

export type DrawCommand = PolyCmd | LineCmd | RectCmd | TextCmd

// ---------- 領域 ----------

export type Rect = {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export type Regions = {
  readonly fall: Rect
  readonly keys: Rect
  /** fall と keys の面積の和（閃光の面積の上限 25% の分母） */
  readonly stageArea: number
}

/** sizing から領域を出す（箱の座標のまま。canvas が箱を覆うなら box.left・top は 0） */
export function regionsOf(s: Sizing): Regions {
  const fall = { x: s.box.left, y: s.fallTop, w: s.box.width, h: s.kbTop - s.fallTop }
  const keys = { x: s.kbLeft, y: s.kbTop, w: s.kbW, h: s.kbH }
  return { fall, keys, stageArea: fall.w * fall.h + keys.w * keys.h }
}

export type BBox = {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

const EPS = 1e-6

function within(b: BBox, r: Rect): boolean {
  return (
    b.x0 >= r.x - EPS && b.y0 >= r.y - EPS && b.x1 <= r.x + r.w + EPS && b.y1 <= r.y + r.h + EPS
  )
}

/**
 * 外接矩形が領域に収まるか（y は下向き）。stage は flush のクリップと同じ T 字形（fall の矩形の下に keys の矩形）で、
 * 外接矩形の y0 ≥ fall の上端、y1 ≤ 鍵盤図の下端、鍵盤図の上端より上にかかるなら x が fall の幅の中、
 * 下にかかるなら x が鍵盤図の幅の中。
 */
export function inRegion(b: BBox, region: Region, rg: Regions): boolean {
  if (region === 'fall') return within(b, rg.fall)
  if (region === 'keys') return within(b, rg.keys)
  const f = rg.fall
  const k = rg.keys
  if (b.y0 < f.y - EPS || b.y1 > k.y + k.h + EPS) return false
  const inX = (r: Rect): boolean => b.x0 >= r.x - EPS && b.x1 <= r.x + r.w + EPS
  if (b.y0 < k.y - EPS && !inX(f)) return false
  if (b.y1 > k.y + EPS && !inX(k)) return false
  return true
}

// ---------- 外接矩形・面積 ----------

/** 文字の幅の見積もり（em 単位。ASCII 0.62、それ以外 1.0。領域の検査用で、実際の字形の幅ではない） */
export function textWidthEm(text: string): number {
  let w = 0
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) < 0x80 ? 0.62 : 1
  return w
}

function ptsBox(pts: readonly Pt[], pad: number): BBox {
  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
}

/**
 * 折れ線の外接矩形。継ぎ目は丸（中の頂点は半径 w/2 の円）、端は butt なら線分の向きに直角にだけ w/2 張り出し、
 * round なら半径 w/2 の円。
 */
function lineBox(pts: readonly Pt[], w: number, cap: 'butt' | 'round'): BBox {
  const h = w / 2
  if (cap === 'round' || pts.length < 2) return ptsBox(pts, h)
  const ext: Pt[] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as Pt
    const b = pts[i + 1] as Pt
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const nx = (-(b[1] - a[1]) / len) * h
    const ny = ((b[0] - a[0]) / len) * h
    ext.push(
      [a[0] + nx, a[1] + ny],
      [a[0] - nx, a[1] - ny],
      [b[0] + nx, b[1] + ny],
      [b[0] - nx, b[1] - ny],
    )
  }
  const box = ptsBox(ext, 0)
  return pts.length <= 2 ? box : union(box, ptsBox(pts.slice(1, -1), h))
}

function union(a: BBox, b: BBox): BBox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}

/**
 * 一部の辺だけを描く多角形の、続いた辺の並び（折れ線）。edges が無いか全部 true なら null（閉じた線で描く）。
 * flush はこの並びを 1 本ずつ butt の端で描き、bboxOf も同じ並びで外接矩形を出す。
 */
export function edgeRuns(pts: readonly Pt[], edges: readonly boolean[] | undefined): Pt[][] | null {
  const n = pts.length
  if (edges === undefined || edges.every((e) => e)) return null
  const start = edges.findIndex((e, i) => e && !edges[(i - 1 + n) % n])
  if (start < 0) return []
  const runs: Pt[][] = []
  let run: Pt[] = []
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    if (edges[i]) {
      if (run.length === 0) run.push(pts[i] as Pt)
      run.push(pts[(i + 1) % n] as Pt)
    } else if (run.length > 0) {
      runs.push(run)
      run = []
    }
  }
  if (run.length > 0) runs.push(run)
  return runs
}

/** コマンドの外接矩形（線の幅の半分を含む。文字は textWidthEm の見積もり） */
export function bboxOf(c: DrawCommand): BBox {
  switch (c.kind) {
    case 'poly': {
      if (c.stroke === undefined) return ptsBox(c.pts, 0)
      const w = c.width ?? 1
      const runs = edgeRuns(c.pts, c.edges)
      if (runs === null) return ptsBox(c.pts, w / 2)
      let b: BBox | null = c.fill !== undefined ? ptsBox(c.pts, 0) : null
      for (const r of runs) b = b === null ? lineBox(r, w, 'butt') : union(b, lineBox(r, w, 'butt'))
      return b ?? ptsBox(c.pts, 0)
    }
    case 'line':
      return lineBox(c.pts, c.width, c.cap ?? 'butt')
    case 'rect': {
      const pad = c.stroke !== undefined ? (c.width ?? 1) / 2 : 0
      return { x0: c.x - pad, y0: c.y - pad, x1: c.x + c.w + pad, y1: c.y + c.h + pad }
    }
    case 'text': {
      const hw = (c.px * textWidthEm(c.text)) / 2
      return { x0: c.x - hw, y0: c.y - c.px / 2, x1: c.x + hw, y1: c.y + c.px / 2 }
    }
  }
}

/** 多角形の面積（靴紐公式の絶対値） */
export function polyArea(pts: readonly Pt[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (a === undefined || b === undefined) continue
    s += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(s) / 2
}

// ---------- 上端での切り取り ----------

/**
 * 多角形を y ≥ yTop の側へ切る（Sutherland–Hodgman を 1 本の水平線で）。切り口の辺は edges を false にする
 * （塗りは上端で切れ、線は切り口に引かない）。全部が上端より下なら入力のまま返す。全部が上なら pts は空。
 */
export function clipPolyTop(
  pts: readonly Pt[],
  yTop: number,
  edges?: readonly boolean[],
): { pts: Pt[]; edges: boolean[] | undefined } {
  if (pts.every(([, y]) => y >= yTop))
    return { pts: [...pts], edges: edges ? [...edges] : undefined }
  const out: { p: Pt; inFlag: boolean }[] = []
  for (let i = 0; i < pts.length; i++) {
    const s = pts[i]
    const e = pts[(i + 1) % pts.length]
    if (s === undefined || e === undefined) continue
    const f = edges?.[i] ?? true
    const sIn = s[1] >= yTop
    const eIn = e[1] >= yTop
    if (sIn && eIn) out.push({ p: e, inFlag: f })
    else if (sIn !== eIn) {
      const k = (yTop - s[1]) / (e[1] - s[1])
      const ip: Pt = [s[0] + (e[0] - s[0]) * k, yTop]
      if (sIn) out.push({ p: ip, inFlag: f })
      else {
        out.push({ p: ip, inFlag: false })
        out.push({ p: e, inFlag: f })
      }
    }
  }
  const n = out.length
  return {
    pts: out.map((o) => o.p),
    edges: out.map((_, k) => out[(k + 1) % n]?.inFlag ?? true),
  }
}

// ---------- スナップショット ----------

/** 0.01 px に丸める（−0 は 0） */
export function round2(x: number): number {
  const r = Math.round(x * 100) / 100
  return Object.is(r, -0) ? 0 : r
}

const KEY_ORDER: Readonly<Record<DrawCommand['kind'], readonly string[]>> = {
  poly: ['pts', 'fill', 'stroke', 'width', 'edges'],
  line: ['pts', 'stroke', 'width', 'cap'],
  rect: ['x', 'y', 'w', 'h', 'r', 'fill', 'stroke', 'width'],
  text: ['x', 'y', 'text', 'px', 'weight', 'paint'],
}

function canonValue(v: unknown): unknown {
  if (typeof v === 'number') return round2(v)
  if (Array.isArray(v)) return v.map(canonValue)
  return v
}

/** 1 コマンドを、キー順を固定し数値を 0.01 px に丸めた JSON 1 行にする */
export function canonicalCommand(c: DrawCommand): string {
  const o: Record<string, unknown> = { kind: c.kind, layer: c.layer, region: c.region, tag: c.tag }
  if (c.alpha !== undefined) o['alpha'] = round2(c.alpha)
  const rec = c as unknown as Record<string, unknown>
  for (const k of KEY_ORDER[c.kind]) if (rec[k] !== undefined) o[k] = canonValue(rec[k])
  return JSON.stringify(o)
}

/** フレームのスナップショット（JSON の配列で、1 行に 1 コマンド） */
export function canonicalFrame(commands: readonly DrawCommand[]): string {
  return `[\n${commands.map(canonicalCommand).join(',\n')}\n]\n`
}
