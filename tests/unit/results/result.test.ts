import { describe, expect, it } from 'vitest'
import type { FinishedPlay } from '../../../src/app/play-runner.ts'
import { resultView, selfParts, variantText } from '../../../src/app/result-view.ts'
import { summarizeJudge, initialJudge, beginnerRules } from '../../../src/judge/judge.ts'
import { rankOf } from '../../../src/judge/score.ts'
import { barOf, chordRate, weakBars, type NoteOutcome } from '../../../src/results/analysis.ts'
import {
  isFinished,
  newRecordId,
  resultRecord,
  type RecordMeta,
} from '../../../src/results/record.ts'
import type { Judgment } from '../../../src/shared/types.ts'

// src/results/{analysis,record}.ts・src/app/result-view.ts（M1-06、M1 の手順 5）。出どころ: m1-kickoff 手順 5 の期待値
// （苦手区間「17〜18 小節」、和音 14／18 → 78%、ずれの言葉、skipped 0 は完走）、m6 S3 L374・L383・L386・renderS3
// L849、design.md §4.3・§4.4、decisions #31 (e)・#63、tests-inventory「M1 手順 5」。

const RES = 240
const note = (beat: number, grade: Judgment | null, skipped = false): NoteOutcome => ({
  tick: Math.round(beat * RES),
  grade,
  skipped,
})

describe('小節（timeSig から数える、1 始まり）', () => {
  it('4/4: 拍 0〜3 は 1 小節、拍 64 は 17 小節、拍 71.5 は 18 小節', () => {
    const p = {}
    expect([0, 3.99, 4, 64, 71.5, 72].map((b) => barOf(p, b))).toEqual([1, 1, 2, 17, 18, 19])
  })

  it('3/4 から 4/4 へ（拍 6 で変わる）、6/8（3 拍）、半端な小節は 1 つに数える', () => {
    const p = {
      timeSig: [
        { beat: 0, num: 3, den: 4 },
        { beat: 6, num: 4, den: 4 },
      ],
    }
    expect([0, 3, 5.5, 6, 10, 14].map((b) => barOf(p, b))).toEqual([1, 2, 2, 3, 4, 5])
    expect(barOf({ timeSig: [{ beat: 0, num: 6, den: 8 }] }, 3)).toBe(2)
    // 拍 5 で 4/4 → 3/4: 拍 4〜5 の半端な小節が 2 小節目、拍 5 から 3 小節目
    const odd = {
      timeSig: [
        { beat: 0, num: 4, den: 4 },
        { beat: 5, num: 3, den: 4 },
      ],
    }
    expect([4, 4.5, 5, 8].map((b) => barOf(odd, b))).toEqual([2, 2, 3, 4])
  })
})

describe('苦手区間（miss が最も多い連続 2 小節）', () => {
  const pulse = { resolution: RES }
  it('4/4・resolution 240 で miss が拍 64〜71 に集中 → 17〜18 小節', () => {
    const notes = [
      ...Array.from({ length: 80 }, (_, b) => note(b, b >= 64 && b < 72 ? 'miss' : 'perfect')),
      note(10, 'miss'),
    ]
    expect(weakBars(pulse, notes)).toEqual({ from: 17, to: 18, misses: 8 })
  })

  it('同じ数なら前の組、miss が無ければ null、1 小節の曲はその小節。skipped は miss に数えない', () => {
    expect(weakBars(pulse, [note(0, 'miss'), note(20, 'miss')])).toEqual({
      from: 1,
      to: 2,
      misses: 1,
    })
    expect(weakBars(pulse, [note(0, 'perfect'), note(8, 'near')])).toBe(null)
    expect(weakBars(pulse, [note(0, 'miss'), note(2, 'perfect')])).toEqual({
      from: 1,
      to: 1,
      misses: 1,
    })
    expect(weakBars(pulse, [note(0, null, true), note(9, 'perfect')])).toBe(null)
  })
})

describe('同時押しが合った割合', () => {
  it('和音 18 拍のうち 14 拍が全部当たり → 14／18（単音は数えない）', () => {
    const notes: NoteOutcome[] = []
    for (let b = 0; b < 18; b++) notes.push(note(b, 'perfect'), note(b, b < 14 ? 'good' : 'miss'))
    notes.push(note(30, 'great'))
    expect(chordRate(notes)).toEqual({ hit: 14, total: 18 })
  })

  it('NEAR（隣の鍵）を含む和音は合っていない、skipped を含む和音は分母から外す、和音が無ければ 0／0', () => {
    expect(chordRate([note(0, 'perfect'), note(0, 'near')])).toEqual({ hit: 0, total: 1 })
    expect(chordRate([note(0, 'perfect'), note(0, null, true)])).toEqual({ hit: 0, total: 0 })
    expect(chordRate([note(0, 'perfect'), note(1, 'perfect')])).toEqual({ hit: 0, total: 0 })
  })
})

const META: RecordMeta = {
  id: 'r1',
  chartId: 'c1',
  variantId: 'ableton/2/octave',
  profile: 'beginner',
  clock: 'novideo',
  mode: 'fixed',
  rate: 1,
  keyset: 'all',
  at: '2026-10-31T00:00:00.000Z',
  syncUsed: { kind: 'audio' },
  offsetUsed: -6,
}
const JUDGE = {
  acc: 0.942,
  rank: 'A' as const,
  counts: { perfect: 61, great: 38, good: 9, near: 4, miss: 6 },
  selfRate: { solo: 62, hinted: 18, near: 8, miss: 12 },
  skipped: 0,
}

describe('記録（§4.3 の 15 項目 ＋ skipped）と完走（§4.4・#63）', () => {
  it('判定のまとめと回の条件を写す', () => {
    expect(resultRecord(META, JUDGE)).toEqual({ ...META, ...JUDGE })
  })

  it('完走 ＝ 固定テンポ・1.0 倍・全鍵・skipped 0。skipped 2 は対象外（中断あり）', () => {
    const r = resultRecord(META, JUDGE)
    expect(isFinished(r)).toBe(true)
    expect(isFinished({ ...r, skipped: 2 })).toBe(false)
    expect(isFinished({ ...r, rate: 0.75 })).toBe(false)
    expect(isFinished({ ...r, keyset: 'dfjk' })).toBe(false)
    expect(isFinished({ ...r, mode: 'note' })).toBe(false)
  })

  it('id: randomUUID があればそれ、無い文脈（LAN の http）は時刻と乱数から', () => {
    expect(newRecordId({ randomUUID: () => 'u-1' }, 0, () => 0)).toBe('u-1')
    expect(newRecordId({}, 36 ** 3, () => 0.5)).toBe(`r-1000-${(2 ** 47).toString(36)}`)
    expect(newRecordId(undefined, 1, () => 0)).toBe('r-1-0')
  })

  it('acc 0.5 → C（手順 8 で検算済の rankOf）', () => {
    expect(rankOf(0.5)).toBe('C')
  })
})

/** 画面の入力（判定のまとめは要る欄だけ） */
function play(over: Partial<FinishedPlay> = {}, judgeOver = {}): FinishedPlay {
  const base = summarizeJudge(initialJudge([], beginnerRules()))
  const judge = { ...base, ...JUDGE, meanMs: -12, sdMs: 21, ...judgeOver }
  return {
    chartId: 'c1',
    variantId: 'ableton/2/octave',
    name: 'きらきら星',
    judge,
    audioLateMaxMs: 0,
    samples: new Array<number>(108).fill(0),
    offsetUsed: -6,
    calibEligible: true,
    weak: { from: 17, to: 18, misses: 5 },
    chords: { hit: 14, total: 18 },
    record: resultRecord(META, judge),
    ...over,
  }
}

describe('S3 の文言（m6 renderS3、#31 (e)）', () => {
  it('比較の範囲に譜面版 id、曲の行、精度・ランク、内訳の表、和音・ずれ・苦手区間', () => {
    const v = resultView(play())
    expect(v.title).toBe('結果')
    expect(v.scope).toBe('成績の比較は同じ譜面版（ableton/2/octave）の中だけです。')
    expect(v.song).toBe('きらきら星 ・ Ableton 型／上限 2 ・ 入門者 ・ 自前音源')
    expect([v.accuracy, v.rank]).toEqual(['94.2%', 'A'])
    expect(v.rows).toEqual([
      ['ぴったり／よい／おしい', '61 ／ 38 ／ 9'],
      ['となり（隣のキー）', '4'],
      ['はずれ', '6'],
      ['完走', 'はい（固定テンポ・1.0 倍・全鍵）'],
    ])
    expect(v.chord).toBe('同時押しが合った割合 78%（14 ／ 18 拍）')
    expect(v.lean).toBe('平均 −12 ms（少し早め）、ばらつき 21 ms、ヒット 108。')
    expect(v.weak).toBe('ミスが集まった 2 小節: 17〜18 小節（はずれ 5）')
  })

  it('skipped > 0 は「判定なし」の行と「中断あり」、ずれ ＋12 は少し遅め・±4 はちょうど、無い物は null', () => {
    const judge = { ...JUDGE, skipped: 2 }
    const v = resultView(
      play(
        { record: resultRecord(META, judge), chords: { hit: 0, total: 0 }, weak: null },
        { meanMs: 12 },
      ),
    )
    expect(v.rows.slice(-2)).toEqual([
      ['判定なし（再開の猶予の中）', '2'],
      ['完走', 'いいえ（中断あり。自己ベストと完走の対象外）'],
    ])
    expect(v.lean).toMatch(/^平均 ＋12 ms（少し遅め）/)
    expect(v.chord).toBe(null)
    expect(v.weak).toBe(null)
    expect(resultView(play({}, { meanMs: 4 })).lean).toMatch(/^平均 ＋4 ms（ちょうど）/)
    expect(resultView(play({}, { meanMs: null, sdMs: null })).lean).toBe(null)
    // 判定した音が無い回（全て skipped）は精度もランクも「—」
    const none = { perfect: 0, great: 0, good: 0, near: 0, miss: 0 }
    expect(resultView(play({}, { counts: none, acc: 1, rank: 'SS' }))).toMatchObject({
      accuracy: '—',
      rank: '—',
    })
    expect(resultView(play({}, { meanMs: 3, sdMs: null })).lean).toBe(
      '平均 ＋3 ms（ちょうど）、ばらつき —、ヒット 108。',
    )
    expect(resultView(play({ weak: { from: 1, to: 1, misses: 2 } })).weak).toBe(
      'ミスが集まった小節: 1 小節（はずれ 2）',
    )
  })

  it('自力率の 4 区分（m6 の長い凡例）、数えた音が無ければ空。譜面版の名前', () => {
    expect(selfParts({ solo: 62, hinted: 18, near: 8, miss: 12 }).map((p) => p.label)).toEqual([
      'ラベル無しで当てた 62%',
      'ヒント付き 18%',
      'となり（NEAR） 8%',
      '外した 12%',
    ])
    expect(selfParts({ solo: 0, hinted: 0, near: 0, miss: 0 })).toEqual([])
    expect(selfParts({ solo: 1, hinted: 2, near: 0, miss: 0 }).map((p) => p.pct)).toEqual([
      33, 67, 0, 0,
    ])
    expect(variantText('vmpk/3/octave')).toBe('VMPK 型／上限 3')
  })
})
