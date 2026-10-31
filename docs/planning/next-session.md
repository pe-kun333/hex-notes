# ヘクサノート M0 手順 7 の引き継ぎ（次のセッションへの依頼文）

あなたはヘクサノート（六角セルの音符と PC キーボードの鍵盤で遊ぶ音ゲー）の実装の主担当です。手順 1〜6（M0-01、M0-02 前半・後半、M0-03a、M0-04、M0-03b）は済み、main に入っています（手順 2〜6 は PR #6・#7・#8・#10・#12。決定 #20〜#23 の確定は PR #9）。前のセッションの記憶はこのセッションに引き継がれないので、以下とリポジトリの文書だけを頼りに進めてください。

このセッションでは手順 7（M0-05 時計層）を実装します。判断の重い論点（時計の API・補間と量子化の補正・飛び・猶予・停止検知の条件・ダミー動画の形）は相談 C で強いモデルの提案が出ています（docs/planning/consult/C-clock.md）。着手時にそれを主担当が裁定し、新たな相談は要るときだけにします。YouTube の IFrame には触れません（M3）。動画はダミー動画で模します。

## 1. 場所と道具

- リポジトリ: C:\Users\hihum\Thinkings and Seekings and etc\hex-notes（このフォルダで作業する）
- GitHub: https://github.com/pe-kun333/hex-notes（非公開。CI は .github/workflows/ci.yml）
- gh CLI: C:\Program Files\GitHub CLI\gh.exe（Git Bash では PATH に無いので絶対パスで呼ぶ。PowerShell では gh で呼べる）。クラウドの作業環境で gh の token が無いときは GitHub の連携ツールで PR を作る
- Node 24.21.0／npm 11.19.0。tools/ の .ts は Node が型剥がしで直接実行する
- コミットメッセージはファイルに書いて `git commit -F <ファイル>` で渡す
- 文書を Windows の Python で書き換えると CRLF になる。`io.open(..., newline='')` で書くか Edit ツールを使う（.gitattributes は eol=lf）。Git Bash の heredoc に `'''` を含む Python を渡すと壊れることがあるので、長い置換はスクリプトをファイルに書いて走らせる
- 開発サーバーは .claude/launch.json の `hexnote-dev`（port 5173）。開発ページは `/src/app/dev/*.html`（index の導線は vite dev のときだけ）
- 手順 6 で起きたこと（同じなら同じように扱う）:
  - 別のセッションが残した vite（5173）が node_modules の rolldown の .node を掴んでいて、`npm ci` が EPERM で止まり node_modules が半分消えた。他のセッションの node は止めない。掴まれている `node_modules/@rolldown` をセッションの一時ディレクトリへ移してから `npm ci` をやり直すと通った。自分の開発サーバーは launch.json に別のポート（例 5174）の設定を一時的に足して preview_start で立て、コミットの前に launch.json を元に戻す
  - Claude の browser pane が隠れていると rAF とタイマーが間引かれる（手順 6 では低負荷の段がこれで落ちた）。時計の残差・停止検知の手確認は pane を表に出して行い、隠れた pane の数値は判断に使わない（非表示は停止検知を止める条件でもある）
  - 「疑う」のワークフローが利用枠の上限で止まったら、同じ run id で `resumeFromRunId` を付けて再開する（終わった agent の結果はそのまま戻る）

## 2. 最初に確かめる

1. `git fetch --prune origin` → `git switch main && git pull --ff-only`。main の先頭が PR #12 の squash コミット（882ef5e）以降であること。
2. `npm ci` → `npm run check` → `npm run build && npm run size` が全て exit 0 であること（試験 429 件）。
3. docs/HANDOFF.md を読む。HANDOFF.md は手順 7 の終わりに書き換える（10 行以内）。

## 3. 読む物（この順で）

docs/HANDOFF.md → docs/decisions.md（#0〜#31。#11 は動画ありで待ちを出さない・プログラムからの pause／seek／play は 3 用途だけ、#14 は同期タップをダミー時計で検証、#24 は R と v、#25 は tsPerf、#26 は入力層の細部〔Pause 要求は冪等で再生中だけ効く〕、#27〜#31 は描画層。#24 以降は仮）→ docs/design.md（§1.2 遷移図、§1.3 S2・S4・S7、§2.3 の遅れ側の窓、§2.6 時計と同期、§2.7 のテンポ段、§2.8 の Pause、§3.2 の SyncSource〔offset・rate〕、§4.1 の時計層、§4.2 プレイの状態機械、§5.1 M0-05 と注記、§6.1 T-1・T-2、§6.3 M-2）→ docs/planning/m0-kickoff.md（手順 7、手順 8 の calibration-offset、§2 の共通の手直し「時刻源は注入」、§6 M0 の出口、§7-8・§7-16・§7-18）→ docs/planning/consult/C-clock.md（相談 C の提案と主担当のメモ）→ docs/tests-inventory.md（手順 7 の 4 行）→ src/README.md → src/shared/types.ts（SyncSource、ClockKind、SyncUsed、PlayTelemetry の resyncCount・fallback・clockResidualSd）→ src/input/keyboard.ts（InputEvent の pause・role）と src/app/dev/dom-input.ts → src/app/dev/play-dev.ts（仮時計 `songNow` L308、押下の換算 L435、Escape の中止 L479）→ docs/references.md（「YouTube IFrame の時刻」の行）。モックは docs/planning/mocks/（行番号は凍結した写しのもの）。手順 7 の元: m3-clock-judge.html `mulberry32`・`gauss` L244–245、`sd` L248（n−1 で割る）、`dummy` L278–302、`lsq` L321–323、`clk` L324–350、`nvTime` L351、`clockAt` L354–355、`resync` L376–382、`enterNoVideo／leaveNoVideo` L383–384、`startCal` L442–445（AC→performance の換算）、`frame` L599–610（停止検知の本体）。

## 4. 守る決まり

- グローバル状態を持たない。DOM・Canvas・vite/client は層の外（tools/ が src/ を直接 import する）。時計層は時刻源を注入する: `performance.now` の直呼びは `src/clock/clock-source.ts` と `src/app/` だけ（kickoff §2。src/README.md は「clock/ と app/」と広く書いているので、この手順で kickoff に揃える）。fit・jump・grace・stall・audio-bridge は now を値か NowFn で受ける純関数にし、1 tick で now を 1 回だけ読む。相対 import は .ts 拡張子付き。enum・namespace・パラメータプロパティは使わない。時刻は ms（動画時刻の秒をどこで ms にするかは §6-1）。
- 試験は now を手で進める（実時間・タイマーを待たない）。jsdom・ブラウザ runner は使わない。YouTube の API・AudioContext は試験で作らず、数値の標本（動画の state と読み、getOutputTimestamp の組）として渡す。乱数は種付きの mulberry32（m3 L244）で、Math.random は使わない。
- 他実装（Falling Nikochan・Bemuse・Specy・beatoraja・WebAudioFont）の名前や数値はコードに書かず、docs/references.md に置く。AGPL／GPL（と LGPL）の実装は開かない。依存は npm run licenses を通る物だけ（decisions #16、ADR 0002）。
- 設計書・決定に無い規則を実装が持つときは、黙って選ばず「仮」と印を付け、decisions.md に #32 以降の行か docs/adr/ に ADR（0007 以降）を足す。相談 C のメモにある「decisions #24」「#25 以降」「#27 以降」は古い番号の提案で、手順 7 の行は #32 から。
- 試験は期待値を固定する。相談役の値は写す前に自分で計算し直す（相談 B では代表値に計算違いが 1 つあった）。台帳の行は、試験が通ったら「検算済（ファイル名）」に更新する。
- コミット前に `npx prettier --write src tools tests`、`npm run typecheck`、`npm test`、`npm run charts:validate`、`npm run licenses`、`npm run build` を全て通す。
- 手順の型: main からブランチ → 実装（モジュールごとに試験付き）→「疑う」を 2 観点で（(a) 仕様適合、(b) コードと試験の厳しさ。反論は high／mid／low で、引用と直し方を付け、確かめ役が崩しにかける）→ 直す → push → PR（本文は .github/PULL_REQUEST_TEMPLATE.md に沿う）→ CI → 利用者に「取り込むか」を聞く → 取り込むと言われたら squash で取り込み、main を最新にする。

## 5. 強いモデルへの相談のしかた（要るときだけ）

- 相談役は Agent ツールで呼び、model に `fable` を指定する。読むだけにする（リポジトリのファイルを書き換えない。計算は node -e か OS の一時ディレクトリで）。答えは日本語。
- 手順 5 では fable が利用枠の不足（HTTP 429、usage credits）で呼べなかった。同じなら、このセッションのモデルで 3 役（事実の確認・起草・批判）を回して主担当が裁定し、その旨を記録に書く（docs/planning/consult/E-tsperf.md が例）。手順 6 は相談 B の枠の中の細部だったので新たな相談をしなかった。
- 包み: 問い、分かっている事実、読むファイルと行、制約、答えの形（案 2 つ以上と長短、推す案、規則の最終形、試験に固定できる期待値の表、改訂先、事実と推測の区別）。答えは提案で、採否は主担当が決める。記録は docs/planning/consult/ に 1 ファイル、README.md の表に行を足す。

## 6. 着手時に裁定する物

採る・退ける・改めるを決め、decisions に #32 から行を足す（仮）。design.md §2.6 にある 250（飛び）・300（猶予）・2000（凍結）・500（pause の結果待ち）は設計の値として確定扱いにし、相談 C の自作値（β 0.5・q̂ の上限 50・格子率 0.8・再要求 2.5 s・遅い PAUSED → held・ダミーの seekFreezeMs 240・backMaxMs 10）は仮として kickoff §7-18 に載せる。C の「refresh 周期」は記録に定義が無いので、要らなければ退ける。

1. **相談 C の提案**（C-clock.md）: API（推す A-2: `tick(sample: VideoSample | null): ClockOutput` で t・phase・events・requests・canReturn を返す。now は注入して 1 tick に 1 回）、補間と q̂（推す B-4: q̂_sd ＝ min(50, √12·SD) を span ≥ 1000 で推定し、格子率 ≥ 0.8 のときだけ使い、再アンカーで 0 に戻さず、出力に ＋β·q̂。β 既定 0.5〔切り捨て仮定。M3-07 で決める〕。SD は n−1 か n かも決める）、停止検知の層（推す C-2: 時計層は pause 要求を返し、結果は次の tick の state 標本で受ける。YouTube 層が pauseVideo を呼び、呼べなかったときだけ ok:false を返す）、標本の受け入れ（同じ読みは捨てる、逆行 ≤ 250 は捨てる、fresh は dev を見ない、|dev| > 250 で飛び）、当てはめ（窓 2000 ms、span ≥ 300 かつ n ≥ 2、fresh の間は保持、PLAYING 中は逆行させない）、時計の相（init → grace 300 ms → locked → pauseReq 500 ms → novideo／ad、held、canReturn ＝ now − lastChange ≤ 2000）、停止検知の境界（m3 L603 は now − lastChange > 2000、C は ≥ 2000。canReturn の ≤ 2000 との重なりを見て決める）、skipped（`nowAt(t_n) ＋ W_late ≤ graceUntil`、W_late は実時間の遅れ側窓）、audio-bridge（getOutputTimestamp の組で perf↔context。組には出力遅延が入っているので足さない〔m3 L442〕。組が無いか performanceTime が 0 以下・非有限なら (currentTime, now ＋ outputLatency·1000)、outputLatency が無ければ baseLatency、それも無ければ 0〔m3 L443–444〕）。記録は入力を tick(sample) としか書かないので、次も決める: (a) VideoSample の欄（state・読み〔秒 → ms を標本を作る側でするか tick でするか〕・再生レート・visible・制御の結果 ok:false）、(b) 時計への命令（start(曲 ms)・pause・resume・seek・setRate・return〔「戻す」〕）を tick の引数にするか別の関数にするか、(c) 最初から動画なし（sample が常に null。S2A・play-dev）の相。§1.2・§4.2 どおり開始と一時停止からの再開で猶予 300 ms を通す、(d) レート変更（動画は onPlaybackRateChange、動画なしはテンポ段の切替）で再アンカーし猶予 300 ms を通すこと（§2.6）と、当てはめの窓の変更前の標本を捨てるか。ここの「rate」は再生レート（テンポ段、results.rate）で、sync.rate（動画 BPM ÷ 譜面 BPM）や当てはめの傾き a と混ぜない。kickoff §7-8 を閉じ、§7-18 からは傾き 0.99986 だけを外す（他の自作値は残る）。
2. **プレイの状態機械（design.md §4.2）の置き場と範囲**: §4.2 の待機・同期中・再生・待ち・一時停止・動画なし・終了と、相談 C の時計の相（init／grace／locked／pauseReq／ad／held／novideo）は別の物。§4.2 を時計層に置くか、別の層（例 `src/play/`。src/README.md の表に行を足す）か `src/app/` に置くかを決める。(状態, 事象, now) → (状態, 要求) の純関数にするのを既定案とする。手順 7 で試験に固定するのは 待機・同期中・再生・一時停止・動画なし の遷移で、待ち（S4、M2-03）と終了（最終ノート＋1.2 秒、判定層の後）は型と遷移だけを置く。決めること: PAUSED の出どころの区別（pauseReq 中の PAUSED は動画なしへ、利用者が iframe で止めた PAUSED は一時停止へ、ad 中の遅い PAUSED〔C の held〕はどちらか）、動画ありで Esc・blur の一時停止に pauseVideo を要求してよいか（decisions #11 の 3 用途の読み）、動画なし（S2A）での pause と再開の戻り先（#26 の「再生中だけ」が動画なしを含むか）。kickoff 手順 7 の申し送り（decisions #26）の 3 件「待機＋pause iframe → 待機のまま（click-to-play の click）」「再生＋pause → 一時停止」「一時停止＋pause → 一時停止のまま（タブの切替で hidden と blur の 2 件）」に、「動画なし＋pause → 一時停止」「一時停止＋再開 → 同期中（動画なしのまま猶予 300 ms）」を足して試験に固定する。Escape の role pause と blur・非表示・iframe の pause は同じ要求として扱う。
3. **ダミー動画の置き場と作り方**: kickoff 手順 7 は `tests/unit/clock/dummy-video.ts` とするが、kickoff §6（M0 の出口）と src/README.md の表は src/clock/ に「状態列付きダミー」を置いていて食い違っている。開発ページ clock-dev と M2-02 の同期タップ（decisions #14）が使い、手順 13 の回帰ハーネス（tools/harness は Node で src/ を直接 import する）も使うかもしれない（kickoff は明記していない）。それを踏まえて置き場を決め、kickoff の片方を直す。src/ に置くなら build の入口（index.html から辿れる物）に入らないことを `npm run build && npm run size` で確かめる。作り方: 相談 C の記録は生成式（「答えの §3.8」）を持たないので、m3 dummy L278–302 を ms に直して自分で書く。C の options と合わない所（seek の凍結値を量子化するか〔C の表の 9990 ＝ floor(10000/15)·15、m3 は量子化しない anchorT〕、C の backMeanMs 600 が m3 の backFreq 0.6/s〔平均間隔約 1,667 ms〕の写し違いか）を決める。乱数は mulberry32（既定の種 7、m3 L244）。mulberry32・gauss（L245）は手順 13 の jitter も使うので置き場を一緒に決める。
4. **時計の出力の渡し方と型の置き場**: ClockOutput の t はその tick の now での値だけだが、判定層（手順 8: tsPerf → 曲 ms、`nowAt(t_n) − tsPerf` の実時間の窓、skipped）、音源層（手順 10: 曲 ms → perf → audio-bridge の先読み）、描画（buildFrame の `t {song, real}`）は過去・未来の時刻を行き来する。次の tick まで有効な写像 `songAt(perf)` とその逆 `perfAt(song)`（＝ nowAt）を、t と同じ a・b・β·q̂ で出す（関数で返すか (a, b, bias) の値で返すか、単調の床をどう扱うかを決める）のを既定案とし、各層がこの一つの写像を使うようにする。型の置き場: NowFn（`() => number`）は判定層・ハーネスも使うので src/shared/types.ts、VideoSample・ClockOutput・時計の命令は src/clock/ を既定案とする（M3 の YouTube 層はここから import する）。ClockOutput の events から shared/types.ts の PlayTelemetry.resyncCount・fallback・clockResidualSd と SyncUsed.fallbackAt（曲の ms）を作れることを確かめる。
5. **t の軸と 2 つのオフセット**: t を動画の ms にするか譜面の ms（ms 表の軸、拍 0 ＝ 0。描画の tLandMs と同じ）にするかを決め、sync.sources[0] の offset（秒、拍 0 の動画時刻）と rate（動画 BPM ÷ 譜面 BPM）で換算する場所（時計層の入口か、時計の外の薄い関数か）を決める。動画なし（sources が空か kind audio）は offset 0・rate 1。校正のオフセット（m3 clockAt L354–355 の `+S.offset`、resync L376–382・enterNoVideo L383 の足し引き）は時計層に入れず、手順 8 の `src/judge/calibration-offset.ts` で足すのを既定案とする（描画にも効かせるかは手順 8 で決める）。元のコードをそのまま写さない。

## 7. 手順 7 で作る物（kickoff 手順 7）

- `src/clock/clock-source.ts`（唯一の ClockSource。全モードで performance.now 単独、t ＝ a·now ＋ b を 1 本だけ持つ）、`fit.ts`（最小二乗 2 秒窓、q̂）、`jump.ts`（標本の受け入れ・逆行・飛び）、`grace.ts`（300 ms の猶予と skipped）、`stall.ts`（停止検知と pause 要求・広告中の副状態）、`audio-bridge.ts`（AudioContext の時刻 ↔ performance の換算。数値だけ受ける）、ダミー動画（§6-3。state 列 PLAYING／PAUSED／BUFFERING、`pauseLatencyMs`〔数値か never〕、`visible`、15 ms 量子化〔切り捨て／四捨五入〕、逆行、seek 凍結、再生レート）。§6-2 で決めた置き場にプレイの状態機械。
- 開発ページ `src/app/dev/clock-dev.ts`（＋ `clock.html`。src/main.ts の DEV_PAGES に足す）: ダミー動画を流し、生の読み・出力・真の時刻の残差のグラフ、相とイベント（jump・pause 要求・adSuspected・novideo）の記録、ボタンで seek・jump・stuck・広告模擬（never）・非表示の切替・再生レート。
- play-dev の仮時計（`songNow` ＝ performance.now − 開始 − 予備。L308、押下の換算 L435）を時計層（動画なしの ClockSource と §6-4 の写像）に差し替える。Escape・blur・非表示で一時停止、Space で再開（再開は同期中＝猶予 300 ms を通る。§1.2）を §6-2 の状態機械で繋ぐ。今の Escape は走りの中止（L479 の stopRun）なので、一時停止中の Escape か画面のボタンで中止できる道を残す。
- 手直し（kickoff 手順 7）: 停止検知「2000 ms 不変」だけ → 可視・PLAYING で 2 秒凍結 → pauseVideo 要求 → 500 ms 以内に PAUSED なら動画なしへ切替、でなければ広告中（§2.6、決定 #11）。呼び出し口は抽象。skipped「n.t < T＋0.3」→「猶予内に窓が終わるノート」。判定窓を曲時間で比べる → 実時間で固定。direct／ema → 外す。非表示中は停止検知しない。
- 期待値（台帳 手順 7 と相談 C の表。§6 の裁定で変わる所は直す）:
  - lsq の傾き ＝ 0.99986452（x_i ＝ i·2000/120〔i ＝ 0..120〕、y_i ＝ floor(x_i/15)·15。toBeCloseTo(0.99986452, 7)。生成式を台帳に書く）。残差の SD は m3 の sd（L248）と同じく n−1 なら 4.327・q̂ 14.99、n なら 4.309・q̂ 14.93（相談 C の値は n）。
  - dev ＝ raw − (a·now ＋ b)（β·q̂ と単調の床を含まない当てはめの線）とするなら、境界 dev 250 → 飛びでない・251 → 飛び は jump.ts に標本を直に渡す試験で固定する（ダミー越しでは量子化と β·q̂ で境界がずれる）。ダミー越しでは jump +300 → 飛び（jump イベント、猶予の再始動）、+200 → 何も無い。
  - 停止検知: stuck 3 s → 最後の変化から 2,000 ms の tick で pause 要求（§6-1 の境界で、1999／2000 の tick を試験に入れる。canReturn も同じ）。pauseLatencyMs 100 → 要求＋100 の tick で動画なし。`pauseLatencyMs: never` → ＋500 で広告中、以後動画なしへ切り替わらない。`visible: false` → 要求もイベントも無し。遅い PAUSED（pauseLatencyMs 700）→ ＋500 で広告中、＋700 で held（仮）。
  - seek 凍結 240 ms で凍結明けに jump を出さない。逆行（backMaxMs 10）は標本に入らない。skipped は W_late 234 ms・再アンカー R で nowAt(t) ＝ R＋50 → skipped、R＋70 → pending。
  - q̂: 15 ms 切り捨て・60 fps で span < 1000 の間 0、窓が 2 秒満ちた後（2000〜3000 ms）は 15.0±0.3（span 1000〜2000 ms の間は位相で 14.5〜15.4 に揺れるので、固定するなら許しを広げる）。四捨五入（quant round）で β 0.5 なら出力−真 ＋7.5、β 0 なら ≈0。格子率は切り捨て 1.0、連続＋ガウス 3 ms で ≈0.13。生成式に依る値（逆行の出力−真 平均 ＋0.71・SD 0.19、q̂ の出力−真 平均 ＋0.70・SD 0.21、格子率 ≈0.13）は自分のダミーで計算し直してから固定する。
  - audio-bridge（台帳に行が無いので未検算で足す。案）: 組 {contextTime 1.000 s, performanceTime 5000} → context 1.500 s ↔ perf 5500。退避で currentTime 2.000 s・now 8000・outputLatency 0.020 → context 2.000 s ↔ perf 8020。
  - プレイの状態機械の 5 件（§6-2）。§6-4 の写像は songAt(perfAt(x)) ＝ x、再生レート 0.5 で曲 ms の差 100 が実時間の差 200。
- 文書の直し: design.md §2.6（fresh の保持、負の増分の扱い、＋β·q̂ と格子率・上限・持ち越し、凍結の計時と可視復帰、再要求の周期、猶予中の飛び、レート変更）・§4.1・§4.2（pause 要求と state の結果、「広告中とみなす」副状態、PAUSED の出どころ）、kickoff 手順 7（ダミー動画の置き場）・§6・§7-8・§7-18（傾きだけ外す）、台帳の手順 7、src/README.md（performance.now の決まりと、§6-2 で層を足すならその行）、相談 C の記録に主担当の裁定を書き足し README.md の表を直す。references.md の「YouTube IFrame の時刻」の行は、出どころ（research/youtube-iframe はリポジトリに無い。「自前計測、切り捨てか四捨五入かは未計測」と直すか所在を書く）と使い道の列の「量子化補正 +q̂/2」（裁定に合わせて ＋β·q̂ に）を直す。
- 完了条件: 「傾き 1.00±0.01。非表示・広告模擬で切り替わらない」（design.md §5.1 M0-05）。

## 8. このセッションの流れ

1. §2 を確かめ、§3 を読む。
2. §6 の 5 件を裁定し、decisions（#32〜）・design.md（§2.6・§4.1・§4.2）・kickoff 手順 7・§6・§7・台帳の手順 7・src/README.md を直す。相談の記録 C に裁定を書き足す。
3. main からブランチ `m0-07-clock` を切る（クラウドの作業環境で指定ブランチがあるならそれを使う）。ダミー動画とダミー自身の試験（量子化の切り捨て／四捨五入・種での再現・seek 凍結・pauseLatencyMs）→ fit・jump・grace・stall（標本を直に渡す単体試験）→ clock-source（ダミーを流して相談 C の表）→ プレイの状態機械と Pause の試験 → audio-bridge → clock-dev → play-dev の差し替え、の順に作る。
4. clock-dev と play-dev を browser pane（表に出した状態）で手確認する。play-dev は手順 6 のとおり弾けて、Escape・タブの切替で止まり Space で戻り、中止もできることを見る。
5. 「疑う」2 観点を回し、直したら全検査 → PR → CI → 利用者に取り込むかを聞く。
6. 手順の終わりに、台帳・decisions・kickoff §7・docs/HANDOFF.md（10 行以内。済んだ手順、次の手順 8、未決、手元作業の状況）を更新する。手順 6 の HANDOFF は「済んだ手順」の行に相談の行が続けて書かれているので、行を分けて直す。手順 8 の着手時に裁定する物（§7-16: MISS の確定の余裕 G、Pause を伴わない全離しのホールド、ホールド離し窓の終端・skipped の分母。§7-11: 2 プロファイルの既定値。§6-5 で送った校正のオフセットを描画にも効かせるか）を HANDOFF に残す。

## 9. 未決と手元作業

- kickoff §7 の未決: 8（この手順で閉じる）、18（傾きだけ外す。他の自作値は残り、この手順の自作値を足す）、10・17（手順 10）、11（手順 8・13）、13（手順 9）、16（手順 8。相談 E の申し送り: MISS の確定の余裕 G、Pause を伴わない全離しのホールド）、19、21・22。他は閉じた（25 は 2026-10-31 に利用者の手弾きで「読めた」、段別着地を既定のまま）。20 と 23 は kickoff に閉じた印が無いので、手順の終わりの kickoff §7 の更新で印を付ける。「動画なし形態の左列の幅」は M1-03（decisions #24）。
- 利用者の手元作業: U-01（段ずれの実機計測。順は 数字–Q／Q–A／A–Z、ADR 0001）は手順 9 まで、U-03（同梱曲 10 曲と権利表 content/charts/RIGHTS.md）は M0 末まで、U-05（125% 端末で R 27・v 0.2043 と ♯ の可読性、Firefox 既定・Windows 11 の keydown の刻みと入力遅延、macOS の Meta 中の keyup、実キーの IME 帯）。U-02（限定公開動画）は M3-03 の前なので手順 7 では要らない（時計層はダミー動画だけで確かめる）。進み具合を利用者に確かめ、遅れたら kickoff §5 の代替で進める。
- dependabot の提案: actions の版上げは CI が通れば取り込む。@types/node の主版更新は Node 24 に合わせて取り込まない。

## 10. 報告の仕方

- 裁定の後: 採った案・退けた案・決定の番号を短く報告する。
- 手順 7 の終わり: 入った物・直した反論の数・未決の増減・CI の結果・次の手順を短く報告し、PR の URL を示す。取り込みは利用者の指示を待つ。
- 設計書や決定を変えたときは、その番号（decisions #N、ADR 000N）を報告に含める。
