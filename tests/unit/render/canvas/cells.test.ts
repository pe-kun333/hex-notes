import { describe, expect, it } from 'vitest'
import {
  approachGlow,
  noteCommand,
  placeNote,
  tailCommand,
  type FrameNote,
} from '../../../../src/render/canvas/cells.ts'
import { chordShapes } from '../../../../src/render/canvas/chords.ts'
import type { HexPos } from '../../../../src/render/hex/hex.ts'
import { setup } from './frame-setup.ts'

// src/render/canvas/cells.ts の状態の分岐（pending・holding・done）、ホールドの尾、接近の光り。出どころ: design.md §2.2・§2.3
// （ホールド ≥500 ms）、§2.5（y ＝ 着地 y − v·(着地 − 今)）、m1' notePos L405・drawNotes L409・L418、APPROACH L264、
// decisions #27 改め 2（着地で留める）・#31(f)。期待値は式から手で出す（v は sizing の値を使う）。

const s = setup('twinkle', 'ableton/2/octave')
const { grid, sizing } = s
const fallTop = sizing.fallTop
const v = sizing.v
const a = grid.byCode.get('KeyA')
if (!a) throw new Error('KeyA が無い')
const landY = a.cy

function note(over: Partial<FrameNote> = {}): FrameNote {
  return {
    index: 0,
    code: 'KeyA',
    midi: 60,
    tLandMs: 1000,
    tEndMs: 3000,
    hold: true,
    group: 0,
    state: 'pending',
    ...over,
  }
}

const place = (n: FrameNote, t: number) => placeNote(n, grid, 'cell', v, t, fallTop, true)

describe('placeNote（落ちるセルの置き場）', () => {
  it('pending: 着地の 500 ms 前は着地 y − v·500、着地を過ぎたら着地 y に留める', () => {
    expect(place(note(), 500)?.y).toBeCloseTo(landY - v * 500, 9)
    expect(place(note(), 1100)?.y).toBe(landY)
  })
  it('holding: 着地の前でも着地 y。done: 描かない（null）', () => {
    expect(place(note({ state: 'holding' }), 500)?.y).toBe(landY)
    expect(place(note({ state: 'done' }), 1000)).toBeNull()
  })
  it('中心＋径が箱の上端より上なら null（見えない）', () => {
    const far = (landY + 40) / v
    expect(place(note({ tLandMs: 1000 + far }), 1000)).toBeNull()
  })
})

describe('noteCommand（holding は白く太い縁）', () => {
  it('pending は noteEdge 1.5 px、holding は pressedEdge 3 px', () => {
    const p = place(note(), 900)
    const h = place(note({ state: 'holding' }), 900)
    if (!p || !h) throw new Error('見えない')
    expect(noteCommand(p, fallTop)).toMatchObject({ stroke: 'noteEdge', width: 1.5 })
    expect(noteCommand(h, fallTop)).toMatchObject({ stroke: 'pressedEdge', width: 3 })
  })
})

describe('tailCommand（ホールドの尾）', () => {
  it('holding で t 1500: 上端は着地 y − v·(3000 − 1500)、下端はセルの中心（着地 y）', () => {
    const p = place(note({ state: 'holding' }), 1500)
    if (!p) throw new Error('見えない')
    const t = tailCommand(p, grid, v, 1500, fallTop)
    expect(t?.y).toBeCloseTo(landY - v * 1500, 9)
    expect(t?.h).toBeCloseTo(v * 1500, 9)
    expect(t?.w).toBeCloseTo(0.4 * grid.hexW, 9)
  })
  it('t が進むと縮み、終わり（t ≥ tEnd）で null。ホールドでない音は尾なし', () => {
    const at = (t: number) => {
      const p = place(note({ state: 'holding' }), t)
      return p ? tailCommand(p, grid, v, t, fallTop) : null
    }
    expect(at(2500)?.h).toBeCloseTo(v * 500, 9)
    expect(at(3000)).toBeNull()
    const p = place(note({ hold: false }), 900)
    if (!p) throw new Error('見えない')
    expect(tailCommand(p, grid, v, 900, fallTop)).toBeNull()
  })
  it('上端は箱の上端で切る', () => {
    const p = place(note({ state: 'holding', tEndMs: 100_000 }), 1000)
    if (!p) throw new Error('見えない')
    expect(tailCommand(p, grid, v, 1000, fallTop)?.y).toBe(fallTop)
  })
})

describe('approachGlow（着地の 700 ms 前から光る）', () => {
  it('着地まで −1／0／350／700／701 ms → なし／1／0.5／なし（0 は入れない）／なし', () => {
    const g = (t: number) => approachGlow([note()], t).get('KeyA')
    expect(g(1001)).toBeUndefined()
    expect(g(1000)).toBe(1)
    expect(g(650)).toBeCloseTo(0.5, 12)
    expect(g(300)).toBeUndefined()
    expect(g(299)).toBeUndefined()
  })
  it('holding・done の音は光らせない。同じ鍵の 2 音は近い方', () => {
    expect(approachGlow([note({ state: 'holding' })], 900).size).toBe(0)
    expect(approachGlow([note({ state: 'done' })], 900).size).toBe(0)
    const two = approachGlow([note({ tLandMs: 1600 }), note({ index: 1, tLandMs: 1000 })], 930)
    expect(two.get('KeyA')).toBeCloseTo(0.9, 12)
  })
})

describe('chordShapes は pending だけを和音にする', () => {
  const byPos = (q: HexPos): string | null =>
    grid.cells.find((c) => c.row === q.row && c.col === q.col)?.code ?? null
  it('A（holding）と D（pending）は 1 音しか残らず、殻も塊も作らない。両方 pending なら殻 1 つ', () => {
    const pa = place(note({ state: 'holding', group: 7 }), 900)
    const pd = place(note({ index: 1, code: 'KeyD', midi: 64, group: 7 }), 900)
    const pd2 = place(note({ index: 0, group: 7 }), 900)
    if (!pa || !pd || !pd2) throw new Error('見えない')
    const mixed = chordShapes([pa, pd], byPos, fallTop, true)
    expect(mixed.hulls).toHaveLength(0)
    expect(mixed.edges.size).toBe(0)
    expect(chordShapes([pd2, pd], byPos, fallTop, true).hulls).toHaveLength(1)
  })
})
