# ヘクサノート M0 手順 5 の引き継ぎ（次のセッションへの依頼文）

あなたはヘクサノート（六角セルの音符と PC キーボードの鍵盤で遊ぶ音ゲー）の実装の主担当です。手順 1〜4（M0-01、M0-02 前半・後半、M0-03a）は済み、main に入っています（PR #6・#7・#8）。決定 #20〜#23 の確定（PR #9）も入っているはずです。前のセッションの記憶はこのセッションに引き継がれないので、以下とリポジトリの文書だけを頼りに進めてください。

このセッションでは手順 5（M0-04 入力層）を実装します。判断の重い論点は 1 つ（§6 の相談 E: tsPerf の出所、kickoff §7-9）だけなので、強いモデル（相談役）への相談はそれに限り、残りはこのセッションのモデルで進めます。相談せずに自分で裁定できると判断したら、相談を省いて decisions に「仮」で書いてもよいです。

## 1. 場所と道具

- リポジトリ: C:\Users\hihum\Thinkings and Seekings and etc\hex-notes（このフォルダで作業する）
- GitHub: https://github.com/pe-kun333/hex-notes（非公開。CI は .github/workflows/ci.yml）
- gh CLI: C:\Program Files\GitHub CLI\gh.exe（Git Bash では PATH に無いので絶対パスで呼ぶ。PowerShell では gh で呼べる）。クラウドの作業環境で gh の token が無いときは GitHub の連携ツールで PR を作る
- Node 24.21.0／npm 11.19.0。tools/ の .ts は Node が型剥がしで直接実行する
- コミットメッセージはファイルに書いて `git commit -F <ファイル>` で渡す

## 2. 最初に確かめる

1. `git fetch --prune origin` → `git switch main && git pull --ff-only`。main の先頭が PR #9 の squash コミット以降であること（PR #9 が未取り込みなら、利用者に取り込むかを聞く）。
2. `npm ci` → `npm run check` → `npm run build && npm run size` が全て exit 0 であること（試験 247 件）。
3. docs/HANDOFF.md を読む。HANDOFF.md は手順 5 の終わりに書き換える（10 行以内）。

## 3. 読む物（この順で）

docs/HANDOFF.md → docs/decisions.md（#0〜#24。#24 は手順 4 で決めた R と v の式、仮）→ docs/design.md（§1.3 の S0・S2・S7、§2.8 の「入力」、§4.1 の入力層、§6.1 L299 の timeStamp）→ docs/planning/m0-kickoff.md（手順 5、§7-9、§2 の「共通の手直し」）→ docs/tests-inventory.md（手順 5 の 3 行）→ src/README.md → docs/planning/consult/README.md（相談の記録の置き場。B・C は手順 6・7 で裁定する）。モックは docs/planning/mocks/ にある（行番号は凍結した写しのもの）。手順 5 の元: m1-geometry.html keydown／keyup／blur L524–533、m3-clock-judge.html L647–655（timeStamp と入力遅延）、m4-practice.html L650–659・L674、m2-layout-explorer.html L409–416。

## 4. 守る決まり

- グローバル状態を持たない。DOM・Canvas・vite/client は層の外（tools/ が src/ を直接 import する）。入力層の純粋な部分（押下集合の更新、repeat・IME・禁止 code の判定、役割キーの対応）は src/input/ に DOM 無しで置き、DOM のイベントを拾う薄い部分は src/app/dev/ に置く。相対 import は .ts 拡張子付き。enum・namespace・パラメータプロパティは使わない。時刻は ms。performance.now の直呼びは src/clock/ と src/app/ だけで、他は NowFn を受け取る。
- 他実装（Falling Nikochan・Bemuse・Specy・beatoraja・WebAudioFont）の名前や数値はコードに書かず、docs/references.md に置く。AGPL／GPL の実装は開かない。依存は npm run licenses を通る物だけ（decisions #16、ADR 0002）。
- 設計書・決定に無い規則を実装が持つときは、黙って選ばず「仮」と印を付け、decisions.md に #25 以降の行か docs/adr/ に ADR を足す。
- 試験は期待値を固定する。台帳の行は、試験が通ったら「検算済（ファイル名）」に更新する。
- コミット前に `npx prettier --write src tools tests`、`npm run typecheck`、`npm test`、`npm run charts:validate`、`npm run licenses`、`npm run build` を全て通す。
- 手順の型: main からブランチ → 実装（モジュールごとに試験付き）→「疑う」を 2 観点で（(a) 仕様適合、(b) コードと試験の厳しさ。反論は high／mid／low で、引用と直し方を付ける）→ 直す → push → PR（本文は .github/PULL_REQUEST_TEMPLATE.md に沿う）→ CI → 利用者に「取り込むか」を聞く → 取り込むと言われたら squash で取り込み、main を最新にする。

## 5. 強いモデルへの相談のしかた

- 相談役は Agent ツールで呼び、model に `fable` を指定する。読むだけにする（リポジトリのファイルを書き換えない。計算は node -e か OS の一時ディレクトリで）。答えは日本語。
- 包み: 問い、分かっている事実、読むファイルと行、制約（§4 の決まりと決定 #0〜#24）、答えの形（案 2 つ以上と長短、推す案、規則の最終形、試験に固定できる期待値の表、設計書・決定のどこを改訂するか、事実と推測を分けて書く）。
- 答えは提案として扱い、採否は主担当が決める。記録は docs/planning/consult/ に 1 ファイル（渡した包み、答えの要約、裁定）。README.md の表に行を足す。

## 6. 相談する論点

### 相談 E: tsPerf の出所（kickoff §7-9。手順 5 の実装前に裁定する）

問い: 入力レコード `{code, tsPerf}` の時刻を Event.timeStamp（performance.timeOrigin 基準、Chromium では 16.7 ms 刻みのことがある。design.md §6.1 L299）から取るか、ハンドラ内で performance.now() を読むか。判定層（手順 8）は実時間で窓を比べる（時計層の相談 C: `nowAt(t_n) − tsPerf`）ので、tsPerf の刻みと遅れが判定の精度に直接効く。

分かっている事実: m3 L647–655 は timeStamp と now の差を「入力遅延」として計測している。計測層（§4.6）の device 行に「timeStamp の刻み」がある。保存層の `hexnote.device` に tsResolution がある（§4.3）。timeStamp は入力イベントの発生時刻で、rAF の遅れを含まない。performance.now() はハンドラが走った時刻で、メインスレッドが詰まると遅れる。

答えに含めること: どちらを既定にするか（刻みが粗い端末の見分け方と切替の規則）、`hexnote.device.tsResolution` の測り方、試験用のイベントの模型（DOM 無しで `{code, timeStamp, repeat, isComposing, keyCode}` を渡す形）、期待値の表。

## 7. 手順 5 で作る物（kickoff 手順 5）

- `src/input/keyboard.ts`（入力レコード `{code, tsPerf}` への正規化。押下集合で keyup と対応付け、e.repeat か既にある code は捨てる）、`ime.ts`（keyCode 229／isComposing は無視して帯イベント。曲は止めない）、`focus.ts`（blur／visibilitychange で全離し＋Pause 要求、iframe に焦点が移ったら戻す）、`roles.ts`（Space＝開始・再開・校正タップ・見本切替、Enter＝ボタン決定、Escape＝一時停止。禁止 code: Backquote, KanaMode, Convert, NonConvert, CapsLock, Lang1/2, Meta, F1〜F12。修飾キーは使わない）。
- 開発ページ `src/app/dev/input-dev.ts`（押下集合と帯を表示。手弾きで確かめる。製品画面ではない）。index.html からの導線は開発時だけ。
- 手直し（kickoff 手順 5）: m1' の Enter＝やり直し → ボタン決定、m2 の Escape＝和音消去 → 一時停止、IME 無視のみ → 無視＋帯、禁止 code の追加、blur 全離しだけ → ＋Pause 要求、m2 の修飾付き keyup 捨て → 捨てない。
- 期待値（台帳 手順 5）: 同じ code の 2 度目の keydown は無視。blur で押下集合が空＋Pause 要求。keyCode 229 → 入力列に入らず帯 1 件。
- 完了条件: 「IME 中の打鍵が入らず帯が出る」（design.md §5.1 M0-04）。Firefox 列は M0 末（U-05）。

## 8. このセッションの流れ

1. §2 を確かめ、§3 を読む。
2. 相談 E を相談役に投げる（省くなら decisions #25 に仮で書く）。待つ間に手順 5 の元のモックを読む。
3. 相談 E を裁定し、decisions #25・design.md §2.8・kickoff §7-9・台帳の手順 5 を直す。
4. main からブランチ `m0-05-input` を切り（クラウドの作業環境で指定ブランチがあるならそれを使う）、手順 5 を実装する。
5. 「疑う」2 観点はこのセッションのモデルで行う。直したら全検査 → PR → CI → 利用者に取り込むかを聞く。
6. 手順の終わりに、台帳・decisions・kickoff §7・docs/HANDOFF.md（10 行以内。済んだ手順、次の手順 6、未決、手元作業の状況）を更新する。手順 6 の着手時に裁定する物（相談 B の提案、hexVerts の置き場、「段の記号」「角の補助」の中身）を HANDOFF に残す。

## 9. 未決と手元作業

- kickoff §7 の未決: 8・18（相談 C 済み、手順 7 で裁定）、9（相談 E）、10・17（手順 10）、11（手順 8・13）、13（手順 9）、16（手順 8）、19、21〜23。「動画なし形態の左列の幅」は M1-03（decisions #24）。
- 利用者の手元作業: U-01（段ずれの実機計測。順は 数字–Q／Q–A／A–Z、ADR 0001）は手順 9 まで、U-03（同梱曲 10 曲と権利表 content/charts/RIGHTS.md）は M0 末まで、U-05（125% 端末）で R 27・v 0.2043 の可読性を測る。進み具合を利用者に確かめ、遅れたら kickoff §5 の代替で進める。
- dependabot の提案: actions の版上げは CI が通れば取り込む。@types/node の主版更新は Node 24 に合わせて取り込まない。

## 10. 報告の仕方

- 相談の後: 採った案・退けた案・決定の番号を短く報告する。
- 手順 5 の終わり: 入った物・直した反論の数・未決の増減・CI の結果・次の手順を短く報告し、PR の URL を示す。取り込みは利用者の指示を待つ。
- 設計書や決定を変えたときは、その番号（decisions #N、ADR 000N）を報告に含める。
