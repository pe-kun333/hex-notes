import { describe, expect, it } from 'vitest'
import { LAYOUT_IDS } from '../../../src/shared/types.ts'
import {
  KEY_CODES,
  KEY_ROWS,
  LAYOUTS,
  codesOf,
  keyPosition,
  midiOf,
  midiRange,
  resolveLayoutId,
} from '../../../src/layout/presets.ts'

// 出どころ: docs/design.md §2.1、spec 草稿 §1、docs/tests-inventory.md 手順 2 の行（wicki KeyZ／KeyA、ableton KeyA／KeyW）。

describe('鍵の並び（m1 ROWS）', () => {
  it('KEY_ROWS は 4 段 × 10 個、KEY_CODES は 40 個で重複なし', () => {
    expect(KEY_ROWS).toHaveLength(4)
    for (const r of KEY_ROWS) expect(r).toHaveLength(10)
    expect(KEY_CODES).toHaveLength(40)
    expect(new Set(KEY_CODES).size).toBe(40)
  })

  it('keyPosition は段と列を返し、40 個の外は null', () => {
    expect(keyPosition('Digit1')).toEqual({ row: 0, col: 0 })
    expect(keyPosition('KeyQ')).toEqual({ row: 1, col: 0 })
    expect(keyPosition('Semicolon')).toEqual({ row: 2, col: 9 })
    expect(keyPosition('Slash')).toEqual({ row: 3, col: 9 })
    expect(keyPosition('Backquote')).toBeNull()
    expect(keyPosition('Space')).toBeNull()
  })
})

describe('配列の表（design.md §2.1）', () => {
  it('wicki: KeyZ 48・KeyA 53・KeyQ 58・Digit1 63・Slash 66', () => {
    expect(midiOf('wicki', 'KeyZ')).toBe(48)
    expect(midiOf('wicki', 'KeyA')).toBe(53)
    expect(midiOf('wicki', 'KeyQ')).toBe(58)
    expect(midiOf('wicki', 'Digit1')).toBe(63)
    expect(midiOf('wicki', 'Slash')).toBe(66)
  })

  it('wicki は右 +2、右上 +7、左上 +5', () => {
    expect(midiOf('wicki', 'KeyX')! - midiOf('wicki', 'KeyZ')!).toBe(2)
    expect(midiOf('wicki', 'KeyS')! - midiOf('wicki', 'KeyZ')!).toBe(7)
    expect(midiOf('wicki', 'KeyA')! - midiOf('wicki', 'KeyZ')!).toBe(5)
  })

  it('ableton: KeyA 60・KeyW 61、KeyQ・KeyR・KeyI は空', () => {
    expect(midiOf('ableton', 'KeyA')).toBe(60)
    expect(midiOf('ableton', 'KeyW')).toBe(61)
    expect(midiOf('ableton', 'Semicolon')).toBe(76)
    expect(midiOf('ableton', 'KeyP')).toBe(75)
    expect(midiOf('ableton', 'KeyQ')).toBeNull()
    expect(midiOf('ableton', 'KeyR')).toBeNull()
    expect(midiOf('ableton', 'KeyI')).toBeNull()
    expect(midiOf('ableton', 'KeyZ')).toBeNull()
  })

  it('vmpk: Slash 64・KeyQ 60、KeyA・KeyF・KeyK と Digit1・4・8 は空', () => {
    expect(midiOf('vmpk', 'Slash')).toBe(64)
    expect(midiOf('vmpk', 'KeyQ')).toBe(60)
    expect(midiOf('vmpk', 'KeyZ')).toBe(48)
    expect(midiOf('vmpk', 'Digit0')).toBe(75)
    expect(midiOf('vmpk', 'Semicolon')).toBe(63)
    for (const c of ['KeyA', 'KeyF', 'KeyK', 'Digit1', 'Digit4', 'Digit8']) {
      expect(midiOf('vmpk', c), c).toBeNull()
    }
  })

  it('vmpk の同音は逆引きで段の順（Q 段が先）', () => {
    expect(codesOf('vmpk', 60)).toEqual(['KeyQ', 'Comma'])
    expect(codesOf('vmpk', 62)).toEqual(['KeyW', 'Period'])
    expect(codesOf('vmpk', 64)).toEqual(['KeyE', 'Slash'])
    expect(codesOf('vmpk', 61)).toEqual(['Digit2', 'KeyL'])
    expect(codesOf('vmpk', 63)).toEqual(['Digit3', 'Semicolon'])
    expect(codesOf('vmpk', 48)).toEqual(['KeyZ'])
    expect(codesOf('vmpk', 47)).toEqual([])
  })

  it('genshin: KeyU 83・KeyJ 71・KeyZ 48、KeyI と数字段は空', () => {
    expect(midiOf('genshin', 'KeyU')).toBe(83)
    expect(midiOf('genshin', 'KeyQ')).toBe(72)
    expect(midiOf('genshin', 'KeyJ')).toBe(71)
    expect(midiOf('genshin', 'KeyZ')).toBe(48)
    expect(midiOf('genshin', 'KeyI')).toBeNull()
    expect(midiOf('genshin', 'Comma')).toBeNull()
    expect(midiOf('genshin', 'Digit1')).toBeNull()
  })

  it('genshin は自然音だけ', () => {
    const natural = new Set([0, 2, 4, 5, 7, 9, 11])
    for (const midi of Object.values(LAYOUTS.genshin.map)) expect(natural.has(midi % 12)).toBe(true)
  })

  it('表の総数: ableton 17・vmpk 34・genshin 21・wicki 40', () => {
    const count = (id: keyof typeof LAYOUTS) => Object.keys(LAYOUTS[id].map).length
    expect(count('ableton')).toBe(17)
    expect(count('vmpk')).toBe(34)
    expect(count('genshin')).toBe(21)
    expect(count('wicki')).toBe(40)
  })

  it('map の値は 0–127 の整数で、鍵は rowsUsed の段にしか無い', () => {
    for (const id of LAYOUT_IDS) {
      const { map, rowsUsed } = LAYOUTS[id]
      const used = new Set(rowsUsed)
      for (const [code, midi] of Object.entries(map)) {
        expect(Number.isInteger(midi), `${id} ${code}`).toBe(true)
        expect(midi, `${id} ${code}`).toBeGreaterThanOrEqual(0)
        expect(midi, `${id} ${code}`).toBeLessThanOrEqual(127)
        const pos = keyPosition(code)
        expect(pos, `${id} ${code}`).not.toBeNull()
        expect(used.has(pos!.row), `${id} ${code} row ${pos!.row}`).toBe(true)
      }
      // rowsUsed の段には鍵が 1 つ以上ある
      for (const r of rowsUsed) {
        expect(
          KEY_ROWS[r]!.some((code) => code in map),
          `${id} row ${r}`,
        ).toBe(true)
      }
    }
  })

  it('id は自分の鍵で、rowsUsed は ableton Q・A／vmpk 全部／genshin Q・A・Z／wicki 全部', () => {
    for (const id of LAYOUT_IDS) expect(LAYOUTS[id].id).toBe(id)
    expect(LAYOUTS.ableton.rowsUsed).toEqual([1, 2])
    expect(LAYOUTS.vmpk.rowsUsed).toEqual([0, 1, 2, 3])
    expect(LAYOUTS.genshin.rowsUsed).toEqual([1, 2, 3])
    expect(LAYOUTS.wicki.rowsUsed).toEqual([0, 1, 2, 3])
  })
})

describe('引き', () => {
  it('resolveLayoutId は別名と大小文字を吸収し、4 値以外は null', () => {
    expect(resolveLayoutId('garage')).toBe('ableton')
    expect(resolveLayoutId('FL')).toBe('vmpk')
    expect(resolveLayoutId('Ableton')).toBe('ableton')
    expect(resolveLayoutId(' wicki ')).toBe('wicki')
    expect(resolveLayoutId('custom')).toBeNull()
    expect(resolveLayoutId('')).toBeNull()
  })

  it('プロトタイプのキー（constructor・__proto__ など）は引かず null', () => {
    for (const k of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(resolveLayoutId(k), k).toBeNull()
      for (const id of LAYOUT_IDS) {
        expect(midiOf(id, k), `${id} ${k}`).toBeNull()
        expect(codesOf(id, Number.NaN), id).toEqual([])
      }
    }
  })

  it('midiRange: ableton 60–76、vmpk 48–76、genshin 48–83、wicki 48–81', () => {
    expect(midiRange('ableton')).toEqual({ min: 60, max: 76 })
    expect(midiRange('vmpk')).toEqual({ min: 48, max: 76 })
    expect(midiRange('genshin')).toEqual({ min: 48, max: 83 })
    expect(midiRange('wicki')).toEqual({ min: 48, max: 81 })
  })

  it('codesOf は midiOf の逆（全配列・全鍵で往復する）', () => {
    for (const id of LAYOUT_IDS) {
      for (const code of KEY_CODES) {
        const midi = midiOf(id, code)
        if (midi === null) continue
        expect(codesOf(id, midi), `${id} ${code}`).toContain(code)
      }
    }
  })
})
