// S6 設定の骨組み（M1 の手順 2。中身は手順 10、M1-07）。出どころ: design.md §1.3 S6、m6 `go` L631（S6 は来た画面へ戻る）。

import type { ScreenContext, ScreenView } from '../shell.ts'
import { button, frame, h } from './frame.ts'

export function settingsScreen(ctx: ScreenContext): ScreenView {
  const { doc } = ctx
  const f = frame(ctx, '設定', { gear: false })
  f.body.append(
    h(doc, 'p', { className: 'note', text: '設定の画面は準備中です。' }),
    h(
      doc,
      'div',
      { className: 'btnrow' },
      button(doc, '戻る', () => ctx.go('back'), 'primary'),
    ),
  )
  return { root: f.root, bandSlot: f.bandSlot, unmount: () => {} }
}
