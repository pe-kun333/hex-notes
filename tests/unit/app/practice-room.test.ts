import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_PRACTICE,
  TUTORIAL_PRACTICE,
  finishedPlay,
  newRun,
  runBar,
  runBars,
  runFrame,
  runInput,
  runPhase,
  runPress,
  runSetPractice,
  type PracticeOptions,
  type Run,
  type RunOptions,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import {
  WAIT_CHOICES,
  bandClick,
  isPracticeRun,
  loopBand,
  loopBandText,
  loopStatus,
  practiceEntryText,
  practiceNote,
  rangeFrom,
  selfLine,
  tempoText,
  weakRange,
} from '../../../src/app/practice-view.ts'
import { conditionText, resultView } from '../../../src/app/result-view.ts'
import { canGo, navigate } from '../../../src/app/router.ts'
import { neighborOf, resultsByIndex, rulesOf } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import { isFirstClear } from '../../../src/results/awards.ts'
import { isFinished } from '../../../src/results/record.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { FRAME_MS, START_NOW } from '../../../tools/harness/autoplay.ts'

// S4 練習室（M2-03 後半、M2 の手順 6）: practice-view.ts（純関数）・play-runner.ts の runSetPractice・runBar・S0d の音待ち・
// router。出どころ: m2-kickoff 手順 6 の期待値・§7-7・§7-8・§7-9・§7-26、design.md §1.3 S4・S3・S0d・§1.2、m6 S4 L395–452・
// renderS4 L871–884・L387・L827・L858・L987–989、decisions #61・#74 (e)・#82・#88、tests-inventory「M2 手順 6」。
// DOM（パネル・入口の釦・3 視口）は browser pane で見る。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (...p: string[]): Chart =>
  JSON.parse(readFileSync(path.join(root, ...p), 'utf8')) as Chart
const TWINKLE = read('tests', 'fixtures', 'charts', 'm1', 'twinkle.hexnote.json')
const HAJIME = read('content', 'charts', 'tutorial', 'hajime.json')
const songOf = (c: Chart): RunSong => ({ chartId: c.id, name: c.name, chart: c, variant: c.variants?.[0] as NonNullable<Chart['variants']>[number] }) // prettier-ignore

function room(song: RunSong, practice: PracticeOptions, keyset: RunOptions['keyset'] = 'all'): Run {
  const grid = buildKeyboardGrid(song.variant.layout, 28, { left: 0, top: 0 })
  const opts: RunOptions = {
    rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode), labels: { kb: 'both', note: 'both' } }),
    sound: { melody: true, accomp: true, click: false },
    keyclick: true,
    keyset,
    practice,
  }
  return newRun(song, opts)
} // prettier-ignore

/** 未判定で着地に達した音を押しながら回し、stop で止める（practice-runner.test.ts と同じ形） */
function drive(
  r0: Run,
  stop: (r: Run) => boolean,
  press = true,
  from = START_NOW,
): { run: Run; now: number } {
  let r = r0
  let now = from
  for (let f = 0; f < 20_000; f++) {
    if (stop(r)) return { run: r, now }
    now += FRAME_MS
    const by = resultsByIndex(r.judge)
    const ph = runPhase(r)
    if (press && (ph === 'playing' || ph === 'waiting'))
      for (const n of r.notes)
        if (n.tLandMs <= r.t && (by.get(n.index)?.state ?? 'pending') === 'pending')
          r = runPress(r, { code: n.code, tsPerf: now, lag: null }, now).run
    r = runFrame(r, now, now).run
  }
  throw new Error('止まらない')
}
const started = (r: Run): Run => runInput(r, START_NOW, { kind: 'start' }).run

describe('練習の設定の既定と文言（§7-7、m6 L875–878・L827）', () => {
  it('既定は 音待ち・1.0・ループ無し・自動ループ ON・自動昇降 ON。S0d は音待ちで自動なし', () => {
    expect(DEFAULT_PRACTICE).toEqual({ mode: 'note', rate: 1, loop: null, autoLoop: true, autoTempo: true })
    expect(TUTORIAL_PRACTICE).toEqual({ mode: 'note', rate: 1, loop: null, autoLoop: false, autoTempo: false })
    expect(WAIT_CHOICES.map((c) => c.label)).toEqual(['音待ち', 'フレーズ待ち', '固定テンポ'])
    expect(WAIT_CHOICES[0]?.note).toBe('音待ち: どのノートも自分のキーにはまる位置で止まり、正しいキーを押すと進みます。')
  }) // prettier-ignore

  it('固定・1.0・全鍵は通常プレイ（注記なし）。他は「この回は練習記録（音待ち・テンポ 0.75・全鍵）。」', () => {
    expect([isPracticeRun({ mode: 'fixed', rate: 1 }, 'all'), practiceNote({ mode: 'fixed', rate: 1 }, 'all')]).toEqual([false, null])
    expect(practiceNote({ mode: 'note', rate: 0.75 }, 'all')).toBe('この回は練習記録（音待ち・テンポ 0.75・全鍵）。')
    expect(practiceNote({ mode: 'fixed', rate: 0.75 }, 'all')).toBe('この回は練習記録（固定テンポ・テンポ 0.75・全鍵）。')
    expect(practiceNote({ mode: 'fixed', rate: 1 }, 'dfjk')).toBe('この回は練習記録（固定テンポ・テンポ 1.0・ホームポジション（D F J K））。')
    expect([tempoText(1), tempoText(1.25), tempoText(0.5)]).toEqual(['1.0', '1.25', '0.5'])
  }) // prettier-ignore

  it('ループ中の帯「17〜18 小節をループ中」、苦手区間を引き継いだら「結果画面の苦手区間を引き継ぎました。ノーミス 2 周で解除します。」', () => {
    expect(loopBandText({ startBar: 17, endBar: 18 }, true)).toEqual({ title: '17〜18 小節をループ中', detail: '結果画面の苦手区間を引き継ぎました。ノーミス 2 周で解除します。' })
    expect(loopBandText({ startBar: 3, endBar: 3 }, false)).toEqual({ title: '3 小節をループ中', detail: 'ノーミス 2 周で解除します。' })
    expect(loopBandText(null, true)).toBeNull()
    expect([loopStatus({ startBar: 5, endBar: 6 }, 2, true), loopStatus(null, 0, true), loopStatus(null, 0, false)]).toEqual(['区間 5〜6 小節（2 周）', '区間なし（2 小節でミス 3 回なら自動でループ）', '区間なし（自動ループ OFF）'])
  }) // prettier-ignore

  it('帯: クリック 2 回で始点 → 終点（逆順は入れ替え）、「今の小節から 2 小節」は最後の小節を越えない', () => {
    const a = bandClick(null, 7)
    expect(a).toEqual({ pending: 7, range: null })
    expect(bandClick(7, 5)).toEqual({ pending: null, range: { startBar: 5, endBar: 7 } })
    expect(loopBand(4, { startBar: 2, endBar: 3 }, 4, 1).map((c) => [c.in, c.start, c.now])).toEqual([[false, false, true], [true, false, false], [true, false, false], [false, true, false]])
    expect([rangeFrom(5, 12), rangeFrom(12, 12), rangeFrom(1, 1)]).toEqual([{ startBar: 5, endBar: 6 }, { startBar: 11, endBar: 12 }, { startBar: 1, endBar: 1 }])
  }) // prettier-ignore

  it('自力率「62%（ラベル無しで当てた 31／50）」（§1.3 S4）。S3 の釦と苦手区間', () => {
    expect(selfLine({ solo: 31, hinted: 10, near: 5, miss: 4 })).toBe('62%（ラベル無しで当てた 31／50）')
    expect(selfLine({ solo: 0, hinted: 0, near: 0, miss: 0 })).toBe('—（まだ判定がありません）')
    expect(weakRange({ from: 17, to: 18 })).toEqual({ startBar: 17, endBar: 18 })
    expect([practiceEntryText({ startBar: 17, endBar: 18 }), practiceEntryText(weakRange(null))]).toEqual(['練習室で弾く（17〜18 小節をループ）', '練習室で弾く'])
  }) // prettier-ignore
})

describe('S4 の回（期待値: 記録・条件・設定の途中の変更）', () => {
  const song = songOf(TWINKLE)

  it('S4 で固定・1.0・全鍵（自動ループ・自動昇降 ON のまま、全部当てる）→ 記録は通常（isFinished 真）、S3 は「結果」', () => {
    const d = drive(started(room(song, { ...DEFAULT_PRACTICE, mode: 'fixed', autoTempo: false })), (r) => runPhase(r) === 'ended')
    const f = finishedPlay(d.run, { id: 'x', at: '2026-11-01T00:00:00.000Z', profile: 'beginner' })
    expect([f.record.mode, f.record.rate, isFinished(f.record), f.calibEligible, resultView(f).title]).toEqual(['fixed', 1, true, true, '結果'])
  }) // prettier-ignore

  it('音待ちで 1 回 → mode note、S3 は「練習の結果」、条件「音待ち・1.0 倍・全鍵」', () => {
    const d = drive(started(room(song, { ...DEFAULT_PRACTICE, autoTempo: false })), (r) => runPhase(r) === 'ended')
    const f = finishedPlay(d.run, { id: 'x', at: '2026-11-01T00:00:00.000Z', profile: 'beginner' })
    const v = resultView(f)
    expect([f.record.mode, v.title, conditionText(f.record)]).toEqual(['note', '練習の結果', '音待ち・1.0 倍・全鍵'])
  }) // prettier-ignore

  it('待ち中に固定テンポへ替える → 待っていた着地 − 300 ms から止まらずに続く', () => {
    // 押さずに回すと最初の音（拍 0、t 0）で止まる
    const d = drive(started(room(song, DEFAULT_PRACTICE)), (r) => runPhase(r) === 'waiting', false)
    expect(d.run.practice?.wait.group?.landMs).toBe(0)
    const s = runSetPractice(d.run, d.now, { mode: 'fixed' })
    expect([runPhase(s.run), s.run.practice?.mode, s.run.practice?.wait.group, s.run.t]).toEqual(['syncing', 'fixed', null, -300])
    // 固定テンポなのでもう止まらない（押さずに回すと miss になって進む）
    const later = drive(s.run, (r) => r.t > 3000 || runPhase(r) === 'waiting', false, d.now)
    expect(runPhase(later.run)).not.toBe('waiting')
  }) // prettier-ignore

  it('走っている回にテンポ段 0.75 → 段が切り替わり、区間を決めると始点の 1 小節前へ頭出し。区間を外すと止めずに続く', () => {
    let d = drive(started(room(song, { ...DEFAULT_PRACTICE, mode: 'fixed', autoLoop: false, autoTempo: false })), (r) => r.t > 6000)
    let r = runSetPractice(d.run, d.now, { rate: 0.75 }).run
    expect([r.practice?.rate, r.practice?.rates]).toEqual([0.75, [1, 0.75]])
    r = runSetPractice(r, d.now + 1, { loop: { startBar: 5, endBar: 6 } }).run
    expect([r.t, r.practice?.loop.range]).toEqual([7500, { startBar: 5, endBar: 6 }])
    d = drive(r, (x) => x.t > 9000, true, d.now + 1)
    const off = runSetPractice(d.run, d.now, { loop: null }).run
    expect([off.practice?.loop.range, off.t]).toEqual([null, d.run.t])
  }) // prettier-ignore

  it('今の小節と小節の数（きらきら星 12 小節。助走は 1 小節目）', () => {
    const r = room(song, DEFAULT_PRACTICE)
    expect([runBar(r), runBars(r)]).toEqual([1, 12])
    const d = drive(started(room(song, { ...DEFAULT_PRACTICE, mode: 'fixed' })), (x) => x.t >= 5000)
    expect(runBar(d.run)).toBe(3)
  })
})

describe('S0d の音待ち（#61・#82、§7-8）', () => {
  const song = songOf(HAJIME)

  it('段階 1（鍵 d）は音待ちで止まる。記録は mode note・keyset d', () => {
    const d = drive(started(room(song, TUTORIAL_PRACTICE, 'd')), (r) => runPhase(r) === 'waiting', false)
    expect([runPhase(d.run), d.run.practice?.mode, d.run.opts.keyset]).toEqual(['waiting', 'note', 'd'])
  }) // prettier-ignore

  it('段階 3 の完走（音待ち・全鍵）は初クリアに入らない。S1 からの通常プレイの完走は入る', () => {
    const d = drive(started(room(song, TUTORIAL_PRACTICE)), (r) => runPhase(r) === 'ended')
    const s0d = finishedPlay(d.run, { id: 'a', at: '2026-11-01T00:00:00.000Z', profile: 'beginner' }).record
    expect([s0d.mode, isFinished(s0d), isFirstClear([s0d], s0d)]).toEqual(['note', false, false])
    const normal = { ...s0d, id: 'b', mode: 'fixed' as const }
    expect(isFirstClear([s0d, normal], normal)).toBe(true)
  }) // prettier-ignore
})

describe('router（S4、§7-26）', () => {
  it('S1・S3 → S4、S4 → S2・S3・S1。S4 から S6 へは行けない（歯車なし）', () => {
    expect([canGo('S1', 'S4'), canGo('S3', 'S4'), canGo('S4', 'S2'), canGo('S4', 'S3'), canGo('S4', 'S1')]).toEqual([true, true, true, true, true])
    expect([canGo('S4', 'S6'), canGo('S2', 'S4'), canGo('S5', 'S4')]).toEqual([false, false, false])
    const at4 = navigate({ screen: 'S1', back: null }, 'S4')
    expect(navigate(at4, 'S6')).toBe(at4)
  }) // prettier-ignore
})

describe('途切れたフレーム（browser pane で見つけた）', () => {
  it('音待ち: フレームが 1.5 s 途切れて t が着地を大きく越えても、待つ音を MISS にせず最初の音で止まる', () => {
    let r = started(room(songOf(TWINKLE), { ...DEFAULT_PRACTICE, autoTempo: false }))
    r = runFrame(r, START_NOW + 400, START_NOW + 400).run
    // 助走 2,000 ms の後、拍 0・1・2（0・625・1,250 ms）を越えた所まで 1 フレームで飛ぶ
    r = runFrame(r, START_NOW + 400 + 3500, START_NOW + 400 + 3500).run
    expect([runPhase(r), r.practice?.wait.group?.landMs, r.judge.score.counts.miss]).toEqual(['waiting', 0, 0])
  }) // prettier-ignore
})
