# M1 着手手順書（ヘクサノート）

起草 2026-10-31（M0 の手順 14 の後）、改訂 1 回目（同日。§7 の重い 6 件を利用者が採用し、順序を主担当が裁定 → decisions #58〜#64）。前提は decisions.md #0〜#64 と design.md §1〜§5.2。食い違うときは設計書と決定を正とし、モックの値は「モックの値 → 設計書の値」と書く。根拠はモック名・部品名・行番号（m6＝m6-flow.html、m1'＝m1-geometry、m3＝m3-clock-judge）と M0 の実装（`src/`・`src/app/dev/`）。推測は「仮」。M0 の手順書は `m0-kickoff.md`（形はそれに揃える）。

## 0. 前提と読み方

目的: M0 で層ごとに揃えた部品（m0-kickoff.md §6「M0 の出口」）を、製品の画面に組み上げる。M1 の範囲は design.md §5.2 の M1-01〜M1-14（約 24 日）で、**同梱曲・入門者・動画なし**の遊べる最小版。画面は §1.1 の 15 枚のうち S0a〜S0d・S1・S2（動画なし形態）・S3・S6・Pause と、帯の S7d・IME。S4（M2-03）・S5（M2-01）・S2 の動画あり形態と S7a〜S7c（M3）・音ゲー向けの画面（M2-05）は作らない（§4）。

元のモックは **m6-flow.html**（画面の文言・遷移・帯。M0 では読まなかった）で、プレイの中身は M0 の開発ページ `src/app/dev/play.html`・`play-dev.ts`（手順 6〜8・12 で S2 の試作になっている）。M0 と同じく、**モックに試験節・assert は無い**。各手順の「期待値」が唯一の出所で、`docs/tests-inventory.md` に「M1 手順 n」の行として写した（2026-10-31。試験を書いたら状態を更新する）。未検算は「仮」。本書の §2 の各手順の期待値のうち、M0 の部品で今すぐ計算できる物（3 視口の可視時間、フィクスチャ曲の密度）は 2026-10-31 に node で計算して確かめた（印: node で検算。台帳の「検算済」は試験が通った物だけ）。

規模（§5 L206）: S＝1 日、M＝3 日、一人開発・並行なし。M1 の和は 24 日（§5.2 L228）。M0 の終わりの状態: 試験 823 件、`npm run check`（回帰ハーネスの照合を含む）と `npm run build && npm run size`（初回読込 11,652 バイト）が通る。開発ページ 7 枚（input・play・clock・layout・audio・storage・telemetry）。

守る決まりは M0 と同じ（m0-kickoff.md §2「共通の手直し」、src/README.md）。M1 で足す決まり（仮、§7-22）:

- **DOM に触るのは `src/app/` だけ。** 画面の論理のうち純粋な部分（同時押しテストの合否、校正タップの対応付け、鍵数制限、称号・ストリーク、難度 4 軸）は層のディレクトリに置き、DOM 無しで試す。画面は「状態 → 描く」の薄い関数にし、状態の遷移は純関数で持つ（m6 の `state`＋`render()` L547–557・L946–950 の形を層に分ける）。
- 開発ページ（`src/app/dev/`）は消さない。製品の画面は `src/app/screens/` に置き、`src/main.ts` が初回の判定（`isFirstRun`、decisions #52 (e)）で S0 か S1 に入る。開発ページへの導線は開発時だけのまま。
- 通知は帯だけ（§1.3 S2「通知（トースト・帯）もプレイヤー矩形の外」）。m6 のトースト（L191・L590）は使わない。
- 文言は m6 を正とし、設計書と食い違う所だけ「手直し」に書く。

## 1. 画面と部品の対応

| 画面 | 手順 | M0 の部品（層） | 元のモックと開発ページ |
|---|---|---|---|
| 起動・初回の判定 | 2 | storage（`isFirstRun`・`migrateLegacy`）、telemetry（device 行） | m6 `go('Boot')` L627–642・L1046–1048 |
| 帯・Pause・S7d・IME | 2 | input（focus・ime・roles）、storage（fallback の文言 #50 (g)）、play（Pause 要求 #35） | m6 L242・L347–353・L790–803・L941、play-dev L691 |
| S2 プレイ（動画なし） | 3 | render（sizing・commands・flush・budget・lowload）、clock（動画なしの ClockSource）、play（session）、judge、audio（scheduler・context）、telemetry（collect） | play-dev.ts 全体、m6 L326–358・L805–831、m1' drawHUD L437–440 |
| 校正（S0c・S6・S3 の提案） | 4 | judge（calibration-offset）、audio（metronome・context）、clock（audio-bridge）、storage（calibration）、telemetry（calib 行） | m3 L433–457、m6 L269–281・L381–384・L921 |
| S3 結果 | 5 | judge（summarizeJudge）、storage（results） | m6 L360–393・L833–869、m1' finish L358–365 |
| 同梱曲（content/charts/） | 6 | chart（variants・validate）、tools/charts（from-mel・check-rights）、tools/size | m6 SONGS L563–576、content/charts/RIGHTS.md |
| チュートリアル曲（3 段階） | 7 | chart（実行時フィルタ、新規）、judge・render（鍵数制限の見え方） | m6 L283–294・L734 |
| S1 ホーム／選曲 | 8 | chart（metrics、新規）、storage（results の index best）、results（自己ベスト・完走、新規） | m6 L298–324・L738–788 |
| S0a〜S0d 初回導線 | 9 | layout（legend）、input（同時押しテスト、新規）、storage（device・booted）、telemetry（onboard 行） | m6 L238–296・L721–735・L953–963 |
| S6 設定 | 10 | storage（settings v:1 の項目を足す）、layout（geometry・stagger）、render（physical、低負荷の段） | m6 L520–525・L907–931 |
| 称号・ストリーク | 11 | results（新規）、storage（results） | m6 L859–868・L754、design §4.4 |
| 計測盤（S6 内） | 12 | telemetry（export・countByKind） | telemetry-dev.ts、m6 L926 |
| PWA | 13 | vite.config.ts（VitePWA）、public/manifest.webmanifest | ADR 0003・0004 |
| 通し検証 | 14 | 全部 | HANDOFF の「手で確かめていない物」 |

新しいディレクトリ（仮、§7-22）: `src/app/screens/`（画面）、`src/app/bands.ts`（帯）、`src/app/play-runner.ts`（S2 のループ）、`src/results/`（自己ベスト・完走・称号・ストリーク。純関数）。既存の層に足す物: `src/input/chord-test.ts`（同時押しテスト）、`src/judge/calibration-tap.ts`（校正タップ）、`src/chart/keyset.ts`（鍵数制限の実行時フィルタ）、`src/chart/metrics.ts`（難度 4 軸）、`tools/charts/smf.ts`・`bundle.ts`（同梱曲の道具）。

## 2. 着手の順序

軸は §5.7 L300 のクリティカルパス M0-06 → **M1-03 → M1-04 → M1-14**。§5.2 の表は id 順だが、M1-01 の前提 U-03（同梱曲 10 曲と権利表）がまだ無く、S2 以後の全画面が帯と Pause（M1-13）を使うので、次の順にする（decisions #58、仮。§7-1）。一人開発では番号順。

| 手順 | M1 id | 規模 | 累積日 | 前提 |
|---|---|---|---|---|
| 1 | M1-02 入門者プロファイル | S | 1 | M0-06・07 |
| 2 | M1-13 帯と退避（起動・画面の骨組み・Pause・IME・S7d） | S | 2 | M0-04・09 |
| 3 | M1-03 プレイ画面 S2（動画なし形態） | M | 5 | M0-03b、手順 1・2 |
| 4 | M1-05 校正 段 1＋プレイ後提案 | M | 8 | M0-05・06、手順 2 |
| 5 | M1-06 結果 S3 | S | 9 | M0-06、手順 3・4 |
| 6 | M1-01 同梱曲 10 曲の譜面化 | M | 12 | M0-02、U-03（代替は §5） |
| 7 | M1-10 チュートリアル曲（実行時フィルタ 3 段階） | S | 13 | 手順 6 |
| 8 | M1-08 選曲 S1 | S | 14 | 手順 6・7 |
| 9 | M1-04 初回導線 S0a〜S0d | M | 17 | 手順 3・4・7、U-04（代替は §5） |
| 10 | M1-07 設定 S6 | M | 20 | M0-07・09、手順 4 |
| 11 | M1-11 称号・ストリーク・初クリア | S | 21 | M0-09、手順 5・8 |
| 12 | M1-12 計測盤 | S | 22 | M0-12、手順 10 |
| 13 | M1-09 PWA 化 | S | 23 | 手順 3・6・10 |
| 14 | M1-14 通し検証 | S | 24 | 1〜13、U-04・U-05 |

§5.2 との差: M1-13（←M0-04・09）を 2 番目に前倒し（帯と Pause は S2 の部品）。M1-01 を 6 番目に下げ、U-03 が遅れても手順 1〜5 は進む（S2・S3 は `tests/fixtures/charts/m1/` の 6 曲で確かめる）。M1-09 を手順 13 に置いたのは、precache に同梱曲が要り（§7-8）、更新の prompt が S6 に出る（ADR 0004）ため。累積は §5.2 のまま 24 日。

共通の手直し: m6 のグローバル `state`（L547–557）と `$()`（L540）→ 画面ごとの状態と層の純関数へ。m6 の見本の数値（精度 94.2%・自己ベスト・ストリーク 3 日・上限 3 など）→ 本物の記録から。Google Fonts（m6 L3–4）→ system-ui。m6 の `localStorage.getItem('hexnote.m6')`（L558）→ 保存層（旧鍵は移行済み、decisions #52 (f)）。m6 の色トークン（L7–15）は使わず、M0 の index.html の暗い配色（`--bg` `#111318`）を基にする（色に頼らない、decisions の既定値）。時刻は `src/app/` がハンドラの冒頭で読む `performance.now` を値で渡す（decisions #25・#32）。

### 手順 1: 入門者プロファイル（M1-02、S）

- 元: `src/judge/windows.ts` PROFILES（手順 8）、`src/storage/local.ts` defaultSettings（手順 11、decisions #52 (a)）、`src/render/hex/sizing.ts` TRAVEL_MS、m6 renderS6 の「着地と判定」L919、renderS2 L827。
- 作る: `src/app/profile.ts`（プロファイル → 判定の規則・流れる時間・辺ヒント・NEAR・ラベルの既定・HUD の項目を束ねる純関数。値は各層の定数から引き、ここに数値を書かない）。Settings v:1 に M1 の項目を足す（`hints`・`landing`・`audio {guide, metronome, keyclick, accompVolume}`・`fx {budget, lowload}`・`imeStop`。無ければ既定値なので版は上げない、decisions #52 (a)・#58）。accompVolume は伴奏の部の音量（#47 (d) の 0.45）に掛ける 0..1 の比で 1 が既定（当初 accompGain と書いたが §1.3 S6 の「伴奏の音量」に合わせて改名、仮）。
- 手直し: m6 の「プロファイル 切替」（L302・L916）→ M1 では隠す（§5.2 M1-08「プロファイル切替は隠す」。音ゲー向けは M2-05）。m6 S6 の「ガイド音 OFF・メトロノーム OFF・空打ち発音 ON」（L924）→ **ガイド音は ON**（decisions #48 は「正しい押下は鳴らさない（旋律を先読みで予約してあるため）」が前提なので、OFF だと入門者の正しい押下が無音になる。m6 の OFF は採らない、仮。§7-18）、メトロノーム OFF・空打ち発音 ON はそのまま（仮）。伴奏は常に鳴らす（§2.9）。ラベルの既定は m6 の 9 マス「既定 kk」（L886）・decisions #52 の key/key → **鍵盤側 key・ノート側 both**（§2.5 L131「入門者の both」、decisions #30 (d)「both（入門者の既定）」。§7-4 → decisions #60）。描画層のラベルは今は全体で 1 つの LabelMode（commands.ts の FrameInput.labels を鍵盤図と落ちるセルの両方に渡す、#41 の帰結）なので、鍵盤側／ノート側の 2 モードを受ける手直しは手順 3 で行う。settings の M1 の項目をここ（M1-02）で足すのは #52 (a)「M1-07 で足す」の読み替え（型と既定値だけ先に、画面は手順 10。decisions #58 の帰結）。
- 期待値: 入門者 ＝ 窓 24／100／180・遅れ側 ×1.3・NEAR 1・ゲージなし（PROFILES、検算済 手順 8）、流れる時間 1,500 ms、辺ヒント ON、着地 cell、上限の既定 2（decisions #7）、ラベル kb key／note both（仮）。defaultSettings に足した項目が無い旧 JSON を読んでも既定値で読める（parseSettings）。音ゲー向けの項目（ランク・ゲージ・コンボ・FAST／SLOW）は入門者の HUD の項目の表に無い。
- 完了条件: 「既定値が §2 と一致」（§5.2 L233）。
- 実際に取った手順（2026-10-31、手順 1、ブランチ `m1-01-profile`）: `src/app/profile.ts`（profileOf: 窓・NEAR・ゲージは PROFILES、流れる時間は TRAVEL_MS、辺ヒントは入門者だけ、着地 cell、上限の既定は `DEFAULT_CHORD_LIMIT`〔src/shared/types.ts に足した〕、ラベル、HUD の項目、failOnGauge。applyProfileDefaults は profile・labels・hints だけを入れ替え、着地など他の項目は利用者の選択を保つ）。`src/storage/local.ts` に M1 の項目と項目ごとの検査（parseAudio・parseFx）、`src/render/hex/landing.ts` に LANDING_MODES。音ゲー向けのラベル（鍵盤側 key・ノート側 key）は R2 の screens 草稿の写しで仮（M2-05）。「疑う」2 観点はワークフロー（読み手 2 人＋反証役 2 人）で回した: (a) 仕様適合は accompGain → accompVolume の改名が手順書に無かった（本書を直した）、(b) 変異 51 個のうち意味の変わる 4 個が残り（accompVolume の上限の境界 1、数でない値の強制変換、音ゲー向けのラベルの取り違え 2 つ）、それを落とす試験を足した。applyProfileDefaults が landing も戻す指摘は反証されたが、対照オプション（decisions #3）を利用者の選択として残す方が §1.3 S6 の「切替で既定値を一括」の読みとして安全なので外した。試験 823 → 832 件。

### 手順 2: 帯と退避、起動と画面の骨組み（M1-13、S）

- 元: m6 の帯 bandsHtml L790–803（同期中・動画なし・音待ち・IME・自動再生ブロック・保存できません）、S0 の IME 帯 L242、Pause の覆い L347–353、S7d L941、S1 の保存できません L307、keydown L1037–1044（Escape・Space）。M0: `src/input/focus.ts`（blur・iframe・hidden）、`ime.ts`（IME_BAND_TEXT）、`roles.ts`、`src/play/state.ts`（Pause 要求は冪等、#35）、`src/storage/fallback.ts`（S7d の文言 #50 (g)）、play-dev L691（一時停止中の Escape ＝ 中止）、`src/storage/session.ts`（isFirstRun）、`migrate.ts`。
- 作る: `src/app/bands.ts`（帯の状態 → 帯の列。種類: ime・storageFail・autoplayBlocked（M3 まで文言だけ）・lowLoad（§2.8 L143「自動で落とし帯で知らせる（仮、M-7）」。#29 (c) は段の勘定で帯は書かない）・audioLate（#47 (c)）。表示は矩形の外の「上帯の直下」1 か所）、`src/app/screens/pause.ts`（再開 Space／最初から／やめる）、`src/app/router.ts`（画面の切替。S3・S6 から S1 へ戻れる、§1.2）、`src/app/boot.ts`（保存層を開く → 旧鍵の移行 → 設定・校正・端末・α を読む → 初回なら S0、でなければ S1。失敗なら既定値＋S7d、§4.1「流れ」）。`src/main.ts` を製品の入口にし、開発ページの一覧は dev のときだけ残す。
- 手直し: m6 の帯は `#bands`（L338）で矩形の上 → 製品も同じ位置（矩形の外。§1.3 S2）。m6 の「閉じる」ボタン → IME 帯は演奏・役割の keydown で消える（decisions #26 (5)）ので「閉じる」は付けない。storageFail の帯は置き場ごとに 1 回（#50 (a)）、「閉じる」あり。Pause の覆い（m6 L347）は落下域の上に重なる → 矩形の外ならよい（覆うのは右列だけ）。「最初から」→ 動画なしは t0 から（時計の start）。「やめる」→ S1（記録は保存しない）。「IME 検知時に曲を止める」（S6、既定 OFF）→ ON のときだけ ime で Pause 要求。タブの切替は hidden と blur の 2 件（#35 (d)、冪等）。
- 期待値: ime の検知 → 帯 1 件、連打でも 1 件、演奏の keydown で消える（検算済 手順 5 の imeBand）。storageFail が localStorage で 2 回 → 帯 1 回（検算済 手順 11）。待機中の pause(iframe) → 待機のまま、再生中の pause → 一時停止、一時停止中の hidden＋blur → 一時停止のまま（検算済 手順 7、#35）。帯の DOM の矩形が `#player` の矩形と交差しない（dev ビルドの assert で getBoundingClientRect を比べる。機械検査は M3-01、仮）。
- 完了条件: 「各帯が矩形の外」（§5.2 L244）。
- 実際に取った手順（2026-10-31、手順 2、ブランチ `m1-02-bands`。手順 1 の `m1-01-profile` の上に積んだ）: 純関数 `src/app/bands.ts`（帯 5 種、閉じ方と開き直し、`bandOutside`）・`router.ts`（M1 の画面 S0・S1・S2・S3・S6 と §1.2 の遷移、S6 は来た画面へ戻る）・`boot.ts`（置き場を開く口を注入。IndexedDB を先に包み storageFail の行を telemetry へ）・`play-control.ts`（S2 の入力の振り分けと Pause の選択、imeStop）、DOM の `shell.ts`（画面の差し替え・帯・Enter で焦点のボタンを押す・dev の矩形の assert）と `screens/`（S0・S1・S3・S6 は骨組み、S2 は曲なしで動画なしの時計と状態機械だけを回し、Pause の覆いは右列だけ）、`styles.css`、`src/main.ts` を製品の入口に（開発ページの一覧は dev の S1 にだけ）。`src/app/dev/dom-input.ts` は `src/app/` へ移した。裁定は decisions #65: 作るの「表示は上帯の直下 1 か所」と手直しの「m6 と同じ矩形の上」は、S2 では右列が全高を使うので上帯が無く、矩形の上に置くと帯のたびに矩形が動くため、左列の矩形と HUD の下に 1 行で出す形に改めた（S2 以外は上帯の直下）。一時停止中の Escape は何もしない（play-dev の中止は採らない）。S2 は歯車を出さない。IME の帯の本文は m6 L800 のまま、imeStop が ON なら「曲は一時停止します。」。予約の遅れ・低負荷の帯の文言は自作（§7-18 に足す）。「疑う」2 観点はワークフロー（読み手 2 人＋反証役 2 人）で回した: (a) 仕様適合は IME の文言の欠落と台帳・#26 の実装パスの遅れ、(b) 正しさは目立った不具合なし、ただし内側 1093×514 で S2 の帯の場所が約 90 px しかなく 2 件目が隠れる（反証役は仕様違反ではないとしたが再現したので 1 行に詰めた）、変異 89 個のうち意味の変わる 18 個が残った（router の walk が終わりの画面しか見ない、帯の順を自分と比べる など）。試験を足し、残った変異と文言の変異 19 個を当て直して全部落ちることを確かめた。試験 832 → 883 件、初回読込 11,652 → 53,021 バイト。申し送り: 待機中の S2 から出る道は Space → Escape → やめる だけ（手順 3 で曲名と一緒に「ホームへ」を置くか決める）。

### 手順 3: プレイ画面 S2 動画なし形態（M1-03、M）

- 元: `src/app/dev/play-dev.ts` main L177–791（曲の読込は main の外の `loadSong` L100、ループ、押下 L654–691、終了 L748、計測 L537）、m6 S2 L326–358・renderS2 L805–831（左列: プレイヤー矩形 → 動画なしは「自前音源」のカード L819、HUD L821–822: 曲名・進行・精度%）、m1' drawHUD L437–440、m0 L122–124（480×270、下限 356×200）、design §1.3 S2・§2.5・§4.2。
- 作る: `src/app/screens/play.ts`（左列＝矩形の場所のカード＋HUD、右列＝canvas）、`src/app/play-runner.ts`（rAF 1 本: sessionTick → judgeClock → judgeSweep → collectFrame → buildFrame → flush。入力: attachKeyboard → sessionInput・judgePress／Release → audio の打鍵音。音: soundItems（melody は設定の guide、accomp は常に、click は metronome）→ pumpSchedule 25 ms。終了: 最終ノート＋1.2 s（END_TAIL_MS）→ S3 へ summarizeJudge と計測の play 行を渡す）、`src/app/hud.ts`。
- 手直し: m6 の canvas 高 380 固定（L138）→ 右列の箱を sizing で決める（decisions #24）。**動画なし形態の左列の幅**（#24 の未決）→ プレイヤーの既定 480×270 のまま、矩形の場所に音源のカードを置く（仮、§7-3。3 視口の R・v は M0 の値のまま。M3-02 の動画あり形態と同じ箱になる）。play-dev の曲・配列・着地・文字・低負荷の select → 設定とプロファイルから（開発用の切替は S2 に出さない）。play-dev の「読めるか」の記録（readability.ts）→ 製品には入れない。HUD の精度は summarizeJudge の acc（判定した音が無い間は「—」、仮）。描画層の `FrameInput.labels` を `{kb, note}` の 2 モードに分ける（commands.ts・cells.ts。鍵盤図は kb、落ちるセルは note。decisions #60。スナップショット #28 は両方 both で取り直さずに通ることを確かめる）。進行は t ／ 曲末（END_TAIL_MS を含まない）。m6 のランク・コンボ・ゲージ・ハイスピード・FAST／SLOW（L823–826）→ 音ゲー向けだけ（M2-05。型は PlayTelemetry・JudgeSummary.gamer にある）。音ゲー向けのゲージ 0 の途中終了も M2-05。
- 期待値（2026-10-31 検算済。`sizeForViewport` と `visibleMs` で計算）: 3 視口（内側 1366×668／1280×620／1093×514）で ableton R 28・v 0.3587／0.3267／0.2560・最下段の可視時間 1,695／1,714／1,773 ms、vmpk R 28／28／27・v 0.3027／0.2707／0.2043・最下段 2,009／2,069／2,227 ms。全て R ≥ 24 かつ最下段 ≥ 1,500 ms（limited null）。一時停止 → 再開で、再開の猶予 300 ms に窓が終わる音は skipped（miss でない）、猶予の後に着地する最初の音は普通に判定（検算済 手順 8 の graceEnd と skipped）。曲末 ＋1.2 s で chartEnd（検算済 手順 13 の runAutoplay）。
- 完了条件: 「3 視口で最下段の着地まで 1.5 s 以上かつ R≥24」（§5.2 L234）。手弾きで 6 曲（フィクスチャ）を S2 で通す。

### 手順 4: 校正 段 1＋プレイ後提案（M1-05、M）

- 元: m3 `startCal` L435–448（100 BPM ＝ 600 ms、N ＝ 28 で先頭 4 つは measured false、クリックの perf 時刻は getOutputTimestamp で換算 L442–445 → M0 の audio-bridge #37）、`calTap` L449–451（最も近いクリック、|d| ≤ 300、measured で未 hit だけ）、`finishCal` L454–457（24 打未満は不足、SD < 30 で −平均を ±120 に丸めて適用、以外は拒否）、`onEnd` L396（段 2）、m6 S0c L269–281（音のテスト。結果の文言「平均 −18 ms、ばらつき 12 ms。適用します」は calibsim L959）、S3 の提案帯 L381–384、S6 L921。M0: `src/judge/calibration-offset.ts`（tapOffset・proposeOffset。検算済 手順 8）、`src/audio/metronome.ts`、`src/storage/local.ts`（saveCalibration）、`src/telemetry/rows.ts`（calibRow）。
- 作る: `src/judge/calibration-tap.ts`（クリックの予定（予備 4＋24）、タップの対応付け、進捗、中止、終わりの判定を純関数で）、`src/app/calibration-panel.ts`（S0c と S6 で同じ部品: 音のテスト → 「聞こえる／聞こえない」→ 24 打 → 結果の文言。メトロノームは音源層で予約し、クリックの実時刻は audio-bridge で出す）。S3 の提案帯（手順 5 で置く）: proposeOffset の verdict が ok なら「適用／今回は見送る」、適用で saveCalibration(audio, via propose)。calib 行は段 1・段 2 とも書く（#55 (a)）。母集団は通常プレイだけ（固定テンポ・1.0・全鍵。チュートリアルの段階 1・2（keyset ≠ all）は入れない）。
- 手直し: m3 の `S.offset − m`（L456、前のオフセットを引かない二重引き）→ 段 1 は生の誤差から −平均（#40 (b)）。m6 の提案「平均 −12 ms → オフセット −12 ms を適用しますか」（L383–384）→ 符号は #40 (c)「提案 ＝ 使ったオフセット − 平均」で **＋12**（早押しの人の押下を遅く読む）。文言は「平均 −12 ms（少し早め）→ オフセットを ＋12 ms にしますか」（§7-6）。m3 の「A 段のキーか Space」（L448）→ Space だけ（§2.8 役割キー「Space＝校正タップ」。演奏の鍵は押下集合に入れず捨てる、仮）。「聞こえない」→ 校正せず未校正の印（S1 の上帯「未校正」）。
- 期待値: 24 打が全て ＋18 → 平均 18・SD 0 → オフセット −18（tapOffset、検算済 手順 8）。SD 41 → 拒否（reason sd）、23 打 → 不足（reason count）。段 2: 正しい鍵の dt の平均 −12・n 118・SD 21・使ったオフセット 0 → 提案 ＋12（proposeOffset）。タップがクリックから 310 ms → 対応しない、クリック 0〜3（予備）への タップ → 数えない、同じクリックへの 2 つ目 → 捨てる（m3 calTap、仮）。
- 完了条件: 「SD≥30 で拒む。提案ゲート 3 条件」（§5.2 L236）。

### 手順 5: 結果 S3（M1-06、S）

- 元: m6 S3 L360–393・renderS3 L833–869（見出し「結果」「練習の結果」「途中終了」、内訳の行 L849、自力率の帯 selfRateHtml L612–617、和音「同時押しが合った割合」L374、ずれ「平均 −12 ms（少し早め）」L383、苦手区間「17〜18 小節」L386、称号 L859–868）、m1' finish L358–365（resChords は塊／殻／段またぎ → 音ゲー向け、resAdvice の ±25 ms → 提案ゲートに置き換え）。M0: `summarizeJudge`（acc・rank・counts・skipped・selfRate・meanMs・ur・hist・nearRate・holds・maxCombo）。
- 作る: `src/app/screens/result.ts`、`src/results/record.ts`（JudgeSummary ＋ 曲・譜面版・プロファイル・clock・mode・rate・keyset・syncUsed・offsetUsed → ResultRecord。id は crypto.randomUUID、仮）、`src/results/analysis.ts`（苦手区間 ＝ miss が最も多い連続 2 小節（timeSig から小節を数え、1 始まり）、同時押しが合った割合 ＝ 同じ tick に 2 音以上ある拍のうち構成音を全て当てた拍の割合。純関数）。保存: results に put（#51）、telemetry の play 行と calib 行（手順 4）。
- 手直し: m6 の見本の数値 → 本物。「練習室で弾く」（L387）→ M2-03 まで出さない。「もう一度」→ 同じ譜面版で S2。音ゲー向けの節（L375–379・L850）→ M2-05。「途中で動画なし」の帯（L363）と動画の注記 → M3。称号の節（L389）→ 手順 11。内訳の言葉は ぴったり／よい／おしい／となり／はずれ（#31 (e)）、NEAR は「となり（隣のキー）」。「成績の比較は同じ譜面版の中だけ」の文言と譜面版 id（例 ableton/2/octave）を結果の見出しに出す（完了条件）。skipped > 0 の回（kickoff §7-26）→ 記録は残し、完走・自己ベストの対象外にし「中断あり」と注記（decisions #63）。取り込み（file.ts の parseResult、#53 (d)）で skipped が無い旧い記録は 0 と読む（#63）。
- 期待値: acc 0.5 → C（検算済 手順 8）。meanMs −12 → 「少し早め」、＋12 → 「少し遅め」、|mean| < 5 → 「ちょうど」（仮）。苦手区間: 4/4・resolution 240 で miss が拍 64〜71 に集中 → 「17〜18 小節」（仮）。和音 18 拍のうち 14 拍が全部当たり → 78%（m6 L374、仮）。skipped 0・mode fixed・rate 1・keyset all → 完走。
- 完了条件: 「同じ譜面版だけで比較する旨が画面にある」（§5.2 L237）。

### 手順 6: 同梱曲 10 曲の譜面化（M1-01、M。U-03 の後）

- 元: `tools/charts/{mel-songs,mel-fixtures,from-mel}.ts`（手順 3。mel 形 → /1 → 4 版）、`src/chart/variants.ts` BUNDLED_VARIANT_SPECS（ableton×{2,3}・vmpk×{2,3}、fold octave、decisions #23）、m5 `parseMidi` L263–314（SMF の読み取り。M2-01 へ送っていた物を道具だけ前倒し、§7-2）、`content/charts/RIGHTS.md`・`rights.json`（ADR 0005 の 8 欄）、`tools/charts/check-rights.ts`、`tools/size/check-initial-load.ts`（decisions #49）、m6 SONGS L563–576（10 曲の見本: はじめの六角（自作、チュートリアル）・きらきら星・歓喜の歌・メヌエット ト長調・グリーンスリーブス・春の歌・ジムノペディ 第 1 番・エリーゼのために（冒頭）・カノン・ヘクサ・ワルツ（CC0）。§2.9 のとおり同梱曲は 10 曲 ＝ チュートリアル 1 曲＋入門 9 曲で、入門の 9 曲を U-03 が決める）。
- 作る: `tools/charts/smf.ts`（SMF 形式 0／1 の note on/off・tempo・timeSig だけ。vel は 0–127 の整数のまま、kickoff §7-22）、`tools/charts/bundle.ts`（SMF か mel → 弾くトラック 1 つ＋伴奏トラック → notes・accompaniment・pulse → `buildVariants` で 4 版（チュートリアル曲は ableton/2/octave の 1 版だけ。§1.3 S0d「常に Ableton 型」）→ `src/chart/metrics.ts`（ここで作る。定義は §7-9、手順 8 の S1 が使う）で難度 4 軸 → validateChart → `content/charts/<pd|cc|own>/<id>.json`。source は rights と license を権利表から）、`content/charts/tutorial/hajime.json`（手順 7 の曲。own）、rights.json の 10 行（チュートリアル 1 曲＋入門 9 曲）。npm script `charts:bundle`。
- 手直し: from-mel の 6 曲は試験のフィクスチャのまま（製品の同梱曲にしない。曲として足すのは U-03 の判断）。間引き・同音・fold は decisions #20〜#23 のまま。accompaniment の音は原曲音高（#47 (a)）。同梱曲の譜面に sync.sources は空（動画 ID なし、#13）。
- 期待値: 入門 9 曲 × 4 版＋チュートリアル曲 1 版 ＝ 37 版が `npm run charts:validate` を通る（notes 1 つ以上、同拍同音なし、keys の長さ ＝ notes）。rights.json の欠け 1 件で `npm run charts:rights` が fail（M0-01 の道具。単体試験は無いのでここで足す）。難度 4 軸（§7-9）の検算はフィクスチャ 6 曲の密度（手順 8 の表）。PD は checkedOn の年 − 没年 > 70（ADR 0005）。SMF: 形式 0 の 2 音（on 60 vel 100 @0、off @480、on 64 @480、off @960、tempo 500000）→ notes [{60,0,1,100},{64,1,1,100}]、tempo [{0,120}]（仮）。初回読込 ＝ 殻＋チュートリアル曲 1 曲 ≈ 11,652 ＋ 数十 KB ≤ 10 MB（決定 #10・#49。測り直した値を docs に書く）。
- 完了条件: 「10 曲×4 版が通り権利表 6 欄が揃う」（§5.2 L232）。

### 手順 7: チュートリアル曲と実行時フィルタ（M1-10、S）

- 元: m6 S0d L283–294（3 段階「1 音（D だけ）」「ホームポジション（D F J K）」「全鍵」、吹き出し 3 つ L289–291）、renderS0 L734（keyset の Set でセルを間引く）、design §1.3 S0d・§3.2「鍵数制限は variant を増やさず実行時フィルタ（results.keyset）」、decisions #17（本体は M1-10）。
- 作る: `src/chart/keyset.ts`（keyset の id → 鍵の集合: `d`（KeyD）・`dfjk`・`8`（A S D F J K L Semicolon）・`all`。譜面版の keys がその集合に無い音を外した FrameNote／JudgeNote の列を返す純関数。results.keyset に id を書く）、チュートリアル曲「はじめの六角」（自作・own・Ableton 型・上限 2・`content/charts/tutorial/`。段階 1 は KeyD（E4）だけの音で成り立つ旋律に作る、仮）。S0d は S2（手順 3）に keyset と吹き出しを渡して 3 回流す。
- 手直し: §1.3 S0d の「音待ち固定」→ **M1 は固定テンポ**（待ちは練習層 M2-03。§4.2「待ち（S4 のみ）」）で、曲を遅いテンポ（60 BPM・音の間隔 2 拍、仮）に作って代える（§7-5）。m6 の「模擬: 次の段階へ」→ 各段階の曲末で自動で次へ。段階 1・2 は keyset ≠ all なので練習記録（自己ベスト・提案の母集団・完走に入らない、§2.3「成績の対象」）、段階 3 だけが通常プレイ。
- 期待値: `dfjk` で keys が KeyD／KeyF／KeyJ／KeyK 以外の音が消え、消えた音は判定にも描画にも出ない（miss にならない）。`all` は何も消えない。同じ chartId・variantId（ableton/2/octave）から keyset だけが違う 3 段階が出る。段階 1・2 の ResultRecord は keyset が `d`・`dfjk` で自己ベストに入らない。
- 完了条件: 「1 曲から 3 段階が派生」（§5.2 L241）。

### 手順 8: 選曲 S1（M1-08、S）

- 元: m6 S1 L298–324・renderS1 L748–788（上帯 L301–306、曲カード L757–767: 曲名・完走印・出どころ・BPM・長さ・音源の印・難度 4 軸の棒・自己ベスト・譜面版、譜面版の選択 L315–322: 配列×上限×動画、版が無いときの文言 L784–786、上限の注記 L771）、visibleSongs L738–747（並び: おすすめ ＝ 密度の低い順 → 長さ、曲名、長さ）、design §1.3 S1・§2.4 難度指標・§4.3 自己ベストの単位。
- 作る: `src/app/screens/home.ts`、`src/chart/metrics.ts` は手順 6 で作る（密度 ＝ 譜面版で鍵のある音（keys が null でない）の数 ／ 曲の長さ（譜面の最終ノートの終わりの秒。落ちた音も含む）、跳躍 ＝ 隣り合う音の鍵の六角距離の最大（leapMax）と平均（leap）、同時押し率 ＝ 2 音以上の tick ／ tick の数、段またぎ率 ＝ 隣り合う音で段が変わる組 ／ 組の数。譜面版ごとに計算して Variant.metrics に書く。仮、§7-9。kickoff §7-21 を閉じる）、`src/results/best.ts`（自己ベスト ＝ (chartId, variantId, profile, clock) で mode fixed・rate 1・keyset all・skipped 0 の回の acc の最大、完走 ＝ 同じ条件の回が 1 つ以上）。端末に合う版の自動選択（§7-10）: 配列は設定の layout、ただし ableton 版に落ちる音（keys null）があり vmpk 版の方が少なければ vmpk を推奨して先頭に。上限は 2 を選び、端末の上限（device.limit）までは選べる（3〜4 の版に「保証なし」の注記 L771）。
- 手直し: m6 のプロファイル切替（L302）・「曲を持ち込む」（L312）・持ち込みと動画のフィルタ（L311）・動画を使うかの切替（L319）→ M1 では隠す（M2-05・M2-01・M3）。ストリーク（L754）→ 手順 11。m6 の「端末の上限 3（同時押しテスト済み）」→ device が無ければ「未診断（2）」。
- 期待値（密度は 2026-10-31 に node で検算、フィクスチャの 6 曲・ableton/2/octave の keys で数える）: canon 1.20（34 音／28.421 s。null 17 を除く）・twinkle 1.40（42／30.000）・ode 1.70（30／17.679）・duet 2.29（22／9.600。null 1 を除く）・chroma 2.98（25／8.400）・scale 3.67（33／9.000）音/秒 → おすすめの並びは canon・twinkle・ode・duet・chroma・scale（S1 は自動選択した譜面版の密度で並べる）。duet の ableton 版は null 1・vmpk 版は null 0 → 推奨は vmpk（仮）。端末の上限 2 → 版 3・4 は選べない、上限 3 → 4 だけ選べない。自己ベストはプロファイル×譜面版で、keyset `dfjk` の回は入らない。チュートリアル曲は ableton/2 だけ（L786）。
- 完了条件: 「端末に合う版が自動選択」（§5.2 L239）。

### 手順 9: 初回導線 S0a〜S0d（M1-04、M）

- 元: m6 S0 L238–296（S0a L244–256: 鍵盤図・刻印 JIS／US・試打欄・折り畳みの VMPK・「これで始める」「あとで」、S0b L258–267: 10 組・進捗・点灯・保持バー・文言 L264、S0c L269–281、S0d L283–294）、renderS0 L721–735、ACT s0next／s0later L955–957（S0d の「あとで」は S3 を飛ばして S1）、diagsim L958（模擬の進み。「矩形で 1 組落ち → 上限 3」の文言は renderS0 L727）、design §1.3 S0・§2.4 診断 10 組、decisions #26（最初の keydown が 229 → ime）、#43（刻印）、#52 (c)(e)（device・booted）、#55 (b)（device 行は診断を保存したとき）、`src/telemetry/rows.ts` onboardRow。
- 作る: `src/input/chord-test.ts`（10 組: 同段 [Z X C][A S D][Q W E]、3u [A D G][S F J][D G K]、矩形 [Q W A S][E R D F]、両手 [A S K L][Z X Comma Period]。合否: 押下集合がちょうどその組になった keydown の tsPerf から 1,000 ms 続いたら通過、集合が崩れたら（余分な鍵・離し）その組は落ち、10 秒で揃わなければ落ち（ゴースト）。結果: 同段 3 組＋和音 3 組が全部通れば 3、さらに矩形 2 組＋両手 2 組も通れば 4、同段か和音が 1 組でも落ちれば 2。229 → ime で同じ組をやり直し。純関数、仮 §7-13）、`src/app/screens/onboard.ts`（4 段＋「あとで」。各段の到達・秒・離脱を onboard 行に（step S0a〜S0d、left は「あとで」とスキップ）、終わりに device を保存して device 行（#55 (b)）と booted）。S0a は legendOf（getLayoutMap → JIS／US）と鍵盤図（keyboardCommands）、試打欄は文字の欄なので入力層に通さず（#26）その欄の keydown で同じ文字のセルを光らせるだけ。S0c は手順 4 の部品。S0d は手順 7。
- 手直し: 「スキップ（2 つのまま）」と「あとで」→ limit 2 のまま device を保存（上限が上がるのは診断通過だけ）。S0a の「別の配列（VMPK 型）」→ settings.layout にだけ効き、S0d は Ableton 型のまま（§1.3）。S0b・S0c は canvas（S0b は組の表示の要素）へフォーカスを移し、ボタンは Enter だけで押せる（§1.3）。初回の S3 は「練習室で弾く」を隠す（M1 はもともと無い）。
- 期待値: 6 組通過＋矩形 1 組落ち → 3（m6 L727）、10 組通過 → 4、同段 1 組落ち（他は全部通過）→ 2、999 ms で離す → 通過でない、余分な鍵 → 落ち、最初の keydown が 229 → ime 1 件で同じ組のまま（検算は tests-inventory に写してから）。IME ON の間も S0b は止まらず帯だけ（完了条件）。4 段とも「あとで」→ 設定は既定値、device.limit 2、未校正、S1 に入る（m6 L957）。isFirstRun は device があれば偽、booted があれば偽（検算済 手順 11）。
- 完了条件: 「IME ON で S0b が止まらない。上限が上がるのは診断通過時だけ」（§5.2 L235）。目標 5 分は手順 14 で測る（onboard 行の秒）。

### 手順 10: 設定 S6（M1-07、M）

- 元: m6 S6 L520–525・renderS6 L907–931（群: プロファイル・配列・幾何・着地と判定・同時押し・校正・ラベル 9 マス・色と演出・音・入力・計測盤・データ・クレジット）、design §1.3 S6、decisions #42（段ずれ）・#43（刻印）・#45（幾何。(d) physical の描画は M1-07）・#29 (c)（低負荷は自動で上げない。戻すのは S6）・#52（settings）・#53（取り込み）、ADR 0004（SW の更新 prompt は S6）、`src/app/dev/layout-dev.ts`（段ずれの入力と位相の表）、`src/app/dev/storage-dev.ts`（控えの往復）。
- 作る: `src/app/screens/settings.ts`（各群 → settings の項目。「既定へ戻す」→ defaultSettings）。幾何 physical の描画（鍵盤図の x を段ずれでせん断。`src/render/hex/grid.ts` に physX を渡す、#45 (d)）。「テストをやり直す」→ 手順 9 の S0b の部品。校正 → 手順 4 の部品＋現在のオフセット（audio だけ。youtube は M3-08）。データ: 記録の削除（results を空に）、控えの書き出し／取り込み（file.ts。取り込みで設定を上書きするかは聞く、#53 の未決、仮）、端末プロファイルの初期化（device を消し booted を消して S0 へ）。クレジット: Salamander（ATTRIBUTION.md の内容）、同梱曲の権利表（rights.json を表に）。SW の更新（手順 13）。
- 手直し: m6 のプロファイル切替・「対照 W–H」（L917。同梱曲に版が無い、#23）・判定窓の変更（L919。定数、kickoff §7-11）・持ち込み曲の削除と版の作り直し（L927。M2）→ M1 では出さない（§7-11）。色（L923 の 4 択）→ 標準／グレースケール確認の 2 値（M0 の描画は明度と色相の判定色だけ、仮）。演出の予算（標準／控えめ／なし）→ budget.ts の FLASH_MAX を 3／1／0 に（仮）。低負荷（自動／ON／OFF）→ lowload の段を 自動／3 固定／0 固定。
- 期待値: 設定を変えても自己ベストの鍵 (chartId, variantId, profile, clock) は変わらない（ラベル・辺ヒント・着地・幾何・刻印・音・演出を変えて同じ記録が引ける）。上限を変えると譜面版が変わり別の鍵になる。「既定へ戻す」→ defaultSettings と一致。端末の初期化 → isFirstRun 真。知らない項目の JSON → 既定値（検算済 手順 11 の parseSettings）。低負荷 ON → 段 3 で閃光・殻・奥行きが消える（検算済 手順 6 の lowLoadEffects）。
- 完了条件: 「設定を変えても記録が混ざらない」（§5.2 L238）。

### 手順 11: 称号・ストリーク・初クリアの集計（M1-11、S）

- 元: design §4.4（対象プレイ ＝ syncUsed.kind audio かつ fallbackAt 無し。完走・初クリア・ストリーク・称号 4 つ。S1 のカードは称号印を持たない）、m6 renderS3 の称号の節 L859–868（「初クリア」「3 日連続」「同梱 10 曲完走まであと n 曲」）、S1 の上帯 L754（ストリーク）、`src/storage/idb.ts` の index best（#51）。
- 作る: `src/results/awards.ts`（isTargetPlay・isFullRun・firstClear（譜面版ごとの最初の完走）・streakDays（対象プレイがある端末のローカル日付の連続）・titles（初クリア／3 日連続／7 日連続／同梱 10 曲完走）。全て ResultRecord の列からの純関数）。S3 にこの回で得た称号とストリーク、S1 の上帯にストリーク。
- 手直し: ResultRecord に `skipped`（数）を足す（§7-7。完走は skipped 0 の回）。m6 の「同梱 10 曲完走まであと 6 曲」→ 同梱曲（source.kind bundled。§2.9 の 10 曲はチュートリアル曲を含む）の chartId の集合で数える（チュートリアル曲は段階 3〔keyset all〕の完走だけが数に入る、仮）。
- 期待値: audio・fallbackAt 無し → 対象、video → 対象外（M1 では型だけ）。mode fixed・rate 1・keyset all・skipped 0 → 完走、keyset `dfjk` → 完走でない。同じ譜面版の 2 回目の完走 → 初クリアでない。ローカル日付 10/29・10/30・10/31 に対象プレイ → 3 日連続、10/29・10/31 → 1 日、同じ日に 2 回 → 1 日。10 曲の chartId で完走 → 「同梱 10 曲完走」、9 曲 → 無し。
- 完了条件: 「対象プレイだけが集計される」（§5.2 L242）。

### 手順 12: 計測盤（M1-12、S）

- 元: `src/app/dev/telemetry-dev.ts`（行の一覧・種類ごとの数・書き出し）、`src/telemetry/export.ts`、m6 S6 の計測盤 L926（「貯まった行 n 行（リング 1,000 行。初版は送信しません）」「JSON で書き出す」）、design §4.6。
- 作る: S6 の群「計測盤」（countByKind の表、最近の行 20 件、telemetryFileName で書き出し）。
- 期待値: 1,001 行目で先頭が消える（検算済 手順 12）。書き出しは hexnote-telemetry/1 の {format, exportedAt, rows}（検算済 手順 12）。
- 完了条件: 「自分の行が見え書き出せる」（§5.2 L243）。

### 手順 13: PWA 化（M1-09、S）

- 元: `vite.config.ts`（VitePWA generateSW・prompt・precache 殻＋チュートリアル曲・runtime cache-first、ADR 0003・0004）、`public/manifest.webmanifest`、`tools/size/check-initial-load.ts`（decisions #49）。
- 作る: `src/app/sw-register.ts`（`virtual:pwa-register` の registerSW、needRefresh を S6 と S3 の「更新」ボタンに。プレイ中は適用しない、ADR 0004）。precache を同梱曲 10 曲（チュートリアル曲を含む）に広げる（§7-8、decisions #64。初回読込の数え方 #49 は殻＋チュートリアル曲のまま）。オフラインの確かめ（DevTools の offline で S1 → S2 を 10 曲）。
- 手直し: ADR 0004 の「runtime cache-first は `/content/charts/*.json`」→ 同梱曲は precache、持ち込み曲（M2）は IndexedDB なので runtime の規則は音源（opus）だけに（仮）。Salamander は実物が無いので合成音のまま（オフラインでも鳴る）。
- 期待値: build の sw.js の precache に `content/charts/**/*.json` の 10 件がある。`npm run size` は殻＋チュートリアル曲のまま。manifest は standalone・landscape・icons 192／512／svg（M0-01 のまま）。
- 完了条件: 「オフラインで 10 曲」（§5.2 L240）。

### 手順 14: 通し検証（M1-14、S）

- 元: design §5.2 M1-14（Chromium＋Firefox、3 視口、実機 2 台）、§6.3 M-2〜M-4・M-7・M-11、docs/HANDOFF.md の「手で確かめていない物」（手順 8 の曲の終わり・ホールドの早離し、手順 10 の音と主スレッドの 75 ms 停止、U-01 の位相、手順 11 の容量超過とプライベートウィンドウ、手順 12 の書き出し、手順 14 の Firefox 列）、spikes/coep-youtube（Firefox 列は U-05 で埋める）。
- 作る: `docs/planning/m1-verification.md`（視口×ブラウザ×曲の表、初回導線の所要秒、コンソールの出力、見つけた物と直し）。tests-inventory の「M1 手順 14」の行。
- 期待値: コンソールのエラー 0。初回導線 S0a〜S0d の onboard 行の秒の和 ≤ 300（M-4 の到達も見る）。3 視口で R・v が手順 3 の表のとおり（1093×614@125% は U-05 の端末）。Firefox の timeStamp の刻み（tsResolution）と入力遅延の中央値を device・play 行から読む（M-2）。
- 完了条件: 「エラーなし。初回導線 5 分以内」（§5.2 L245）。

## 3. 記録の形の追加（型は手順 1 で固定する）

| 物 | M0 の形 | M1 で足す物 | 決定 |
|---|---|---|---|
| `hexnote.settings` v:1 | profile・layout・fold・legend・geometry・stagger・staggers・labels（#52 (a)） | hints・landing・audio {guide, metronome, keyclick, accompVolume}・fx {budget, lowload}・imeStop。版は上げない | 手順 1（型と既定値。画面は手順 10。decisions #58 の帰結） |
| ResultRecord | §4.3 の 15 項目 | `skipped`（数。完走・自己ベストは 0 の回だけ。取り込みで無ければ 0）。途中終了（M2-05）の `aborted` は M2 | decisions #63 |
| Variant.metrics | 型だけ（§3.2） | density・leap・leapMax・chord・rowCross（同梱曲の各版に書く） | §7-9（手順 6 の着手時） |
| telemetry onboard／quit | 型だけ（rows.ts） | S0a〜S0d の step・seconds・left | 手順 9 |
| 入門者のラベルの既定 | kb key／note key（#52） | kb key／note both | decisions #60 |

## 4. M1 で作らない物

| 物 | モック | 理由・行き先 |
|---|---|---|
| S4 練習室（待ち・ループ・テンポ段・足場外しの表示・鍵数制限の UI） | m6 L395–452・L871–891 | M2-03・M2-04・M2-07。α は判定層にある（#41 (c)）が描画のラベルの透明度は M2-04 |
| S5 曲の持ち込み | m6 L454–518・L893–905 | M2-01（SMF の読み取りは手順 6 で道具だけ前倒し、decisions #59） |
| S2 の動画あり形態、S7a・S7b・S7c、自動再生ブロック、「戻す」 | m6 L792–797・L933–944 | M3-01〜05。帯の文言は手順 2 に置いておく |
| 音ゲー向け（HUD のランク・ゲージ・コンボ、S3 の FAST／SLOW・ヒストグラム・塊／殻／段またぎ、途中終了） | m6 L823–826・L375–379・L850 | M2-05。型（JudgeSummary.gamer・PlayTelemetry）は M0 にある |
| プロファイル切替、「既定へ戻す」の切替の効き | m6 L302・L916 | M2-05（§5.2 M1-08「隠す」） |
| 対照 W–H の選択、判定窓・離し窓の変更 | m6 L917・L919 | 同梱曲に W–H の版が無い（#23）。窓は定数（kickoff §7-11） |
| ヒートマップ | m6 L432–447 | M4-04 |
| トースト | m6 L191・L590 | 通知は帯だけ（§1.3 S2） |
| 校正 段 2 の youtube 側の保存、オフセット（YouTube）の行 | m6 L921 | M3-08 |
| 同梱曲への動画 ID、「動画あり／なしで遊べる」印 | m6 L763・L770 | 初版は無し（#13）。印は「自前音源」だけ |

## 5. 手元作業との同期

| 作業 | 使う手順 | 要る日（直列） | 遅れたときの代替 |
|---|---|---|---|
| U-03 同梱曲の入門 9 曲と権利表（§2.9 の 10 曲 ＝ チュートリアル 1＋入門 9。ADR 0005 の 8 欄。MIDI か楽譜） | 手順 6（M1-01）、手順 8・13 | 10 日目 | チュートリアル曲（自作）＋ フィクスチャのうち PD の 2 曲（きらきら星・歓喜の歌。arrangerDied `-`、source は mel-songs.ts の手採譜）を暫定の同梱曲に置き、道具と S1・PWA を通す。9 曲は手順 14 の前に差し替え、rights.json・初回読込を測り直す |
| U-04 同時押しテストの実機（2 台以上） | 手順 9（M1-04）、手順 14 | 17 日目 | 主担当の端末の結果だけで進め、分布（M-3）は手順 14 で |
| U-05 Firefox・実機 2 台・125% 端末 | 手順 14 | 24 日目 | Chromium で先に通し、Firefox 列（tsResolution・COEP の spike）は M1 末に |
| U-01 段ずれの実測（M0 から持ち越し） | 手順 10（S6 の段ずれ）、M-1 | 20 日目 | ANSI 1/2・1/4・1/2 のまま。実測は layout.html の JSON で受け取り settings.stagger に入れる |

U-03 は M1 初日から。U-03 の MIDI が無く楽譜だけの曲は、mel 形（`tools/charts/mel-songs.ts` の形）で手採譜する（道具は両方を読む、手順 6）。

## 6. M1 の出口

M2・M3 に渡す物: `src/app/`（起動・画面・帯・Pause・S2 のループ・校正の部品・HUD。S4・S5 の画面はここに足す）、`src/results/`（自己ベスト・完走・称号・ストリーク。M3-06 の syncUsed の切り分けはここで試験する）、`src/chart/keyset.ts`・`metrics.ts`（M2-07 の鍵数制限の汎用版、M2-01 の指標）、`tools/charts/smf.ts`・`bundle.ts`（M2-01 の S5 が `src/chart/smf.ts` に移す）、`content/charts/` の 10 曲（チュートリアル 1＋入門 9）と rights.json（M4-03 の拡充は同じ道具）、settings v:1 の M1 の項目、ResultRecord の `skipped`、PWA（precache 10 曲）、`docs/planning/m1-verification.md`（3 視口×2 ブラウザの結果と Firefox の刻み）、tests-inventory の「M1 手順 1〜14」の行。

## 7. 未決と設計書への提案

採否は利用者（手順 1 の前に見せた）。採った物は decisions.md #58〜#64 と design.md §5.2 の注記に書いた（M0 の決定 #17 と同じ形）。残り（3・9〜22）は各手順の着手時に主担当が裁定し、decisions #65 以降に書く。

1. **順序の手直し**（提案）: M1-13 を 2 番目、M1-01 を 6 番目、M1-09 を 13 番目に（§2 の表）。累積 24 日は変えない。U-03 の代替は §5。→ 2026-10-31 主担当の裁定で decisions #58（仮）、design §5.2 に注記。
2. **SMF の読み取りを道具だけ前倒し**（提案）: M2-01 に送っていた m5 `parseMidi` L263–314 を `tools/charts/smf.ts` として手順 6 で書く（形式 0／1、note on/off・tempo・timeSig だけ。vel は 0–127 の整数のまま、kickoff §7-22）。製品の S5（UI・トラック選択・試聴）は M2-01 のまま。M2-01 で `src/chart/smf.ts` に移す。→ 2026-10-31 利用者が採用（decisions #59。m0-kickoff.md §4・design §5.3 に注記）。
3. **動画なし形態の左列の幅**（decisions #24 の未決、手順 3）: プレイヤーの既定 480×270 のまま、矩形の場所に音源のカードを置く。3 視口の R・v は M0 の値（§2 手順 3 の表）のまま、M3-02 の動画あり形態と同じ箱。仮。
4. **入門者のラベルの既定**（手順 1）: decisions #52 (a) の labels key/key（m4 L298 の写し）と §2.5 L131・decisions #30 (d) の「入門者の both」が食い違う。鍵盤側 key・ノート側 both を入門者の既定にし、#52 を改める。→ 2026-10-31 利用者が採用（decisions #60。design §2.5 に注記）。
5. **S0d の音待ち**（手順 7）: §1.3 S0d「音待ち固定」は練習層（M2-03）が要る。M1 は固定テンポで、チュートリアル曲を遅く（60 BPM・間隔 2 拍）作って代え、M2-03 の後に音待ちへ戻す。§4.2「待ち（S4 のみ）」と §1.3 S0d の折り合いは design.md に注記する。→ 2026-10-31 利用者が採用（decisions #61。design §1.3 S0d に注記）。
6. **校正の提案の符号**（手順 4）: m6 L383–384 の「平均 −12 ms → −12 ms を適用」は decisions #40 (c)（提案 ＝ 使ったオフセット − 平均 ＝ ＋12）と逆。#40 を正にし、文言を「平均 −12 ms（少し早め）→ オフセットを ＋12 ms にしますか」にする。→ 2026-10-31 利用者が採用（decisions #62。design §2.7 に注記）。
7. **skipped > 0 の回と ResultRecord**（kickoff §7-26、手順 5・11）: 記録は残し、完走・自己ベスト・初クリアの対象外にして「中断あり」と注記する。ResultRecord に `skipped`（数）を足す（§4.3 を改訂）。途中終了（ゲージ 0、M2-05）の印は M2-05 で足す。→ 2026-10-31 利用者が採用（decisions #63。design §4.3・§4.4 を改訂、m0-kickoff.md §7-26 を閉じた）。
8. **同梱曲の precache**（手順 13、ADR 0003・0004 の改訂）: 完了条件「オフラインで 10 曲」は cache-first（一度読んだ物だけ残る）では満たせないので、同梱曲 10 曲（チュートリアル曲を含む。§2.9）を precache にする（数十〜数百 KB）。初回読込の数え方（#49: 殻＋チュートリアル曲）は変えない。音源（opus）は runtime のまま。→ 2026-10-31 利用者が採用（decisions #64。ADR 0003・0004 を改訂。当初「11 曲」と書いたのは §2.9 の「10 曲 ＝ チュートリアル 1＋入門 9」の読み違いで、10 曲に直した）。
9. **難度 4 軸の定義**（手順 6 で作り手順 8 で出す。§2.4 は名前だけ。kickoff §7-21）: 密度 ＝ 譜面版で鍵のある音（keys が null でない）の数 ／ 曲の長さ（秒。譜面の最終ノートの終わりまで、落ちた音も含む）、跳躍 ＝ 隣り合う音（同 tick は次の tick との組）の鍵の六角距離の平均と最大、同時押し率 ＝ 2 音以上の tick ／ tick の数、段またぎ率 ＝ 隣り合う音で段が変わる組 ／ 組の数。譜面版ごと。注意の目安（密度 >3.5・最大跳躍 ≥6、§2.4）は S1 の注記に。仮。
10. **端末に合う版の自動選択**（手順 8）: 配列は settings.layout、ただし ableton 版に落ちる音（keys null）があり vmpk 版の方が少なければ vmpk を推奨して先頭に（worktable M1-01「1 オクターブ強を超える曲は VMPK 版が既定」）。上限は 2 を選び、端末の上限までは選べる（decisions #7・#15。通過端末で 3 を自動選択するのは M-3 の後）。
11. **S6 で M1 に出さない項目**（手順 10）: プロファイル切替（M2-05）・対照 W–H（版が無い）・判定窓と離し窓の変更（定数）・持ち込み曲の削除と版の作り直し（M2-06）・オフセット（YouTube）（M3-08）。控えの取り込みで設定を上書きするか（#53 の未決）は取り込むときに聞く（仮）。色は 標準／グレースケール確認 の 2 値（仮）。演出の予算 標準／控えめ／なし ＝ FLASH_MAX 3／1／0（仮）。
12. **帯が矩形の外の検査**（手順 2）: M1 は dev ビルドの assert（帯と `#player` の getBoundingClientRect が交差しない）と手確認。機械検査は M3-01（§5.4）。
13. **同時押しテストの細部**（手順 9、§2.4 が書かない所）: 保持 1,000 ms は、押下集合がちょうどその組になった keydown の tsPerf から数える。余分な鍵・途中の離しでその組は落ち、10 秒で揃わなければ落ち（ゴースト。3 鍵目の keydown が来ない）。落ちた組はやり直さず次へ（229 の IME だけ同じ組をやり直す、m6 L264）。「スキップ」と「あとで」は 2 のまま。仮。
14. **初回導線の秒の計り方**（手順 9・14）: onboard 行の seconds は各段の表示から次の段（か「あとで」）までの実時間。5 分は S0a の表示から S0d の曲末まで（4 段の和）。「あとで」とスキップは left 真で where に段の id。仮。
15. **physical の幾何の描画**（decisions #45 (d)）: M1-07 に入れる（鍵盤図の段の x を段ずれでせん断するだけ。落下域は段別着地なので変えない）。仮。
16. **ストリークの日付の境界**（手順 11）: 端末のローカル日付（Date の年月日）。ResultRecord.at は ISO 8601（UTC）なので、集計は at を Date に戻してローカルで切る。仮。
17. **チュートリアル曲「はじめの六角」**（手順 7）: 自作（own）・Ableton 型・上限 2・C 長調・60 BPM。段階 1（KeyD ＝ E4）だけで旋律になる書き方（E を刻むリズム → D F J K の 4 音 → 全鍵）。吹き出し 3 つの文言は m6 L289–291。仮。
18. **自作値**（仮のまま注記。手順ごとに足す）: 校正タップの対応の上限 300 ms（m3 calTap L450 の写し）、同時押しテストの揃わない上限 10 秒、HUD の精度の初期表示「—」、ずれの言葉の閾 ±5 ms（「ちょうど」）、チュートリアル曲のテンポ 60 BPM、演出の予算の 3／1／0、精度の表示の桁（小数 1 桁、m6 L842）、入門者の音の既定（ガイド音 ON・メトロノーム OFF・空打ち発音 ON。手順 1）。
19. **S2 の HUD の進行**（手順 3）: 進行 ＝ t ／ 最終ノートの終わり（END_TAIL_MS を含めない）。曲の前（t < 0、LEAD 2,000 ms）は 0。仮。
20. **decisions #24 の 1093×vmpk の R 27**: 手順 3 の表のとおり limited null で可視時間 2,227 ms。125% 端末での可読性（U-05）は手順 14 で見る（#24 の末尾）。
21. **称号の表示場所**（手順 11）: S3 のこの回の称号と、S1 の上帯のストリークだけ（§4.4「S1 のカードは曲単位の称号印を持たない」）。完走印は曲カード（m6 L761）。
22. **M1 の試験の形**（手順 1）: 画面の論理は純関数で単体試験、DOM は dev ビルドの assert と手順 14 の手確認。jsdom・ブラウザ runner は使わない（M0-01 §1.2 のまま）。描画のスナップショット（#28）は S2 が同じ箱・同じ入力なら変わらない。

閉じた物（2026-10-31）: 順序（§7-1、decisions #58、仮）、SMF の道具の前倒し（§7-2、#59）、入門者のラベルの既定（§7-4、#60）、S0d の音待ち（§7-5、#61）、校正の提案の符号（§7-6、#62）、skipped と ResultRecord（§7-7、#63）、同梱曲の precache（§7-8、#64）。
