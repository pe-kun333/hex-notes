// 共有 URL を開く確認の覆い（M4-02 後半、M4 の手順 5）。出どころ: docs/planning/m4-kickoff.md 手順 5・§7-17（S1 の上の覆い。
// 画面の id は足さない）、decisions #117 (d)・#124。殻（shell.ts）が S1 の上に出し、押下を on へ返す。文言は share-view.ts。

import type { Chart } from '../shared/types.ts'
import { button, h } from './screens/frame.ts'
import {
  SHARE_CANCEL_LABEL,
  SHARE_CONFIRM_NOTE,
  SHARE_CONFIRM_TITLE,
  SHARE_OPEN_LABEL,
  shareConfirmRows,
} from './share-view.ts'

export interface ShareConfirm {
  readonly el: HTMLElement
  /** 押せる釦（保存して開く）。出した直後に焦点を置く */
  readonly primary: HTMLButtonElement
  /** 保存の途中は釦を押せなくする */
  busy(on: boolean): void
}

export function shareConfirm(
  doc: Document,
  chart: Chart,
  on: { readonly open: () => void; readonly cancel: () => void },
): ShareConfirm {
  const rows = h(doc, 'dl', { className: 'sharerows' })
  for (const [k, v] of shareConfirmRows(chart))
    rows.append(h(doc, 'dt', { text: k }), h(doc, 'dd', { text: v }))
  const primary = button(doc, SHARE_OPEN_LABEL, () => on.open(), 'primary')
  const cancel = button(doc, SHARE_CANCEL_LABEL, () => on.cancel())
  const card = h(doc, 'div', { className: 'card' },
    h(doc, 'h2', { text: SHARE_CONFIRM_TITLE }),
    rows,
    h(doc, 'p', { className: 'note', text: SHARE_CONFIRM_NOTE }),
    h(doc, 'div', { className: 'btnrow' }, primary, cancel),
  ) // prettier-ignore
  const el = h(doc, 'div', { className: 'shareconfirm' }, card)
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-modal', 'true')
  el.setAttribute('aria-label', SHARE_CONFIRM_TITLE)
  return {
    el,
    primary,
    busy: (b) => {
      primary.disabled = b
      cancel.disabled = b
    },
  }
}
