// 保存の失敗とメモリ内の続行（M0-09、手順 11）。出どころ: design.md §4.1「保存層（§4.3。try/catch、失敗はメモリ内で続行し
// S7d と storageFail）」・§1.3 S7d・§4.6 storageFail・§6 T-9／M-11、m6 の帯 L457・L941（文言）、モックの保存（m0 L444–449・
// m1' L269・m2 L206–207・m3 L665–666・m4 L321–322・m5 L371–372）の try/catch の黙殺を「失敗を 1 回知らせて続ける」に直した。
// decisions #50（仮）。
// localStorage・sessionStorage は safeStorage、IndexedDB は resilientDb で包む。最初の失敗でその置き場はメモリ内へ移り、
// 知らせ（storageFail）は置き場ごとに 1 回。以後の書き込みはメモリだけに行き、ページを読み直すまで本物を試さない。

import type { Chart, ResultRecord, StorageFailTelemetry, TelemetryRow } from '../shared/types.ts'
import { TELEMETRY_RING_SIZE } from '../shared/types.ts'
import type { HexDb, StoreName } from './idb.ts'

export type StorageArea = 'local' | 'session' | 'idb'
export type StorageOp = 'open' | 'read' | 'write' | 'delete'
/** quota ＝ 容量超過、denied ＝ 拒否（Cookie の遮断・SecurityError）、unavailable ＝ API が無い・使えない状態 */
export type FailReason = 'quota' | 'denied' | 'unavailable' | 'other'

export interface StorageFailure {
  readonly area: StorageArea
  readonly op: StorageOp
  /** 鍵名か IndexedDB の store 名 */
  readonly key: string
  readonly reason: FailReason
  /** 例外の name（DOMException の名前。中身の message は持たない） */
  readonly name: string
}

/** 失敗を受け取る口（app/ が帯 S7d と storageFail の行にする）。置き場ごとに最初の 1 回だけ呼ばれる */
export type FailReport = (f: StorageFailure) => void

/** 帯 S7d の文言（m6 L941・L457） */
export const STORAGE_FAIL_BAND_TEXT =
  '保存できません。メモリ内で続けます（ページを閉じると消えます）。譜面と記録は *.hexnote.json に書き出せます。'

const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])
const DENIED_NAMES = new Set(['SecurityError', 'NotAllowedError'])
const UNAVAILABLE_NAMES = new Set([
  'InvalidStateError',
  'UnknownError',
  'NotFoundError',
  'NotSupportedError',
  'VersionError',
])

/** 例外から理由と名前を出す（古い Safari・Firefox の容量超過は code 22・1014） */
export function failReason(e: unknown): { reason: FailReason; name: string } {
  const name =
    typeof e === 'object' && e !== null && typeof (e as { name?: unknown }).name === 'string'
      ? (e as { name: string }).name
      : typeof e
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined
  if (QUOTA_NAMES.has(name) || code === 22 || code === 1014) return { reason: 'quota', name }
  if (DENIED_NAMES.has(name)) return { reason: 'denied', name }
  if (UNAVAILABLE_NAMES.has(name)) return { reason: 'unavailable', name }
  return { reason: 'other', name }
}

/** storageFail の行（§4.6）。where は「置き場.操作:鍵」、message は「理由（例外の名前）」 */
export function storageFailRow(f: StorageFailure, at: string): StorageFailTelemetry {
  return {
    kind: 'storageFail',
    at,
    where: `${f.area}.${f.op}:${f.key}`,
    message: `${f.reason}（${f.name}）`,
  }
}

// ---------- localStorage・sessionStorage ----------

/** Storage のうち使う 3 つ */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Map で持つ Storage（試験と、本物が無いときの代わり） */
export function memoryStorage(): StorageLike & { readonly size: number } {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    get size() {
      return m.size
    },
  }
}

/** 失敗を飲み込み、メモリ内で続ける鍵と値の置き場 */
export interface KvStore {
  readonly area: 'local' | 'session'
  /** backend ＝ 本物に書いている、memory ＝ 失敗の後（読み直すまでメモリ内） */
  mode(): 'backend' | 'memory'
  get(key: string): string | null
  /** 本物に書けたら true。失敗した（いま、か前に）ならメモリに置いて false */
  set(key: string, value: string): boolean
  remove(key: string): void
}

/**
 * Storage を包む。open（window.localStorage を読むこと自体。Cookie を遮断すると SecurityError）・getItem・setItem の
 * 例外で 1 回だけ report し、メモリ内へ移る。メモリ内では、書いた鍵（消した鍵も）はメモリの値、他の鍵は本物から読む
 * （容量超過では読めるので、前の値が消えたように見せない）。open に失敗したら本物は読まない。
 */
export function safeStorage(
  area: 'local' | 'session',
  open: () => StorageLike | null | undefined,
  report: FailReport,
): KvStore {
  /** 書いた値。null は消した印（本物の値を隠す） */
  const mem = new Map<string, string | null>()
  let backend: StorageLike | null = null
  let opened = false
  let failed = false

  const fail = (op: StorageOp, key: string, e: unknown): void => {
    const first = !failed
    failed = true
    if (first) report({ area, op, key, ...failReason(e) })
  }
  const store = (): StorageLike | null => {
    if (!opened) {
      opened = true
      try {
        backend = open() ?? null
        if (backend === null) fail('open', '*', { name: 'NotSupportedError' })
      } catch (e) {
        fail('open', '*', e)
      }
    }
    return backend
  }

  return {
    area,
    mode: () => (store(), failed ? 'memory' : 'backend'),
    get(key) {
      const b = store()
      if (mem.has(key)) return mem.get(key) ?? null
      if (b === null) return null
      try {
        return b.getItem(key)
      } catch (e) {
        fail('read', key, e)
        return null
      }
    },
    set(key, value) {
      const b = store()
      if (failed || b === null) {
        mem.set(key, value)
        return false
      }
      try {
        b.setItem(key, value)
        return true
      } catch (e) {
        fail('write', key, e)
        mem.set(key, value)
        return false
      }
    },
    remove(key) {
      const b = store()
      if (failed) mem.set(key, null)
      if (b === null) return
      try {
        b.removeItem(key)
      } catch (e) {
        fail('delete', key, e)
        mem.set(key, null)
      }
    },
  }
}

// ---------- IndexedDB ----------

/** IndexedDB と同じ形をメモリで持つ（値は structuredClone で写す。telemetry はリング 1,000 行） */
export function memoryDb(): HexDb {
  const charts = new Map<string, Chart>()
  const results = new Map<string, ResultRecord>()
  let telemetry: TelemetryRow[] = []
  const clone = <T>(x: T): T => structuredClone(x)
  return {
    kind: 'memory',
    putChart: async (c) => void charts.set(c.id, clone(c)),
    getChart: async (id) => {
      const c = charts.get(id)
      return c === undefined ? undefined : clone(c)
    },
    listCharts: async () => [...charts.values()].map(clone),
    deleteChart: async (id) => void charts.delete(id),
    putResult: async (r) => void results.set(r.id, clone(r)),
    listResults: async (chartId) =>
      [...results.values()]
        .filter((r) => chartId === undefined || r.chartId === chartId)
        .map(clone),
    appendTelemetry: async (row) => {
      telemetry.push(clone(row))
      if (telemetry.length > TELEMETRY_RING_SIZE) telemetry = telemetry.slice(-TELEMETRY_RING_SIZE)
    },
    listTelemetry: async () => telemetry.map(clone),
    clear: async (store) => {
      if (store === 'charts') charts.clear()
      else if (store === 'results') results.clear()
      else telemetry = []
    },
  }
}

/** resilientDb の戻り。mode は今の置き場（open か最初の失敗が済むまで待つ） */
export interface ResilientDb extends HexDb {
  mode(): Promise<'idb' | 'memory'>
}

/**
 * IndexedDB を包む。open の失敗（プライベートウィンドウ・遮断）と、操作の失敗（容量超過など）の最初の 1 回で report し、
 * メモリ内へ移る。移るときは本物から読める分（charts・results・telemetry）をメモリへ写し、以後は全てメモリで行う
 * （失敗した操作もメモリでやり直す）。写せなかった store はメモリで空から始める。
 */
export function resilientDb(open: () => Promise<HexDb>, report: FailReport): ResilientDb {
  let switched: Promise<HexDb> | null = null
  // open がその場で投げても（promise を返さずに）同じ道へ
  let current: Promise<HexDb> = Promise.resolve()
    .then(open)
    .catch((e: unknown) => fallBack('open', '*', e, null))

  function fallBack(op: StorageOp, key: string, e: unknown, from: HexDb | null): Promise<HexDb> {
    if (switched !== null) return switched
    // 切り替えてから知らせる（受け手がその場で appendTelemetry しても本物へ行かず、知らせが繰り返されない）
    const next = snapshot(from)
    switched = next
    current = next
    report({ area: 'idb', op, key, ...failReason(e) })
    return next
  }

  async function run<T>(
    op: StorageOp,
    store: StoreName,
    call: (db: HexDb) => Promise<T>,
  ): Promise<T> {
    const db = await current
    if (db.kind === 'memory') return call(db)
    try {
      return await call(db)
    } catch (e) {
      return call(await fallBack(op, store, e, db))
    }
  }

  return {
    kind: 'resilient',
    mode: async () => ((await current).kind === 'memory' ? 'memory' : 'idb'),
    putChart: (c) => run('write', 'charts', (db) => db.putChart(c)),
    getChart: (id) => run('read', 'charts', (db) => db.getChart(id)),
    listCharts: () => run('read', 'charts', (db) => db.listCharts()),
    deleteChart: (id) => run('delete', 'charts', (db) => db.deleteChart(id)),
    putResult: (r) => run('write', 'results', (db) => db.putResult(r)),
    listResults: (chartId) => run('read', 'results', (db) => db.listResults(chartId)),
    appendTelemetry: (row) => run('write', 'telemetry', (db) => db.appendTelemetry(row)),
    listTelemetry: () => run('read', 'telemetry', (db) => db.listTelemetry()),
    clear: (store) => run('delete', store, (db) => db.clear(store)),
  }
}

/** 本物から読める分をメモリへ写す（読めない store は空） */
async function snapshot(from: HexDb | null): Promise<HexDb> {
  const mem = memoryDb()
  if (from === null) return mem
  const tryRead = async <T>(f: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await f()
    } catch {
      return []
    }
  }
  for (const c of await tryRead(() => from.listCharts())) await mem.putChart(c)
  for (const r of await tryRead(() => from.listResults())) await mem.putResult(r)
  for (const row of await tryRead(() => from.listTelemetry())) await mem.appendTelemetry(row)
  return mem
}
