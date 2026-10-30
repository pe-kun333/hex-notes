# 引き継ぎ（次のセッションが最初に読む）

2026-10-31、手順 8 の終わりに更新。読む順は docs/decisions.md → design.md → planning/m0-kickoff.md → tests-inventory.md → src/README.md → planning/consult/README.md。

- 済んだ手順: 1〜8（手順 8 ＝ M0-06 判定・採点層: src/judge/{windows,hold,score,self-rate,calibration-offset,judge}.ts、play-dev の仮の判定を差し替え。試験 534 → 601 件。decisions #38〜#41（仮））。最初に手順 8 の PR（ブランチ m0-08-judge）が main に入ったかを確かめる。
- 相談（docs/planning/consult/）: A → #24、B → #27〜#31、C → #32〜#37、D は確定、E → #25。手順 8 は相談なしで主担当が裁定した。手順 9 の行は #42 以降。
- 次の手順: 9（M0-07 配列プリセット層の残り、kickoff 手順 9。U-01 の後）。着手時に U-01（段ずれの実測、順は 数字–Q／Q–A／A–Z）の進み具合を利用者に聞き、無ければ kickoff §5 の代替（ANSI 1/2・1/4・1/2 で作り、値は後からフィクスチャで読む）で進める。裁定する物: §7-13（黒鍵位相の閾 0.125／0.375）、getLayoutMap が無いときの JIS／US の選択、退避（fallback）の設定の形。
- 手順 8 で手確認していない物: play-dev の曲の終わりの行・ホールドの早離し・音ゲー向けのゲージ 0 の途中終了（browser pane が隠れて rAF が止まった。先頭 12 音の判定と判定文字・精度の表示、blur で一時停止に入るのは見た）。pane を表に出して手弾きで見る。
- 未決: kickoff §7 の 10・17（手順 10）、13（手順 9）、18（自作値の注記。手順 8 の分を足した）、19、21・22、26（skipped の回を成績の対象にするか。M1 の S3）。11・16 は閉じた。判定の仮: G 50（U-05・M-2 の入力遅延の実測で見直す）、押下の相手は「最も近い音」（M1 で見直す）、表示のオフセットを別に持つか（M-2）、足場外しの表示は練習層（M2）。時計の仮: β 0.5 と q̂ の門（M3-07）、onStateChange の時刻（M3-05）、seek の後の読み（M3-03）。
- 手元作業: U-01 は手順 9 で使う（今）、U-03 同梱曲 10 曲と権利表は M0 末まで、U-05（125% 端末の R 27・v 0.2043 と ♯ の可読性、Firefox 既定・Windows 11 の keydown の刻みと入力遅延、macOS の Meta 中の keyup、実キーの IME 帯）。U-02（限定公開動画）は M3-03 の前。
- 検査: `npm ci` → `npm run check` → `npm run build && npm run size`。描画を変えたらスナップショットを `npx vitest run -u` で作り直し差分を見る。Windows の Python で文書を書き換えると CRLF になるので `newline=''` で書く。時計・判定の手確認は browser pane を表に出して行う（隠れると rAF が止まり、blur で一時停止に入る）。gh が無い作業環境では PR を GitHub の連携ツールで作る。
