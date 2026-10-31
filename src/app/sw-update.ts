// アプリの更新とオフラインの状態（M1-09、M1 の手順 13）。出どころ: ADR 0004（generateSW・registerType prompt。更新は S6 か
// 結果画面で利用者が押したときだけ適用し、プレイ中に入れ替えない）・改訂（同梱曲は precache、decisions #64）、design.md
// §5.2 M1-09（完了条件「オフラインで 10 曲」）、m1-kickoff 手順 13（needRefresh を S6 と S3 の「更新」ボタンに）。
// SW の事象 → 状態 → 画面の文言の純関数（登録は sw-register.ts、DOM は screens/settings.ts・result.ts）。

export interface UpdateState {
  /** 新しい版の SW が待っている（「更新する」で入れ替えてページを読み直す） */
  readonly needRefresh: boolean
  /** 殻と同梱曲が端末に保存済み（今の SW が動いている） */
  readonly offlineReady: boolean
  /** SW を使わない（dev・SW の無いブラウザ・登録の失敗） */
  readonly off: 'dev' | 'unsupported' | 'error' | null
}

export const INITIAL_UPDATE: UpdateState = { needRefresh: false, offlineReady: false, off: null }

export type UpdateEvent =
  | { readonly kind: 'needRefresh' }
  | { readonly kind: 'offlineReady' }
  | { readonly kind: 'off'; readonly why: 'dev' | 'unsupported' | 'error' }

export function updateStep(s: UpdateState, ev: UpdateEvent): UpdateState {
  switch (ev.kind) {
    // 待っている版があるのは、今の版が動いて保存も済んでいるとき
    case 'needRefresh':
      return s.needRefresh ? s : { ...s, needRefresh: true, offlineReady: true, off: null }
    case 'offlineReady':
      return s.offlineReady ? s : { ...s, offlineReady: true, off: null }
    case 'off':
      return s.needRefresh || s.offlineReady || s.off === ev.why ? s : { ...s, off: ev.why }
  }
}

export interface UpdateView {
  readonly text: string
  /** 押せる釦の文言（無ければ出さない） */
  readonly action: string | null
}

const OFF_TEXT: Readonly<Record<NonNullable<UpdateState['off']>, string>> = {
  dev: '開発サーバーでは Service Worker を使いません（オフラインと更新は build で確かめます）。',
  unsupported: 'このブラウザは Service Worker を使えないので、オフラインでは遊べません。',
  error: 'オフライン用の保存を始められませんでした（ブラウザの設定か、プライベートウィンドウ）。',
}

/**
 * 画面の行。S6 は常に今の状態を出し、S3 は新しい版が待っているときだけ出す（プレイの合間。S2 には出さない、ADR 0004）
 */
export function updateView(s: UpdateState, where: 'S6' | 'S3'): UpdateView | null {
  if (s.needRefresh)
    return {
      text: '新しい版があります。更新するとページを読み直します（記録と設定はそのまま）。',
      action: '更新する',
    }
  if (where === 'S3') return null
  if (s.offlineReady)
    return { text: 'オフラインで遊べます（同梱曲は端末に保存済み）。', action: null }
  if (s.off !== null) return { text: OFF_TEXT[s.off], action: null }
  return { text: 'オフライン用に保存しています…', action: null }
}
