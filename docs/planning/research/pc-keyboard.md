# PC キーボードをピアノ鍵盤に見立てる慣例と物理制約

調査日 2026-10-23。判定・採否は書かない。推測は「推測」と明記。数値は出典付き（[n] は末尾の一覧）。

## 事実

### 1. DAW のキー→音名割り当て（二系統）

**系統 A: 文字 1 段＋黒鍵段（Ableton / Logic / GarageBand）**

- Ableton Live 12 公式: 中段（A S D F…）が C3 から始まる白鍵、上段（W E T Y U…）が黒鍵。Z/X でオクターブ、C/V でベロシティを 20 刻み。M で ON/OFF。ON 中は単文字ショートカットを「奪う」のでソロは Shift+S。C3–C4 の範囲では中段が Impulse のドラムスロットに対応 [1]。
- Logic Pro Musical Typing（Apple 公式 10.4）: Z/X オクターブ、C/V ベロシティ、4–8 モジュレーション（3 で OFF）、1/2 ピッチベンド、Tab サスティン [2]。公式本文に音名図のテキストは無く、A=C2 は第三者解説 [3]。

**系統 B: 2 段×（白鍵段＋黒鍵段）（VMPK / FL / REAPER / LMMS）**

- VMPK（描画ライブラリ drumstick の `g_DefaultKeyMap`、一次ソース）: Z=12(C) S=13 X=14 D=15 C=16 V=17 G=18 B=19 H=20 N=21 J=22 M=23 / Q=24 2=25 W=26 3=27 E=28 R=29 5=30 T=31 6=32 Y=33 7=34 U=35 I=36 9=37 O=38 0=39 P=40。30 キー、約 2.5 オクターブ [4]。ヘルプ: ES/DE/FR 配列用マップ同梱、X11/Windows/Mac の生キーコードでも定義可、XML 保存 [5]。
- FL Studio 公式: Ctrl+T で切替、ON 中は単キーショートカット無効、Alt+テンキー 2–6 でオクターブ [6]。オプションは Root Note / Octave / Standard keyboard layouts / Snap to scale [7]。配列図は公式本文に無し。FL を模した OSS（UFLVK-Emu）は「中央 37 キー」として Z S X D C V G B H N J M , L . ; / と Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P [ = ] を列挙（第三者の再現）[8]。
- REAPER Virtual MIDI Keyboard（Alt+B）: コミュニティ解説で Z〜, が白鍵、S D G H J L が黒鍵、Q〜I が上のオクターブ白鍵（O P 延長）、2 3 5 6 7 9 が黒鍵（0 延長）。←→ オクターブ、↑↓ MIDI チャンネル（巡回）[9]。
- LMMS: 公式 Key Mappings に演奏割り当て無し [10]。フォーラム（2017）: Q=C W=D E=E R=F T=G Y=A U=B I=C5…、下段は Z=C3 から 1 オクターブ下 [11]。
- Cubase/Nuendo On-Screen Keyboard（Steinberg 公式 v10）: コンピュータキーボード表示では画面の 2 段で入力、Octave Offset か ←→ で移動、7 オクターブ、Tab でピアノ表示、ベンド/モジュレーションはピアノ表示のみ [12]。

共通点: 白鍵は文字段、黒鍵は一段上、E–F と B–C の間は飛ばす。オクターブ移動は Z/X か矢印。

### 2. JIS 配列と US 配列の差

- キー数: JIS 106/109、US 101/104 [13]。Deskthority: JIS 109 は ISO より 4、ANSI より 5 キー多い [14]。
- Enter: JIS 逆 L 字、US 横長 [13][15]。Backspace: JIS は 1u、US は横長 [13][14]。右 Shift: JIS は狭く右に 1 キー追加。スペースは短いが中央、その左右に 無変換・変換・かな。「日本語入力キーの大きさと数は製品ごとに異なる」[14]。
- W3C UI Events code: 日本語 106 は 101 に IntlYen・Backslash・IntlRo を足し、スペースを縮めて入力モードキー 3 つを置く。`Backquote` 位置＝半角/全角/漢字、`IntlYen`＝= と Backspace の間（¥）、`IntlRo`＝/ と右 Shift の間（\ろ）、`Backslash`＝]む、`NonConvert`＝無変換、`Convert`＝変換、`KanaMode`＝かな。Mac JIS は `Lang1`＝かな、`Lang2`＝英数 [16]。
- 記号: JIS は @ [ ] : ; が US と別位置に散り、括弧が上下に並ぶ [13]。P の右が @（`BracketLeft`）→[（`BracketRight`）、L の右が ;→:（`Quote`）→]（`Backslash`）、数字段右端が ^（`Equal`）と ¥、というのは W3C 図の読み取り（推測、要実機確認）。
- 段ずれ: Deskthority「Staggering」: 古典 QWERTY は「1/2 キー、1/4 キー、1/2 キー」（数字→Q→A→Z 段）の二重スタッガー、タイプライターのアーム干渉回避が起源、コンパクト機は 1/4 均一も多い [17]。Wikipedia: Sholes は 3/8、3/16、3/8 インチ [18]。1u≈19 mm（3/4 インチ）、ISO 1091 の 19±1 mm は 1994 年廃止、現行国際規格は無く DIN 2137-2 が暫定 [19]。19.05 mm 換算で 1/4u≈4.8 mm、1/2u≈9.5 mm（調査役の計算）。JIS の文字ブロックの段ずれは ANSI と同じ（Deskthority が端のキー差しか挙げないことからの推測）。

### 3. ロールオーバー・ゴースト

- Deskthority: ゴーストはマトリクスの四角形 3 隅を押すと 4 隅目が押されたことになる現象。「ブロッキング」はゴーストになり得るキーを無視する（取りこぼし）。安全上限は 2 キー。6KRO は内部 NKRO でも USB HID 互換プロトコルが「6 キー＋修飾 4 対」に制限したもの。NKRO はダイオードか静電容量/ホール式。メンブレンは PCB が無くダイオードを載せられないためブロッキング。1980 年代半ばのコスト削減で標準化 [20]。
- Wikipedia: USB ブートプロトコルは修飾 8 ビット＋最大 6 キーコード、レポートプロトコルは制限なし。全キーを分離しない設計は「よくある組み合わせで 4〜5 キー」[21]。
- FL フォーラム: タイピングキーボードで同時 4 音が上限だった→「ハード次第」[22]。国内記事: 事務用は 3 キー以上の同時押しを想定しないものが多い [23]。

### 4. ブラウザのキー入力

- `KeyboardEvent.code` は物理キーで配列・修飾の影響を受けない。`KeyQ` は Dvorak では '、AZERTY では A。ゲーム向け。文字は `key` [24]。Chrome ブログ: WASD を code で判定すれば「全配列で動く」[25]。
- code 値表（MDN）: Backquote 0x0029、IntlRo 0x0073、IntlYen 0x007D、Convert 0x0079、NonConvert 0x007B、KanaMode 0x0070。Mac の かな/英数（Lang1/2）は「実際にはイベントが発火しない」。macOS Firefox は仮想キーコードから code を決める [26]。
- 刻印取得: `navigator.keyboard.getLayoutMap().get("KeyW")`。実験的・HTTPS 限定・Baseline 外 [27]。互換表では Chrome 69+/Edge 79+ のみ、Firefox/Safari 非対応 [28]。
- リピート: `repeat` は自動リピート中 true。Baseline 2025（2025 年 5 月〜）[29]。Windows 既定: 遅延 0〜3（約 250 ms〜1 s）、速度 0〜31（約 2.5〜30 回/秒、±20%）[30]。
- IME: `isComposing` は compositionstart〜compositionend で true [31]。IME 処理中の keydown は keyCode 229 / key "Process"。変換の開始直後・終了直前は isComposing が false でも keyCode 229 のことがある [32]。Safari は compositionend が先に出る [33]。
- CapsLock: `getModifierState("CapsLock")` で LED 状態 [34]。macOS Chrome は ON 時に keydown だけ、OFF 時に keyup だけ（Guacamole 未解決バグ、WebKit 2012 年スレッドでも既知）[35]。
- 半角/全角は JIS で `Backquote` 位置 [16][36]。

### 5. 遅延

- Dan Luu 実測（キー動き始め→USB パケット、5 ms 丸め）: Apple Magic 15、HHKB Lite2 20、Logitech K120 30、Razer Ornata 35、Kinesis Advantage 50、Logitech K360 無線 60 ms。8 ms ポーリングの平均待ち 4 ms、1 ms なら 0.5 ms。「他要因が支配的」で、キー移動 10 ms 以上、走査とデバウンスも大 [37]。
- ポーリング: 125 Hz=8 ms、1000 Hz=1 ms、8000 Hz=0.125 ms（ベンダー）[38]。
- Cherry MX: バウンス ≤5 ms（0.4 m/s）、MX2A RED/BLUE/BROWN は 5 ms、一部 <1 ms [39]。RTINGS: スイッチ単体で押下 1–2 ms、離し約 5 ms、スイッチが全体の約 80% [40]。
- Regensburg CHI'19: 36 台計測、「1000 Hz 強制は一部機器でしか減らない」「平均と SD では分布が隠れる」[41]。

### 6. ゲーミングと一般の差

- 一般: メンブレン＋ブロッキング、USB 6KRO [20][21]。ゲーミング: NKRO、1000 Hz 以上。
- Wooting Rapid Trigger 公式: 作動点・復帰点を動的に変え「全キー同時（NKRO）」「リズムゲームの連打にも効く」（ベンダー主張）[42]。メカニカル約 2 mm 固定、ホール式 0.1〜4.0 mm 可変、リズム向け 1.0 mm 作動＋0.1 mm 復帰を勧める記事（ベンダーブログ、13.3 ms 対 5.7 ms は机上モデル）[43]。

### 7. タイピングゲームの次キー表示

- 寿司打公式: 「表示されているキー以外にもお好みの打ち方で」（し = si/shi/ci）。設定でふりがな・ローマ字表示切替 [44]。Wikipedia: 60/90/120 秒、右上に連打メーター、ミスでリセット、正確重視は皿リセット、一発勝負は即終了 [45]。キーボード図の記述無し（次キー提示はローマ字文字列との推測）。
- ザ・タイピング・オブ・ザ・デッド: ゾンビの前に文章、先頭文字で対象決定、かな/ローマ字選択、綴り選択を求めない [46]。
- e-typing: 公式トップとヘルプ索引にキーボード図・指ガイドの説明無し、未確認 [47]。

## 事例

- **Ableton Computer MIDI Keyboard** [1] — 中段白鍵・上段黒鍵。含意: 鍵盤モードは他の単キー操作と衝突する前提の設計。
- **Logic Musical Typing** [2] — 数字キーをベンド/モジュレーションに充てる流儀。
- **VMPK / drumstick** [4][5] — 2.5 オクターブ 2 段、XML と生キーコードで配列差を吸収する OSS の前例。
- **REAPER** [9] — 矢印でオクターブ、チャンネル巡回。
- **Cubase** [12] — 2 段、7 オクターブ、Tab でモード切替。
- **FL Studio** [7] — Root Note / Snap to scale で押鍵を音階に吸着。含意: 鍵盤を「度数」に読み替える発想。
- **UFLVK-Emu** [8] — FL 式配列の再現実装（GitHub）。
- **原神 風物の詩琴** [48] — Q〜U / A〜J / Z〜M の 3 段×7、C3–B5 自然音のみ。含意: 黒鍵を捨て 1 段 7 音に揃える流儀。
- **Sky 星を紡ぐ子どもたち** [49] — 音楽チャレンジで押すキーを画面表示（PC 割り当ては未確認）。
- **寿司打** [44][45] — 複数綴り許容、連打メーター。
- **The Typing of the Dead** [46] — 綴り選択を求めない判定。
- **Deskthority wiki** [17][20]、**Dan Luu** [37]、**Wooting** [42] — 物理制約の一次的な解説と実測。

## 類推

- 段ずれ 1/2・1/4・1/2 は六角タイルの 1/2 ずれと Q→A 段で一致しない。六角セルで鍵盤を描くと A 段が実機と約 1/4u（≈4.8 mm）ずれる（[17] からの推測）。
- タイピングゲームの「どの綴りでも可」は、同じ音を上下どちらの段で押しても良い扱いに似る [44][46]。
- 寿司打の連打メーターと時間延長はコンボ/ゲージに相当 [45]。
- 「判定は code、表示は key/getLayoutMap」は音ゲーの判定と刻印表示の分離に移植できる [25][27]。
- Ableton の「C3–C4 でドラムスロット」は、鍵盤でなくレーン番号に直接マップする前例 [1]。

## 制約

- **同時押し**: USB 互換モードは 6 キー＋修飾、メンブレンは 4〜5 キー以下、ゴーストで誤入力も [20][21][22]。和音数はキーボード依存。
- **配列差**: JIS は記号キーの位置・数が異なる。`key` 判定は配列で壊れる [13][16][24]。
- **刻印表示**: 物理キー→刻印の API は Chromium・HTTPS 限定 [27][28]。他ブラウザは推定が要る。
- **IME/全角半角**: IME 中は 229/"Process" で文字が取れない。半角/全角は `Backquote` 1 キー [16][31][32]。
- **CapsLock**: macOS で keydown/keyup が対にならない [35]。`key` は大文字化、`code` は不変 [24]。
- **リピート**: 250 ms〜1 s 後に 2.5〜30 回/秒の keydown [29][30]。
- **遅延**: キーボード単体 15〜60 ms、ポーリングは 1〜8 ms の一部 [37][38]。
- **衝突**: 鍵盤モードは単文字ショートカットを奪う [1][6]。数字段を黒鍵にすると数字入力と衝突。
- **人間工学**: 段ずれで上下対応が斜めになり、黒鍵段の位置関係が実ピアノと異なる [17]。
- **法務**: 機能名は各社のもの。配列自体への権利主張は見当たらない（本調査範囲、推測）。

## 問い

- FL Studio の現行配列は UFLVK-Emu の列挙 [8] と一致するか（公式図テキスト無し）。
- LMMS 現行版の黒鍵段を含む割り当て [10][11]。
- JIS 記号キーと code の対応は W3C 図の読み取りで、本文確認未了 [16]。
- IME ON で非編集要素（canvas）にフォーカス時、Windows の各ブラウザで keydown の `code` が通常通り届くか。
- IME 変換中（key="Process"）に `code` が物理キーを保持するか [32]。
- Mac JIS の かな/英数 がイベントを出さない [26] ことが、プレイ中の誤操作で問題になるか。
- e-typing のキーボード図・指ガイド、Sky の PC 割り当て [47][49]。
- Regensburg 論文の機種別数値（PDF が大きく未読）[41]。
- 対象曲の和音で必要な同時押し数と 4〜6 キー上限の関係。

## 出どころ一覧

1. https://www.ableton.com/en/live-manual/12/routing-and-i-o/
2. https://help.apple.com/logicpro/mac/10.4/en.lproj/lgcpb19cbd34.html
3. https://www.dummies.com/article/technology/software/music-recording-software/logic-pro-x/how-to-record-midi-in-logic-pro-x-with-musical-typing-147775/
4. https://raw.githubusercontent.com/pedrolcl/drumstick/master/library/widgets/pianokeybd.cpp
5. https://svnlliurexnet.gva.es/leia/mods-i18n/trunk/vmpk/data/help.html
6. https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/basics_shortcuts.htm
7. https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/toolbar_panels.htm
8. https://github.com/tpbeldie/UFLVK-Emu
9. https://hoard.reaperaccessibility.com/Tutorials%20and%20Demos/Text/Virtual%20MIDI%20Keyboard%20keystrokes%20by%20Scott.txt
10. https://docs.lmms.io/user-manual/resources/key-mappings
11. https://lmms.io/forum/viewtopic.php?t=26318
12. https://archive.steinberg.help/nuendo/v10/en/cubase_nuendo/topics/virtual_keyboard/virtual_keyboard_virtual_keyboard_options_r.html
13. https://www.rentio.jp/matome/keyboard-array/
14. https://deskthority.net/wiki/JIS
15. https://www.elecom.co.jp/pickup/contents/00056/basic10/
16. https://www.w3.org/TR/uievents-code/
17. https://deskthority.net/wiki/Staggering
18. https://en.wikipedia.org/wiki/Keyboard_layout
19. https://deskthority.net/wiki/Unit
20. https://deskthority.net/wiki/Rollover,_blocking_and_ghosting
21. https://en.wikipedia.org/wiki/Rollover_(key)
22. https://forum.image-line.com/viewtopic.php?p=1113973
23. https://forest.watch.impress.co.jp/docs/serial/sspcgame/1591456.html
24. https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
25. https://developer.chrome.com/blog/keyboardevent-keys-codes/
26. https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
27. https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap
28. https://docs.w3cub.com/dom/keyboard/getlayoutmap
29. https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat
30. https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfoa
31. https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing
32. https://azukiazusa.dev/blog/ime-enter-submit.md
33. https://github.com/bluesky-social/social-app/pull/4186
34. https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState
35. https://jira.apache.org/jira/browse/GUACAMOLE-1823 ／ https://lists.webkit.org/pipermail/webkit-dev/2012-December/023152.html
36. https://docs.iced.rs/iced/keyboard/key/enum.Code.html
37. https://danluu.com/keyboard-latency/
38. https://www.monsgeek.com/blog/keyboard-polling-rate-guide/
39. https://cdn.sparkfun.com/assets/a/9/b/6/2/MX2A_RED-Datasheet-EN_US.pdf ／ https://www.farnell.com/datasheets/2301155.pdf
40. https://rtings.com/keyboard-switch/learn/research/launch-article
41. https://hci.uni-regensburg.de/_export/raw/publications/on_the_latency_of_usb-connected_input_devices_2019
42. https://wooting.io/post/what-is-wootings-rapid-trigger-for-analog-keyboards
43. https://attackshark.com/blogs/knowledges/rapid-trigger-rhythm-games-guide
44. https://sushida.net/
45. https://ja.wikipedia.org/wiki/寿司打
46. https://ja.wikipedia.org/wiki/ザ・タイピング・オブ・ザ・デッド
47. https://www.e-typing.ne.jp/help/
48. https://www.wepc.com/news/genshin-impact-lyre-songs-notes/0 ／ https://www.gamerguides.com/genshin-impact/guide/gadgets
49. https://www.ginx.tv/en/how-to-play-music-challenge

## 検証結果

検証日 2026-10-23。確かめ役が各事実の出どころ URL を WebFetch で読み、記述と照合した（WebSearch は予算切れで使えず、追加確認はすべて WebFetch の一次資料で行った）。判定・提案は書かない。

| # | 事実 | 結果 | 備考 |
|---|---|---|---|
| 1 | Ableton Live 12: 中段白鍵 C3 から、上段黒鍵、Z/X オクターブ、C/V ベロシティ 20 刻み、M で切替、単文字ショートカットは Shift+S | **confirmed** | 17.3.2 の本文と一致。"The center row of letter keys … beginning on the left with the note C3"、"The black keys on a piano correspond to the upper row of computer keys"、"(C and V) adjust incoming note velocity by intervals of twenty"、"use the M shortcut"、"it will "steal" keys"、"adding Shift, e.g., ShiftS"。本文は上段の文字 W E T Y U を列挙していない（図からの読み取り）。 |
| 2 | Logic Pro Musical Typing: Z/X、C/V、4–8 モジュレーション（3 で OFF）、1/2 ピッチベンド、Tab サスティン | **confirmed** | 本文と一致。音名図のテキストは本文に無い（調査ファイルの記述どおり）。 |
| 3 | VMPK/drumstick `g_DefaultKeyMap`: Z S X D C V G B H N J M → 12〜23、Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P → 24〜40。ES/DE/FR マップ、生キーコード、XML 保存 | **confirmed** | pianokeybd.cpp の 30 項目が列挙どおり。同ファイルに `g_DefaultRawKeyMap`（Q_OS_LINUX / Q_OS_WIN / Q_OS_MAC で切替、11〜48）。ES/DE/FR マップと XML 読み書きは cpp ではなく VMPK help.html（出どころ [5]）に "Some maps for Spanish, German and French keyboard layouts are provided"、"options to load and save the maps as XML files"、"about two and half octaves" とある。 |
| 4 | FL Studio: Ctrl+T、ON 中は単キーショートカット無効、Alt+テンキー 2–6 でオクターブ。Root Note / Octave / Standard keyboard layouts / Snap to scale。配列図は公式に無く、UFLVK-Emu が中央 37 キーを列挙 | **confirmed** | basics_shortcuts.htm: "Single key shortcuts will only work when 'Typing keyboard to piano' (Ctrl/Cmd+T) is OFF"、"Alt/Opt+Number-Pad 2-6: Change octave of typing keyboard"。4 オプションは toolbar_panels.htm（出どころ [7]）に列挙。UFLVK-Emu README は 17+20=37 キーを "Identical FL Studio Key Mapping" として列挙し、About で FL 本体を "centric area (37 buttons)" と記す。 |
| 5 | W3C UI Events code: JIS 106 のキー追加・スペース短縮・入力モードキー 3 つ、各キーの位置と名称 | **corrected** | §2.1.7・§3.1.1・§3.7 で IntlYen（= と Backspace の間、¥）、IntlRo（/ と右 Shift の間、\ろ）、Backslash（]む）、Backquote＝半角/全角/漢字、NonConvert＝無変換、Convert＝変換、Mac の Lang1＝かな、Lang2＝英数 を確認。**訂正**: 仕様は `KanaMode` の刻印を「カタカナ/ひらがな/ローマ字」と書き、「かな」とは書かない（「かな」は Mac の Lang1）。 |
| 6 | Deskthority Staggering: 1/2・1/4・1/2 の二重スタッガー、タイプライター起源。1u≈19 mm（3/4 インチ） | **confirmed** | Staggering: "The offsets are 1/2 key, 1/4 key and 1/2 key respectively"、"double staggered"、"to allow equal distance between the arms"。1u の数値は Staggering 頁に無く、Unit 頁（出どころ [19]）に "about 19 mm or ¾ inch"、ISO 1091（19 mm ± 1 mm）は 1994 年に撤回、「現行の国際規格は無い」、DIN 2137-2 が暫定、とある。19.05 mm と 1/4u≈4.8 mm は換算（¾ in = 19.05 mm）。 |
| 7 | ゴースト（四角形 3 隅→4 隅目）、USB HID 互換プロトコルは 6 キー＋修飾、メンブレンは PCB 無しでダイオード不可→ブロッキング、全キー非分離は「よくある組み合わせで 4〜5 キー」 | **confirmed** | Deskthority: "three out of four keys are pressed within a square section of the matrix"、"the compatibility version of HID … limits USB keyboards to reporting a mere six regular keys together with four modifiers"、"Membrane keyboards … have nowhere to mount diodes"、"Keyboards without a PCB solve this problem using blocking"。「4〜5 キー」は Deskthority に無く Wikipedia Rollover (key)（出どころ [21]）の "This typically produces four- to five-key rollover for the most common key sequences"。Wikipedia はブートプロトコルを "eight modifier keys … maximum six key codes"（修飾は 8 ビット）と書く。 |
| 8 | MDN code: 物理キーで配列・修飾の影響なし、KeyQ は Dvorak で '／AZERTY で A、ゲーム向け、文字は key。刻印は getLayoutMap（実験的・HTTPS・Chrome 69+/Edge 79+ のみ） | **confirmed** | code 頁の本文と一致。getLayoutMap の記述は MDN getLayoutMap 頁（"Experimental"、"Secure context"、`get("KeyW")` の例）と MDN BCD api/Keyboard.json（getLayoutMap: chrome 69、edge は chrome を mirror＝Chromium 版 Edge 79 以降、firefox false、safari false、experimental: true）で確認。**補足**: MDN は `KeyboardEvent.code` 自体を "Limited availability / not Baseline" と表示。BCD では Chrome Android・Firefox Android が partial で "The value is always empty"（PC ブラウザは Chrome 48 / Firefox 38 / Safari 10.1 から）。 |
| 9 | MDN code 値表: Backquote 0x0029、IntlRo 0x0073、IntlYen 0x007D、Convert 0x0079、NonConvert 0x007B、KanaMode 0x0070。Mac の Lang1/2 はイベントが発火しない | **confirmed** | 表の値が一致。Mac 列は Lang1＝kVK_JIS_Kana (0x68)、Lang2＝kVK_JIS_Eisu (0x66) に "⚠️ No events fired actually"（凡例: "no event will be dispatched"）。Convert / NonConvert / KanaMode は Mac 表に項目が無い。 |
| 10 | IME 中の keydown は keyCode 229 / key "Process"。isComposing は compositionstart〜end で true だが開始直後・終了直前は false なのに 229 のことがある。CapsLock は getModifierState、macOS Chrome は ON で keydown のみ・OFF で keyup のみ（未解決） | **corrected** | 出どころ記事（azukiazusa）にあるのは、keyCode 229（W3C 2010 keyCode-spec と VK_PROCESSKEY 0xE5）、isComposing の定義、Safari が確定用 keydown より先に compositionend を送るため確定 Enter で isComposing が false なのに keyCode 229、の 3 点のみ。記事に key "Process"、CapsLock、getModifierState、macOS Chrome の記述は無い。**訂正と補強**: (a) key "Process" は W3C uievents-key §3.8（"The Process key"、required ではない）と MDN key values（VK_PROCESSKEY 0xE5）に定義があるが、MDN 脚注は "The Process key currently returns "Unidentified" in Firefox. Google Chrome returns the value of the key as if IME were not in use" と書き、ブラウザごとに値が異なる（脚注の現行性は未確認）。(b) 「開始直後」: W3C UI Events §3.6.5 の表で、composition を開始する keydown は compositionstart より前に発火し isComposing が false、終了する keydown は true、compositionend 後の keyup は false。§7.3.1 に "If an Input Method Editor is processing key input and the event is keydown, return 229"。「終了直前に false」は仕様では起きず、Safari 固有（MDN BCD: Safari は partial、"keydown and input fire after compositionend, so isComposing is false"、WebKit bug 165004 / 317127）。(c) CapsLock: MDN getModifierState は Baseline Widely available（2017 年 3 月〜）、CapsLock の欄は "During LED for ⇪ Caps Lock turned on" / "Not supported" / "While CapsLock is locked"（列の対応はテキストから読めない）。(d) macOS Chrome: Apache Jira GUACAMOLE-1823 "Unreliable CapsLock on MacOS Chrome" に "Chrome on MacOS sends only a single keydown event when turning on caps-lock, and only a single keyup event when turning off caps-lock"。ただし同チケットは **Closed / Fixed（2025-09-13、Fix Version 1.6.1）** で「未解決」は古い。修正は Guacamole 側の quirk（capsLockKeyupUnreliable）で、Chrome 自体の変更有無はチケットに書かれていない。WebKit 2012 年スレッドは 403 で読めず未確認。 |
| 11 | repeat は Baseline 2025（2025 年 5 月〜）。Windows 既定のリピート: 遅延 0〜3（約 250 ms〜1 s）、速度 0〜31（約 2.5〜30 回/秒、±20%） | **confirmed** | MDN repeat 頁: "Baseline 2025 / Newly available / Since May 2025"。BCD: Chrome 137（32〜136 は「最後に押したキーで repeat が誤って false」のバグ、bug 40940886。Linux X11 は 139 まで）、Firefox 28、Safari 10.1。Microsoft Learn: SPI_GETKEYBOARDDELAY "0 (approximately 250 ms delay) through 3 (approximately 1 second delay)"、SPI_GETKEYBOARDSPEED "0 (approximately 2.5 repetitions per second) through 31 (approximately 30 repetitions per second)"、"may vary from a linear scale by as much as 20%"。 |
| 12 | Dan Luu 実測: Apple Magic 15、HHKB Lite2 20、K120 30、Ornata 35、Kinesis 50、K360 60 ms。8 ms ポーリング平均 4 ms、1 ms なら 0.5 ms。キー移動 10 ms 以上、走査・デバウンス。Cherry MX バウンス ≤5 ms | **corrected** | Dan Luu の表（apple magic 15、hhkb lite 2 20、logitech k120 30、razer ornata chroma 35、kinesis advantage 50、logitech k360 60 "unifying"）、測り方（"from when the key starts moving to the time when the USB packet … makes it out onto the USB bus"）、4 ms / 0.5 ms、"can easily add 10ms of delay (or more …)"、"scaning the keyboard matrix and debouncing" はすべて一致。**訂正**: 「Cherry MX のバウンス ≤5 ms」は Dan Luu の記述ではない（記事は反論対象の引用 "the debounce delay is 5ms" と Apple 2e の "roughly 6ms" のみ）。Cherry 公式 MX2A RED データシート（出どころ [39] SparkFun PDF、pdftotext で抽出）は MX2A_L1NA / L1NB / L1NN / L1NW の各仕様表に "Bounce time 5 ms" と記す（「≤」や「0.4 m/s」の条件はこの PDF の表に無い）。旧 MX データシート（Farnell PDF、"≤5 ms at 0.4 m/s" の出所）は 3 回タイムアウトで未確認。 |

補足（検証中に見つかった、事実表に無い点）:
- Deskthority Rollover 頁は 6KRO の修飾を "four modifiers"、Wikipedia は "eight modifier keys" と書く（USB ブートレポートの修飾バイトは 8 ビット）。
- MDN BCD の `isComposing` は Safari が partial（確定キーで keydown が compositionend 後に発火）。
- WebFetch 不可だった URL: lists.webkit.org（403）、farnell.com datasheet（timeout）、jira.apache.org（DNS 不可、issues.apache.org で代替）。
