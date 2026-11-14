// ヒートマップの開発ページ（M4-04、M4 の手順 1）。決まった見本の事象を heatAdd で貯め、heatCommands と同じ物（heatCellCommands と
// maxDirOf）をセルごとに作って鍵盤図の polys と texts の間に挟んで描く（セルの外へ出た図形を数えるため）。R 24・26・28 と 3 視口の R（sizeForViewport）で並べ、U-05 の「24〜28 px で読めるか」の確かめに
// 使う（design L288、docs/planning/m4-kickoff.md 手順 1・§5）。製品画面ではない（導線は開発時だけ、src/main.ts）。
// 見本の狙いの鍵は配列ごとに白鍵 4 つ・黒鍵 2 つを左から選ぶ（黒鍵は 30° 回したセルで扇と輪が収まるかを見る）。

import type { JudgeOutcome } from '../../judge/judge.ts'
import {
  CELL_SCALE,
  cellVertices,
  drawRadius,
  keyboardCommands,
} from '../../render/canvas/cells.ts'
import { flush, type Ctx2D } from '../../render/canvas/flush.ts'
import { heatCellCommands, maxDirOf } from '../../render/canvas/heat.ts'
import type { DrawCommand, PolyCmd, Pt } from '../../render/canvas/primitives.ts'
import { buildKeyboardGrid, type KeyboardGrid } from '../../render/hex/grid.ts'
import { HEX_DIRS, hexNeighbor, isBlackKey } from '../../render/hex/hex.ts'
import { sizeForViewport, TRAVEL_MS } from '../../render/hex/sizing.ts'
import { KEY_ROWS, LAYOUTS } from '../../layout/presets.ts'
import {
  EMPTY_HEAT,
  heatAddAll,
  heatStats,
  heatSummary,
  type HeatInput,
} from '../../results/heat.ts'
import { LAYOUT_IDS, type KeyCode, type LayoutId } from '../../shared/types.ts'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (el === null) throw new Error(`#${id} が無い`)
  return el as T
}

const VIEWPORTS: readonly { w: number; h: number }[] = [
  { w: 1366, h: 668 },
  { w: 1280, h: 620 },
  { w: 1093, h: 514 },
]
const PAD = 10

/** 狙いの鍵の向き d の隣の鍵（40 個の中に無ければ null） */
function neighborCode(grid: KeyboardGrid, code: KeyCode, d: number): KeyCode | null {
  const c = grid.byCode.get(code)
  const dir = HEX_DIRS[d]
  if (c === undefined || dir === undefined) return null
  const p = hexNeighbor({ row: c.row, col: c.col }, dir)
  return KEY_ROWS[p.row]?.[p.col] ?? null
}

const hit = (noteCode: KeyCode, code: KeyCode, grade: 'perfect' | 'great' | 'good' | 'near', dtMs: number): JudgeOutcome => ({
  kind: 'hit', index: 0, grade, dtMs, code, noteCode, self: 'solo',
}) // prettier-ignore

/**
 * 見本の事象。音のある白鍵を左から w0, w1, …、黒鍵を b0, b1 として（重ならないよう白鍵は 1 つおき）:
 * w1 遅い（＋40 前後、SD 小）＋右隣の NEAR 4 回・左上 1 回、w3 早い（−45 前後）＋右隣の空打ち 2 回、
 * w5 ばらつき大（SD 約 75）、w7 標本 1 つ（丸だけ・薄い）、b0 遅い大（＋90）＋6 方向に 1〜3 回、
 * b1 待ちの間の隣でない誤打 3 回だけ（扇にしない。要約の「隣でない物」に出る）
 */
function sampleEvents(grid: KeyboardGrid): HeatInput[] {
  const pitched = grid.cells.filter((c) => c.midi !== null)
  const w = pitched.filter((c) => c.midi !== null && !isBlackKey(c.midi)).map((c) => c.code)
  const b = pitched.filter((c) => c.midi !== null && isBlackKey(c.midi)).map((c) => c.code)
  const evs: HeatInput[] = []
  const wrong = (target: KeyCode | undefined, d: number, times: number) => {
    if (target === undefined) return
    const n = neighborCode(grid, target, d)
    if (n !== null) for (let i = 0; i < times; i++) evs.push(hit(target, n, 'near', 0))
  }
  const offs = (target: KeyCode | undefined, xs: readonly number[]) => {
    if (target !== undefined) for (const x of xs) evs.push(hit(target, target, 'great', x))
  }
  offs(w[1], [40, 55, 30, 48])
  wrong(w[1], 0, 4)
  wrong(w[1], 4, 1)
  offs(w[3], [-35, -50, -20, -60, -45])
  if (w[3] !== undefined) {
    const n = neighborCode(grid, w[3], 0)
    if (n !== null)
      for (let i = 0; i < 2; i++)
        evs.push({
          kind: 'stray',
          code: n,
          tsPerf: 0,
          reason: 'window',
          target: { index: 0, code: w[3] },
        })
  }
  offs(w[5], [90, -70, 10, -60, 100])
  offs(w[7], [5])
  offs(b[0], [80, 95, 100, 85])
  for (let d = 0; d < 6; d++) wrong(b[0], d, 1 + (d % 3))
  if (b[1] !== undefined)
    for (let i = 0; i < 3; i++)
      evs.push({ kind: 'waitWrong', code: b[1] === 'KeyQ' ? 'KeyP' : 'KeyQ', waiting: [b[1]] })
  return evs
}

function insideConvex(poly: readonly Pt[], [x, y]: Pt): boolean {
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i] ?? [0, 0]
    const [bx, by] = poly[(i + 1) % poly.length] ?? [0, 0]
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < -1e-6) return false
  }
  return true
}

function stage(title: string, layout: LayoutId, R: number): { el: HTMLElement; bad: number; text: string } {
  const labels = $<HTMLSelectElement>('labels').value === 'both' ? 'both' : 'key'
  const depth = $<HTMLInputElement>('depth').checked
  const grid = buildKeyboardGrid(layout, R, { left: PAD, top: PAD })
  const stats = heatStats(heatAddAll(EMPTY_HEAT, sampleEvents(grid)))
  const kb = keyboardCommands(grid, { mode: 'cell', pressed: new Set(), glow: new Map(), labels, depth })
  // heatCommands と同じ物をセルごとに作り、そのセルの六角の内側かを数える（外へ出たら console.error）
  const max = maxDirOf(stats)
  const heat: PolyCmd[] = []
  let bad = 0
  for (const c of grid.cells) {
    const st = stats.get(c.code)
    if (st === undefined || c.midi === null || !$<HTMLInputElement>('show').checked) continue
    const r = drawRadius(grid, c, 'cell', CELL_SCALE, depth)
    const poly = cellVertices(c.cx, c.cy, r, c.midi)
    const cc = heatCellCommands(c.cx, c.cy, r, st, max)
    bad += cc.filter((x) => !x.pts.every((pt) => insideConvex(poly, pt))).length
    heat.push(...cc)
  }
  const cmds: DrawCommand[] = [...kb.polys, ...heat, ...kb.texts]
  const width = Math.ceil(grid.width + 2 * PAD)
  const height = Math.ceil(grid.height + 2 * PAD)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const ctx = canvas.getContext('2d') as Ctx2D | null
  if (ctx === null) throw new Error('2d が無い')
  const keys = { x: grid.left, y: grid.top, w: grid.width, h: grid.height }
  flush(ctx, cmds, {
    regions: { fall: { x: 0, y: 0, w: 0, h: 0 }, keys, stageArea: keys.w * keys.h },
    width,
    height,
    dpr,
  })
  const wrap = document.createElement('section')
  const h = document.createElement('h2')
  h.textContent = `${title}（R ${R.toFixed(1)}、扇 ${heat.filter((c) => c.tag === 'heatFan').length}・丸 ${heat.filter((c) => c.tag === 'heatDot').length}・輪 ${heat.filter((c) => c.tag === 'heatRing').length}）`
  wrap.append(h, canvas)
  const s = heatSummary(stats)
  const text = s.keys === 0 ? 'まだデータがありません。' : `${s.keys} キーに記録。誤打 ${s.wrong} 回（うち隣でない物 ${s.other} 回）、タイミング ${s.timing} 回。`
  return { el: wrap, bad, text }
} // prettier-ignore

function render(): void {
  const layout = $<HTMLSelectElement>('layout').value as LayoutId
  const rows = LAYOUTS[layout].rowsUsed
  const list = [
    ...[24, 26, 28].map((R) => ({ title: `R ${R}`, R })),
    ...VIEWPORTS.map((v) => ({
      title: `${v.w}×${v.h}`,
      R: sizeForViewport(v, rows, TRAVEL_MS.beginner).R,
    })),
  ]
  const out = list.map((x) => stage(x.title, layout, x.R))
  $('stages').replaceChildren(...out.map((o) => o.el))
  $('summary').textContent = `要約の文（手順 2 の下書き）: ${out[0]?.text ?? ''}`
  const bad = out.reduce((a, o) => a + o.bad, 0)
  const check = $('check')
  check.textContent = bad === 0 ? 'セルの外へ出た図形: 0' : `セルの外へ出た図形: ${bad}`
  check.className = bad === 0 ? '' : 'bad'
  if (bad > 0) console.error(`heat-dev: セルの外へ出た図形 ${bad}`)
}

const sel = $<HTMLSelectElement>('layout')
for (const id of LAYOUT_IDS) sel.append(new Option(LAYOUTS[id].name, id))
for (const id of ['layout', 'labels', 'depth', 'show']) $(id).addEventListener('change', render)
render()
