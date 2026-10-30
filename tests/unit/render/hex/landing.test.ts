import { describe, expect, it } from 'vitest'
import { buildKeyboardGrid } from '../../../../src/render/hex/grid.ts'
import {
  DEFAULT_LANDING,
  LINE_GAP,
  depthScale,
  isVisible,
  lineY,
  noteY,
  rowScale,
  targetY,
} from '../../../../src/render/hex/landing.ts'
import { sizeForViewport, visibleMs } from '../../../../src/render/hex/sizing.ts'
import { LAYOUTS } from '../../../../src/layout/presets.ts'

// src/render/hex/landing.ts。出どころ: decisions #3、design.md §2.2（奥行き ×0.96、下限 max(0.88, 24/R)）、
// §2.5（y ＝ 段の中心 − v·(着地 − 今)、箱の上端で切れる）、m0 yLine L238、m1' targetY L376・rowScale L377、
// docs/tests-inventory.md 手順 4（rowScale Q 段 0.96² ＝ 0.9216）。

describe('奥行き depthScale（§2.2）', () => {
  it('R 28: 最下段 1、1 段上 0.96、2 段上 0.9216、3 段上 0.884736（下限 0.88 を上回る）', () => {
    expect(depthScale(0, 28)).toBe(1)
    expect(depthScale(1, 28)).toBe(0.96)
    expect(depthScale(2, 28)).toBeCloseTo(0.9216, 12)
    expect(depthScale(3, 28)).toBeCloseTo(0.884736, 12)
  })

  it('R 27: 下限 24/27 ＝ 0.8889 に 3 段上が切り上がる。R 24: 下限 1 で奥行きが消える', () => {
    expect(depthScale(3, 27)).toBeCloseTo(24 / 27, 12)
    expect(depthScale(2, 27)).toBeCloseTo(0.9216, 12)
    expect(depthScale(1, 24)).toBe(1)
    expect(depthScale(3, 24)).toBe(1)
    // R 25: 下限 0.96 → 2 段上から 0.96 に張り付く
    expect(depthScale(1, 25)).toBe(0.96)
    expect(depthScale(2, 25)).toBe(0.96)
  })

  it('下限は 0.88 を割らない（大きな R、遠い段）', () => {
    expect(depthScale(10, 100)).toBe(0.88)
  })

  it('負の段・小数の段・R 0 は RangeError', () => {
    expect(() => depthScale(-1, 28)).toThrow(RangeError)
    expect(() => depthScale(1.5, 28)).toThrow(RangeError)
    expect(() => depthScale(0, 0)).toThrow(RangeError)
  })
})

describe('rowScale と着地 y（m1’ L376–377）', () => {
  const g = buildKeyboardGrid('vmpk', 28, { left: 0, top: 466 })
  const q = g.byCode.get('KeyQ')!
  const z = g.byCode.get('KeyZ')!
  const d1 = g.byCode.get('Digit1')!

  it('既定は段別（cell）', () => {
    expect(DEFAULT_LANDING).toBe('cell')
  })

  it('vmpk の Q 段は最下段から 2 段上 → 0.9216（台帳）、Z 段 1、数字段 0.884736。一本線では全段 1', () => {
    expect(rowScale('cell', q, 28)).toBeCloseTo(0.9216, 12)
    expect(rowScale('cell', z, 28)).toBe(1)
    expect(rowScale('cell', d1, 28)).toBeCloseTo(0.884736, 12)
    expect(rowScale('line', q, 28)).toBe(1)
    expect(rowScale('line', d1, 28)).toBe(1)
  })

  it('ableton の Q 段は 1 段上 → 0.96', () => {
    const a = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
    expect(rowScale('cell', a.byCode.get('KeyQ')!, 28)).toBe(0.96)
    expect(rowScale('cell', a.byCode.get('KeyA')!, 28)).toBe(1)
  })

  it('cell の着地 y は段の中心、line は鍵盤図の上端 − 0.8·R', () => {
    expect(LINE_GAP).toBe(0.8)
    expect(targetY('cell', q, g)).toBe(q.cy)
    expect(targetY('cell', z, g)).toBe(z.cy)
    expect(targetY('line', q, g)).toBe(466 - 0.8 * 28)
    expect(targetY('line', z, g)).toBe(lineY(g))
    expect(lineY(g)).toBe(443.6)
  })
})

describe('落下の時間写像（§2.5。1366×668・vmpk・1.5 s: D 454、v 0.3027）', () => {
  const s = sizeForViewport({ w: 1366, h: 668 }, LAYOUTS.vmpk.rowsUsed, 1500)
  const g = buildKeyboardGrid('vmpk', s.R, { left: s.kbLeft, top: s.kbTop })

  it('着地時刻には段の中心、1500 ms 前には中心 − 454 px、着地 100 ms 後は中心より 30.27 px 下', () => {
    const z = g.byCode.get('KeyZ')!
    expect(noteY(z.cy, 5000, 5000, s.v)).toBe(z.cy)
    expect(noteY(z.cy, 5000, 3500, s.v)).toBeCloseTo(z.cy - 454, 9)
    expect(noteY(z.cy, 5000, 5100, s.v)).toBeCloseTo(z.cy + 30.27, 2)
  })

  it('最上段（数字段）の中心は fallTop + D + R、1500 ms 前は fallTop + R に居る（箱の中）。最下段は fallTop + D + 5.5R', () => {
    const d1 = g.byCode.get('Digit1')!
    const z = g.byCode.get('KeyZ')!
    expect(d1.cy).toBe(s.fallTop + s.D + s.R)
    expect(z.cy).toBe(s.fallTop + s.D + 5.5 * s.R)
    expect(noteY(d1.cy, 1500, 0, s.v)).toBeCloseTo(s.fallTop + s.R, 9)
  })

  it('箱の上端に中心が来る時刻 ＝ 可視時間: 数字段 1593 ms、Z 段 2009 ms 前（sizing.visibleMs と同じ）', () => {
    const d1 = g.byCode.get('Digit1')!
    const z = g.byCode.get('KeyZ')!
    const tTop = (d1.cy - s.fallTop) / s.v
    const tBot = (z.cy - s.fallTop) / s.v
    expect(Math.round(tTop)).toBe(1593)
    expect(Math.round(tBot)).toBe(2009)
    expect(tTop).toBeCloseTo(visibleMs(s, 0), 9)
    expect(tBot).toBeCloseTo(visibleMs(s, 3), 9)
  })

  it('isVisible: 中心 ＋ 描く径 が箱の上端より下なら見える', () => {
    const r = s.R * depthScale(3, s.R)
    expect(isVisible(s.fallTop - r + 0.01, r, s.fallTop)).toBe(true)
    expect(isVisible(s.fallTop - r, r, s.fallTop)).toBe(false)
    expect(isVisible(s.fallTop - 100, r, s.fallTop)).toBe(false)
  })
})
