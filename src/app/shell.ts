// 製品の殻（M1-13、M1 の手順 2）。画面の差し替え（router.ts）、帯の表示（bands.ts）、キー入力の受け口（dom-input.ts）を
// 1 か所に持つ。出どころ: design.md §1.2・§1.3 S2（通知はプレイヤー矩形の外）・§2.8（Enter＝ボタン決定）、decisions #26
// （演奏・役割の鍵は preventDefault するので、Enter で焦点のボタンを押すのはここ）・#65（帯の置き場、仮）、m6 `render` L946–950
// （状態 → 描く）。状態は startShell の閉包に持つ（グローバルに置かない）。試験の外（DOM）なので手で確かめる（M1 の手順 14）。

import type { InputEvent } from '../input/keyboard.ts'
import type { Settings } from '../storage/local.ts'
import {
  bandOutside,
  bandStep,
  bandsOf,
  initialBands,
  type Band,
  type BandEvent,
  type BandsState,
} from './bands.ts'
import type { Booted } from './boot.ts'
import { attachKeyboard } from './dom-input.ts'
import { navigate, type Route, type ScreenId } from './router.ts'

/** 開発ページへの導線（dev のときだけ S1 に出す。build では空） */
export interface DevPage {
  readonly href: string
  readonly label: string
}

/** 画面が殻から受け取る物 */
export interface ScreenContext {
  readonly doc: Document
  readonly booted: Booted
  settings(): Settings
  /** 画面を移る（行けない先は無視。router.ts） */
  go(to: ScreenId | 'back'): void
  /** 帯への知らせ（低負荷・予約の遅れなど。IME と保存の失敗は殻が受ける） */
  band(ev: BandEvent): void
  readonly devPages: readonly DevPage[]
}

/** 画面の DOM と受け口 */
export interface ScreenView {
  readonly root: HTMLElement
  /** 帯を出す場所（上帯の直下。S2 は左列のプレイヤー矩形と HUD の下、#65） */
  readonly bandSlot: HTMLElement
  /** プレイヤー矩形（S2 だけ。帯が重ならないかを dev ビルドで確かめる） */
  readonly player?: HTMLElement
  /** 入力イベント（Enter の焦点のボタンと IME の帯は殻が先に処理する） */
  onInput?(events: readonly InputEvent[]): void
  /** 視口が変わった */
  onResize?(): void
  unmount(): void
}

export type ScreenFactory = (ctx: ScreenContext) => ScreenView

export interface ShellOptions {
  readonly doc: Document
  /** 画面を入れる要素（tabindex 付き。iframe・select からの焦点の戻し先） */
  readonly host: HTMLElement
  readonly booted: Booted
  readonly screens: Readonly<Record<ScreenId, ScreenFactory>>
  readonly devPages?: readonly DevPage[]
}

export interface Shell {
  band(ev: BandEvent): void
  route(): Route
}

function bandElement(doc: Document, b: Band, onDismiss: () => void): HTMLElement {
  const el = doc.createElement('div')
  el.className = `band band-${b.kind}`
  el.dataset['band'] = b.kind
  const title = doc.createElement('b')
  title.textContent = b.title
  const detail = doc.createElement('span')
  detail.textContent = b.detail
  el.append(title, detail)
  if (b.dismissible) {
    const close = doc.createElement('button')
    close.type = 'button'
    close.className = 'small'
    close.textContent = '閉じる'
    close.addEventListener('click', onDismiss)
    el.append(close)
  }
  return el
}

/** 焦点のある押せる物を押す（Enter＝ボタン決定。入力層が Enter を preventDefault するので、ブラウザの既定の押下の代わり） */
function clickFocused(doc: Document): void {
  const a = doc.activeElement
  if (a instanceof HTMLButtonElement) {
    if (!a.disabled) a.click()
  } else if (
    a instanceof HTMLAnchorElement ||
    (a instanceof HTMLElement && a.tagName === 'SUMMARY')
  )
    a.click()
}

export function startShell(opts: ShellOptions): Shell {
  const { doc, host, booted } = opts
  let route = booted.route
  let bands: BandsState = initialBands()
  const settings = booted.settings
  let view: ScreenView | null = null

  const renderBands = (): void => {
    if (view === null) return
    const slot = view.bandSlot
    slot.replaceChildren(
      ...bandsOf(bands).map((b) =>
        bandElement(doc, b, () => band({ kind: 'dismiss', band: b.kind })),
      ),
    )
    if (import.meta.env.DEV) checkBands()
  }

  // dev ビルドの assert（kickoff 手順 2 の期待値、§7-12）: 帯の矩形がプレイヤー矩形と交差しない
  const checkBands = (): void => {
    const player = view?.player
    if (view === null || player === undefined) return
    const p = player.getBoundingClientRect()
    for (const el of view.bandSlot.querySelectorAll<HTMLElement>('.band'))
      if (!bandOutside(el.getBoundingClientRect(), p))
        console.error(`帯（${el.dataset['band'] ?? '?'}）がプレイヤー矩形に重なった`)
  }

  const band = (ev: BandEvent): void => {
    const next = bandStep(bands, ev)
    if (next === bands) return
    bands = next
    renderBands()
  }

  const ctx: ScreenContext = {
    doc,
    booted,
    settings: () => settings,
    go: (to) => go(to),
    band,
    devPages: opts.devPages ?? [],
  }

  const mount = (): void => {
    view?.unmount()
    view = opts.screens[route.screen](ctx)
    view.root.dataset['screen'] = route.screen
    host.replaceChildren(view.root)
    host.focus({ preventScroll: true })
    renderBands()
  }

  function go(to: ScreenId | 'back'): void {
    const next = navigate(route, to)
    if (next === route) {
      if (import.meta.env.DEV) console.warn(`画面 ${route.screen} から ${to} へは行けない`)
      return
    }
    route = next
    mount()
  }

  attachKeyboard(
    window,
    (events) => {
      for (const ev of events) {
        if (ev.kind === 'imeBand') band({ kind: 'ime', on: ev.on })
        else if (ev.kind === 'role' && ev.role === 'confirm') clickFocused(doc)
      }
      view?.onInput?.(events)
    },
    { focusTarget: host },
  )
  window.addEventListener('resize', () => {
    view?.onResize?.()
    if (import.meta.env.DEV) checkBands()
  })

  mount()
  return { band, route: () => route }
}
