// S3 結果の骨組み（M1 の手順 2。中身は手順 5、M1-06）。出どころ: design.md §1.2（S3 → もう一度・S1）、m6 S3 L360–393。

import type { ScreenContext, ScreenView } from '../shell.ts'
import { button, frame, h } from './frame.ts'

export function resultScreen(ctx: ScreenContext): ScreenView {
  const { doc } = ctx
  const f = frame(ctx, '結果', { gear: true })
  f.body.append(
    h(doc, 'p', { className: 'note', text: '結果の画面は準備中です。' }),
    h(
      doc,
      'div',
      { className: 'btnrow' },
      button(doc, 'もう一度', () => ctx.go('S2'), 'primary'),
      button(doc, 'ホームへ', () => ctx.go('S1')),
    ),
  )
  return { root: f.root, bandSlot: f.bandSlot, unmount: () => {} }
}
