import { describe, expect, it } from 'vitest'
import {
  HEX_DIRS,
  ROW_OFF,
  SQ3,
  gridX,
  hexDist,
  hexNeighbor,
  isAdjacent,
  isBlackKey,
  rotationOf,
} from '../../../../src/render/hex/hex.ts'
import { KEY_CODES, keyPosition } from '../../../../src/layout/presets.ts'
import { M5_KEYS, m5HexDist } from '../../../../tools/charts/m5-port.ts'

// src/render/hex/hex.ts。出どころ: docs/tests-inventory.md 手順 4 の行（hexDist Digit1–KeyW ＝ 2、ROW_OFF の
// A 段と Q 段の x 差 0.5）、m0-layout hexDist L169・ROW_OFF L163、m2 DIRS L231–238、design.md §2.2。

function pos(code: string): { row: number; col: number } {
  const p = keyPosition(code)
  if (!p) throw new Error(`鍵 ${code} が無い`)
  return p
}

describe('hexDist（m0 L169）', () => {
  it('Digit1–KeyW ＝ 2（台帳 手順 4）', () => {
    expect(hexDist(pos('Digit1'), pos('KeyW'))).toBe(2)
  })

  it('同じ鍵は 0、同じ段の隣は 1、同じ段で 3 つ離れると 3', () => {
    expect(hexDist(pos('KeyA'), pos('KeyA'))).toBe(0)
    expect(hexDist(pos('KeyA'), pos('KeyS'))).toBe(1)
    expect(hexDist(pos('KeyA'), pos('KeyF'))).toBe(3)
  })

  it('下の段は右へ 1/2 ずれる: KeyW（gx 1.5）の下の隣は KeyA（1.0）と KeyS（2.0）、KeyD は 2', () => {
    expect(hexDist(pos('KeyW'), pos('KeyA'))).toBe(1)
    expect(hexDist(pos('KeyW'), pos('KeyS'))).toBe(1)
    expect(hexDist(pos('KeyW'), pos('KeyD'))).toBe(2)
    // 左端の KeyQ（gx 0.5）の下の隣は KeyA だけ（gx 0 の鍵は無い）。KeyS は 2
    expect(hexDist(pos('KeyQ'), pos('KeyA'))).toBe(1)
    expect(hexDist(pos('KeyQ'), pos('KeyS'))).toBe(2)
    // 上の段は左へ 1/2 ずれる: KeyS（2.0）の上の隣は KeyW（1.5）と KeyE（2.5）
    expect(hexDist(pos('KeyS'), pos('KeyW'))).toBe(1)
    expect(hexDist(pos('KeyS'), pos('KeyE'))).toBe(1)
    expect(hexDist(pos('KeyS'), pos('KeyQ'))).toBe(2)
  })

  it('対称で、三角不等式を満たし、整数（40 鍵の全組）', () => {
    const all = KEY_CODES.map(pos)
    for (const a of all)
      for (const b of all) {
        const d = hexDist(a, b)
        expect(d).toBe(hexDist(b, a))
        expect(Number.isInteger(d)).toBe(true)
        for (const c of all) expect(d).toBeLessThanOrEqual(hexDist(a, c) + hexDist(c, b))
      }
  })

  it('最大は Digit1–Slash ＝ 12（段差 3 ＋ 列差 9）', () => {
    expect(hexDist(pos('Digit1'), pos('Slash'))).toBe(12)
    expect(hexDist(pos('Digit0'), pos('KeyZ'))).toBe(9)
  })

  it('tools/charts/m5-port.ts の写し（m5 hexDist L223）と 40×40 の全組で同じ', () => {
    for (const a of M5_KEYS) for (const b of M5_KEYS) expect(hexDist(a, b)).toBe(m5HexDist(a, b))
  })
})

describe('6 方向（m2 DIRS L231–238）', () => {
  it('順は 右・右下・左下・左・左上・右上', () => {
    expect(HEX_DIRS.map((d) => d.id)).toEqual(['R', 'DR', 'DL', 'L', 'UL', 'UR'])
  })

  it('どの方向の隣も六角距離 1 で、6 つは互いに違う', () => {
    const o = { row: 2, col: 4 }
    const seen = new Set<string>()
    for (const d of HEX_DIRS) {
      const n = hexNeighbor(o, d)
      expect(isAdjacent(o, n)).toBe(true)
      seen.add(`${n.row},${n.col}`)
    }
    expect(seen.size).toBe(6)
  })

  it('KeyS の 6 方向（右・右下・左下・左・左上・右上）は D・X・Z・A・W・E', () => {
    const s = pos('KeyS')
    const names = HEX_DIRS.map((d) => {
      const n = hexNeighbor(s, d)
      return KEY_CODES.find((c) => {
        const p = pos(c)
        return p.row === n.row && p.col === n.col
      })
    })
    expect(names).toEqual(['KeyD', 'KeyX', 'KeyZ', 'KeyA', 'KeyW', 'KeyE'])
  })

  it('反対の方向は添字 +3', () => {
    for (let i = 0; i < 6; i++) {
      const a = HEX_DIRS[i]!
      const b = HEX_DIRS[(i + 3) % 6]!
      expect(a.dr + b.dr).toBe(0)
      expect(a.dc + b.dc).toBe(0)
    }
  })
})

describe('格子の x（m0 ROW_OFF L163）', () => {
  it('ROW_OFF は [0, 0.5, 1.0, 1.5]。A 段と Q 段の x 差は 0.5（台帳 手順 4）', () => {
    expect(ROW_OFF).toEqual([0, 0.5, 1.0, 1.5])
    expect(gridX(pos('KeyA')) - gridX(pos('KeyQ'))).toBe(0.5)
    expect(gridX(pos('Digit1'))).toBe(0)
    expect(gridX(pos('Slash'))).toBe(10.5)
  })

  it('段 4 は RangeError', () => {
    expect(() => gridX({ row: 4, col: 0 })).toThrow(RangeError)
  })

  it('SQ3 は √3', () => {
    expect(SQ3).toBe(Math.sqrt(3))
  })
})

describe('黒鍵と回転（§2.2、m1’ rotOf L378）', () => {
  it('60〜71 の黒鍵は 61・63・66・68・70', () => {
    const blacks = []
    for (let m = 60; m < 72; m++) if (isBlackKey(m)) blacks.push(m)
    expect(blacks).toEqual([61, 63, 66, 68, 70])
  })

  it('黒鍵は 30、白鍵と空のキーは 0', () => {
    expect(rotationOf(61)).toBe(30)
    expect(rotationOf(60)).toBe(0)
    expect(rotationOf(null)).toBe(0)
    expect(rotationOf(49)).toBe(30)
  })
})
