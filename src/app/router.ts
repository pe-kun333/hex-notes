// 画面の切替（M1-13、M1 の手順 2）。出どころ: design.md §1.1（画面一覧）・§1.2（遷移図。S3・S4・S5・S6 から S1 へ戻れる）、
// §1.3 S6（全画面の歯車）、m6 `go` L627–642（Boot は初回なら S0、でなければ S1。S6 は来た画面へ戻る〔state.prev〕）、
// decisions #65（M1 の画面と歯車の置き場、仮）。
// 画面の状態 → 次の画面の純関数（DOM は shell.ts）。M1 の画面は S0・S1・S2・S3・S6、M2 の手順 2 で S5（曲の持ち込み）を
// 足した（S4 は M2-03、S7a〜S7c は M3 の帯と画面。S7d と Pause は帯と S2 の覆いで、画面の切替を伴わない）。

/** 画面（S0 は S0a〜S0d を中に持つ。S5 は M2-01） */
export type ScreenId = 'S0' | 'S1' | 'S2' | 'S3' | 'S5' | 'S6'
export const SCREEN_IDS: readonly ScreenId[] = ['S0', 'S1', 'S2', 'S3', 'S5', 'S6']

/**
 * 行ける先（§1.2 の M1 の部分）。S0 → S2（S0d のチュートリアル曲）・S3（S0d の後）・S1（「あとで」）。S2 → S3（終了）・
 * S1（Pause の「やめる」）。S3 → S2（もう一度）・S1。S6 は S2 以外の歯車から入り、来た画面へ戻る（S2 は歯車を出さない。
 * プレイ中に設定へ行くと曲が宙に浮くため、仮 #65）。S6 → S0 は端末プロファイルの初期化（M1-07）。S1 → S5（曲を持ち込む）、
 * S5 → S1（保存・やめる）。S5 も歯車を出さない（段の途中の状態を殻が持たないため、m2-kickoff §7-26、仮）
 */
const NEXT: Readonly<Record<ScreenId, readonly ScreenId[]>> = {
  S0: ['S1', 'S2', 'S3', 'S6'],
  S1: ['S2', 'S5', 'S6'],
  S2: ['S1', 'S3'],
  S3: ['S1', 'S2', 'S6'],
  S5: ['S1'],
  S6: ['S0'],
}

export interface Route {
  readonly screen: ScreenId
  /** S6 から戻る先（S6 の間だけ意味がある） */
  readonly back: ScreenId | null
}

/** 起動の行き先（§1.2「初回?」。初回の判定は src/storage/session.ts の isFirstRun） */
export function initialRoute(first: boolean): Route {
  return { screen: first ? 'S0' : 'S1', back: null }
}

export function canGo(from: ScreenId, to: ScreenId): boolean {
  return NEXT[from].includes(to)
}

/**
 * 画面を移る。back は S6 の「戻る」（来た画面へ、無ければ S1）。行けない先は渡した route をそのまま返す
 * （呼ぶ側は === で見て dev で知らせる）
 */
export function navigate(r: Route, to: ScreenId | 'back'): Route {
  if (to === 'back') return r.screen === 'S6' ? { screen: r.back ?? 'S1', back: null } : r
  if (!canGo(r.screen, to)) return r
  return { screen: to, back: to === 'S6' ? r.screen : null }
}
