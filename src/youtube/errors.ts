// onError のコードの組（M3 の手順 1、仮。m3-kickoff §7-26）。組ごとの文は手順 5（S7a）。
// 一覧（IFrame Player API の onError）: 2 ＝ 動画 ID の形が違う、5 ＝ HTML5 プレイヤーの問題、100 ＝ 見つからない・
// 非公開、101・150 ＝ 埋め込み不可、153 ＝ Referer が無い（API Client Identity。2025-07-09 の改訂で足された）。一覧に無い値と
// 数でない値は env。M3 の手順 10 で公式の一覧と照合した（2026-11-12。6 つとも一覧にある。docs/planning/m3-compliance.md）。
// 自作の code（読込の失敗 −1・応答なし −2）はここに渡さない（load.ts が別の事象にする）。DOM に触れない。

export type ErrorGroup = 'badId' | 'gone' | 'noEmbed' | 'env'

/** 組分けを公式の一覧と照合したか（M3 の手順 10 で照合した） */
export const ERROR_GROUPS_CHECKED = true

export function errorGroupOf(code: number): ErrorGroup {
  if (code === 2) return 'badId'
  if (code === 100) return 'gone'
  if (code === 101 || code === 150) return 'noEmbed'
  return 'env'
}
