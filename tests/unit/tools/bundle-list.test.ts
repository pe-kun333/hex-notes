import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { format } from 'prettier'
import { bulkSongs } from '../../../src/app/dev/dev-songs.ts'
import { BUNDLED_LIST } from '../../../src/app/bundled-list.ts'
import { BUNDLED_SONGS } from '../../../src/app/songs.ts'
import {
  BUNDLE_LIST_PATH,
  buildBundle,
  bundleIssues,
  bundleListText,
} from '../../../tools/charts/bundle.ts'
import { BUNDLE_SONGS } from '../../../tools/charts/bundle-songs.ts'
import { listCharts, readRights } from '../../../tools/charts/rights.ts'

// M4 の手順 3（同梱曲の表と検査、decisions #122）: 一覧は tools/charts/bundle-songs.ts の BUNDLE_SONGS 1 つで、charts:bundle が
// 製品の一覧 src/app/bundled-list.ts も書く。charts:bundle:check は一覧・譜面ファイル・権利表が同じ曲を指すかも見る。
// 出どころ: docs/planning/m4-kickoff.md 手順 3 の期待値 (1)(2)、tests-inventory「M4 手順 3」、ADR 0005。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const CONTENT = path.join(root, 'content', 'charts')
const rightsFiles = (): string[] =>
  (readRights(CONTENT)?.entries ?? []).flatMap((e) => (typeof e.file === 'string' ? [e.file] : []))

describe('製品の一覧（charts:bundle が書く）', () => {
  it('src/app/bundled-list.ts は道具の出力と 1 バイトも違わない。並びは BUNDLE_SONGS の順、名前は譜面の name', async () => {
    const built = await buildBundle(BUNDLE_SONGS)
    const text = bundleListText(built)
    expect(readFileSync(path.join(root, ...BUNDLE_LIST_PATH.split('/')), 'utf8')).toBe(text)
    expect(BUNDLED_LIST).toEqual(built.map((f) => [f.path.replace(/\.json$/, ''), f.name]))
    expect(BUNDLED_SONGS.map((s) => [s.id, s.name])).toEqual([
      ['bundled:tutorial/hajime', 'はじめの六角'],
      ['bundled:pd/twinkle', 'きらきら星'],
      ['bundled:pd/ode', '歓喜の歌'],
    ])
  })

  it('書いた中身は Prettier の形のまま（整形し直しても同じ）。名前の引用符も Prettier と同じ選び方', async () => {
    const text = bundleListText([
      { path: 'pd/a.json', name: "It's" },
      { path: 'pd/b.json', name: 'a\\b' },
    ])
    expect(text).toContain(`['pd/a', "It's"],`)
    expect(text).toContain(`['pd/b', 'a\\\\b'],`)
    const opts = { parser: 'typescript', semi: false, singleQuote: true, printWidth: 100 } as const
    expect(await format(text, opts)).toBe(text)
    const real = bundleListText(await buildBundle(BUNDLE_SONGS))
    expect(await format(real, opts)).toBe(real)
  })
})

describe('一覧・譜面・権利表の突き合わせ（期待値 (2)）', () => {
  const list = ['tutorial/hajime.json', 'pd/twinkle.json', 'pd/ode.json']
  const all = [...list].sort()

  it('今の 3 曲は欠け 0（content/charts/ と rights.json を読む）', () => {
    expect(BUNDLE_SONGS.map((s) => s.file)).toEqual(list)
    expect(bundleIssues(list, listCharts(CONTENT), rightsFiles())).toEqual([])
  })

  it('一覧に在って譜面が無い → 1 件', () => {
    expect(
      bundleIssues(
        list,
        all.filter((f) => f !== 'pd/ode.json'),
        all,
      ),
    ).toEqual(['pd/ode.json: 一覧に在って譜面が無い（npm run charts:bundle で書く）'])
  })

  it('一覧に在って権利表に行が無い → 1 件', () => {
    expect(
      bundleIssues(
        list,
        all,
        all.filter((f) => f !== 'pd/twinkle.json'),
      ),
    ).toEqual([
      'pd/twinkle.json: 一覧に在って権利表に行が無い（content/charts/rights.json に足す）',
    ])
  })

  it('譜面が在って一覧に無い → 1 件（権利表にも行があれば、その行の 1 件も）', () => {
    expect(bundleIssues(list, [...all, 'pd/extra.json'], all)).toEqual([
      'pd/extra.json: 譜面が在って一覧に無い（bundle-songs.ts に足すか、譜面を消す）',
    ])
    expect(bundleIssues(list, all, [...all, 'pd/old.json'])).toEqual([
      'pd/old.json: 権利表の行が一覧に無い',
    ])
  })
})

describe('DEV の 30 曲の複製（?bulk=30）', () => {
  it('同梱曲と合わせて n 曲。チュートリアル曲は複製しない。n が同梱曲以下なら 0 曲', () => {
    const b = bulkSongs(BUNDLED_SONGS, 30)
    expect(BUNDLED_SONGS.length + b.length).toBe(30)
    expect(b[0]).toMatchObject({ id: 'bundled:dev-bulk/4', name: '複製 4: きらきら星', url: '/content/charts/pd/twinkle.json' })
    expect(b[1]).toMatchObject({ id: 'bundled:dev-bulk/5', name: '複製 5: 歓喜の歌' })
    expect(b.some((s) => s.url.includes('tutorial'))).toBe(false)
    expect(bulkSongs(BUNDLED_SONGS, 3)).toEqual([])
    expect(bulkSongs(BUNDLED_SONGS, 0)).toEqual([])
  }) // prettier-ignore
})
