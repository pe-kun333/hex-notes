import { describe, expect, it } from 'vitest'
import type { InputEvent, InputState, KeyEventRecord } from '../../../src/input/keyboard.ts'
import { emptyInputState, handleFocus, handleKey, releaseAll } from '../../../src/input/keyboard.ts'

// src/input/keyboard.ts。出どころ: design.md §2.8、§4.1、kickoff 手順 5（m1' L524–533、m3 L647–655、m4 L650–659・
// L674、m2 L409–416 の手直し）・L49（DOM 無しのレコード）、docs/tests-inventory.md 手順 5、decisions #26（仮）。
// 試験のイベントの模型: 既定は修飾なし・repeat なし・IME なし。timeStamp は now の 5 ms 前。

type Over = Partial<KeyEventRecord>

function rec(type: 'keydown' | 'keyup', code: string, t: number, over: Over = {}): KeyEventRecord {
  return {
    type,
    code,
    timeStamp: t,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...over,
  }
}

/** 列を順に流す。timeStamp t、now t+5 */
function run(
  steps: [type: 'keydown' | 'keyup', code: string, t: number, over?: Over][],
  start: InputState = emptyInputState(),
): { state: InputState; events: InputEvent[]; prevent: boolean[] } {
  let state = start
  const events: InputEvent[] = []
  const prevent: boolean[] = []
  for (const [type, code, t, over] of steps) {
    const r = handleKey(state, rec(type, code, t, over), t + 5)
    state = r.state
    events.push(...r.events)
    prevent.push(r.preventDefault)
  }
  return { state, events, prevent }
}

describe('押下集合と入力列（§2.8）', () => {
  it('keydown A → press {code, tsPerf}、keyup A → release。押下集合は空に戻る', () => {
    const r = run([
      ['keydown', 'KeyA', 1000],
      ['keyup', 'KeyA', 1120],
    ])
    expect(r.events).toEqual([
      { kind: 'press', code: 'KeyA', tsPerf: 1000, lag: 5 },
      { kind: 'release', code: 'KeyA', tsPerf: 1120, forced: false },
    ])
    expect(r.state.down.size).toBe(0)
    expect(r.prevent).toEqual([true, true])
  })

  it('同じ code の 2 度目の keydown は無視（repeat false でも。台帳 手順 5）', () => {
    const r = run([
      ['keydown', 'KeyA', 1000],
      ['keydown', 'KeyA', 1300],
    ])
    expect(r.events).toEqual([{ kind: 'press', code: 'KeyA', tsPerf: 1000, lag: 5 }])
    expect([...r.state.down]).toEqual([['KeyA', 1000]])
    // 捨てた keydown も既定の動作（スクロール・クイック検索）は止める
    expect(r.prevent).toEqual([true, true])
  })

  it('e.repeat の keydown は捨てる（押下集合に無くても）', () => {
    const r = run([['keydown', 'KeyS', 1000, { repeat: true }]])
    expect(r.events).toEqual([])
    expect(r.state.down.size).toBe(0)
    expect(r.prevent).toEqual([true])
  })

  it('和音: A・S・D を押して S を離す → 押下集合は A・D（押した順）', () => {
    const r = run([
      ['keydown', 'KeyA', 1000],
      ['keydown', 'KeyS', 1002],
      ['keydown', 'KeyD', 1003],
      ['keyup', 'KeyS', 1200],
    ])
    expect(r.events.map((e) => e.kind)).toEqual(['press', 'press', 'press', 'release'])
    expect([...r.state.down.keys()]).toEqual(['KeyA', 'KeyD'])
  })

  it('押していない code の keyup は何も出さず、既定の動作も止めない', () => {
    const r = run([['keyup', 'KeyA', 1000]])
    expect(r.events).toEqual([])
    expect(r.prevent).toEqual([false])
  })

  it('何も変わらない keydown（押下中の repeat・2 度目）は状態を同じ物で返す', () => {
    const held = run([['keydown', 'KeyA', 1000]]).state
    expect(handleKey(held, rec('keydown', 'KeyA', 1300, { repeat: true }), 1305).state).toBe(held)
    expect(handleKey(held, rec('keydown', 'KeyA', 1400), 1405).state).toBe(held)
    expect(handleKey(held, rec('keydown', 'Tab', 1500), 1505).state).toBe(held)
    expect(handleKey(held, rec('keydown', 'KeyS', 1600), 1605).state).not.toBe(held)
  })

  it('状態は書き換えずに新しい物を返す（前の down は変わらない）', () => {
    const s0 = emptyInputState()
    const r = handleKey(s0, rec('keydown', 'KeyA', 1000), 1005)
    expect(s0.down.size).toBe(0)
    expect(r.state.down.size).toBe(1)
  })
})

describe('役割キー（§2.8、手直し: Enter＝ボタン決定、Escape＝一時停止）', () => {
  it('Space・Enter・Escape の keydown → role。押下集合に入り、keyup では何も出さない', () => {
    const r = run([
      ['keydown', 'Space', 1000],
      ['keyup', 'Space', 1050],
      ['keydown', 'Enter', 1100],
      ['keydown', 'Escape', 1200],
    ])
    expect(r.events).toEqual([
      { kind: 'role', role: 'primary', code: 'Space', tsPerf: 1000 },
      { kind: 'role', role: 'confirm', code: 'Enter', tsPerf: 1100 },
      { kind: 'role', role: 'pause', code: 'Escape', tsPerf: 1200 },
    ])
    expect([...r.state.down.keys()]).toEqual(['Enter', 'Escape'])
  })

  it('Space の押しっぱなし（repeat）と 2 度目は捨てる（開始・再開が 2 回走らない）', () => {
    const r = run([
      ['keydown', 'Space', 1000],
      ['keydown', 'Space', 1500, { repeat: true }],
      ['keydown', 'Space', 1533],
    ])
    expect(r.events).toEqual([{ kind: 'role', role: 'primary', code: 'Space', tsPerf: 1000 }])
    // 捨てた 2 打も既定の動作（スクロール・ボタンの押下）は止める
    expect(r.prevent).toEqual([true, true, true])
  })
})

describe('禁止 code・修飾・その他（§2.8、手直し: m2 の修飾付き keyup 捨て → 捨てない）', () => {
  it('禁止 code（F5・Backquote・CapsLock・MetaLeft）は入れず、既定の動作も止めない', () => {
    const r = run([
      ['keydown', 'F5', 1000],
      ['keydown', 'Backquote', 1010],
      ['keydown', 'CapsLock', 1020],
      ['keydown', 'MetaLeft', 1030],
    ])
    expect(r.events).toEqual([])
    expect(r.state.down.size).toBe(0)
    expect(r.prevent).toEqual([false, false, false, false])
  })

  it('Ctrl・Alt・Meta 付きの keydown は素通し（Ctrl+R など）', () => {
    const r = run([
      ['keydown', 'KeyR', 1000, { ctrlKey: true }],
      ['keydown', 'KeyS', 1010, { altKey: true }],
      ['keydown', 'KeyD', 1020, { metaKey: true }],
      ['keydown', 'KeyF', 1030, { ctrlKey: true, altKey: true }],
    ])
    expect(r.events).toEqual([])
    expect(r.prevent).toEqual([false, false, false, false])
  })

  it('Shift を押したまま A を押して離す → press・release（Shift は見ない。ShiftLeft 自身は素通し）', () => {
    const r = run([
      ['keydown', 'ShiftLeft', 1000],
      ['keydown', 'KeyA', 1010],
      ['keyup', 'KeyA', 1100],
      ['keyup', 'ShiftLeft', 1200],
    ])
    expect(r.events).toEqual([
      { kind: 'press', code: 'KeyA', tsPerf: 1010, lag: 5 },
      { kind: 'release', code: 'KeyA', tsPerf: 1100, forced: false },
    ])
    expect(r.prevent).toEqual([false, true, true, false])
    expect(r.state.down.size).toBe(0)
  })

  it('A を押してから Ctrl を押し、Ctrl 付きで A を離す → keyup は捨てずに release（m2 の手直し）', () => {
    const r = run([
      ['keydown', 'KeyA', 1000],
      ['keydown', 'ControlLeft', 1010, { ctrlKey: true }],
      ['keyup', 'KeyA', 1100, { ctrlKey: true }],
    ])
    expect(r.events).toEqual([
      { kind: 'press', code: 'KeyA', tsPerf: 1000, lag: 5 },
      { kind: 'release', code: 'KeyA', tsPerf: 1100, forced: false },
    ])
    expect(r.state.down.size).toBe(0)
  })

  it('修飾キー自身・Tab・矢印は入れない', () => {
    const r = run([
      ['keydown', 'ShiftLeft', 1000],
      ['keydown', 'Tab', 1010],
      ['keydown', 'ArrowDown', 1020],
    ])
    expect(r.events).toEqual([])
    expect(r.prevent).toEqual([false, false, false])
  })

  it('Meta の keyup で全離し（macOS は Meta 中に離した鍵の keyup を出さない。仮）', () => {
    const r = run([
      ['keydown', 'KeyA', 1000],
      ['keydown', 'KeyS', 1001],
      ['keydown', 'Space', 1002],
      ['keydown', 'MetaLeft', 1010, { metaKey: true }],
      ['keyup', 'MetaLeft', 1200],
    ])
    expect(r.events.slice(3)).toEqual([
      { kind: 'release', code: 'KeyA', tsPerf: 1200, forced: true },
      { kind: 'release', code: 'KeyS', tsPerf: 1200, forced: true },
    ])
    expect(r.state.down.size).toBe(0)
  })
})

describe('IME（§2.8、§5.1 M0-04 の完了条件、台帳 手順 5、decisions #26）', () => {
  it('keyCode 229 → 入力列に入らず帯 1 件（検知 ime も 1 件）。preventDefault しない', () => {
    const r = run([['keydown', 'KeyA', 1000, { keyCode: 229 }]])
    expect(r.events).toEqual([
      { kind: 'ime', code: 'KeyA', tsPerf: 1000 },
      { kind: 'imeBand', on: true, code: 'KeyA', tsPerf: 1000 },
    ])
    expect(r.state.down.size).toBe(0)
    expect(r.state.imeBand).toBe(true)
    expect(r.prevent).toEqual([false])
  })

  it('isComposing でも同じ。IME 中に 5 打 → ime 5 件・帯 1 件・press／role／pause 0 件（曲は止めない）、どれも止めない', () => {
    const r = run([
      ['keydown', 'KeyA', 1000, { isComposing: true, keyCode: 229 }],
      ['keydown', 'KeyS', 1100, { keyCode: 229 }],
      ['keydown', 'Space', 1200, { keyCode: 229 }],
      ['keydown', 'Enter', 1300, { isComposing: true }],
      ['keydown', 'KeyD', 1400, { keyCode: 229 }],
    ])
    expect(r.events.filter((e) => e.kind === 'ime').map((e) => e.code)).toEqual([
      'KeyA',
      'KeyS',
      'Space',
      'Enter',
      'KeyD',
    ])
    expect(r.events.filter((e) => e.kind === 'imeBand')).toHaveLength(1)
    expect(
      r.events.filter((e) => e.kind === 'press' || e.kind === 'role' || e.kind === 'pause'),
    ).toEqual([])
    // Enter の 229 も止めない（変換の確定を IME に渡す）
    expect(r.prevent).toEqual([false, false, false, false, false])
  })

  it('帯が点いている間の 229 は ime だけ（帯のイベントは出ず、状態は同じ物を返す）', () => {
    const on = run([['keydown', 'KeyA', 1000, { keyCode: 229 }]]).state
    const r = handleKey(on, rec('keydown', 'KeyS', 1100, { keyCode: 229 }), 1105)
    expect(r.events).toEqual([{ kind: 'ime', code: 'KeyS', tsPerf: 1100 }])
    expect(r.state).toBe(on)
  })

  it('IME を切って演奏の鍵を押すと帯が消え（1 件）、その打鍵は入る', () => {
    const r = run([
      ['keydown', 'KeyA', 1000, { keyCode: 229 }],
      ['keyup', 'KeyA', 1050, { keyCode: 229 }],
      ['keydown', 'Backquote', 1100, { keyCode: 229 }],
      ['keydown', 'KeyA', 1200, { keyCode: 65 }],
    ])
    expect(r.events).toEqual([
      { kind: 'ime', code: 'KeyA', tsPerf: 1000 },
      { kind: 'imeBand', on: true, code: 'KeyA', tsPerf: 1000 },
      { kind: 'imeBand', on: false, code: 'KeyA', tsPerf: 1200 },
      { kind: 'press', code: 'KeyA', tsPerf: 1200, lag: 5 },
    ])
  })

  it('帯が点いている間に IME でない Space → 帯 OFF と role primary が同じ回に出る', () => {
    const on = run([['keydown', 'KeyA', 1000, { keyCode: 229 }]]).state
    const r = run([['keydown', 'Space', 1100, { keyCode: 32 }]], on)
    expect(r.events).toEqual([
      { kind: 'imeBand', on: false, code: 'Space', tsPerf: 1100 },
      { kind: 'role', role: 'primary', code: 'Space', tsPerf: 1100 },
    ])
    expect(r.prevent).toEqual([true])
  })

  it('半角/全角（Backquote、229）は禁止 code として先に捨て、帯を点けない', () => {
    const r = run([['keydown', 'Backquote', 1000, { keyCode: 229, isComposing: true }]])
    expect(r.events).toEqual([])
    expect(r.state.imeBand).toBe(false)
  })

  it('演奏に使わない鍵の 229（Minus）でも帯を点ける。IME でない Shift・Tab では帯は消えない', () => {
    const m = run([['keydown', 'Minus', 1000, { keyCode: 229 }]])
    expect(m.events).toEqual([
      { kind: 'ime', code: 'Minus', tsPerf: 1000 },
      { kind: 'imeBand', on: true, code: 'Minus', tsPerf: 1000 },
    ])
    const r = run(
      [
        ['keydown', 'ShiftLeft', 1100, { keyCode: 16 }],
        ['keydown', 'Tab', 1200, { keyCode: 9 }],
      ],
      m.state,
    )
    expect(r.events).toEqual([])
    expect(r.state.imeBand).toBe(true)
    expect(r.state).toBe(m.state)
  })

  it('A を押したまま S を 229 → 帯 ON。IME でない A の 2 度目は帯 OFF だけ出して捨てる', () => {
    const r = run([
      ['keydown', 'KeyA', 1000],
      ['keydown', 'KeyS', 1100, { keyCode: 229 }],
      ['keydown', 'KeyA', 1200],
    ])
    expect(r.events).toEqual([
      { kind: 'press', code: 'KeyA', tsPerf: 1000, lag: 5 },
      { kind: 'ime', code: 'KeyS', tsPerf: 1100 },
      { kind: 'imeBand', on: true, code: 'KeyS', tsPerf: 1100 },
      { kind: 'imeBand', on: false, code: 'KeyA', tsPerf: 1200 },
    ])
    expect(r.prevent).toEqual([true, false, true])
    expect([...r.state.down.keys()]).toEqual(['KeyA'])
    expect(r.state.imeBand).toBe(false)
  })

  it('IME の前に押していた鍵の keyup は、keyup が 229 でも release する', () => {
    const r = run([
      ['keydown', 'KeyA', 1000],
      ['keydown', 'KeyS', 1100, { keyCode: 229 }],
      ['keyup', 'KeyA', 1200, { keyCode: 229, isComposing: true }],
    ])
    expect(r.events.map((e) => e.kind)).toEqual(['press', 'ime', 'imeBand', 'release'])
    expect(r.state.down.size).toBe(0)
  })
})

describe('全離しとフォーカス（§2.8、手直し: blur 全離しだけ → ＋Pause 要求）', () => {
  const held = run([
    ['keydown', 'KeyA', 1000],
    ['keydown', 'KeyS', 1001],
    ['keydown', 'Space', 1002],
  ]).state

  it('blur で押下集合が空＋Pause 要求（台帳 手順 5）。演奏の鍵だけ release（forced）を押した順に', () => {
    const r = handleFocus(held, { type: 'blur', toIframe: false }, 2000)
    expect(r.state.down.size).toBe(0)
    expect(r.events).toEqual([
      { kind: 'release', code: 'KeyA', tsPerf: 2000, forced: true },
      { kind: 'release', code: 'KeyS', tsPerf: 2000, forced: true },
      { kind: 'pause', reason: 'blur', tsPerf: 2000 },
    ])
    expect(r.reclaim).toBe(false)
  })

  it('iframe へ移った blur は reason iframe と reclaim。非表示は hidden', () => {
    const a = handleFocus(held, { type: 'blur', toIframe: true }, 2000)
    expect(a.events.at(-1)).toEqual({ kind: 'pause', reason: 'iframe', tsPerf: 2000 })
    expect(a.reclaim).toBe(true)
    const b = handleFocus(held, { type: 'visibility', hidden: true }, 2000)
    expect(b.state.down.size).toBe(0)
    expect(b.events.at(-1)).toEqual({ kind: 'pause', reason: 'hidden', tsPerf: 2000 })
  })

  it('表示に戻ったときは何も出さず、押下集合も変えない', () => {
    const r = handleFocus(held, { type: 'visibility', hidden: false }, 2000)
    expect(r.events).toEqual([])
    expect(r.state).toBe(held)
  })

  it('押下集合が空でも blur は Pause 要求を 1 件出す', () => {
    const r = handleFocus(emptyInputState(), { type: 'blur', toIframe: false }, 2000)
    expect(r.events).toEqual([{ kind: 'pause', reason: 'blur', tsPerf: 2000 }])
  })

  it('全離しの後に同じ鍵を押すと入る（押しっぱなし扱いが残らない）', () => {
    const cleared = releaseAll(held, 2000).state
    const r = handleKey(cleared, rec('keydown', 'KeyA', 2100), 2105)
    expect(r.events).toEqual([{ kind: 'press', code: 'KeyA', tsPerf: 2100, lag: 5 }])
  })

  it('全離しは IME の帯を変えない。押下集合が空なら状態も同じ物を返す', () => {
    const on = run([['keydown', 'KeyA', 1000, { keyCode: 229 }]]).state
    expect(releaseAll(on, 2000).state).toBe(on)
    const s = emptyInputState()
    expect(releaseAll(s, 2000)).toEqual({ state: s, events: [], preventDefault: false })
  })

  it('コンテキストメニューで全離し（Pause 要求なし）。次の A は入る（keyup の取りこぼしへの備え。仮）', () => {
    const r = handleFocus(held, { type: 'contextmenu' }, 2000)
    expect(r.events).toEqual([
      { kind: 'release', code: 'KeyA', tsPerf: 2000, forced: true },
      { kind: 'release', code: 'KeyS', tsPerf: 2000, forced: true },
    ])
    expect(r.reclaim).toBe(false)
    const a = handleKey(r.state, rec('keydown', 'KeyA', 2100), 2105)
    expect(a.events).toEqual([{ kind: 'press', code: 'KeyA', tsPerf: 2100, lag: 5 }])
  })

  it('タブの切替（hidden の後に blur）は Pause 要求 2 件（呼ぶ側は冪等に扱う。decisions #26）', () => {
    const h = handleFocus(held, { type: 'visibility', hidden: true }, 2000)
    const b = handleFocus(h.state, { type: 'blur', toIframe: false }, 2001)
    expect([...h.events, ...b.events]).toEqual([
      { kind: 'release', code: 'KeyA', tsPerf: 2000, forced: true },
      { kind: 'release', code: 'KeyS', tsPerf: 2000, forced: true },
      { kind: 'pause', reason: 'hidden', tsPerf: 2000 },
      { kind: 'pause', reason: 'blur', tsPerf: 2001 },
    ])
  })
})

describe('演奏の鍵の差し替え（鍵数制限は M1-10 の実行時フィルタ。入力層は playCodes を受けるだけ）', () => {
  it('playCodes の外の 40 鍵は other として素通し', () => {
    const only = new Set(['KeyD', 'KeyF', 'KeyJ', 'KeyK'])
    const a = handleKey(emptyInputState(), rec('keydown', 'KeyA', 1000), 1005, { playCodes: only })
    expect(a.events).toEqual([])
    expect(a.preventDefault).toBe(false)
    const d = handleKey(emptyInputState(), rec('keydown', 'KeyD', 1000), 1005, { playCodes: only })
    expect(d.events).toEqual([{ kind: 'press', code: 'KeyD', tsPerf: 1000, lag: 5 }])
  })

  it('押した後に playCodes が変わっても離しは出す（keyup・全離し）', () => {
    const only = new Set(['KeyD', 'KeyF', 'KeyJ', 'KeyK'])
    const held = run([['keydown', 'KeyA', 1000]]).state
    const up = handleKey(held, rec('keyup', 'KeyA', 1120), 1125, { playCodes: only })
    expect(up.events).toEqual([{ kind: 'release', code: 'KeyA', tsPerf: 1120, forced: false }])
    expect(releaseAll(held, 2000).events).toEqual([
      { kind: 'release', code: 'KeyA', tsPerf: 2000, forced: true },
    ])
  })
})
