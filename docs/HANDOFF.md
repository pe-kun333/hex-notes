# 引き継ぎ（次のセッションが最初に読む）

2026-10-31、手順 9 の終わりに更新。読む順は docs/decisions.md → design.md → planning/m0-kickoff.md → tests-inventory.md → src/README.md → planning/consult/README.md。

- 済んだ手順: 1〜9（手順 8 ＝ M0-06 判定・採点層、PR #15 で main に入った。手順 9 ＝ M0-07 配列プリセット層の残り: src/layout/{stagger,phase,legend,same-pitch,fallback}.ts、鍵盤図のセルの刻印 label、開発ページ layout.html。試験 601 → 625 件。decisions #42〜#45（仮））。最初に手順 9 の PR（ブランチ m0-09-layout）が main に入ったかを確かめる。
- 相談（docs/planning/consult/）: A → #24、B → #27〜#31、C → #32〜#37、D は確定、E → #25。手順 8・9 は相談なしで主担当が裁定した。手順 10 の行は #46 以降。
- 次の手順: 10（M0-08 音源層、kickoff 手順 10）。着手時に裁定する物: §7-10（10 MB は生か gzip か、同梱曲は 1 曲か 10 曲か）、§7-17（Salamander は V3 の自前間引きか Tone.js の V2 30 音か、Opus か MP3 か）、予約の基準時刻（時計の写像 perfAt → audio-bridge の contextOfPerf、decisions #32・#37）、合成音の係数（自作値の注記）。ATTRIBUTION.md の必須項目は check-license-files が見る。
- U-01 はまだ無いので、手順 9 は kickoff §5 の代替（ANSI 1/2・1/4・1/2）で作った。利用者が実機 2 台で 数字–Q／Q–A／A–Z を測り、開発ページ layout.html の JSON を残したら、配列ごとの位相と勧める幾何を台帳の「U-01 の合否」の行に書く（閾 0.125／0.375 はその値で見直す）。
- 手で確かめていない物: 手順 8 の play-dev の曲の終わりの行・ホールドの早離し・音ゲー向けのゲージ 0（browser pane が隠れて rAF が止まった）。手順 9 の layout.html は画素を読んで確かめた。物理せん断の描画は M1-07。
- 未決: kickoff §7 の 10・17（手順 10）、18（自作値の注記。手順 8・9 の分を足した）、19、21・22、26（skipped の回を成績の対象にするか、M1）。11・13・16 は閉じた。判定の仮: G 50（U-05・M-2 で見直す）、押下の相手は「最も近い音」（M1）、表示のオフセット（M-2）。刻印の仮: AZERTY の数字段に数字を出すか（M1 の S0a）。時計の仮: β 0.5 と q̂ の門（M3-07）、onStateChange の時刻（M3-05）、seek の後の読み（M3-03）。
- 手元作業: U-01 は今（手順 9 の合否と §7-13 の見直しに使う）、U-03 同梱曲 10 曲と権利表は M0 末まで（手順 10 の初回読込の中身と 11 に効く）、U-05（125% 端末の R 27・v 0.2043 と ♯、Firefox 既定・Windows 11 の keydown の刻みと入力遅延、macOS の Meta 中の keyup、実キーの IME 帯）。U-02（限定公開動画）は M3-03 の前。
- 検査: `npm ci` → `npm run check` → `npm run build && npm run size`。描画を変えたらスナップショットを `npx vitest run -u` で作り直し差分を見る。Windows の Python で文書を書き換えると CRLF になるので `newline=''` で書く。時計・判定の手確認は browser pane を表に出して行う（隠れると rAF が止まり、blur で一時停止に入る）。gh が無い作業環境では PR を GitHub の連携ツールで作る。
