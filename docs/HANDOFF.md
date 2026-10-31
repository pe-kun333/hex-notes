# 引き継ぎ（次のセッションが最初に読む）

2026-10-31、手順 14（M0 の最後）の終わりに更新。読む順は docs/decisions.md → design.md → planning/m0-kickoff.md → tests-inventory.md → src/README.md → planning/consult/README.md。

- 済んだ手順: M0 の 1〜14 全て（手順 13 ＝ M0-10 回帰ハーネス、PR #20 で main に入った。手順 14 ＝ M0-11 COEP×YouTube: spikes/coep-youtube/{serve.ts,index.html,headers.md,RESULT.md}、Chromium の 6 組の可否表、tech-08 を見送りに確定、製品は COEP を足さない。試験 820 → 823 件。decisions #57（仮））。最初に手順 14 の PR（ブランチ m0-14-coep）が main に入ったかを確かめる。
- 次: M1 の着手手順書を作る（docs/planning/m0-kickoff.md と同じ形で、design.md §5 の M1-01〜M1-14 から。順序・前提・元のモック・期待値・未決を書き、利用者に見せてから手順 1 に入る）。M1 で最初に要る手元作業は U-03（同梱曲 10 曲と権利表。M1-01 の前提）。M1 の画面は m6-flow.html を読む（M0 では読まなかった）。
- 相談（docs/planning/consult/）: A → #24、B → #27〜#31、C → #32〜#37、D は確定、E → #25。手順 8〜14 は相談なしで主担当が裁定した。次の行は #58 以降。
- 回帰ハーネス: 判定・時計・譜面・配列・play/session を変えて `npm run harness:check` が落ちたら、tests/harness/out/diff.md で差分を見る。意図した変化なら `npm run harness` で期待の表を作り直し、PR の差分で見せる（decisions #56）。
- Salamander の実物はまだ置いていない（content/samples/salamander/ の manifest の files は空、合成音だけで鳴る）。利用者の許しを得てから、archive.org の SalamanderGrandPianoV3_44.1khz16bit.tar.bz2（466.1 MB）を作業用の一時ディレクトリに落として展開し、`node tools/salamander/thin-salamander.ts --src <展開先>` で 30 音の Opus・manifest・ATTRIBUTION を書き、聞いて速度層・長さ・ビットレートを見直し、初回読込と合わせて記録する（元の FLAC はリポジトリに入れない）。
- 手で確かめていない物: 手順 8 の play-dev の曲の終わりの行・ホールドの早離し・ゲージ 0。手順 10 の音を耳で聞くこと、主スレッドの 75 ms 停止での予約の遅れ。U-01 の位相の合否（手順 9）。手順 11 の本物の容量超過と実際のプライベートウィンドウ（U-05）。手順 12 の書き出しボタンの実際のダウンロードと動画ありの回の play 行。手順 14 の Firefox 列（U-05、M1-14。`node spikes/coep-youtube/serve.ts` で 6 組を通す）。
- browser pane の注意: Claude アプリの窓が隠れているとページは hidden になり、rAF とタイマーが止まる・間引かれる、クリックが届かない、YouTube が自分で止まる。音・時計・判定・フレーム・動画の手確認は、`document.visibilityState` が visible なのを確かめてから行う。
- 未決: kickoff §7 の 18（自作値の注記）、19、21・22、26（skipped の回を成績の対象にするか、M1）。仮のまま: 判定の G 50・押下の相手・表示のオフセット（M1・M-2）、刻印の AZERTY の数字段（M1）、Safari の Ogg Opus の復号（U-05）、時計の β と q̂ の門（M3-07）、取り込みの上限 10 MiB と控えの設定で上書きするか（M1-07）、normalizeChart が variants の keys を並べ替えない（M2-01）、tsPerf の reason の内訳（M-2）、device 行を書く時機（M1 の端末の診断）、回帰ハーネスの SD 6 段と足した列（#56）、鍵違いの自動プレイ（M2）。
- 手元作業: U-01（段ずれの実測、layout.html の JSON）、U-03 同梱曲 10 曲と権利表（初回読込の測り直しと、回帰ハーネスに曲を足すかにも効く）、U-05（125% 端末・Firefox・macOS・実キーの IME 帯、Safari の Opus、保存の容量超過、COEP の Firefox 列）。U-02（限定公開動画）は M3-03 の前。
- 検査: `npm ci` → `npm run check`（回帰ハーネスの照合を含む）→ `npm run build && npm run size`。描画を変えたらスナップショットを `npx vitest run -u` で作り直し差分を見る。Windows の Python で文書を書き換えると CRLF になるので `newline=''` で書く（bash の heredoc は `\\` を `\` にするので、逆斜線を含むスクリプトはファイルの道具で書く）。gh が無い作業環境では PR を GitHub の連携ツールで作る。変異試験で未追跡のファイルを書き換えるときは先に控えを取る（git checkout では戻らない）。docs/ の Markdown は prettier に掛けない（main の時点で表が整形されていない）。spikes/ の Markdown は prettier に掛ける（main で整形済み）。
