# 判定・スコア・レイテンシ補正・視認性・人間工学

調査日 2026-10-23。注記: WebSearch の共有予算が尽きており検索は実行できず、一次情報（公式 wiki・仕様書・GitHub ソース・有志 wiki）を URL 直指定の WebFetch で読んだ。検索が要る項目は「問い」に残した。数値は出どころ付き、推測は明記。

## 事実

### 判定幅（ms、±は早遅対称）
- osu!standard: 300 = 80−6×OD、100 = 140−8×OD、50 = 200−10×OD。OD5 で 50/100/150、OD10 で 20/60/100 [S1]。
- osu!mania: PERFECT ±16（OD 非依存）、GREAT 64−3OD、GOOD 97−3OD、OK 127−3OD、MEH 151−3OD、MISS 188−3OD。ホールドは頭と尻の誤差を合算して一判定、胴体の途中で離すと MEH 止まり [S2]。
- Etterna（J4）: 22.5 / 45 / 90 / 135 / 180。MISS 窓開始 180、地雷 ±75、ホールド落下 250 [S3][S4]。判定レベルは倍率 J4=1.00, J5=0.84, J6=0.66, J7=0.50, J8=0.33, J9=0.20 [S5]。
- Wife3（Etterna）: |誤差| ≤5·ts で満点 2、65·ts^0.75 まで erf で減衰、180·ts で −5.5 に達し以降ミス扱い [S6]。離散窓でなく連続関数で採点する実例。
- Quaver（OSS）: 18 / 43 / 76 / 106 / 127 / 164 [S7]。
- beatoraja（OSS の BMS プレイヤー）: 7KEYS で PG ±20 / GR ±60 / GD ±150 / BD −280/+220 / 空POOR −150/+500。LN の離し判定は ±120/±160/±200 と広い。KEYBOARD モードは PG ±30 / GR ±90 / GD ±200。判定ランクは 25〜125% の倍率 [S8]。
- Arcaea（有志 wiki）: PURE 無印 ±25、PURE E/L ±50、FAR ±100、他 LOST。ロング・アークは PURE/LOST の二値。スコアは 10,000,000÷総ノーツ、FAR 50%、無印 PURE に +1 点 [S9]。
- CHUNITHM（有志 wiki）: JUSTICE CRITICAL ±33.33ms（120fps で ±4F、公式非公表の有力説）。ホールド/スライドは BPM に応じ 16/8/4 分間隔のチェックポイント判定。JC 101% / JUSTICE 100% / ATTACK 50%、満点 1,010,000 [S10]。
- IIDX: 判定幅の一次情報は未取得。tricoro で「フローティングハイスピード」（0.5–10.0 を 0.01 刻み、レーンカバー連動で緑数字＝可視時間を維持）、AC で初めてタイミングオフセット変更可 [S11]。HI-SPEED は ×0.5–×4.0 [S12]。
- DJMAX RESPECT V: namu.wiki・fandom が 403/402 で未取得。

### 速度（ハイスピード）の表し方
- osu!: preempt は AR0 1800ms、AR5 1200ms、AR10 450ms。フェードインは preempt の 2/3 で完了 [S13]。
- osu!lazer mania: 可視時間 = 11485ms ÷ 速度（1–40）、約 287–11485ms。判定位置を変えても体感速度が変わらないよう補正 [S14]。
- CHUNITHM は 1–15 を 0.25 刻み [S10]、Arcaea は 1.0–6.5 を 0.1 刻み [S9]。

### オフセット校正 UI
- osu!stable Offset Wizard: メトロノームと緑バーを流し、上下キーで手動調整。計算はせず主観で合わせる [S15]。
- osu!lazer: セッション中の各プレイの推奨オフセットの算術平均を 1ms 丸めで提示、現在値との差 <1ms なら適用ボタン無効 [S16]。
- StepMania AutoSync: 24 打の誤差を貯め、標準偏差 <0.03s のときだけ平均をオフセットに加算、超えると「Deviation too high」で不適用 [S17][S18]。
- Arcaea: 遅延調整は ±0.1/±1.0 刻み、|値| ≥101 で SE 音量を強制 0% [S9]。有志報告では同じ iPad mini 6 でもスピーカー 97・AirPods Pro 221、HUAWEI P10 lite は 320（自己申告）[S19]。
- UR（Unstable Rate）= 打鍵誤差の標準偏差 ×10。一貫性の指標 [S20]。

### ブラウザのレイテンシ
- `AudioContext.baseLatency`（グラフ→OS）は 2021-04 から全ブラウザ、`outputLatency`（OS→実機）は Baseline 2025（2025-03〜）[S21][S22]。MDN 例示値は interactive 0.00、playback 0.15 秒 [S22]。仕様で latencyHint 既定 "interactive" は「グリッチなしで最小遅延」[S23]。
- 旧い実測メモ: Windows WASAPI 約 10ms、macOS/iOS 数 ms、PulseAudio 30–40ms、Android 12.5〜150ms [S24]。
- JS タイマーでなく `AudioContext.currentTime` 基準で 25ms 周期・100ms 先読み、描画は rAF で同じ時計と照合 [S25]。rAF は表示リフレッシュ同期で、音声時計との同期精度は 1 フレーム（16.67ms@60Hz）、バックグラウンドで停止 [S26]。
- `Event.timeStamp` の丸め: Chrome 0.1ms、Safari 1ms、Firefox 1ms（resistFingerprinting で 16.667ms）。`performance.now()` は 100µs、隔離で 5µs [S27][S28]。
- Chrome の keydown/keyup は離散イベントで即時配送（rAF 整列は mousemove 等のみ）[S29]。
- キーボード本体: 押下→USB で 15–60ms。要因はキートラベルと 100–200Hz の走査で、ポーリング率の寄与は小さい [S30]。押下→画面は現代 PC で 50–200ms（165Hz 50、60Hz 80）[S31]。
- ロールオーバー: ダイオードなしの安価な機種は 2 キー保証、矩形 3 隅の同時押しでゴースト/ジャム。USB ブートプロトコルは 6 キー上限 [S32]。
- `KeyboardEvent.code` は配列非依存（KeyQ は AZERTY の A）。表示ラベルは `navigator.keyboard.getLayoutMap()`（Chromium 系・HTTPS）[S33][S34]。
- `navigator.vibrate` はユーザー操作後のみ、対応は限定的 [S35]。

### 視認性・アクセシビリティ
- 赤緑の色覚多様性は男性の 8–10%。色だけで伝えず形・ラベルを併用、色のカスタマイズを提供 [S36]。Okabe–Ito: 純赤でなく朱 #FF2000、凡例より直接ラベル [S37]。
- WCAG 2.3.1: 閃光は 1 秒 3 回以下、輝度差 10% 以上が閃光、面積は 10° 視野の 25%（341×256 CSS px）[S38]。
- Game Accessibility Guidelines: 「ゲーム速度の調整」「精密なタイミングを必須にしない」「複数同時操作を必須にしない」「ハプティクスのトグル」「プレイ中の難易度変更・適応難易度」「補助モード」[S39]。
- osu!stable 既定: 背景減光 80%、スコアメーターは早遅バーが既定 [S40]。

### 難易度・密度指標と自動調整
- osu!mania の星 = Strain × 0.018、OD は不使用 [S41]。星の帯は Easy 0–1.99〜Expert+ 6.5 以上 [S42]。
- Etterna MinaCalc: 0.5 秒区間の NPS を土台に Stream/JS/HS/Stamina/Jack/Chordjack/Tech を推定、目標スコア率から必要技量を逆算 [S43]。
- osu!lazer Adaptive Speed: 早打ちで加速、遅打ちで減速、初期 0.5–2.0x [S44]。Difficulty Adjust で OD 0–10 [S45]。Auto は完全自動再生 [S46]。

### 読譜の認知・六角セル
- 初見演奏研究: 熟練者ほど視線が先行（eye–hand span）、既知パターンをまとめて読む、「期待による読み」のため予想外の並びで誤る [S47]。音ゲー固有の視線計測は未取得。
- 六角グリッドは隣接 6 セルの中心距離が等しい（正方格子は対角が 1.41 倍）。列配置では真横に進めずジグザグ [S48]。等積なら六角形の内接円半径は 0.537√A で正方形の 0.5√A より約 7% 大きい（筆者の算術）。視認性の実験研究は未取得。
- 等方鍵盤: 各キーが 6 隣接で移調しても指形が同じ。学習容易性は「厳密には検証されていない」[S49]。

## 事例
- osu!lazer（OSS）: セッション平均の推奨オフセット、Adaptive Speed、早遅バー。含意: 自動校正はプレイ中の誤差平均で出せる [S16][S44]。
- Etterna（OSS）: 倍率制の判定レベルと Wife3、MSD。含意: 判定幅を係数一つで難度化でき、採点を滑らかにできる [S5][S6][S43]。
- StepMania（OSS）: 24 打平均・SD ゲートの自動同期。含意: ばらつきが大きい時は補正しない安全弁 [S17]。
- beatoraja（OSS）: KEYBOARD モードで PG ±30 と広め、離し判定は緩く、BAD は非対称。含意: PC キーボード向け緩和の前例 [S8]。
- Quaver（OSS）: 6 段階 18–164ms [S7]。
- Arcaea: ロングは二値判定、オフセット超過で SE を切る、端末別遅延報告。含意: 端末差 ±200ms 級を前提にした UI [S9][S19]。
- CHUNITHM: 判定調整 A（譜面位置）と B（判定のみ）を分離、FAST/LATE 表示粒度を選択 [S10]。
- IIDX tricoro: 可視時間（緑数字）基準のハイスピード [S11]。
- Synthesia: 落下ノーツ＋鍵盤、正しい音まで待つメロディ練習、片手選択、運指番号、次音マーカー。含意: 片手・待ち・次キー提示の先行例 [S50]。
- Virtual Piano: PC キーボードを鍵盤に割当、Shift で黒鍵 [S51]。

## 類推
- 初見演奏の eye–hand span: 熟練者は先を見るので、可視時間（preempt 450–1800ms、lazer 287–11485ms）を「先読み量」のつまみとして露出する発想が自然 [S13][S14][S47]。
- 等方鍵盤: 六角セルに音名を載せると移調不変の利点があるが、QWERTY 固定なら限定的（推測）。QWERTY の行ずれは六角充填に近い（推測、出典なし）。
- Wife3 の erf 減衰は「窓の境界で点が跳ぶ」不快感を避ける採点の代替案 [S6]。StepMania の SD ゲートは外れ値除去と同型 [S17]。
- 色覚対応の「色＋形＋ラベル」はレーン分けに転用できる。文字付き六角セルは既にラベル併用 [S36][S37]。

## 制約
- 時間分解能: 入力時刻は Safari/Firefox で 1ms 丸め、resistFingerprinting で 16.667ms [S27]、rAF 同期は 1 フレーム [S26]。各社の最上位 ±16–25ms に対し描画同期だけで ±8ms 級の誤差。
- 出力遅延: `outputLatency` は 2025-03 以降のブラウザのみ [S21]。以前は手動・プレイ中推定が要る。
- ハードウェア差: キーボード 15–60ms、押下→画面 50–200ms [S30][S31]、端末別オフセットは ±200ms 級で散る [S19]。校正は必須。
- 同時押し: 安価な機種は 2 キー保証、3 キー以上でゴースト [S32]。
- 配列: JIS/US/AZERTY で同じ物理キーの文字が変わる。`code` で判定、ラベルは `getLayoutMap`（Chromium のみ）[S33][S34]。振動は操作後のみ・非対応あり [S35]。
- 法務（YouTube 埋め込み）: プレイヤーのいかなる部分の前にもオーバーレイ等を置かず隠さない、最小 200×200px、API 外の改変禁止 [S52]。`getCurrentTime()` は秒の Number で精度の記載なし、`setPlaybackRate` は反映保証なし [S53]。減光や譜面重畳は規約と衝突しうる（解釈は主担当）。
- 人間工学: 閃光 1 秒 3 回以下・面積制限 [S38]。色だけの識別は不可 [S36]。「精密なタイミング」「同時操作」を必須にしないのは上級ガイドライン [S39]。バックグラウンドで rAF 停止 [S26]。

## 問い
- 六角セル vs 矩形の視認性・誤認（文字付きセルが流れる条件）の実験研究が未取得。検索予算が戻ったら要調査。
- 音ゲーの視線計測（先読み距離、視線移動）の論文が未取得。
- IIDX/DJMAX の公式判定幅は一次情報なし。コミュニティ値を使うなら「未検証」の印が要る。
- YouTube 埋め込みの `getCurrentTime()` の更新粒度と遅延は不明。譜面と動画の同期をどう担保するか。音声だけ Web Audio で持つなら規約上許されるか。
- 校正は「タップで測る」（osu!stable 型）と「プレイ中に推定」（lazer/StepMania 型）のどちらを既定にするか。
- 最上位判定幅を何 ms に置くか。1ms 丸め・キーボードのジッタ（90 パーセンタイル約 5ms [S30]）・フレーム同期を足すと ±16ms は厳しい可能性。
- 3 鍵以上の同時押しを譜面から排除するか、ゴースト検出で警告するか。
- 片手モードは「割当を片側に寄せる」か「Synthesia 型の待ちモード」か。

## 出どころ一覧
- [S1] https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty
- [S2] https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!mania
- [S3] https://raw.githubusercontent.com/etternagame/etterna/master/src/Etterna/Actor/Gameplay/Player.cpp
- [S4] https://raw.githubusercontent.com/etternagame/etterna/master/src/Etterna/Models/Misc/GameConstantsAndTypes.h
- [S5] https://raw.githubusercontent.com/etternagame/etterna/master/src/Etterna/Singletons/GameState.h
- [S6] https://raw.githubusercontent.com/etternagame/etterna/master/Themes/_fallback/Scripts/10%20Scores.lua
- [S7] https://raw.githubusercontent.com/Quaver/Quaver.API/master/Quaver.API/Maps/Processors/Scoring/JudgementWindows.cs
- [S8] https://raw.githubusercontent.com/exch-bms2/beatoraja/master/src/bms/player/beatoraja/play/JudgeProperty.java
- [S9] https://wikiwiki.jp/arcaea/%E3%83%AB%E3%83%BC%E3%83%AB
- [S10] https://wikiwiki.jp/chunithmwiki/%E3%82%B2%E3%83%BC%E3%83%A0%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A01
- [S11] https://remywiki.com/Beatmania_IIDX_20_tricoro
- [S12] https://remywiki.com/IIDX_General_Info
- [S13] https://osu.ppy.sh/wiki/en/Beatmap/Approach_rate
- [S14] https://raw.githubusercontent.com/ppy/osu/master/osu.Game.Rulesets.Mania/UI/DrawableManiaRuleset.cs
- [S15] https://osu.ppy.sh/wiki/en/Client/Options/Offset_Wizard
- [S16] https://raw.githubusercontent.com/ppy/osu/master/osu.Game/Overlays/Settings/Sections/Audio/AudioOffsetAdjustControl.cs
- [S17] https://raw.githubusercontent.com/stepmania/stepmania/master/src/AdjustSync.cpp
- [S18] https://raw.githubusercontent.com/stepmania/stepmania/master/src/AdjustSync.h
- [S19] https://wikiwiki.jp/arcaea/%E9%81%85%E5%BB%B6%E8%AA%BF%E6%95%B4%E5%A0%B1%E5%91%8A
- [S20] https://osu.ppy.sh/wiki/en/Gameplay/Unstable_rate
- [S21] https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency
- [S22] https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency
- [S23] https://www.w3.org/TR/webaudio-1.0/
- [S24] https://padenot.github.io/web-audio-perf/
- [S25] https://web.dev/articles/audio-scheduling
- [S26] https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- [S27] https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
- [S28] https://developer.mozilla.org/en-US/docs/Web/API/Performance/now
- [S29] https://developer.chrome.com/blog/aligning-input-events
- [S30] https://danluu.com/keyboard-latency/
- [S31] https://danluu.com/input-lag/
- [S32] https://en.wikipedia.org/wiki/Rollover_(keyboard)
- [S33] https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
- [S34] https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap
- [S35] https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
- [S36] https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-colour-alone/
- [S37] https://jfly.uni-koeln.de/color/
- [S38] https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html
- [S39] https://gameaccessibilityguidelines.com/full-list/
- [S40] https://osu.ppy.sh/wiki/en/Client/Options
- [S41] https://raw.githubusercontent.com/ppy/osu/master/osu.Game.Rulesets.Mania/Difficulty/ManiaDifficultyCalculator.cs
- [S42] https://osu.ppy.sh/wiki/en/Beatmap/Star_rating
- [S43] https://raw.githubusercontent.com/etternagame/etterna/master/src/Etterna/MinaCalc/MinaCalc.h
- [S44] https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier/Adaptive_Speed
- [S45] https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier/Difficulty_Adjust
- [S46] https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier/Auto
- [S47] https://en.wikipedia.org/wiki/Sight-reading
- [S48] https://en.wikipedia.org/wiki/Hex_map
- [S49] https://en.wikipedia.org/wiki/Isomorphic_keyboard
- [S50] https://synthesiagame.com/
- [S51] https://recursivearts.com/virtual-piano/
- [S52] https://developers.google.com/youtube/terms/required-minimum-functionality
- [S53] https://developers.google.com/youtube/iframe_api_reference

## 検証結果

確かめ日 2026-10-23。やり方: 各事実の出どころ URL を WebFetch で読み、記述と照合した。数値は合っているが出どころが別ファイル・別ページにあるものは「confirmed（出どころ補足）」とし、数値や帰属そのものに誤りがあるものは corrected。WebSearch は共有予算切れで使えず（1 回試みて拒否）、追加の一次情報はすべて URL 直指定の WebFetch で取得した。

| # | 事実 | 判定 | 根拠 |
|---|---|---|---|
| 1 | osu!standard 300/100/50 = 80−6OD / 140−8OD / 200−10OD | confirmed | [S1] |
| 2 | osu!mania PERFECT ±16 固定、GREAT 64−3OD…MISS 188−3OD、ホールド合算・胴体離しで MEH 止まり | confirmed | [S2] |
| 3 | Etterna J4 窓 22.5/45/90/135/180、MISS 180、ホールド落下 250、倍率 J4=1.00…J9=0.20 | confirmed（出どころ補足） | [S5] は倍率のみ。窓は [S3]、定数は [S4] |
| 4 | Wife3 5·ts / 65·ts^0.75 / erf / 180·ts / −5.5 | confirmed | [S6] |
| 5 | beatoraja KEYBOARD PG ±30/GR ±90/GD ±200、LN 離し ±120/±160/±200、BAD −280/+220 | **corrected** | [S8] + [V1] |
| 6 | Arcaea PURE ±25 / E-L ±50 / FAR ±100、ロング二値、±0.1/±1.0 刻み、｜値｜≥101 で SE 0%、iPad mini 6 97/221 | confirmed（出どころ補足） | [S9] + [S19] |
| 7 | CHUNITHM JC ±33.33ms（有志）、判定 A/B −2.0〜2.0 0.1 刻み、ホールド 16/8/4 分チェックポイント | confirmed（有志 wiki・未検証扱い継続） | [S10] |
| 8 | osu! preempt AR0 1800 / AR5 1200 / AR10 450、lazer mania 11485÷速度(1–40) | confirmed（出どころ補足） | [S13] + [S14] |
| 9 | StepMania AutoSync 24 打・SD<0.03・Deviation too high、lazer 平均 1ms 丸め・差<1ms で無効 | confirmed（出どころ補足） | [S17][S18] + [S16] |
| 10 | Event.timeStamp 丸め Chrome 0.1 / Safari 1 / Firefox 1（RFP 16.667）、rAF 1 フレーム、outputLatency Baseline 2025、baseLatency 2021-04 | confirmed（出どころ補足） | [S27] + [S26][S21][S22] |
| 11 | キーボード 15–60ms、走査 100–200Hz、押下→画面 50–200ms、ダイオード無しは 2 キー保証・矩形 3 隅でゴースト | confirmed（出どころ補足・語弊 1 点） | [S30] + [S31][S32] |
| 12 | YouTube 埋め込み: オーバーレイ禁止・一部隠す禁止・最小 200×200、getCurrentTime 秒 Number、setPlaybackRate 反映保証なし | confirmed（出どころ補足） | [S52] + [S53] |

### 各項の照合メモ

1. **osu!standard（confirmed）** [S1] の表に `80 - 6 × OD` / `140 - 8 × OD` / `200 - 10 × OD` が式として載る。OD5 = 50/100/150、OD10 = 20/60/100 はページに数表はなく式からの算出（算術は合う）。同ページに mania の MAX 16、300 = 64−3OD、200 = 97−3OD、100 = 127−3OD、50 = 151−3OD もある。

2. **osu!mania（confirmed）** [S2] に PERFECT 16（OD 非依存）、GREAT 64−3OD、GOOD 97−3OD、OK 127−3OD、MEH 151−3OD、MISS 188−3OD。ホールドは「Hold notes are given one judgement depending on the timing of both the keypress at the head and the release at the tail」で、合算誤差＝頭の誤差＋尻の誤差（ともに絶対値）。補足: 段ごとに頭と合算の上限倍率があり PERFECT は頭 ≤1.2×・合算 ≤2.4×、GREAT 1.1×/2.2×、GOOD・OK 1×/2×、満たさなければ MEH。「Releasing the key during the hold note body will prevent judgements higher than MEH」。遅い側の MEH は存在せずミス。**ScoreV2 では頭と尻を別々に判定**し尻の窓は 1.5 倍（胴体離しは尻を MEH 上限）。誤差は丸め・切り捨てで片側 0.5ms ずれうる。

3. **Etterna（confirmed・出どころ補足）** [S5] GameState.h にあるのは `timingscales = { 1.00F, 1.00F, 1.00F, 1.00F, 0.84F, 0.66F, 0.50F, 0.33F, 0.20F }` のみ（J1–J9、コメントで J1–J3 を 1.0 に潰して廃止）。J4=1.00、J5=0.84、J6=0.66、J7=0.50、J8=0.33、J9=0.20 は一致。窓の秒数は [S3] Player.cpp の `TimingWindowSecondsInit`: TW_W1 0.0225 / W2 0.045 / W3 0.090 / W4 0.135 / W5 0.180 / TW_Checkpoint 0.1664。[S4] GameConstantsAndTypes.h に `MISS_WINDOW_BEGIN_SEC = 0.18F`、`HOLD_DROP_SEC = 0.250F`、`MINE_WINDOW_SEC = 0.075F`、`ROLL_DROP_SEC = 0.500F`、`TAP_IN_HOLD_REQ_SEC = 0.135F`。補足: `GetWindowSeconds` は窓×倍率を 0〜0.18 秒に clamp、`GetTimingWindowScale` は 0.001〜1.0 に clamp（J4 より広くはできない）。Mine/Hold/Roll は倍率の影響を受けない。

4. **Wife3（confirmed）** [S6] に `max_points = 2`、`miss_weight = -5.5`、`ridic = 5 * ts`、`max_boo_weight = 180 * ts`、`ts_pow = 0.75`、`zero = 65 * (ts^ts_pow)`、`dev = 22.7 * (ts^ts_pow)`。|誤差| ≤ ridic で 2 点、≤ zero で `2 * erf((zero - maxms) / dev)`、≤ 180·ts で `(maxms - zero) * miss_weight / (max_boo_weight - zero)`（線形に −5.5 へ）、それ以上は `miss_weight`。記述どおり。

5. **beatoraja（corrected）** [S8] JudgeProperty.java の実値（単位はマイクロ秒、`convertMilli` が /1000）:
   - `KEYBOARD` 通常ノーツ `{ -30000, 30000, -90000, 90000, -200000, 200000, -320000, 240000, -200000, 650000 }` → PG ±30 / GR ±90 / GD ±200 / **BD −320/+240** / 空POOR −200/+650。PG/GR/GD は記述どおり。
   - `KEYBOARD` LN 終端 `{ -160000, 25000, -200000, 75000, -260000, 140000, -320000, 240000 }` → **−160/+25、−200/+75、−260/+140、−320/+240**。
   - `SEVENKEYS` 通常 `{ -20000, 20000, -60000, 60000, -150000, 150000, -280000, 220000, -150000, 500000 }`、LN 終端 `{ -120000, 120000, -160000, 160000, -200000, 200000, -280000, 220000 }`。
   - **訂正点**: 事実文の「LN の離し判定は押しより広い（±120/±160/±200）」と「BAD は早遅非対称（−280/+220）」は **7KEYS の値**で、KEYBOARD の値ではない。KEYBOARD の BAD は −320/+240。
   - **符号の向き**: 配列コメントは「PG, GR, GD, BD, MSの順で{LATE下限, EARLY上限}」、[V1] JudgeManager.java は `dmtime = note.getMicroTime() - pmtime` でクラスコメント「判定差時間(ms , +は早押しで-は遅押し)」。よって **負＝遅、正＝早**。7KEYS の BAD −280/+220 は「遅 280ms / 早 220ms」（遅い側が広い）。
   - **KEYBOARD の離し判定は「押しより広い」ではなく非対称**: 早離し（正側）は 25/75/140ms と押し（30/90/200）より狭く、遅離し（負側）は 160/200/260ms と広い。「離しを緩める前例」として引くなら 7KEYS の ±120/±160/±200 の方で、KEYBOARD は「早離しに厳しく遅離しに緩い」前例。
   - 補足: LN 型（CN/HCN でない）は終端を押し続けたまま通過すると頭の判定がそのまま終端に付く（`updateMicro(..., state.lnstartJudge, state.lnstartDuration, true)`）。BAD 以下の早離しは `releasemargin` 分だけ確定を遅らせる。KEYBOARD のスクラッチ・ロングスクラッチ配列は空。

6. **Arcaea（confirmed・出どころ補足）** [S9] ルールページに「(+1pt)(±25ms)」「若干早く/遅く…(±50ms)」「(±100ms)」、ロング・アークは「判定は無印PURE/LOSTのみ」、「+101以上もしくは-101以下」で SE 音量 0%。LOST の ms は記載なし。音声プリセットはスピーカー/有線と Bluetooth で別保存。120fps オプションで無印 PURE が少し広がり EARLY/LATE が狭まる記述あり。**±0.1/±1.0 刻み**（「"+"、"-"ボタンで±0.1ずつ、"<"、">"ボタンで±1.0ずつ」）と **iPad mini 6（iOS 15.0.2）スピーカー 97・AirPods Pro 221（2021/10/24 追加、SE なし）**、HUAWEI P10 lite 320（イヤホン）は [S19] 遅延調整報告ページ。設定範囲の上下限は両ページとも記載なし。

7. **CHUNITHM（confirmed・有志 wiki）** [S10] に「±33.33ms(120fpsで±4フレーム)」（有志検証、公式非公表）、JUSTICE/ATTACK/MISS の ms は未記載（順序のみ）。判定タイミング A（譜面位置を動かす）・B（判定のみ）はともに −2.0〜2.0 を 0.1 刻み、筐体ごと保存。ホールド/スライドは「BPM120未満は16分間隔・BPM120～240は8分間隔・BPM240以上は4分間隔」で、起点は HOLD/SLIDE 開始点または SLIDE の可視中継点。**ページ自身が「要検証」と付記**しているので未検証扱いは維持。旧「判定掌握(±16ms)」「零式(±25ms)」は NEW 以降廃止。

8. **osu! preempt / lazer mania（confirmed・出どころ補足）** preempt は [S13] Approach_rate: AR<5 `1200ms + 120ms * (5 - AR)`、AR5 `1200ms`、AR>5 `1200ms - 150ms * (AR - 5)`、「ranges from 1800ms at AR0 to 450ms at AR10」、全不透明は preempt の 2/3 時点。[S14] DrawableManiaRuleset.cs は `MAX_TIME_RANGE = 11485`、`ComputeScrollTime(scrollSpeed) => MAX_TIME_RANGE / scrollSpeed`、コメント「a scroll speed in the range of 1-40」。補足: 定数 `MIN_TIME_RANGE = 290`（コメント「occurs at a ScrollSpeed of 40」）は式の 11485/40 ≈ 287.1 と一致せず、同ファイル内で未参照。速度の上下限 clamp は別ファイル（ManiaRulesetSetting）。

9. **StepMania / lazer（confirmed・出どころ補足）** [S18] AdjustSync.h `#define OFFSET_SAMPLE_COUNT 24`。[S17] AdjustSync.cpp `if( stddev < .03f )`、不適用時 `"Autosync: Correction NOT applied. Deviation too high."`、適用は Machine なら `m_fGlobalOffsetSeconds + mean`、Song なら曲タイミングの `adjust_offset(mean)`。[S16] AudioOffsetAdjustControl.cs `SuggestedOffset.Value = ... Math.Round(averageHitErrorHistory.Average(dataPoint => dataPoint.SuggestedGlobalAudioOffset))`、`Math.Abs(SuggestedOffset.Value.Value - current.Value) < 1` で適用ボタン無効。各プレイの推奨値の算出は SessionAverageHitErrorTracker（未読）。

10. **ブラウザの時刻精度（confirmed・出どころ補足）** [S27] Event.timeStamp: Chrome 0.1ms（cross-origin isolated で 0.005ms）、Safari 1ms（同 0.02ms）、Firefox は `privacy.reduceTimerPrecision` 既定で 1ms（同 0.02ms）、`privacy.resistFingerprinting` で 16.667ms か設定値の大きい方。[S26] rAF ページに「The frequency of calls … will generally match the display refresh rate」「the highest precision available is the duration of a single frame, 16.67ms @60Hz」、背景タブ・隠し iframe で停止、タイムスタンプの最小精度 1ms。[S21] outputLatency「Baseline 2025 / Newly available / Since March 2025」、[S22] baseLatency「Widely available / since April 2021」、例示値 interactive 0.00・playback 0.15、latencyHint は無視されうる。補足: COOP/COEP で cross-origin isolated にすると丸めが 0.005〜0.02ms に細かくなる。

11. **キーボード遅延（confirmed・出どころ補足・語弊 1 点）** [S30] danluu: 最小 15ms（Apple Magic Keyboard USB）〜最大 60ms（Logitech K360）、5ms 丸め、「as much as a 45ms difference」。要因: キートラベル（240fps で 4–8 フレーム、「can easily add 10ms」）、走査「100 Hz to 200 Hz range」、ポーリング 8ms→1ms は「3.5ms delta」で小。「modern computers are often in the 100ms to 200ms range when you press a key in a terminal」「50ms range in well optimized games」。[S31] input-lag 表: haswell-e 165Hz 50 / 120Hz 60 / 60Hz 80 / 24Hz 140、powerspec g405 win 200 → 50〜200ms は表からの要約。ロールオーバー: danluu「typical keyboards will often only let you press two keys at once, excluding modifier keys」、Razer「10 キー同時」謳いでも 3 キー組合せ多数が不可。ダイオード・矩形 3 隅は [S32] Wikipedia: 「most computer keyboards use a matrix of key switches, without any isolation diodes」「pressing as few as three keys can cause ghosting」「three corners of a rectangular set of switches … the "ghost" being the fourth corner」、現代機は 4 キー目を出さず 3 キー目を無視（jamming）、USB ブートプロトコルは修飾 8＋キーコード 6。**語弊**: Wikipedia は「安価な機種」ではなく「大半のキーボード」にダイオードが無いとしている。

12. **YouTube 埋め込み規約（confirmed・出どころ補足）** [S52] RMF: 「You must not display overlays, frames, or other visual elements in front of any part of a YouTube embedded player」「must not use overlays, frames or other visual elements to obscure any part of an embedded player」「Embedded players must have a viewport that is at least 200px by 200px」、コントロールを縮めずに表示できる大きさ、16:9 は 480×270 以上推奨、「must not make changes to the YouTube player that are not explicitly described by the API documentation」。getCurrentTime / setPlaybackRate は [S53] iframe_api_reference: `getCurrentTime():Number`「Returns the elapsed time in seconds since the video started playing」で精度・遅延・更新頻度の記載なし、`setPlaybackRate`「Calling this function does not guarantee that the playback rate will actually change」、変化は `onPlaybackRateChange` で検知、非対応値は 1 の方向へ丸め。

### 追加の出どころ
- [V1] https://raw.githubusercontent.com/exch-bms2/beatoraja/master/src/bms/player/beatoraja/play/JudgeManager.java （判定差時間の符号: +早押し / −遅押し）
