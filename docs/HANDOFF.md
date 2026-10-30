# 引き継ぎ（次のセッションが最初に読む）

2026-10-31、手順 10 の終わりに更新。読む順は docs/decisions.md → design.md → planning/m0-kickoff.md → tests-inventory.md → src/README.md → planning/consult/README.md。

- 済んだ手順: 1〜10（手順 9 ＝ M0-07 配列層の残り、PR #16 で main に入った。手順 10 ＝ M0-08 音源層: src/audio/{synth,metronome,keyclick,scheduler,sampler,context}.ts、tools/salamander/、開発ページ audio.html。試験 625 → 650 件。decisions #46〜#49（仮））。最初に手順 10 の PR（ブランチ m0-10-audio）が main に入ったかを確かめる。
- 相談（docs/planning/consult/）: A → #24、B → #27〜#31、C → #32〜#37、D は確定、E → #25。手順 8〜10 は相談なしで主担当が裁定した。手順 11 の行は #50 以降。
- Salamander の実物はまだ置いていない（content/samples/salamander/ の manifest の files は空、合成音だけで鳴る）。利用者の許しを得てから、archive.org の SalamanderGrandPianoV3_44.1khz16bit.tar.bz2（466.1 MB）を作業用の一時ディレクトリに落として展開し、`node tools/salamander/thin-salamander.ts --src <展開先>` で 30 音の Opus・manifest・ATTRIBUTION を書き、聞いて速度層・長さ・ビットレートを見直し、初回読込と合わせて記録する（元の FLAC はリポジトリに入れない）。
- 次の手順: 11（M0-09 保存層、kickoff 手順 11）。着手時に裁定する物: 鍵名の移行（モックの hexnote-m0 などから hexnote.settings v:1 ほか）、IndexedDB の版と index、失敗時のメモリ内続行と storageFail の出し方、*.hexnote.json の往復。保存する物の形は decisions #25（tsResolution）・#40（校正は音源種別ごと）・#41（hexnote.fade）・#42（段ずれ）・#45（geometry）にある。
- 手で確かめていない物: 手順 8 の play-dev の曲の終わりの行・ホールドの早離し・ゲージ 0。手順 10 の音を耳で聞くこと、主スレッドの 75 ms 停止での予約の遅れ（どちらも browser pane が隠れていた）。U-01 の位相の合否（手順 9）。
- 未決: kickoff §7 の 18（自作値の注記。手順 8〜10 の分を足した）、19、21・22、26（skipped の回を成績の対象にするか、M1）。10・11・13・16・17 は閉じた。仮のまま: 判定の G 50・押下の相手・表示のオフセット（M1・M-2）、刻印の AZERTY の数字段（M1）、Safari の Ogg Opus の復号（U-05・M0-11）、時計の β と q̂ の門（M3-07）。
- 手元作業: U-01（段ずれの実測、layout.html の JSON）、U-03 同梱曲 10 曲と権利表（初回読込の測り直しと手順 11 に効く）、U-05（125% 端末・Firefox・macOS・実キーの IME 帯、Safari の Opus）。U-02（限定公開動画）は M3-03 の前。
- 検査: `npm ci` → `npm run check` → `npm run build && npm run size`。描画を変えたらスナップショットを `npx vitest run -u` で作り直し差分を見る。Windows の Python で文書を書き換えると CRLF になるので `newline=''` で書く（bash の heredoc は `\\` を `\` にするので、逆斜線を含むスクリプトはファイルの道具で書く）。音・時計・判定の手確認は browser pane を表に出して行う。gh が無い作業環境では PR を GitHub の連携ツールで作る。
