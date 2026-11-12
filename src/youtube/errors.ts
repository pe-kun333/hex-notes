// onError のコードの組（M3 の手順 1、仮。m3-kickoff §7-26）。組ごとの文は手順 5（S7a）、公式の一覧との照合は手順 10。
// 一覧（IFrame Player API の onError）: 2 ＝ 動画 ID の形が違う、5 ＝ HTML5 プレイヤーの問題、100 ＝ 見つからない・
// 非公開、101・150 ＝ 埋め込み不可、153 ＝ Referer が無い（API Client Identity）。一覧に無い値と数でない値は env。
// 自作の code（読込の失敗 −1・応答なし −2）はここに渡さない（load.ts が別の事象にする）。DOM に触れない。

export type ErrorGroup = 'badId' | 'gone' | 'noEmbed' | 'env'

/** 組分けは公式の文書との照合の前（手順 10 で照合して true にする） */
export const ERROR_GROUPS_CHECKED = false

export function errorGroupOf(code: number): ErrorGroup {
  if (code === 2) return 'badId'
  if (code === 100) return 'gone'
  if (code === 101 || code === 150) return 'noEmbed'
  return 'env'
}
