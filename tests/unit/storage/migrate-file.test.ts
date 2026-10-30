import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { computeChartId } from '../../../src/chart/hash.ts'
import { normalizeChart } from '../../../src/chart/validate.ts'
import { fadeAfter, initialFade } from '../../../src/judge/self-rate.ts'
import type { Chart, ResultRecord } from '../../../src/shared/types.ts'
import {
  memoryStorage,
  safeStorage,
  type KvStore,
  type StorageFailure,
  type StorageLike,
} from '../../../src/storage/fallback.ts'
import {
  BACKUP_FORMAT,
  MAX_IMPORT_CHARS,
  backupFileName,
  backupFileText,
  chartFileName,
  chartFileText,
  importText,
  makeBackup,
  parseResult,
} from '../../../src/storage/file.ts'
import {
  LOCAL_KEYS,
  defaultSettings,
  loadCalibration,
  loadDevice,
  loadFade,
  loadSettings,
  saveSettings,
} from '../../../src/storage/local.ts'
import { LEGACY_KEYS, migrateLegacy, planMigration } from '../../../src/storage/migrate.ts'

// src/storage/migrate.ts・file.ts。出どころ: kickoff 手順 11（鍵名の移行、*.hexnote.json の往復）、モックの保存の行
// （m1' L470、m2 L204・L207、m3 L666、m4 L320–321、m5 L372・L435、m6 L559。行番号で切り出し、モックそのものに旧鍵を
// 書かせて読む）、decisions #52・#53（仮）。

const AT = '2026-10-31T00:00:00.000Z'
const MOCKS = new URL('../../../docs/planning/mocks/', import.meta.url)
const lines = (f: string): string[] =>
  readFileSync(fileURLToPath(new URL(f, MOCKS)), 'utf8').split('\n')
const SRC = {
  m1: lines('m1-geometry.html'),
  m2: lines('m2-layout-explorer.html'),
  m3: lines('m3-clock-judge.html'),
  m4: lines('m4-practice.html'),
  m5: lines('m5-song-import.html'),
  m6: lines('m6-flow.html'),
}
function line(src: string[], n: number, head: string): string {
  const s = src[n - 1] ?? ''
  if (!s.trimStart().startsWith(head)) throw new Error(`モックの行がずれた: L${n}`)
  return s
}

/** モックの保存の行を動かす（localStorage と状態を渡す） */
function runMock(code: string, args: Record<string, unknown>): void {
  const names = Object.keys(args)
  ;(new Function(...names, code) as (...a: unknown[]) => void)(...names.map((k) => args[k]))
}

/** モック 6 つに旧鍵を書かせた localStorage */
function legacyStorage(): StorageLike & { readonly size: number } {
  const ls = memoryStorage()
  // m1' L470（診断の結果 3 鍵まで通った）
  runMock(line(SRC.m1, 470, 'if (save) {'), {
    localStorage: ls,
    save: true,
    state: { limit: 2 },
    diag: { results: [{ ok: true }, { ok: true }, { ok: true }, { ok: false }] },
  })
  // m2 L204・L207
  runMock(
    line(SRC.m2, 204, 'const LS_KEY') +
      '\n' +
      line(SRC.m2, 207, 'const persistStags') +
      '\npersistStags()',
    {
      localStorage: ls,
      savedStags: [
        { id: 'u:mine', name: 'mine', v: [0.5, 0.25, 0.5] },
        { id: 'u:flat', name: 'flat', v: [0, 0, 0] },
      ],
    },
  )
  // m3 L666
  runMock(line(SRC.m3, 666, 'function saveOffset()') + '\nsaveOffset()', {
    localStorage: ls,
    S: { offset: -37 },
  })
  // m4 L320–321
  runMock(
    line(SRC.m4, 320, 'const LS_KEY') + '\n' + line(SRC.m4, 321, 'function save()') + '\nsave()',
    {
      localStorage: ls,
      state: {
        auto: false,
        fade: { 60: 0.76, 62: 1, 64: 0.12 },
        kbLabel: 'note',
        noteLabel: 'none',
        fadeMode: 'linked',
      },
    },
  )
  // m5 L372（garage ＝ ableton の旧名）
  runMock(line(SRC.m5, 372, 'function save()') + '\nsave()', {
    localStorage: ls,
    state: { layout: 'fl', fold: 'nearest', limit: 3, sync: { videoId: 'abcdefghijk' } },
  })
  // m6 L559
  runMock(line(SRC.m6, 559, 'function persist()') + '\npersist()', {
    localStorage: ls,
    state: { profile: 'gamer', first: 'again', source: 'youtube', theme: 'dark' },
  })
  ls.setItem(LEGACY_KEYS.m0, JSON.stringify({ layout: 'split', cell: 26 }))
  return ls
}

const kvOf = (ls: StorageLike, report: (f: StorageFailure) => void = () => {}): KvStore =>
  safeStorage('local', () => ls, report)

describe('鍵名の移行 planMigration（モックが書いた旧鍵を読む）', () => {
  it('6 つのモックの値を新しい 4 つの鍵へ運ぶ。運ばない物（m0・m5 の limit と videoId・m6 の theme など）は落とす', () => {
    const ls = legacyStorage()
    const plan = planMigration((k) => ls.getItem(k), AT)
    expect(plan.device).toEqual({ limit: 3, at: AT, layoutMapOk: false })
    expect(plan.calibration).toEqual({ v: 1, audio: { offsetMs: -37, at: AT, via: 'migrated' } })
    expect(plan.fade).toEqual({ mode: 'linked', manual: 1, alpha: { 60: 0.76, 62: 1, 64: 0.12 } })
    expect(plan.settings).toEqual({
      ...defaultSettings(),
      profile: 'gamer',
      layout: 'vmpk',
      fold: 'nearest',
      staggers: [
        { name: 'mine', v: [0.5, 0.25, 0.5] },
        { name: 'flat', v: [0, 0, 0] },
      ],
      labels: { kb: 'note', note: 'none' },
    })
    expect(plan.sources).toEqual([
      { key: LEGACY_KEYS.limit, to: ['device'] },
      { key: LEGACY_KEYS.m3, to: ['calibration'] },
      { key: LEGACY_KEYS.m5, to: ['settings'] },
      { key: LEGACY_KEYS.m4, to: ['settings', 'fade'] },
      { key: LEGACY_KEYS.m2, to: ['settings'] },
      { key: LEGACY_KEYS.m6, to: ['settings'] },
    ])
  })

  it("hexnote.limit の '7'（m1' L269 は 6 に丸める）→ 4", () => {
    const plan = planMigration((k) => (k === LEGACY_KEYS.limit ? '7' : null), AT)
    expect(plan.device?.limit).toBe(4)
  })

  it('旧鍵が無ければ何も運ばない。壊れた旧鍵は読んだ印だけ（運び先なし）', () => {
    expect(planMigration(() => null, AT)).toEqual({
      settings: null,
      calibration: null,
      device: null,
      fade: null,
      sources: [],
    })
    const bad = planMigration(
      (k) => (k === LEGACY_KEYS.m5 ? '{oops' : k === LEGACY_KEYS.m3 ? 'abc' : null),
      AT,
    )
    expect(bad.settings).toBe(null)
    expect(bad.calibration).toBe(null)
    expect(bad.sources).toEqual([
      { key: LEGACY_KEYS.m3, to: [] },
      { key: LEGACY_KEYS.m5, to: [] },
    ])
  })

  it('読める物が無い旧鍵は設定へ運ばない（m4 のラベルが両方悪い・m2 の一覧が空か全部悪い）', () => {
    const vals: Record<string, string> = {
      [LEGACY_KEYS.m4]: JSON.stringify({
        fade: { 60: 0.5 },
        kb: 'bad',
        note: 7,
        fadeMode: 'linked',
      }),
      [LEGACY_KEYS.m2]: JSON.stringify([{ name: 'x', v: [5, 5, 5] }]),
    }
    const plan = planMigration((k) => vals[k] ?? null, AT)
    expect(plan.settings).toBe(null)
    expect(plan.fade?.alpha).toEqual({ 60: 0.5 })
    expect(plan.sources).toEqual([
      { key: LEGACY_KEYS.m4, to: ['fade'] },
      { key: LEGACY_KEYS.m2, to: [] },
    ])
    expect(planMigration((k) => (k === LEGACY_KEYS.m2 ? '[]' : null), AT).settings).toBe(null)
  })
})

describe('鍵名の移行 migrateLegacy（書いて、旧鍵を消す）', () => {
  it('新しい鍵を書き、運んだ旧鍵を消す。m0 は残す。2 回目は何もしない', () => {
    const ls = legacyStorage()
    const kv = kvOf(ls)
    const r = migrateLegacy(kv, AT)
    expect(r.wrote).toEqual(['settings', 'device', 'fade', 'calibration'])
    expect(r.removed).toEqual([
      LEGACY_KEYS.limit,
      LEGACY_KEYS.m3,
      LEGACY_KEYS.m5,
      LEGACY_KEYS.m4,
      LEGACY_KEYS.m2,
      LEGACY_KEYS.m6,
    ])
    expect(r.kept).toEqual([])
    expect(ls.size).toBe(5)
    expect(ls.getItem(LEGACY_KEYS.m0)).not.toBe(null)
    expect(loadSettings(kv).layout).toBe('vmpk')
    expect(loadDevice(kv)?.limit).toBe(3)
    expect(loadCalibration(kv).audio?.offsetMs).toBe(-37)
    expect(loadFade(kv).alpha[64]).toBe(0.12)
    expect(migrateLegacy(kv, AT)).toEqual({
      wrote: [],
      skipped: [],
      inMemory: [],
      removed: [],
      kept: [],
    })
  })

  it('新しい鍵が前から有ればそちらが正（上書きしない）。旧鍵は消す', () => {
    const ls = legacyStorage()
    const kv = kvOf(ls)
    saveSettings(kv, { ...defaultSettings(), layout: 'genshin' })
    const r = migrateLegacy(kv, AT)
    expect(r.skipped).toEqual(['settings'])
    expect(loadSettings(kv).layout).toBe('genshin')
    expect(r.removed).toContain(LEGACY_KEYS.m5)
  })

  it('容量超過で書けない: storageFail 1 回、運び先がメモリの旧鍵は残す（次に読み直したらもう一度運ぶ）', () => {
    const ls = legacyStorage()
    const real = ls.setItem.bind(ls)
    let full = true
    ls.setItem = (k, v) => {
      if (full) throw Object.assign(new Error('q'), { name: 'QuotaExceededError' })
      real(k, v)
    }
    const fails: StorageFailure[] = []
    const kv = kvOf(ls, (f) => void fails.push(f))
    const r = migrateLegacy(kv, AT)
    expect(fails).toHaveLength(1)
    expect(r.inMemory).toEqual(['settings', 'device', 'fade', 'calibration'])
    expect(r.removed).toEqual([])
    expect(r.kept).toHaveLength(6)
    // このページの間はメモリの値で動く
    expect(loadSettings(kv).profile).toBe('gamer')
    // 読み直し（新しい KvStore）で空いていれば運べる
    full = false
    const again = migrateLegacy(kvOf(ls), AT)
    expect(again.wrote).toHaveLength(4)
    expect(again.removed).toHaveLength(6)
  })
})

// ---------- *.hexnote.json ----------

const FIXTURES = new URL('../../fixtures/charts/', import.meta.url)
/** 試験譜面 8 曲（ファイルのまま。vel は省いてある） */
function rawFixtures(): Chart[] {
  const out: Chart[] = []
  for (const dir of ['m1', 'm5'])
    for (const f of readdirSync(fileURLToPath(new URL(`${dir}/`, FIXTURES))))
      out.push(
        JSON.parse(readFileSync(fileURLToPath(new URL(`${dir}/${f}`, FIXTURES)), 'utf8')) as Chart,
      )
  return out
}
/** アプリが持つ形（取り込みで normalizeChart を通した後。vel 80 が入る） */
const fixtureCharts = (): Chart[] => rawFixtures().map((c) => normalizeChart(c) as Chart)

const result = (id: string, chartId: string): ResultRecord => ({
  id,
  chartId,
  variantId: 'ableton/2/octave',
  profile: 'gamer',
  clock: 'video',
  mode: 'fixed',
  rate: 1,
  keyset: 'all',
  at: AT,
  acc: 0.935,
  rank: 'A',
  counts: { perfect: 10, great: 3, good: 1, near: 0, miss: 2 },
  selfRate: { solo: 4, hinted: 8, near: 0, miss: 2 },
  syncUsed: { kind: 'youtube', videoId: 'abcdefghijk', fallbackAt: 1234.5 },
  offsetUsed: -12,
})

describe('ファイル名（m5 L435）', () => {
  // m5 L435 の a.download の式を切り出す
  const expr = /a\.download = (.+?\.hexnote\.json`);/.exec(
    line(SRC.m5, 435, "$('#dlJson').addEventListener"),
  )?.[1]
  const m5Name = new Function('state', `return ${expr ?? ''}`) as (s: unknown) => string

  it.each([['canon'], ['カノン進行（三和音）'], ['a/b:c*d?"e"<f>|g\\h'], ['']])(
    '%j は m5 と同じ名前',
    (name) => {
      const state = { song: { name }, layout: 'vmpk', fold: 'cut', limit: 3 }
      expect(chartFileName({ name }, { layout: 'vmpk', fold: 'cut', limit: 3 })).toBe(m5Name(state))
    },
  )

  it('譜面版を渡さなければ曲名だけ。制御文字も _、前後の空白は落とす。控えは日付', () => {
    expect(chartFileName({ name: ' song\u0007 ' })).toBe('song_.hexnote.json')
    expect(chartFileName({ name: '   ' })).toBe('chart.hexnote.json')
    expect(backupFileName(AT)).toBe('hexnote-backup-2026-10-31.hexnote.json')
  })
})

describe('*.hexnote.json の往復', () => {
  it('試験譜面 8 曲: 取り込みは normalizeChart を通す（省いた vel → 80。id は変わらない）', async () => {
    const raw = rawFixtures()
    expect(raw).toHaveLength(8)
    for (const c of raw) {
      const r = await importText(JSON.stringify(c))
      if (r.kind !== 'chart') throw new Error(r.kind)
      expect(r.chart).toEqual(normalizeChart(c))
      expect(r.chart.notes.map((n) => n.vel)).toEqual(c.notes.map((n) => n.vel ?? 80))
      expect(r).toMatchObject({ idChanged: false, chart: { id: c.id } })
    }
  })

  it('アプリが持つ形（正規化済み）の 8 曲: 書き出して取り込むと同じ', async () => {
    for (const c of fixtureCharts()) {
      const r = await importText(chartFileText(c))
      expect(r).toEqual({ kind: 'chart', chart: c, idChanged: false })
    }
  })

  it('中身を変えた譜面は id を付け直す', async () => {
    const [c] = fixtureCharts()
    if (!c) throw new Error('fixture')
    const edited = {
      ...c,
      notes: c.notes.map((n, i) => (i === 0 ? { ...n, midi: n.midi + 1 } : n)),
    }
    const r = await importText(JSON.stringify(edited))
    if (r.kind !== 'chart') throw new Error(r.kind)
    expect(r.idChanged).toBe(true)
    expect(r.chart.id).toBe(await computeChartId(edited))
    expect(r.chart.id).not.toBe(c.id)
  })

  it('控え: 設定・足場外し・曲・記録を書き出して取り込むと同じ', async () => {
    const charts = fixtureCharts().slice(0, 2)
    const c0 = charts[0]
    if (!c0) throw new Error('fixture')
    const b = makeBackup(
      {
        settings: { ...defaultSettings(), layout: 'wicki', legend: 'us' },
        fade: fadeAfter(initialFade(), 60, 'solo'),
        charts,
        results: [result('r1', c0.id), { ...result('r2', c0.id), syncUsed: { kind: 'audio' } }],
      },
      AT,
    )
    const r = await importText(backupFileText(b))
    expect(r).toEqual({
      kind: 'backup',
      backup: b,
      dropped: { charts: 0, results: 0 },
      idChanged: 0,
    })
  })

  it('控え: 悪い曲・記録は捨てて数える。id を付け直した曲の記録は新しい id へ', async () => {
    const [c0, c1] = fixtureCharts()
    if (!c0 || !c1) throw new Error('fixture')
    const edited = {
      ...c1,
      name: 'renamed',
      notes: c1.notes.map((n, i) => (i === 0 ? { ...n, dur: n.dur * 2 } : n)),
    }
    const text = JSON.stringify({
      format: BACKUP_FORMAT,
      exportedAt: AT,
      settings: { v: 1, layout: 'bogus' },
      charts: [c0, { format: 'hexnote-chart/1' }, edited],
      results: [result('r1', c1.id), { ...result('r2', c0.id), rank: 'Z' }, 'x'],
    })
    const r = await importText(text)
    if (r.kind !== 'backup') throw new Error(r.kind)
    expect(r.dropped).toEqual({ charts: 1, results: 2 })
    expect(r.idChanged).toBe(1)
    const newId = await computeChartId(edited)
    expect(r.backup.charts.map((c) => c.id)).toEqual([c0.id, newId])
    expect(r.backup.results.map((x) => x.chartId)).toEqual([newId])
    expect(r.backup.settings).toEqual(defaultSettings())
    expect(r.backup.fade).toEqual(initialFade())
  })

  it('読めない物は理由付きで断る', async () => {
    expect(await importText('{')).toMatchObject({ kind: 'error', reason: 'json' })
    expect(await importText('{"format":"hexnote-chart/2"}')).toMatchObject({
      kind: 'error',
      reason: 'format',
    })
    expect(await importText('[]')).toMatchObject({ kind: 'error', reason: 'format' })
    const bad = await importText('{"format":"hexnote-chart/1","notes":[]}')
    expect(bad).toMatchObject({ kind: 'error', reason: 'chart' })
    if (bad.kind === 'error') expect(bad.issues.length).toBeGreaterThan(0)
    expect(await importText(' '.repeat(MAX_IMPORT_CHARS + 1))).toMatchObject({
      kind: 'error',
      reason: 'too_large',
    })
  })

  it('variants があるのに notes が並んでいない譜面は断る（並べ直すと keys がずれる）。variants が無ければ並べ直して受ける', async () => {
    const c = rawFixtures().find((x) => (x.variants?.length ?? 0) > 0)
    if (!c?.variants?.[0]) throw new Error('fixture')
    const i = c.notes.findIndex((n) => n.beat !== c.notes[0]?.beat)
    const swap = <T>(xs: readonly T[]): T[] => {
      const out = [...xs]
      ;[out[0], out[i]] = [out[i] as T, out[0] as T]
      return out
    }
    const keysToo = {
      ...c,
      notes: swap(c.notes),
      variants: [{ ...c.variants[0], keys: swap(c.variants[0].keys) }],
    }
    const r = await importText(JSON.stringify(keysToo))
    expect(r).toMatchObject({ kind: 'error', reason: 'chart' })
    if (r.kind === 'error') expect(r.issues[0]).toMatch(/^notes: variants があるのに/)
    // 同拍の midi の順違いも断る
    const j = c.notes.findIndex((n, k) => k > 0 && n.beat === c.notes[k - 1]?.beat)
    if (j > 0) {
      const notes = [...c.notes]
      ;[notes[j - 1], notes[j]] = [notes[j] as Chart['notes'][0], notes[j - 1] as Chart['notes'][0]]
      expect(await importText(JSON.stringify({ ...c, notes }))).toMatchObject({ kind: 'error' })
    }
    const { variants: _drop, ...noVariants } = keysToo
    const ok = await importText(JSON.stringify(noVariants))
    if (ok.kind !== 'chart') throw new Error(ok.kind)
    expect(ok.chart.notes).toEqual((normalizeChart(c) as Chart).notes)
    expect(ok.idChanged).toBe(false)
  })
})

describe('記録の検査 parseResult（§4.3 results）', () => {
  const ok = result('r1', 'c1')

  it('正しい記録はそのまま（知らない項目は捨てる）', () => {
    expect(parseResult(ok)).toEqual(ok)
    expect(parseResult({ ...ok, extra: 1 })).toEqual(ok)
    expect(parseResult({ ...ok, syncUsed: { kind: 'audio' } })?.syncUsed).toEqual({ kind: 'audio' })
  })

  it.each([
    ['id 空', { id: '' }],
    ['profile', { profile: 'pro' }],
    ['clock', { clock: 'both' }],
    ['mode', { mode: 'wait' }],
    ['rate 0', { rate: 0 }],
    ['rate 文字', { rate: '1' }],
    ['keyset', { keyset: 3 }],
    ['at', { at: 'sometime' }],
    ['acc > 1', { acc: 1.01 }],
    ['acc < 0', { acc: -0.1 }],
    ['rank', { rank: 'SSS' }],
    ['offsetUsed > 120', { offsetUsed: 121 }],
    ['counts 小数', { counts: { ...ok.counts, miss: 0.5 } }],
    ['counts 欠け', { counts: { perfect: 1 } }],
    ['selfRate 負', { selfRate: { ...ok.selfRate, near: -1 } }],
    ['syncUsed kind', { syncUsed: { kind: 'midi' } }],
    ['syncUsed videoId', { syncUsed: { kind: 'youtube', videoId: 5 } }],
    ['syncUsed fallbackAt', { syncUsed: { kind: 'youtube', fallbackAt: -1 } }],
  ])('%s → null', (_, patch) => {
    expect(parseResult({ ...ok, ...patch })).toBe(null)
  })

  it('オブジェクトでなければ null', () => {
    for (const x of [null, 'x', [], 3]) expect(parseResult(x)).toBe(null)
  })
})

it('LOCAL_KEYS は §4.3 の 4 つ', () => {
  expect(Object.values(LOCAL_KEYS)).toEqual([
    'hexnote.settings',
    'hexnote.calibration',
    'hexnote.device',
    'hexnote.fade',
  ])
})
