// フォーカスと可視性（M0-04、手順 5）。出どころ: design.md §2.8「iframe に焦点が移ったら戻す。blur／visibilitychange
// で Pause」、§1.3 S2「Pause（Esc・blur・visibilitychange）は再開／最初から／やめる。再開は S7b を通る」、§2.6
// 「visibilitychange で Pause」、kickoff 手順 5 の手直し（blur 全離しだけ → ＋Pause 要求）。m1' L533・m4 L674。
// ここは信号 → 行いの対応だけ。全離しは keyboard.ts の releaseAll、DOM の読み書きは src/app/。

/** 一時停止の理由。iframe ＝ 埋め込み（YouTube）に焦点が移った blur */
export type PauseReason = 'blur' | 'iframe' | 'hidden'

/**
 * 呼ぶ側（src/app/）が DOM から作る信号。blur は window の blur で、toIframe は blur の直後に
 * document.activeElement が iframe か。visibility は visibilitychange の document.hidden。
 * contextmenu はコンテキストメニューが開くとき（開いている間の keyup はページに届かないことがある）。
 */
export type FocusSignal =
  | { type: 'blur'; toIframe: boolean }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'contextmenu' }

/** 行い。releaseAll ＝ 押下集合を空にする、pause ＝ 一時停止の要求、reclaim ＝ 焦点をページへ戻す */
export interface FocusAction {
  releaseAll: boolean
  pause: PauseReason | null
  reclaim: boolean
}

/**
 * 信号 → 行い。blur・非表示は全離し＋Pause 要求。iframe へ移った blur は焦点も戻す。
 * コンテキストメニューは全離しだけ（keyup の取りこぼしへの備え。仮、decisions #26）。
 * 表示に戻ったときは何もしない（再開は利用者の Space で、S7b を通る）。
 */
export function focusAction(sig: FocusSignal): FocusAction {
  if (sig.type === 'contextmenu') return { releaseAll: true, pause: null, reclaim: false }
  if (sig.type === 'blur')
    return { releaseAll: true, pause: sig.toIframe ? 'iframe' : 'blur', reclaim: sig.toIframe }
  if (sig.hidden) return { releaseAll: true, pause: 'hidden', reclaim: false }
  return { releaseAll: false, pause: null, reclaim: false }
}
