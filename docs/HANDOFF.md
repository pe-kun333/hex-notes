# 引き継ぎ（次のセッションが最初に読む）

2026-10-30、手順 5 の終わりに更新。読む順は docs/decisions.md → design.md → planning/m0-kickoff.md → tests-inventory.md → src/README.md → planning/consult/README.md。

- 済んだ手順: 1〜5（手順 5 ＝ M0-04 入力層: src/input/{keyboard,ime,focus,roles,timestamp,resolution}.ts、DOM の薄い部分 src/app/dev/dom-input.ts、開発ページ src/app/dev/input.html（vite dev のときだけ index から導線）。試験 247 → 329 件。decisions #25（tsPerf）・#26（入力層の細部）、どちらも仮）。最初に手順 5 の PR が main に入ったかを確かめる。開発ページは Claude の browser pane（Chromium）で手確認済み（select・iframe の焦点の戻り、IME の合成イベント、刻み 0.1 ms）。実キーの IME・Firefox・macOS の Meta は U-05。
- 相談（docs/planning/consult/）: A → #24、D は確定、E → #25（強いモデル fable が利用枠の不足で呼べず、このセッションのモデルで 3 役）。B・C は記録だけ。手順 7 の行は #27 以降。
- 次の手順: 6（M0-03b 描画層、kickoff 手順 6）。着手時に裁定する物: 相談 B の提案（コマンド型・描く順・スナップショットの形・予算・「位置で読めるか」の 5 観点）、hexVerts の置き場（hex.ts か canvas/）、「段の記号」「角の補助」の中身（decisions の既定値「段の記号・明度」、§2.5 L129「R<26 で角の補助を消す」）。play-dev の手弾きは dom-input.ts の attachKeyboard を繋ぐ。依頼文 planning/next-session.md は手順 5 のもので、手順 6 の依頼文はまだ無い。
- 未決: kickoff §7 の 8・18（相談 C、手順 7）、10・17（手順 10）、11（手順 8・13）、13（手順 9）、16（手順 8。相談 E の申し送り: MISS の確定の余裕 G、Pause を伴わない全離しでのホールド）、19、21〜23。9 は閉じた。手順 7 へ: Pause 要求は冪等で再生中だけ効く（kickoff 手順 7）。「動画なし形態の左列の幅」は M1-03。
- 手元作業: U-01 段ずれ計測（数字–Q／Q–A／A–Z、ADR 0001）は手順 9 まで、U-03 同梱曲 10 曲と権利表は M0 末まで。U-05（125% 端末）で R 27・v 0.2043 の可読性、Firefox 既定・Windows 11 の keydown の刻みと入力遅延、macOS の Meta 中の keyup、実キーの IME 帯を確かめる。進み具合は利用者に確かめ、遅れたら kickoff §5 の代替で進める。
- 検査: `npm ci` → `npm run check` → `npm run build && npm run size`。フィクスチャを変えたら `npm run charts:fixtures`。Windows の Python で文書を書き換えると CRLF になるので `newline=''` で書く。gh が無い作業環境では PR を GitHub の連携ツールで作る。
