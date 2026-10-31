import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { variantsText, versionChoice } from '../../../src/app/home-view.ts'
import {
  LIBRARY_EMPTY,
  MAKE_BUTTON,
  MAKE_MISSING,
  backupCharts,
  canMakeVariant,
  chartImportKind,
  chartImportText,
  deleteSure,
  deletedText,
  emptyListText,
  filterChoices,
  libraryRows,
  rebuildChart,
  rebuildSpecs,
  rebuiltText,
  songVisible,
  withVariant,
  type SongFilter,
} from '../../../src/app/library-view.ts'
import { BUNDLED_SONGS, songList, type SongEntry } from '../../../src/app/songs.ts'
import { computeChartId } from '../../../src/chart/hash.ts'
import { chartFromSmf } from '../../../src/chart/import.ts'
import { parseSmf, type Smf } from '../../../src/chart/smf.ts'
import { validateChart } from '../../../src/chart/validate.ts'
import type { Chart, ResultRecord } from '../../../src/shared/types.ts'
import { memoryDb } from '../../../src/storage/fallback.ts'
import {
  MAX_IMPORT_CHARS,
  backupFileText,
  chartFileName,
  chartFileText,
  importText,
  makeBackup,
} from '../../../src/storage/file.ts'
import { initialFade } from '../../../src/judge/self-rate.ts'
import { defaultSettings } from '../../../src/storage/local.ts'
import { M5_EXAMPLES } from '../../../tools/charts/mel-songs.ts'
import { format1ThreeTracks, melToSmf } from '../../fixtures/smf/build.ts'

// src/app/library-view.ts・songs.ts の songList（M2-06、M2 の手順 4）と、storage/file.ts の往復を持ち込み曲で。出どころ:
// m2-kickoff 手順 4 の期待値・§7-6・§7-18・§7-27、design.md §1.3 S1・S6・§3.3・§4.3・§5.3 M2-06（完了条件「JSON 往復で同じ
// id」）、m6 S1 L311・visibleSongs L738–746・renderS1 L781–786・makevariant L966・S6 L927、decisions #53・#84・#86、
// tests-inventory「M2 手順 4」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const THREE: Smf = parseSmf(format1ThreeTracks())
const TWINKLE_TEXT = readFileSync(
  path.join(root, 'content', 'charts', 'pd', 'twinkle.json'),
  'utf8',
)

/** 持ち込み曲（S5 の保存と同じ chartFromSmf。fold cut は同梱曲に無い fold） */
const imported = (over: { play?: number; fold?: 'octave' | 'cut' | 'nearest'; name?: string } = {}): Promise<Chart> =>
  chartFromSmf({
    smf: THREE,
    play: over.play ?? 0,
    accomp: over.play === 1 ? [0] : [1],
    fold: over.fold ?? 'cut',
    name: over.name ?? 'three',
    composer: '作者',
    created: '2026-11-01T12:00:00.000Z',
  }) // prettier-ignore

const rec = (chartId: string): ResultRecord => ({
  id: 'r1',
  chartId,
  variantId: 'ableton/2/cut',
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
})

describe('JSON 往復（完了条件「JSON 往復で同じ id」、§5.3 M2-06）', () => {
  it('持ち込み曲を書き出し → importText で同じ id・同じ variants（曲全体が同じ）。足した上限 4 の版も同じ', async () => {
    const c = await imported()
    const r = await importText(chartFileText(c))
    expect(r).toEqual({ kind: 'chart', chart: c, idChanged: false })
    const c4 = withVariant(c, { layout: 'ableton', limit: 4 })
    const r4 = await importText(chartFileText(c4))
    expect(r4.kind === 'chart' && r4.chart.variants?.map((v) => v.id)).toEqual([
      'ableton/2/cut',
      'ableton/3/cut',
      'vmpk/2/cut',
      'vmpk/3/cut',
      'ableton/4/cut',
    ])
    expect(r4).toEqual({ kind: 'chart', chart: c4, idChanged: false })
    expect(chartFileName(c)).toBe('three.hexnote.json')
  })

  it('id が中身と合わないファイル → 付け直して idChanged（文に出す）', async () => {
    const c = await imported()
    const r = await importText(chartFileText({ ...c, id: 'sha256:' + '0'.repeat(64) }))
    expect(r).toEqual({ kind: 'chart', chart: c, idChanged: true })
    expect(chartImportText('new', c.name, true)).toBe(
      '曲「three」を取り込みました（ホームの一覧に出ます）。id が中身と合わなかったので付け直しました。',
    )
  })

  it('同梱曲と同じ id は断る、持ち込み済みは上書き、無ければ新しく（§7-18）', async () => {
    const r = await importText(TWINKLE_TEXT)
    if (r.kind !== 'chart') throw new Error(r.kind)
    const bundled = [r.chart.id]
    expect(chartImportKind(r.chart.id, bundled, false)).toBe('bundled')
    expect(chartImportKind(r.chart.id, bundled, true)).toBe('bundled')
    expect(chartImportKind('sha256:x', bundled, true)).toBe('overwrite')
    expect(chartImportKind('sha256:x', bundled, false)).toBe('new')
    expect(chartImportText('bundled', 'きらきら星', false)).toBe(
      '「きらきら星」は同梱曲と同じ曲なので取り込みません（同梱曲をそのまま遊べます）。',
    )
    expect(chartImportText('overwrite', 'three', false)).toBe(
      '曲「three」を取り込みました（ホームの一覧に出ます）。同じ曲があったので上書きしました（記録は残ります）。',
    )
  })

  it('10 MiB を超えるファイルは断る（#53 (e)）', async () => {
    expect(await importText(' '.repeat(MAX_IMPORT_CHARS + 1))).toMatchObject({
      kind: 'error',
      reason: 'too_large',
    })
  })

  it('控えの往復に持ち込み曲 3 曲（カノン進行を含む）。同梱曲と同じ id の曲は持ち込みにしない（記録はそのまま）', async () => {
    const canon = await chartFromSmf({ smf: parseSmf(melToSmf(M5_EXAMPLES.canon)), play: 0, fold: 'octave', name: 'canon' })
    const charts = [await imported(), await imported({ play: 1, fold: 'nearest', name: 'chords' }), canon]
    expect(new Set(charts.map((c) => c.id)).size).toBe(3)
    const b = makeBackup({ settings: defaultSettings(), fade: initialFade(), charts, results: [rec(charts[0]?.id ?? '')] }, '2026-11-01T00:00:00.000Z')
    const r = await importText(backupFileText(b))
    if (r.kind !== 'backup') throw new Error(r.kind)
    expect(r.backup.charts).toEqual(charts)
    expect([r.dropped, r.idChanged]).toEqual([{ charts: 0, results: 0 }, 0])
    const twinkle = await importText(TWINKLE_TEXT)
    if (twinkle.kind !== 'chart') throw new Error(twinkle.kind)
    const mixed = backupCharts([...charts, twinkle.chart], [twinkle.chart.id])
    expect([mixed.keep, mixed.bundled]).toEqual([charts, 1])
  }) // prettier-ignore
})

describe('削除と作り直し（§7-18）', () => {
  it('削除 → listCharts から消え、記録は残り、S1 の一覧（songList）から消える', async () => {
    const db = memoryDb()
    const c = await imported()
    await db.putChart(c)
    await db.putResult(rec(c.id))
    expect(songList(BUNDLED_SONGS, await db.listCharts()).map((s) => s.id)).toEqual([
      'bundled:tutorial/hajime',
      'bundled:pd/twinkle',
      'bundled:pd/ode',
      `local:${c.id}`,
    ])
    await db.deleteChart(c.id)
    expect(await db.listCharts()).toEqual([])
    expect((await db.listResults(c.id)).map((r) => r.id)).toEqual(['r1'])
    expect(songList(BUNDLED_SONGS, await db.listCharts()).map((s) => s.source)).toEqual([
      'bundled',
      'bundled',
      'bundled',
    ])
    // 持ち込み曲は同梱曲の後に曲名の順（日本語）
    const b = await imported({ play: 1, name: 'ゆき' })
    const a = await imported({ name: 'あめ' })
    expect(songList([], [b, a]).map((s) => s.name)).toEqual(['あめ', 'ゆき'])
  })

  it('作り直し: fold は保存時のまま（cut）、規則が同じなら keys・stats・metrics も同じ、id は変わらない', async () => {
    const c = await imported()
    const again = rebuildChart(c)
    expect(again).toEqual(c)
    expect(await computeChartId(again)).toBe(c.id)
    // 壊れた keys・抜けた metrics は今の規則で戻る
    const broken: Chart = { ...c, variants: (c.variants ?? []).map((v) => ({ id: v.id, layout: v.layout, limit: v.limit, fold: v.fold, keys: v.keys.map(() => null) })) }
    expect(rebuildChart(broken)).toEqual(c)
    expect(validateChart(again).ok).toBe(true)
  }) // prettier-ignore

  it('作り直す版: 足した上限 4 の版は残し、版の無い譜面は曲の fold（無ければ octave）の 4 版', async () => {
    const c4 = withVariant(await imported(), { layout: 'ableton', limit: 4 })
    expect(rebuildSpecs(c4).map((s) => `${s.layout}/${s.limit}/${s.fold}`)).toEqual([
      'ableton/2/cut',
      'ableton/3/cut',
      'vmpk/2/cut',
      'vmpk/3/cut',
      'ableton/4/cut',
    ])
    expect(rebuildChart(c4)).toEqual(c4)
    const bare: Chart = { ...c4 }
    delete bare.variants
    expect(rebuildChart(bare).variants?.map((v) => v.id)).toEqual([
      'ableton/2/octave',
      'ableton/3/octave',
      'vmpk/2/octave',
      'vmpk/3/octave',
    ])
    expect(rebuiltText(2, 0)).toBe('2 曲の版を作り直しました。')
    expect(rebuiltText(1, 1)).toBe('1 曲の版を作り直しました（1 曲は作り直せませんでした）。')
    expect(rebuiltText(0, 0)).toBe('持ち込み曲がありません。')
  })
})

describe('S1 の「この配列／上限の版を作る」（§1.3 S1、m6 L781–786・L966）', () => {
  it('端末の上限 4: 持ち込み曲の Ableton／上限 4 は版が無く作れる → 足すと ableton/4/<fold> が選べる。id は同じ', async () => {
    const c = await imported()
    const before = versionChoice(c, 'ableton', 4, 'ableton')
    const at4 = before.limits.find((x) => x.limit === 4)
    expect(at4).toEqual({ limit: 4, available: false, allowed: true })
    expect(canMakeVariant('local', at4)).toBe(true)
    // 同梱曲は作らない（「この曲は ○○／上限 n の版を持ちません」のまま）
    expect(canMakeVariant('bundled', at4)).toBe(false)
    const c4 = withVariant(c, { layout: 'ableton', limit: 4 })
    expect(c4.id).toBe(c.id)
    const v4 = c4.variants?.find((v) => v.id === 'ableton/4/cut')
    expect([v4?.fold, v4?.keys.length, v4?.metrics === undefined]).toEqual(['cut', c.notes.length, false])
    const after = versionChoice(c4, 'ableton', 4, 'ableton')
    expect(after.limits.find((x) => x.limit === 4)).toEqual({ limit: 4, available: true, allowed: true })
    expect(variantsText(c4)).toBe('Ableton×{2,3,4}・VMPK×{2,3}')
    // 既にあればそのまま
    expect(withVariant(c4, { layout: 'ableton', limit: 4 })).toBe(c4)
    expect([MAKE_MISSING, MAKE_BUTTON]).toEqual(['この配列／上限の版はまだありません。', 'この配列／上限の版を作る'])
  }) // prettier-ignore

  it('端末の上限 2（未診断も）: 上限 3・4 は選べず、版を作る釦は出ない。版のある上限にも出ない', async () => {
    const c = await imported()
    for (const limit of [2, null] as const) {
      const ch = versionChoice(c, 'ableton', limit, 'ableton')
      expect(ch.limits.map((x) => canMakeVariant('local', x))).toEqual([false, false, false])
    }
    expect(canMakeVariant('local', undefined)).toBe(false)
  })
})

describe('S1 のフィルタ（すべて／同梱／持ち込み。初回は出さない、§7-27）', () => {
  const local = { id: 'local:x', name: 'x', source: 'local', load: async () => null } as const
  const entries: readonly SongEntry[] = [...BUNDLED_SONGS, local]
  const visible = (filter: SongFilter, first: boolean): string[] =>
    entries.filter((e) => songVisible(e.source, filter, first)).map((e) => e.id)

  it('持ち込み → 同梱曲が消える、同梱 → 持ち込み曲が消える、すべて → 全部', () => {
    expect(filterChoices(false)).toEqual(['all', 'bundled', 'local'])
    expect(visible('local', false)).toEqual(['local:x'])
    expect(visible('bundled', false)).toEqual(BUNDLED_SONGS.map((s) => s.id))
    expect(visible('all', false)).toHaveLength(4)
    expect(emptyListText('local')).toBe('持ち込み曲はまだありません（「＋ 曲を持ち込む」から）。')
    expect(emptyListText('all')).toBe('曲の一覧は準備中です。')
  })

  it('初回 → フィルタ自体が出ず、同梱曲だけ（m6 visibleSongs L739）', () => {
    expect(filterChoices(true)).toBeNull()
    for (const f of ['all', 'bundled', 'local'] as const)
      expect(visible(f, true)).toEqual(BUNDLED_SONGS.map((s) => s.id))
  })
})

describe('S6 の持ち込み曲の一覧と文言', () => {
  it('曲名の順（日本語）、曲名・作者・持ち込み日（ローカル日付）・版の id、版なしのファイル名', async () => {
    const a = await imported({ name: 'ゆき' })
    const b = { ...(await imported({ play: 1, name: 'あめ' })), created: undefined }
    delete b.created
    expect(libraryRows([a, b])).toEqual([
      { id: b.id, name: 'あめ', line: 'あめ — 作者 ・ 持ち込み — ・ 版 ableton/2/cut・ableton/3/cut・vmpk/2/cut・vmpk/3/cut', fileName: 'あめ.hexnote.json' },
      { id: a.id, name: 'ゆき', line: 'ゆき — 作者 ・ 持ち込み 2026-11-01 ・ 版 ableton/2/cut・ableton/3/cut・vmpk/2/cut・vmpk/3/cut', fileName: 'ゆき.hexnote.json' },
    ])
    expect(libraryRows([])).toEqual([])
    expect(LIBRARY_EMPTY).toBe('持ち込み曲はありません（ホームの「＋ 曲を持ち込む」から）。')
    expect(deleteSure('ゆき')).toBe('本当に「ゆき」を削除')
    expect(deletedText('ゆき')).toBe('「ゆき」を削除しました（記録は残ります。曲のファイルか控えを取り込めば戻せます）。')
  }) // prettier-ignore
})
