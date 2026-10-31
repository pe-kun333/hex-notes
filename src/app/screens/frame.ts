// 画面の枠（M1 の手順 2）。上帯（見出しと歯車）→ 帯の場所（上帯の直下）→ 中身、の縦積み。S2 はこれを使わない（右列が
// 視口の全高を使う。decisions #24・#65）。出どころ: m6 の .head・.topband・#bands（L298–307・L338）、design.md §1.3 S6
// 「全画面の歯車」。

import type { ScreenContext } from '../shell.ts'

export interface Frame {
  readonly root: HTMLElement
  readonly bandSlot: HTMLElement
  readonly body: HTMLElement
}

/** 子を付けた要素を作る小道具（文字は textContent で入れる） */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: { className?: string; text?: string; type?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag)
  if (props.className !== undefined) el.className = props.className
  if (props.text !== undefined) el.textContent = props.text
  if (props.type !== undefined && el instanceof HTMLButtonElement)
    el.type = props.type as HTMLButtonElement['type']
  el.append(...children)
  return el
}

/** ボタン（type=button。押すと f） */
export function button(
  doc: Document,
  text: string,
  f: () => void,
  className = '',
): HTMLButtonElement {
  const b = h(doc, 'button', { className, text, type: 'button' })
  b.addEventListener('click', f)
  return b
}

/** 上帯・帯の場所・中身の枠。gear が真なら歯車（S6 へ） */
export function frame(ctx: ScreenContext, title: string, opts: { gear: boolean }): Frame {
  const { doc } = ctx
  const head = h(doc, 'header', { className: 'topbar' }, h(doc, 'h1', { text: title }))
  if (opts.gear) head.append(button(doc, '⚙ 設定', () => ctx.go('S6'), 'small gear'))
  const bandSlot = h(doc, 'div', { className: 'bands' })
  bandSlot.setAttribute('role', 'status')
  bandSlot.setAttribute('aria-live', 'polite')
  const body = h(doc, 'div', { className: 'body' })
  const root = h(doc, 'section', { className: 'screen' }, head, bandSlot, body)
  return { root, bandSlot, body }
}
