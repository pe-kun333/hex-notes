import { describe, expect, it } from 'vitest'
import {
  controlOf,
  controlStep,
  restartSession,
  type ControlInput,
} from '../../../src/app/play-control.ts'
import { LEAD_MS, PHASE_TEXT } from '../../../src/app/screens/play.ts'
import { GRACE_MS } from '../../../src/clock/grace.ts'
import type { InputEvent } from '../../../src/input/keyboard.ts'
import { initialSession, sessionTick, type Session } from '../../../src/play/session.ts'
import type { PlayPhase } from '../../../src/play/state.ts'

// src/app/play-control.ts（M1-13、M1 の手順 2）。出どころ: design.md §1.3 S2（Pause は再開／最初から／やめる。再開は S7b を
// 通る）・§2.8（Space＝開始・再開、Escape＝一時停止）・§1.3 S6（IME 検知時に曲を止める、既定 OFF）、decisions #35（Pause
// 要求は冪等。タブの切替は hidden と blur の 2 件）・#65（仮）、tests-inventory「M1 手順 2 Pause メニューと起動」。
// 動画なしの時計（M1 の S2）で、入力を状態機械に通して相を見る。

const T0 = -LEAD_MS
const key = (event: InputEvent): ControlInput => ({ kind: 'key', event })
const SPACE = key({ kind: 'role', role: 'primary', code: 'Space', tsPerf: 0 })
const ESC = key({ kind: 'role', role: 'pause', code: 'Escape', tsPerf: 0 })
const ENTER = key({ kind: 'role', role: 'confirm', code: 'Enter', tsPerf: 0 })
const pauseOf = (reason: 'blur' | 'hidden' | 'iframe'): ControlInput =>
  key({ kind: 'pause', reason, tsPerf: 0 })
const IME = key({ kind: 'ime', code: 'KeyA', tsPerf: 0 })
const OFF = { imeStop: false, t0: T0 }

/** 入力を順に効かせて、各入力の後の相を返す（now は入力ごとに 10 ms 進める） */
function phases(inputs: readonly ControlInput[], opts = OFF, start?: Session): PlayPhase[] {
  let s = start ?? initialSession({ mode: 'novideo', t0: T0 })
  let now = 1000
  const out: PlayPhase[] = []
  for (const i of inputs) {
    now += 10
    const r = controlStep(s, now, i, opts)
    if (r.step !== null) s = r.step.session
    out.push(s.play.phase)
  }
  return out
}

/** 開始して猶予を過ぎ、再生中になった session（now 2000） */
function playing(): Session {
  const s = restartSession(T0, 1000).session
  const r = sessionTick(s, 1000 + GRACE_MS + 1, null)
  expect(r.session.play.phase).toBe('playing')
  return r.session
}

describe('Space（開始・再開）と Escape（一時停止）', () => {
  it('待機 → Space で同期中（猶予 300 ms）→ 猶予の後に再生 → Escape で一時停止 → Space で同期中', () => {
    expect(phases([SPACE])).toEqual(['syncing'])
    const p = playing()
    expect(phases([ESC, SPACE], OFF, p)).toEqual(['paused', 'syncing'])
  })

  it('再生中の Space、待機中の Escape は何もしない（null）', () => {
    expect(controlOf('playing', SPACE, OFF)).toBe(null)
    expect(phases([ESC])).toEqual(['idle'])
  })

  it('一時停止中の Escape は一時停止のまま（冪等。やめるはメニューから、#65）', () => {
    expect(phases([ESC, ESC, ESC], OFF, playing())).toEqual(['paused', 'paused', 'paused'])
  })

  it('Enter・押下・離し・帯は扱わない（Enter は殻が焦点のボタンを押す）', () => {
    for (const i of [
      ENTER,
      key({ kind: 'press', code: 'KeyA', tsPerf: 0, lag: null }),
      key({ kind: 'release', code: 'KeyA', tsPerf: 0, forced: false }),
      key({ kind: 'imeBand', on: true, code: 'KeyA', tsPerf: 0 }),
    ])
      expect(controlOf('playing', i, OFF)).toBe(null)
  })
})

describe('blur・非表示・iframe の Pause 要求（#35、手順 7 で検算済の遷移を S2 の入力から）', () => {
  it('待機中の pause iframe → 待機のまま（click-to-play の click）', () => {
    expect(phases([pauseOf('iframe')])).toEqual(['idle'])
  })

  it('再生中の pause → 一時停止。一時停止中の hidden＋blur（タブの切替の 2 件）→ 一時停止のまま', () => {
    expect(phases([pauseOf('hidden'), pauseOf('blur')], OFF, playing())).toEqual([
      'paused',
      'paused',
    ])
  })

  it('同期中の hidden は一時停止へ（iframe だけ無視）', () => {
    const syncing = restartSession(T0, 1000).session
    expect(phases([pauseOf('iframe')], OFF, syncing)).toEqual(['syncing'])
    expect(phases([pauseOf('hidden')], OFF, syncing)).toEqual(['paused'])
  })
})

describe('IME 検知時に曲を止める（S6、既定 OFF）', () => {
  it('OFF: IME を検知しても曲は止めない（帯だけ）', () => {
    expect(controlOf('playing', IME, OFF)).toBe(null)
    expect(phases([IME], OFF, playing())).toEqual(['playing'])
  })

  it('ON: IME の検知で一時停止の要求（理由 ime）', () => {
    const on = { imeStop: true, t0: T0 }
    expect(controlOf('playing', IME, on)).toEqual({
      kind: 'play',
      event: { kind: 'pause', reason: 'ime' },
    })
    expect(phases([IME], on, playing())).toEqual(['paused'])
  })
})

describe('Pause メニュー（再開／最初から／やめる）', () => {
  it('再開 → 同期中（300 ms の猶予を通る）', () => {
    expect(phases([ESC, { kind: 'choice', choice: 'resume' }], OFF, playing())).toEqual([
      'paused',
      'syncing',
    ])
  })

  it('最初から → 新しい時計で t0 から開始（同期中）。前の回の t は持ち越さない', () => {
    const p = playing()
    const paused = controlStep(p, 5000, ESC, OFF).step?.session
    expect(paused?.play.phase).toBe('paused')
    const r = controlStep(paused ?? p, 6000, { kind: 'choice', choice: 'restart' }, OFF)
    expect(r.go).toBe(null)
    expect(r.step?.session.play.phase).toBe('syncing')
    expect(r.step?.out.t).toBe(T0)
    // 猶予の後は t0 から実時間で進む
    const later = sessionTick(r.step?.session ?? p, 6000 + 500, null)
    expect(later.out.t).toBeCloseTo(T0 + 500, 6)
  })

  it('やめる → S1（記録は保存しない）。状態機械には何も渡さない', () => {
    const r = controlStep(playing(), 5000, { kind: 'choice', choice: 'quit' }, OFF)
    expect(r).toEqual({ step: null, go: 'S1' })
  })
})

describe('案内の文言（相ごと）', () => {
  it('6 相すべてに文言がある', () => {
    for (const p of ['idle', 'syncing', 'playing', 'waiting', 'paused', 'ended'] as const)
      expect(PHASE_TEXT[p].length).toBeGreaterThan(0)
  })
})
