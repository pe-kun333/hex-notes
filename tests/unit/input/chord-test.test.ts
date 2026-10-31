import { describe, expect, it } from 'vitest'
import {
  ONBOARD_IDS,
  leaveStep,
  nextTutorial,
  secondsSince,
  startOnboard,
  tutorialKeyset,
} from '../../../src/app/onboard-flow.ts'
import {
  CHORD_GROUPS,
  CHORD_HOLD_MS,
  CHORD_TIMEOUT_MS,
  chordDone,
  chordHold,
  chordLimit,
  chordResultText,
  chordStep,
  chordTick,
  initialChordTest,
  type ChordOutcome,
  type ChordTestState,
} from '../../../src/input/chord-test.ts'

// src/input/chord-test.ts・src/app/onboard-flow.ts（M1-04、M1 の手順 9）。出どころ: design.md §2.4（10 組、上限 2・3・4）・
// §1.3 S0（「あとで」）、m6 S0b L258–267・renderS0 L727・ACT s0later L955–957、decisions #26（229 → ime）、m1-kickoff
// 手順 9 の期待値・§7-13・§7-14、tests-inventory「M1 手順 9」。

/** 今の組を押して保持（hold ms）し、全部離す。t は時刻（返り値は次の時刻） */
function play(s0: ChordTestState, t: number, hold: number): { s: ChordTestState; t: number } {
  const g = CHORD_GROUPS[s0.index]
  if (g === undefined) throw new Error('組が無い')
  let s = s0
  for (const code of g.codes) s = chordStep(s, { kind: 'press', code, tsPerf: (t += 10) })
  s = chordTick(s, (t += hold))
  for (const code of g.codes) s = chordStep(s, { kind: 'release', code, tsPerf: (t += 10) })
  return { s, t: t + 10 }
}

/** 組を 10 秒放って落とす */
function ghost(s0: ChordTestState, t: number): { s: ChordTestState; t: number } {
  return { s: chordTick(s0, t + CHORD_TIMEOUT_MS), t: t + CHORD_TIMEOUT_MS + 10 }
}

function run(plan: readonly ('pass' | 'ghost')[]): ChordTestState {
  let s = initialChordTest(0)
  let t = 0
  for (const p of plan) ({ s, t } = p === 'pass' ? play(s, t, CHORD_HOLD_MS) : ghost(s, t))
  return s
}

describe('同時押しテスト（§2.4、§7-13）', () => {
  it('10 組は 同段 3・和音 3・矩形 2・両手 2', () => {
    expect(CHORD_GROUPS.map((g) => g.kind)).toEqual(['row', 'row', 'row', 'chord', 'chord', 'chord', 'rect', 'rect', 'hands', 'hands'])
    expect(CHORD_GROUPS[1]?.codes).toEqual(['KeyA', 'KeyS', 'KeyD'])
    expect(CHORD_GROUPS[9]?.codes).toEqual(['KeyZ', 'KeyX', 'Comma', 'Period'])
  }) // prettier-ignore

  it('6 組通過＋矩形 1 組落ち → 3、10 組通過 → 4、同段 1 組落ち（他は全部通過）→ 2', () => {
    const p = 'pass' as const
    const three = run([p, p, p, p, p, p, 'ghost', p, p, p])
    expect(chordDone(three)).toBe(true)
    expect(chordLimit(three.results)).toBe(3)
    expect(chordResultText(three.results)).toBe('結果: 同段 3 組と和音 3 組を通過、矩形で 1 組落ちました → 上限 3。')
    const four = run(new Array(10).fill(p))
    expect([chordLimit(four.results), chordResultText(four.results)]).toEqual([4, '結果: 10 組すべて通過しました → 上限 4。'])
    const two = run(['ghost', p, p, p, p, p, p, p, p, p])
    expect([chordLimit(two.results), chordResultText(two.results)]).toEqual([2, '結果: 同段で 1 組落ちました → 上限 2。'])
    // 両手だけ落ち → 3
    expect(chordLimit([p, p, p, p, p, p, p, p, p, 'fail'])).toBe(3)
    // 未完了の組は落ちと同じ
    expect(chordLimit([p, p, p, p, p])).toBe(2)
  }) // prettier-ignore

  it('999 ms で離す → 通過でない（落ち）。1,000 ms ちょうどで通過', () => {
    expect(play(initialChordTest(0), 0, CHORD_HOLD_MS - 1).s.results).toEqual(['fail'])
    expect(play(initialChordTest(0), 0, CHORD_HOLD_MS).s.results).toEqual(['pass'])
  })

  it('組の外の鍵 → 落ち。揃う前の離しは数えず、揃った時刻から数え直す', () => {
    let s = initialChordTest(0)
    s = chordStep(s, { kind: 'press', code: 'KeyZ', tsPerf: 10 })
    s = chordStep(s, { kind: 'press', code: 'KeyV', tsPerf: 20 })
    expect(s.results).toEqual(['fail'])
    let u = initialChordTest(0)
    u = chordStep(u, { kind: 'press', code: 'KeyZ', tsPerf: 10 })
    u = chordStep(u, { kind: 'release', code: 'KeyZ', tsPerf: 20 })
    for (const [code, t] of [['KeyZ', 30], ['KeyX', 40], ['KeyC', 50]] as const) u = chordStep(u, { kind: 'press', code, tsPerf: t })
    expect([u.results, u.since]).toEqual([[], 50])
    expect(chordHold(u, 550)).toBe(0.5)
    expect(chordTick(u, 1049).results).toEqual([])
    expect(chordTick(u, 1050).results).toEqual(['pass'])
  }) // prettier-ignore

  it('次の組は前の組の鍵が全部離れてから始める（残った鍵を余分に数えない）、10 秒は始まりから', () => {
    let s = initialChordTest(0)
    for (const code of ['KeyZ', 'KeyX', 'KeyC'])
      s = chordStep(s, { kind: 'press', code, tsPerf: 10 })
    s = chordTick(s, 1010)
    expect([s.index, s.startedAt]).toEqual([1, null])
    s = chordStep(s, { kind: 'release', code: 'KeyZ', tsPerf: 1100 })
    s = chordStep(s, { kind: 'press', code: 'KeyQ', tsPerf: 1150 })
    expect(s.results).toEqual(['pass'])
    s = chordStep(s, { kind: 'release', code: 'KeyQ', tsPerf: 1160 })
    s = chordStep(s, { kind: 'release', code: 'KeyX', tsPerf: 1170 })
    s = chordStep(s, { kind: 'release', code: 'KeyC', tsPerf: 1200 })
    expect(s.startedAt).toBe(1200)
    expect(chordTick(s, 1200 + CHORD_TIMEOUT_MS - 1).results).toEqual(['pass'])
    expect(chordTick(s, 1200 + CHORD_TIMEOUT_MS).results).toEqual(['pass', 'fail'])
  })

  it('最初の keydown が 229（ime）→ 同じ組のまま、揃いと 10 秒を数え直す（IME の間も止まらない）', () => {
    let s = initialChordTest(0)
    s = chordStep(s, { kind: 'press', code: 'KeyZ', tsPerf: 10 })
    s = chordStep(s, { kind: 'ime', tsPerf: 9000 })
    expect([s.index, s.results, s.startedAt, s.since]).toEqual([0, [], 9000, null])
    expect(chordTick(s, 9000 + CHORD_TIMEOUT_MS - 1).results).toEqual([])
  })

  it('終わった後の事象は何もしない', () => {
    const done = run(new Array(10).fill('pass'))
    expect(chordStep(done, { kind: 'press', code: 'KeyA', tsPerf: 1 })).toBe(done)
    expect(chordTick(done, 1e9)).toBe(done)
    const empty: ChordOutcome[] = []
    expect(chordResultText(empty)).toMatch(/→ 上限 2。$/)
  })
})

describe('初回導線の段（§1.3 S0、§7-14）', () => {
  it('段を閉じると次の段へ、秒は 0.1 秒に丸め、「あとで」は left 真', () => {
    let s = startOnboard(1000)
    const rows = []
    for (const [now, left] of [
      [13_460, false],
      [20_000, true],
      [50_049, false],
      [80_000, true],
    ] as const) {
      const r = leaveStep(s, now, left)
      rows.push(r.row)
      s = r.state
    }
    expect(rows).toEqual([
      { step: 'S0a', seconds: 12.5, left: false },
      { step: 'S0b', seconds: 6.5, left: true },
      { step: 'S0c', seconds: 30, left: false },
      { step: 'S0d', seconds: 30, left: true },
    ])
    expect(s.step).toBe(4)
    expect(ONBOARD_IDS).toEqual(['S0a', 'S0b', 'S0c', 'S0d'])
    expect(secondsSince(5, 0)).toBe(0)
  })

  it('チュートリアル曲の段階: D だけ → ホームポジション → 全鍵 → 終わり（S3）', () => {
    const t0 = { stage: 0, enteredAt: 1 }
    const t1 = nextTutorial(t0)
    const t2 = t1 === null ? null : nextTutorial(t1)
    expect([tutorialKeyset(t0), t1 && tutorialKeyset(t1), t2 && tutorialKeyset(t2)]).toEqual([
      'd',
      'dfjk',
      'all',
    ])
    expect(t2 === null ? 'x' : nextTutorial(t2)).toBe(null)
    expect(t2?.enteredAt).toBe(1)
  })
})
