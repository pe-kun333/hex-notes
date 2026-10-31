// S6 設定の骨組み（M1 の手順 2。中身は手順 10、M1-07。手順 4 で校正の欄だけ置く）。出どころ: design.md §1.3 S6、m6 \`go\`
// L631（S6 は来た画面へ戻る）・S6 の「校正」L921（状態・オフセット〔自前音源〕・やり直す〔メトロノーム 24 打〕）。
// オフセット（YouTube）の行は M3-08（m1-kickoff §4）。

import { offsetFor } from '../../storage/local.ts'
import { calibrationPanel } from '../calibration-panel.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { button, frame, h } from './frame.ts'
import { calibText } from './home.ts'

export function settingsScreen(ctx: ScreenContext): ScreenView {
  const { doc } = ctx
  const f = frame(ctx, '設定', { gear: false })
  const state = h(doc, 'b')
  const showState = (): void => {
    const c = ctx.calibration()
    state.textContent = calibText(c.audio === undefined ? null : offsetFor(c, 'audio'))
  }
  showState()
  const panel = calibrationPanel(ctx, { onDone: showState })
  f.body.append(
    h(
      doc,
      'section',
      { className: 'group' },
      h(doc, 'h2', { text: '校正' }),
      h(doc, 'p', {}, 'オフセット（自前音源）: ', state),
      panel.el,
    ),
    h(doc, 'p', { className: 'note', text: 'ほかの設定の画面は準備中です。' }),
    h(
      doc,
      'div',
      { className: 'btnrow' },
      button(doc, '戻る', () => ctx.go('back'), 'primary'),
    ),
  )
  return {
    root: f.root,
    bandSlot: f.bandSlot,
    onInput: panel.onInput,
    unmount: panel.unmount,
  }
}
