# Web 実装の技術スタックと OSS 音ゲー

調査日 2026-10-23。注記: WebSearch の予算（全エージェント共有）が尽きており検索は不可。一次情報（MDN・W3C 仕様・公式ブログ・caniuse・OSS のソース/Wiki）を WebFetch で直接読んだ。二次記事・論文は未収集。[n] は出どころ番号。

## 事実

### 音声の時計と遅延
- JS タイマーは数十 ms 遅れるが AudioContext.currentTime はサンプル精度の別スレッド時計。推奨は「25 ms ごとに起きて 100 ms 先まで予約」。OS 音声バッファは数 ms〜約 50 ms を足す [1][2]。
- AudioWorklet は音声スレッドで 128 フレーム単位に処理。Chrome 66 で既定有効、2021-04 以降 Baseline、HTTPS 必須 [3][4][5]。
- latencyHint 既定は "interactive"。MDN 例の baseLatency は interactive 0.00 秒、playback 0.15 秒 [6][7]。outputLatency は 2025-03 以降 Baseline [8]。getOutputTimestamp() が音声時計と performance.now() を対応付ける [9]。
- 自動再生: Chrome 71 以降、操作前に作った AudioContext は suspended で始まり click 内で resume() が要る [10]。Firefox は block-webaudio 既定 true [11]。Safari は media 要素の方針しか確認できず（推測: Web Audio も操作必須）[12]。

### 非アクティブタブと時計の精度
- Chrome 88 以降、非表示タブのタイマーは 1 Hz、「非表示 5 分超・チェーン 5 以上・30 秒無音」で毎分 1 回。直近 30 秒に音を出したページは除外 [13]。rAF は背景タブで停止 [14]。visibilitychange で明示停止 [15]。
- Event.timeStamp の丸め: Chrome 0.1 ms、Safari 1 ms、Firefox 既定 1 ms、resistFingerprinting 時 16.667 ms [16]。Event Timing API は processingStart − startTime が入力遅延、duration は 8 ms 丸め [17]。

### 入力
- KeyboardEvent.code は配列非依存の物理キー（"KeyQ" は AZERTY では A 位置）。操作は code、表示は key [18]。navigator.keyboard.getLayoutMap() で code → 配列の印字を引けるが Chromium 中心 [19]。
- キーボード遅延は実測 15〜60 ms。USB 125 Hz ポーリングの寄与は平均約 4 ms [20]。ダイオード無しマトリクスは 3 キー同時で幻キーか無視、USB ブートプロトコルは 6 キー上限 [21]。
- Gamepad API はボタンイベントが無く rAF 内で getGamepads() をポーリング [22][23]。
- Web MIDI: Chrome 43+／Edge 79+／Firefox 108+（site permission add-on）／Safari・iOS 全版非対応、caniuse 78.96% [24][25]。WebKit バグ 107250 は 2013 年起票で NEW のまま [26]。Chrome 124 以降は SysEx 無しでも許可プロンプト [27]。HTTPS 必須 [28]。MIDIOutput.send は timestamp で先送り可 [29]。

### 描画
- rAF は表示のリフレッシュに追従（60/75/120/144 Hz を明記）。経過時間は引数 timestamp から出さないと高リフレッシュで速くなる [14]。
- WebGPU: Chrome/Edge 113+、Safari 26 は partial、Firefox 既定無効、caniuse 87.82% [30]。OffscreenCanvas は 2023-03 以降 Baseline、Worker 内 rAF 可 [31]。Canvas 2D 最適化の定石は [32]。
- PixiJS 8.22.0（MIT、WebGL/WebGPU）[33][34]、Phaser 4.2.1（MIT）[35]、three.js r186（MIT）[36][37]。
- 六角グリッド（pointy-top）: 前進行列 f=(√3, √3/2, 0, 3/2)、逆行列 b=(√3/3, −1/3, 0, 2/3)、頂点は 30° から 60° 刻み。pixel→hex は逆行列後 cube_round [38][39]。

### ピアノ音源
- Salamander Grand Piano V3: Yamaha C5、16 層、48 kHz/24 bit、短三度ごと収録、CC BY 3.0、SF2 296 MiB [40]。Tone.js は V2 の mp3/ogg を A0〜C8 の 30 音で配布し Sampler がリピッチ。Tone 15.1.22、MIT [41][42][43]。
- smplr 1.1.0（MIT）: SplendidGrandPiano（4 層）、start() の time は currentTime 基準 [44][45]。soundfont-player は 2023-05 アーカイブ、後継は smplr [46]。WebAudioFont は GPL-3.0 [47]。

### 配布形態と YouTube
- Tauri 2（MIT or Apache-2.0）は OS の WebView（WebView2／WKWebView／WebKitGTK）＋Rust [48][49]。Electron 45（MIT）は Chromium 同梱 [50][51]。PWA はマニフェスト必須 [52]。
- YouTube IFrame API: getCurrentTime() は秒（精度記述なし）、音声ストリームを取り出す API は無し、最小 200×200 px [53]。

### 譜面フォーマット
- .osu（v14、lazer v128）: HitObjects は `x,y,time,type,hitSound,objectParams,hitSample`、time は ms、mania 列は floor(x·列数/512) [54]。
- .sm: #OFFSET 秒、#BPMS は Beat=BPM、#NOTES は 4 拍小節をカンマ区切り、行数が分解能、文字 0/1/2/3/4/M [55]。
- BMS: `#xxxCC:objects`（小節・チャンネル・base-36 対）、11〜19 が 1P 鍵、51〜59 LN、01 BGM。文字コード未規定 [56]。bmson 1.0.0: JSON、y はパルス（resolution 既定 240）、notes {x, y, l, c} [57]。
- Sonolus LevelData: `{bgmOffset, entities[]}`、entity は `{name?, archetype, data:[{name, value|ref}]}`、gzip JSON。sonolus.js は MIT、クライアント本体は公開一覧に無し（推測: 非公開）[58][59][60]。

### 判定幅（ms、片側）
- osu!mania stable: MAX 16 固定、300: 64−3·OD、200: 97−3·OD、100: 127−3·OD、50: 151−3·OD、miss 188−3·OD [61][62]。lazer は OD0/5/10 で Perfect 22.4/19.4/13.9、Great 64/49/34 [63]。osu! 本家 Great 80/50/20 [64]。
- Quaver: Marv 18、Perf 43、Great 76、Good 106、Okay 127、Miss 164、リリース窓 1.5 倍 [65]。
- beatoraja 7 鍵: PG ±20、GR ±60、GD ±150、BD −280/+220。KEYBOARD モードは PG ±30、GR ±90、GD ±200 [66]。
- Bemuse: Meticulous <20、Precise <50、Good <100、Offbeat <200、初心者帯 24/100/180 [67]。
- Dancing☆Onigiri: 1/60 秒フレーム基準で、イイ ±2 f（≈33 ms）、シャキン ±3〜4 f、マターリ ±5〜6 f、ショボーン ±7〜8 f、+9 f でミス [68][69]。StepMania/Etterna の既定値は未取得。

## 事例
- Bemuse — React/Redux＋PixiJS の BMS/bmson プレイヤー。遅延キャリブレーション、Early/Late 表示、7 鍵＋MIDI 入力。AGPLv3 [70]。含意: 最も近い実装参照だがコピーレフト。
- webosu — PixiJS 製 osu! 互換、MIT＋CC-BY-NC 資産、「音楽が完全には同期しない場合あり」と明記 [71]。
- sunniesnow — PixiJS、AGPL-3.0。iOS WebKit の touchstart 欠落で Safari 系は遊びにくい [72]。
- Dancing☆Onigiri (CW Edition) — 日本発のキーボード音ゲーエンジン、MIT、5/7/9 鍵＋カスタムキー [73]。含意: 「PC キーを鍵盤に見立てる」先行例。
- rhythm-plus — Vue 2＋Canvas 2D、GPL-3.0 [74]。In-the-Browser — setTimeout ループで後半ほどズレると作者が記す [75]。含意: 二つの時計の反面教師。
- osu!(lazer) — C#、MIT、ruleset 拡張 [76][77]。Quaver — MPL-2.0 [78]。Etterna — StepMania 5 fork、MIT [79]。beatoraja — Java、GPL-3.0 [80]。
- Project OutFox — StepMania 5.1 fork、.osu/.sm/.bms/.qua 等を取り込み。ソース公開状況は未確認 [81][82][83]。
- Sonolus — 譜面を entity/archetype データで表し、エンジンを sonolus.js（MIT）で書く [58][59]。

## 類推
- DAW の先読み再生: 音は音声時計で予約し、描画は rAF で音声時計を読む。判定基準時刻も音声時計に置けば描画落ちと分離できる [1]。
- タイピングソフトの配列対応: 物理キー（code）で判定し表示は getLayoutMap [18][19]。
- 速記・楽器鍵盤は和音入力のため全キーにダイオード。「鍵盤に見立てる」設計は NKRO 前提に近づく [21]。
- Sonolus の archetype は「ノートの型をデータで宣言」。六角セルも archetype として表せる [58]。
- パルス基準（bmson/Sonolus）と ms 基準（.osu）は、BPM 変化を譜面側で持つか時刻に焼き込むかの違い [54][57]。

## 制約
- 技術: Safari/iOS に Web MIDI 無し。Tauri は macOS/iOS で WKWebView のため同様と推測 [24][48]。AudioContext は操作後 resume が必要 [10]。背景タブで rAF 停止・タイマー絞り [13][14]。Firefox 指紋対策下で timeStamp 16.667 ms 丸め [16]。YouTube 音声は Web Audio に流せず同期は getCurrentTime 頼み [53]。
- 人間工学・ハード: キーボード遅延 15〜60 ms の個体差 [20]。膜式で 3 キー以上同時押しの欠落 [21]。最良判定の相場は ±16〜20 ms（osu!mania 16、Quaver 18、beatoraja/Bemuse 20）、キーボード向けは ±30 ms（beatoraja KEYBOARD）や ±33 ms（Dancing☆Onigiri）[61][65][66][67][68]。
- 法務: Bemuse・sunniesnow は AGPL、beatoraja・rhythm-plus・WebAudioFont は GPL-3.0。osu-resources は CC-BY-NC かつ商標不可。Salamander は CC BY 3.0（帰属表示）。MIT/MPL のもの（osu コード、PixiJS、Phaser、three、Tone、smplr、Etterna、Dancing☆Onigiri）は流用しやすい [40][47][70][76][77]。

## 問い
- 入力時刻を音声時計へ写す最善手。Event.timeStamp（0.1〜1 ms 丸め）を getOutputTimestamp で変換したときの実測誤差 [9][16]。
- YouTube 音源時の getCurrentTime() の分解能・ジッタ・ドリフト補正。公式文書に精度記述なし [53]。
- Safari/WebKit の Web Audio 自動再生方針の一次情報 [12]。
- StepMania/Etterna の既定判定幅と Project OutFox のソース公開状況。
- VRR（G-Sync/FreeSync）下での rAF 周期の揺れ。一次情報未発見。
- 譜面を ms 基準（.osu 型）とパルス基準（bmson/Sonolus 型）のどちらで持つか。
- 検索不可のため JS 音ゲーチュートリアル・論文・日本語の実装報告は未収集。

## 出どころ一覧
1. https://web.dev/articles/audio-scheduling
2. https://developer.mozilla.org/ja/docs/Web/API/Web_Audio_API/Advanced_techniques
3. https://developer.chrome.com/blog/audio-worklet
4. https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
5. https://webaudio.github.io/web-audio-api/
6. https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext
7. https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency
8. https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency
9. https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp
10. https://developer.chrome.com/blog/autoplay/
11. https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
12. https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/
13. https://developer.chrome.com/blog/timer-throttling-in-chrome-88
14. https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
15. https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
16. https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
17. https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming
18. https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
19. https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap
20. https://danluu.com/keyboard-latency/
21. https://en.wikipedia.org/wiki/Rollover_(keyboard)
22. https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API
23. https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getGamepads
24. https://caniuse.com/midi
25. https://www.firefox.com/en-US/firefox/108.0/releasenotes/
26. https://bugs.webkit.org/show_bug.cgi?id=107250
27. https://developer.chrome.com/blog/web-midi-permission-prompt
28. https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess
29. https://developer.mozilla.org/en-US/docs/Web/API/MIDIOutput/send
30. https://caniuse.com/webgpu
31. https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
32. https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
33. https://github.com/pixijs/pixijs
34. https://registry.npmjs.org/pixi.js/latest
35. https://github.com/phaserjs/phaser
36. https://github.com/mrdoob/three.js
37. https://registry.npmjs.org/three/latest
38. https://www.redblobgames.com/grids/hexagons/
39. https://www.redblobgames.com/grids/hexagons/implementation.html
40. https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
41. https://github.com/Tonejs/audio/tree/master/salamander
42. https://tonejs.github.io/docs/15.1.22/classes/Sampler.html
43. https://registry.npmjs.org/tone/latest
44. https://github.com/danigb/smplr
45. https://registry.npmjs.org/smplr/latest
46. https://github.com/danigb/soundfont-player
47. https://github.com/surikov/webaudiofont
48. https://github.com/tauri-apps/tauri
49. https://registry.npmjs.org/@tauri-apps/cli/latest
50. https://github.com/electron/electron
51. https://registry.npmjs.org/electron/latest
52. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app
53. https://developers.google.com/youtube/iframe_api_reference
54. https://osu.ppy.sh/wiki/en/Client/File_formats/osu_(file_format)
55. https://github.com/stepmania/stepmania/wiki/sm
56. https://hitkey.nekokan.dyndns.info/cmds.htm
57. https://bmson-spec.readthedocs.io/en/master/doc/index.html
58. https://raw.githubusercontent.com/Sonolus/sonolus-core/main/src/common/core/level/data/entity.ts （同 data.ts、https://wiki.sonolus.com/level-specs/resources/level-data.html）
59. https://github.com/Sonolus/sonolus.js
60. https://github.com/Sonolus
61. https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu%21mania
62. https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty
63. https://raw.githubusercontent.com/ppy/osu/master/osu.Game.Rulesets.Mania/Scoring/ManiaHitWindows.cs
64. https://raw.githubusercontent.com/ppy/osu/master/osu.Game.Rulesets.Osu/Scoring/OsuHitWindows.cs
65. https://raw.githubusercontent.com/Quaver/Quaver.API/master/Quaver.API/Maps/Processors/Scoring/ScoreProcessorKeys.cs
66. https://raw.githubusercontent.com/exch-bms2/beatoraja/master/src/bms/player/beatoraja/play/JudgeProperty.java
67. https://raw.githubusercontent.com/bemusic/bemuse/master/bemuse/src/game/judgments.ts
68. https://github.com/cwtickle/danoniplus/wiki/AboutJudgment
69. https://github.com/cwtickle/danoniplus/wiki/AboutFrameProcessing
70. https://github.com/bemusic/bemuse
71. https://github.com/111116/webosu
72. https://github.com/sunniesnow/sunniesnow
73. https://github.com/cwtickle/danoniplus
74. https://github.com/henryzt/Rhythm-Plus-Music-Game
75. https://github.com/JonJWong/In-the-Browser
76. https://github.com/ppy/osu
77. https://github.com/ppy/osu-resources
78. https://github.com/Quaver/Quaver
79. https://github.com/etternagame/etterna
80. https://github.com/wcko87/beatoraja
81. https://projectoutfox.com/
82. https://projectoutfox.com/about
83. https://github.com/TeamRizu/OutFox

## 検証結果

検証日 2026-10-23。「要の事実」13 件について出どころ URL を WebFetch で実際に読み、出どころに無い部分は別の一次情報（MDN・BCD・公式リリースノート・OSS のソース）を WebFetch で読んで当てた。WebSearch は予算切れで使えなかったため、検索に頼る裏取り（例: Chrome 88 以降の絞り条件の変更履歴）は未実施。判定・提案はしない。

結果: confirmed 10 / corrected 3 / refuted 0 / unverifiable 0。

### 1. 二つの時計（25 ms ごと・100 ms 先・OS バッファ数 ms〜約 50 ms） — confirmed
- web.dev の本文に「a setTimeout interval of 25ms … each call will schedule for the next 100ms」、一般則として「100ms of "lookahead" time, with intervals set to 25ms」、OS バッファは「from low single digits of milliseconds to around 50ms」と明記。
- 補足: 同記事は別の例として「250ms lookahead, spaced 200ms apart」も挙げており、25/100 は一つの推奨値であって唯一の定数ではない。
- 根拠: https://web.dev/articles/audio-scheduling

### 2. AudioWorklet（128 フレーム・Chrome 66・Baseline 2021-04・HTTPS・latencyHint・baseLatency・getOutputTimestamp） — confirmed（出どころは複数に分散）
- Chrome ブログに「Audio Worklet is enabled by default in Chrome 66」「keeps the user-supplied JavaScript code all within the audio processing thread」「only available in a secure context … served over HTTPS（localhost は例外）」。128 はコードのコメント「a render quantum (128 samples)」としてのみ登場（本文で定義はしていない）。
- 同ブログには latencyHint・baseLatency・getOutputTimestamp・performance.now() の記述は無い。これらは MDN で確認: AudioWorklet は「available across browsers since April 2021」、AudioContext コンストラクタで「"interactive" (default value)」、baseLatency の例が `// 0.00`（interactive）と `// 0.15`（playback）、getOutputTimestamp は contextTime（currentTime と同じ原点）と performanceTime（performance.now() と同じ原点）を返し Baseline 2021-04。
- 注意: 0.00/0.15 秒は MDN の例示コメントであり、実機の値ではない（MDN 自身「the browser may ignore the option」）。
- 根拠: https://developer.chrome.com/blog/audio-worklet ／ https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet ／ https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext ／ https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency ／ https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp

### 3. 自動再生（Chrome 71・suspended・resume()・"click" 推奨・Firefox block-webaudio） — confirmed（"click" の文脈に注記）
- Chrome ブログに「The Web Audio API has been covered by autoplay since Chrome 71」、操作前に作った AudioContext は suspended で「you'll have to call resume() … after a user clicks a button」。「Events that trigger user activation are still to be defined consistently across browsers. I'd recommend you stick to "click"」は同記事の Audio/Video 節の文で、Web Audio 節ではない（趣旨は共通）。
- Firefox の設定は Chrome ブログには無く、MDN Autoplay ガイドに「media.autoplay.block-webaudio … The default is set to true」「audio contexts are only able to play on pages once there has been Sticky activation」。
- 補足: Chrome ブログは、操作後に接続ノードで start() が呼ばれれば自動で resume されるとも書いている。
- 根拠: https://developer.chrome.com/blog/autoplay/ ／ https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay

### 4. 非表示タブのタイマー絞り（Chrome 88 以降 1 Hz・毎分 1 回・音を出したページは除外・rAF 停止） — corrected
- 訂正: 「Chrome 88 以降、非表示タブのタイマーは 1 Hz」は時期の帰属が誤り。1 Hz（毎秒 1 回）の絞りは Chrome 11（2011 年）からで、Chrome 88 の記事自身も「This isn't new either; browsers have been doing this to some extent for years」と書く。Chrome 88 で新しいのは「毎分 1 回」の intensive throttling。
- 条件は記事どおり: 非表示 5 分超 かつ チェーン 5 以上 かつ 30 秒以上無音 かつ WebRTC 不使用 のとき毎分 1 回。「直近 30 秒に音を出したページ」は minimal throttling 側に入り除外（無音トラックは数えない）。rAF は「will wait for the page to be visible」で停止（Chrome 57 記事は 2011 年から停止と記す）。
- 未確認: 記事の最終更新は 2021-01-18。その後の Chrome で閾値（チェーン数など）が変わったかは検索不可のため未検証。
- 根拠: https://developer.chrome.com/blog/timer-throttling-in-chrome-88 ／ https://developer.chrome.com/blog/background_tabs（「Since Chrome 11, each independent timer is run no more than once per second」）

### 5. Event.timeStamp の丸め（Chrome 0.1 ms・Safari 1 ms・Firefox 1 ms／16.667 ms） — confirmed
- MDN に「In Chrome, the rounding interval is 0.1 ms」「In Safari, it is 1 ms」「Firefox … privacy.reduceTimerPrecision … 1 ms」「privacy.resistFingerprinting … 16.667 ms or the interval configured by … whichever is larger」。
- 補足: cross-origin-isolated な文脈では Chrome 0.005 ms、Safari 0.02 ms、Firefox 0.02 ms に細かくなる（本文に明記）。
- 根拠: https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp

### 6. Web MIDI の対応（Chrome 43+／Edge 79+／Firefox 108+／Safari 非対応・WebKit 107250・Chrome 124 プロンプト・78.96%） — confirmed
- caniuse: Chrome 43〜、Edge 79〜、Firefox 108〜、Safari（macOS/iOS）全版非対応、「78.96% + 0% = 78.96%」。caniuse には「site permission add-on」「Chrome 124」の記述は無い。
- Firefox 108 リリースノート: 「Firefox now supports the WebMIDI API and a new experimental mechanism for controlling access to dangerous capabilities」（リンク先が site-permission-add-ons の記事。記事本体は読み込みエラーで内容未確認）。
- WebKit バグ 107250: 題「Web MIDI API」、Status NEW、Reported 2013-01-18、Last modified 2025-07-30（最終コメント「Please add WebMIDI API to Safari」）。
- Chrome ブログ: 許可プロンプトは「previously in place only for … SysEx … now extends to standard MIDI interactions」、Chrome 124 から段階的に展開。
- 補足: caniuse は Safari 18.4+ でサードパーティ拡張「Web MIDI for Safari」により API を足せると注記（WebKit 本体ではないため非対応扱い）。
- 根拠: https://caniuse.com/midi ／ https://www.firefox.com/en-US/firefox/108.0/releasenotes/ ／ https://bugs.webkit.org/show_bug.cgi?id=107250 ／ https://developer.chrome.com/blog/web-midi-permission-prompt

### 7. KeyboardEvent.code と getLayoutMap — confirmed
- MDN code: 「"KeyQ" for the Q key on a QWERTY layout keyboard, but the same code value also represents … the A key on AZERTY keyboards」。getLayoutMap の記述は code のページには無い。
- MDN getLayoutMap: 「Secure context … (HTTPS)」「Limited availability」「Experimental」。BCD（api/Keyboard.json）で version_added は chrome "69"、edge/opera/samsung/webview は Chrome を mirror、firefox false、safari false。
- 根拠: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code ／ https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap ／ https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Keyboard.json

### 8. キーボード遅延 15〜60 ms・USB ポーリング平均 4 ms — confirmed
- danluu の表: Apple Magic (usb) 15 ms（最小）〜 Logitech K360 60 ms（最大、接続は Unifying＝無線）。値は 5 ms 単位に丸め、計測はキー押下から USB パケットまで。
- 「USB devices … run at 8ms, or 125Hz」「With 8ms polling, the average latency added … is 4ms」と明記。
- 根拠: https://danluu.com/keyboard-latency/

### 9. ロールオーバー（3 キーで幻キー／無視・USB ブートプロトコル 6 キー＋修飾 8） — confirmed
- Wikipedia: 「pressing as few as three keys can cause ghosting effects」、検出型は「ignore the third key」（jamming）。ブートプロトコルは「eight modifier keys」＋「maximum six key codes」。
- 根拠: https://en.wikipedia.org/wiki/Rollover_(keyboard)

### 10. 判定幅（osu!mania・Quaver・beatoraja・Bemuse・Dancing☆Onigiri） — confirmed
- osu! wiki: 最上位は「PERFECT」（hit value 320、旧称 MAX）で max hit error 16 固定、GREAT(300) は 64 − 3×OD。表の値は「half of the hit window width」＝片側。ScoreV2 では PERFECT が 22.4 − 0.6×OD（OD≤5）／24.9 − 1.1×OD（OD≥5）に変わる。
- Quaver ScoreProcessorKeys.cs: Marv 18／Perf 43／Great 76／Good 106／Okay 127／Miss 164、WindowReleaseMultiplier 1.5（単位はコード中に明記なし）。
- beatoraja JudgeProperty.java: 値はマイクロ秒。SEVENKEYS note が {−20000,20000, −60000,60000, −150000,150000, −280000,220000, …}、KEYBOARD note が {−30000,30000, −90000,90000, −200000,200000, −320000,240000, …}。ms 換算で PG ±20／GR ±60／GD ±150、KEYBOARD は PG ±30／GR ±90／GD ±200。
- Bemuse judgments.ts: NORMAL_TIMEGATES が 0.02／0.05／0.1／0.2 秒（＝20／50／100／200 ms）、ABSOLUTE_BEGINNER が 0.024／0.1／0.18／0.2 秒。
- Dancing☆Onigiri wiki: イイ「0～±2 Frames」、シャキン ±3〜4、マターリ ±5〜6、ショボーン ±7〜8、+9 以上でミス。AboutFrameProcessing に「fps=60のとき … 1フレームに1/60秒」とあり、±2 f ≈ ±33 ms の換算は成り立つ（setTimeout による疑似フレーム）。
- 根拠: https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu%21mania ／ https://raw.githubusercontent.com/Quaver/Quaver.API/master/Quaver.API/Maps/Processors/Scoring/ScoreProcessorKeys.cs ／ https://raw.githubusercontent.com/exch-bms2/beatoraja/master/src/bms/player/beatoraja/play/JudgeProperty.java ／ https://raw.githubusercontent.com/bemusic/bemuse/master/bemuse/src/game/judgments.ts ／ https://github.com/cwtickle/danoniplus/wiki/AboutJudgment ／ https://github.com/cwtickle/danoniplus/wiki/AboutFrameProcessing

### 11. rAF・WebGPU・OffscreenCanvas — corrected（Firefox の WebGPU）
- rAF: MDN に「60hz … though 75hz, 120hz, and 144hz are also widely used」「otherwise, the animation will run faster on high refresh-rate screens」「paused in most browsers when running in background tabs」。timestamp の精度は「minimal precision of 1 millisecond」。confirmed。
- OffscreenCanvas: MDN「available across browsers since March 2023」「available in Web Workers」。confirmed。
- WebGPU: caniuse は Chrome/Edge 113〜、Safari 26.0〜 partial、「85.8% + 2.02% = 87.82%」、Firefox は 63〜161 を一律「Disabled by default」と表示。
- 訂正: 「Firefox は既定無効」は caniuse の表示どおりだが、Firefox 141 リリースノートは「Enabled the WebGPU API … on Windows」、Firefox 145 は「now available on macOS 26 (Tahoe) on Apple Silicon」と記す。BCD（api/GPU.json）は firefox version_added "141"（partial_implementation）で「Supports Windows since Firefox 141」「Supports macOS Tahoe on Apple silicon since Firefox 145」「Supports older macOS versions on Apple silicon since Firefox 147」「Does not support macOS on Intel CPUs」「Does not support Linux」。つまり Firefox は Windows と Apple silicon Mac では既定有効、Intel Mac・Linux・Android では無効。
- 補足: BCD は Chrome 113〜143 を partial（ChromeOS/macOS/Windows）、Chrome 144 から Linux（Intel Gen12+ のみ）込みで full とし、Safari 26 には partial の印を付けていない（caniuse と評価が異なる）。
- 根拠: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame ／ https://caniuse.com/webgpu ／ https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas ／ https://www.firefox.com/en-US/firefox/141.0/releasenotes/ ／ https://www.firefox.com/en-US/firefox/145.0/releasenotes/ ／ https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/GPU.json

### 12. ピアノ音源（Salamander V3・Tone.js 30 音・smplr・WebAudioFont） — corrected（Tone.js 同梱音源の版）
- freepats: 「Version V3+2020-06-02」「Yamaha C5」「16 velocity layers」「48kHz 24bit」「Creative Commons Attribution 3.0」、SF2 は「296MiB」（他に SFZ FLAC 707 MiB、SFZ WAV 1.18 GiB／394 MiB）。confirmed。
- Tone.js audio/salamander: ファイルは A0〜A7、C1〜C8、Ds1〜Ds7、Fs1〜Fs7 の 30 音 × mp3/ogg（短三度間隔）。confirmed。
- 訂正: 「V2 の mp3/ogg」は同梱 README の表題「Salamander Grand Piano V2」に拠るが、同 README は「V3」の変更履歴を先頭に含み（「The old V2 .sfz should work」）、同梱音が V2 と V3 のどちらから作られたかは文面から確定しない。
- smplr: npm latest は version "1.1.0"、license "MIT"。README に「time is measured against audioContext.currentTime」。SplendidGrandPiano は「Steinway samples with 4 velocity groups」。confirmed。
- WebAudioFont: GitHub サイドバー「GPL-3.0 license」、README「Contact me if you need different license」。confirmed。
- 根拠: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html ／ https://github.com/Tonejs/audio/tree/master/salamander ／ https://raw.githubusercontent.com/Tonejs/audio/master/salamander/README ／ https://registry.npmjs.org/smplr/latest ／ https://github.com/danigb/smplr ／ https://github.com/surikov/webaudiofont

### 13. YouTube IFrame API（getCurrentTime は秒・精度記述なし・音声取り出し不可・最小 200×200） — confirmed
- 「Returns the elapsed time in seconds since the video started playing」、精度の記述は無し。「Embedded players must have a viewport that is at least 200px by 200px」（16:9 は 480×270 以上を推奨）。音声関連は setVolume/getVolume/mute のみで Web Audio への受け渡しは無い。
- 根拠: https://developers.google.com/youtube/iframe_api_reference

### 検証で読めなかったもの
- https://support.mozilla.org/en-US/kb/site-permission-add-ons（読み込みエラー。Firefox の Web MIDI 許可の仕組みは 108 リリースノートのリンク先名でのみ裏付け）
- https://blog.chromium.org/2017/03/reducing-power-consumption-for.html（本文が取れず。代わりに developer.chrome.com/blog/background_tabs を使用）
