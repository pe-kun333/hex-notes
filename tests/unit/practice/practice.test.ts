import { describe, expect, it } from 'vitest'
import { buildMsTable } from '../../../src/chart/mstable.ts'
import { barStartBeat, barStartMs, phraseOfBar } from '../../../src/practice/bars.ts'
import {
  initialLoop,
  loopLimitMs,
  loopMiss,
  loopPhraseEnd,
  loopSeekMs,
  loopWrap,
  setLoop,
  type LoopState,
} from '../../../src/practice/loop.ts'
import {
  TEMPO_NOVIDEO,
  TEMPO_VIDEO,
  isCorrect,
  nearestStep,
  rateChangeSafe,
  tempoAfter,
} from '../../../src/practice/tempo.ts'
import {
  PHRASE_GAP_MS,
  effectiveMode,
  initialWait,
  waitCheck,
  waitPress,
  waitRelease,
  type WaitNote,
} from '../../../src/practice/wait.ts'
import { barOf } from '../../../src/results/analysis.ts'
import type { Pulse } from '../../../src/shared/types.ts'

// src/practice/（M2-03 前半、M2 の手順 5）。出どころ: m2-kickoff 手順 5 の期待値・§7-3・§7-10・§7-11、design.md §2.7「音待ち／
// フレーズ待ち」「自動ループ」「テンポ段」、decisions #80・#81・#87、m4 L410–417・L431–435・L471–480、tests-inventory
// 「M2 手順 5」。回を通す形（時計・判定と合わせる）は tests/unit/app/practice-runner.test.ts。

/** きらきら星の拍（96 BPM、1 拍 625 ms、timeSig 無し ＝ 4/4） */
const PULSE: Pulse = { resolution: 240, tempo: [{ beat: 0, bpm: 96 }] }
const MS = buildMsTable(PULSE)
const note = (index: number, beat: number, code = 'KeyA'): WaitNote => ({
  index,
  code,
  tLandMs: MS.beatToMs(beat),
  group: beat * 240,
})

describe('小節とフレーズ（barOf の逆、フレーズ ＝ 2 小節）', () => {
  it('4/4: 小節 3 の頭は拍 8（5,000 ms）、小節 7 は拍 24（15,000 ms）。フレーズ 1 ＝ 小節 3〜4', () => {
    expect([barStartBeat(PULSE, 3), barStartMs(MS, PULSE, 3), barStartMs(MS, PULSE, 7)]).toEqual([8, 5000, 15000])
    expect([phraseOfBar(1), phraseOfBar(2), phraseOfBar(3), phraseOfBar(4), phraseOfBar(5)]).toEqual([0, 0, 1, 1, 2])
  }) // prettier-ignore

  it('拍子が途中で変わっても barOf と往復する（4/4 → 拍 10 から 3/4。半端な小節も 1 つ）', () => {
    const p: Pulse = { ...PULSE, timeSig: [{ beat: 0, num: 4, den: 4 }, { beat: 10, num: 3, den: 4 }] }
    expect([1, 2, 3, 4, 5].map((b) => barStartBeat(p, b))).toEqual([0, 4, 8, 10, 13])
    for (const b of [1, 2, 3, 4, 5, 6]) expect(barOf(p, barStartBeat(p, b))).toBe(b)
  }) // prettier-ignore
})

describe('待ち wait.ts（§7-3、decisions #80）', () => {
  const notes = [note(0, 0), note(1, 4, 'KeyG'), note(2, 4, 'KeyJ'), note(3, 8, 'KeyH'), note(4, 9)]
  const all = (): boolean => true

  it('音待ち: 着地に達した tick の組で止まる。正しい鍵 2 つで揃い、t ＝ 着地 − 300·rate（rate 1／0.75／1.25）', () => {
    let s = initialWait('note', notes, PULSE)
    expect(waitCheck(s, notes, (i) => i > 0, 2499).stop).toBe(false)
    const c = waitCheck(s, notes, (i) => i > 0, 2510)
    expect([c.stop, c.state.group, c.state.waits]).toEqual([true, { landMs: 2500, notes: [{ index: 1, code: 'KeyG' }, { index: 2, code: 'KeyJ' }] }, 1])
    s = c.state
    // 止まっている間は次の組を探さない
    expect(waitCheck(s, notes, all, 9000).stop).toBe(false)
    const p1 = waitPress(s, 'KeyG')
    expect(p1.press).toEqual({ kind: 'hit', index: 1, tainted: false, done: false })
    expect(waitRelease(p1.state, 0, 1).release).toBeNull()
    // 当てた鍵をもう一度は何もしない
    expect(waitPress(p1.state, 'KeyG').press).toEqual({ kind: 'none' })
    const p2 = waitPress(p1.state, 'KeyJ')
    expect(p2.press).toEqual({ kind: 'hit', index: 2, tainted: false, done: true })
    for (const [rate, t] of [[1, 2200], [0.75, 2275], [1.25, 2125]] as const) {
      const r = waitRelease(p2.state, 0, rate)
      expect(r.release).toEqual({ t, landMs: 2500 })
      expect(r.state.group).toBeNull()
    }
  }) // prettier-ignore

  it('鍵違い → tainted（後で当てても tainted を渡す）。組の外の鍵だけが鍵違い', () => {
    const s = waitCheck(initialWait('note', notes, PULSE), notes, (i) => i === 3, 5000).state
    const w = waitPress(s, 'KeyZ')
    expect([w.press, w.state.tainted]).toEqual([{ kind: 'wrong' }, true])
    expect(waitPress(w.state, 'KeyH').press).toEqual({ kind: 'hit', index: 3, tainted: true, done: true })
  }) // prettier-ignore

  it('フレーズ待ち: フレーズ 1（小節 3、拍 8、t 5,000）の頭で止まり、フレーズ 0 では止まらない。解除は 250 ms の空白の後 t 4,700', () => {
    let s = initialWait('phrase', notes, PULSE)
    expect([...(s.targets ?? [])]).toEqual([5000])
    expect(waitCheck(s, notes, all, 2600).stop).toBe(false)
    s = waitCheck(s, notes, (i) => i >= 3, 5010).state
    s = waitPress(s, 'KeyH').state
    const a = waitRelease(s, 1000, 1)
    expect([a.release, a.state.releaseAt]).toEqual([null, 1000 + PHRASE_GAP_MS])
    expect(waitRelease(a.state, 1249, 1).release).toBeNull()
    // 空白の間の押下は何もしない
    expect(waitPress(a.state, 'KeyZ').press).toEqual({ kind: 'none' })
    expect(waitRelease(a.state, 1250, 1).release).toEqual({ t: 4700, landMs: 5000 })
  }) // prettier-ignore

  it('固定テンポは止まらない。源が動画なら常に固定テンポ', () => {
    expect(waitCheck(initialWait('fixed', notes, PULSE), notes, all, 9000).stop).toBe(false)
    expect([effectiveMode('note', 'video'), effectiveMode('phrase', 'video'), effectiveMode('note', 'novideo')]).toEqual(['fixed', 'fixed', 'note'])
  }) // prettier-ignore
})

describe('ループ loop.ts（§7-10）', () => {
  it('区間 小節 5〜6: 折り返し 15,000（小節 7 の頭）、頭出し 7,500（小節 4 の頭）。小節 1 からは −LEAD。最後の小節は最終ノートの終わり', () => {
    const r = { startBar: 5, endBar: 6 }
    expect([loopLimitMs(MS, PULSE, r, 30000), loopSeekMs(MS, PULSE, r, 2000)]).toEqual([15000, 7500])
    expect(loopSeekMs(MS, PULSE, { startBar: 1, endBar: 2 }, 2000)).toBe(-2000)
    expect(loopLimitMs(MS, PULSE, { startBar: 11, endBar: 12 }, 29000)).toBe(29000)
  }) // prettier-ignore

  it('自動ループ: 小節 5〜6 で同じ通過に miss 3 → 区間 5〜6。2 回目の後に境の評価が来ると 0 に戻る。ループ中は無視', () => {
    let s = initialLoop(null, true)
    const m56 = { bar: 5, phrase: 2 }
    s = loopMiss(s, m56).state
    s = loopMiss(s, m56).state
    expect(s.phraseMiss).toEqual({ 2: 2 })
    expect(loopPhraseEnd(s, 2).phraseMiss).toEqual({})
    const third = loopMiss(s, { bar: 6, phrase: 2 })
    expect([third.start, third.state.range]).toEqual([{ startBar: 5, endBar: 6 }, { startBar: 5, endBar: 6 }])
    // 区間の中の miss は周の miss に、外は数えない。自動ループは起きない
    let l = third.state
    for (let i = 0; i < 3; i++) l = loopMiss(l, m56).state
    expect([l.lapMiss, loopMiss(l, { bar: 9, phrase: 4 }).start]).toEqual([3, null])
    // 自動ループ OFF は数えない
    expect(loopMiss(loopMiss(loopMiss(initialLoop(null, false), m56).state, m56).state, m56).start).toBeNull()
  }) // prettier-ignore

  it('2 周目に miss 1 → 解除しない、続く 2 周ノーミス → 解除（区間を外す）', () => {
    let s: LoopState = setLoop(initialLoop(null, true), { startBar: 5, endBar: 6 })
    const wrap = (miss: number): boolean => {
      for (let i = 0; i < miss; i++) s = loopMiss(s, { bar: 5, phrase: 2 }).state
      const w = loopWrap(s)
      s = w.state
      return w.release
    }
    expect([wrap(1), wrap(1), wrap(0), wrap(0)]).toEqual([false, false, false, true])
    expect([s.range, s.loops]).toEqual([null, 4])
  })
})

describe('テンポ段 tempo.ts（§7-11）', () => {
  it('7 段・4 段。8／8 → 1.0 → 1.1、5／8 → 0.9、7／8 → 据え置き、3／3 → 据え置き（<4 音）、1.25 で上げ → 据え置き、0.5 で下げ → 据え置き', () => {
    expect([TEMPO_NOVIDEO.length, TEMPO_VIDEO.length]).toEqual([7, 4])
    expect([tempoAfter(1, 8, 8), tempoAfter(1, 8, 5), tempoAfter(1, 8, 7), tempoAfter(1, 3, 3), tempoAfter(1.25, 8, 8), tempoAfter(0.5, 8, 0)]).toEqual([1.1, 0.9, 1, 1, 1.25, 0.5])
    // 境（厳密な不等号）: 0.9 ちょうどは上げない、0.7 ちょうどは下げない
    expect([tempoAfter(1, 10, 9), tempoAfter(1, 10, 7)]).toEqual([1, 1])
    expect([nearestStep(0.8), nearestStep(1.04), nearestStep(3)]).toEqual([0.75, 1, 1.25])
  }) // prettier-ignore

  it('正解 ＝ 正しい鍵の perfect／great／good（NEAR・miss・待ち中の誤打は不正解）', () => {
    expect([isCorrect('perfect', 'solo'), isCorrect('good', 'hinted'), isCorrect('near', 'near'), isCorrect('miss', 'miss'), isCorrect('perfect', 'miss'), isCorrect(null, null)]).toEqual([true, true, false, false, false, false])
  }) // prettier-ignore

  it('切替は窓の終わりが今から猶予の中に掛かる未判定の音が無いときだけ', () => {
    expect([rateChangeSafe([1301], 1000), rateChangeSafe([1300], 1000), rateChangeSafe([], 1000)]).toEqual([true, false, true])
  }) // prettier-ignore
})
