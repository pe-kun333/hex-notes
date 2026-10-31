/// <reference types="vite-plugin-pwa/vanillajs" />
// Service Worker の登録と更新（M1-09、M1 の手順 13）。出どころ: ADR 0004（generateSW・prompt。プレイ中は適用しない）、
// m1-kickoff 手順 13（virtual:pwa-register の registerSW、needRefresh を S6 と S3 の「更新」ボタンに）。vite.config.ts は
// injectRegister を切ってあり、登録はここだけ。dev では SW を使わない（devOptions.enabled false。virtual の registerSW は
// 何もしない）。状態の遷移は sw-update.ts（純関数）。DOM・navigator に触れる薄い部分。

import { registerSW } from 'virtual:pwa-register'
import { INITIAL_UPDATE, updateStep, type UpdateEvent, type UpdateState } from './sw-update.ts'

export interface Updates {
  state(): UpdateState
  /** 待っている版に入れ替えてページを読み直す（S6・S3 の「更新する」だけが呼ぶ） */
  apply(): void
}

/** SW を登録し、状態が変わるたびに onChange を呼ぶ */
export function registerUpdates(onChange: (s: UpdateState) => void): Updates {
  let state = INITIAL_UPDATE
  const step = (ev: UpdateEvent): void => {
    const next = updateStep(state, ev)
    if (next === state) return
    state = next
    onChange(state)
  }
  let update: (reload?: boolean) => Promise<void> = async () => {}
  if (import.meta.env.DEV) step({ kind: 'off', why: 'dev' })
  else if (!('serviceWorker' in navigator)) step({ kind: 'off', why: 'unsupported' })
  else
    update = registerSW({
      immediate: true,
      onNeedRefresh: () => step({ kind: 'needRefresh' }),
      onOfflineReady: () => step({ kind: 'offlineReady' }),
      // 2 回目からの読込では offlineReady が来ない（入れたのは前の回）。今の SW が動いていれば保存は済んでいる
      onRegisteredSW: (_url, r) => {
        if (r?.active) step({ kind: 'offlineReady' })
      },
      onRegisterError: () => step({ kind: 'off', why: 'error' }),
    })
  return {
    state: () => state,
    apply: () =>
      void (async () => {
        // 待っている SW があり、このページがその前の版の制御下にあるときだけ skipWaiting で入れ替える（controlling で
        // 読み直す）。初めて開いた回はページが制御下に無く、新しい版は待たずに有効になっているので、送る先が無く
        // 何も起きなかった（M1 の手順 14 で見つけた、decisions #77）。そのときは読み直すだけで新しい版になる
        const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined)
        if (reg?.waiting && navigator.serviceWorker.controller) await update(true)
        else location.reload()
      })(),
  }
}
