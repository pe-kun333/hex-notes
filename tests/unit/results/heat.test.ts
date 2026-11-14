import { describe, expect, it } from 'vitest'
import type { ClockMap } from '../../../src/clock/types.ts'
import {
  beginnerRules,
  initialJudge,
  judgePress,
  judgeRewind,
  judgeWaitHit,
  neighborOf,
  rulesOf,
  type JudgeNote,
  type JudgeOutcome,
  type JudgeState,
} from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { KEY_CODES, keyPosition } from '../../../src/layout/presets.ts'
import {
  EMPTY_HEAT,
  dirIndexOf,
  heatAdd,
  heatAddAll,
  heatStats,
  heatSummary,
  waitTargetOf,
  type Heat,
} from '../../../src/results/heat.ts'

// src/results/heat.ts と、判定の事象に足した 2 つの欄（stray の target、待ちで当てた音の untimed）。出どころ:
// docs/planning/m4-kickoff.md 手順 1 の期待値 (1)(2)・§7-7、m4-practice recordDir L440・誤打の相手 L448、decisions #120。
// 時計は恒等の写像。dt は 押した − 着地（正が遅れ）。

const ID: ClockMap = { a: 1, b: 0 }
const STOP: ClockMap = { a: 0, b: 5000 }
let seq = 0
function note(code: string, tLandMs: number): JudgeNote {
  return { index: seq++, code, midi: 60, tLandMs, tEndMs: tLandMs + 250, hold: false }
}
function press(s: JudgeState, code: string, ts: number, map: ClockMap = ID) {
  return judgePress(s, { code, tsPerf: ts }, { map, now: ts })
}
const POS = new Map(KEY_CODES.map((c) => [c, keyPosition(c) ?? { row: -9, col: -9 }]))
/** 入門者・隣は六角距離 1（実際の鍵の位置） */
const beginner = () => beginnerRules({ neighbor: neighborOf(POS) })
/** 音ゲー向け（NEAR なし） */
const gamer = () => rulesOf(PROFILES.gamer, { neighbor: neighborOf(POS) })

describe('判定の事象に足した欄', () => {
  it('空打ちの相手: GOOD の窓の中の未判定の音のうち一番近い音（鍵を問わない）', () => {
    const d = note('KeyD', 1000)
    const f = note('KeyF', 1100)
    const s0 = initialJudge([d, f], beginnerRules())
    // KeyG は D から 90 ms、F から 10 ms（隣なしの規則なので空打ち）
    expect(press(s0, 'KeyG', 1090).out).toEqual([
      {
        kind: 'stray',
        code: 'KeyG',
        tsPerf: 1090,
        reason: 'window',
        target: { index: f.index, code: 'KeyF' },
      },
    ])
  })

  it('同じ近さなら先の音。窓の中に音が無ければ target を付けない', () => {
    const a = note('KeyD', 1000)
    const b = note('KeyF', 1100)
    const s0 = initialJudge([a, b], beginnerRules())
    expect(press(s0, 'KeyJ', 1050).out[0]).toMatchObject({ target: { index: a.index } })
    expect(press(s0, 'KeyJ', 3000).out).toEqual([
      { kind: 'stray', code: 'KeyJ', tsPerf: 3000, reason: 'window' },
    ])
  })

  it('判定済みの音は相手にしない。止まった時計の空打ちは target を付けない', () => {
    const a = note('KeyD', 1000)
    const b = note('KeyF', 1050)
    const s0 = initialJudge([a, b], beginnerRules())
    const s1 = press(s0, 'KeyD', 1000).state
    expect(press(s1, 'KeyJ', 1010).out[0]).toMatchObject({
      target: { index: b.index, code: 'KeyF' },
    })
    expect(press(s0, 'KeyJ', 1000, STOP).out).toEqual([
      { kind: 'stray', code: 'KeyJ', tsPerf: 1000, reason: 'stopped' },
    ])
  })

  it('待ちで当てた音は untimed（dtMs は 0 で埋めた値）。ふつうの当たりには付けない', () => {
    const a = note('KeyD', 1000)
    const s0 = initialJudge([a], beginnerRules())
    expect(judgeWaitHit(s0, a.index, { tainted: false }).out[0]).toMatchObject({
      kind: 'hit',
      dtMs: 0,
      untimed: true,
    })
    expect(press(s0, 'KeyD', 1010).out[0]).not.toHaveProperty('untimed')
  })
})

describe('誤打の向き dirIndexOf（期待値 (1)、node で検算）', () => {
  it('狙い KeyD: F → R、C → DR、X → DL、S → L、E → UL、R → UR', () => {
    expect(
      ['KeyF', 'KeyC', 'KeyX', 'KeyS', 'KeyE', 'KeyR'].map((c) => dirIndexOf('KeyD', c)),
    ).toEqual([0, 1, 2, 3, 4, 5])
  })
  it('KeyW・KeyG は距離 2、KeyJ は距離 4 で隣でない（-1）。40 個の外は null', () => {
    expect(dirIndexOf('KeyD', 'KeyW')).toBe(-1)
    expect(dirIndexOf('KeyD', 'KeyG')).toBe(-1)
    expect(dirIndexOf('KeyD', 'KeyJ')).toBe(-1)
    expect(dirIndexOf('KeyD', 'Space')).toBeNull()
  })
})

const hit = (noteCode: string, code: string, grade: 'perfect' | 'great' | 'good' | 'near', dtMs: number): JudgeOutcome => ({
  kind: 'hit', index: 0, grade, dtMs, code, noteCode, self: 'solo',
}) // prettier-ignore

describe('heatAdd・heatStats', () => {
  it('NEAR は押した鍵の向きを狙いの鍵に足す（ずれには入れない）', () => {
    const h = heatAdd(EMPTY_HEAT, hit('KeyD', 'KeyF', 'near', 12))
    expect(heatStats(h).get('KeyD')).toEqual({
      dirs: [1, 0, 0, 0, 0, 0],
      other: 0,
      n: 0,
      meanMs: null,
      sdMs: null,
    })
  })

  it('期待値 (2): ＋10・＋30 → 平均 ＋20・SD 14.14。1 つだけ → 平均だけ', () => {
    const h = heatAddAll(EMPTY_HEAT, [hit('KeyD', 'KeyD', 'perfect', 10), hit('KeyD', 'KeyD', 'good', 30), hit('KeyF', 'KeyF', 'great', 12)])
    const st = heatStats(h)
    expect(st.get('KeyD')?.meanMs).toBe(20)
    expect(st.get('KeyD')?.sdMs).toBeCloseTo(14.142, 3)
    expect(st.get('KeyF')).toMatchObject({ n: 1, meanMs: 12, sdMs: null })
  }) // prettier-ignore

  it('miss・待ちで当てた音（untimed）・skipped・holdEnd は足さない（同じ物を返す）', () => {
    const evs: JudgeOutcome[] = [
      { kind: 'miss', index: 0, noteCode: 'KeyD' },
      { ...hit('KeyD', 'KeyD', 'perfect', 0), untimed: true } as JudgeOutcome,
      { kind: 'skipped', index: 0 },
      { kind: 'holdEnd', index: 0, result: 'ok' },
    ]
    for (const e of evs) expect(heatAdd(EMPTY_HEAT, e)).toBe(EMPTY_HEAT)
  })

  it('空打ち: 相手があれば向き、隣でなければ other。stopped と相手なしは数えない', () => {
    const t = { index: 0, code: 'KeyD' }
    const h = heatAddAll(EMPTY_HEAT, [
      { kind: 'stray', code: 'KeyE', tsPerf: 0, reason: 'window', target: t },
      { kind: 'stray', code: 'KeyJ', tsPerf: 0, reason: 'window', target: t },
      { kind: 'stray', code: 'KeyE', tsPerf: 0, reason: 'stopped' },
      { kind: 'stray', code: 'KeyE', tsPerf: 0, reason: 'window' },
    ])
    expect(heatStats(h).get('KeyD')).toMatchObject({ dirs: [0, 0, 0, 0, 1, 0], other: 1 })
    expect(heatSummary(heatStats(h))).toEqual({ keys: 1, wrong: 2, other: 1, timing: 0 })
  })

  it('待ちの間の鍵違い: 待っている音のうち押した鍵に一番近い鍵を相手にする（同じ近さなら先）', () => {
    expect(waitTargetOf('KeyF', ['KeyJ', 'KeyD'])).toBe('KeyD')
    expect(waitTargetOf('KeyF', ['KeyD', 'KeyG'])).toBe('KeyD')
    expect(waitTargetOf('KeyF', [])).toBeNull()
    const h = heatAdd(EMPTY_HEAT, { kind: 'waitWrong', code: 'KeyF', waiting: ['KeyJ', 'KeyD'] })
    expect(heatStats(h).get('KeyD')?.dirs).toEqual([1, 0, 0, 0, 0, 0])
  })
})

describe('判定層と通して（§7-7）', () => {
  function run(s0: JudgeState, presses: [string, number][], heat: Heat = EMPTY_HEAT) {
    let s = s0
    let h = heat
    for (const [code, ts] of presses) {
      const j = press(s, code, ts)
      s = j.state
      h = heatAddAll(h, j.out)
    }
    return { s, h }
  }

  it('音ゲー向け（NEAR なし）でも、窓の中の隣の鍵の誤打は扇に入る', () => {
    const s0 = initialJudge([note('KeyD', 1000)], gamer())
    const { h } = run(s0, [['KeyF', 1010]])
    expect(heatStats(h).get('KeyD')?.dirs).toEqual([1, 0, 0, 0, 0, 0])
  })

  it('入門者の NEAR（右隣で当てた）も同じ扇に入る', () => {
    const s0 = initialJudge([note('KeyD', 1000)], beginner())
    const { h } = run(s0, [['KeyF', 1010]])
    expect(heatStats(h).get('KeyD')).toMatchObject({ dirs: [1, 0, 0, 0, 0, 0], n: 0 })
  })

  it('ループ: 巻き戻しの後の周も足す（回の終わりの状態からは作らない）', () => {
    const s0 = initialJudge([note('KeyD', 1000)], beginnerRules())
    const a = run(s0, [['KeyD', 1010]])
    const back = judgeRewind(a.s, 0).state
    const b = run(back, [['KeyD', 1030]], a.h)
    expect(heatStats(b.h).get('KeyD')).toMatchObject({ n: 2, meanMs: 20 })
  })

  it('台帳 (4): ループを 3 周、各周で同じ鍵に隣の誤打 1 回 → 誤打 3 回（回の終わりの状態なら 1 回）', () => {
    let s = initialJudge([note('KeyD', 1000), note('KeyF', 1500)], gamer())
    let h: Heat = EMPTY_HEAT
    for (let lap = 0; lap < 3; lap++) {
      const r = run(
        s,
        [
          ['KeyE', 1005],
          ['KeyF', 1500],
        ],
        h,
      )
      h = r.h
      s = lap < 2 ? judgeRewind(r.s, 0).state : r.s
    }
    expect(heatStats(h).get('KeyD')).toMatchObject({ dirs: [0, 0, 0, 0, 3, 0], other: 0 })
    expect(heatStats(h).get('KeyF')).toMatchObject({ n: 3, meanMs: 0 })
  })
})
