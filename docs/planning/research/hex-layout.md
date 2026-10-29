# 六角形セルと等方性（isomorphic）鍵盤配列

調査日 2026-10-23。英語の一次資料（Wikipedia・公式サイト・論文・特許）中心。日本語資料は少なく、途中で検索回数の上限に達した。推測・導出は〔推測〕〔導出〕と明記。判定はしない。

## 事実

### 等方性配列の一般則
- 等方性鍵盤＝音程の並びが「どこでも同じ形」になる 2 次元配列。移調不変性は全ての等方性配列が持ち、音律不変性は Wicki・Bosanquet など一部のみ。「教える・学ぶ・弾くのが容易」という主張は「厳密には検証されていない」と Wikipedia が明記 [1]。
- 六角格子の等方性配列は、隣接 6 方向のうち 2 方向の音程を決めれば残りが決まる（SE・SW を決めると N はその和の逆方向。Musix Pro はこの 2 音程で自作配列を定義）[2]。
- 正六角形は隙間なく平面を敷き詰め（各頂点に 3 枚）、内接円半径 r＝(√3/2)·R（R＝外接円半径＝辺長）、最大径＝2R [3]。

### 主な配列の隣接音程（半音数）
| 配列 | 隣接 6 方向 | 出どころ |
|---|---|---|
| Wicki–Hayden | 右 +2、右上 +7、左上 +5（左・左下・右下は符号反転）。行＝全音階、2 行で 1 オクターブ | [4][5][6] |
| Harmonic Table（AXiS の向き） | 上 +7、右上 +4、左上 +3。右向き三角＝長三和音、左向き三角＝短三和音 | [7][8] |
| Jankó | 右 +2、右上 +1、左上 −1。6 段、隣段は半音、同音が縦に 3 箇所 | [9][6] |
| Gerhard | 隣接は 1・3・4 半音、縦向き。Musix の定義は「−長3度／+短3度」。三和音が小さな弧になる | [6][10] |
| Park | Musix 定義「−短3度／+長2度、横向き」→ 隣接 2・3・5〔導出〕。W–H の変形で白鍵がまとまる | [10] |
| クロマチック・ボタン・アコーディオン C/B | 行方向 +3、対角 +1 と +2。B は C の鏡像。3〜5 列 | [5][11] |
| Bosanquet–Wilson（Lumatone 既定） | 横＝オクターブ内の音高、縦＝生成音程（5 度）の個数、1 オクターブ 12 段。全音＝右やや上、オクターブ＝水平（xen.wiki 要約） | [12][13] |
| LinnStrument／Launchpad（正方格子） | 右 +1、上 +5（4 度）。Launchpad Note mode は「chromatic fourths」 | [14][15] |

- Wicki は 1896 年バンドネオン用に特許（独 99324）、Hayden が 1986 年に独立に再発明し特許。欠点「鍵が半音階順でない」ので装飾音・経過音が直感的でない、利点「間違えても協和しやすい」。QWERTY 上では Qwertonic（1980 年代）、Relayer（QWERTY・AXiS-49 入力）[4]。
- Harmonic Table は Euler の Tonnetz（1739）と位相的に等価（せん断写像で対応）。Peter Davies が 1983 年に提案、1990 年国際特許。「長・短三和音は 1 本指で弾ける」[7]。
- Jankó は 1882 年。88 音を 264 鍵で覆い幅 89 cm（通常 123 cm）。教育者・演奏者・製造者の三者が動かず普及しなかった [9]。日本では大川ワタルのクロマトーン CT-312（2003 年、71 鍵、全音配列部はヤンコ式で鍵は円形）、「運指パターンが 1/12 になる」と主張。完成品は生産終了、教える場も少ない [16]。
- 1 オクターブに要する行数（jefftk）：ピアノ 7、Jankó 6、クロマチック・アコーディオン 4、Harmonic Table 3、W–H 2。鍵間隔はピアノ 23 mm、アコーディオン 20 mm、「ladies model」18 mm。「六角鍵盤はほとんど売れていない」[5]。
- 鍵数の代償（Tonnetzone）：Harmonic Table は 7 オクターブで 252 鍵（1 音 3 鍵）、All Fourths は 4 オクターブで 150 鍵、作者の Tonnetz 案は 120 鍵で 7 オクターブ余（1 音 1.4 鍵）。W–H は「和音の形が不快」で却下 [17]。

### 学習コストと支持者の主張・研究
- 支持者側：Lumatone「形が変わらないので理論を知らなくても耳で弾ける」[18]、Novation「学習時間は 12 分の 1 になりうる——答えは yes and no」。同記事は Buchla の「脳は 4〜5 個の塊を扱う」説を引き「等方性配列は物理的目印が無く視覚的手掛かりが要る」[15]。
- 慎重論：HN では「黒鍵の不均等な塊という目印が失われ、見ずに弾けない」「普及しないのは楽器が珍しいから」。学習時間の実測は誰も出していない [20]。Roger Linn は 4.5 半音オフセットの六角面を検討した上で「和音にも単旋律にも直感的でない」と正方格子を選んだ [14]。
- 実験：MacRitchie & Milne 2017（熟練音楽家 24 名）：長 2 度が隣接する配列は訓練・保持の正確さを上げ、せん断（音高軸を垂直化）は訓練成績を下げるが転移を助けた [21]。Stanford ら 2018：Wicki／Bosanquet と非等方版を比較、音楽家では等方性が転移を促進、非音楽家では混在 [22]。
- SOS の AXiS-49 評：「初期の学習曲線はとても緩やか」で 5 度・3 度と最初の和音はすぐ、非隣接の旋律音程（2・4・6 度・オクターブ）は時間がかかり、速いソロや両手独立は「数か月」[8]。

### 既存製品のセル寸法・視認性
- Lumatone：280 鍵、鍵幅 21 mm、鍵直径 24 mm、中心間距離 24.15 mm、本体 92×35.5×4.6 cm、10.8 kg、各鍵 RGB LED、US$3,995 [23]。
- AXiS-49：7×7 の六角ボタン 2 組＝98 鍵（各組 49 音）、$495。自然音は白・変化音は黒、D は水色・G♯ は濃青。ボタンの輪郭が隣接誤打を防ぐ。ラベルシール付属 [8]。C-Thru は廃業 [24]。
- Striso：61 鍵で 3.6 オクターブ、192×174×26 mm、425 g。配列は「Wicki–Hayden に近い」、♯と♭は別ボタン [25]。公式配列図を読むと右＝全音、左上＝完全 4 度、右上＝完全 5 度で、オクターブが真上に並ぶようせん断されている〔図からの導出 [26]〕。NIME 2014 の発表では DCompose と呼ばれる [27]。
- Exquis：六角パッド 61、146×317×36 mm、520 g、£248 [28]。HexBoard：140 鍵、GPL-3.0、配列の回転・鏡像、非 12-EDO 対応 [19][29]。Midihex：98+5 鍵、W–H や 31-TET にも書き換え可 [30]。
- Launchpad X：8×8＝64 パッド、241×241 mm。Overlap に Sequential／1〜5 finger、音階内は青・オクターブは紫、音階外は消灯 [15][32][33]。
- ポインタ対象の最小寸法：WCAG 2.2 SC 2.5.8 は「少なくとも 24×24 CSS px」、小さい場合は直径 24 px の円が他対象と重ならない配置を要求 [34]。

### 六角セルを UI に実装する数値（Red Blob Games）
- pointy-top：幅 w＝√3·size、高さ h＝2·size、横の中心間隔＝w、縦の中心間隔＝3/4·h。flat-top：幅＝2·size、横間隔＝幅×3/4、高さ＝√3/2×幅、縦間隔＝高さ [35][36]。
- 軸座標→ピクセル（pointy）：x＝size·(√3·q＋√3/2·r)、y＝size·(3/2·r)。隣接 6 方向（axial）：(+1,0)(+1,−1)(0,−1)(−1,0)(−1,+1)(0,+1)。cube 座標は q+r+s＝0、端数は 3 成分を丸め、誤差最大の成分を再計算（hex_round）[35][37]。
- 角の角度：flat は 60°·i、pointy は 60°·i+30° [36][37]。保存は axial、矩形マップは offset／doubled が便利だが offset 座標はベクトル加減算ができない [35]。
- 文字をセル内に収めるなら内接円径 √3·R が上限〔[3] からの導出〕。

### PC キーボードの千鳥配列と六角格子
- タイプライター由来の ANSI 配列は「ダブル・スタッガー」で行間のずれは 1/2・1/4・1/2 キー（最下段とその上が 1/2）。均等 1/4u はコンパクト機、1/2u は旧式・POS 機に多く、ortholinear はずれ無し。由来は機構で人間工学ではない [38]。キーピッチ 19.05 mm、等差ずれは「大抵 0.25u、まれに 0.5u」、Katana60 は 0.25u と 0.5u の混在 [39]。
- Plamondon の特許出願 US20090114078A1（優先日 2005、2009 公開、放棄）は英数キーボードを「実質的に六角形の配列」とみなして W–H を割り当てる（H＝長 2 度、V＝完全 4 度）。段ごとのずれの不均一には触れない [40]。
- 〔導出〕正六角格子は行ごとに 1/2 ピッチの均等ずれ＋行間 √3/2≈0.866 ピッチだが、ANSI は 1/2・1/4・1/2 ずれ＋行間 1.0 ピッチ。「上 2・下 2・横 2」の隣接位相は 1/2 ずれの段間（Z–A、Q–数字）では成り立つが、1/4 ずれの A–Q 間では上の 2 隣接が 3/4 と 1/4 の重なりで非対称になる。

## 事例
- **Lumatone**（Terpstra 系譜）：LED で音階を色分け、Bosanquet–Wilson 既定 [23][12][18]。含意：セル径 24 mm＋色分けが実機の視認性の基準値。Terpstra は 280 鍵の試作 2 台（2006–07）[41]。
- **C-Thru AXiS-49/64**：Harmonic Table、98 鍵、$495。学習曲線の実測的な記述がある数少ないレビュー [8]。含意：和音＝三角形は形で覚えられるが旋律は非隣接。
- **Jammer／Thummer**（Plamondon、2003 年考案、Thumtronics は 2009 年半ばに解散 [42]）：W–H。自作 Jammer「隣接 3 ボタンの中心を押して 1 本指で 3 音」[43]。含意：セル境界を跨ぐ入力の扱い。
- **Striso**：W–H 系のせん断配列、♯♭分離、61 鍵 [25][26]。含意：オクターブを垂直に揃える「せん断」は Milne らの実験でも転移に効いた変数 [21]。
- **HexBoard／Midihex／0x33.board**：OSS の六角 MIDI コントローラ [19][29][30][31]。含意：PC キーボード部品＋六角キャップの前例。
- **Musix Pro（Shiverware）**：W–H・Jankó・Harmonic・LinnStrument・Gerhard・Park のプリセット、2 音程で自作、Note Overlap で 1 タッチ 3 音、$9.99 [2][10][44]。ラベルは調で変えられず異名同音は常用の綴り固定 [45]。
- **Hex Player**（Milne ら NIME 2011）：仮想ボタンをせん断・回転してオクターブを垂直に揃え、音階内外で色分け [46]。含意：画面上の六角セルの「色＝目印」の先行例。
- **Launchpad Note/Scale mode・LinnStrument**：正方格子の等方性（4 度積み）[14][15][32]。含意：六角でなくとも等方性は成立し、Roger Linn は六角を明示的に退けた [14]。
- **Hexcells**（Matthew Brown、2014）：六角タイルの隣接 6 方向を数で示す論理パズル。ミニマルな配色が評価 [47]。**Hexa Hysteria**：六角形に配置した 6 レーンにノーツが流れ、タップ・フリック・長押し、曲によりレーンが回転・分割 [48]。**Oradea**（開発 RAT、未発売）：判定バーを六角形の 6 辺に分割し中心から外へノーツ。キーボードではフルコンボが難しいとしてコントローラ／タッチ推奨 [49]。含意：六角「レーン」の音ゲーはあるが、六角「セル＝音符」で等方性配列を扱う音ゲーは今回見つからなかった。
- **クロマトーン**（日本、Jankó 系）[16]。含意：国内の等方性鍵盤の普及実績と教える場の少なさ。

## 類推
- Red Blob の六角グリッド解説はゲーム向けだが、音名セルの描画・当たり判定（pixel→hex→round）にそのまま使える [35][37]。
- Launchpad の「音階外を消灯・ルートを別色」は、音ゲーで「次に押すキーだけ光らせる」提示への転用候補 [15][32]。
- Striso・Hex Player の「せん断でオクターブを垂直に」は、流れる譜面で同じ音名が同じ列に来る見やすさの手段 [25][46]。

## 制約
- 技術：六角格子は行間 √3/2・均等 1/2 ずれ、ANSI は行間 1.0・ずれ不均一で、画面の六角配置と物理配列は幾何学的に一致しない [35][38]〔導出〕。等方性配列はラベル固定で異名同音の綴りを調ごとに切り替えられない [45]。
- 人間工学：目印の欠如で視覚依存 [15][20]、隣接誤打の防止には輪郭が要る [8]、ポインタ対象は 24 px 以上 [34]。
- 学習：等方性の利点は音楽家で確認、非音楽家では混在 [22]。Harmonic Table では非隣接の旋律音程に時間がかかる [8]。
- 法務：Plamondon の出願は放棄済み [40]、Davies の Harmonic Table 特許は 1990 年（存続状況は未確認）[7]。
- 市場：六角鍵盤は「ほとんど売れていない」、C-Thru 廃業、Thumtronics 解散 [5][24][42]。

## 問い
- 画面上の六角セルと PC キーの対応をどう取るか（1/2 ずれの段間のみ六角とみなす、A–Q 間の非対称をどう扱う）は未検討。
- 画面上の六角セルの直径・隙間・文字サイズの実測値は見つからず（Lumatone 24 mm、WCAG 24 px のみ）。
- 等方性配列を音ゲーに使った事例とその評価データは見つからなかった。判定幅 ms・レイテンシの数値も本話題の資料には無い。
- DCompose の正式な音程定義（NIME 2014 論文本文）、Gerhard 配列の名の由来、Terpstra の「55 音／オクターブ」は一次資料で未確認。
- Hex Piano は見つからず（Hex MIDI [50] のみ）。Launchpad・AXiS-64 の実寸、日本語の六角グリッド解説・Lumatone 日本語レビューも未取得。

## 出どころ一覧
[1] https://en.wikipedia.org/wiki/Isomorphic_keyboard
[2] https://shiverware.com/musixpro/customization.html
[3] https://en.wikipedia.org/wiki/Hexagon
[4] https://en.wikipedia.org/wiki/Wicki%E2%80%93Hayden_note_layout
[5] https://www.jefftk.com/p/hexagonal-keyboard-layout-survey
[6] https://hw.s-ol.nu/0x33.board/layouts/
[7] https://en.wikipedia.org/wiki/Harmonic_table_note_layout
[8] https://www.soundonsound.com/reviews/c-thru-music-axis-49
[9] https://en.wikipedia.org/wiki/Jank%C3%B3_keyboard
[10] https://shiverware.com/musixpro/layouts.html
[11] https://en.wikipedia.org/wiki/Chromatic_button_accordion
[12] https://en.wikipedia.org/wiki/Generalized_keyboard
[13] https://en.xen.wiki/w/Standard_Lumatone_mapping_for_Pythagorean （検索要約のみ、本文未取得）
[14] https://www.rogerlinndesign.com/support/support-linnstrument-fourths-layout
[15] https://novationmusic.com/articles/ditch-the-keys-if-you-want-to-/
[16] https://ja.wikipedia.org/wiki/クロマトーン
[17] https://hackaday.io/project/168006/log/170050 （本体 https://hackaday.io/project/168006-tonnetzone-isomorphic-midi-keyboard）
[18] https://intercom.help/lumatone/en/articles/10200641-what-makes-an-isomorphic-keyboard-like-lumatone-special
[19] https://www.raspberrypi.com/news/hexboard-midi-controller-strikes-a-chord-with-rp2040/
[20] https://news.ycombinator.com/item?id=44673787
[21] https://doi.org/10.3390/app7121218 （MacRitchie & Milne, Applied Sciences 7(12):1218, 2017）
[22] https://doi.org/10.3390/app8122514 （Stanford, Milne & MacRitchie, Applied Sciences 8(12):2514, 2018）
[23] https://www.lumatone.io/details-specs
[24] https://hackaday.com/tag/harmonic-table-keyboard/
[25] https://www.striso.org/
[26] https://www.striso.org/static/strisoboard-reference.pdf
[27] https://nime2014.sched.org/event/R0pNra/striso-a-compact-expressive-instrument-based-on-a-new-isomorphic-note-layout （DCompose の呼称は https://cdm.link/squeezebox-future-playing-striso-video/ ）
[28] https://www.thomann.co.uk/intuitive_instruments_exquis.htm
[29] https://github.com/shapingthesilence/HexBoard
[30] https://www.pjrc.com/midihex-harmonic-table-midi-device/
[31] https://kbd.news/0xC.pad-0x33.board-1525.html
[32] https://www.bonedo.de/artikel/novation-launchpad-x
[33] https://novationmusic.com/products/launchpad-x
[34] https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
[35] https://www.redblobgames.com/grids/hexagons/ （v2: https://www.redblobgames.com/grids/hexagons-v2/）
[36] https://www.redblobgames.com/grids/hexagons-v1/
[37] https://www.redblobgames.com/grids/hexagons/implementation.html
[38] https://deskthority.net/wiki/Staggering
[39] https://zenn.dev/cheena_gb/articles/349a01b7fc71f2
[40] https://patents.google.com/patent/US20090114078A1/en
[41] https://www.synthtopia.com/content/2007/10/18/the-mysterious-terpstra-midi-keyboard/ ／ https://synthtopia.com/?p=52746
[42] https://encyclopedia.pub/entry/30493
[43] https://www.synthtopia.com/content/2009/08/15/the-jammer-a-mutant-midi-controller/
[44] https://wiki.shiverware.com/About
[45] https://shiverware.com/musixpro/gerhard/chords.html
[46] https://nime.org/proc/nime2011_milne/
[47] https://en.wikipedia.org/wiki/Hexcells
[48] https://app-liv.jp/5344404/
[49] https://gg.deals/gb/game/oradea/
[50] https://www.appbrain.com/app/hex-midi-isomorphic-keyboard/com.zungstudio.hexmidi

## 検証結果

検証日 2026-10-23。対象 12 件の出どころ URL を WebFetch で読み、本文と照合した。doi.org の転送先 mdpi.com は 403 で読めず、Semantic Scholar API と Crossref API の書誌・抄録で代替した。Red Blob Games の本頁は対話的描画のため本文が取れず、implementation.html と v1 版で照合した。WebSearch は上限に達して使えなかったため、追加の一次資料は WebFetch で直接 URL を当たった範囲に限る。判定は confirmed／corrected／refuted／unverifiable の 4 種。判定・提案はしない。

### 1. 等方性鍵盤の定義・不変性・「学習が容易」は未検証（Wikipedia）— confirmed
- 一致：定義は「any given sequence and/or combination of musical intervals has the "same shape" on the keyboard wherever it occurs」。移調不変性は「exposed in all isomorphic layouts by definition」、音律不変性は「only exposed in certain layouts like Wicki and Bosanquet」。学習については「some authors」の主張として「facilitates music education and performance」を挙げたうえで「This claim has not been rigorously tested, so its validity has been neither proven nor disproven」（citation needed 付き）。
- 補足：「容易」は Wikipedia 自身の主張ではなく「some authors」への帰属。
- 根拠：https://en.wikipedia.org/wiki/Isomorphic_keyboard

### 2. 2 方向の音程で配列が決まる・Musix Pro の自作定義 — corrected
- 一致：「Choose an interval for each direction (South-East and South-West)」「all you need to do is choose two intervals to define the layout」「The third is the sum of the other two, in the opposing direction」。Harmonic の例：SE＝下行短 3 度、SW＝下行長 3 度、「the sum of these intervals is seven semitones (a fifth)」「so the north direction (the third leg in the triangle) must be an ascending fifth」。
- 訂正：定義には 2 音程に加えて向き（Horizontal／Vertical）の選択が要る。「horizontal layouts have an east-west direction but no north-south direction」「vertical layouts have a north-south direction but no east-west direction」。「N＝和の逆方向」が成り立つのは N–S 方向を持つ Vertical のとき。E–W 方向を持つ Horizontal（W–H など）では第 3 の方向は E＝SE−SW（W–H：SE −5、SW −7 → E＝+2）。なお layouts.html は Harmonic を「(- Maj. 3rd; - Min 3rd; Horizontal)」、Wicki-Hayden を「(- Perf. 4th; - Perf 5th; Horizontal)」と表記しており、customization.html の Harmonic 例（N＝+7、すなわち Vertical）と向きの表記が食い違う。
- 根拠：https://shiverware.com/musixpro/customization.html ／ https://shiverware.com/musixpro/layouts.html

### 3. W–H・Harmonic Table・Jankó の方向別半音数（jefftk）— corrected（出どころの対応と語）
- jefftk 本文は音程名で記述し、方向別の半音数・三角形の向き・AXiS の向きは書いていない。W–H：「whole steps along each row, fourths on one diagonal and fifths on the other」「rising an octave every two rows」。Harmonic Table：「2 steps along each row, 1.5 steps along one diagonal, and fifths along the other diagonal」「Often it's rotated so that the fifths run vertically instead」。Jankó：「whole-steps along each row and each diagonal is a half-step」。
- 方向別の数値は Musix Pro の定義で裏づく：W–H（SE −完全 4 度、SW −完全 5 度、Horizontal）→ 右 +2・右上 +7・左上 +5。Harmonic（SE −短 3 度、SW −長 3 度、N＝+7）→ 上 +7・右上 +4・左上 +3。Jankó は 0x33.board「Moving along rows to the right keys are 2 semitones apart, whereas the four diagonal intervals are all single semitones」。
- 三角形の向き（右向き＝長三和音、左向き＝短三和音）はどの出どころにも明記なし。Musix layouts.html「major and minor triads in triangles playable with a single finger」、Wikipedia Harmonic table「Any major triad and minor triad, in root position, can be played with a single finger」まで。向きは上 +7・右上 +4・左上 +3 からの導出。
- 語の訂正：W–H の行は「全音音階（whole-tone scale）」。「全音階（diatonic）」ではない（jefftk「whole steps along each row」、Wikipedia W–H「each row is a whole tone scale」）。本文の表の「行＝全音階」も同じ。
- 根拠：https://www.jefftk.com/p/hexagonal-keyboard-layout-survey ／ https://shiverware.com/musixpro/customization.html ／ https://shiverware.com/musixpro/layouts.html ／ https://hw.s-ol.nu/0x33.board/layouts/ ／ https://en.wikipedia.org/wiki/Wicki%E2%80%93Hayden_note_layout ／ https://en.wikipedia.org/wiki/Harmonic_table_note_layout

### 4. Lumatone の仕様（280 鍵・21 mm・24 mm・24.15 mm・92×35.5×4.6 cm・US$3,995）— confirmed
- 一致：「280 rising hexa-keys」「Key Width: 21 mm (0.83”)」「Key Diameter: 24mm (0.94”)」「Key Spacing (Centre-to-Centre): 24.15 mm (0.95”)」「92 x 35.5 x 4.6 cm (36.2” x 13.98” x 1.81”)」「10.8 KG, or 11.4 KG w/ Kickstand」「the eventual retail price of US$3,995」（初回ロットは US$2,995）。
- 補足：「RGB」の語は頁に無い。「280 colour-changing LED keys」「Illuminated, Coloured LEDs customizable to millions of colours」。
- 根拠：https://www.lumatone.io/details-specs

### 5. Red Blob Games の六角格子の公式 — confirmed（implementation.html と v1 で照合）
- implementation.html：layout_pointy＝Orientation(√3, √3/2, 0, 3/2, …, 0.5)、x＝(f0·q＋f1·r)·size.x、y＝(f2·q＋f3·r)·size.y → x＝size·(√3·q＋√3/2·r)、y＝size·(3/2·r) に一致。方向ベクトル Hex(1,0,−1), Hex(1,−1,0), Hex(0,−1,1), Hex(−1,0,1), Hex(−1,1,0), Hex(0,1,−1) → axial (+1,0)(+1,−1)(0,−1)(−1,0)(−1,+1)(0,+1) に一致。hex_round は 3 成分を round し、q_diff／r_diff／s_diff の最大の成分を q＝−r−s 等で再計算 → 一致。
- v1：pointy の x＝size·√3·(q＋r/2)、y＝size·3/2·r（同値）。幅・高さ・間隔は v1 が flat-top で width＝2·size、height＝√3/2·width、horiz＝3/4·width、vert＝height と記述。pointy はその転置で、f0＝√3（横間隔＝√3·size＝幅）、f3＝3/2（縦間隔＝3/2·size＝3/4·高さ）と整合。角の角度は v1「pointy topped angles are 30°, 90°, 150°, 210°, 270°, 330°」。
- 根拠：https://www.redblobgames.com/grids/hexagons/implementation.html ／ https://www.redblobgames.com/grids/hexagons-v1/

### 6. ANSI の「ダブル・スタッガー」1/2・1/4・1/2、均等 1/4u・1/2u、19.05 mm（Deskthority）— corrected
- 一致：「double staggered」、段間ずれ「1/2 key, 1/4 key and 1/2 key respectively」、段位置（下から）「1, 3, 2, 4」、均等 1/4u は「more often found among compact keyboards」、1/2u は「more common among vintage/low-cost and point-of-sale keyboards」。
- 訂正：この頁に「ANSI」の語とキーピッチ 19.05 mm の記述は無い（頁は typewriter／QWERTY で記述）。19.05 mm は zenn [39] の「通常のキーの配置間隔(3/4inまたは19mm)」「19.05mmピッチ」による。
- 根拠：https://deskthority.net/wiki/Staggering ／ https://zenn.dev/cheena_gb/articles/349a01b7fc71f2

### 7. Plamondon の特許出願 US20090114078A1 — corrected
- 一致：発明者 James Lee Plamondon、譲受人 Thumtronics Pty Ltd、優先日 2005-02-09、出願 2006-02-09、「ABANDONED -- FAILURE TO RESPOND TO AN OFFICE ACTION」（2011-02-10）。H：「the note that is rightwardly-adjacent is a major second higher in pitch than the starting note」、V：「the note that is up-and-leftwardly adjacent is a perfect fourth higher in pitch than the starting note」。「the Applicants consider that the Wicki/Hayden layout best fits the SCABA button-arrangement」。stagger／staggered／offset の語は無い。
- 訂正：「実質的に六角形の配列」は FIG. 6 の音符配列（「a two-dimensional, substantially-hexagonal array of notes」「…substantially-hexagonal array of note-controlling buttons」）を指し、英数キーボード（SACBA＝Standard Alphanumeric Computer Button Arrangement）そのものを六角形と呼ぶ文は無い。請求項は「mapping an interval-based isomorphic note layout to an alphanumeric keyboard」。
- 根拠：https://patents.google.com/patent/US20090114078A1/en

### 8. MacRitchie & Milne 2017（熟練音楽家 24 名）— confirmed（代替経路）
- doi.org → mdpi.com は 403。Semantic Scholar API・Crossref API で照合：「Exploring the Effects of Pitch Layout on Learning a New Musical Instrument」Applied Sciences 7(12):1218、2017-11-24。熟練音楽家 24 名、音階とアルペジオの訓練 → 即時保持・転移（未知の童謡）。長 2 度の隣接は訓練・保持の正確さを上げ（既に頭打ちの場合を除く）、せん断は訓練の正確さを下げたが転移を大きく改善。
- 根拠：https://api.semanticscholar.org/graph/v1/paper/DOI:10.3390/app7121218?fields=title,authors,year,abstract ／ https://api.crossref.org/works/10.3390/app7121218

### 9. Stanford, Milne & MacRitchie 2018 — confirmed（代替経路）
- Semantic Scholar API：「The Effect of Isomorphic Pitch Layouts on the Transfer of Musical Learning」Applied Sciences 2018。4 配列（等方性の Wicki・Bosanquet と、それぞれにできるだけ似せた非等方版）、音楽家と非音楽家、保持・転移課題。音楽家では等方性が転移を改善、非音楽家では結果が混在。Crossref は 429 で未取得。
- 根拠：https://api.semanticscholar.org/graph/v1/paper/DOI:10.3390/app8122514?fields=title,authors,year,abstract

### 10. SOS の AXiS-49 レビュー — corrected（引用の語）
- 一致：「two identical four-octave spans (each consisting of a 7x7 button grid)」→ 98、「$495」、「the moment you spot the way that fifths and thirds are mapped across the buttons」、「mastering melodic intervals like seconds, fourths, sixths and octaves takes some time」、「Fast soloing, counterpoint and independent two-handed playing … would probably require months of basic practice before it felt remotely secure」、「subtle contouring … helps to prevent unwanted triggering of adjacent buttons」。
- 訂正：原文は「the initial learning curve is almost non-existent」（ほぼ無い）。「とても緩やか」は意訳。
- 根拠：https://www.soundonsound.com/reviews/c-thru-music-axis-49

### 11. Novation の「chromatic fourths」「yes and no」「目印が無い」— corrected
- 一致：「Note mode uses what's called a 'chromatic fourths' arrangement for the 64 pads in the 8x8 grid」、「Cuts your learning time by a factor of twelve, right?」→「Well, yes and no」、「there are no easy mnemonic hand shapes to guide you from one key to the next; you have to use your eyes」。
- 訂正：「右 +1、上 +5」の数値は記事に無い。記事の説明は「all the notes of the equal-temperament keyboard are arranged in two four-note-wide ascending columns」。「物理的目印が無い」は原文では「easy mnemonic hand shapes（手の形の手掛かり）が無い」。右 +1 は bonedo の Launchpad X 評「Von links nach rechts lassen sich Noten chromatisch spielen」で裏づく。上 +5 は今回読めた一次資料には明記なし（Launchpad X 取扱説明書 PDF は本文抽出不可、Novation の Web 版ガイドは 403）。
- 根拠：https://novationmusic.com/articles/ditch-the-keys-if-you-want-to-/ ／ https://www.bonedo.de/artikel/novation-launchpad-x

### 12. Roger Linn の六角面検討と 4 度積み採用 — confirmed
- 一致：「a hex keyboard is merely a grid with alternate rows shifted over by 1/2 column then squished down between the keys of the adjacent row to form hexagons」「the hex row intervals would be 3.5 or 4.5 or 5.5 or 6.5, etc.」「a picture of what LinnStrument might look like with a hex-key playing surface and with a row offset of 4.5 semitones」「While this layout has merit, I (Roger) find it less intuitive to form chords or to play single lines than a grid and therefore don't see an advantage」。「Fifths tuning (7 semitones as on violins and cellos) is too great an interval to finger many common chords in one hand」「Thirds tuning (4 semitones) permits playing most chords in one hand, but the total pitch range of the playing surface is too limited」。
- 補足：「直感的でない」は「less intuitive … than a grid」（格子との比較）で、「has merit」とも書いている。
- 根拠：https://www.rogerlinndesign.com/support/support-linnstrument-fourths-layout

### 集計
confirmed 6（1・4・5・8・9・12）、corrected 6（2・3・6・7・10・11）、refuted 0、unverifiable 0。corrected のうち 3・6 は出どころの対応と語の訂正、2・7・11 は内容の限定、10 は引用語の訂正。
