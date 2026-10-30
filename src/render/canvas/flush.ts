// 描画コマンド列を Canvas 2D へ流す薄い関数（M0-03b、手順 6）。描画層で Canvas に触れるのはこのファイルだけ
// （decisions #27）。幾何は持たない: コマンドの座標をそのまま引き、色の名前をパレットで実色にし、region が変わるたびに
// その領域でクリップする。DPR は setTransform で掛ける（座標は CSS px）。文字は system-ui（Google Fonts は使わない）。
// ctx は CanvasRenderingContext2D の一部だけを型に取る（試験は記録用の偽物を渡す。jsdom は使わない）。

import type { DrawCommand, Paint, Pt, Region, Regions } from './primitives.ts'
import { edgeRuns } from './primitives.ts'

/** flush が使う Canvas 2D の部分 */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'setTransform'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'rect'
  | 'roundRect'
  | 'fill'
  | 'stroke'
  | 'clip'
  | 'fillRect'
  | 'fillText'
> & {
  fillStyle: CanvasRenderingContext2D['fillStyle']
  strokeStyle: CanvasRenderingContext2D['strokeStyle']
  lineWidth: number
  lineJoin: CanvasLineJoin
  lineCap: CanvasLineCap
  globalAlpha: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
}

/** 暗い背景のパレット（m1-geometry の gray 配色と GRADE_TXT。色相は判定だけ） */
export const DARK_PALETTE: Readonly<Record<Paint, string>> = {
  paper: '#0b0d12',
  lane: 'rgba(255,255,255,0.045)',
  seam: 'rgba(255,255,255,0.55)',
  landingLine: 'rgba(255,255,255,0.4)',
  cellEmpty: 'rgba(255,255,255,0.03)',
  cellEmptyEdge: 'rgba(255,255,255,0.09)',
  shade0: '#9a9a9a',
  shade1: '#bdbdbd',
  shade2: '#d9d9d9',
  shade3: '#f2f2f2',
  black: '#6f6f6f',
  pressedEdge: '#ffffff',
  noteEdge: 'rgba(255,255,255,0.85)',
  ink: '#f4f2ea',
  inkDim: 'rgba(255,255,255,0.2)',
  inkOnCell: '#0b0d12',
  hint: '#ffffff',
  hull: '#ffffff',
  flash: '#ffffff',
  'judge:perfect': '#ffd766',
  'judge:great': '#62d4a0',
  'judge:good': '#62a6f2',
  'judge:near': '#c08cf0',
  'judge:miss': '#f06a6a',
}

export const FONT_FAMILY = 'system-ui, sans-serif'

export type FlushOptions = {
  readonly regions: Regions
  /** canvas の CSS px の大きさ（背景を塗る範囲） */
  readonly width: number
  readonly height: number
  readonly dpr: number
  readonly palette?: Readonly<Record<Paint, string>>
}

function regionPath(ctx: Ctx2D, region: Region, rg: Regions): void {
  const f = rg.fall
  const k = rg.keys
  ctx.beginPath()
  if (region === 'fall') ctx.rect(f.x, f.y, f.w, f.h)
  else if (region === 'keys') ctx.rect(k.x, k.y, k.w, k.h)
  else {
    // T 字形: 落下域（全幅）の下に鍵盤図の矩形
    ctx.rect(f.x, f.y, f.w, f.h)
    ctx.rect(k.x, k.y, k.w, k.h)
  }
}

function polyline(ctx: Ctx2D, pts: readonly Pt[], close: boolean): void {
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  if (close) ctx.closePath()
}

/** コマンド列を流す。背景を paper で塗り、region ごとにクリップして順に描く */
export function flush(ctx: Ctx2D, commands: readonly DrawCommand[], o: FlushOptions): void {
  const pal = o.palette ?? DARK_PALETTE
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.paper
  ctx.fillRect(0, 0, o.width, o.height)
  ctx.lineJoin = 'round'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let current: Region | null = null
  for (const c of commands) {
    if (c.region !== current) {
      if (current !== null) ctx.restore()
      ctx.save()
      regionPath(ctx, c.region, o.regions)
      ctx.clip()
      current = c.region
    }
    ctx.globalAlpha = c.alpha ?? 1
    switch (c.kind) {
      case 'poly': {
        if (c.fill !== undefined) {
          ctx.beginPath()
          polyline(ctx, c.pts, true)
          ctx.fillStyle = pal[c.fill]
          ctx.fill()
        }
        if (c.stroke !== undefined) {
          ctx.strokeStyle = pal[c.stroke]
          ctx.lineWidth = c.width ?? 1
          ctx.lineCap = 'butt'
          ctx.beginPath()
          const runs = edgeRuns(c.pts, c.edges)
          if (runs === null) polyline(ctx, c.pts, true)
          else for (const r of runs) polyline(ctx, r, false)
          ctx.stroke()
        }
        break
      }
      case 'line':
        ctx.strokeStyle = pal[c.stroke]
        ctx.lineWidth = c.width
        ctx.lineCap = c.cap ?? 'butt'
        ctx.beginPath()
        polyline(ctx, c.pts, false)
        ctx.stroke()
        break
      case 'rect':
        ctx.beginPath()
        if (c.r !== undefined && c.r > 0) ctx.roundRect(c.x, c.y, c.w, c.h, c.r)
        else ctx.rect(c.x, c.y, c.w, c.h)
        if (c.fill !== undefined) {
          ctx.fillStyle = pal[c.fill]
          ctx.fill()
        }
        if (c.stroke !== undefined) {
          ctx.strokeStyle = pal[c.stroke]
          ctx.lineWidth = c.width ?? 1
          ctx.stroke()
        }
        break
      case 'text':
        ctx.fillStyle = pal[c.paint]
        ctx.font = `${c.weight} ${c.px}px ${FONT_FAMILY}`
        ctx.fillText(c.text, c.x, c.y)
        break
    }
  }
  if (current !== null) ctx.restore()
  ctx.globalAlpha = 1
}
