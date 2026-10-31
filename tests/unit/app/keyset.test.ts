import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { proposalFor } from '../../../src/app/calibration.ts'
import {
  finishedPlay,
  newRun,
  runFrame,
  runInput,
  runPhase,
  runPress,
  runRelease,
  type Run,
  type RunSong,
} from '../../../src/app/play-runner.ts'
import { resultView } from '../../../src/app/result-view.ts'
import { variantFor } from '../../../src/app/songs.ts'
import {
  KEYSET_IDS,
  TUTORIAL_KEYSETS,
  filterKeyset,
  keysetCodes,
} from '../../../src/chart/keyset.ts'
import { buildVariant } from '../../../src/chart/variants.ts'
import { perfAt } from '../../../src/clock/map.ts'
import { neighborOf, rulesOf } from '../../../src/judge/judge.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import { isFinished } from '../../../src/results/record.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { FRAME_MS, START_NOW, planActions } from '../../../tools/harness/autoplay.ts'

// src/chart/keyset.ts と、鍵数制限を通した S2 のループ・記録・S3（M1-10、M1 の手順 7）。出どころ: design.md §3.2（実行時
// フィルタ、results.keyset）・§1.3 S0d（3 段階）・§2.3（成績の対象は全鍵）・§2.7（段 2 の母集団）、m6 L734、m1-kickoff
// 手順 7 の期待値・完了条件「1 曲から 3 段階が派生」、tests-inventory「M1 手順 7」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (...p: string[]): Chart =>
  JSON.parse(readFileSync(path.join(root, ...p), 'utf8')) as Chart
const HAJIME = read('content', 'charts', 'tutorial', 'hajime.json')
const TWINKLE = read('content', 'charts', 'pd', 'twinkle.json')

function tutorialSong(): RunSong {
  const variant = variantFor(HAJIME, { layout: 'ableton', limit: 2, fold: 'octave' })
  return { chartId: HAJIME.id, name: HAJIME.name, chart: HAJIME, variant }
}

function runOf(keyset: (typeof KEYSET_IDS)[number]): Run {
  const grid = buildKeyboardGrid('ableton', 1, { left: 0, top: 0 })
  return newRun(tutorialSong(), {
    rules: rulesOf(PROFILES.beginner, { neighbor: neighborOf(grid.byCode) }),
    sound: { melody: true, accomp: true, click: false },
    keyclick: true,
    keyset,
  })
}

/** 残った音だけをちょうどに押して終わるまで回す */
function playThrough(r0: Run): Run {
  let r = runInput(r0, START_NOW, { kind: 'start' }).run
  const actions = planActions(
    r.notes,
    (ms) => perfAt(r.map, ms),
    () => 0,
  )
  let k = 0
  for (let f = 1; runPhase(r) !== 'ended'; f++) {
    if (f > 100_000) throw new Error('終わらない')
    const now = START_NOW + f * FRAME_MS
    for (let a = actions[k]; a !== undefined && a.tsPerf <= now; a = actions[++k])
      r =
        a.kind === 'press'
          ? runPress(r, { code: a.code, tsPerf: a.tsPerf, lag: 0 }, a.tsPerf).run
          : runRelease(r, { code: a.code, tsPerf: a.tsPerf, forced: false }, a.tsPerf).run
    r = runFrame(r, now, now).run
  }
  return r
}

describe('鍵の集合（m1-kickoff 手順 7）', () => {
  it('d・dfjk・8 の鍵、all は制限なし。S0d の 3 段階は d → dfjk → all', () => {
    expect([...(keysetCodes('d') ?? [])]).toEqual(['KeyD'])
    expect([...(keysetCodes('dfjk') ?? [])]).toEqual(['KeyD', 'KeyF', 'KeyJ', 'KeyK'])
    expect([...(keysetCodes('8') ?? [])]).toEqual(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'])
    expect(keysetCodes('all')).toBe(null)
    expect(TUTORIAL_KEYSETS).toEqual(['d', 'dfjk', 'all'])
  }) // prettier-ignore

  it('集合に無い音を外し順は保つ。all は同じ配列', () => {
    const notes = ['KeyA', 'KeyD', 'KeyF', 'KeyQ', 'KeyD'].map((code, i) => ({ code, i }))
    expect(filterKeyset(notes, 'd').map((n) => n.i)).toEqual([1, 4])
    expect(filterKeyset(notes, 'dfjk').map((n) => n.i)).toEqual([1, 2, 4])
    expect(filterKeyset(notes, '8').map((n) => n.i)).toEqual([0, 1, 2, 4])
    expect(filterKeyset(notes, 'all')).toBe(notes)
  })
})

describe('1 曲から 3 段階（完了条件）', () => {
  it('同じ chartId・variantId（ableton/2/octave）から keyset だけが違う 3 段階。音の数 8 → 12 → 16、終わりは同じ', () => {
    const runs = TUTORIAL_KEYSETS.map(runOf)
    expect(runs.map((r) => [r.song.chartId, r.song.variant.id])).toEqual(
      TUTORIAL_KEYSETS.map(() => [HAJIME.id, 'ableton/2/octave']),
    )
    expect(runs.map((r) => r.notes.length)).toEqual([8, 12, 16])
    expect(runs[0]?.notes.every((n) => n.code === 'KeyD')).toBe(true)
    expect(new Set(runs.map((r) => r.endMs)).size).toBe(1)
    // ガイド音は外さない（旋律は 16 音とも鳴る）
    expect(runs.map((r) => r.items.filter((i) => i.part === 'melody').length)).toEqual([16, 16, 16])
  })

  it('外した音は判定に出ない: 残った音だけを押すと miss 0・精度 100%', () => {
    for (const k of TUTORIAL_KEYSETS) {
      const r = playThrough(runOf(k))
      const f = finishedPlay(r, { id: k, at: '2026-11-01T00:00:00.000Z', profile: 'beginner' })
      expect([f.record.counts.miss, f.record.acc, f.judge.counts.perfect], k).toEqual([0, 1, r.notes.length])
    }
  }) // prettier-ignore

  it('段階 1・2 は練習記録: keyset が記録に入り、完走・自己ベスト・校正 段 2 の母集団の外。段階 3 だけが通常プレイ', () => {
    const fs = TUTORIAL_KEYSETS.map((k) =>
      finishedPlay(playThrough(runOf(k)), {
        id: k,
        at: '2026-11-01T00:00:00.000Z',
        profile: 'beginner',
      }),
    )
    expect(fs.map((f) => f.record.keyset)).toEqual(['d', 'dfjk', 'all'])
    expect(fs.map((f) => isFinished(f.record))).toEqual([false, false, true])
    expect(fs.map((f) => f.calibEligible)).toEqual([false, false, true])
    expect(fs.map((f) => proposalFor(f) === null)).toEqual([true, true, false])
    const v = fs.map(resultView)
    expect(v.map((x) => x.title)).toEqual(['練習の結果', '練習の結果', '結果'])
    expect(v[1]?.rows.slice(-2)).toEqual([
      ['条件', '固定テンポ・1.0 倍・ホームポジション（D F J K）'],
      ['残すもの', '精度%と自力率だけ（自己ベスト・完走・オフセット提案の対象外）'],
    ])
    expect(v[2]?.rows.at(-1)).toEqual(['完走', 'はい（固定テンポ・1.0 倍・全鍵）'])
  })
})

describe('譜面版の選び方（チュートリアル曲は Ableton 型だけ）', () => {
  it('配列の版が無い譜面は作らずに譜面の版、ある配列なら上限違いは作る、版の無い譜面は作る', () => {
    expect(variantFor(HAJIME, { layout: 'vmpk', limit: 2, fold: 'octave' }).id).toBe(
      'ableton/2/octave',
    )
    expect(variantFor(TWINKLE, { layout: 'vmpk', limit: 2, fold: 'octave' }).id).toBe(
      'vmpk/2/octave',
    )
    const spec = { layout: 'ableton', limit: 3, fold: 'octave' } as const
    expect(variantFor(HAJIME, spec)).toEqual(buildVariant(HAJIME, spec))
    const bare = { ...TWINKLE, variants: undefined }
    expect(variantFor(bare, { layout: 'vmpk', limit: 2, fold: 'octave' })).toEqual(
      buildVariant(bare, { layout: 'vmpk', limit: 2, fold: 'octave' }),
    )
  })
})
