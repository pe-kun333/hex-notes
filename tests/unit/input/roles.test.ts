import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_CODES,
  META_CODES,
  MODIFIER_CODES,
  PLAY_CODES,
  ROLE_KEYS,
  classifyCode,
  isAssignable,
} from '../../../src/input/roles.ts'
import { KEY_CODES, LAYOUTS } from '../../../src/layout/presets.ts'
import { LAYOUT_IDS } from '../../../src/shared/types.ts'

// src/input/roles.ts。出どころ: design.md §2.8（役割キー・禁止 code・修飾キーは使わない）、
// kickoff 手順 5 の手直し（Enter＝ボタン決定、Escape＝一時停止）。

describe('役割キー（§2.8）', () => {
  it('Space＝primary、Enter＝confirm、Escape＝pause の 3 つだけ', () => {
    expect({ ...ROLE_KEYS }).toEqual({ Space: 'primary', Enter: 'confirm', Escape: 'pause' })
    expect(classifyCode('Space')).toEqual({ kind: 'role', role: 'primary' })
    expect(classifyCode('Enter')).toEqual({ kind: 'role', role: 'confirm' })
    expect(classifyCode('Escape')).toEqual({ kind: 'role', role: 'pause' })
  })

  it('NumpadEnter は役割にしない（設計に無い）。プロトタイプの名前も引かない', () => {
    expect(classifyCode('NumpadEnter')).toEqual({ kind: 'other' })
    expect(classifyCode('constructor')).toEqual({ kind: 'other' })
    expect(classifyCode('toString')).toEqual({ kind: 'other' })
  })
})

describe('禁止 code（§2.8）', () => {
  it('Backquote, KanaMode, Convert, NonConvert, CapsLock, Lang1/2, Meta, F1〜F12 の 23 個', () => {
    const fs = Array.from({ length: 12 }, (_, i) => `F${i + 1}`)
    expect([...FORBIDDEN_CODES].sort()).toEqual(
      [
        'Backquote',
        'KanaMode',
        'Convert',
        'NonConvert',
        'CapsLock',
        'Lang1',
        'Lang2',
        'MetaLeft',
        'MetaRight',
        'OSLeft',
        'OSRight',
        ...fs,
      ].sort(),
    )
    for (const c of FORBIDDEN_CODES) expect(classifyCode(c)).toEqual({ kind: 'forbidden' })
    expect(classifyCode('F13')).toEqual({ kind: 'other' })
  })

  it('Meta の code は禁止の部分集合', () => {
    for (const c of META_CODES) expect(FORBIDDEN_CODES.has(c)).toBe(true)
  })
})

describe('修飾キー・演奏・その他', () => {
  it('Shift・Control・Alt の左右は modifier', () => {
    for (const c of MODIFIER_CODES) expect(classifyCode(c)).toEqual({ kind: 'modifier' })
    expect(MODIFIER_CODES.size).toBe(6)
  })

  it('演奏は 40 鍵（KEY_CODES）。Tab・矢印・Minus・IntlYen は other', () => {
    expect(PLAY_CODES.size).toBe(40)
    for (const c of KEY_CODES) expect(classifyCode(c)).toEqual({ kind: 'play' })
    for (const c of ['Tab', 'ArrowUp', 'Minus', 'IntlYen', 'IntlRo', 'Backspace'])
      expect(classifyCode(c)).toEqual({ kind: 'other' })
  })

  it('playCodes を差し替えると、その外の 40 鍵は other', () => {
    const only = new Set(['KeyD', 'KeyF', 'KeyJ', 'KeyK'])
    expect(classifyCode('KeyD', only)).toEqual({ kind: 'play' })
    expect(classifyCode('KeyA', only)).toEqual({ kind: 'other' })
    expect(classifyCode('Space', only)).toEqual({ kind: 'role', role: 'primary' })
  })
})

describe('割り当ての可否 isAssignable', () => {
  it('4 配列の表が使う code は全て割り当てられる（禁止・修飾・役割を含まない）', () => {
    for (const id of LAYOUT_IDS)
      for (const code of Object.keys(LAYOUTS[id].map))
        expect(isAssignable(code), `${id} ${code}`).toBe(true)
  })

  it('禁止・修飾・役割は不可', () => {
    for (const c of [
      'Backquote',
      'F5',
      'MetaLeft',
      'ShiftLeft',
      'ControlRight',
      'Space',
      'Enter',
      'Escape',
    ])
      expect(isAssignable(c), c).toBe(false)
    expect(isAssignable('KeyA')).toBe(true)
  })
})
