// 計測層の開発ページ（M0-12、手順 12）。IndexedDB の telemetry に貯まった §4.6 の行を新しい順に並べ、種類ごとの数を出し、
// JSON で書き出す（§5.1 M0-12「§4.6 の行が貯まる」）。製品画面ではない（導線は開発時だけ、src/main.ts）。製品の計測盤は S6
// （src/app/telemetry-panel.ts、M1-12）で、行の要約と書き出しの中身は同じ telemetry-view.ts を使う。全行と「消す」はここだけ。
// 行を足すのは play-dev（play・calib・device）と保存層の失敗（storageFail）。

import { resilientDb, storageFailRow } from '../../storage/fallback.ts'
import { openIdb } from '../../storage/idb.ts'
import { countByKind } from '../../telemetry/export.ts'
import { downloadText } from '../file-io.ts'
import { rowBrief, telemetryDownload } from '../telemetry-view.ts'

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id)
  if (el === null) throw new Error(`#${id} が無い`)
  return el
}

const db = resilientDb(
  () => openIdb(globalThis.indexedDB),
  (f) => void db.appendTelemetry(storageFailRow(f, new Date().toISOString())),
)

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
          [rowBrief(r), 'json'],
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
    const f = telemetryDownload(await db.listTelemetry(), new Date().toISOString())
    downloadText(document, f.name, f.text)
  })()
})
$('clear').addEventListener('click', () => {
  void db.clear('telemetry').then(render)
})

void render()
