import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gamerHudOf } from '../../../src/app/hud.ts'
import {
  DEFAULT_PRACTICE,
  finishedPlay,
  newRun,
  runFrame,
  runInput,
  runPhase,
  type Run,
  type RunOptions,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import {
  hispeedLabel,
  hispeedText,
  otherProfile,
  profileOf,
  travelOf,
} from '../../../src/app/profile.ts'
import {
  HIST_BARS,
  histBars,
  pointsText,
  resultView,
  rewardView,
  selfParts,
  shapesText,
} from '../../../src/app/result-view.ts'
import { stageOf } from '../../../src/app/stage.ts'
import {
  fastSlowOf,
  neighborOf,
  rulesOf,
  summarizeJudge,
  type NoteResult,
} from '../../../src/judge/judge.ts'
import { addJudgment, initialScore, type ScoreState } from '../../../src/judge/score.ts'
import { PROFILES, gradeOf } from '../../../src/judge/windows.ts'
import { LAYOUTS } from '../../../src/layout/presets.ts'
import { playStep, type PlayPhase } from '../../../src/play/state.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import { chordShapes } from '../../../src/results/analysis.ts'
import { awardsFor, localDay } from '../../../src/results/awards.ts'
import { bestOf } from '../../../src/results/best.ts'
import { isFinished } from '../../../src/results/record.ts'
import type { Chart, Judgment, Profile } from '../../../src/shared/types.ts'
import { parseResult } from '../../../src/storage/file.ts'
import { initialCollect, playRow } from '../../../src/telemetry/collect.ts'
import { FRAME_MS, START_NOW } from '../../../tools/harness/autoplay.ts'

// 音ゲー向けプロファイル（M2-05、M2 の手順 9）: 途中終了（ゲージ 0 → abort → 終了、記録の aborted）・HUD の音ゲー向けの項目・
// ハイスピード・S3 の音ゲー向けの節（FAST／SLOW・ヒストグラム 11 本・塊／殻／段またぎ・3 区分）。出どころ: m2-kickoff 手順 9 の
// 期待値・§7-14〜§7-16・§7-19、design.md §1.3 S1・S2・S3・S6・§2.3・§2.5・§4.3・§4.4、m6 L302・L821–828・L837–850・
// L611–616、decisions #6・#8・#24 (c)・#63・#91、tests-inventory「M2 手順 9」。プロファイル切替の settings と自己ベストの鍵は
// tests/unit/app/settings-view.test.ts・profile.test.ts。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TWINKLE = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', 'twinkle.hexnote.json'), 'utf8')) as Chart // prettier-ignore
const SONG: RunSong = { chartId: TWINKLE.id, name: 'きらきら星', chart: TWINKLE, variant: TWINKLE.variants?.[0] as NonNullable<Chart['variants']>[number] } // prettier-ignore

function started(profile: Profile, over: Partial<RunOptions> = {}): Run {
  const grid = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
  const opts: RunOptions = {
    rules: rulesOf(PROFILES[profile], { neighbor: neighborOf(grid.byCode), labels: { kb: 'key', note: 'key' } }),
    sound: { melody: true, accomp: true, click: false },
    keyclick: false,
    ...over,
  }
  return runInput(newRun(SONG, opts), START_NOW, { kind: 'start' }).run
} // prettier-ignore

/** 何も押さずに終わるまで回す（全て miss） */
function idleThrough(r0: Run): Run {
  let r = r0
  let now = START_NOW
  for (let f = 0; f < 20_000 && runPhase(r) !== 'ended'; f++) {
    now += FRAME_MS
    r = runFrame(r, now, now).run
  }
  return r
}

const AT = '2026-11-01T03:00:00.000Z'

describe('ゲージと failed（§2.3、src/judge/score.ts）', () => {
  const run = (seq: Judgment[]): { gauges: number[]; s: ScoreState } => {
    let s = initialScore()
    const gauges: number[] = []
    for (const g of seq) {
      s = addJudgment(s, g, true)
      gauges.push(s.gauge)
    }
    return { gauges, s }
  }

  it('50 → miss ×9: 8 回目で 2、9 回目で 0 で failed', () => {
    const { gauges, s } = run(new Array<Judgment>(9).fill('miss'))
    expect([gauges[7], gauges[8], s.failed]).toEqual([2, 0, true])
  })

  it('50 → perfect ×10 → 65、そこから miss ×11: 10 回目で 5、11 回目で 0 で failed（それまでは偽）', () => {
    const p = run(new Array<Judgment>(10).fill('perfect'))
    expect(p.s.gauge).toBe(65)
    let s = p.s
    const gauges: number[] = []
    const failed: boolean[] = []
    for (let i = 0; i < 11; i++) {
      s = addJudgment(s, 'miss', true)
      gauges.push(s.gauge)
      failed.push(s.failed)
    }
    expect([gauges[9], gauges[10]]).toEqual([5, 0])
    expect(failed.indexOf(true)).toBe(10)
  })
})

describe('途中終了（abort、m2-kickoff §7-14）', () => {
  it('playStep: 再生・同期中・待ちの abort → ended、時計への命令は無い。待機・一時停止では何もしない', () => {
    for (const phase of ['playing', 'syncing', 'waiting'] as PlayPhase[])
      expect(playStep({ phase, source: 'novideo' }, { kind: 'abort' })).toEqual({ state: { phase: 'ended', source: 'novideo' }, clock: [], video: [] })
    for (const phase of ['idle', 'paused', 'ended'] as PlayPhase[])
      expect(playStep({ phase, source: 'novideo' }, { kind: 'abort' }).state.phase).toBe(phase)
  }) // prettier-ignore

  const r = idleThrough(started('gamer'))
  const fp = finishedPlay(r, { id: 'g1', at: AT, profile: 'gamer' })

  it('音ゲー向けで押さない: miss 9 で failed → 曲の途中で終了（残りの音は未判定のまま）', () => {
    expect(runPhase(r)).toBe('ended')
    expect(r.judge.score.counts.miss).toBe(9)
    expect(r.judge.score.failed).toBe(true)
    expect(r.t).toBeLessThan(r.endMs)
    expect(r.judge.results.filter((x) => x.state === 'pending').length).toBe(
      TWINKLE.notes.length - 9,
    )
  })

  it('記録 aborted 真・isFinished 偽・自己ベストに入らない・初クリアでない・ストリークの日には数える', () => {
    expect(fp.aborted).toBe(true)
    expect(fp.record.aborted).toBe(true)
    expect(isFinished(fp.record)).toBe(false)
    expect(isFinished({ ...fp.record, aborted: undefined })).toBe(true)
    expect(bestOf([fp.record], { chartId: fp.chartId, variantId: fp.variantId, profile: 'gamer', clock: 'novideo' })).toBeNull()
    const a = awardsFor([], fp.record, { today: localDay(AT), bundledIds: [fp.chartId] })
    expect(a.titles).toEqual([])
    expect(a.counted).toBe(true)
    expect(a.streak).toBe(1)
    expect(a.done).toBe(0)
    expect(rewardView(a, true).lines[0]).toBe('途中終了は完走になりません（ストリークの日には数えます）。')
  }) // prettier-ignore

  it('S3: 見出し「途中終了」・ランク「—」・ゲージ終値 0・点「—」・完走いいえ、NEAR の行は無い', () => {
    const v = resultView(fp)
    expect(v.title).toBe('途中終了')
    expect(v.rank).toBe('—')
    expect(v.fullCombo).toBe(false)
    expect(v.rows).toEqual([
      ['PERFECT／GREAT／GOOD', '0 ／ 0 ／ 0'],
      ['MISS', '9'],
      ['最大コンボ', '0'],
      ['ゲージ終値', '0（途中終了）'],
      ['点', '—'],
      ['完走', 'いいえ（途中終了。自己ベストと完走の対象外）'],
    ])
    expect(v.rows.some(([k]) => k.includes('となり') || k.includes('NEAR'))).toBe(false)
  })

  it('play 行に aborted（無ければ書かない）', () => {
    const meta = { chartId: 'c', variantId: 'v', profile: 'gamer' as const, clock: 'novideo' as const, mode: 'fixed' as const }
    const j = summarizeJudge(r.judge)
    expect(playRow(initialCollect(), { ...meta, aborted: true }, j, null, AT).aborted).toBe(true)
    expect('aborted' in playRow(initialCollect(), meta, j, null, AT)).toBe(false)
  }) // prettier-ignore

  it('入門者は押さなくても最後まで（失敗なし）、音ゲー向けの練習（S4）は途中終了しない', () => {
    const b = idleThrough(started('beginner'))
    expect([runPhase(b), b.t > b.endMs, finishedPlay(b, { id: 'b1', at: AT, profile: 'beginner' }).record.aborted]).toEqual(['ended', true, undefined])
    const p = idleThrough(started('gamer', { practice: { ...DEFAULT_PRACTICE, mode: 'fixed', autoLoop: false, autoTempo: false } }))
    expect(p.judge.score.failed).toBe(true)
    expect([runPhase(p), p.t > p.endMs]).toEqual(['ended', true])
    const pf = finishedPlay(p, { id: 'p1', at: AT, profile: 'gamer' })
    expect([pf.aborted, pf.record.aborted]).toEqual([false, undefined])
  }) // prettier-ignore

  it('取り込み: aborted の無い旧い記録は偽と読む、真は残る、真偽値でなければ壊れた記録', () => {
    const base = { ...fp.record, aborted: undefined }
    delete base.aborted
    expect(parseResult(base)?.aborted).toBeUndefined()
    expect(isFinished(parseResult(base) ?? fp.record)).toBe(true)
    expect(parseResult(fp.record)?.aborted).toBe(true)
    expect(parseResult({ ...fp.record, aborted: 'yes' })).toBeNull()
  })
})

describe('FAST／SLOW（§7-19: perfect 以外の正しい鍵の当たりを dt の符号で）', () => {
  it('音ゲー向けの窓 30／90／200: dt −45（great）・＋60（great）・＋10（perfect）・＋120（good）→ FAST 1・SLOW 2', () => {
    const w = PROFILES.gamer.windows
    const dts = [-45, 60, 10, 120]
    expect(dts.map((d) => gradeOf(w, d))).toEqual(['great', 'great', 'perfect', 'good'])
    const results: NoteResult[] = dts.map((d) => ({ state: 'done', grade: gradeOf(w, d), skipped: false, dtMs: d, key: 'KeyA', hold: null, self: 'hinted' }))
    // miss・NEAR・dt 0 の great は数えない
    results.push({ state: 'done', grade: 'miss', skipped: false, dtMs: null, key: null, hold: null, self: 'miss' })
    results.push({ state: 'done', grade: 'near', skipped: false, dtMs: -50, key: 'KeyS', hold: null, self: 'near' })
    results.push({ state: 'done', grade: 'great', skipped: false, dtMs: 0, key: 'KeyA', hold: null, self: 'hinted' })
    expect(fastSlowOf({ results })).toEqual({ fast: 1, slow: 2 })
  }) // prettier-ignore
})

describe('S3 の早遅ヒストグラム（30 ms 幅 × 11 本、§7-19）', () => {
  it('11 本の和が標本の数。−165 と ＋165 ちょうどは端の本、中の本は [−15, 15)', () => {
    const dts = [-200, -165, -135.01, -135, -15, 0, 14.99, 15, 134.99, 135, 165, 200]
    const h = histBars(dts)
    expect(h).toHaveLength(HIST_BARS)
    expect(h.reduce((a, x) => a + x, 0)).toBe(dts.length)
    expect(h).toEqual([3, 1, 0, 0, 0, 3, 1, 0, 0, 1, 3])
    expect(histBars([])).toEqual(new Array(11).fill(0))
  })
})

describe("塊／殻／段またぎ（m1' の和音統計）", () => {
  it('A S（同じ段で隣）→ 塊、A D（離れた）→ 殻、A Q（段をまたいで隣）→ 塊かつ段またぎ、単音は数えない', () => {
    const n = (tick: number, code: string) => ({ tick, grade: 'perfect' as const, skipped: false, code })
    const s = chordShapes([n(0, 'KeyA'), n(0, 'KeyS'), n(1, 'KeyA'), n(1, 'KeyD'), n(2, 'KeyA'), n(2, 'KeyQ'), n(3, 'KeyF')])
    expect(s).toEqual({ total: 3, cluster: 2, shell: 1, cross: 1 })
    expect(shapesText(s)).toBe('67% ／ 33% ／ 33%（3 和音）')
    expect(shapesText({ total: 0, cluster: 0, shell: 0, cross: 0 })).toBe('和音なし')
  }) // prettier-ignore
})

describe('S3 の音ゲー向けの節（m6 L850・L366・L375–379）', () => {
  it('通しで全部当てる回: FULL COMBO・最大コンボ・ゲージ終値・点、自力率は 3 区分（NEAR 無し）', () => {
    const counts = { perfect: 40, great: 2, good: 0, near: 0, miss: 0 }
    const r = started('gamer')
    const judge = { ...summarizeJudge(r.judge), counts, maxCombo: 42, fastSlow: { fast: 1, slow: 1 }, gamer: { points: 61234.4, gauge: 100, fullCombo: true, cleared: true, failed: false } }
    const fp = finishedPlay(r, { id: 'g2', at: AT, profile: 'gamer' })
    const v = resultView({ ...fp, judge, samples: [-40, 0, 40], record: { ...fp.record, counts, selfRate: { solo: 10, hinted: 32, near: 0, miss: 0 } } })
    expect(v.title).toBe('結果')
    expect(v.fullCombo).toBe(true)
    expect(v.rows.slice(0, 5)).toEqual([
      ['PERFECT／GREAT／GOOD', '40 ／ 2 ／ 0'],
      ['MISS', '0'],
      ['最大コンボ', '42'],
      ['ゲージ終値', '100（クリア。クリアは ≥70）'],
      ['点', '61,234'],
    ])
    expect(v.self.map((p) => p.key)).toEqual(['solo', 'hinted', 'miss'])
    expect(v.gamer?.fastSlow).toBe('1 ／ 1')
    expect(v.gamer?.hist).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0])
  }) // prettier-ignore

  it('自力率: 入門者は 4 区分、音ゲー向けは NEAR を除く 3 区分（和を分母に）', () => {
    expect(selfParts({ solo: 3, hinted: 1, near: 0, miss: 0 }, 'gamer').map((p) => p.label)).toEqual(['ラベル無しで当てた 75%', 'ヒント付き 25%', '外した 0%'])
    expect(selfParts({ solo: 3, hinted: 1, near: 0, miss: 0 }).map((p) => p.key)).toEqual(['solo', 'hinted', 'near', 'miss'])
  }) // prettier-ignore

  it('入門者の回は音ゲー向けの節を出さない（gamer null・FULL COMBO なし）', () => {
    const fp = finishedPlay(started('beginner'), { id: 'b2', at: AT, profile: 'beginner' })
    const v = resultView(fp)
    expect([v.gamer, v.fullCombo]).toEqual([null, false])
  })

  it('点は整数に丸めて 3 桁ごとに「,」', () => {
    expect([pointsText(0), pointsText(999.5), pointsText(1500), pointsText(108420)]).toEqual(['0', '1,000', '1,500', '108,420'])
  }) // prettier-ignore
})

describe('S2 の HUD（音ゲー向け ＝ ＋ランク・ゲージ・コンボ・ハイスピード・FAST／SLOW）', () => {
  it('始めは ランク「—」・ゲージ 50・コンボ 0・×1.0（1.0 s）・FAST 0 ／ SLOW 0。入門者は null', () => {
    const g = started('gamer')
    expect(gamerHudOf(summarizeJudge(g.judge), g.judge.score.combo, 'gamer', 1)).toEqual({ rank: '—', gauge: 50, gaugeText: '50', clear: false, combo: '0', hispeed: '×1.0（1.0 s）', fast: '0', slow: '0' })
    const b = started('beginner')
    expect(gamerHudOf(summarizeJudge(b.judge), 0, 'beginner', 1)).toBeNull()
  }) // prettier-ignore

  it('ゲージ 70 以上でクリアの色、数は切り捨て', () => {
    const g = started('gamer')
    const sum = { ...summarizeJudge(g.judge), gamer: { points: 0, gauge: 71.5, fullCombo: false, cleared: true, failed: false } }
    const v = gamerHudOf(sum, 12, 'gamer', 1.5)
    expect([v?.gaugeText, v?.clear, v?.combo, v?.hispeed]).toEqual(['71', true, '12', '×1.5（0.67 s）'])
  }) // prettier-ignore
})

describe('ハイスピード（§2.5「v に掛ける」、§7-15）', () => {
  it('流れる時間 ＝ T ÷ 倍率。2.0 で可視時間が半分（v ×2）、R は同じ', () => {
    expect([1, 1.25, 1.5, 2].map((x) => travelOf('gamer', x))).toEqual([1000, 800, 1000 / 1.5, 500])
    expect(travelOf('beginner', 2)).toBe(750)
    expect(travelOf('gamer', 3)).toBe(1000)
    const rows = LAYOUTS.ableton.rowsUsed
    for (const vp of [{ w: 1920, h: 1080 }, { w: 1366, h: 768 }, { w: 1093, h: 514 }]) {
      const a = stageOf(vp, rows, travelOf('gamer', 1)).sizing
      const b = stageOf(vp, rows, travelOf('gamer', 2)).sizing
      expect(b.R).toBe(a.R)
      expect(b.v).toBeCloseTo(a.v * 2, 9)
      expect(b.travelMs).toBeCloseTo(a.travelMs / 2, 9)
    }
  }) // prettier-ignore

  it('表示は倍率と流れる時間（入門者 1.5 s・音ゲー向け 1.0 s が元）', () => {
    expect([1, 1.25, 1.5, 2].map(hispeedLabel)).toEqual(['×1.0', '×1.25', '×1.5', '×2.0'])
    expect([hispeedText('gamer', 1), hispeedText('gamer', 1.25), hispeedText('gamer', 2), hispeedText('beginner', 1.25)]).toEqual(['×1.0（1.0 s）', '×1.25（0.8 s）', '×2.0（0.5 s）', '×1.25（1.2 s）'])
  }) // prettier-ignore

  it('プロファイルの HUD の項目と切替の相手', () => {
    expect(profileOf('gamer').hud).toContain('hispeed')
    expect(profileOf('beginner').hud).not.toContain('hispeed')
    expect([otherProfile('beginner'), otherProfile('gamer')]).toEqual(['gamer', 'beginner'])
  })
})
