import { describe, expect, it } from 'vitest'
import {
  failReason,
  memoryDb,
  memoryStorage,
  resilientDb,
  safeStorage,
  storageFailRow,
  type StorageFailure,
  type StorageLike,
} from '../../../src/storage/fallback.ts'
import type { HexDb } from '../../../src/storage/idb.ts'
import {
  defaultSettings,
  loadDevice,
  loadSettings,
  saveDevice,
  saveSettings,
} from '../../../src/storage/local.ts'
import type { Chart, ResultRecord, TelemetryRow } from '../../../src/shared/types.ts'
import { TELEMETRY_RING_SIZE } from '../../../src/shared/types.ts'

// src/storage/fallback.ts。出どころ: design.md §4.1・§1.3 S7d・§4.6 storageFail、kickoff 手順 11 の期待値（setItem の例外で
// storageFail 1 回、処理は続く）・完了条件（プライベートウィンドウと容量超過で通知）、decisions #50（仮）。

const AT = '2026-10-31T00:00:00.000Z'

function domErr(name: string, code?: number): Error {
  const e = new Error(name)
  e.name = name
  if (code !== undefined) Object.assign(e, { code })
  return e
}

/** 書くと例外を投げられる Storage（容量超過・遮断の真似） */
function flaky(): StorageLike & {
  data: Map<string, string>
  failSet: Error | null
  failGet: Error | null
  failRemove: Error | null
} {
  const data = new Map<string, string>()
  const s = {
    data,
    failSet: null as Error | null,
    failGet: null as Error | null,
    failRemove: null as Error | null,
    getItem(k: string) {
      if (s.failGet) throw s.failGet
      return data.get(k) ?? null
    },
    setItem(k: string, v: string) {
      if (s.failSet) throw s.failSet
      data.set(k, v)
    },
    removeItem(k: string) {
      if (s.failRemove) throw s.failRemove
      data.delete(k)
    },
  }
  return s
}

function collect(): { fails: StorageFailure[]; report: (f: StorageFailure) => void } {
  const fails: StorageFailure[] = []
  return { fails, report: (f) => void fails.push(f) }
}

describe('失敗の理由 failReason・storageFail の行', () => {
  it.each([
    [domErr('QuotaExceededError'), 'quota'],
    [domErr('NS_ERROR_DOM_QUOTA_REACHED'), 'quota'],
    [domErr('Error', 22), 'quota'],
    [domErr('Error', 1014), 'quota'],
    [domErr('SecurityError'), 'denied'],
    [domErr('NotAllowedError'), 'denied'],
    [domErr('InvalidStateError'), 'unavailable'],
    [domErr('UnknownError'), 'unavailable'],
    [new TypeError('x'), 'other'],
  ] as const)('%s → %s', (e, reason) => {
    expect(failReason(e)).toEqual({ reason, name: e.name })
  })

  it('Error でない物は typeof を名前に、理由は other', () => {
    expect(failReason('boom')).toEqual({ reason: 'other', name: 'string' })
    expect(failReason(null)).toEqual({ reason: 'other', name: 'object' })
  })

  it('行は §4.6 storageFail の形（where は置き場.操作:鍵、message は理由と例外の名前だけ）', () => {
    const row = storageFailRow(
      {
        area: 'local',
        op: 'write',
        key: 'hexnote.settings',
        reason: 'quota',
        name: 'QuotaExceededError',
      },
      AT,
    )
    expect(row).toEqual({
      kind: 'storageFail',
      at: AT,
      where: 'local.write:hexnote.settings',
      message: 'quota（QuotaExceededError）',
    })
  })
})

describe('safeStorage（localStorage・sessionStorage を包む）', () => {
  it('動くときは本物に書き、知らせない', () => {
    const b = flaky()
    const { fails, report } = collect()
    const kv = safeStorage('local', () => b, report)
    expect(kv.set('a', '1')).toBe(true)
    expect(b.data.get('a')).toBe('1')
    expect(kv.get('a')).toBe('1')
    kv.remove('a')
    expect(b.data.has('a')).toBe(false)
    expect(kv.mode()).toBe('backend')
    expect(fails).toEqual([])
  })

  it('kickoff の期待値: setItem の例外で storageFail 1 回、処理は続く（以後はメモリ、前の値は読める）', () => {
    const b = flaky()
    b.data.set('hexnote.device', JSON.stringify({ limit: 3, at: AT, layoutMapOk: true }))
    const { fails, report } = collect()
    const kv = safeStorage('local', () => b, report)
    b.failSet = domErr('QuotaExceededError')

    const s = { ...defaultSettings(), layout: 'vmpk' as const }
    expect(() => saveSettings(kv, s)).not.toThrow()
    expect(saveSettings(kv, s)).toBe(false)
    expect(saveSettings(kv, { ...s, fold: 'cut' })).toBe(false)
    expect(saveDevice(kv, { limit: 4, at: AT, layoutMapOk: false })).toBe(false)

    expect(fails).toEqual([
      {
        area: 'local',
        op: 'write',
        key: 'hexnote.settings',
        reason: 'quota',
        name: 'QuotaExceededError',
      },
    ])
    expect(kv.mode()).toBe('memory')
    expect(loadSettings(kv)).toEqual({ ...s, fold: 'cut' })
    expect(loadDevice(kv)).toEqual({ limit: 4, at: AT, layoutMapOk: false })
    // 本物には書いていない（前の値のまま）
    expect(b.data.has('hexnote.settings')).toBe(false)
    expect(JSON.parse(b.data.get('hexnote.device') ?? '')).toMatchObject({ limit: 3 })
  })

  it('失敗の後も、書いていない鍵は本物から読む（容量超過で前の設定が消えたように見せない）', () => {
    const b = flaky()
    b.data.set('x', 'old')
    const kv = safeStorage(
      'local',
      () => b,
      () => {},
    )
    b.failSet = domErr('QuotaExceededError')
    kv.set('y', 'new')
    expect(kv.get('x')).toBe('old')
    expect(kv.get('y')).toBe('new')
    // 失敗の後は本物を試さない（容量が空いても、このページの間はメモリ）
    b.failSet = null
    expect(kv.set('z', '1')).toBe(false)
    expect(b.data.has('z')).toBe(false)
  })

  it('プライベートウィンドウ・Cookie の遮断（localStorage を読むと SecurityError）: open で 1 回知らせ、メモリで続ける', () => {
    const { fails, report } = collect()
    const kv = safeStorage(
      'session',
      () => {
        throw domErr('SecurityError')
      },
      report,
    )
    expect(kv.get('hexnote.booted')).toBe(null)
    expect(kv.set('hexnote.booted', '1')).toBe(false)
    expect(kv.get('hexnote.booted')).toBe('1')
    kv.remove('hexnote.booted')
    expect(kv.get('hexnote.booted')).toBe(null)
    expect(kv.mode()).toBe('memory')
    expect(fails).toEqual([
      { area: 'session', op: 'open', key: '*', reason: 'denied', name: 'SecurityError' },
    ])
  })

  it('Storage が無い（null・undefined）: unavailable', () => {
    for (const none of [null, undefined]) {
      const { fails, report } = collect()
      const kv = safeStorage('local', () => none, report)
      expect(kv.set('a', '1')).toBe(false)
      expect(kv.get('a')).toBe('1')
      expect(fails).toEqual([
        { area: 'local', op: 'open', key: '*', reason: 'unavailable', name: 'NotSupportedError' },
      ])
    }
  })

  it('getItem の例外: read で知らせて null、以後の書き込みはメモリ', () => {
    const b = flaky()
    b.data.set('a', '1')
    const { fails, report } = collect()
    const kv = safeStorage('local', () => b, report)
    b.failGet = domErr('UnknownError')
    expect(kv.get('a')).toBe(null)
    expect(kv.set('b', '2')).toBe(false)
    expect(fails).toEqual([
      { area: 'local', op: 'read', key: 'a', reason: 'unavailable', name: 'UnknownError' },
    ])
  })

  it('メモリ内で消した鍵は本物の値を隠す。本物からも消そうとする（失敗は知らせ済みなので黙る）', () => {
    const b = flaky()
    b.data.set('a', '1')
    b.data.set('c', '3')
    const { fails, report } = collect()
    const kv = safeStorage('local', () => b, report)
    b.failSet = domErr('QuotaExceededError')
    kv.set('b', '2')
    kv.remove('a')
    expect(kv.get('a')).toBe(null)
    expect(b.data.has('a')).toBe(false)
    b.failRemove = domErr('UnknownError')
    kv.remove('c')
    expect(kv.get('c')).toBe(null)
    expect(b.data.get('c')).toBe('3')
    expect(fails).toHaveLength(1)
  })

  it('removeItem の例外（失敗の前）: delete で知らせて、その鍵を隠す', () => {
    const b = flaky()
    b.data.set('a', '1')
    const { fails, report } = collect()
    const kv = safeStorage('local', () => b, report)
    b.failRemove = domErr('SecurityError')
    kv.remove('a')
    expect(kv.get('a')).toBe(null)
    expect(fails).toEqual([
      { area: 'local', op: 'delete', key: 'a', reason: 'denied', name: 'SecurityError' },
    ])
  })

  it('open は最初の使用で 1 回だけ呼ぶ', () => {
    let opened = 0
    const kv = safeStorage(
      'local',
      () => {
        opened++
        return memoryStorage()
      },
      () => {},
    )
    expect(opened).toBe(0)
    kv.set('a', '1')
    kv.get('a')
    kv.mode()
    expect(opened).toBe(1)
  })
})

// ---------- IndexedDB の代わり ----------

const chart = (id: string): Chart =>
  ({
    format: 'hexnote-chart/1',
    id,
    name: id,
    notes: [{ midi: 60, beat: 0, dur: 1 }],
    pulse: { resolution: 240, tempo: [{ beat: 0, bpm: 120 }] },
    sync: { sources: [] },
    source: { kind: 'midi', rights: 'private' },
  }) as Chart

const result = (id: string, chartId = 'c1'): ResultRecord => ({
  id,
  chartId,
  variantId: 'ableton/2/octave',
  profile: 'beginner',
  clock: 'novideo',
  mode: 'fixed',
  rate: 1,
  keyset: 'all',
  at: AT,
  acc: 0.9,
  rank: 'A',
  counts: { perfect: 1, great: 0, good: 0, near: 0, miss: 0 },
  selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 },
  syncUsed: { kind: 'audio' },
  offsetUsed: 0,
  skipped: 0,
})

const row = (i: number): TelemetryRow => ({ kind: 'embedError', at: AT, code: i })

describe('memoryDb（IndexedDB と同じ形のメモリ）', () => {
  it('写しを返す（返した物を変えても中は変わらない）・同じ id は上書き', async () => {
    const db = memoryDb()
    const c = chart('c1')
    await db.putChart(c)
    c.name = 'changed'
    const got = await db.getChart('c1')
    expect(got?.name).toBe('c1')
    if (got) got.name = 'x'
    expect((await db.getChart('c1'))?.name).toBe('c1')
    await db.putChart({ ...chart('c1'), name: 'v2' })
    expect((await db.listCharts()).map((x) => x.name)).toEqual(['v2'])
    await db.deleteChart('c1')
    expect(await db.getChart('c1')).toBeUndefined()
  })

  it('記録は曲ごとに引ける。telemetry は 1,001 行目で先頭が消える（リング 1,000 行）', async () => {
    const db = memoryDb()
    await db.putResult(result('r1', 'c1'))
    await db.putResult(result('r2', 'c2'))
    await db.putResult(result('r1', 'c1'))
    expect((await db.listResults()).map((r) => r.id)).toEqual(['r1', 'r2'])
    expect((await db.listResults('c2')).map((r) => r.id)).toEqual(['r2'])
    for (let i = 1; i <= TELEMETRY_RING_SIZE + 1; i++) await db.appendTelemetry(row(i))
    const rows = await db.listTelemetry()
    expect(rows).toHaveLength(TELEMETRY_RING_SIZE)
    expect(rows[0]).toEqual(row(2))
    expect(rows.at(-1)).toEqual(row(TELEMETRY_RING_SIZE + 1))
    await db.clear('telemetry')
    await db.clear('results')
    await db.clear('charts')
    expect(await db.listTelemetry()).toEqual([])
    expect(await db.listResults()).toEqual([])
  })
})

/** 本物の IndexedDB の代わり（kind idb）。fail を入れるとその操作で投げる */
function fakeIdb(): HexDb & { calls: string[]; fail: Partial<Record<keyof HexDb, Error>> } {
  const mem = memoryDb()
  const calls: string[] = []
  const fail: Partial<Record<keyof HexDb, Error>> = {}
  const wrap =
    <K extends Exclude<keyof HexDb, 'kind'>>(k: K) =>
    async (...a: unknown[]): Promise<unknown> => {
      calls.push(k)
      const e = fail[k]
      if (e) throw e
      return (mem[k] as (...x: unknown[]) => Promise<unknown>)(...a)
    }
  return {
    kind: 'idb',
    calls,
    fail,
    putChart: wrap('putChart') as HexDb['putChart'],
    getChart: wrap('getChart') as HexDb['getChart'],
    listCharts: wrap('listCharts') as HexDb['listCharts'],
    deleteChart: wrap('deleteChart') as HexDb['deleteChart'],
    putResult: wrap('putResult') as HexDb['putResult'],
    listResults: wrap('listResults') as HexDb['listResults'],
    appendTelemetry: wrap('appendTelemetry') as HexDb['appendTelemetry'],
    listTelemetry: wrap('listTelemetry') as HexDb['listTelemetry'],
    clear: wrap('clear') as HexDb['clear'],
  }
}

describe('resilientDb（IndexedDB を包む）', () => {
  it('動くときは本物に書き、知らせない', async () => {
    const p = fakeIdb()
    const { fails, report } = collect()
    const db = resilientDb(async () => p, report)
    await db.putChart(chart('c1'))
    expect((await db.listCharts()).map((c) => c.id)).toEqual(['c1'])
    expect(await db.mode()).toBe('idb')
    expect(p.calls).toEqual(['putChart', 'listCharts'])
    expect(fails).toEqual([])
  })

  it('プライベートウィンドウ（open が InvalidStateError）: 1 回知らせ、メモリで全部動く', async () => {
    const { fails, report } = collect()
    const db = resilientDb(() => Promise.reject(domErr('InvalidStateError')), report)
    await db.putChart(chart('c1'))
    await db.putResult(result('r1'))
    await db.appendTelemetry(row(1))
    expect((await db.getChart('c1'))?.id).toBe('c1')
    expect((await db.listResults('c1')).map((r) => r.id)).toEqual(['r1'])
    expect(await db.listTelemetry()).toEqual([row(1)])
    expect(await db.mode()).toBe('memory')
    expect(fails).toEqual([
      { area: 'idb', op: 'open', key: '*', reason: 'unavailable', name: 'InvalidStateError' },
    ])
  })

  it('容量超過（書き込みの失敗）: 1 回知らせ、本物の中身を写してからメモリで続ける。失敗した書き込みもメモリに入る', async () => {
    const p = fakeIdb()
    const { fails, report } = collect()
    const db = resilientDb(async () => p, report)
    await db.putChart(chart('c1'))
    await db.putResult(result('r0'))
    await db.appendTelemetry(row(1))
    p.fail.putResult = domErr('QuotaExceededError')
    await db.putResult(result('r1'))
    await db.putResult(result('r2'))
    await db.putChart(chart('c2'))
    expect((await db.listCharts()).map((c) => c.id)).toEqual(['c1', 'c2'])
    expect((await db.listResults()).map((r) => r.id)).toEqual(['r0', 'r1', 'r2'])
    expect(await db.listTelemetry()).toEqual([row(1)])
    expect(await db.mode()).toBe('memory')
    expect(fails).toEqual([
      { area: 'idb', op: 'write', key: 'results', reason: 'quota', name: 'QuotaExceededError' },
    ])
    // 移った後は本物を呼ばない（写すときの list の 3 回まで）
    expect(p.calls.slice(4)).toEqual(['listCharts', 'listResults', 'listTelemetry'])
  })

  it('読めない store は写さず空から（他の store は写す）', async () => {
    const p = fakeIdb()
    const db = resilientDb(
      async () => p,
      () => {},
    )
    await db.putChart(chart('c1'))
    await db.putResult(result('r0'))
    p.fail.listResults = domErr('UnknownError')
    expect(await db.listResults()).toEqual([])
    expect((await db.listCharts()).map((c) => c.id)).toEqual(['c1'])
  })

  it('読み・消しの失敗は read・delete で知らせる', async () => {
    for (const [k, op] of [
      ['getChart', 'read'],
      ['clear', 'delete'],
      ['deleteChart', 'delete'],
      ['appendTelemetry', 'write'],
    ] as const) {
      const p = fakeIdb()
      p.fail[k] = domErr('UnknownError')
      const { fails, report } = collect()
      const db = resilientDb(async () => p, report)
      if (k === 'getChart') await db.getChart('c1')
      else if (k === 'clear') await db.clear('results')
      else if (k === 'deleteChart') await db.deleteChart('c1')
      else await db.appendTelemetry(row(1))
      const store =
        k === 'getChart' || k === 'deleteChart' ? 'charts' : k === 'clear' ? 'results' : 'telemetry'
      expect(fails).toEqual([
        { area: 'idb', op, key: store, reason: 'unavailable', name: 'UnknownError' },
      ])
    }
  })

  it('同時に 2 つ失敗しても知らせは 1 回、写しも 1 回', async () => {
    const p = fakeIdb()
    p.fail.putResult = domErr('QuotaExceededError')
    p.fail.putChart = domErr('QuotaExceededError')
    const { fails, report } = collect()
    const db = resilientDb(async () => p, report)
    await Promise.all([
      db.putResult(result('r1')),
      db.putChart(chart('c1')),
      db.putResult(result('r2')),
    ])
    expect(fails).toHaveLength(1)
    expect(p.calls.filter((c) => c === 'listCharts')).toHaveLength(1)
    expect((await db.listResults()).map((r) => r.id).sort()).toEqual(['r1', 'r2'])
    expect((await db.listCharts()).map((c) => c.id)).toEqual(['c1'])
  })

  it('知らせの受け手がその場で storageFail の行を足しても、本物へ行かず知らせは 1 回（行はメモリに入る）', async () => {
    const p = fakeIdb()
    p.fail.putResult = domErr('QuotaExceededError')
    p.fail.appendTelemetry = domErr('QuotaExceededError')
    const fails: StorageFailure[] = []
    const db: ReturnType<typeof resilientDb> = resilientDb(
      async () => p,
      (f) => {
        fails.push(f)
        void db.appendTelemetry(storageFailRow(f, AT))
      },
    )
    await db.putResult(result('r1'))
    const rows = await db.listTelemetry()
    expect(fails).toHaveLength(1)
    expect(rows).toEqual([storageFailRow(fails[0] as StorageFailure, AT)])
    expect(p.calls).not.toContain('appendTelemetry')
  })

  it('open がその場で投げても（promise を返さない）メモリで続く', async () => {
    const { fails, report } = collect()
    const db = resilientDb(() => {
      throw domErr('SecurityError')
    }, report)
    await db.putChart(chart('c1'))
    expect((await db.listCharts()).map((c) => c.id)).toEqual(['c1'])
    expect(fails).toEqual([
      { area: 'idb', op: 'open', key: '*', reason: 'denied', name: 'SecurityError' },
    ])
  })

  it('open の失敗でも同じ（受け手の行はメモリに入る）', async () => {
    const fails: StorageFailure[] = []
    const db: ReturnType<typeof resilientDb> = resilientDb(
      () => Promise.reject(domErr('SecurityError')),
      (f) => {
        fails.push(f)
        void db.appendTelemetry(storageFailRow(f, AT))
      },
    )
    expect(await db.listTelemetry()).toHaveLength(1)
    expect(fails).toHaveLength(1)
  })
})
