# 引き継ぎ（次のセッションが最初に読む）

2026-10-31、手順 7 の終わりに更新。読む順は docs/decisions.md → design.md → planning/m0-kickoff.md → tests-inventory.md → src/README.md → planning/consult/README.md。

- 済んだ手順: 1〜7（手順 7 ＝ M0-05 時計層: src/clock/{types,map,fit,jump,grace,stall,clock-source,audio-bridge,dummy-video}.ts、プレイの状態機械 src/play/{state,session}.ts、src/shared/random.ts、開発ページ clock.html、play-dev の仮時計を時計層に差し替え。試験 429 → 534 件。「疑う」の反論 23 件を直した。decisions #32〜#37（仮））。最初に手順 7 の PR が main に入ったかを確かめる。
- 相談（docs/planning/consult/）: A → #24、B → #27〜#31、C → #32〜#37（手順 7 で裁定、新たな相談なし）、D は確定、E → #25。手順 8 の行は #38 以降。
- 次の手順: 8（M0-06 判定・採点層、kickoff 手順 8）。着手時に裁定する物: §7-16（MISS の確定の余裕 G、Pause を伴わない全離しのホールド、ホールド離し窓の終端・skipped の分母、手順 7 からの (a) 猶予中の押下を捨てるか保留するか (b) skipped の分母 (c) 広告明けで t が約 2.5 s 戻るときの判定済みの音）、§7-11（2 プロファイルの既定値）、校正のオフセット（calibration-offset.ts）を描画にも効かせるか（#32 (e) で時計層に入れないとした）。判定は時計の写像（src/clock/map.ts の songAt・perfAt）で実時間の窓を比べ、skipped は resync の事象の nominal と graceUntil で（grace.ts の skippedAt）。play-dev の仮の判定を判定層に差し替える。
- 未決: kickoff §7 の 10・17（手順 10）、11（手順 8・13）、13（手順 9）、16（手順 8）、18（自作値の注記。手順 7 の分を足した）、19、21・22。8・20・23・25 は閉じた。「動画なし形態の左列の幅」は M1-03。時計の仮: β 0.5 と q̂ の門（M3-07）、onStateChange の時刻を標本に足すか（M3-05。今は PAUSED を観た tick の now で 500 ms を比べる）、seek の後のプレイヤーの読み（M3-03）。
- 手元作業: U-01 段ずれ計測（数字–Q／Q–A／A–Z、ADR 0001）は手順 9 まで、U-03 同梱曲 10 曲と権利表は M0 末まで、U-05（125% 端末の R 27・v 0.2043 と ♯ の可読性、Firefox 既定・Windows 11 の keydown の刻みと入力遅延、macOS の Meta 中の keyup、実キーの IME 帯）。U-02（限定公開動画）は M3-03 の前。進み具合は利用者に確かめ、遅れたら kickoff §5 の代替で進める。
- 検査: `npm ci` → `npm run check` → `npm run build && npm run size`。描画を変えたらスナップショットを `npx vitest run -u` で作り直し差分を見る。Windows の Python で文書を書き換えると CRLF になるので `newline=''` で書く。時計・停止検知の手確認は browser pane を表に出して行う（隠れると rAF が止まるか 1 Hz に間引かれ、飛びや遅い PAUSED に見える）。gh が無い作業環境では PR を GitHub の連携ツールで作る。
