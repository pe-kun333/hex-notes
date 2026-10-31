# 引き継ぎ（次のセッションが最初に読む）

2026-10-31、M1 の着手手順書を起草した時点で更新。読む順は docs/decisions.md → design.md → planning/m1-kickoff.md（M1 の手順書。M0 の記録は planning/m0-kickoff.md）→ tests-inventory.md → src/README.md → planning/consult/README.md。

- 済んだ手順: M0 の 1〜14 全て（main の先頭は PR #21）。M1 の着手手順書 docs/planning/m1-kickoff.md を起草した（14 手順・累積 24 日、§2 の順序、各手順の元・作る・手直し・期待値・完了条件、§7 の提案と未決 22 件）。試験 823 件、初回読込 11,652 バイト。
- 次: 利用者に m1-kickoff.md を見せ、§7 の提案（1 順序、2 SMF の道具の前倒し、3 動画なし形態の左列、4 入門者のラベル、5 S0d の音待ち、6 提案の符号、7 skipped と ResultRecord、8 同梱曲の precache、9 難度 4 軸、10 版の自動選択 …）の採否を聞く。採った物を decisions #58 以降と design.md §5.2 の注記に書き、tests-inventory に「M1 手順 n」の行を写してから手順 1（M1-02 入門者プロファイル）に入る。ブランチは m1-01-profile のように手順ごと（クラウドの作業環境で指定ブランチがあればそれ）。
- 相談（docs/planning/consult/）: A → #24、B → #27〜#31、C → #32〜#37、D は確定、E → #25。M0 の手順 8〜14 は相談なしで主担当が裁定した。M1 で相談に値する論点は今のところ無い（§7 は主担当の裁定で足りる見込み）。次の決定の行は #58 以降。
- 回帰ハーネス: 判定・時計・譜面・配列・play/session を変えて `npm run harness:check` が落ちたら、tests/harness/out/diff.md で差分を見る。意図した変化なら `npm run harness` で期待の表を作り直し、PR の差分で見せる（decisions #56）。M1 の手順 7（鍵数制限）・11（skipped の欄）はここに効きうる。
- Salamander の実物はまだ置いていない（manifest の files は空、合成音だけで鳴る）。利用者の許しを得てから、archive.org の SalamanderGrandPianoV3_44.1khz16bit.tar.bz2（466.1 MB）を一時ディレクトリに落として展開し、`node tools/salamander/thin-salamander.ts --src <展開先>` で 30 音の Opus・manifest・ATTRIBUTION を書き、聞いて速度層・長さ・ビットレートを見直し、初回読込と合わせて記録する（元の FLAC はリポジトリに入れない）。
- 手で確かめていない物（M1 の手順 14 で拾う）: 手順 8 の曲の終わりの行・ホールドの早離し・ゲージ 0、手順 10 の音を耳で聞くこと・主スレッドの 75 ms 停止、U-01 の位相の合否、手順 11 の本物の容量超過とプライベートウィンドウ、手順 12 の書き出しの実際のダウンロード、手順 14 の Firefox 列（`node spikes/coep-youtube/serve.ts`）。
- browser pane の注意: Claude アプリの窓が隠れているとページは hidden になり、rAF とタイマーが止まる・間引かれる、クリックが届かない、YouTube が自分で止まる。音・時計・判定・フレーム・動画の手確認は `document.visibilityState` が visible なのを確かめてから行う。
- 未決: m0-kickoff.md §7 の 18（自作値の注記）、19、21・22、26（skipped の回 → m1-kickoff §7-7 に案）。仮のまま: 判定の G 50・押下の相手・表示のオフセット（M1・M-2）、刻印の AZERTY の数字段（M1 の S0a）、Safari の Ogg Opus（U-05）、時計の β と q̂ の門（M3-07）、取り込みの上限 10 MiB と控えの設定の上書き（M1-07、m1-kickoff §7-11）、normalizeChart が keys を並べ替えない（M2-01）、device 行を書く時機（M1-04 で診断の保存時）、回帰ハーネスの SD 6 段（#56）、鍵違いの自動プレイ（M2）。
- 手元作業: U-03 同梱曲 10 曲と権利表（M1 の手順 6 の前提。遅れたら m1-kickoff §5 の代替）、U-04 同時押しテストの実機（手順 9・14）、U-05（125% 端末・Firefox・実キーの IME 帯、Safari の Opus、容量超過、COEP の Firefox 列。手順 14）、U-01（段ずれの実測、layout.html の JSON。手順 10 の S6 で受ける）。U-02（限定公開動画）は M3-03 の前。
- 検査: `npm ci` → `npm run check`（回帰ハーネスの照合を含む）→ `npm run build && npm run size`。描画を変えたらスナップショットを `npx vitest run -u` で作り直し差分を見る。Windows の Python で文書を書き換えると CRLF になるので `newline=''` で書く（bash の heredoc は `\\` を `\` にするので、逆斜線を含むスクリプトはファイルの道具で書く）。gh が無い作業環境では PR を GitHub の連携ツールで作る。変異試験で未追跡のファイルを書き換えるときは先に控えを取る。docs/ の Markdown は prettier に掛けない（.prettierignore の docs/planning/ と main の時点の表）。spikes/ の Markdown は prettier に掛ける。
