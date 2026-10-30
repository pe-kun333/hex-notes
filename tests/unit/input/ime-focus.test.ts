import { describe, expect, it } from 'vitest'
import { IME_KEYCODE, isImeKeydown, nextImeBand } from '../../../src/input/ime.ts'
import { focusAction } from '../../../src/input/focus.ts'

// src/input/ime.ts・focus.ts。出どころ: design.md §2.8（IME は無視して帯、曲は止めない。iframe に焦点が移ったら
// 戻す。blur／visibilitychange で Pause）、§1.3 S2（Pause は再開／最初から／やめる、再開は S7b）、
// kickoff 手順 5 の手直し（IME 無視のみ → 無視＋帯、blur 全離しだけ → ＋Pause 要求）、decisions #26（帯の点け消し、仮）。

describe('IME の判定 isImeKeydown（§2.8）', () => {
  it('keyCode 229 か isComposing なら IME', () => {
    expect(IME_KEYCODE).toBe(229)
    expect(isImeKeydown({ isComposing: false, keyCode: 229 })).toBe(true)
    expect(isImeKeydown({ isComposing: true, keyCode: 65 })).toBe(true)
    expect(isImeKeydown({ isComposing: true, keyCode: 229 })).toBe(true)
    expect(isImeKeydown({ isComposing: false, keyCode: 65 })).toBe(false)
    // 半角/全角の 243／244 は 229 でない（禁止 code として keyboard.ts が先に捨てる）
    expect(isImeKeydown({ isComposing: false, keyCode: 243 })).toBe(false)
  })
})

describe('帯の点け消し nextImeBand（decisions #26、仮）', () => {
  it('消えている帯は IME の keydown で点き、1 件だけ出る（連打しても 2 件目は出ない）', () => {
    const a = nextImeBand(false, 'ime')
    expect(a).toEqual({ bandOn: true, changed: true })
    const b = nextImeBand(a.bandOn, 'ime')
    expect(b).toEqual({ bandOn: true, changed: false })
  })

  it('点いている帯は IME でない演奏・役割の keydown で消える。その他の鍵では変わらない', () => {
    expect(nextImeBand(true, 'playOrRole')).toEqual({ bandOn: false, changed: true })
    expect(nextImeBand(true, 'other')).toEqual({ bandOn: true, changed: false })
    expect(nextImeBand(false, 'playOrRole')).toEqual({ bandOn: false, changed: false })
    expect(nextImeBand(false, 'other')).toEqual({ bandOn: false, changed: false })
  })
})

describe('フォーカスと可視性 focusAction（§2.8、§2.6）', () => {
  it('window の blur: 全離し＋Pause 要求（blur）。焦点は戻さない', () => {
    expect(focusAction({ type: 'blur', toIframe: false })).toEqual({
      releaseAll: true,
      pause: 'blur',
      reclaim: false,
    })
  })

  it('iframe へ移った blur: 全離し＋Pause 要求（iframe）＋焦点を戻す', () => {
    expect(focusAction({ type: 'blur', toIframe: true })).toEqual({
      releaseAll: true,
      pause: 'iframe',
      reclaim: true,
    })
  })

  it('コンテキストメニュー: 全離しだけ（Pause 要求なし、焦点は戻さない。仮）', () => {
    expect(focusAction({ type: 'contextmenu' })).toEqual({
      releaseAll: true,
      pause: null,
      reclaim: false,
    })
  })

  it('非表示: 全離し＋Pause 要求（hidden）。表示に戻ったときは何もしない（再開は Space で S7b を通る）', () => {
    expect(focusAction({ type: 'visibility', hidden: true })).toEqual({
      releaseAll: true,
      pause: 'hidden',
      reclaim: false,
    })
    expect(focusAction({ type: 'visibility', hidden: false })).toEqual({
      releaseAll: false,
      pause: null,
      reclaim: false,
    })
  })
})
