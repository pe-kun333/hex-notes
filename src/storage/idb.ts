// IndexedDB（M0-09、手順 11）。出どころ: design.md §4.3（charts 主キー id・索引 rights、results の形、telemetry リング
// 1,000 行）・§4.4（自己ベストの単位 (chartId, variantId, profile, clock)）、kickoff 手順 11（追加: IndexedDB charts／
// results／telemetry）、decisions #51（仮）。モックに IndexedDB は無い（新規）。
// 版 1 の store と index:
//   charts    keyPath id、index rights（source.rights）
//   results   keyPath id、index chartId、index best（[chartId, variantId, profile, clock]。M1-11 の自己ベスト）
//   telemetry 鍵は自動の連番（行に鍵を足さない）。足すたびに古い順に消して 1,000 行に保つ
// 失敗はここでは投げるだけ。飲み込んでメモリ内で続けるのは fallback.ts の resilientDb。

import type { Chart, ResultRecord, TelemetryRow } from '../shared/types.ts'
import { TELEMETRY_RING_SIZE } from '../shared/types.ts'

export const IDB_NAME = 'hexnote'
export const IDB_VERSION = 1

export type StoreName = 'charts' | 'results' | 'telemetry'
export const STORE_NAMES: readonly StoreName[] = ['charts', 'results', 'telemetry']

export const INDEX = {
  chartsRights: 'rights',
  resultsChart: 'chartId',
  resultsBest: 'best',
} as const

/** 保存層の IndexedDB の口（本物 idb、メモリ memory、包んだ物 resilient が同じ形） */
export interface HexDb {
  readonly kind: 'idb' | 'memory' | 'resilient'
  /** 同じ id は上書き */
  putChart(c: Chart): Promise<void>
  getChart(id: string): Promise<Chart | undefined>
  listCharts(): Promise<Chart[]>
  deleteChart(id: string): Promise<void>
  /** 同じ id は上書き（取り込みを 2 回しても増えない） */
  putResult(r: ResultRecord): Promise<void>
  /** chartId を渡せばその曲だけ */
  listResults(chartId?: string): Promise<ResultRecord[]>
  /** 足した順。1,000 行を超えたら古い順に消す */
  appendTelemetry(row: TelemetryRow): Promise<void>
  listTelemetry(): Promise<TelemetryRow[]>
  clear(store: StoreName): Promise<void>
}

/** 版ごとの作り替え（oldVersion は開く前の版。0 は新規） */
export function upgradeDb(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const charts = db.createObjectStore('charts', { keyPath: 'id' })
    charts.createIndex(INDEX.chartsRights, 'source.rights')
    const results = db.createObjectStore('results', { keyPath: 'id' })
    results.createIndex(INDEX.resultsChart, 'chartId')
    results.createIndex(INDEX.resultsBest, ['chartId', 'variantId', 'profile', 'clock'])
    db.createObjectStore('telemetry', { autoIncrement: true })
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('IDBRequest の失敗'))
  })
}

/** 取引が終わる（complete）まで待つ。abort・error は取引の error か要求の error で reject */
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IDBTransaction の失敗'))
    tx.onabort = () => reject(tx.error ?? new DOMException('取引が中断された', 'AbortError'))
  })
}

/** 書く取引を 1 つ回して complete まで待つ */
async function write(
  db: IDBDatabase,
  store: StoreName,
  f: (s: IDBObjectStore) => void,
): Promise<void> {
  const tx = db.transaction(store, 'readwrite')
  const finished = done(tx)
  f(tx.objectStore(store))
  await finished
}

async function read<T>(
  db: IDBDatabase,
  store: StoreName,
  f: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const tx = db.transaction(store, 'readonly')
  return req(f(tx.objectStore(store)))
}

/**
 * IndexedDB を開く（無ければ版 1 を作る）。factory は app/ が渡す globalThis.indexedDB（無い・遮断なら reject）。
 * 別のタブが新しい版で開こうとしたら（versionchange）閉じる。以後の操作は InvalidStateError で失敗し、resilientDb が
 * メモリ内へ移す。
 */
export function openIdb(factory: IDBFactory | undefined, name = IDB_NAME): Promise<HexDb> {
  return new Promise((resolve, reject) => {
    if (factory === undefined) {
      reject(new DOMException('indexedDB が無い', 'InvalidStateError'))
      return
    }
    let r: IDBOpenDBRequest
    try {
      r = factory.open(name, IDB_VERSION)
    } catch (e) {
      reject(e)
      return
    }
    r.onupgradeneeded = (ev) => upgradeDb(r.result, ev.oldVersion)
    r.onblocked = () =>
      reject(new DOMException('古い版を開いているタブがある', 'InvalidStateError'))
    r.onerror = () => reject(r.error ?? new Error('indexedDB.open の失敗'))
    r.onsuccess = () => {
      const db = r.result
      db.onversionchange = () => db.close()
      resolve(wrap(db))
    }
  })
}

function wrap(db: IDBDatabase): HexDb {
  return {
    kind: 'idb',
    putChart: (c) => write(db, 'charts', (s) => s.put(c)),
    getChart: (id) => read(db, 'charts', (s) => s.get(id) as IDBRequest<Chart | undefined>),
    listCharts: () => read(db, 'charts', (s) => s.getAll() as IDBRequest<Chart[]>),
    deleteChart: (id) => write(db, 'charts', (s) => s.delete(id)),
    putResult: (r) => write(db, 'results', (s) => s.put(r)),
    listResults: (chartId) =>
      read(
        db,
        'results',
        (s) =>
          (chartId === undefined
            ? s.getAll()
            : s.index(INDEX.resultsChart).getAll(chartId)) as IDBRequest<ResultRecord[]>,
      ),
    appendTelemetry: (row) =>
      write(db, 'telemetry', (s) => {
        s.add(row)
        const n = s.count()
        n.onsuccess = () => {
          let extra = n.result - TELEMETRY_RING_SIZE
          if (extra <= 0) return
          const cur = s.openCursor()
          cur.onsuccess = () => {
            const c = cur.result
            if (c === null || extra <= 0) return
            c.delete()
            extra--
            c.continue()
          }
        }
      }),
    listTelemetry: () => read(db, 'telemetry', (s) => s.getAll() as IDBRequest<TelemetryRow[]>),
    clear: (store) => write(db, store, (s) => s.clear()),
  }
}
