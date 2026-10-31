import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateChart } from '../../../src/chart/validate.ts'
import { midiOf } from '../../../src/layout/presets.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { BUNDLE_GENERATOR, buildBundle, bundledChart } from '../../../tools/charts/bundle.ts'
import { BUNDLE_SONGS, HAJIME } from '../../../tools/charts/bundle-songs.ts'
import { checkEntry, checkRights, listCharts, readRights } from '../../../tools/charts/rights.ts'
import type { Smf } from '../../../tools/charts/smf.ts'

// tools/charts/{bundle,bundle-songs,rights}.ts（M1-01、M1 の手順 6）。出どころ: m1-kickoff 手順 6（版の数・validate・権利表の
// 欠けで fail・PD の没年）・§5（U-03 の代替: チュートリアル曲＋PD の 2 曲）・§7-17（チュートリアル曲）、decisions #13・#23・
// #47 (a)・#61、ADR 0005、tests-inventory「M1 手順 6」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const CONTENT = path.join(root, 'content', 'charts')
const read = (rel: string): string => readFileSync(path.join(CONTENT, ...rel.split('/')), 'utf8')

describe('同梱曲（今は U-03 の代替の 3 曲）', () => {
  it('content/charts/ のファイルは道具の出力と 1 バイトも違わない（npm run charts:bundle で作り直す）', async () => {
    const files = await buildBundle(BUNDLE_SONGS)
    expect(files.map((f) => f.path)).toEqual([
      'tutorial/hajime.json',
      'pd/twinkle.json',
      'pd/ode.json',
    ])
    for (const f of files) expect(read(f.path), f.path).toBe(f.text)
  })

  it('入門曲は 4 版、チュートリアル曲は ableton/2/octave の 1 版。全て検査を通り、各版に難度 4 軸、動画 ID なし', () => {
    const charts = BUNDLE_SONGS.map((s) => JSON.parse(read(s.file)) as Chart)
    expect(charts.map((c) => (c.variants ?? []).map((v) => v.id))).toEqual([
      ['ableton/2/octave'],
      ['ableton/2/octave', 'ableton/3/octave', 'vmpk/2/octave', 'vmpk/3/octave'],
      ['ableton/2/octave', 'ableton/3/octave', 'vmpk/2/octave', 'vmpk/3/octave'],
    ])
    for (const c of charts) {
      expect(validateChart(c).ok).toBe(true)
      expect(c.sync.sources).toEqual([])
      expect(c.generator).toBe(BUNDLE_GENERATOR)
      for (const v of c.variants ?? [])
        expect(Object.keys(v.metrics ?? {}).sort()).toEqual(['chord', 'density', 'leap', 'leapMax', 'rowCross'])
    }
    expect(charts.map((c) => c.source.rights)).toEqual(['own', 'pd', 'pd'])
  }) // prettier-ignore

  it('代替の PD 2 曲は回帰ハーネスのフィクスチャと同じ譜面（同じ id・notes）', () => {
    for (const id of ['twinkle', 'ode']) {
      const b = JSON.parse(read(`pd/${id}.json`)) as Chart
      const f = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', `${id}.hexnote.json`), 'utf8')) as Chart
      expect([b.id, b.notes]).toEqual([f.id, f.notes])
    }
  }) // prettier-ignore
})

describe('チュートリアル曲「はじめの六角」（§7-17、decisions #61、仮）', () => {
  const c = JSON.parse(read('tutorial/hajime.json')) as Chart
  const keys = c.variants?.[0]?.keys ?? []

  it('60 BPM・2 拍ごと・C 長調で主音 C4 に終わる。1 つおきに E4（KeyD）で、KeyD だけでも 4 拍ごとの拍になる', () => {
    expect(c.pulse.tempo).toEqual([{ beat: 0, bpm: 60 }])
    expect(c.notes.map((n) => n.beat)).toEqual(Array.from({ length: 16 }, (_, i) => i * 2))
    expect(c.notes.at(-1)).toMatchObject({ midi: 60, dur: 4 })
    expect(c.notes.every((n) => [0, 2, 4, 5, 7, 9, 11].includes(n.midi % 12))).toBe(true)
    const d = c.notes.filter((_, i) => keys[i] === 'KeyD').map((n) => n.beat)
    expect(d).toEqual([0, 4, 8, 12, 16, 20, 24, 28])
    expect(HAJIME).toHaveLength(16)
  })

  it('ホームポジション（D F J K）だけで 4 種の音、全鍵で落ちる音なし。鍵は Ableton 型の音高のまま', () => {
    const home = new Set(c.notes.filter((_, i) => ['KeyD', 'KeyF', 'KeyJ', 'KeyK'].includes(keys[i] ?? '')).map((n) => n.midi))
    expect([...home].sort()).toEqual([64, 65, 71, 72])
    expect(keys.every((k) => k !== null)).toBe(true)
    expect(c.notes.map((n, i) => midiOf('ableton', keys[i] ?? '') === n.midi)).not.toContain(false)
  }) // prettier-ignore
})

describe('SMF から（弾くトラック 1 つ＋伴奏）', () => {
  const smf: Smf = {
    format: 1,
    division: 480,
    tempo: [{ beat: 0, bpm: 90 }, { beat: 4, bpm: 100 }],
    timeSig: [{ beat: 0, num: 3, den: 4 }],
    tracks: [
      { name: 'melody', ch: 0, notes: [{ midi: 64, beat: 0, dur: 1, vel: 100 }, { midi: 62, beat: 1, dur: 0.5, vel: 90 }, { midi: 64, beat: 1, dur: 0.25, vel: 70 }] },
      { name: 'bass', ch: 1, notes: [{ midi: 36, beat: 0, dur: 2, vel: 80 }] },
    ],
  } // prettier-ignore

  it('notes は並べ直し、伴奏は原曲音高（#47 (a)）、テンポと拍子を写す、vel は整数のまま', async () => {
    const c = await bundledChart({
      file: 'cc/x.json',
      from: { kind: 'smf', smf, name: 'x', play: 0, accomp: [1] },
      source: { kind: 'bundled', rights: 'cc0' },
    })
    expect(c.notes).toEqual([{ midi: 64, beat: 0, dur: 1, vel: 100 }, { midi: 62, beat: 1, dur: 0.5, vel: 90 }, { midi: 64, beat: 1, dur: 0.25, vel: 70 }])
    expect(c.accompaniment).toEqual([{ midi: 36, beat: 0, dur: 2, vel: 80 }])
    expect(c.pulse).toEqual({ resolution: 240, tempo: smf.tempo, timeSig: smf.timeSig })
    expect(c.bpm).toBeUndefined()
    expect(c.variants).toHaveLength(4)
  }) // prettier-ignore

  it('同拍同音は長い方を 1 つ、無いトラック・弾くトラックを伴奏に選ぶと Error', async () => {
    const dup: Smf = { ...smf, tracks: [{ name: 'm', ch: 0, notes: [{ midi: 60, beat: 0, dur: 1, vel: 9 }, { midi: 60, beat: 0, dur: 2, vel: 8 }] }] }
    const c = await bundledChart({ file: 'x', from: { kind: 'smf', smf: dup, name: 'x', play: 0 }, source: { kind: 'bundled', rights: 'cc0' } })
    expect(c.notes).toEqual([{ midi: 60, beat: 0, dur: 2, vel: 8 }])
    const src = { kind: 'bundled', rights: 'cc0' } as const
    await expect(bundledChart({ file: 'x', from: { kind: 'smf', smf, name: 'x', play: 2 }, source: src })).rejects.toThrow('弾くトラック 2')
    await expect(bundledChart({ file: 'x', from: { kind: 'smf', smf, name: 'x', play: 0, accomp: [0] }, source: src })).rejects.toThrow('伴奏トラック 0')
  }) // prettier-ignore
})

describe('権利表（ADR 0005、M0-01 の道具に単体試験を足した）', () => {
  const ok = {
    file: 'pd/a.json',
    title: 'a',
    composerDied: '1827',
    arrangerDied: '-',
    source: 's',
    license: 'PD',
    checkedOn: '2026-11-01',
    owner: 'o',
  }

  it('今の content/charts は全部通る。欠け 1 件で「権利表に無い」', () => {
    const charts = listCharts(CONTENT)
    expect(charts).toEqual(['pd/ode.json', 'pd/twinkle.json', 'tutorial/hajime.json'])
    const rights = readRights(CONTENT)
    expect(checkRights(charts, rights).every((r) => r.problems.length === 0)).toBe(true)
    const less = { entries: (rights?.entries ?? []).filter((e) => e.file !== 'pd/ode.json') }
    expect(checkRights(charts, less).filter((r) => r.problems.length > 0)).toEqual([
      { file: 'pd/ode.json', problems: ['権利表に無い'] },
    ])
    expect(checkRights(['a.json'], null)).toEqual([{ file: 'a.json', problems: ['権利表に無い'] }])
  })

  it('PD は確認日の年 − 没年 > 70（1955 は 71 で通り、1956 は 70 で止まる）、自作の - は PD にできない', () => {
    expect(checkEntry(ok)).toEqual([])
    expect(checkEntry({ ...ok, composerDied: '1955' })).toEqual([])
    expect(checkEntry({ ...ok, composerDied: '1956' })).toEqual([
      'composerDied 1956 は没後 70 年を過ぎていない（確認日 2026-11-01）',
    ])
    expect(checkEntry({ ...ok, arrangerDied: '1990' })).toHaveLength(1)
    expect(checkEntry({ ...ok, composerDied: '-' })).toEqual([
      'PD なのに composerDied が -（自作なら license を own に）',
    ])
  })

  it('欄が空・知らない license・日付と没年の形', () => {
    expect(checkEntry({ ...ok, owner: ' ' })).toEqual(['欄が空 owner'])
    expect(checkEntry({ ...ok, license: 'MIT' })[0]).toMatch(/^license が一覧に無い: MIT/)
    expect(checkEntry({ ...ok, checkedOn: '2026/11/01' })[0]).toMatch(/^checkedOn が YYYY-MM-DD でない/)
    expect(checkEntry({ ...ok, composerDied: '18世紀' })).toEqual(['composerDied は西暦 4 桁か anonymous か -: 18世紀'])
    expect(checkEntry({ ...ok, license: 'own', composerDied: 'anonymous' })).toEqual(['own の composerDied は - か西暦'])
  }) // prettier-ignore
})
