import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LIMIT_NOTE,
  axesOf,
  clockText,
  missingText,
  songCard,
  sortCards,
  variantsText,
  versionChoice,
  type CardContext,
} from '../../../src/app/home-view.ts'
import { bestOf, finishedSong } from '../../../src/results/best.ts'
import type { Chart, ResultRecord } from '../../../src/shared/types.ts'

// src/results/best.ts・src/app/home-view.ts（M1-08、M1 の手順 8）。出どころ: m1-kickoff 手順 8 の期待値（おすすめの並び、duet は
// vmpk を推奨、端末の上限 2／3 で選べる版、自己ベストはプロファイル×譜面版で keyset dfjk は入らない）・§7-10、design.md §1.3 S1・
// §2.4・§4.3・§4.4、m6 renderS1 L748–788・variantsText L606–609・L771・L784–786、tests-inventory「M1 手順 8」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = (...p: string[]): Chart =>
  JSON.parse(readFileSync(path.join(root, ...p), 'utf8')) as Chart
const fixture = (id: string): Chart =>
  read('tests', 'fixtures', 'charts', 'm1', `${id}.hexnote.json`)
const HAJIME = read('content', 'charts', 'tutorial', 'hajime.json')

const rec = (over: Partial<ResultRecord>): ResultRecord => ({
  id: 'r',
  chartId: 'c1',
  variantId: 'ableton/2/octave',
  profile: 'beginner',
  clock: 'novideo',
  mode: 'fixed',
  rate: 1,
  keyset: 'all',
  at: '2026-11-01T00:00:00.000Z',
  acc: 0.9,
  rank: 'A',
  counts: { perfect: 1, great: 0, good: 0, near: 0, miss: 0 },
  selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 },
  syncUsed: { kind: 'audio' },
  offsetUsed: 0,
  skipped: 0,
  ...over,
})
const KEY = {
  chartId: 'c1',
  variantId: 'ableton/2/octave',
  profile: 'beginner',
  clock: 'novideo',
} as const

describe('自己ベストと完走（§4.3・§4.4）', () => {
  it('同じ単位で完走の条件を満たす回の acc の最大（同じなら先）。keyset dfjk・skipped・テンポ違い・他の単位は入らない', () => {
    const rs = [
      rec({ id: 'a', acc: 0.8 }),
      rec({ id: 'b', acc: 0.95 }),
      rec({ id: 'c', acc: 0.95 }),
      rec({ id: 'd', acc: 0.99, keyset: 'dfjk' }),
      rec({ id: 'e', acc: 0.99, skipped: 1 }),
      rec({ id: 'f', acc: 0.99, rate: 0.75 }),
      rec({ id: 'g', acc: 0.99, variantId: 'vmpk/2/octave' }),
      rec({ id: 'h', acc: 0.99, profile: 'gamer' }),
      rec({ id: 'i', acc: 0.99, clock: 'video' }),
    ]
    expect(bestOf(rs, KEY)?.id).toBe('b')
    expect(bestOf([rec({ keyset: 'dfjk' })], KEY)).toBe(null)
    expect(bestOf([], KEY)).toBe(null)
  })

  it('完走印: その曲をそのプロファイルで 1 回でも完走（版は問わない）', () => {
    expect(finishedSong([rec({ variantId: 'vmpk/3/octave' })], 'c1', 'beginner')).toBe(true)
    expect(finishedSong([rec({ keyset: 'd' }), rec({ skipped: 2 })], 'c1', 'beginner')).toBe(false)
    expect(finishedSong([rec({})], 'c1', 'gamer')).toBe(false)
  })
})

describe('端末に合う版（§7-10）', () => {
  it('duet: ableton 版に落ちる音 1・vmpk 版 0 → vmpk を推奨して先頭、上限 2 を選ぶ', () => {
    const c = fixture('duet')
    const ch = versionChoice(c, 'ableton', null)
    expect([ch.recommended, ch.layouts]).toEqual(['vmpk', ['vmpk', 'ableton']])
    expect(ch.pick).toEqual({ layout: 'vmpk', limit: 2, fold: 'octave' })
  })

  it('端末の上限 2（未診断も 2）→ 3・4 は選べない、3 → 4 だけ選べない。同梱曲は 4 の版を持たない', () => {
    const c = fixture('twinkle')
    const lim = (d: 2 | 3 | 4 | null) => versionChoice(c, 'ableton', d).limits.map((x) => [x.limit, x.available, x.allowed])
    expect(lim(null)).toEqual([[2, true, true], [3, true, false], [4, false, false]])
    expect(lim(2)).toEqual(lim(null))
    expect(lim(3)).toEqual([[2, true, true], [3, true, true], [4, false, false]])
    expect(lim(4)).toEqual([[2, true, true], [3, true, true], [4, false, true]])
  }) // prettier-ignore

  it('設定の配列を先に（落ちる音が無ければ）、配列を選び直せる。チュートリアル曲は Ableton 型／上限 2 だけ', () => {
    const t = fixture('twinkle')
    expect(versionChoice(t, 'vmpk', 2).pick).toEqual({ layout: 'vmpk', limit: 2, fold: 'octave' })
    expect(versionChoice(t, 'ableton', 3, 'vmpk').pick?.layout).toBe('vmpk')
    const h = versionChoice(HAJIME, 'vmpk', 4)
    expect([h.layouts, h.pick]).toEqual([['ableton'], { layout: 'ableton', limit: 2, fold: 'octave' }])
    expect(h.limits.filter((x) => x.available).map((x) => x.limit)).toEqual([2])
    expect(missingText('ableton', 3, true)).toBe('この曲は Ableton 型／上限 3 の版を持ちません（チュートリアル曲は Ableton 型／上限 2 だけ）。')
  }) // prettier-ignore

  it('落ちる音が同じ数なら設定の配列のまま（vmpk の方が少ないときだけ推奨を替える）', () => {
    const v = (layout: 'ableton' | 'vmpk', keys: (string | null)[]) => ({ id: `${layout}/2/octave`, layout, limit: 2 as const, fold: 'octave' as const, keys })
    const same = { variants: [v('ableton', [null, 'KeyA']), v('vmpk', [null, 'KeyQ'])] }
    expect(versionChoice(same, 'ableton', 2).recommended).toBe('ableton')
    const fewer = { variants: [v('ableton', [null, null]), v('vmpk', [null, 'KeyQ'])] }
    expect(versionChoice(fewer, 'ableton', 2).recommended).toBe('vmpk')
  }) // prettier-ignore

  it('上限 2 の版が無い譜面は選べる最小の版、選べる版が無ければ null', () => {
    const t = fixture('twinkle')
    const only3 = { variants: (t.variants ?? []).filter((v) => v.limit === 3) }
    expect(versionChoice(only3, 'ableton', 3).pick).toEqual({
      layout: 'ableton',
      limit: 3,
      fold: 'octave',
    })
    expect(versionChoice(only3, 'ableton', 2).pick).toBe(null)
    expect(versionChoice({ variants: [] }, 'ableton', 2).pick).toBe(null)
  })
})

describe('曲カードと並び（m6 renderS1・visibleSongs）', () => {
  const ctx = (records: ResultRecord[] = []): CardContext => ({
    preferred: 'ableton',
    deviceLimit: null,
    profile: 'beginner',
    records,
    tutorialId: 'tut',
  })
  const IDS = ['scale', 'ode', 'chroma', 'twinkle', 'canon', 'duet']

  it('おすすめ ＝ 自動選択した版の密度の低い順: canon・twinkle・ode・duet・chroma・scale（手順 8 の表）', () => {
    const cards = IDS.map((id) => songCard(id, fixture(id), ctx()))
    expect(sortCards(cards, 'rec').map((c) => c.id)).toEqual(['canon', 'twinkle', 'ode', 'duet', 'chroma', 'scale'])
    expect(sortCards(cards, 'len').map((c) => c.id)).toEqual(['chroma', 'scale', 'duet', 'ode', 'canon', 'twinkle'])
    expect(sortCards(cards, 'name').map((c) => c.name)[0]).toBe('カノン進行（三和音）')
  }) // prettier-ignore

  it('カードの文字: 出どころ・BPM・長さ・譜面版・自己ベスト（入門者 ・ 譜面版）・完走印・チュートリアル', () => {
    const t = fixture('twinkle')
    const none = songCard('tw', t, ctx())
    expect([none.rights, none.bpm, none.length, none.variants, none.best, none.finished, none.tutorial]).toEqual([
      '出どころ PD', '96 BPM', '0:30', 'Ableton×{2,3}・VMPK×{2,3}', '自己ベスト —（入門者）', false, false,
    ])
    const r = rec({ chartId: t.id, acc: 0.942, rank: 'A' })
    const got = songCard('tw', t, ctx([r]))
    expect([got.best, got.finished]).toEqual(['自己ベスト 94.2% A（入門者 ・ ableton/2/octave）', true])
    const tut = songCard('tut', HAJIME, ctx())
    expect([tut.tutorial, tut.rights, tut.length, tut.variants]).toEqual([true, '出どころ 自作', '0:34', 'Ableton×{2}'])
  }) // prettier-ignore

  it('難度 4 軸: 密度 > 3.5・最大跳躍 ≥ 6 に注意（§2.4）。scale は密度で注意', () => {
    const s = songCard('s', fixture('scale'), ctx())
    expect(s.axes.map((a) => a.label)).toEqual(['密度', '跳躍', '同時押し', '段またぎ'])
    expect(s.axes[0]).toMatchObject({ text: '3.7 音/秒', caution: true })
    const ax = axesOf({ density: 3.5, leap: 2.25, leapMax: 6, chord: 0.333, rowCross: 1 })
    expect(ax.map((a) => [a.text, a.pct, a.caution])).toEqual([
      ['3.5 音/秒', 70, false],
      ['最大 6（平均 2.3）', 75, true],
      ['33%', 33, false],
      ['100%', 100, false],
    ])
    expect(axesOf(undefined).every((a) => a.pct === 0 && !a.caution)).toBe(true)
  })

  it('m:ss、上限の注記（m6 L771）、譜面版の一覧', () => {
    expect([clockText(0), clockText(59.6), clockText(125.4)]).toEqual(['0:00', '1:00', '2:05'])
    expect(LIMIT_NOTE).toBe('保証なし: 和音で 3 キー目が無反応なら設定で上限を戻せます。')
    expect(variantsText({ variants: [] })).toBe('なし')
  })
})
