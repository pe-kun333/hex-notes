// S6 の計測盤（M1-12、M1 の手順 12）。出どころ: design.md §1.3 S6・§4.6、m6 renderS6 の計測盤 L926、decisions #55 (d)、
// m1-kickoff 手順 12（完了条件「自分の行が見え書き出せる」）。開発ページ telemetry-dev.ts（行の一覧・種類ごとの数・書き出し）を
// 製品の部品にした物。行は保存層の telemetry（IndexedDB。壊れていればメモリ内、decisions #50・#51）から読む。文言は
// telemetry-view.ts（純関数）。DOM に触れる薄い部分。行を消す釦は出さない（§1.3 S6 のデータに無い。開発ページには残す）。

import type { TelemetryRow } from '../shared/types.ts'
import { downloadText } from './file-io.ts'
import { button, h } from './screens/frame.ts'
import type { ScreenContext } from './shell.ts'
import { RECENT_ROWS, telemetryDownload, telemetryPanelView } from './telemetry-view.ts'

export interface TelemetryPanel {
  readonly el: HTMLElement
  /** 読み直す（S6 の中で校正・同時押しテストが行を足した後） */
  refresh(): void
  unmount(): void
}

export function telemetryPanel(ctx: ScreenContext): TelemetryPanel {
  const { doc, booted } = ctx
  let alive = true
  const total = h(doc, 'p', { text: '読み込み中…' })
  const counts = h(doc, 'tbody')
  const recent = h(doc, 'tbody')
  const msg = h(doc, 'p', { className: 'note' })
  const list = async (): Promise<TelemetryRow[]> => booted.db.listTelemetry().catch(() => [])

  const refresh = (): void => {
    void list().then((rows) => {
      if (!alive) return
      const v = telemetryPanelView(rows)
      total.textContent = v.total
      counts.replaceChildren(...v.counts.map((c) => h(doc, 'tr', {}, h(doc, 'td', { text: c.label }), h(doc, 'td', { className: 'num', text: String(c.n) }))))
      recent.replaceChildren(
        ...(v.recent.length === 0
          ? [h(doc, 'tr', {}, h(doc, 'td', { className: 'note', text: 'まだ行がありません。' }))]
          : v.recent.map((r) => h(doc, 'tr', {}, h(doc, 'td', { className: 'num', text: r.at }), h(doc, 'td', { text: r.kind }), h(doc, 'td', { className: 'brief', text: r.text })))),
      )
    })
  } // prettier-ignore

  const exportRows = async (): Promise<void> => {
    const rows = await list()
    const f = telemetryDownload(rows, new Date().toISOString())
    const ok = downloadText(doc, f.name, f.text)
    if (alive) msg.textContent = ok ? `${f.name} に書き出しました（${rows.length} 行）。` : '書き出せませんでした。'
  } // prettier-ignore

  const el = h(
    doc,
    'section',
    { className: 'group telemetry' },
    h(doc, 'h2', { text: '計測盤' }),
    total,
    h(doc, 'table', { className: 't' }, counts),
    h(doc, 'h3', { text: `最近の行（新しい順に ${RECENT_ROWS} 行まで）` }),
    h(doc, 'div', { className: 'scroll' }, h(doc, 'table', { className: 't rows' }, recent)),
    h(
      doc,
      'div',
      { className: 'btnrow' },
      button(doc, 'JSON で書き出す', () => void exportRows(), 'small'),
      button(doc, '読み直す', refresh, 'small'),
    ),
    msg,
  )
  refresh()
  return {
    el,
    refresh,
    unmount: () => {
      alive = false
    },
  }
}
