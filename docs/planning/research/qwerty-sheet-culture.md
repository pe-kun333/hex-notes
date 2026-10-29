# キー文字で書く楽譜の文化と音域の収め方の慣例

調査日: 2026-10-23（調査役）。判定・採否・提案はしない。

**調査条件の注記**: 本ターンは WebSearch の予算が既に使い切られており、検索は一度も実行できなかった。既知の URL への WebFetch のみで集めている。virtualpiano.net（403）、Fandom 系 wiki（402）、Reddit、Roblox ヘルプセンター（403）、HoYoverse 規約（SPA で本文取得不可）、Web Archive は読めなかった。読めなかった範囲は「記憶ベース・未確認」と明記し、数値は出典のあるものだけ書く。

## 事実

### Virtual Piano（virtualpiano.net / Recursive Arts）
- Similarweb の推定（2026 年 9 月データ）: 直近 3 か月の合計訪問 1.3M、前月比 −12.64%、世界ランク #39,749、米国ランク #25,386。国別は米国 30.93%、ブラジル 6.3%、インド 4.52%、フィリピン 4.08%、インドネシア 3.34%。月次の単独値はページに無い。出どころ: https://www.similarweb.com/website/virtualpiano.net/
- Recursive Arts 本家のピアノページには鍵割り当てが 2 種ある。REAL は実ピアノの白鍵・黒鍵配置で 3 オクターブ、MAX は Shift で黒鍵を押し 5 オクターブ。インタラクティブ曲は 37 曲（本編 29 + クリスマス 8）で、曲モードは LED 点灯で次の鍵を示す。利用者数の記載なし。出どころ: https://recursivearts.com/virtual-piano/
- Recursive Arts の利用規約は recursivearts.com 向けで virtualpiano.net に言及がない。投稿譜面の帰属・DMCA 窓口・ボット禁止の条項は見当たらない（「素材の改変・複製・外部サイトへの埋め込み」の制限のみ）。出どころ: https://recursivearts.com/terms-of-service.html
- **記憶ベース・未確認**（公式ページが 403 で読めず）: virtualpiano.net の Music Sheets 記法は、小文字＝白鍵、大文字（Shift+文字）＝黒鍵、`[ ]` 内は同時押し、スペースで順次、`|` や `-` で間を取る、という書き方。曲数（数千規模と記憶）・r/VirtualPiano の会員数・Discord の人数は今回取得できなかった。

### Sky（星を紡ぐ子どもたち）の譜面文化
- 譜面は「音高ではなく押す鍵を示すタブ譜」と明言。鍵は 3 行 × 5 列で A1〜A5 / B1〜B5 / C1〜C5 と呼ぶ（ABC1-5 記法）。色は行の区別のみ。明→暗の色の並びは速いパッセージ、中央に点のある空白は休符。「譜面はファンによる解釈なので、曲のリズムを知っていると読みやすい」。出どころ: https://sky-music.github.io/how-to-read.html
- sky-music.github.io の掲載数は約 206 件（重複 1 件を除くと 205 曲）: Anime 28 / Classical 14 / Movies 37 / Original 2 / Popular 65 / Traditional 22 / Videogames 38。日本語・中国語タイトルも混在。投稿は Discord 経由で運営が掲載。出どころ: https://sky-music.github.io/
- Python Sheet Maker（MIT, 2020 Tracey）: 入力は Sky 記法（ABC1-5）・英語音名（C1, D1…）・簡譜（1〜7 に + / − でオクターブ）・ドレミ（仏/日）・PC キー（QWERT / ASDFG / ZXCVB）。オクターブ番号無しは 1 扱い、楽器の音域は C1〜C3。SkyStudio のように C4〜C6 で数える流儀もあり、その場合は「オクターブシフト −3」を入力する。出どころ: https://raw.githubusercontent.com/sky-music/sky-python-music-sheet-maker/master/README.md
- 同ツールの記法: スペースで区切ると別の箱、スペース無しで和音（例 `A1A3A5`）、`.` は休符（簡譜は `0`）、`-` は色付き音（簡譜は `^`）、行末 `*2` で繰り返し、`#` で歌詞行、`==` で新しいレイヤー、`#$` でタイトル・作曲者・採譜者・キーのヘッダ。16:9 なら 1 行 8 箱が収まりが良い。出力は HTML/SVG/PNG、MIDI、JSON。出どころ: https://sky-music.github.io/make-your-own-sheet.html
- Web 版コンバータ: HTML/JSON/TXT/MIDI 相互変換。複数トラック MIDI の読み込み可。`==Layer title` でレイヤー分離。3×5 の旋律楽器と 2×4 の太鼓は同一譜面に混在不可。PlayStation / Switch のボタン表記レイアウトあり。出どころ: https://jmmelko.eu.pythonanywhere.com/
- Specy の Sky アプリの PC キーは Q W E R T / A S D F G / Z X C V B の 15 鍵。出どころ: https://sky-music.specy.app/keybinds

### 原神「風物の詩琴」の譜面文化（Specy Genshin Music のデータより）
- 21 鍵 3 行 × 7 列。MIDI 番号は上段 72,74,76,77,79,81,83 / 中段 60〜71 の自然音 / 下段 48〜59 の自然音で、黒鍵（半音）は無い（C3〜B5 相当、推定）。表示モードは Note name / Keyboard layout / Do Re Mi / ABC / 1 2 3 / No Text。出どころ: https://raw.githubusercontent.com/Specy/genshin-music/main/src/lib/games/genshin/game.json
- PC キーは Q W E R T Y U / A S D F G H J / Z X C V B N M の 21 鍵。出どころ: https://genshin-music.specy.app/keybinds
- 「晴れの日の詩琴（Vintage Lyre）」は同じ 21 鍵で、ラベル上は Db・Eb・Ab・Bb を含む別音階（do re mib fa so la tib / reb lab）。meta.json のラベルと MIDI 番号が食い違っているため、実機の音階は要確認。出どころ: https://raw.githubusercontent.com/Specy/genshin-music/main/src/lib/games/genshin/instruments/Vintage-Lyre/meta.json
- MIDI 取り込みの処方（音域の収め方の実装例）: 全体と各トラックの「音程オフセット」で移調、「臨時記号の音を 1 音下げて自然音だけの鍵盤に合わせる」オプション（「常に良く響くとは限らないので ON/OFF で聴き比べよ」と注意）、「表示範囲を超えた音を 1 オクターブ下げる」処理の回数指定、BPM は曲の 4 倍が既定（分解能のため）。出どころ: https://genshin-music.specy.app/blog/posts/midi-transpose
- 内部仕様: 各ゲームの `canonicalNoteIds` が音階を兼ね、MIDI インポータは「その音以下で最も近い ID に吸着」、リストに無い音名は臨時記号扱い。楽器ごとに音の集合が違ってよい（Vintage Lyre の例）。出どころ: https://raw.githubusercontent.com/Specy/genshin-music/main/docs/adding-instruments-and-games.md
- 譜面 JSON: ノートは音高ではなく「鍵の位置 index」（Genshin は変換配列 `[6,5,4,3,2,1,0,13,…]` で実鍵へ写像）、`layer` はビットフィールド、composed は 1 列 = 1 拍の `[tempoChanger, notes]`、recorded は `[index, time, layer]`。曲全体の `pitch` は C〜B の 12 種（移調）。Sky は Genshin 譜面を読めないが逆は可。出どころ: https://github.com/Specy/genshin-music/wiki/Exported-Music-sheet-format
- ライセンス AGPL-3.0。出どころ: https://raw.githubusercontent.com/Specy/genshin-music/main/LICENSE
- **記憶ベース・未確認**: 原神・Sky の日本語コミュニティでは、譜面を画像（鍵配置の図に順番を振る）か、ドレミ表記に「↑↓」でオクターブを添える形で Twitter/X や note に共有する慣例があると記憶しているが、今回確認できなかった。

### Rock Band 3 Pro Keys（先行例）
- トラックは `PART REAL_KEYS_X/H/M/E`。演奏音は MIDI 48〜72 の 25 鍵（2 オクターブ、クロマチック）。範囲シフトマーカーは 6 種（MIDI 0=C1–E2, 2=D1–F2, 4=E1–G2, 5=F1–A2, 7=G1–B2, 9=A1–C3）、譜面冒頭に初期範囲を置く。画面には 25 鍵のうち 17 鍵（白鍵 10 + 黒鍵 7）を同時表示し、範囲外の音はシフトが必要。同時発音は最大 4 音。トリル(127)は「一定以上速く交互に押せば命中」、グリッサンド(126)は区間の採点を無効化（Expert のみ）。出どころ: https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/mid-format/Tracks/Pro-Keys/
- アニメ用トラック `PART KEYS_ANIM_LH/RH` は 3 オクターブ、中央オクターブを左右の手が共有。出どころ: https://thenathannator.github.io/GuitarGame_ChartFormats/Implementation-Specific/Rock-Band/MIDI-Tracks/Pro-Keys/
- Wikipedia（出典付き）: Easy/Medium は表示範囲固定、Hard/Expert は曲に応じて範囲が動き、矢印で事前に予告。押した鍵のレーン全体をハイライト（正誤に関わらず）し、5 鍵ごとの色分けを実機のマーキングと揃える。Basic モードは中央 C〜G の白鍵 5 つ。トレーナー専用曲 60〜80 曲（Berklee と共同）。出どころ: https://en.wikipedia.org/wiki/Rock_Band_3
- Kotaku 試遊記: キーボードのハイウェイは 10 レーン幅（ギター・ドラムは約 5）。4 人編成では画面下半分を分け合うためさらに狭い。黒鍵は黒いノートで表示され視認性が落ち「音ゲー史上もっとも視力を酷使する機能」。矢印でオクターブ移動を予告するが「1 オクターブ以上は滑らせられない」。出どころ: https://kotaku.com/the-good-and-worrisome-about-rock-band-3s-keyboard-5614510
- Engadget（旧 Joystiq）試遊記: Easy は同じ 5 本指を同じ 5 鍵に置いたまま、難易度が上がると演奏域が広がりノートバーが左右に動く。色分けに慣れるのに「経験者でも 20〜30 分」と Harmonix が想定。出どころ: https://www.engadget.com/2010-08-17-preview-rock-band-3-keyboard-pro-keys-and-keys-trainer.html
- Harmonix 公式の設計記事（rockband.com/zine/rb3-features-pro-keys, 2010-08-18）は Web Archive が読めず未確認。
- 判定幅: Rock Band 3 本体の ms 値は今回出典を得られず。互換 OSS の YARG は Default/Casual がヒットウィンドウ 140 ms 固定、Precision は 130 ms から最小 40 ms へ動的に縮む（全楽器共通、ゲームモードで差あり）。HOPO 猶予 80 ms、ストラム猶予 50/70/40 ms。出どころ: https://wiki.yarg.in/wiki/Hit_engine

### KEYBOARDMANIA と、鍵盤音高に忠実な落下ノート音ゲー
- KEYBOARDMANIA（Konami, 2000-02 稼働）: ヤマハ製 2 オクターブ 24 鍵 + ホイール、判定 GREAT/GOOD/MISS、長押しノートあり、HI-SPEED 1〜4 倍、LIGHT モードは 12 鍵（2ndMIX から）。出どころ: https://ja.wikipedia.org/wiki/KEYBOARDMANIA ／ 英語版は音域 C3〜B4 と記載: https://en.wikipedia.org/wiki/Keyboardmania
- ノスタルジア（Konami, 2017-03-01 稼働）: 判定は ◆JUST / JUST / GOOD / NEAR / MISS、難易度 Normal/Hard/Expert/Real。ノーツは「鍵盤風デバイス 2〜10 個分の幅があり、その範囲内ならどこを押しても反応」。つまり音高に厳密ではない設計。出どころ: https://ja.wikipedia.org/wiki/ノスタルジア_(音楽ゲーム)
- Synthesia: ノートがピアノ鍵盤へ落ちる表示。ラベル設定に「Virtual piano mapping（デジタルピアノ未接続時に押すタイピングキーを表示、非英語配列向けにカスタム可）」「English note names（調に応じた綴り）」「Scale numbers（調の度数、音階外は無表示）」「Fixed-do / Movable-do」「Simple names（白鍵のみ A〜G）」「Octaves」「Finger hints」があり、鍵と落下ノートの両方に出せる。出どころ: https://synthesiagame.com/support/guide/labels ／ 両手分割は手動（Split From Here で境界を引き、個別に割当）: https://synthesiagame.com/support/guide/assignHands ／ 同梱 150 曲 + 任意の MIDI、メロディ練習は正しい音を待つ: https://synthesiagame.com/
- Rocksmith+: 1 サブスクでギター・ベース・ピアノを学べ、2026 年 10 月の配信曲にもピアノ編曲が含まれる。ピアノの表示方式・入力方式は公式ページから確認できず。出どころ: https://www.ubisoft.com/en-us/game/rocksmith/plus
- Specy アプリの VSRG モード: 4 鍵（ASJK）/ 6 鍵（ASDHJK）の抽象レーンで、楽器の音高とは対応しない。背景曲から「Generate beatmap」で難易度（Easy/Normal/Hard）とレーン数を選んで自動生成し 1〜10 で評価。判定は「ノートが底に着く瞬間に近いほど高得点」で、厳しさは作曲側の Difficulty 設定。ms 値の記載なし。出どころ: https://genshin-music.specy.app/blog/posts/how-to-create-a-beatmap
- Clone Hero FAQ: 「複数キーが同時に登録されない」のはキーボードゴースティングという hardware 制限で、配置を変えるか n-key rollover 対応キーボードを買う、と案内。出どころ: https://wiki.clonehero.net/link/40

### 文字譜（letter notes）サイトと YouTube
- LetterNotePlayer: 曲名に「RH Melody」「LH Chords」「Single-Note Bass」の区分。フッターに「歌詞は権利者の所有物」「教育・リズム・個人利用に限る」。出どころ: https://www.letternoteplayer.com/
- NoobNotes: 「耳コピした個人的解釈」を文字で書き歌詞と並べる、初心者向け。記法の説明ページなし、著作権表記なし。出どころ: https://noobnotes.net/about/
- **記憶ベース・未確認**: YouTube の「piano letter notes」「ドレミ付き」動画は、Synthesia 風の落下ノートに音名やドレミを重ねる形が多く、キー文字（QWERTY）を表示する例は Virtual Piano / Roblox 向け動画に見られると記憶しているが、今回 YouTube を取得できず確認していない。
- Roblox のピアノゲーム（Talent Show、Piano Keyboard v1.1 など）と譜面サイト・自動演奏スクリプトの扱いは、譜面サイト・Roblox 規約ともに読めず**未確認**。Roblox 内ピアノは Virtual Piano と同じ鍵割り当てを採用しているという記憶がある（未確認）。

## 事例

| 名前 | 何をしているか | URL | この企画への含意 |
|---|---|---|---|
| Virtual Piano（Recursive Arts） | PC キー文字で弾くブラウザピアノ。REAL（3 オクターブ実配置）/ MAX（Shift 黒鍵・5 オクターブ）、LED で次の鍵を示す曲モード | https://recursivearts.com/virtual-piano/ | キー文字譜の事実上の標準。企画の鍵割り当てと互換にするかは論点 |
| Sky Music（sky-music.github.io）+ Python Sheet Maker | 15 鍵を ABC1-5 で書くタブ譜。PC キー入力、簡譜・ドレミ・英語音名からの変換、レイヤー、PS/Switch 表記 | https://sky-music.github.io/ | 「位置を書く譜」と「音を書く譜」の変換層を別に持つ構造 |
| Specy Genshin/Sky Music Nightly | 21/15 鍵の作曲・練習・VSRG。MIDI 取り込みで移調・臨時記号 1 音下げ・オクターブ折りたたみ回数を指定 | https://genshin-music.specy.app/ | 音域の収め方を「オプション」として利用者に選ばせる実装例 |
| Rock Band 3 Pro Keys | 25 鍵のうち 17 鍵を表示し、6 種の範囲シフトを矢印で予告。Easy は 5 鍵固定 | https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/mid-format/Tracks/Pro-Keys/ | 表示窓を動かして音域を収める方式の先行例と、その視認性の苦情 |
| YARG | RB 互換 OSS。ヒットウィンドウ 140 ms 固定 / 130→40 ms 動的 | https://wiki.yarg.in/wiki/Hit_engine | 判定幅の参考値（公式 RB3 の値ではない） |
| KEYBOARDMANIA / ノスタルジア | 24 鍵実機で落下ノート／ノーツ幅 2〜10 鍵でどこを押しても可 | https://ja.wikipedia.org/wiki/KEYBOARDMANIA | 「音高に厳密」と「幅で許容」の両極 |
| Synthesia | 落下ノート + 鍵と音符へのラベル（音名・度数・ドレミ・タイピングキー） | https://synthesiagame.com/support/guide/labels | 六角セルに何の文字を出すかの選択肢の一覧として使える |
| Rocksmith+ ピアノ | サブスク型でピアノ編曲を配信 | https://www.ubisoft.com/en-us/game/rocksmith/plus | 鍵盤音高に忠実な商用の現役例（表示方式は未確認） |
| GuitarGame_ChartFormats | RB/CH 系譜面形式の CC0 文書 | https://github.com/TheNathannator/GuitarGame_ChartFormats | モック用に譜面形式を借りるときの一次資料 |
| LetterNotePlayer / NoobNotes | 文字音名を歌詞に添えて配布。RH/LH を曲名で分ける | https://www.letternoteplayer.com/ | 両手分担を「曲の版」で分ける慣例 |
| Clone Hero FAQ | キーボードゴースティングの説明と NKRO 推奨 | https://wiki.clonehero.net/link/40 | 同時押しの技術制約 |

## 類推
- ギターの TAB 譜・オカリナやハーモニカの穴番号譜: 「音高」でなく「押す場所」を書く譜は、楽器が固定されるほど普及する。Sky の how-to-read が自らを tablature と呼ぶのと同じ線。
- 簡譜（数字譜）と移動ド: Specy の「1 2 3」表示、Sheet Maker の簡譜入力は、調を C に移してから数字で書く中華圏の慣例の流入。移調を前提にすれば「黒鍵なし」でも大半の旋律が書ける。
- ゲームパッドのボタン表記（PS/Switch アイコン）: 同じ譜面を入力装置ごとに別のラベルで描く発想は、六角セルに表示する文字を「キー文字／音名／ドレミ」で切り替える設計と同型。
- カラオケ字幕: 歌詞と文字音名を並べる letter-notes サイトは、譜面よりも「歌詞に同期した文字列」に近い。

## 制約
- 技術: キーボードゴースティング（同時押しの取りこぼし）は hardware 制限で、NKRO 対応機以外では和音数に上限が出る（Clone Hero FAQ）。Shift で黒鍵を表す方式は Shift 自体が 1 キーを占め、同時押しの組合せを制限する（Recursive Arts MAX の仕様から導かれる推測）。
- 表示: 17 鍵でも「視力を酷使」「黒鍵ノートが見づらい」「4 人表示でさらに狭い」（Kotaku）。範囲シフトは矢印で予告しても「1 オクターブ以上は滑らせられない」。
- 人間工学: Easy は 5 本指 5 鍵固定、色分けの習熟に 20〜30 分（Engadget）。
- 音楽: 自然音のみの楽器では臨時記号を 1 音ずらすしかなく「常に良く響くとは限らない」（Specy）。オクターブ折りたたみは回数指定が要る。
- 法務（確認できた範囲）: Recursive Arts の規約は virtualpiano.net を対象にせず、投稿譜面の権利や DMCA 窓口の条項が無い。LetterNotePlayer は「教育・個人利用に限る」免責のみ。Specy は AGPL-3.0、Sheet Maker は MIT、ChartFormats 文書は CC0。HoYoverse・Roblox・thatgamecompany の規約本文（自動化禁止・UGC 条項）は取得できず**未確認**。
- 法務（推測）: ファン譜面は編曲の二次著作物にあたり、譜面サイトの多くは権利処理の記載を持たない。企画で譜面を生成・共有するなら権利者対応の設計が別途必要（判断は主担当）。

## 問い
1. virtualpiano.net の記法（`[ ]`、`|`、大文字黒鍵）の公式定義と曲数・利用者数は、ブロック解除後に一次資料で確かめる必要がある。
2. Rock Band 3 本体の Pro Keys 判定幅（ms）は公式値が見つかっていない。YARG の 140 ms を代用してよいか。
3. 原神「晴れの日の詩琴」の実音階（Specy の meta.json はラベルと MIDI が不整合）。
4. 日本語圏（原神・Sky）の譜面共有で、両手分担・オクターブ・半音をどう書くのが多数派か（画像譜かドレミ↑↓か）。
5. Roblox のピアノゲームで自動演奏スクリプトが規約上どう扱われ、譜面サイトがそれをどう位置づけているか。
6. YouTube の「piano letter notes」「ドレミ付き」動画で、QWERTY キー文字をノートに重ねる例の頻度と視認性の工夫。
7. Rocksmith+ のピアノは落下ノートか譜面スクロールか、入力は MIDI か音声か。
8. 鍵盤音高に忠実な落下ノート音ゲーを「一般の PC キーボード」で遊ばせる現役の商用例は、Synthesia の Virtual piano mapping 以外にあるか。

## 出どころ一覧
- https://www.similarweb.com/website/virtualpiano.net/
- https://recursivearts.com/virtual-piano/
- https://recursivearts.com/terms-of-service.html
- https://sky-music.github.io/
- https://sky-music.github.io/how-to-read.html
- https://sky-music.github.io/make-your-own-sheet.html
- https://raw.githubusercontent.com/sky-music/sky-python-music-sheet-maker/master/README.md
- https://jmmelko.eu.pythonanywhere.com/
- https://sky-music.specy.app/keybinds
- https://genshin-music.specy.app/keybinds
- https://genshin-music.specy.app/blog/posts/midi-transpose
- https://genshin-music.specy.app/blog/posts/how-to-create-a-beatmap
- https://genshin-music.specy.app/blog/posts/how-to-use-player
- https://raw.githubusercontent.com/Specy/genshin-music/main/src/lib/games/genshin/game.json
- https://raw.githubusercontent.com/Specy/genshin-music/main/src/lib/games/genshin/instruments/Vintage-Lyre/meta.json
- https://raw.githubusercontent.com/Specy/genshin-music/main/docs/adding-instruments-and-games.md
- https://github.com/Specy/genshin-music/wiki/Exported-Music-sheet-format
- https://raw.githubusercontent.com/Specy/genshin-music/main/LICENSE
- https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/mid-format/Tracks/Pro-Keys/
- https://thenathannator.github.io/GuitarGame_ChartFormats/Implementation-Specific/Rock-Band/MIDI-Tracks/Pro-Keys/
- https://github.com/TheNathannator/GuitarGame_ChartFormats
- https://en.wikipedia.org/wiki/Rock_Band_3
- https://kotaku.com/the-good-and-worrisome-about-rock-band-3s-keyboard-5614510
- https://www.engadget.com/2010-08-17-preview-rock-band-3-keyboard-pro-keys-and-keys-trainer.html
- https://wiki.yarg.in/wiki/Hit_engine
- https://ja.wikipedia.org/wiki/KEYBOARDMANIA
- https://en.wikipedia.org/wiki/Keyboardmania
- https://ja.wikipedia.org/wiki/ノスタルジア_(音楽ゲーム)
- https://synthesiagame.com/
- https://synthesiagame.com/support/guide/labels
- https://synthesiagame.com/support/guide/assignHands
- https://synthesiagame.com/legal
- https://www.ubisoft.com/en-us/game/rocksmith/plus
- https://wiki.clonehero.net/link/40
- https://www.letternoteplayer.com/
- https://noobnotes.net/about/
- 読めなかった一次資料（要再取得）: https://virtualpiano.net/music-sheets/ 、https://virtualpiano.net/terms-of-use/ 、https://rockband.fandom.com/wiki/Pro_Keys 、https://genshin-impact.fandom.com/wiki/Windsong_Lyre 、https://www.reddit.com/r/VirtualPiano/ 、https://en.help.roblox.com/hc/en-us/articles/115004647846-Roblox-Terms-of-Use 、http://www.rockband.com/zine/rb3-features-pro-keys（Harmonix 設計記事、Archive 経由も不可）

## 検証結果

検証日: 2026-10-24（確かめ役）。対象 12 件の出どころ URL を WebFetch で読み直し、本文と照合した。本ターンは WebSearch の予算が共有上限に達しており一度も実行できなかったため、代替の一次情報は本ファイルに既に挙がっていた URL と、出どころページからたどれたページ（recursivearts の song-mode.html・keymapping.html）の範囲で確かめている。virtualpiano.net（/ と /music-sheets/）は引き続き 403。判定・提案はしない。

凡例: confirmed＝出どころに書かれている通り／corrected＝一部ずれ・出典の取り違えがあり訂正を付す／refuted＝出どころと食い違う／unverifiable＝確かめられなかった。

| # | 事実（要約） | 結果 | 補足・訂正 | 根拠 |
|---|---|---|---|---|
| 1 | Similarweb: 1.3M（直近 3 か月）、−12.64%、#39,749、国別 5 か国 | confirmed | 1.3M は見出し「Total Visits Last 3 Months」の下の値で 3 か月合計。−12.64% は「Last Month Change」（前月比で減少）。世界ランクは 3 か月で 34,911 → 39,749 に後退。米国ランク #25,386。国別 5 値は一致（各国に第 2 の値も並ぶがラベル不明、米国の第 1 値のみ desktop と注記）。月次単独値は無い。 | [a] |
| 2 | Recursive Arts: REAL 3 oct / MAX は Shift で黒鍵 5 oct、曲モードは LED で次の鍵、37 曲 | confirmed | keymapping.html: REAL は「Shift を押さずに黒鍵へ直接」で 3 オクターブ、MAX は「Shift で黒鍵、5 オクターブ全て」。song-mode.html: 赤 LED＝次に弾く音、緑＝今押す、青＝押し済み。伴奏は鍵を押すまで待つ（タイミングは自由、ルバート可、採点なし）。曲は 29 + クリスマス 8 = 37。 | [b][c][d] |
| 3 | Sky 譜面はタブ譜、3×5 を A1〜C5 で呼ぶ、色は行、明→暗は速い、点付き空白は休符、約 205 曲 | confirmed | how-to-read.html に「3×5」の明記は無く「ABC1-5 reference chart」と A3/B2/C4 の例のみ。3×5（A1〜A5／B1〜B5／C1〜C5）は Sheet Maker README と Specy Sky keybinds（15 鍵 QWERT/ASDFG/ZXCVB）で裏付け。205 曲は root の数（206 件、Pokémon Unite 1 件重複）。「ファンの解釈なので誤りがあり得る」は明記。root に「Discord で投稿」の明記は無く Discord へのリンクのみ。 | [e][f][g][h] |
| 4 | Sheet Maker: 入力 5 記法、音域 C1〜C3、SkyStudio 流は −3、無スペース和音、`.`、`*2`、`==`、`#$`、MIT | confirmed | 入力記法（Sky ABC1-5、English + オクターブ番号、Jianpu + / −、French/Japanese do ré mi + 番号、QWERT ASDFG ZXCVB）と MIT（(c) 2020 Tracey）は README 側に記載。make-your-own-sheet.html には C1–C3、−3、無スペース和音、`.`、`-`（色付き）、`*2`、`==`、`#$`、Jianpu は `0`/`^` が記載。 | [f][g] |
| 5 | Specy 原神: 21 鍵 3×7、MIDI 48〜83 自然音のみ、QWERTYU/ASDFGHJ/ZXCVBNM、表示切替 | confirmed | game.json: perRow 7、MIDI 48/50/52/53/55/57/59、60〜71、72〜83 の自然音のみ、bounds 48–83。表示は Note name / Keyboard layout / Your Keyboard layout / Do Re Mi / ABC / No Text / 1 2 3（既定: PC は Keyboard layout、モバイルは Do Re Mi、Sheet visualizer は No Text）。PC キー文字は game.json に無く keybinds ページに Q W E R T Y U A S D F G H J Z X C V B N M と平板に列挙（行分けは読み手の整理、再割当可）。 | [i][j] |
| 6 | Specy MIDI 取り込み: オフセット、臨時記号 1 音下げ、オクターブ下げ回数、内部は「以下で最も近い ID」に吸着 | confirmed | ブログ: 全体 note offset と default pitch、トラック別で上書き、「accidental を 1 音下へ」（常に良く響くとは限らず ON/OFF で聴き比べ）、「表示範囲を超えた音を 1 オクターブ（8 音）下げる試行回数」。「nearest id at or below に吸着」と「音階に無い音名は臨時記号扱い」は docs/adding-instruments-and-games.md 側の記述（ブログには無い）。 | [k][l] |
| 7 | 譜面 JSON: 位置 index、変換配列、layer ビットフィールド、composed 1 列 1 拍、recorded [index,time,layer]、pitch 12 種、AGPL-3.0 | confirmed | wiki に全て記載。変換配列 [6,5,4,3,2,1,0,13,…,7,20,…,14]。layer は 16 進文字列をビットフィールドとして読む（旧形式は "0011"）。ファイルは複数曲を配列で持つ。AGPL-3.0 は LICENSE ファイルで確認（wiki ページ自体には無い）。 | [m][n] |
| 8 | RB3 Pro Keys: MIDI 48〜72 の 25 鍵、17 鍵表示（白鍵 10 + 黒鍵 7）、6 種シフト、最大 4 音、トリル／グリッサンド | corrected | 出どころには「25 鍵中 17 鍵を同時表示」とだけあり、白鍵 10・黒鍵 7 の内訳は無い。白鍵 10 は Wikipedia の「ten white keys and the corresponding black keys」、黒鍵 7 は 17−10 の差し引き（C1–E2 区間の黒鍵は 7 なので整合はする）。他（48–72＝C1–C3、シフト 0/2/4/5/7/9＝C1–E2〜A1–C3、4 音、トリル 127 は 2 音トリル限定、グリッサンド 126 は Expert のみで採点無効）は一致。 | [o][p] |
| 9 | Wikipedia RB3: Easy/Medium 固定・Hard/Expert は矢印予告で移動、レーンハイライト、5 鍵色分け、トレーナー 60〜80 曲を Berklee と | corrected | 表示範囲・矢印・レーン全体ハイライト（正誤問わず）・5 鍵ごとの色分け（実機のマーク対応）は一致。「60〜80 曲」は Harmonix の Dan Sussman による Pro モード全体のトレーナー用に作った曲数で、鍵盤専用の数ではない。Berklee との共同開発もトレーナー全般（Pro モード節）の記述。一部は後に Rock Band Network に出た。 | [p] |
| 10 | Kotaku: 10 レーン、黒ノート、視力酷使、4 人で下半分、矢印・1 オクターブ以上は不可。Engadget: 20〜30 分 | confirmed | Kotaku: 「the keyboard highway is 10 lanes wide」（ギター・ドラムは約 5）、♯/♭は黒いノートで表示され難度が上がる、試奏のアマチュア奏者がどのレーンか判別に苦労、「music gaming's most eyesight-taxing feature yet」、4 人時は 4 本のハイウェイが画面下半分を分け合う、左右矢印でオクターブ移動を予告し「1 オクターブ以上は滑らせられない」。通常の鍵盤モードは 5 鍵のみでこの問題を避ける。Engadget: 色分けの位置に慣れるのに「経験者でも 20〜30 分」は Harmonix の見込みとして著者が伝聞。Easy は同じ 5 本指を同じ 5 鍵に置いたまま。 | [q][r] |
| 11 | YARG: 140 ms 固定、130→40 ms 動的、HOPO 80 ms、ストラム 50/70/40 ms | confirmed | ヒットウィンドウ表は「All」（全楽器）。HOPO 猶予 80 ms とストラム猶予 50/70/40 ms は 5-Fret 楽器の値（ノート無し時は 25/35/20 ms）。カスタム値は「ゲームモードごとに異なる」とだけあり楽器別の内訳は無い。RB3 公式の ms 値は本ターン検索不可のため引き続き未取得。 | [s] |
| 12 | KBM 24 鍵 C3〜B4、GREAT/GOOD/MISS、LIGHT 12 鍵。ノスタルジア 2017、2〜10 鍵幅、◆JUST〜MISS。Synthesia のラベル | confirmed | ja.wikipedia KBM: 2000-02-06 稼働、2 オクターブ 24 鍵 + ホイール、GREAT・GOOD・MISS の 3 段階、ロングノート、HI-SPEED 1x〜4x、LIGHT は 1 オクターブ 12 鍵で 2ndMIX から。en.wikipedia: 「Since there are 24 keys, the range is C3-B4」（Trivia 節）。ノスタルジア: 2017-03-01 稼働、ノート幅は鍵盤風デバイス 2〜10 個分で範囲内どこを押しても反応、判定 ◆JUST/JUST/GOOD/NEAR/MISS（NEAR は FORTE で追加）、本物の鍵盤は無し。Synthesia: Virtual Piano Mapping（デジタルピアノ未接続時のタイピングキー、自分の担当パートのみ表示）、English Note Names、Scale Number（度数、音階外は無表示）、Fixed-Do／Movable-Do、Simple Names、Octaves、Finger Hint。 | [t][u][v][w] |

集計: confirmed 10 / corrected 2 / refuted 0 / unverifiable 0。

### 根拠 URL
- [a] https://www.similarweb.com/website/virtualpiano.net/
- [b] https://recursivearts.com/virtual-piano/
- [c] https://recursivearts.com/virtual-piano/song-mode.html
- [d] https://recursivearts.com/virtual-piano/keymapping.html
- [e] https://sky-music.github.io/how-to-read.html
- [f] https://raw.githubusercontent.com/sky-music/sky-python-music-sheet-maker/master/README.md
- [g] https://sky-music.github.io/make-your-own-sheet.html
- [h] https://sky-music.github.io/ ／ https://sky-music.specy.app/keybinds
- [i] https://raw.githubusercontent.com/Specy/genshin-music/main/src/lib/games/genshin/game.json
- [j] https://genshin-music.specy.app/keybinds
- [k] https://genshin-music.specy.app/blog/posts/midi-transpose
- [l] https://raw.githubusercontent.com/Specy/genshin-music/main/docs/adding-instruments-and-games.md
- [m] https://github.com/Specy/genshin-music/wiki/Exported-Music-sheet-format
- [n] https://raw.githubusercontent.com/Specy/genshin-music/main/LICENSE
- [o] https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/mid-format/Tracks/Pro-Keys/
- [p] https://en.wikipedia.org/wiki/Rock_Band_3
- [q] https://kotaku.com/the-good-and-worrisome-about-rock-band-3s-keyboard-5614510
- [r] https://www.engadget.com/2010-08-17-preview-rock-band-3-keyboard-pro-keys-and-keys-trainer.html
- [s] https://wiki.yarg.in/wiki/Hit_engine
- [t] https://ja.wikipedia.org/wiki/KEYBOARDMANIA
- [u] https://en.wikipedia.org/wiki/Keyboardmania
- [v] https://ja.wikipedia.org/wiki/ノスタルジア_(音楽ゲーム)
- [w] https://synthesiagame.com/support/guide/labels

### 注記
- 対象外だが読んだついでに: 本文の「ヤマハ製 2 オクターブ 24 鍵」（KEYBOARDMANIA）について、英語版は Windows 版同梱の Yamaha EZ-250i にしか触れておらず、アーケード筐体の鍵盤メーカーは日英どちらの版でも明記が見つからなかった。
- recursivearts の Song Mode は「鍵を押すまで伴奏が待つ」方式で、タイミングを採点しない（企画の「タイミングよく押す」とは別物）。
- 検索予算が使えなかったため、virtualpiano.net の記法・曲数・コミュニティ規模、RB3 公式の判定幅は今回も未確認のまま。
