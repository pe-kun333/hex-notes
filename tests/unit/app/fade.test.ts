import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_PRACTICE,
  newRun,
  runControl,
  runFrame,
  runInput,
  runPhase,
  runPress,
  type Run,
  type RunOptions,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import { fadeBars, manualValue, selfLine, selfPartsText } from '../../../src/app/practice-view.ts'
import {
  beginnerRules,
  initialJudge,
  judgePress,
  judgeWaitHit,
  neighborOf,
  resultsByIndex,
  rulesOf,
} from '../../../src/judge/judge.ts'
import { fadeAfter, fadeOf, initialFade, type FadeState } from '../../../src/judge/self-rate.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { labelsFor } from '../../../src/layout/fallback.ts'
import {
  keyboardCommands,
  labelCommands,
  type LabelFade,
} from '../../../src/render/canvas/cells.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { memoryStorage, safeStorage } from '../../../src/storage/fallback.ts'
import { loadFade, saveFade } from '../../../src/storage/local.ts'
import { FRAME_MS, START_NOW } from '../../../tools/harness/autoplay.ts'

// 足場外し＋自力率（M2-04、M2 の手順 8）: 描画の α・判定の α の更新と退避・回の終わりの保存・S4 の棒と文。出どころ:
// m2-kickoff 手順 8 の期待値・§7-13、design.md §2.7「足場外し」「自力率」・§5.3 M2-04（完了条件「頻出音から薄くなる」）、
// m4 L314–315・L421・L430・L593–597、decisions #30 (d)・#41 (c)(d)・#45 (c)・#52 (d)・#73 (c)・#90、tests-inventory「M2 手順 8」。
// α ＝ 1 のときスナップショット 12 本が変わらないのは tests/unit/render/canvas/frames.test.ts（fade を渡さない）と下の同値の試験。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TWINKLE = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', 'twinkle.hexnote.json'), 'utf8')) as Chart // prettier-ignore
const SONG: RunSong = { chartId: TWINKLE.id, name: 'x', chart: TWINKLE, variant: TWINKLE.variants?.[0] as NonNullable<Chart['variants']>[number] } // prettier-ignore

function run(over: Partial<RunOptions> = {}): Run {
  const grid = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
  const opts: RunOptions = {
    rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode), labels: { kb: 'key', note: 'both' } }),
    sound: { melody: true, accomp: true, click: false },
    keyclick: false,
    ...over,
  }
  return runInput(newRun(SONG, opts), START_NOW, { kind: 'start' }).run
} // prettier-ignore

/** 着地に達した音を押しながら終わりまで回す */
function playThrough(r0: Run): Run {
  let r = r0
  let now = START_NOW
  for (let f = 0; f < 20_000 && runPhase(r) !== 'ended'; f++) {
    now += FRAME_MS
    const by = resultsByIndex(r.judge)
    if (runPhase(r) === 'playing')
      for (const n of r.notes)
        if (n.tLandMs <= r.t && (by.get(n.index)?.state ?? 'pending') === 'pending')
          r = runPress(r, { code: n.code, tsPerf: now, lag: null }, now).run
    r = runFrame(r, now, now).run
  }
  return r
}

describe('α の更新（§2.7「足場外し」、完了条件「頻出音から薄くなる」）', () => {
  it('正解 ×7 → 0.16（8 回目の判定から「ラベル無し」、7 回目は 0.28）、そこから外す → 0.46、NEAR・手動は不変', () => {
    let f = initialFade()
    const seq: number[] = []
    for (let i = 0; i < 7; i++) {
      f = fadeAfter(f, 60, 'hinted')
      seq.push(fadeOf(f, 60))
    }
    expect([seq[5], seq[6]]).toEqual([0.28, 0.16])
    expect(fadeOf(fadeAfter(f, 60, 'miss'), 60)).toBe(0.46)
    expect(fadeAfter(f, 60, 'near')).toBe(f)
    const manual: FadeState = { mode: 'manual', manual: 0.5, alpha: {} }
    expect(fadeAfter(manual, 60, 'solo')).toBe(manual)
  }) // prettier-ignore

  it('きらきら星 1 回を全部当てる: ソ（67、10 回）が最初に消え（23 音目 ＝ 拍 25、7 回目）、ミ・ファ（8 回）0.04、ド・レ（6 回）0.28 で見える、ラ（4 回）0.52', () => {
    const r = playThrough(run({ fade: initialFade() }))
    const a = (m: number): number => fadeOf(r.judge.fade, m)
    expect([a(67), a(64), a(65), a(60), a(62), a(69)]).toEqual([0, 0.04, 0.04, 0.28, 0.28, 0.52])
    // 最初に 0.2 を下回る音（譜面の順に当てた α を追う）
    let f = initialFade()
    const first = TWINKLE.notes.findIndex((n) => {
      f = fadeAfter(f, n.midi, 'hinted')
      return fadeOf(f, n.midi) < 0.2
    })
    expect([first, TWINKLE.notes[first]?.beat, TWINKLE.notes[first]?.midi]).toEqual([22, 25, 67])
    // ラベルが消えた後の正解は solo（ラベル無しで当てた）
    expect(r.judge.selfRate.solo).toBeGreaterThan(0)
  }) // prettier-ignore

  it('待ち中の誤打の後の正解（tainted）→ 自力率 miss 1・α ＋0.30', () => {
    const ns = [{ index: 0, code: 'KeyA', midi: 60, tLandMs: 1000, tEndMs: 1200, hold: false }]
    const s = judgeWaitHit(initialJudge(ns, beginnerRules(), { mode: 'linked', manual: 1, alpha: { 60: 0.4 } }), 0, { tainted: true }).state
    expect([s.selfRate.miss, fadeOf(s.fade, 60)]).toEqual([1, 0.7])
  }) // prettier-ignore

  it('退避（fadeFrozen）・α 0.1: 当てても hinted、α は 0.1 のまま。キー文字は必ず出る（labelsFor）', () => {
    const ns = [{ index: 0, code: 'KeyA', midi: 60, tLandMs: 1000, tEndMs: 1200, hold: false }]
    const fade: FadeState = { mode: 'linked', manual: 1, alpha: { 60: 0.1 } }
    const s = judgePress(initialJudge(ns, beginnerRules({ fadeFrozen: true, labels: { kb: 'none', note: 'none' } }), fade), { code: 'KeyA', tsPerf: 1000 }, { map: { a: 1, b: 0 }, now: 1000 }).state
    expect([s.results[0]?.self, fadeOf(s.fade, 60)]).toEqual(['hinted', 0.1])
    // 止めないときは none・none で solo、α は下がる
    const t = judgePress(initialJudge(ns, beginnerRules({ labels: { kb: 'none', note: 'none' } }), fade), { code: 'KeyA', tsPerf: 1000 }, { map: { a: 1, b: 0 }, now: 1000 }).state
    expect([t.results[0]?.self, fadeOf(t.fade, 60)]).toEqual(['solo', 0])
    expect([labelsFor('fallback', 'none'), labelsFor('fallback', 'note')]).toEqual(['key', 'both'])
  }) // prettier-ignore

  it('「最初から」は動いた α を引き継ぐ', () => {
    const r = playThrough(run({ fade: initialFade() }))
    const re = runControl({ ...r, session: { ...r.session, play: { phase: 'paused', source: 'novideo' } } }, START_NOW, { kind: 'choice', choice: 'restart' }, { imeStop: false })
    expect(re.step?.run.judge.fade).toEqual(r.judge.fade)
  }) // prettier-ignore
})

describe('描画の α（§7-13）', () => {
  const grid = buildKeyboardGrid('ableton', 28, { left: 0, top: 0 })
  const base = {
    mode: 'line' as const,
    pressed: new Set<string>(),
    glow: new Map<string, number>(),
    labels: 'both' as const,
    depth: true,
  }
  const at =
    (a: number): LabelFade =>
    () =>
      a

  it('α が全て 1 なら fade を渡しても渡さなくても同じコマンド（alpha の欄が出ない ＝ スナップショットが変わらない）', () => {
    expect(keyboardCommands(grid, { ...base, fade: at(1) })).toEqual(keyboardCommands(grid, base))
    expect(keyboardCommands(grid, base).texts.some((t) => t.alpha !== undefined)).toBe(false)
  }) // prettier-ignore

  it('α 0.5 の鍵の文字は alpha 0.5（♯ は対象外）、0.19 は描かない（鍵盤側のキー文字も）、空のキーは対象外', () => {
    const half = keyboardCommands(grid, { ...base, fade: at(0.5) }).texts
    const kinds = (ts: typeof half, tag: string): (number | undefined)[] => ts.filter((t) => t.tag === tag).map((t) => t.alpha)
    expect(new Set(kinds(half, 'label').filter((_, i) => i >= 0))).toEqual(new Set([0.5, undefined]))
    expect(new Set(kinds(half, 'noteName'))).toEqual(new Set([0.5]))
    expect(new Set(kinds(half, 'sharp'))).toEqual(new Set([undefined]))
    const gone = keyboardCommands(grid, { ...base, fade: at(0.19) }).texts
    expect(gone.filter((t) => t.tag === 'noteName')).toEqual([])
    // 残る label は空のキー（音の無いキー）の刻印だけ
    const emptyKeys = grid.cells.filter((c) => c.midi === null).length
    expect(gone.filter((t) => t.tag === 'label')).toHaveLength(emptyKeys)
    expect(gone.filter((t) => t.tag === 'sharp')).toHaveLength(half.filter((t) => t.tag === 'sharp').length)
    // 空のキー（midi null）は α の対象外（0.19 でも消さない、alpha も付けない）
    expect(labelCommands({ layer: 'keys', region: 'keys', paint: 'inkDim' }, 0, 0, 20, 'Q', null, 'key', 28, at(0.19)).map((t) => [t.tag, t.alpha])).toEqual([['label', undefined]])
    // セル 1 つ: 音名だけ（note）も α で
    expect(labelCommands({ layer: 'notes', region: 'stage', paint: 'ink' }, 0, 0, 20, 'A', 60, 'note', 28, at(0.3)).map((t) => t.alpha)).toEqual([0.3])
  }) // prettier-ignore
})

describe('保存と S4 の表示', () => {
  it('回の終わりの α を hexnote.fade に（小数 3 桁）、読み直して同じ', () => {
    const kv = safeStorage('local', () => memoryStorage(), () => {})
    const f: FadeState = { mode: 'linked', manual: 1, alpha: { 67: 0, 64: 0.04, 60: 0.28, 69: 0.52 } }
    expect(saveFade(kv, f)).toBe(true)
    expect(loadFade(kv)).toEqual(f)
    expect(JSON.parse(kv.get('hexnote.fade') ?? '{}')).toEqual({ v: 1, ...f, alpha: { 60: 0.28, 64: 0.04, 67: 0, 69: 0.52 } })
  }) // prettier-ignore

  it('音高ごとの棒（昇順・音名・%・0.2 未満は off）、手動の値は 5% 刻み、自力率 62% と 4 区分', () => {
    const f: FadeState = { mode: 'linked', manual: 1, alpha: { 67: 0.16, 60: 0.28 } }
    expect(fadeBars(f, [67, 60, 69, 60]).map((b) => [b.name, b.pct, b.hidden])).toEqual([['C4', 28, false], ['G4', 16, true], ['A4', 100, false]])
    expect([manualValue(47), manualValue(103), manualValue(-1), manualValue(52.4)]).toEqual([0.45, 1, 0, 0.5])
    const s = { solo: 31, hinted: 10, near: 5, miss: 4 }
    expect([selfLine(s), selfPartsText(s)]).toEqual(['62%（ラベル無しで当てた 31／50）', 'ラベル無しで当てた 31・ヒント付き 10・NEAR 5・外した 4'])
  }) // prettier-ignore

  it('S4 の既定の練習でも α は動く（練習記録の回でも、§7-13）', () => {
    const r = playThrough(run({ fade: initialFade(), practice: { ...DEFAULT_PRACTICE, mode: 'fixed', autoTempo: false, autoLoop: false } }))
    expect(fadeOf(r.judge.fade, 67)).toBe(0)
  }) // prettier-ignore
})
