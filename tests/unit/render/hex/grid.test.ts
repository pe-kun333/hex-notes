import { describe, expect, it } from 'vitest'
import { buildKeyboardGrid, heightUnits, widthUnits } from '../../../../src/render/hex/grid.ts'
import { SQ3 } from '../../../../src/render/hex/hex.ts'
import { LAYOUTS, midiOf } from '../../../../src/layout/presets.ts'
import { LAYOUT_IDS } from '../../../../src/shared/types.ts'

// src/render/hex/grid.ts。出どころ: design.md §2.2（格子）、§2.5（11.5・k_n 3.5／6.5）、m0-layout computeGeom
// L214–250（kbW ＝ (maxGx − minGx + 1)·hexW、kbH ＝ (2 + 1.5·(段数 − 1))·R、cx・cy L236）。

describe('幅と高さの係数（m0 kbW・kbH L227、§2.5）', () => {
  it('4 段（vmpk・wicki）は幅 11.5・高さ 6.5、2 段（ableton）は 10.5・3.5、3 段（genshin）は 11・5', () => {
    expect(widthUnits(LAYOUTS.vmpk.rowsUsed)).toBe(11.5)
    expect(heightUnits(LAYOUTS.vmpk.rowsUsed)).toBe(6.5)
    expect(widthUnits(LAYOUTS.wicki.rowsUsed)).toBe(11.5)
    expect(widthUnits(LAYOUTS.ableton.rowsUsed)).toBe(10.5)
    expect(heightUnits(LAYOUTS.ableton.rowsUsed)).toBe(3.5)
    expect(widthUnits(LAYOUTS.genshin.rowsUsed)).toBe(11)
    expect(heightUnits(LAYOUTS.genshin.rowsUsed)).toBe(5)
  })

  it('段が無ければ RangeError、段 4 も RangeError', () => {
    expect(() => widthUnits([])).toThrow(RangeError)
    expect(() => heightUnits([])).toThrow(RangeError)
    expect(() => widthUnits([4])).toThrow(RangeError)
  })
})

describe('鍵盤図（m0 computeGeom L231–236）', () => {
  it('vmpk・R 28・左上 (100, 200): 幅 11.5·√3·28、高さ 6.5·28、40 セル', () => {
    const g = buildKeyboardGrid('vmpk', 28, { left: 100, top: 200 })
    expect(g.hexW).toBe(SQ3 * 28)
    expect(g.width).toBe(11.5 * SQ3 * 28)
    expect(g.height).toBe(6.5 * 28)
    expect(g.height).toBe(182)
    expect(g.cells).toHaveLength(40)
    expect(g.rowsUsed).toEqual([0, 1, 2, 3])
  })

  it('vmpk・R 28: Digit1 の中心は (100 + hexW/2, 228)、Slash は (100 + 11·hexW, 354)', () => {
    const g = buildKeyboardGrid('vmpk', 28, { left: 100, top: 200 })
    const hexW = SQ3 * 28
    const d1 = g.byCode.get('Digit1')!
    expect(d1.cx).toBeCloseTo(100 + hexW * 0.5, 10)
    expect(d1.cy).toBe(228)
    expect(d1.rowIndex).toBe(0)
    expect(d1.stepsAboveBottom).toBe(3)
    const sl = g.byCode.get('Slash')!
    expect(sl.cx).toBeCloseTo(100 + hexW * 11, 10)
    expect(sl.cy).toBe(200 + 28 + 1.5 * 28 * 3)
    expect(sl.cy).toBe(354)
    expect(sl.stepsAboveBottom).toBe(0)
  })

  it('段の中心の縦間隔は 1.5·R、同じ段の隣は hexW、下の段は右へ hexW/2', () => {
    const g = buildKeyboardGrid('vmpk', 24, { left: 0, top: 0 })
    const q = g.byCode.get('KeyQ')!
    const w = g.byCode.get('KeyW')!
    const a = g.byCode.get('KeyA')!
    expect(w.cx - q.cx).toBeCloseTo(g.hexW, 10)
    expect(a.cy - q.cy).toBe(1.5 * 24)
    expect(a.cx - q.cx).toBeCloseTo(g.hexW / 2, 10)
  })

  it('ableton・R 28: 2 段だけ（Q・A）、Q 段が rowIndex 0、最左の KeyQ の中心は left + hexW/2、幅 10.5·hexW', () => {
    const g = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
    expect(g.rowsUsed).toEqual([1, 2])
    expect(g.cells).toHaveLength(20)
    expect(g.width).toBeCloseTo(10.5 * SQ3 * 28, 10)
    expect(g.height).toBe(98)
    const q = g.byCode.get('KeyQ')!
    expect(q.rowIndex).toBe(0)
    expect(q.stepsAboveBottom).toBe(1)
    expect(q.cx).toBeCloseTo(g.hexW * 0.5, 10)
    expect(q.cy).toBe(28)
    const a = g.byCode.get('KeyA')!
    expect(a.stepsAboveBottom).toBe(0)
    expect(a.cy).toBe(70)
    expect(g.byCode.has('Digit1')).toBe(false)
    expect(g.byCode.has('KeyZ')).toBe(false)
  })

  it('全セルが鍵盤図の矩形の中（中心 ± R が left..left+width、top..top+height）', () => {
    for (const layout of LAYOUT_IDS) {
      const g = buildKeyboardGrid(layout, 26, { left: 10, top: 20 })
      for (const c of g.cells) {
        expect(c.cx - g.hexW / 2).toBeGreaterThanOrEqual(g.left - 1e-9)
        expect(c.cx + g.hexW / 2).toBeLessThanOrEqual(g.left + g.width + 1e-9)
        expect(c.cy - g.R).toBeGreaterThanOrEqual(g.top)
        expect(c.cy + g.R).toBeLessThanOrEqual(g.top + g.height + 1e-9)
      }
    }
  })

  it('midi は配列の表のとおり（空のキーは null）。4 配列の全セル', () => {
    for (const layout of LAYOUT_IDS) {
      const g = buildKeyboardGrid(layout, 28, { left: 0, top: 0 })
      for (const c of g.cells) expect(c.midi).toBe(midiOf(layout, c.code))
    }
    const g = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
    expect(g.byCode.get('KeyQ')!.midi).toBeNull()
    expect(g.byCode.get('KeyW')!.midi).toBe(61)
    expect(g.byCode.get('KeyA')!.midi).toBe(60)
  })

  it('R が 0 以下なら RangeError', () => {
    expect(() => buildKeyboardGrid('ableton', 0, { left: 0, top: 0 })).toThrow(RangeError)
  })
})
