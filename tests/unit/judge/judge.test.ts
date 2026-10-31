import { describe, expect, it } from 'vitest'
import type { ClockEvent, ClockMap } from '../../../src/clock/types.ts'
import {
  END_TAIL_MS,
  MISS_MARGIN_MS,
  beginnerRules,
  endAtMs,
  initialJudge,
  isComplete,
  judgeClock,
  judgePress,
  judgeRelease,
  judgeRewind,
  judgeSweep,
  judgeWaitHit,
  neighborOf,
  resultsByIndex,
  rulesOf,
  summarizeJudge,
  timingSamples,
  type JudgeClock,
  type JudgeNote,
  type JudgeOutcome,
  type JudgeRules,
  type JudgeState,
} from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { gauss, mulberry32 } from '../../../src/shared/random.ts'

// src/judge/judge.ts。出どころ: design.md §2.3・§2.6、m1' `judge` L318–324・`releaseHold` L327・`onKey` L330–341、
// m3 `resync` L376–382、kickoff §7-16 と手順 8 の期待値、decisions #25・#33・#38〜#40（仮）。
// 時計は既定で恒等の写像（t ＝ perf、a 1・b 0）。dt は 押した − 着地（正が遅れ）。

const ID: ClockMap = { a: 1, b: 0 }
const STOP: ClockMap = { a: 0, b: 5000 }
const at = (now: number, map: ClockMap = ID): JudgeClock => ({ map, now })

let seq = 0
function note(code: string, tLandMs: number, over: Partial<JudgeNote> = {}): JudgeNote {
  return { index: seq++, code, midi: 60, tLandMs, tEndMs: tLandMs + 250, hold: false, ...over }
}

/** A・S・D が横に並ぶ（A–S、S–D が隣） */
const ROW = new Map([
  ['KeyA', { row: 2, col: 0 }],
  ['KeyS', { row: 2, col: 1 }],
  ['KeyD', { row: 2, col: 2 }],
  ['KeyW', { row: 1, col: 1 }],
])
const NEAR = neighborOf(ROW)

function beginner(over: Partial<JudgeRules> = {}): JudgeRules {
  return beginnerRules({ neighbor: NEAR, ...over })
}

function press(s: JudgeState, code: string, ts: number, now = ts, map = ID) {
  return judgePress(s, { code, tsPerf: ts }, at(now, map))
}

const kinds = (out: JudgeOutcome[]): string[] => out.map((o) => o.kind)

describe('押下の判定 judgePress', () => {
  it('入門者: 遅れ側 −30 ms（dt ＋30）→ perfect、−235 ms → 窓の外の空打ち、後で miss', () => {
    const s0 = initialJudge([note('KeyA', 1000)], beginner())
    const a = press(s0, 'KeyA', 1030)
    expect(a.out).toMatchObject([{ kind: 'hit', grade: 'perfect', dtMs: 30, code: 'KeyA' }])
    const b = press(s0, 'KeyA', 1235)
    expect(b.out).toMatchObject([{ kind: 'stray', reason: 'window' }])
    expect(kinds(judgeSweep(b.state, at(1285)).out)).toEqual(['miss'])
  })

  it('早い側の窓の外（−181）は空打ち、−180 は good', () => {
    const s0 = initialJudge([note('KeyA', 1000)], beginner())
    expect(press(s0, 'KeyA', 819).out).toMatchObject([{ kind: 'stray' }])
    expect(press(s0, 'KeyA', 820).out).toMatchObject([{ kind: 'hit', grade: 'good', dtMs: -180 }])
  })

  it("同じ鍵の音が 2 つ窓にあれば近い方（m1' onKey L334）、同じ近さなら先の音", () => {
    const s0 = initialJudge([note('KeyA', 1000), note('KeyA', 1200)], beginner())
    const near = press(s0, 'KeyA', 1120)
    expect(near.out).toMatchObject([{ kind: 'hit', grade: 'great', dtMs: -80 }])
    const [n0, n1] = near.state.notes
    expect(near.state.results[1]?.grade).toBe('great')
    expect(near.state.results[0]?.state).toBe('pending')
    expect(n1?.tLandMs).toBe(1200)
    expect(n0?.tLandMs).toBe(1000)
    const tie = press(s0, 'KeyA', 1100)
    expect(tie.out).toMatchObject([{ kind: 'hit', grade: 'great', dtMs: 100 }])
    expect(tie.state.results[0]?.grade).toBe('great')
  })

  it('NEAR: 入門者は隣の鍵を GOOD の窓内で押すと near。音ゲー向けは空打ち。窓の外は空打ち', () => {
    const notes = [note('KeyA', 1000)]
    const b = press(initialJudge(notes, beginner()), 'KeyS', 1050)
    expect(b.out).toMatchObject([
      { kind: 'hit', grade: 'near', dtMs: 50, code: 'KeyS', noteCode: 'KeyA' },
    ])
    expect(b.state.score.counts.near).toBe(1)
    const g = press(initialJudge(notes, rulesOf(PROFILES.gamer, { neighbor: NEAR })), 'KeyS', 1050)
    expect(g.out).toMatchObject([{ kind: 'stray', reason: 'window' }])
    expect(press(initialJudge(notes, beginner()), 'KeyS', 1234).out).toMatchObject([
      { grade: 'near' },
    ])
    expect(press(initialJudge(notes, beginner()), 'KeyS', 1235).out).toMatchObject([
      { kind: 'stray' },
    ])
    expect(press(initialJudge(notes, beginner()), 'KeyS', 820).out).toMatchObject([
      { grade: 'near' },
    ])
    expect(press(initialJudge(notes, beginner()), 'KeyS', 819).out).toMatchObject([
      { kind: 'stray' },
    ])
    // 隣でない鍵（A–D は距離 2）は空打ち
    expect(press(initialJudge(notes, beginner()), 'KeyD', 1000).out).toMatchObject([
      { kind: 'stray' },
    ])
  })

  it('同じ鍵の音があれば NEAR より先に取る（和音の隣り合う鍵）', () => {
    const s0 = initialJudge([note('KeyA', 1000), note('KeyS', 1100)], beginner())
    const r = press(s0, 'KeyS', 1000)
    expect(r.out).toMatchObject([{ kind: 'hit', grade: 'great', dtMs: -100, noteCode: 'KeyS' }])
    expect(r.state.results[0]?.state).toBe('pending')
  })

  it('NEAR の候補が 2 つなら近い方', () => {
    const s0 = initialJudge([note('KeyA', 1000), note('KeyD', 1150)], beginner())
    expect(press(s0, 'KeyS', 1100).out).toMatchObject([
      { kind: 'hit', grade: 'near', noteCode: 'KeyD' },
    ])
  })

  it('判定済みの音は取らない（2 度目の押下は次の音か空打ち）', () => {
    const s0 = initialJudge([note('KeyA', 1000)], beginner())
    const a = press(s0, 'KeyA', 1000)
    expect(press(a.state, 'KeyA', 1010).out).toMatchObject([{ kind: 'stray' }])
  })

  it('時計が止まっている（a ＝ 0）間の押下は判定しない（stray stopped）', () => {
    const s0 = initialJudge([note('KeyA', 1000)], beginner())
    expect(press(s0, 'KeyA', 1000, 1000, STOP).out).toMatchObject([
      { kind: 'stray', reason: 'stopped' },
    ])
  })

  it('判定は実時間: 再生レート 0.5（t ＝ 0.5·perf）で曲 ms 1000 の着地は実時間 2000、＋200 ms は good', () => {
    const half: ClockMap = { a: 0.5, b: 0 }
    const s0 = initialJudge([note('KeyA', 1000)], beginner())
    // 曲 ms の差なら 100（great）だが、実時間の差 200 で good
    expect(press(s0, 'KeyA', 2200, 2200, half).out).toMatchObject([
      { kind: 'hit', grade: 'good', dtMs: 200 },
    ])
    expect(kinds(judgeSweep(s0, at(2284, half)).out)).toEqual([])
    expect(kinds(judgeSweep(s0, at(2285, half)).out)).toEqual(['miss'])
  })

  it('譜面の軸へ換算する（sync offset 1.5 s・rate 1.02 で譜面 10200 ms は動画の 11500 ms）', () => {
    const s0 = initialJudge([note('KeyA', 10200)], beginner({ axis: { offset: 1.5, rate: 1.02 } }))
    expect(press(s0, 'KeyA', 11500).out).toMatchObject([{ kind: 'hit', grade: 'perfect' }])
    const d = press(s0, 'KeyA', 11520).out[0]
    expect(d?.kind === 'hit' && d.dtMs).toBeCloseTo(20, 9)
  })

  it('校正のオフセット −100（遅押し）: 1100 で押すと perfect、MISS は 1384 を過ぎてから', () => {
    const s0 = initialJudge([note('KeyA', 1000)], beginner({ offsetMs: -100 }))
    expect(press(s0, 'KeyA', 1100).out).toMatchObject([{ kind: 'hit', grade: 'perfect', dtMs: 0 }])
    expect(kinds(judgeSweep(s0, at(1384)).out)).toEqual([])
    expect(kinds(judgeSweep(s0, at(1385)).out)).toEqual(['miss'])
  })
})

describe('MISS の確定 judgeSweep（余裕 G）', () => {
  it('G 50: 遅れ側の窓の終わり 1234 から 50 ms 過ぎるまで待つ（1284 まだ、1285 で miss）', () => {
    expect(MISS_MARGIN_MS).toBe(50)
    const s0 = initialJudge([note('KeyA', 1000)], beginner())
    expect(kinds(judgeSweep(s0, at(1284)).out)).toEqual([])
    const m = judgeSweep(s0, at(1285))
    expect(m.out).toMatchObject([{ kind: 'miss', noteCode: 'KeyA' }])
    expect(m.state.results[0]).toMatchObject({ state: 'done', grade: 'miss', self: 'miss' })
    expect(isComplete(m.state)).toBe(true)
  })

  it('ハンドラに遅れて届いた押下（ts 1230、届いたのは 1282）を G が拾う。G 0 なら先に miss になり空打ち', () => {
    const s0 = initialJudge([note('KeyA', 1000)], beginner())
    const swept = judgeSweep(s0, at(1280))
    expect(kinds(swept.out)).toEqual([])
    expect(press(swept.state, 'KeyA', 1230, 1282).out).toMatchObject([
      { kind: 'hit', grade: 'good' },
    ])
    const z0 = initialJudge([note('KeyA', 1000)], beginner({ missMarginMs: 0 }))
    const z = judgeSweep(z0, at(1280))
    expect(kinds(z.out)).toEqual(['miss'])
    expect(press(z.state, 'KeyA', 1230, 1282).out).toMatchObject([{ kind: 'stray' }])
  })

  it('時計が止まっている間は miss にしない', () => {
    const s0 = initialJudge([note('KeyA', 1000)], beginner())
    expect(judgeSweep(s0, at(9000, STOP)).out).toEqual([])
  })

  it('miss の後は判定済みの音を飛ばして次の音を見る（from が進む）', () => {
    const s0 = initialJudge([note('KeyA', 1000), note('KeyS', 1500)], beginner())
    const m = judgeSweep(s0, at(1300))
    expect(m.state.from).toBe(1)
    expect(press(m.state, 'KeyS', 1500).out).toMatchObject([{ kind: 'hit', grade: 'perfect' }])
  })
})

describe('ホールド', () => {
  const holdNote = (): JudgeNote => note('KeyA', 1000, { tEndMs: 2000, hold: true })

  it('押すと holding。終点の 270 ms 前（1730）以後の離しは ok、1729 は early（入門者）', () => {
    const s0 = initialJudge([holdNote()], beginner())
    const h = press(s0, 'KeyA', 1000)
    expect(h.state.results[0]?.state).toBe('holding')
    const ok = judgeRelease(h.state, { code: 'KeyA', tsPerf: 1730, forced: false }, at(1730))
    expect(ok.out).toMatchObject([{ kind: 'holdEnd', result: 'ok' }])
    expect(ok.state.results[0]).toMatchObject({ state: 'done', grade: 'perfect', hold: 'ok' })
    const early = judgeRelease(h.state, { code: 'KeyA', tsPerf: 1729, forced: false }, at(1729))
    expect(early.out).toMatchObject([{ kind: 'holdEnd', result: 'early' }])
    // 早離しは判定（精度）を変えない
    expect(summarizeJudge(early.state).acc).toBe(1)
  })

  it('音ゲー向けの離し窓は 300 ms（1700 で ok、1699 で early）', () => {
    const s0 = initialJudge([holdNote()], rulesOf(PROFILES.gamer, { neighbor: NEAR }))
    const h = press(s0, 'KeyA', 1000)
    expect(
      judgeRelease(h.state, { code: 'KeyA', tsPerf: 1700, forced: false }, at(1700)).out,
    ).toMatchObject([{ result: 'ok' }])
    expect(
      judgeRelease(h.state, { code: 'KeyA', tsPerf: 1699, forced: false }, at(1699)).out,
    ).toMatchObject([{ result: 'early' }])
  })

  it('終点まで押し続ければ終点（2000）で ok で閉じる。後の離しは何もしない', () => {
    const s0 = initialJudge([holdNote()], beginner())
    const h = press(s0, 'KeyA', 1000)
    expect(judgeSweep(h.state, at(1999)).out).toEqual([])
    const done = judgeSweep(h.state, at(2000))
    expect(done.out).toMatchObject([{ kind: 'holdEnd', result: 'ok' }])
    expect(
      judgeRelease(done.state, { code: 'KeyA', tsPerf: 2100, forced: false }, at(2100)).out,
    ).toEqual([])
  })

  it('全離し（forced）は早離しとして採点しない。時計が止まっている間の離しも forced', () => {
    const s0 = initialJudge([holdNote()], beginner())
    const h = press(s0, 'KeyA', 1000)
    expect(
      judgeRelease(h.state, { code: 'KeyA', tsPerf: 1200, forced: true }, at(1200)).out,
    ).toMatchObject([{ result: 'forced' }])
    expect(
      judgeRelease(h.state, { code: 'KeyA', tsPerf: 1200, forced: false }, at(1200, STOP)).out,
    ).toMatchObject([{ result: 'forced' }])
    const sum = summarizeJudge(
      judgeRelease(h.state, { code: 'KeyA', tsPerf: 1200, forced: true }, at(1200)).state,
    )
    expect(sum.holds).toEqual({ ok: 0, early: 0, forced: 1 })
  })

  it('NEAR で取ったホールドは押した隣の鍵の離しで閉じる', () => {
    const s0 = initialJudge([holdNote()], beginner())
    const h = press(s0, 'KeyS', 1000)
    expect(h.state.results[0]).toMatchObject({ state: 'holding', grade: 'near', key: 'KeyS' })
    expect(
      judgeRelease(h.state, { code: 'KeyA', tsPerf: 1100, forced: false }, at(1100)).out,
    ).toEqual([])
    expect(
      judgeRelease(h.state, { code: 'KeyS', tsPerf: 1100, forced: false }, at(1100)).out,
    ).toMatchObject([{ result: 'early' }])
  })

  it('校正のオフセット −100 は離しにも効く（終点 2000・離し窓 270 で 1830 から ok、1829 は early）', () => {
    const s0 = initialJudge([holdNote()], beginner({ offsetMs: -100 }))
    const h = press(s0, 'KeyA', 1100)
    expect(h.out).toMatchObject([{ grade: 'perfect', dtMs: 0 }])
    expect(
      judgeRelease(h.state, { code: 'KeyA', tsPerf: 1830, forced: false }, at(1830)).out,
    ).toMatchObject([{ result: 'ok' }])
    expect(
      judgeRelease(h.state, { code: 'KeyA', tsPerf: 1829, forced: false }, at(1829)).out,
    ).toMatchObject([{ result: 'early' }])
    // 終点で閉じるのも同じ軸（2099 まだ、2100 で ok）
    expect(judgeSweep(h.state, at(2099)).out).toEqual([])
    expect(judgeSweep(h.state, at(2100)).out).toMatchObject([{ kind: 'holdEnd', result: 'ok' }])
  })

  it('ホールド中の音は再アンカー（seek）で skipped に書き換えない', () => {
    const s0 = initialJudge([holdNote(), note('KeyS', 1100)], beginner())
    const h = press(s0, 'KeyA', 1000).state
    expect(h.from).toBe(0)
    const seek: ClockEvent = {
      kind: 'resync',
      reason: 'seek',
      t: 1050,
      graceUntil: 1400,
      nominal: { a: 1, b: 1050 - 1100 },
    }
    const r = judgeClock(h, [seek], at(1100, seek.nominal))
    expect(r.out).toMatchObject([{ kind: 'skipped' }])
    expect(r.state.results[0]).toMatchObject({ state: 'holding', grade: 'perfect', skipped: false })
    expect(r.state.results[1]).toMatchObject({ state: 'done', skipped: true })
    expect(r.state.holds.get('KeyA')).toBe(0)
  })

  it('miss のホールドは holding にならない', () => {
    const s0 = initialJudge([holdNote()], beginner())
    const m = judgeSweep(s0, at(1300))
    expect(m.state.results[0]).toMatchObject({ state: 'done', grade: 'miss', hold: null })
    expect(m.state.holds.size).toBe(0)
  })
})

describe('猶予と skipped（judgeClock）', () => {
  // 再アンカー R ＝ 5000 で t ＝ T ＝ 3000（名目の写像 t ＝ perf − 2000）
  const R = 5000
  const nominal: ClockMap = { a: 1, b: -2000 }
  const resync = (graceUntil = R + 300): ClockEvent => ({
    kind: 'resync',
    reason: 'resume',
    t: 3000,
    graceUntil,
    nominal,
  })

  it('猶予内に窓が終わる音（着地 R＋50）は skipped、R＋70 は残る（相談 C・grace.ts と同じ境界）', () => {
    const s0 = initialJudge([note('KeyA', 3050), note('KeyS', 3070)], beginner())
    const r = judgeClock(s0, [resync()], at(R, nominal))
    expect(r.out).toMatchObject([{ kind: 'skipped' }])
    expect(r.state.results.map((x) => x.skipped)).toEqual([true, false])
    expect(r.state.inGrace).toBe(true)
  })

  it('校正のオフセットも効かせる: −100（遅押し）なら着地 R−30 の窓は R＋304 まで開くので skipped にしない', () => {
    const notes = [note('KeyA', 2970), note('KeyS', 2960)]
    const plain = judgeClock(initialJudge(notes, beginner()), [resync()], at(R, nominal))
    expect(plain.state.results.map((x) => x.skipped)).toEqual([true, true])
    const late = judgeClock(
      initialJudge(notes, beginner({ offsetMs: -100 })),
      [resync()],
      at(R, nominal),
    )
    // 着地の順に並べ直すので KeyS（2960 → R＋294 ≤ R＋300 で skipped）が先、KeyA（R＋304）は残る
    expect(late.state.notes.map((n) => n.code)).toEqual(['KeyS', 'KeyA'])
    expect(late.state.results.map((x) => x.skipped)).toEqual([true, false])
  })

  it('猶予中の押下は溜めて、猶予の終わりに tsPerf と今の写像で判定する（tsPerf の順に並べ直す）', () => {
    const s0 = initialJudge([note('KeyA', 3100), note('KeyS', 3150)], beginner())
    let st = judgeClock(s0, [resync()], at(R, nominal)).state
    const a = press(st, 'KeyS', R + 160, R + 160, nominal)
    expect(a.out).toMatchObject([{ kind: 'deferred' }])
    st = press(a.state, 'KeyA', R + 110, R + 170, nominal).state
    expect(st.deferred.map((d) => d.code)).toEqual(['KeyS', 'KeyA'])
    // 猶予中は miss にしない（今の写像が名目より 500 ms 先に進んでいても。KeyA の窓は今の写像では 4834 で終わっている）
    expect(judgeSweep(st, at(R + 250, { a: 1, b: -1500 })).out).toEqual([])
    expect(judgeSweep(st, at(R + 299, nominal)).out).toEqual([])
    const end = judgeClock(st, [{ kind: 'graceEnd' }], at(R + 300, nominal))
    expect(end.out).toMatchObject([
      { kind: 'hit', grade: 'perfect', dtMs: 10, noteCode: 'KeyA' },
      { kind: 'hit', grade: 'perfect', dtMs: 10, noteCode: 'KeyS' },
    ])
    expect(end.state.inGrace).toBe(false)
    expect(end.state.deferred).toEqual([])
  })

  it('猶予の終わりの前に次の再アンカーが来たら溜めた押下を捨てる', () => {
    const s0 = initialJudge([note('KeyA', 3400)], beginner())
    let st = judgeClock(s0, [resync()], at(R, nominal)).state
    st = press(st, 'KeyA', R + 100, R + 100, nominal).state
    const again = judgeClock(st, [resync(R + 450)], at(R + 150, nominal))
    expect(again.out).toMatchObject([{ kind: 'dropped', count: 1 }])
    expect(again.state.deferred).toEqual([])
  })

  it('猶予中に押して離したホールドは、猶予の終わりに押下と離しの順で判定する', () => {
    const s0 = initialJudge([note('KeyA', 3100, { tEndMs: 3800, hold: true })], beginner())
    let st = judgeClock(s0, [resync()], at(R, nominal)).state
    st = press(st, 'KeyA', R + 100, R + 100, nominal).state
    st = judgeRelease(
      st,
      { code: 'KeyA', tsPerf: R + 250, forced: false },
      at(R + 250, nominal),
    ).state
    const end = judgeClock(st, [{ kind: 'graceEnd' }], at(R + 300, nominal))
    expect(kinds(end.out)).toEqual(['hit', 'holdEnd'])
    expect(end.state.results[0]).toMatchObject({ state: 'done', hold: 'early' })
  })

  it('判定済みの音は再アンカーで戻さない（広告明けで t が 2.5 s 戻っても二度判定しない。m3 resync L379）', () => {
    const notes = [note('KeyA', 1000), note('KeyS', 1500), note('KeyD', 2000), note('KeyA', 4000)]
    let st = initialJudge(notes, beginner())
    st = press(st, 'KeyA', 1000).state
    st = judgeSweep(st, at(1800)).state // KeyS は miss
    st = press(st, 'KeyD', 2010).state
    const before = summarizeJudge(st)
    expect(before.counts).toMatchObject({ perfect: 2, miss: 1 })
    // 広告明け: 実時刻 8000 で t ＝ 1200（凍結の点）に戻る
    const back: ClockEvent = {
      kind: 'resync',
      reason: 'adEnd',
      t: 1200,
      graceUntil: 8300,
      nominal: { a: 1, b: 1200 - 8000 },
    }
    const r = judgeClock(st, [back], at(8000, back.nominal))
    expect(r.out).toEqual([])
    expect(r.state.results.slice(0, 3).map((x) => x.grade)).toEqual(['perfect', 'miss', 'perfect'])
    expect(summarizeJudge(r.state).counts).toEqual(before.counts)
    // 戻った後に同じ音（KeyA、t 1000 ＝ 実時刻 7800）を押しても判定しない（猶予の終わりに空打ち）
    const p = press(r.state, 'KeyA', 7800, 7800, back.nominal)
    expect(p.out).toMatchObject([{ kind: 'deferred' }])
    const end = judgeClock(p.state, [{ kind: 'graceEnd' }], at(8300, back.nominal))
    expect(end.out).toMatchObject([{ kind: 'stray', reason: 'window' }])
    expect(summarizeJudge(end.state).counts).toEqual(before.counts)
  })

  it('前へ飛ぶ seek の後、飛び越した未判定の音は skipped（精度の分母に入れない）', () => {
    const notes = [note('KeyA', 1000), note('KeyS', 2000), note('KeyD', 3000), note('KeyA', 20000)]
    let st = initialJudge(notes, beginner())
    st = press(st, 'KeyA', 1000).state
    const seek: ClockEvent = {
      kind: 'resync',
      reason: 'seek',
      t: 15000,
      graceUntil: 1500 + 300,
      nominal: { a: 1, b: 15000 - 1500 },
    }
    const r = judgeClock(st, [seek], at(1500, seek.nominal))
    expect(kinds(r.out)).toEqual(['skipped', 'skipped'])
    const sum = summarizeJudge(r.state)
    expect(sum.skipped).toBe(2)
    expect(sum.acc).toBe(1)
    expect(sum.counts).toMatchObject({ perfect: 1, miss: 0 })
  })
})

describe('自力率・点・まとめ', () => {
  it('ラベル両側 none なら当てた音は solo、出していれば hinted。miss は miss（4 区分）', () => {
    const notes = [note('KeyA', 1000), note('KeyS', 2000), note('KeyD', 3000)]
    let st = initialJudge(notes, beginner({ labels: { kb: 'none', note: 'none' } }))
    st = press(st, 'KeyA', 1000).state
    st = press(st, 'KeyA', 2000).state // 隣の NEAR
    st = judgeSweep(st, at(3400)).state
    expect(st.selfRate).toEqual({ solo: 1, hinted: 0, near: 1, miss: 1 })
    let h = initialJudge([note('KeyA', 1000)], beginner())
    h = press(h, 'KeyA', 1000).state
    expect(h.selfRate.hinted).toBe(1)
  })

  it('成績連動の α: 当てるたびに 0.12 下がり、α < 0.2 で solo になる', () => {
    const notes = Array.from({ length: 8 }, (_, k) => note('KeyA', 1000 + k * 1000))
    let st = initialJudge(notes, beginner())
    for (let k = 0; k < 8; k++) st = press(st, 'KeyA', 1000 + k * 1000).state
    expect(st.selfRate).toEqual({ solo: 1, hinted: 7, near: 0, miss: 0 })
    expect(st.fade.alpha[60]).toBe(0.04)
  })

  it('音ゲー向け: 9 回の miss でゲージ 0 → failed を 1 回だけ出す', () => {
    const notes = Array.from({ length: 10 }, (_, k) => note('KeyA', 1000 + k * 500))
    const st = initialJudge(notes, rulesOf(PROFILES.gamer, { neighbor: NEAR }))
    const m = judgeSweep(st, at(9000))
    expect(kinds(m.out).filter((k) => k === 'failed')).toEqual(['failed'])
    const sum = summarizeJudge(m.state)
    expect(sum.gamer).toMatchObject({ gauge: 0, failed: true, cleared: false, fullCombo: false })
  })

  it('まとめ: 精度・ランク・平均・UR は正しい鍵で当てた音だけ、NEAR 率は判定した音で割る', () => {
    const notes = [note('KeyA', 1000), note('KeyA', 2000), note('KeyA', 3000), note('KeyS', 4000)]
    let st = initialJudge(notes, beginner())
    st = press(st, 'KeyA', 1010).state // perfect（遅れ側の perfect は 31.2 まで）
    st = press(st, 'KeyA', 2040).state // great
    st = press(st, 'KeyA', 2950).state // great（早い側）
    st = press(st, 'KeyA', 4000).state // NEAR（dt 0 は時刻の標本に入れない）
    const sum = summarizeJudge(st)
    expect(timingSamples(st)).toEqual([10, 40, -50])
    expect(sum.meanMs).toBe(0)
    expect(sum.counts).toEqual({ perfect: 1, great: 2, good: 0, near: 1, miss: 0 })
    expect(sum.nearRate).toBe(0.25)
    expect(sum.acc).toBeCloseTo((1 + 0.7 + 0.7 + 0.4) / 4, 12)
    expect(sum.rank).toBe('C')
    expect(sum.gamer).toBeNull()
    expect(sum.sdMs).toBeCloseTo(Math.sqrt(2100), 12)
    expect(sum.ur).toBeCloseTo(Math.sqrt(2100) * 10, 9)
    expect(sum.hist).toStrictEqual({ '10': 1, '40': 1, '-50': 1 })
  })

  it('終了 ＝ 最終ノートの終わり＋1.2 秒。index で結果を引ける', () => {
    expect(END_TAIL_MS).toBe(1200)
    const notes = [note('KeyA', 1000, { tEndMs: 1250 }), note('KeyS', 900, { tEndMs: 2600 })]
    expect(endAtMs(notes)).toBe(3800)
    expect(endAtMs([])).toBe(1200)
    // 着地の順に並べ直す（index は保つ）
    const st = initialJudge(notes, beginner())
    expect(st.notes.map((n) => n.tLandMs)).toEqual([900, 1000])
    const p = press(st, 'KeyA', 1000).state
    const byIndex = resultsByIndex(p)
    expect(byIndex.get(notes[0]?.index ?? -1)?.grade).toBe('perfect')
    expect(byIndex.get(notes[1]?.index ?? -1)?.state).toBe('pending')
  })
})

describe('人工ジッタで精度が単調に下がる（§5.1 M0-06 の完了条件の下見。本測は手順 13）', () => {
  /** 4 鍵を 250 ms ごとに 200 音。種付きの揺れで自動に押す */
  function autoplay(sd: number, rules: JudgeRules, seed = 7): number {
    const codes = ['KeyA', 'KeyS', 'KeyD', 'KeyW']
    const notes = Array.from({ length: 200 }, (_, k) => ({
      index: k,
      code: codes[k % 4] ?? 'KeyA',
      midi: 60 + (k % 4),
      tLandMs: 1000 + k * 250,
      tEndMs: 1000 + k * 250 + 200,
      hold: false,
    }))
    const rnd = mulberry32(seed)
    const presses = notes
      .map((n) => ({ code: n.code, ts: n.tLandMs + gauss(rnd) * sd }))
      .sort((a, b) => a.ts - b.ts)
    let st = initialJudge(notes, rules)
    for (const p of presses) {
      st = judgeSweep(st, at(p.ts)).state
      st = press(st, p.code, p.ts).state
    }
    st = judgeSweep(st, at(1e6)).state
    return summarizeJudge(st).acc
  }

  it('入門者・音ゲー向けとも SD 0 → 5 → 10 → 20 → 40 → 80 ms で精度が下がり（同じ種）、10 ms からは真に下がる', () => {
    for (const rules of [beginner(), rulesOf(PROFILES.gamer, { neighbor: NEAR })]) {
      const accs = [0, 5, 10, 20, 40, 80].map((sd) => autoplay(sd, rules))
      expect(accs[0]).toBe(1)
      // 同じ種の揺れを SD 倍するので、どの音も |dt| は SD とともに増え、段は上がらない
      for (let k = 1; k < accs.length; k++) expect(accs[k]).toBeLessThanOrEqual(accs[k - 1] ?? 0)
      for (let k = 3; k < accs.length; k++) expect(accs[k]).toBeLessThan(accs[k - 1] ?? 0)
      expect(accs[2]).toBeLessThan(1)
    }
  })
})

describe('練習層の口（M2-03、M2 の手順 5。decisions #39 (c) の例外・#80）', () => {
  it('judgeWaitHit: perfect で記録し dt を持たない（ずれの標本に入れない）。tainted は自力率 miss、2 度目は何もしない', () => {
    const ns = [note('KeyA', 1000), note('KeyS', 1000)]
    let s = initialJudge(ns, beginner())
    const a = judgeWaitHit(s, ns[0]?.index ?? -1, { tainted: false })
    expect(kinds(a.out)).toEqual(['hit'])
    s = a.state
    s = judgeWaitHit(s, ns[1]?.index ?? -1, { tainted: true }).state
    expect([s.score.counts.perfect, timingSamples(s), s.selfRate]).toEqual([2, [], { solo: 0, hinted: 1, near: 0, miss: 1 }])
    expect(judgeWaitHit(s, ns[0]?.index ?? -1, { tainted: false }).state).toBe(s)
    expect(isComplete(s)).toBe(true)
  }) // prettier-ignore

  it('judgeRewind: 着地が境以上の判定済み・skipped を未判定に戻し、ホールド中は採点せずに閉じる。点・自力率は戻さない、from は数え直す', () => {
    const ns = [note('KeyA', 1000), note('KeyS', 2000), note('KeyD', 3000, { hold: true, tEndMs: 4000 })]
    let s = initialJudge(ns, beginner())
    s = press(s, 'KeyA', 1000).state
    s = press(s, 'KeyS', 2000).state
    s = press(s, 'KeyD', 3000).state
    expect(s.results.map((r) => r.state)).toEqual(['done', 'done', 'holding'])
    const r = judgeRewind(s, 2000)
    expect(r.state.results.map((x) => x.state)).toEqual(['done', 'pending', 'pending'])
    expect([r.state.from, r.state.holds.size, r.state.score.counts.perfect, r.state.selfRate.hinted]).toEqual([1, 0, 3, 3])
    expect(isComplete(r.state)).toBe(false)
    // 戻した音をもう一度当てられる
    const again = press(r.state, 'KeyS', 5000, 5000, { a: 1, b: -3000 })
    expect([again.state.results[1]?.grade, again.state.score.counts.perfect]).toEqual(['perfect', 4])
    // 境より前しか無ければ何も戻さない
    expect(judgeRewind(s, 9999).state.results.map((x) => x.state)).toEqual(['done', 'done', 'holding'])
  }) // prettier-ignore
})
