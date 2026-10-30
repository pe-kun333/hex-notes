# ヘクサノート M0 手順 6 の引き継ぎ（次のセッションへの依頼文）

あなたはヘクサノート（六角セルの音符と PC キーボードの鍵盤で遊ぶ音ゲー）の実装の主担当です。手順 1〜5（M0-01、M0-02 前半・後半、M0-03a、M0-04）は済み、main に入っています（PR #6・#7・#8・#10。決定 #20〜#23 の確定は PR #9）。前のセッションの記憶はこのセッションに引き継がれないので、以下とリポジトリの文書だけを頼りに進めてください。

このセッションでは手順 6（M0-03b 描画層）を実装します。判断の重い論点（描画コマンドの型・描く順・スナップショットの形・予算・「位置で読めるか」の見方）は相談 B で強いモデルの提案が出ています（docs/planning/consult/B-render-commands.md）。着手時にそれを主担当が裁定し、新たな相談は要るときだけにします。

## 1. 場所と道具

- リポジトリ: C:\Users\hihum\Thinkings and Seekings and etc\hex-notes（このフォルダで作業する）
- GitHub: https://github.com/pe-kun333/hex-notes（非公開。CI は .github/workflows/ci.yml）
- gh CLI: C:\Program Files\GitHub CLI\gh.exe（Git Bash では PATH に無いので絶対パスで呼ぶ。PowerShell では gh で呼べる）。クラウドの作業環境で gh の token が無いときは GitHub の連携ツールで PR を作る
- Node 24.21.0／npm 11.19.0。tools/ の .ts は Node が型剥がしで直接実行する
- コミットメッセージはファイルに書いて `git commit -F <ファイル>` で渡す
- 文書を Windows の Python で書き換えると CRLF になる。`io.open(..., newline='')` で書くか Edit ツールを使う（.gitattributes は eol=lf）。Git Bash の heredoc に `'''` を含む Python を渡すと壊れることがあるので、長い置換はスクリプトをファイルに書いて走らせる
- 開発サーバーは .claude/launch.json の `hexnote-dev`（port 5173）。開発ページは `/src/app/dev/*.html`（index の導線は vite dev のときだけ）

## 2. 最初に確かめる

1. `git fetch --prune origin` → `git switch main && git pull --ff-only`。main の先頭が PR #10 の squash コミット（d5b5f25）以降であること。
2. `npm ci` → `npm run check` → `npm run build && npm run size` が全て exit 0 であること（試験 329 件）。
3. docs/HANDOFF.md を読む。HANDOFF.md は手順 6 の終わりに書き換える（10 行以内）。

## 3. 読む物（この順で）

docs/HANDOFF.md → docs/decisions.md（#0〜#26。#24 は R と v、#25 は tsPerf、#26 は入力層の細部。どれも仮）→ docs/design.md（§1.3 S2、§2.2、§2.5、§2.8 の演出予算、§4.1 の描画層、§5.1 M0-03b と注記、§5.7）→ docs/planning/m0-kickoff.md（手順 6、§1.2、§7-2・§7-23）→ docs/planning/consult/B-render-commands.md（相談 B の提案）→ docs/tests-inventory.md（手順 6 の 2 行）→ src/README.md → src/render/hex/（手順 4 の hex・grid・landing・sizing）→ src/app/dev/dom-input.ts（手順 5 の attachKeyboard）。モックは docs/planning/mocks/（行番号は凍結した写しのもの）。手順 6 の元: m1-geometry.html `hexPath／hexVerts` L379–380、`edgeToward` L381、`drawLabel` L384–388、`drawCell` L390–403、`drawNotes` L406–427、`drawEffects` L429–436、m2-layout-explorer.html `components` L327–328・`hull` L329–331・塊／殻 L353–362、m4-practice.html 判定文字 L547。譜面は tests/fixtures/charts/m1/（6 曲の /1 と譜面版）。

## 4. 守る決まり

- グローバル状態を持たない。DOM・Canvas・vite/client は層の外（tools/ が src/ を直接 import する）。描画層は「描画コマンド列を返す純関数」（src/render/canvas/ の commands ほか、DOM 無し）と「Canvas へ流す薄い関数」（flush.ts だけが Canvas に触る）に分ける。相対 import は .ts 拡張子付き。enum・namespace・パラメータプロパティは使わない。時刻は ms。performance.now の直呼びは src/clock/ と src/app/ だけ（描画層は時刻を引数で受ける）。
- 試験はコマンド列に対して行う。画素差分・jsdom・ブラウザ runner は使わない。
- 他実装（Falling Nikochan・Bemuse・Specy・beatoraja・WebAudioFont）の名前や数値はコードに書かず、docs/references.md に置く。AGPL／GPL（と LGPL）の実装は開かない。依存は npm run licenses を通る物だけ（decisions #16、ADR 0002）。
- 設計書・決定に無い規則を実装が持つときは、黙って選ばず「仮」と印を付け、decisions.md に #27 以降の行（手順 7 の時計層の行もこの後になる）か docs/adr/ に ADR を足す。
- 試験は期待値を固定する。台帳の行は、試験が通ったら「検算済（ファイル名）」に更新する。
- コミット前に `npx prettier --write src tools tests`、`npm run typecheck`、`npm test`、`npm run charts:validate`、`npm run licenses`、`npm run build` を全て通す。
- 手順の型: main からブランチ → 実装（モジュールごとに試験付き）→「疑う」を 2 観点で（(a) 仕様適合、(b) コードと試験の厳しさ。反論は high／mid／low で、引用と直し方を付け、確かめ役が崩しにかける）→ 直す → push → PR（本文は .github/PULL_REQUEST_TEMPLATE.md に沿う）→ CI → 利用者に「取り込むか」を聞く → 取り込むと言われたら squash で取り込み、main を最新にする。

## 5. 強いモデルへの相談のしかた（要るときだけ）

- 相談役は Agent ツールで呼び、model に `fable` を指定する。読むだけにする（リポジトリのファイルを書き換えない。計算は node -e か OS の一時ディレクトリで）。答えは日本語。
- 手順 5 では fable が利用枠の不足（HTTP 429、usage credits）で呼べなかった。同じなら、このセッションのモデルで 3 役（事実の確認・起草・批判）を回して主担当が裁定し、その旨を記録に書く（docs/planning/consult/E-tsperf.md が例）。
- 包み: 問い、分かっている事実、読むファイルと行、制約、答えの形（案 2 つ以上と長短、推す案、規則の最終形、試験に固定できる期待値の表、改訂先、事実と推測の区別）。答えは提案で、採否は主担当が決める。記録は docs/planning/consult/ に 1 ファイル、README.md の表に行を足す。

## 6. 着手時に裁定する物

1. **相談 B の提案**（B-render-commands.md）: コマンド型（推す案 C: プリミティブ poly／line／rect／text ＋ 印 layer・region・tag。Paint は名前で、実色は flush のパレット）、描く順（bg → keys → hints → notes → fx）、スナップショットの形（1 コマンド 1 行の JSON、0.01 px 丸め、箱 850×644、ableton/2/octave と vmpk/2/octave の 6 曲 ＝ 12 本、tests/fixtures/render/frames/）、予算の勘定（直近 1,000 ms の閃光 ≤ 3、同時面積 ≤ 25%、超過は縁 2 px に格下げ。縁の返しと判定文字は閃光に数えない）、「位置で読めるか」の 5 観点と一本線へ戻す目安、1 日目に殻の最小版と縁の返しの代役を足す案。採る・退ける・改めるを決め、decisions に行を足す（仮）。
2. **hexVerts の置き場**: 手順 4 の src/render/hex/hex.ts には頂点の関数が無い。hex.ts に足す（幾何は hex/ にまとめる）か src/render/canvas/cells.ts に置くか。
3. **「段の記号」「角の補助」の中身**: decisions の既定値「色に頼らない（段の記号・明度）」、design.md §2.5 L129「R<26 で角の補助を消す」は中身が設計書に無い。案を決めて「仮」で decisions に書くか、M1 へ送るなら kickoff §7 に未決として足す。

## 7. 手順 6 で作る物（kickoff 手順 6）

- `src/render/canvas/commands.ts`（描画コマンド列を返す純関数）、`flush.ts`（Canvas へ流す）、`cells.ts`、`hints.ts`、`chords.ts`、`feedback.ts`、`budget.ts`、`lowload.ts`。
- 開発ページ `src/app/dev/play-dev.ts`（＋ `play.html`。src/main.ts の DEV_PAGES に足す）。仮時計は m3 `nvTime` L351 相当（手順 7 で差し替え）。手弾きは手順 5 の `attachKeyboard`（src/app/dev/dom-input.ts。focusTarget に tabindex 付きの canvas などを渡す）で繋ぐ。押下の時刻は press の tsPerf。
- 手直し（kickoff 手順 6）: 辺ヒント白 4 px → 3 px 明度・距離 ≥2 で数字。殻 破線 → 実線 1.5 px・35%。塊 色で上書き → 共有辺を消す。ヒット輪 1.85R・450 ms → 縁 2→6 px・120 ms。段色 → 明度と記号。追加: VMPK 型の A–Q 間に 2 px 二重線、黒鍵 30°＋♯ 0.4·R、キー文字 0.95·R 太字・音名 0.62·R、R<26 で角の補助を消す、NEAR はセルが押したキーへ半分滑る（160 ms）、判定文字 600 ms、閃光 1 秒 3 回・面積 25%、低負荷 3 段（閾は仮、M-7）。
- 順序と確認点: 1 日目に cells.ts・landing.ts・play-dev を繋ぎ、6 曲×2 配列を段別着地で流して「位置で読めるか」を見る（§5.7「M0-03b の途中」）。実際に弾いて読むのは利用者に頼む（開発ページの URL と手順、記録の形〔相談 B の 5 観点〕を渡す）。読めなければ一本線を既定に戻す提案を docs/adr/ に書き、landing.ts の既定を line に切り替える（やり直し最大 6 日、§7-2）。2〜3 日目に hints／chords／feedback／budget／lowload。
- 期待値（台帳 手順 6）: isConnected [A,S,D] true（相談 B: [A,D] false、[A,W] true）。コマンド列の全図形が落下域＋鍵盤図の矩形内。6 曲×2 配列の初期フレームのコマンド列スナップショット一致。相談 B の代表値（六角 poly の面積 3√3/2·R² ＝ 2037.08 at R 28、縁 real 0／60／120／121 → 2／4／6／なし、閃光 5 件 → 受理 3・格下げ 2、低負荷 25 ms × 10 s → 段 1）。スナップショットの前に R 28、v 0.3587（ableton）／0.3027（vmpk）を断定する（decisions #24）。
- 完了条件: 「m1' の 6 曲が同じ絵。演出が領域外に出ない」（design.md §5.1 M0-03b）。

## 8. このセッションの流れ

1. §2 を確かめ、§3 を読む。
2. §6 の 3 件を裁定し、decisions（#27〜）・design.md（§2.2・§2.5・§2.8・§4.1）・kickoff 手順 6・台帳の手順 6 を直す。相談の記録 B に裁定を書き足す。
3. main からブランチ `m0-06-render` を切り（クラウドの作業環境で指定ブランチがあるならそれを使う）、1 日目の範囲（cells・landing・play-dev）を作って利用者に「位置で読めるか」を見てもらう。結果で段別か一本線かを決める（一本線なら ADR）。
4. 残りの 5 ファイルと試験を作る。
5. 「疑う」2 観点を回し、直したら全検査 → PR → CI → 利用者に取り込むかを聞く。
6. 手順の終わりに、台帳・decisions・kickoff §7・docs/HANDOFF.md（10 行以内。済んだ手順、次の手順 7、未決、手元作業の状況）を更新する。手順 7 の着手時に裁定する物（相談 C の提案、Pause 要求の冪等の扱い〔kickoff 手順 7 の申し送り〕）を HANDOFF に残す。

## 9. 未決と手元作業

- kickoff §7 の未決: 8・18（相談 C 済み、手順 7 で裁定）、10・17（手順 10）、11（手順 8・13）、13（手順 9）、16（手順 8。相談 E の申し送り: MISS の確定の余裕 G、Pause を伴わない全離しのホールド）、19、21〜23（23 は手順 6: 「同じ絵」は variants.ts の譜面版で取る）。9 は閉じた（#25）。「動画なし形態の左列の幅」は M1-03（decisions #24）。
- 利用者の手元作業: U-01（段ずれの実機計測。順は 数字–Q／Q–A／A–Z、ADR 0001）は手順 9 まで、U-03（同梱曲 10 曲と権利表 content/charts/RIGHTS.md）は M0 末まで、U-05（125% 端末で R 27・v 0.2043 の可読性、Firefox 既定・Windows 11 の keydown の刻みと入力遅延、macOS の Meta 中の keyup、実キーの IME 帯）。手順 6 では「位置で読めるか」の手弾きも頼む。進み具合を利用者に確かめ、遅れたら kickoff §5 の代替で進める。
- dependabot の提案: actions の版上げは CI が通れば取り込む。@types/node の主版更新は Node 24 に合わせて取り込まない。

## 10. 報告の仕方

- 裁定の後: 採った案・退けた案・決定の番号を短く報告する。
- 「位置で読めるか」の後: 結果と、段別を保つか一本線へ戻すか（ADR の番号）を報告する。
- 手順 6 の終わり: 入った物・直した反論の数・未決の増減・CI の結果・次の手順を短く報告し、PR の URL を示す。取り込みは利用者の指示を待つ。
- 設計書や決定を変えたときは、その番号（decisions #N、ADR 000N）を報告に含める。
