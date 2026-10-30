// DOM のキー入力を入力層（src/input/）へ渡す薄い部分（M0-04、手順 5）。手順 6 の play-dev も使う。
// KeyboardEvent → KeyEventRecord の写し、文字入力欄の素通し、select からの焦点の取り戻し、blur・visibilitychange・
// contextmenu の信号、iframe からの焦点の取り戻し。状態は attachKeyboard の閉包に持つ（グローバルに置かない）。
// performance.now の直呼びは src/app/ だけ（src/README.md）。ここは試験の外なので、開発ページ input.html で手で確かめる。

import type {
  InputEvent,
  InputState,
  KeyEventRecord,
  KeyboardOptions,
} from '../../input/keyboard.ts'
import { emptyInputState, handleFocus, handleKey, releaseAll } from '../../input/keyboard.ts'

export function toKeyRecord(e: KeyboardEvent): KeyEventRecord {
  return {
    type: e.type === 'keyup' ? 'keyup' : 'keydown',
    code: e.code,
    timeStamp: e.timeStamp,
    repeat: e.repeat,
    isComposing: e.isComposing,
    keyCode: e.keyCode,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  }
}

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'time',
])

/**
 * 文字を打つ欄か（S5 の曲名など。keydown を入力層に通さない。仮、decisions #26）。select は含めない
 * （モック m1'・m3・m4 は select に焦点があっても役割の鍵をゲームへ回す。select は呼ぶ側が焦点を外す）。
 */
export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  if (t instanceof HTMLTextAreaElement) return true
  return t instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(t.type)
}

export interface AttachOptions extends KeyboardOptions {
  /**
   * iframe・select から焦点を戻す先（tabindex 付きの要素。body は focus() を受けないことがあるので明示する）。
   * 戻してもスクロールしない（preventScroll）。
   */
  focusTarget: HTMLElement
}

export interface KeyboardHandle {
  state(): InputState
  /** 受け口を外す。押していた鍵の release（forced）を最後に onEvents へ渡し、遅らせた blur の処理も取り消す */
  detach(): void
}

/**
 * window にキー・blur・visibilitychange・contextmenu の受け口を付ける。入力イベントは onEvents へ渡す
 * （イベントが無く状態も変わらない回は呼ばない）。
 */
export function attachKeyboard(
  win: Window,
  onEvents: (events: InputEvent[], state: InputState) => void,
  opts: AttachOptions,
): KeyboardHandle {
  const doc = win.document
  let state = emptyInputState()
  // win.setTimeout は DOM の型で number を返す（グローバルの setTimeout は Node の型も見るので ReturnType で受ける）
  let blurTimer: number | null = null

  const reclaim = (): void => opts.focusTarget.focus({ preventScroll: true })

  const onKey = (e: KeyboardEvent): void => {
    // 文字の欄では keydown だけ素通し。keyup は押下集合にある code を外すだけなので欄の中でも通す（押しっぱなしを防ぐ）
    if (e.type === 'keydown' && isEditableTarget(e.target)) return
    const now = performance.now()
    const r = handleKey(state, toKeyRecord(e), now, opts)
    const changed = r.state !== state
    state = r.state
    if (r.preventDefault) {
      e.preventDefault()
      // select に焦点があるまま演奏・役割の鍵を押したら焦点を外す（先頭文字の検索・一覧が開くのを止める。m3 L649）
      if (e.type === 'keydown' && e.target instanceof HTMLSelectElement) reclaim()
    }
    // 役割の鍵の keyup はイベントを出さないが押下集合は変わるので、状態が変わった回も呼ぶ
    if (r.events.length > 0 || changed) onEvents(r.events, state)
  }

  const onBlur = (): void => {
    // iframe へ移ったかは blur の後に activeElement で分かる（同じタスクの中では古いことがある）
    blurTimer = win.setTimeout(() => {
      blurTimer = null
      const toIframe = doc.activeElement instanceof HTMLIFrameElement
      // 遅らせている間に焦点がページへ戻っていたら何もしない（iframe に移ったときも hasFocus は true なので先に見る）
      if (!toIframe && doc.hasFocus()) return
      const r = handleFocus(state, { type: 'blur', toIframe }, performance.now())
      state = r.state
      onEvents(r.events, state)
      if (r.reclaim) reclaim()
    }, 0)
  }

  const onSignal = (
    sig: { type: 'visibility'; hidden: boolean } | { type: 'contextmenu' },
  ): void => {
    const r = handleFocus(state, sig, performance.now())
    state = r.state
    if (r.events.length > 0) onEvents(r.events, state)
  }
  const onVisibility = (): void => onSignal({ type: 'visibility', hidden: doc.hidden })
  const onContextMenu = (): void => onSignal({ type: 'contextmenu' })

  win.addEventListener('keydown', onKey)
  win.addEventListener('keyup', onKey)
  win.addEventListener('blur', onBlur)
  win.addEventListener('contextmenu', onContextMenu)
  doc.addEventListener('visibilitychange', onVisibility)

  return {
    state: () => state,
    detach: () => {
      win.removeEventListener('keydown', onKey)
      win.removeEventListener('keyup', onKey)
      win.removeEventListener('blur', onBlur)
      win.removeEventListener('contextmenu', onContextMenu)
      doc.removeEventListener('visibilitychange', onVisibility)
      if (blurTimer !== null) win.clearTimeout(blurTimer)
      blurTimer = null
      const r = releaseAll(state, performance.now())
      state = r.state
      if (r.events.length > 0) onEvents(r.events, state)
    },
  }
}
