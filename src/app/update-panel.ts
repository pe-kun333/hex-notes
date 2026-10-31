// アプリの更新の行（M1-09、M1 の手順 13。S6 と S3 で同じ物）。出どころ: ADR 0004（更新は S6 か結果画面で利用者が押したとき
// だけ）、m1-kickoff 手順 13。文言は sw-update.ts の updateView（純関数）。DOM に触れる薄い部分。

import { button, h } from './screens/frame.ts'
import type { ScreenContext } from './shell.ts'
import { updateView } from './sw-update.ts'

export interface UpdatePanel {
  /** 出す物が無い間（S3 で新しい版が無い）は hidden */
  readonly el: HTMLElement
  /** ctx.update() を読み直す（画面の onUpdate から呼ぶ） */
  refresh(): void
}

export function updatePanel(ctx: ScreenContext, where: 'S6' | 'S3'): UpdatePanel {
  const { doc } = ctx
  const el = h(doc, 'div', { className: 'btnrow update' })
  const refresh = (): void => {
    const v = updateView(ctx.update(), where)
    el.hidden = v === null
    if (v === null) return el.replaceChildren()
    el.replaceChildren(
      h(doc, 'span', { className: where === 'S3' ? '' : 'note', text: v.text }),
      ...(v.action === null
        ? []
        : [
            button(
              doc,
              v.action,
              () => ctx.applyUpdate(),
              where === 'S3' ? 'small primary' : 'small',
            ),
          ]),
    )
  }
  refresh()
  return { el, refresh }
}
