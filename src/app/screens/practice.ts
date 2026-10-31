// S4 練習室（M2-03 後半、M2 の手順 6）。出どころ: design.md §1.3 S4（S2 の入門者形態＋パネル）、m6 S4 L395–452、
// m2-kickoff 手順 6・§7-9（パネルは左列のプレイヤー矩形の場所）・§7-26（歯車は出さない）。S2 の画面（screens/play.ts）を
// room 真で使う: 回は殻の練習の設定（practice()）で走り、パネルで待ち方・テンポ段・ループを替え、回の終わりは S3（練習の
// 結果。「もう一度」は S4）、「通しで弾く」は S2 の通常プレイ。

import type { ScreenContext, ScreenView } from '../shell.ts'
import { playScreen } from './play.ts'

export function practiceScreen(ctx: ScreenContext): ScreenView {
  return playScreen(ctx, true)
}
