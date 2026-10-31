import { describe, expect, it } from 'vitest'
import {
  SCREEN_IDS,
  canGo,
  initialRoute,
  navigate,
  type Route,
  type ScreenId,
} from '../../../src/app/router.ts'

// src/app/router.ts（M1-13、M1 の手順 2）。出どころ: design.md §1.2（遷移図。S3・S4・S5・S6 から S1 へ戻れる）、§1.3 S6
// （全画面の歯車）、m6 `go` L627–642、decisions #65（S2 は歯車を出さない、仮）。

const at = (screen: ScreenId, back: ScreenId | null = null): Route => ({ screen, back })
const walk = (r: Route, ...to: (ScreenId | 'back')[]): Route => to.reduce(navigate, r)

describe('起動の行き先（§1.2「初回?」）', () => {
  it('初回なら S0、でなければ S1', () => {
    expect(initialRoute(true)).toEqual(at('S0'))
    expect(initialRoute(false)).toEqual(at('S1'))
  })
})

describe('§1.2 の遷移（M1 の部分）', () => {
  it('初回: S0 →（あとで）S1、S0 → S2（S0d）→ S3 → S1', () => {
    expect(walk(at('S0'), 'S1')).toEqual(at('S1'))
    expect(walk(at('S0'), 'S2', 'S3', 'S1')).toEqual(at('S1'))
  })

  it('2 回目以降: S1 → S2 → S3 →（もう一度）S2 →（やめる）S1', () => {
    expect(walk(at('S1'), 'S2', 'S3', 'S2', 'S1')).toEqual(at('S1'))
  })

  it('S3・S6 から S1 へ戻れる', () => {
    expect(canGo('S3', 'S1')).toBe(true)
    expect(walk(at('S1'), 'S6', 'back')).toEqual(at('S1'))
  })

  it('行けない先は同じ route を返す（S1 → S3、S2 → S6、S6 → S2 など）', () => {
    for (const [from, to] of [
      ['S1', 'S3'],
      ['S1', 'S0'],
      ['S2', 'S6'],
      ['S2', 'S0'],
      ['S6', 'S2'],
      ['S6', 'S1'],
    ] as const) {
      const r = at(from)
      expect(navigate(r, to)).toBe(r)
    }
    const r = at('S1')
    expect(navigate(r, 'back')).toBe(r)
  })
})

describe('S6（全画面の歯車。来た画面へ戻る）', () => {
  it('S0・S1・S3 の歯車から入り、戻ると来た画面', () => {
    for (const from of ['S0', 'S1', 'S3'] as const) {
      const r = navigate(at(from), 'S6')
      expect(r).toEqual(at('S6', from))
      expect(navigate(r, 'back')).toEqual(at(from))
    }
  })

  it('S2 は歯車を出さない（プレイ中に設定へ行くと曲が宙に浮く、#65）', () => {
    expect(canGo('S2', 'S6')).toBe(false)
  })

  it('戻る先が無ければ S1。S6 → S0 は端末プロファイルの初期化（M1-07）', () => {
    expect(navigate(at('S6'), 'back')).toEqual(at('S1'))
    expect(navigate(at('S6', 'S3'), 'S0')).toEqual(at('S0'))
  })

  it('どの画面からも S6 以外への移動で back は消える', () => {
    for (const from of SCREEN_IDS)
      for (const to of SCREEN_IDS) {
        if (to === 'S6' || !canGo(from, to)) continue
        expect(navigate(at(from, 'S3'), to).back).toBe(null)
      }
  })
})
