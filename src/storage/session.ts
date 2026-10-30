// sessionStorage と初回の判定（M0-09、手順 11）。出どころ: design.md §1.2「初回か否か（端末プロファイルの有無。
// sessionStorage でも抑止）」・§4.3 sessionStorage hexnote.booted（失敗時の導線ループ防止）・§6 T-9。
// 保存に失敗する端末では hexnote.device が残らず、読み直すたびに初回の導線（S0a〜S0d）へ戻ってしまう。同じタブの中では
// hexnote.booted でそれを止める。sessionStorage も使えなければ fallback.ts の KvStore がメモリで持つ（ページの間は効く）。

import type { KvStore } from './fallback.ts'
import { loadDevice } from './local.ts'

export const BOOTED_KEY = 'hexnote.booted'

export function isBooted(session: KvStore): boolean {
  return session.get(BOOTED_KEY) === '1'
}

/** 初回の導線を通した（か飛ばした）印。本物に書けたら true */
export function markBooted(session: KvStore): boolean {
  return session.set(BOOTED_KEY, '1')
}

/** 初回か: 端末プロファイルが無く、このタブでまだ導線を通していない */
export function isFirstRun(local: KvStore, session: KvStore): boolean {
  return loadDevice(local) === null && !isBooted(session)
}
