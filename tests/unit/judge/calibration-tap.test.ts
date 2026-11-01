import { describe, expect, it } from 'vitest'
import {
  LEAN_EXACT_MS,
  leanWord,
  proposalFor,
  proposalText,
  signedMs,
  silentText,
  tapResultText,
} from '../../../src/app/calibration.ts'
import type { PlayResult } from '../../../src/app/play-runner.ts'
import { proposeOffset, tapOffset } from '../../../src/judge/calibration-offset.ts'
import {
  CAL_CLICKS,
  CAL_INTERVAL_MS,
  CAL_LEAD,
  CAL_MATCH_MS,
  CAL_START_DELAY_MS,
  CAL_TAIL_MS,
  calClicks,
  calDeadline,
  calDone,
  calResult,
  calTap,
  initialCal,
  type CalState,
} from '../../../src/judge/calibration-tap.ts'

// src/judge/calibration-tap.ts・src/app/calibration.ts（M1-05、M1 の手順 4）。出どころ: m3 startCal L435–448・calTap
// L449–451・finishCal L454–457、m6 calibsim L959–960・S3 の提案帯 L381–384、design.md §2.7、decisions #37・#40・#62、
// tests-inventory「M1 手順 4」、m1-kickoff §7-18。

/** context の 0 秒が perf の 1,000 ms に聞こえる対応点（出力遅延 込み） */
const BRIDGE = { ctxSec: 0, perfMs: 1000, via: 'outputTimestamp' as const }
const NOW = 1000

/** クリック i の実時刻 ＋ d に打つ */
function tapAll(errs: readonly number[]): CalState {
  let s = initialCal(calClicks(BRIDGE, NOW))
  errs.forEach((d, k) => {
    const c = s.clicks[CAL_LEAD + k]
    if (c === undefined) throw new Error('クリックが足りない')
    s = calTap(s, c.perf + d).state
  })
  return s
}

describe('クリックの予定（100 BPM・予備 4＋24、m3 startCal）', () => {
  it('28 個、最初は 0.6 s 後、600 ms ごと、先頭 4 つは予備、4 拍ごとに強拍。実時刻は対応点から', () => {
    const clicks = calClicks(BRIDGE, NOW)
    expect(clicks).toHaveLength(CAL_CLICKS)
    expect(CAL_CLICKS).toBe(28)
    expect(clicks[0]).toEqual({ index: 0, ctxSec: 0.6, perf: 1600, measured: false, accent: true })
    expect(clicks.map((c) => Math.round(c.perf * 1e6) / 1e6)).toEqual(
      Array.from({ length: 28 }, (_, i) => NOW + CAL_START_DELAY_MS + i * CAL_INTERVAL_MS),
    )
    expect(clicks.filter((c) => !c.measured).map((c) => c.index)).toEqual([0, 1, 2, 3])
    expect(clicks.filter((c) => c.accent).map((c) => c.index)).toEqual([0, 4, 8, 12, 16, 20, 24])
    // 退避の対応点（今の時刻 ＋ 出力遅延 20 ms）でも、context の秒と実時刻の差は対応点のまま
    const lat = { ctxSec: 5, perfMs: 2020, via: 'latency' as const }
    const c0 = calClicks(lat, 2000)[0]
    expect(c0?.ctxSec).toBeCloseTo(5 - 0.02 + 0.6, 9)
    expect(c0?.perf).toBeCloseTo(2600, 9)
  })
})

describe('タップの対応付け（m3 calTap、|d| ≤ 300）', () => {
  const s0 = initialCal(calClicks(BRIDGE, NOW))
  const at = (i: number): number => s0.clicks[i]?.perf ?? NaN

  it('最も近い数えるクリックに誤差（打った − クリック）で入る', () => {
    const r = calTap(s0, at(4) + 18)
    expect(r.tap).toEqual({ kind: 'hit', index: 4, err: 18 })
    expect(r.state.errs).toEqual([18])
    expect(calTap(s0, at(9) - 40).tap).toEqual({ kind: 'hit', index: 9, err: -40 })
  })

  it('300 ms ちょうどは入る、間の真ん中（300）は前のクリック、どれからも遠いと far', () => {
    expect(calTap(s0, at(4) + CAL_MATCH_MS).tap).toEqual({ kind: 'hit', index: 4, err: 300 })
    expect(calTap(s0, at(27) + 310).tap).toEqual({ kind: 'miss', reason: 'far' })
    expect(calTap(s0, at(0) - 310).tap).toEqual({ kind: 'miss', reason: 'far' })
  })

  it('予備のクリック 0〜3 へのタップは数えない（lead）、同じクリックへの 2 つ目は捨てる（dup）', () => {
    for (const i of [0, 1, 2, 3])
      expect(calTap(s0, at(i)).tap).toEqual({ kind: 'miss', reason: 'lead' })
    const once = calTap(s0, at(5) + 10).state
    const twice = calTap(once, at(5) - 5)
    expect(twice.tap).toEqual({ kind: 'miss', reason: 'dup' })
    expect(twice.state).toBe(once)
  })

  it('24 打で終わり、その後のタップは捨てる（full）', () => {
    const s = tapAll(new Array<number>(24).fill(0))
    expect(s.errs).toHaveLength(24)
    expect(calDone(s, 0)).toBe(true)
    expect(calTap(s, at(27)).tap).toEqual({ kind: 'miss', reason: 'full' })
  })

  it('見張り: 最後のクリック ＋ 900 ms で終わる（打数が足りなくても）', () => {
    const s = tapAll([0, 0, 0])
    expect(calDeadline(s)).toBe(at(27) + CAL_TAIL_MS)
    expect(calDone(s, calDeadline(s) - 1)).toBe(false)
    expect(calDone(s, calDeadline(s))).toBe(true)
  })
})

describe('結果（tapOffset、decisions #40 (b)）と文言', () => {
  it('24 打が全て ＋18 → 平均 18・SD 0 → オフセット −18、文「…オフセットを −18 ms にしました。」', () => {
    const s = tapAll(new Array<number>(24).fill(18))
    const v = calResult(s)
    expect(v).toEqual({ ok: true, offset: -18, mean: 18, sd: 0 })
    expect(tapResultText(v, 24)).toBe(
      '平均 ＋18 ms（少し遅め）、ばらつき 0 ms。オフセットを −18 ms にしました。',
    )
  })

  it('上限で切ったら注記（M1 の手順 14 の通しで見た ＋129 → −120）。ちょうど 120 は注記しない', () => {
    const v = calResult(tapAll(new Array<number>(24).fill(129)))
    expect(v).toEqual({ ok: true, offset: -120, mean: 129, sd: 0 })
    expect(tapResultText(v, 24)).toBe(
      '平均 ＋129 ms（少し遅め）、ばらつき 0 ms。オフセットを −120 ms にしました（上限 ±120 ms。それより大きいずれは残ります）。',
    )
    const edge = calResult(tapAll(new Array<number>(24).fill(-120)))
    expect(tapResultText(edge, 24)).toBe(
      '平均 −120 ms（少し早め）、ばらつき 0 ms。オフセットを ＋120 ms にしました。',
    )
  })

  it('SD 41 → 拒否（sd）、23 打 → 不足（count）', () => {
    // ±41 を交互に 24 個: 平均 0、標本 SD ＝ 41·√(24/23) ≈ 41.9
    const wide = calResult(tapAll(Array.from({ length: 24 }, (_, i) => (i % 2 ? 41 : -41))))
    expect(wide.ok).toBe(false)
    expect(!wide.ok && wide.reason).toBe('sd')
    expect(tapResultText(wide, 24)).toBe(
      'ばらつきが大きい（SD 42 ms）ので適用しません。プレイ後に提案します。',
    )
    const short = calResult(tapAll(new Array<number>(23).fill(0)))
    expect(!short.ok && short.reason).toBe('count')
    expect(tapResultText(short, 23)).toBe('打数が足りません（23/24）。適用しません。')
    expect(calResult(tapAll([]))).toEqual(tapOffset([]))
  })

  it('符号付きの ms とずれの言葉（±5 ms 以内はちょうど、§7-18）', () => {
    expect([signedMs(12), signedMs(-12.4), signedMs(0), signedMs(-0.4)]).toEqual([
      '＋12 ms',
      '−12 ms',
      '±0 ms',
      '±0 ms',
    ])
    expect(LEAN_EXACT_MS).toBe(5)
    expect([leanWord(-12), leanWord(-5), leanWord(5), leanWord(5.1), leanWord(0)]).toEqual([
      '少し早め',
      'ちょうど',
      'ちょうど',
      '少し遅め',
      'ちょうど',
    ])
  })
})

describe('「聞こえない」（m6 L278）', () => {
  it('未校正なら未校正のまま、校正済みなら今のオフセットのまま（どちらも書き換えない）', () => {
    expect(silentText(false)).toBe(
      '音が聞こえないので校正は行いません（未校正のままにします。あとで設定からやり直せます）。',
    )
    expect(silentText(true)).toBe(
      '音が聞こえないので校正は行いません（今のオフセットのままにします）。',
    )
  })
})

describe('プレイ後の提案（段 2、#40 (c)・#62）', () => {
  const base: PlayResult = {
    chartId: 'x',
    variantId: 'ableton/2/octave',
    name: 'x',
    judge: {} as PlayResult['judge'],
    audioLateMaxMs: null,
    samples: [],
    offsetUsed: 0,
    keyset: 'all',
    mode: 'fixed',
    rate: 1,
    practice: null,
    calibEligible: true,
    weak: null,
    chords: { hit: 0, total: 0 },
    shapes: { total: 0, cluster: 0, shell: 0, cross: 0 },
    aborted: false,
  }

  /** 平均 m・SD sd（標本）・n 個の標本（m ± a を交互に、n は偶数） */
  function samples(m: number, sd: number, n: number): number[] {
    const a = sd * Math.sqrt((n - 1) / n)
    return Array.from({ length: n }, (_, i) => m + (i % 2 ? a : -a))
  }

  it('dt の平均 −12・n 118・SD 21・使った 0 → 提案 ＋12、文「平均 −12 ms（少し早め）→ オフセットを ＋12 ms にしますか」', () => {
    const r = { ...base, samples: samples(-12, 21, 118) }
    const v = proposalFor(r)
    if (v === null || !v.ok) throw new Error('提案が無い')
    expect(v.offset).toBe(12)
    expect(v.sd).toBeCloseTo(21, 9)
    expect(proposalText(v, 118)).toEqual({
      title: '平均 −12 ms（少し早め）→ オフセットを ＋12 ms にしますか',
      detail: 'ばらつき 21 ms、ヒット 118。自前音源のオフセットとして保存します。',
    })
  })

  it('もう上限にいて動かせない提案は出さない（M1 の手順 14: 使った −120・平均 ＋22 で「−120 ms にしますか」と出ていた）', () => {
    const s = samples(22, 9, 42)
    expect(proposalFor({ ...base, samples: s, offsetUsed: -120 })).toMatchObject({ ok: false, reason: 'small' })
    // 上限の手前から上限へは提案し、注記を付ける
    const v = proposalFor({ ...base, samples: s, offsetUsed: -110 })
    if (v === null || !v.ok) throw new Error('提案が無い')
    expect(v.offset).toBe(-120)
    expect(proposalText(v, 42, -110).title).toBe('平均 ＋22 ms（少し遅め）→ オフセットを −120 ms にしますか（上限 ±120 ms。それより大きいずれは残ります）')
    // ちょうど上限に届くなら注記しない
    const w = proposalFor({ ...base, samples: s, offsetUsed: -98 })
    expect(w?.ok && proposalText(w, 42, -98).title).toBe('平均 ＋22 ms（少し遅め）→ オフセットを −120 ms にしますか')
  }) // prettier-ignore

  it('使ったオフセットから引く（使った ＋8・平均 −12 → ＋20）。3 条件の門と母集団', () => {
    const s = samples(-12, 21, 118)
    expect(proposalFor({ ...base, samples: s, offsetUsed: 8 })).toEqual(proposeOffset(s, 8))
    expect(
      proposalFor({ ...base, samples: s, offsetUsed: 8 })?.ok && proposeOffset(s, 8),
    ).toMatchObject({ offset: 20 })
    expect(proposalFor({ ...base, samples: samples(-12, 21, 6) })).toMatchObject({
      ok: false,
      reason: 'count',
    })
    expect(proposalFor({ ...base, samples: samples(-12, 31, 118) })).toMatchObject({
      ok: false,
      reason: 'sd',
    })
    expect(proposalFor({ ...base, samples: samples(-9, 21, 118) })).toMatchObject({
      ok: false,
      reason: 'small',
    })
    expect(proposalFor({ ...base, samples: s, calibEligible: false })).toBe(null)
  })
})
