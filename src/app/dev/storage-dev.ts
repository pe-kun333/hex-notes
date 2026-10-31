// 保存層の開発ページ（M0-09、手順 11）。localStorage の 4 つの記録・sessionStorage・IndexedDB・旧鍵の移行・*.hexnote.json の
// 往復を本物のブラウザで確かめる（§5.1 M0-09「プライベートウィンドウと容量超過で通知」）。製品画面ではない（導線は開発時
// だけ、src/main.ts）。
// 容量超過は「埋める」で localStorage を 512 KB の文字列で埋めてから保存して起こす（Claude アプリの Chromium は 32 MB 入れても
// 超えなかったので、?quota=1 でも起こす: 本物の localStorage と IndexedDB を包み、hexnote. の鍵と DB への書き込みで
// QuotaExceededError の DOMException を投げる。読みは本物）。プライベートウィンドウ・Cookie の遮断は ?deny=1 で、
// localStorage・sessionStorage を開くと SecurityError、indexedDB.open が InvalidStateError になる形を真似る（今の Chromium の
// シークレットは保存できるので、失敗はここで作る）。storageFail の行はアプリの DB の telemetry にも足す。

import { normalizeChart } from '../../chart/validate.ts'
import { fadeAfter } from '../../judge/self-rate.ts'
import { LAYOUT_IDS, type Chart, type ResultRecord } from '../../shared/types.ts'
import {
  STORAGE_FAIL_BAND_TEXT,
  resilientDb,
  safeStorage,
  storageFailRow,
  type StorageFailure,
  type StorageLike,
} from '../../storage/fallback.ts'
import {
  backupFileName,
  backupFileText,
  chartFileName,
  chartFileText,
  importText,
  makeBackup,
} from '../../storage/file.ts'
import { IDB_VERSION, openIdb, type HexDb } from '../../storage/idb.ts'
import {
  LOCAL_KEYS,
  loadCalibration,
  loadDevice,
  loadFade,
  loadSettings,
  saveCalibration,
  saveDevice,
  saveFade,
  saveSettings,
} from '../../storage/local.ts'
import { LEGACY_KEYS, migrateLegacy } from '../../storage/migrate.ts'
import { BOOTED_KEY, isBooted, isFirstRun, markBooted } from '../../storage/session.ts'
import { downloadText } from '../file-io.ts'

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (el === null) throw new Error(`#${id} が無い`)
  return el as T
}
const iso = (): string => new Date().toISOString()
const FILL_PREFIX = 'hexnote.devfill.'

// ---------- 置き場 ----------

const params = new URLSearchParams(location.search)
const deny = params.get('deny') === '1'
const quota = params.get('quota') === '1'
const denied = (): never => {
  throw new DOMException('遮断の真似（?deny=1）', 'SecurityError')
}
const quotaError = (): DOMException =>
  new DOMException('容量超過の真似（?quota=1）', 'QuotaExceededError')

/** ?quota=1: hexnote. の鍵を書くと容量超過（読み・消しと他の鍵は本物） */
function quotaStorage(ls: Storage): StorageLike {
  return {
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => {
      if (k.startsWith('hexnote.')) throw quotaError()
      ls.setItem(k, v)
    },
    removeItem: (k) => ls.removeItem(k),
  }
}

/** ?quota=1: DB への書き込みで容量超過（読みは本物） */
function quotaDb(d: HexDb): HexDb {
  const full = (): Promise<never> => Promise.reject(quotaError())
  return { ...d, putChart: full, putResult: full, appendTelemetry: full }
}
const fails: { at: string; where: string; message: string }[] = []

function report(f: StorageFailure): void {
  const row = storageFailRow(f, iso())
  fails.push(row)
  // アプリの DB にも足す（DB が失敗したときはメモリへ行く）
  void db.appendTelemetry(row)
  render()
}

const local = safeStorage(
  'local',
  deny ? denied : quota ? () => quotaStorage(window.localStorage) : () => window.localStorage,
  report,
)
const session = safeStorage('session', deny ? denied : () => window.sessionStorage, report)
const db = resilientDb(
  () =>
    deny
      ? Promise.reject(new DOMException('遮断の真似（?deny=1）', 'InvalidStateError'))
      : openIdb(globalThis.indexedDB).then((d) => (quota ? quotaDb(d) : d)),
  report,
)

// ---------- 表示 ----------

function cell(tr: HTMLTableRowElement, text: string, cls = ''): void {
  const td = document.createElement('td')
  td.textContent = text
  if (cls) td.className = cls
  tr.append(td)
}

function dl(el: HTMLElement, rows: readonly [string, string][]): void {
  el.replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt')
      dt.textContent = k
      const dd = document.createElement('dd')
      dd.textContent = v
      return [dt, dd]
    }),
  )
}

function render(): void {
  void db.mode().then((idbMode) => {
    dl($('modes'), [
      ['localStorage', local.mode()],
      ['sessionStorage', session.mode()],
      ['IndexedDB', idbMode],
      ['初回か', String(isFirstRun(local, session))],
      [BOOTED_KEY, String(isBooted(session))],
      ['?deny・?quota', `${deny}・${quota}`],
    ])
  })
  $('band').hidden = fails.length === 0
  $('bandText').textContent = STORAGE_FAIL_BAND_TEXT
  $('fails').replaceChildren(
    ...fails.map((f) => {
      const tr = document.createElement('tr')
      cell(tr, f.at)
      cell(tr, f.where)
      cell(tr, f.message)
      return tr
    }),
  )
  const recs: [string, unknown][] = [
    [LOCAL_KEYS.settings, loadSettings(local)],
    [LOCAL_KEYS.calibration, loadCalibration(local)],
    [LOCAL_KEYS.device, loadDevice(local)],
    [LOCAL_KEYS.fade, loadFade(local)],
  ]
  $('records').replaceChildren(
    ...recs.map(([k, v]) => {
      const tr = document.createElement('tr')
      cell(tr, k)
      const td = document.createElement('td')
      const pre = document.createElement('pre')
      pre.textContent = `${JSON.stringify(v)}\n（本物: ${raw(k) ?? 'なし'}）`
      td.append(pre)
      tr.append(td)
      return tr
    }),
  )
  void counts()
}

/** 本物の localStorage の値（失敗の真似の間は読まない） */
function raw(key: string): string | null {
  if (deny) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

async function counts(): Promise<void> {
  const [c, r, t] = await Promise.all([db.listCharts(), db.listResults(), db.listTelemetry()])
  dl($('idbCounts'), [
    ['charts', String(c.length)],
    ['results', String(r.length)],
    ['telemetry', `${t.length}（storageFail ${t.filter((x) => x.kind === 'storageFail').length}）`],
  ])
}

// ---------- localStorage の記録 ----------

$('saveSettings').addEventListener('click', () => {
  const s = loadSettings(local)
  const next = LAYOUT_IDS[(LAYOUT_IDS.indexOf(s.layout) + 1) % LAYOUT_IDS.length] ?? 'ableton'
  saveSettings(local, { ...s, layout: next })
  render()
})
$('saveCalib').addEventListener('click', () => {
  saveCalibration(local, 'audio', {
    offsetMs: Math.round(Math.random() * 60 - 30),
    at: iso(),
    via: 'manual',
  })
  render()
})
$('saveDevice').addEventListener('click', () => {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: unknown } }).keyboard
  saveDevice(local, {
    limit: 3,
    at: iso(),
    layoutMapOk: typeof kb?.getLayoutMap === 'function',
  })
  render()
})
$('saveFade').addEventListener('click', () => {
  saveFade(local, fadeAfter(loadFade(local), 60 + Math.floor(Math.random() * 12), 'solo'))
  render()
})
$('markBooted').addEventListener('click', () => {
  markBooted(session)
  render()
})
$('clearNew').addEventListener('click', () => {
  for (const k of Object.values(LOCAL_KEYS)) local.remove(k)
  session.remove(BOOTED_KEY)
  render()
})

// ---------- 失敗を起こす ----------

$('fill').addEventListener('click', () => {
  let n = 0
  const chunk = 'x'.repeat(512 * 1024)
  let full = false
  try {
    const ls: StorageLike = window.localStorage
    for (; n < 64; n++) ls.setItem(`${FILL_PREFIX}${n}`, chunk)
  } catch (e) {
    full = true
    $('fillNote').textContent =
      `${n} 個（${(n * 0.5).toFixed(1)} MB）で ${(e as Error).name}。続けて設定を保存する。`
  }
  if (!full) $('fillNote').textContent = `${n} 個入った（容量超過にならなかった）`
  saveSettings(local, { ...loadSettings(local), fold: 'cut' })
  render()
})
$('unfill').addEventListener('click', () => {
  try {
    const ls = window.localStorage
    for (const k of Object.keys(ls)) if (k.startsWith(FILL_PREFIX)) ls.removeItem(k)
  } catch {
    // 遮断の真似の間は何もしない
  }
  location.reload()
})

// ---------- 旧鍵の移行 ----------

$('putLegacy').addEventListener('click', () => {
  const put: [string, string][] = [
    [LEGACY_KEYS.limit, '7'],
    [LEGACY_KEYS.m3, '-37'],
    [LEGACY_KEYS.m5, JSON.stringify({ layout: 'fl', fold: 'nearest', limit: 3, videoId: '' })],
    [
      LEGACY_KEYS.m4,
      JSON.stringify({ fade: { 60: 0.76 }, kb: 'note', note: 'none', fadeMode: 'linked' }),
    ],
    [LEGACY_KEYS.m2, JSON.stringify([{ name: 'mine', v: [0.5, 0.25, 0.5] }])],
    [
      LEGACY_KEYS.m6,
      JSON.stringify({ profile: 'gamer', first: 'again', source: 'youtube', theme: 'auto' }),
    ],
  ]
  for (const [k, v] of put) local.set(k, v)
  $('migrateOut').textContent = `置いた: ${put.map(([k]) => k).join('、')}`
})
$('migrate').addEventListener('click', () => {
  $('migrateOut').textContent = JSON.stringify(migrateLegacy(local, iso()), null, 1)
  render()
})

// ---------- IndexedDB ----------

async function fixture(name: 'canon' | 'twinkle'): Promise<Chart> {
  const res = await fetch(`/tests/fixtures/charts/m5/${name}.hexnote.json`)
  return normalizeChart(await res.json()) as Chart
}

function result(id: string, chartId: string): ResultRecord {
  return {
    id,
    chartId,
    variantId: 'ableton/2/octave',
    profile: 'beginner',
    clock: 'novideo',
    mode: 'fixed',
    rate: 1,
    keyset: 'all',
    at: iso(),
    acc: 0.9,
    rank: 'A',
    counts: { perfect: 5, great: 2, good: 1, near: 1, miss: 1 },
    selfRate: { solo: 2, hinted: 5, near: 1, miss: 2 },
    syncUsed: { kind: 'audio' },
    offsetUsed: 0,
    skipped: 0,
  }
}

/** 版 1 の store・index が出来たか（本物の IDBDatabase を開いて見る） */
function schemaOf(name: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, IDB_VERSION)
    r.onerror = () => reject(r.error)
    r.onsuccess = () => {
      const d = r.result
      const tx = d.transaction([...d.objectStoreNames], 'readonly')
      const out = [...d.objectStoreNames].map((s) => {
        const st = tx.objectStore(s)
        const idx = [...st.indexNames].map((i) => `${i}=${JSON.stringify(st.index(i).keyPath)}`)
        return `${s}(key ${JSON.stringify(st.keyPath)}${st.autoIncrement ? ' auto' : ''}${idx.length ? ' ' + idx.join(' ') : ''})`
      })
      d.close()
      resolve(`v${d.version} ${out.join(' ')}`)
    }
  })
}

$('idbCheck').addEventListener('click', () => {
  void (async () => {
    const out: [string, boolean, string][] = []
    const check = (name: string, ok: boolean, detail = ''): void =>
      void out.push([name, ok, detail])
    const name = 'hexnote-devcheck'
    try {
      await new Promise<void>((res) => {
        const d = indexedDB.deleteDatabase(name)
        d.onsuccess = d.onerror = d.onblocked = () => res()
      })
      const t: HexDb = await openIdb(globalThis.indexedDB, name)
      const schema = await schemaOf(name)
      check(
        '版 1 の store と index',
        schema ===
          'v1 charts(key "id" rights="source.rights") results(key "id" best=["chartId","variantId","profile","clock"] chartId="chartId") telemetry(key null auto)',
        schema,
      )
      const canon = await fixture('canon')
      const twinkle = await fixture('twinkle')
      await t.putChart(canon)
      await t.putChart(twinkle)
      await t.putChart(canon)
      const got = await t.getChart(canon.id)
      check('putChart → getChart が同じ', JSON.stringify(got) === JSON.stringify(canon))
      check('listCharts は 2 曲（同じ id は上書き）', (await t.listCharts()).length === 2)
      await t.putResult(result('r1', canon.id))
      await t.putResult(result('r2', canon.id))
      await t.putResult(result('r3', twinkle.id))
      await t.putResult(result('r1', canon.id))
      check(
        'listResults(canon) は 2 件・全体 3 件',
        (await t.listResults(canon.id)).length === 2 && (await t.listResults()).length === 3,
      )
      for (let i = 1; i <= 1005; i++)
        await t.appendTelemetry({ kind: 'embedError', at: iso(), code: i })
      const rows = await t.listTelemetry()
      const first = rows[0]
      const last = rows.at(-1)
      check(
        'telemetry 1,005 行 → 1,000 行、先頭は 6 行目',
        rows.length === 1000 &&
          first?.kind === 'embedError' &&
          first.code === 6 &&
          last?.kind === 'embedError' &&
          last.code === 1005,
        `${rows.length} 行、先頭 ${first?.kind === 'embedError' ? first.code : '?'}`,
      )
      await t.deleteChart(twinkle.id)
      check('deleteChart', (await t.getChart(twinkle.id)) === undefined)
      await t.clear('telemetry')
      check('clear(telemetry)', (await t.listTelemetry()).length === 0)
    } catch (e) {
      check('例外', false, String(e))
    }
    $('idbOut').replaceChildren(
      ...out.map(([n, ok, d]) => {
        const tr = document.createElement('tr')
        cell(tr, ok ? '通過' : '不合格', ok ? 'ok' : 'ng')
        cell(tr, n)
        cell(tr, d)
        return tr
      }),
    )
  })()
})

$('idbAdd').addEventListener('click', () => {
  void (async () => {
    const canon = await fixture('canon')
    await db.putChart(canon)
    await db.putResult(result(crypto.randomUUID(), canon.id))
    render()
  })()
})
$('idbClear').addEventListener('click', () => {
  void (async () => {
    await Promise.all([db.clear('charts'), db.clear('results'), db.clear('telemetry')])
    render()
  })()
})

// ---------- *.hexnote.json ----------

async function backupNow(): Promise<string> {
  const b = makeBackup(
    {
      settings: loadSettings(local),
      fade: loadFade(local),
      charts: await db.listCharts(),
      results: await db.listResults(),
    },
    iso(),
  )
  return backupFileText(b)
}

$('roundTrip').addEventListener('click', () => {
  void (async () => {
    const lines: string[] = []
    for (const name of ['canon', 'twinkle'] as const) {
      const c = await fixture(name)
      const r = await importText(chartFileText(c))
      lines.push(
        `${chartFileName(c)}: ${r.kind === 'chart' && JSON.stringify(r.chart) === JSON.stringify(c) && !r.idChanged ? '同じ' : '違う ' + JSON.stringify(r).slice(0, 200)}`,
      )
    }
    const text = await backupNow()
    const r = await importText(text)
    lines.push(
      `控え: ${r.kind === 'backup' && backupFileText(r.backup) === text ? '同じ' : '違う'}（${text.length} 文字）`,
    )
    $('fileOut').textContent = lines.join('\n')
  })()
})

$('exportChart').addEventListener('click', () => {
  void (async () => {
    const c = await fixture('canon')
    const ok = downloadText(document, chartFileName(c), chartFileText(c))
    $('fileOut').textContent = ok ? `書き出した: ${chartFileName(c)}` : '書き出せなかった'
  })()
})
async function exportBackup(): Promise<void> {
  const at = iso()
  const ok = downloadText(document, backupFileName(at), await backupNow())
  $('fileOut').textContent = ok ? `書き出した: ${backupFileName(at)}` : '書き出せなかった'
}
$('exportBackup').addEventListener('click', () => void exportBackup())
$('bandExport').addEventListener('click', () => void exportBackup())

$('importFile').addEventListener('change', (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0]
  if (file === undefined) return
  void (async () => {
    const r = await importText(await file.text())
    if (r.kind === 'chart') {
      await db.putChart(r.chart)
      $('fileOut').textContent =
        `譜面「${r.chart.name}」を入れた（id ${r.idChanged ? '付け直し' : 'そのまま'}）`
    } else if (r.kind === 'backup') {
      for (const c of r.backup.charts) await db.putChart(c)
      for (const x of r.backup.results) await db.putResult(x)
      saveSettings(local, r.backup.settings)
      saveFade(local, r.backup.fade)
      $('fileOut').textContent =
        `控え: 曲 ${r.backup.charts.length}・記録 ${r.backup.results.length} を入れた（捨てた 曲 ${r.dropped.charts}・記録 ${r.dropped.results}、id 付け直し ${r.idChanged}）`
    } else {
      $('fileOut').textContent = `取り込めない（${r.reason}）: ${r.issues.join(' / ')}`
    }
    render()
  })()
})

// 起動: 旧鍵の移行 → 表示（失敗なら既定値で続ける。§4.1 の流れ）
migrateLegacy(local, iso())
render()
