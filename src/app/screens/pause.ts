// Pause メニュー（M1-13、M1 の手順 2）。出どころ: design.md §1.3 S2「Pause（Esc・blur・visibilitychange）は再開／最初から／
// やめる。再開は S7b を通る」、m6 Pause の覆い L347–353（文言）、m1-kickoff 手順 2 の手直し（覆うのは右列だけ。矩形の外）。
// 選択の意味は play-control.ts（再開 ＝ 同期中へ、最初から ＝ 曲の頭から、やめる ＝ S1 へ記録なし）。

import type { PauseChoice } from '../play-control.ts'
import { button, h } from './frame.ts'

export interface PauseOverlay {
  readonly el: HTMLElement
  /** 出す（焦点を「再開」へ。Enter で押せる） */
  show(): void
  hide(): void
}

export function pauseOverlay(doc: Document, onChoice: (c: PauseChoice) => void): PauseOverlay {
  const resume = button(doc, '', () => onChoice('resume'), 'primary')
  resume.append('再開 ', h(doc, 'kbd', { text: 'Space' }))
  const card = h(
    doc,
    'div',
    { className: 'card' },
    h(doc, 'h2', { text: '一時停止' }),
    h(doc, 'p', {
      className: 'note',
      text: 'Esc・ウィンドウ切替・タブ非表示で止まります。再開は「同期中」を通り、300 ms は判定を猶予します。',
    }),
    h(
      doc,
      'div',
      { className: 'btnrow' },
      resume,
      button(doc, '最初から', () => onChoice('restart')),
      button(doc, 'やめる', () => onChoice('quit')),
    ),
  )
  const el = h(doc, 'div', { className: 'pause' }, card)
  el.hidden = true
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', '一時停止')
  return {
    el,
    show: () => {
      if (!el.hidden) return
      el.hidden = false
      resume.focus({ preventScroll: true })
    },
    hide: () => {
      el.hidden = true
    },
  }
}
