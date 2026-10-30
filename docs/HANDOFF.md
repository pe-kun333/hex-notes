# 引き継ぎ（次のセッションが最初に読む）

2026-10-30、手順 6 の終わりに更新。読む順は docs/decisions.md → design.md → planning/m0-kickoff.md → tests-inventory.md → src/README.md → planning/consult/README.md。

- 済んだ手順: 1〜6（手順 6 ＝ M0-03b 描画層: src/render/canvas/{primitives,commands,flush,cells,hints,chords,feedback,budget,lowload}.ts、hex.ts に hexVertices・edgeToward、開発ページ src/app/dev/play.html（＋readability.ts）、スナップショット 12 本 tests/fixtures/render/frames/。試験 329 → 429 件。「疑う」の反論 19 件を直した。decisions #27〜#31（仮）、ADR 0006）。最初に手順 6 の PR が main に入ったかを確かめる。 相談（docs/planning/consult/）: A → #24、B → #27〜#31（手順 6 で裁定。代表値の面積 2037.08 は計算違いで 2036.89）、D は確定、E → #25。C は記録だけ。手順 7 の行は #32 以降。
- 「位置で読めるか」（ADR 0006、kickoff §7-25）: 2026-10-31 利用者の手弾きで「読めた」（主観。5 観点の数値の JSON は無い）→ 段別着地を既定のまま保つ（DEFAULT_LANDING ＝ cell）。段の取り違えが出たら U-05・M-5 で数えて見直す。
- 次の手順: 7（M0-05 時計層、kickoff 手順 7）。着手時に裁定する物: 相談 C の提案（tick の戻り値に pause 要求・結果は次の tick の state 標本、q̂ の格子率と β、傾き 0.99986452 の検算、§7-8・§7-18）、Pause 要求の冪等の扱い（再生中だけ一時停止へ、待機・同期中・一時停止中は無視。状態機械の試験 3 件、kickoff 手順 7 の申し送り）。play-dev の仮時計（performance.now − 開始）を時計層に差し替える。
- 未決: kickoff §7 の 8・18（相談 C、手順 7）、10・17（手順 10）、11（手順 8・13）、13（手順 9）、16（手順 8。MISS の確定の余裕 G、Pause を伴わない全離しのホールド）、19、21・22。23・25 は閉じた。「動画なし形態の左列の幅」は M1-03。
- 手元作業: U-01 段ずれ計測（数字–Q／Q–A／A–Z、ADR 0001）は手順 9 まで、U-03 同梱曲 10 曲と権利表は M0 末まで、U-05（125% 端末の R 27・v 0.2043 と ♯ の可読性、Firefox 既定・Windows 11 の keydown の刻みと入力遅延、macOS の Meta 中の keyup、実キーの IME 帯）。進み具合は利用者に確かめ、遅れたら kickoff §5 の代替で進める。
- 検査: `npm ci` → `npm run check` → `npm run build && npm run size`。描画を変えたらスナップショットを `npx vitest run -u` で作り直し差分を見る。Windows の Python で文書を書き換えると CRLF になるので `newline=''` で書く。gh が無い作業環境では PR を GitHub の連携ツールで作る。
