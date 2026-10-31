// 計測層の開発ページ（M0-12、手順 12）。IndexedDB の telemetry に貯まった §4.6 の行を新しい順に並べ、種類ごとの数を出し、
// JSON で書き出す（§5.1 M0-12「§4.6 の行が貯まる」）。製品画面ではない（導線は開発時だけ、src/main.ts。計測盤は M1-12）。
// 行を足すのは play-dev（play・calib・device）と保存層の失敗（storageFail）。

import type { TelemetryRow } from '../../shared/types.ts'
import { resilientDb, storageFailRow } from '../../storage/fallback.ts'
import { openIdb } from '../../storage/idb.ts'
import {
  countByKind,
  telemetryExport,
  telemetryFileName,
  telemetryFileText,
} from '../../telemetry/export.ts'
import { downloadText } from '../file-io.ts'

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id)
  if (el === null) throw new Error(`#${id} が無い`)
  return el
}

const db = resilientDb(
  () => openIdb(globalThis.indexedDB),
  (f) => void db.appendTelemetry(storageFailRow(f, new Date().toISOString())),
)

/** 行の要約（play は数値を丸めて並べ、他は JSON のまま） */
function brief(r: TelemetryRow): string {
  const { kind: _k, at: _a, ...rest } = r
  if (r.kind !== 'play') return JSON.stringify(rest)
  const n = (x: number | null, d = 1): string => (x === null ? '—' : x.toFixed(d))
  return (
    `${r.chartId.slice(0, 18)}… ${r.variantId} ${r.profile} ${r.clock} ${r.mode}・精度 ${n(r.acc * 100)}%・UR ${n(r.ur)}・` +
    `NEAR ${n(r.nearRate * 100)}%・再同期 ${r.resyncCount}・切替 ${r.fallback}・入力遅延 ${n(r.inputLatencyMedian, 2)} ms` +
    `（押下 ${r.pressCount}、標本なし ${r.pressNoLag}）・フレーム SD ${n(r.frameIntervalSd, 2)} p95 ${n(r.frameIntervalP95)} ms・` +
    `時計残差 ${n(r.clockResidualSd, 2)}・予約の遅れ ${n(r.audioLateMaxMs)}・hist ${JSON.stringify(r.hist)}`
  )
}

async function render(): Promise<void> {
  const rows = await db.listTelemetry()
  $('mode').textContent = `置き場: ${await db.mode()}`
  const c = countByKind(rows)
  $('counts').textContent =
    `${rows.length} 行（` +
    Object.entries(c)
      .map(([k, v]) => `${k} ${v}`)
      .join('・') +
    '）'
  $('rows').replaceChildren(
    ...rows
      .map((r, i) => {
        const tr = document.createElement('tr')
        for (const [text, cls] of [
          [String(i + 1), ''],
          [r.at, ''],
          [r.kind, ''],
          [brief(r), 'json'],
        ] as const) {
          const td = document.createElement('td')
          td.textContent = text
          if (cls) td.className = cls
          tr.append(td)
        }
        return tr
      })
      .reverse(),
  )
}

$('reload').addEventListener('click', () => void render())
$('export').addEventListener('click', () => {
  void (async () => {
    const at = new Date().toISOString()
    downloadText(
      document,
      telemetryFileName(at),
      telemetryFileText(telemetryExport(await db.listTelemetry(), at)),
    )
  })()
})
$('clear').addEventListener('click', () => {
  void db.clear('telemetry').then(render)
})

void render()
