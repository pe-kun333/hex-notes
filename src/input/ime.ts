// IME の判定と帯（M0-04、手順 5）。出どころ: design.md §2.8「IME（keyCode 229／isComposing）の打鍵は無視して帯、
// 曲は止めない（S0 を含む全画面）」、§1.3 S2 の帯の文言、S0b「最初の keydown が 229 なら帯を出し組をやり直す」、
// kickoff 手順 5 の手直し（IME 無視のみ → 無視＋帯イベント）。曲を止めるかは S6 の設定（既定 OFF）で、
// 呼ぶ側が帯のイベントを見て決める。DOM に触れない。

/** IME 変換中の keydown の keyCode（Chromium・Firefox・Safari 共通） */
export const IME_KEYCODE = 229

/** 帯の文言（§1.3 S2） */
export const IME_BAND_TEXT = '半角/全角キーで英数に戻してください'

/** IME の keydown か。isComposing か keyCode 229 */
export function isImeKeydown(e: { isComposing: boolean; keyCode: number }): boolean {
  return e.isComposing || e.keyCode === IME_KEYCODE
}

/**
 * 帯の点け消し（仮、decisions #26）。IME の keydown（禁止・修飾の code を除く）で点け、点いている間の IME の
 * keydown では帯のイベントを出さない（連打しても帯は 1 件。検知のイベント ime は keyboard.ts が毎回出す）。
 * IME でない演奏・役割の keydown が来たら消す。その他の鍵（Tab など）では消さない（IME が ON のままでも
 * 229 にならない鍵があるため）。changed が true のときだけ帯のイベントを出す。
 */
export function nextImeBand(
  bandOn: boolean,
  keydown: 'ime' | 'playOrRole' | 'other',
): { bandOn: boolean; changed: boolean } {
  if (keydown === 'ime') return { bandOn: true, changed: !bandOn }
  if (keydown === 'playOrRole' && bandOn) return { bandOn: false, changed: true }
  return { bandOn, changed: false }
}
