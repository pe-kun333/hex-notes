# 落下型・レーン型音ゲーの方式比較

調査日 2026-10-23。調査役の下調べ。判定・採否・提案は書かない。公式未公表の数値は「コミュニティ推定」と明記。WebSearch の予算が途中で尽き、DJMAX RESPECT V・Project DIVA・jubeat・太鼓の達人の判定幅 ms は一次情報に届かず「問い」に送った。

## 事実

### 判定幅（±ms 片側）と判定段階名

| ゲーム | 判定名（上から） | 判定幅 | 出どころ |
|---|---|---|---|
| osu!mania | MAX / 300 / 200 / 100 / 50 / miss | 16（実機 ±16.5）/ 64−3·OD / 97−3·OD / 127−3·OD / 151−3·OD。DT で窓 33% 縮小、HT で 33% 拡大 | [S1] |
| Etterna J4（既定） | Marvelous / Perfect / Great / Good / Bad | 22.5 / 45 / 90 / 135 / 180。J5 ×0.84、J6 ×0.66、J7 ×0.50、J9 ×0.20（Bad は 180 固定）。Hold 250、Mine 75 | [S2] |
| StepMania 既定 / ITG | Marvelous / Perfect / Great / Good / Boo | 22.5 / 45 / 90 / 135 / 180。ITG は 21.5 / 43 / 102 / 135 / 180（2012 年の設定値、二次） | [S3] |
| Quaver Standard | Marvelous / Perfect / Great / Good / Okay / Miss | 18 / 43 / 76 / 106 / 127 / 164。LN の離しは各 ×1.5 | [S4] |
| Bemuse Normal | Meticulous / Precise / Good / Offbeat | 20 / 50 / 100 / 200。曲レベル 1〜2 は 24 / 100 / 180 / 200 に緩む | [S5] |
| FNF PBOT1 | Sick / Good / Bad / Shit / Miss | 45 / 90 / 135 / 160。5ms 以内 500 点、以後シグモイドで 9 点まで減衰、Miss −100 | [S6] |
| Cytus II | PERFECT 黄 / 白 / GOOD / BAD / MISS | 70 / 200 / 400 / 800 / 801〜。Master Mode は 45 / 70 / 200 / 400 / 800 | [S7] |
| Lanota | Harmony!! / Tune! / Fail | 60 / 120 / 外 | [S8] |
| Arcaea | PURE 無印 / PURE E・L / FAR / LOST | 25 / 50 / 100 / 外（120 とする表もある） | [S9][S10] |

コミュニティ推定のみ: IIDX の PGREAT ±16.7ms・GREAT ±33ms、SDVX の S-CRITICAL ±20.83ms・CRITICAL ±41.67ms、CHUNITHM の JUSTICE CRITICAL ±33ms、太鼓の良 ±25ms、DJMAX RESPECT V の MAX 100% ±41.67ms。出どころ自身が「だいたい公式情報は出てないので、信憑性はないです」と注記 [S11]。CHUNITHM wiki も「公式発表はない」[S12]。段階数は 3（Lanota・太鼓・Deemo）〜6（osu!mania・Quaver・Etterna）。最上位窓は PC・アーケード系 16〜25ms、スマホ系 25〜70ms が多い [S10]。

### レーン数とキー割り当て

- osu!mania: 変換譜面 4〜7K、xK で 1〜9K、Co-op で 2〜18K。既定キーは Symmetrical（左 A S D F、右 J K L ;、奇数鍵は中央 Space）。旧配置 Z S X D C F V G B [S13]。
- Etterna: StepMania 5 のキーボード特化フォーク [S14]。Quaver: 4K/7K [S15]。Bemuse: 5 鍵・7 鍵＋任意スクラッチ、4 鍵非対応 [S16]。
- IIDX: 7 鍵（白 4・黒 3）＋皿 [S17]。SDVX: BT 4＋FX 2（各 BT 2 本分幅）＋つまみ 2 [S18]。CHUNITHM: 16 分割スライダー＋エアセンサー [S12]。jubeat: 4×4 パネル [S19]。
- DJMAX RESPECT V: 4B/5B/6B/8B に左右サイドトラック 2 本（4B=4+2）。既定キーは未取得 [S20]。
- KEYBOARDMANIA（Konami 2000）: 24 鍵の実鍵盤、画面は 24 列、ロングノートを白鍵=白／黒鍵=赤で色分け [S22]。
- Rhythm Doctor: 1 ボタン（スペース）、7 拍目 [S23]。Clone Hero: 5 フレット＋ストラム、ゲームパッドモードはストラム不要 [S24]。

### ノートの種類

- ホールド終点の扱いが分かれる: Quaver は離し窓 ×1.5 [S4]、CHUNITHM の HOLD は終点判定なし [S12]、Cytus II の Hold は遅放し判定なし [S7]。
- .sm の文字コード: 1 タップ、2 ホールド頭、3 尾、4 ロール頭、M マイン、K キー音、L リフト、F フェイク [S25]。
- 特殊: CHUNITHM の ExTAP（MISS 以外は常に最高判定）、DAMAGE（触れると MISS、放置で最高判定）、FLICK は MASTER 以上のみ [S12]。Cytus II の Drag/Flick は PERFECT か MISS のみ [S7]。Lanota の Flick は色で方向 [S8]。
- Clone Hero: HOPO はコンボ中のみストラム不要、Tap はコンボ切れでも不要、Open はフレット無しでストラム [S24]。
- Deemo: タップ（黒・白）とスライドのみ、ホールドなし、レーンなし、下から上へ [S26]。太鼓: ドン・カッ・大音符・連打・風船、右から左 [S32]。

### スコア・コンボ・ゲージ

- osu!mania: 100 万点を判定基礎点とボーナスに半々、コンボはスコアに無関係、HP 自然減なし、空打ちはコンボを切らない [S13]。
- Quaver: 精度重み 100 / 98.25 / 65 / 25 / −100 / −50。体力 +0.5 / +0.4 / +0.2 / −3 / −4.5 / −6 を密度（actions per second）でスケール。乗数は 10 ヒットごと、最大 15 段 [S4]。
- Etterna: Wife3（ずれ ms を連続関数で点数化）[S28]、Great 以内でもコンボブレイク扱い [S2]。Bemuse: Accuracy 500,000＋Combo 55,555 [S5]。FNF: コンボはスコアに無関係、体力バーは相手と共有 [S29]。Clone Hero: 1 ノート 50 点、10 連続ごとに 1x→4x、Star Power で倍 [S24]。
- IIDX: EX スコア（PGREAT 2・GREAT 1）。ゲージ 22% 開始・80% クリア（ASSISTED EASY 60%）、HARD は 100% 開始・0% で即終了、EX-HARD は 1 ミス約 16% [S17]。SDVX: 1000 万点をチェイン数で等分、NEAR は半分、EFFECTIVE 70% クリア [S18]。
- CHUNITHM: 素点 1,000,000÷ノーツ数、JC ×1.01 で理論値 1,010,000 [S12]。jubeat: 900,000（判定）＋100,000（シャッター）[S19]。Arcaea: 1000 万点÷ノーツ数、無印 PURE ごとに +1 [S9]。Cytus II: 判定 90%＋コンボ階段 10%、TP は精度平均 [S7]。Lanota: Tune モード（失敗で止まらない）と Purify モード（Fail 蓄積で終了）[S8]。

### ハイスピード／到達時間の考え方

- osu!: preempt = 1200＋120×(5−AR)（AR<5）、1200−150×(AR−5)（AR>5）。AR0 で 1800ms、AR10 で 450ms。mania では AR 無効 [S30]。mania のスクロール 1〜40、既定は BPM スケーリング、オプションで固定速度 [S13]。
- Bemuse: 倍率（0.5x 刻み、Alt で 0.1x）か、AutoVel で LeadTime（落下時間 ms）を直接指定し BPM 差を吸収 [S31]。
- IIDX: Hi-Speed ×0.5〜×4.0（0.25 刻み）、FLOATING は 0.01 刻み。SUDDEN+（上カバー）・HIDDEN+（下カバー）・LIFT（判定線を上げる）は別オプション [S17]。緑数字運用は通説で未裏取り。SDVX: EXCEED GEAR から BPM 非依存の百分率 [S18]。
- CHUNITHM: 速度 1〜20。判定タイミング A（譜面位置）と B（判定のみ）を −2.0〜2.0 で別々に持つ。フィールドウォール 0〜16 [S12]。Arcaea: 1.0〜6.5（0.1 刻み）、音ズレ調整 ±101 以上で SE 強制 0% [S9]。太鼓: ばいそく〜よんばい、ニジイロで 0.1 刻み [S32]。

### 難易度表記

osu! は星（Easy <2.0、Normal 〜2.69、Hard 〜3.99、Insane 〜5.29、Expert 〜6.49、Expert+）[S34]。IIDX 1〜12 [S17]、SDVX 1〜20 [S18]、CHUNITHM 1〜16 区分 [S12]、Arcaea 1〜12 で 7+〜11+ あり [S9]、Cytus II は EASY 1〜6 / HARD 4〜10 / CHAOS 8〜16 [S7]、太鼓はおに ★1〜10 [S35]、FNF は Easy/Normal/Hard＋Erect/Nightmare [S29]。Bemuse は曲レベルで判定幅が緩む [S5]。

### 譜面エディタとコミュニティ譜面

- osu!: 内蔵エディタ [S36]。.osu はテキスト、mania 列 = floor(x×columnCount/512)、ホールドは type bit 7＋`endTime`、タイミングは beatLength ms [S37]。ランク化: hype 5 人→BN 2 名→Qualified 7 日→Ranked [S38]。
- StepMania/Etterna: .sm（#BPMS/#STOPS/#OFFSET、1 小節を 4〜192 行）[S25]。ArrowVortex は 2025-07 にオープンソース化 [S39]。Quaver: 内蔵エディタ、MPL 2.0 [S15]。Clone Hero: Moonscraper（BASS は商用要ライセンス）[S40]。FNF: デバッグメニューからエディタ、Polymod [S29]。Bemuse: BMS、公式サーバー 70 曲超、AGPLv3 [S16][S41]。Malody: 各モードにエディタ、osu/sm/bms/tja 読み込み（二次）[S42]。Rhythm Doctor: 公式エディタ＋Steam Workshop [S23]。商用アーケード・DJMAX・DIVA は公式エディタ確認できず。

### mod

osu!: DT は BPM 1.5 倍でピッチ不変、mania 倍率 1.00x [S43]。HR は OD×1.4、EZ は半分 [S1]。HD は mania では判定線前に消える [S44]。Random は配置シャッフル、長さ不変 [S45]。Mirror・xK・Co-op は mania 専用 [S46]。IIDX: RANDOM/S-RANDOM/R-RANDOM/MIRROR、EXPAND-JUDGE（上位 2 窓を 4 倍）[S17]。太鼓: ドロン、あべこべ、きまぐれ約 20%／でたらめ約 50%、とっくん（ミスで最初から）[S32]。Clone Hero: Drunk Mode（窓を広げスコア保存減）[S24]。

### 練習機能と遅延調整

Clone Hero は区間選択＋再生中の速度変更 [S24]。osu! lazer は 2025 年中頃時点で公式 practice mode は「来る予定」（二次）[S47]。Etterna の練習モードは通説で未裏取り。遅延調整は Bemuse の Calibrate（音＋入力を測定）[S16]、Arcaea の音ズレ調整 [S9]、CHUNITHM の A/B 分離 [S12]、Rhythm Doctor は「映像と音の同期→タップテストで入力遅延」の 2 段階（二次）[S48]。

### キーボードで遊ぶ UI（どのキーを押すかの見せ方）

- Synthesia: Virtual Piano Mapping で「タイピングキーボードのどのキーが鍵盤か」を自分のパートにだけ表示。鍵盤側ラベルとノート側ラベルを別スイッチで切替、音名/階名/指番号を選べる [S49]。
- KEYBOARDMANIA: 鍵盤の並びをそのまま 24 列に、白鍵/黒鍵で色分け [S22]。jubeat: レーンなし、パネル内アニメーション（マーカー）で到達時刻を示す。反応時間順に整理され、初心者向け（Egg は早遅が分かりやすい、Gauge は練習向き）が挙がる [S50]。
- itch.io の個人コメント: 「ターゲットに矢印や WASD のラベルを」「タイトル画面の鍵盤図と HUD の常時キー表示が良い」「ラベルは別レイヤーで初心者だけ」「低コントラストのノートは読めない」[S51]。FNF は矢印のみ、osu!mania は列位置のみでキー文字は出さない [S29][S13]。

### Web 実装の数値

JS 記事: 曲時刻は `audioContext.currentTime` を毎フレーム読む。ずれ = |input−note|×1000。窓 45/90/135、miss 候補 160ms。オフセットは入力時刻から引く。成績で窓を変えない [S52]。Rhythm Quest 開発記: 遅延は音声・映像・入力の 3 種、音のタップテストは音声＋入力を測る。入力 100ms の例、格闘ゲームの 50〜100ms に言及。効果音は補正後時刻に事前スケジュール [S48]。

## 事例

- osu!mania [S13]: 1〜18K、ASDF/JKL; 配置、6 判定。含意: 既定キー配置と BPM スケーリングの参照。
- Etterna [S14][S2]: MIT、J4=22.5/45/90/135/180、J7 は半分。含意: 判定幅を段階で切り替える数値例。
- StepMania .sm [S25]: 拍分割テキスト譜面。含意: 自前譜面形式の最小仕様。
- Quaver [S4]: 窓・重み・体力がソース公開、MPL 2.0。含意: ホールド終点と密度スケールの例。
- Bemuse [S5][S41]: Web（React/Pixi.js）、AGPLv3、AutoVel、ブラウザ内キャリブレーション。含意: ブラウザ音ゲーの先行実装。
- FNF [S6]: 連続スコア（シグモイド）。Clone Hero [S24]: HOPO/Tap/Open、練習モード。
- IIDX [S17]: カバーと判定線高さを別オプションに。CHUNITHM [S12]: ExTAP・DAMAGE・二重オフセット。
- jubeat [S50]: 固定セル＋アニメーションで時刻を示す。含意: 六角形セル方式に最も近い先行例。
- Arcaea [S9]: Early/Late 表示位置の選択。Cytus II [S7]: スキャンライン方式。Lanota [S8]: Tune/Purify の二本立て。
- KEYBOARDMANIA [S22]・Synthesia [S49]: 「鍵盤＝レーン」「キー文字をノートに書く」の直接の先行例。
- Rhythm Doctor [S23]: 1 ボタン、公式エディタ＋Workshop。Malody [S42]: 既存形式の取り込み。
- JS 判定窓記事 [S52]・Rhythm Quest 開発記 [S48]: 音声クロック基準、3 種の遅延。

## 類推

- Synthesia の「鍵盤側／ノート側ラベルを別々に消す」は、タイピング練習のホームポジション表示の段階的な足場外し。
- jubeat のマーカーは固定セルに時間を描く。六角形セルを固定にするなら「セル内で輪が縮む」等も同族。
- CHUNITHM の判定タイミング A/B は、動画編集の映像オフセットと音声オフセットの分離。
- Bemuse の LeadTime は「スクロールを拍でなく秒で指定」する発想。
- FNF の PBOT1 はタイピングの精度計測に近い連続評価。Lanota の Tune/Purify は語学アプリの練習／本番モード。

## 制約

- 技術（遅延）: 最上位窓は ±16〜25ms が相場だが、入力・音声・映像の遅延合計は数十〜100ms 級になり得る [S48]。ブラウザでは音声クロック基準と個別キャリブレーションが前提 [S52][S48]。
- 技術（キーボード）: 同時押し数の制限（ロールオーバー）がある製品が多い（一般知識、未裏取り）。
- 技術（譜面形式）: 時間表現を拍分割（.sm）にするか ms 絶対時刻（.osu）にするか [S25][S37]。
- 法務（音源）: YouTube 利用規約は、書面の許可なくコンテンツを「アクセス、複製、ダウンロード」することと、ボット/スクレイパーによるアクセスを禁じる。埋め込みプレイヤーでの表示は許される [S53]。
- 法務（コード）: Bemuse は AGPLv3 [S41]、Etterna は MIT（MAD/FFmpeg は GPL 条件）[S14]、Quaver は MPL 2.0 [S15]、Moonscraper の BASS は商用要ライセンス [S40]。
- 人間工学: 判定段階が多いほど表示情報が増える。早遅表示は位置を選ばせる例 [S9]、マーカーは反応時間で分類される [S50]。
- 流通: ランク譜面の品質管理には人手審査（BN・7 日待機）が要る [S38]。

## 問い

- DJMAX RESPECT V・Project DIVA・jubeat・太鼓の判定幅 ms は一次情報に届かず（DIVA wiki 522、DJMAX 系 403）。公式未公表ならコミュニティ推定で足りるか。
- Etterna の練習モード仕様、IIDX の緑数字の定義は通説どまり。裏取りが要るか。
- Clone Hero の判定窓 ms は wiki に記載なし。設定で可変か。
- 「キー文字をノートに書く」落下型ゲームは Synthesia の仮想鍵盤マッピング以外に見つかっていない。探索を続けるか、先行例なしとして進めるか。
- 六角形セルの先行例は未発見。jubeat の固定セル＋アニメーションが最も近い。
- 判定幅を曲レベルで緩める（Bemuse）か、段階選択（Etterna J1〜J9）か、固定（osu!mania MAX 16ms）か。
- ホールド終点の扱い（Quaver ×1.5 窓、CHUNITHM/Cytus II は終点判定なし）。ピアノ題材なら音の長さをどこまで評価するか。
- YouTube 音源前提なら ToS のダウンロード禁止とどう両立させるか（埋め込み再生＋別経路の音符データなど）。

## 出どころ一覧

- [S1] osu! wiki「Overall difficulty」 https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty
- [S2] etterna crate judge.rs（Etterna 本体の判定値を写した Rust ソース） https://docs.rs/etterna/latest/src/etterna/judge.rs.html
- [S3] FlashFlashRevolution フォーラム「Open ITG - Timing Windows?」（2012、二次） https://www.flashflashrevolution.com/vbz/node/103800
- [S4] Quaver.API ScoreProcessorKeys.cs https://raw.githubusercontent.com/Quaver/Quaver.API/master/Quaver.API/Maps/Processors/Scoring/ScoreProcessorKeys.cs
- [S5] Bemuse docs「Scoring and Judgment」 https://bemuse.ninja/project/docs/scoring-and-judgment
- [S6] Funkin Scoring.hx https://raw.githubusercontent.com/FunkinCrew/Funkin/main/source/funkin/play/scoring/Scoring.hx
- [S7] wikiwiki rhythmgame「Cytus II」 https://wikiwiki.jp/rhythmgame/Cytus%20II
- [S8] wikiwiki rhythmgame「Lanota」 https://wikiwiki.jp/rhythmgame/Lanota
- [S9] wikiwiki arcaea「ルール」 https://wikiwiki.jp/arcaea/%E3%83%AB%E3%83%BC%E3%83%AB
- [S10] wikiwiki rhythmgame「判定幅情報」 https://wikiwiki.jp/rhythmgame/%E5%88%A4%E5%AE%9A%E5%B9%85%E6%83%85%E5%A0%B1
- [S11] scrapbox「Timing Window」（0b5vr） https://scrapbox.io/0b5vr/Timing_Window
- [S12] wikiwiki chunithmwiki「ゲームシステム1」 https://wikiwiki.jp/chunithmwiki/%E3%82%B2%E3%83%BC%E3%83%A0%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A01
- [S13] osu! wiki「osu!mania」 https://osu.ppy.sh/wiki/en/Game_mode/osu!mania
- [S14] Etterna README https://raw.githubusercontent.com/etternagame/etterna/develop/README.md
- [S15] Quaver README https://raw.githubusercontent.com/Quaver/Quaver/develop/README.md
- [S16] Bemuse Community FAQ https://faq.bemuse.ninja/
- [S17] RemyWiki「What is beatmania IIDX」 https://remywiki.com/What_is_beatmania_IIDX ／「IIDX General Info」 https://remywiki.com/IIDX_General_Info
- [S18] RemyWiki「What is SOUND VOLTEX」 https://remywiki.com/What_is_SOUND_VOLTEX
- [S19] RemyWiki「What is jubeat」 https://remywiki.com/What_is_jubeat
- [S20] Steam コミュニティ DJMAX RESPECT V スレッド（検索要約、本文は未取得） https://steamcommunity.com/app/960170/discussions/0/2569815696852157517
- [S22] RemyWiki「KEYBOARDMANIA Information」 https://remywiki.com/KBMicon
- [S23] Steam「Rhythm Doctor」 https://store.steampowered.com/app/774181/Rhythm_Doctor/
- [S24] Clone Hero wiki「How to play」 https://wiki.clonehero.net/books/clone-hero-manual/page/how-to-play
- [S25] StepMania wiki「sm」 https://github.com/stepmania/stepmania/wiki/sm
- [S26] wikiwiki rhythmgame「Deemo」 https://wikiwiki.jp/rhythmgame/Deemo
- [S28] docs.rs etterna クレート索引 https://docs.rs/etterna/latest/etterna/
- [S29] Friday Night Funkin' wiki.gg https://fridaynightfunkin.wiki.gg/wiki/Friday_Night_Funkin%27
- [S30] osu! wiki「Approach rate」 https://osu.ppy.sh/wiki/en/Beatmap/Approach_rate
- [S31] Bemuse docs「User guide」 https://bemuse.ninja/project/docs/user-guide
- [S32] ja.wikipedia「太鼓の達人」 https://ja.wikipedia.org/wiki/%E5%A4%AA%E9%BC%93%E3%81%AE%E9%81%94%E4%BA%BA
- [S34] osu! wiki「Star rating」 https://osu.ppy.sh/wiki/en/Beatmap/Star_rating
- [S35] wikiwiki「太鼓の達人 譜面とかWiki」 https://wikiwiki.jp/taiko-fumen/
- [S36] osu! wiki「Beatmap editor」 https://osu.ppy.sh/wiki/en/Client/Beatmap_editor
- [S37] osu! wiki「.osu (file format)」 https://osu.ppy.sh/wiki/en/Client/File_formats/osu_(file_format)
- [S38] osu! wiki「Beatmap ranking procedure」 https://osu.ppy.sh/wiki/en/Beatmap_ranking_procedure
- [S39] ArrowVortex https://arrowvortex.ddrnl.com/
- [S40] Moonscraper Chart Editor README https://github.com/FireFox2000000/Moonscraper-Chart-Editor
- [S41] Bemuse README https://github.com/bemusic/bemuse
- [S42] Malody V ストア（二次） https://apps.apple.com/app/id1566873256
- [S43] osu! wiki「Double Time」 https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier/Double_Time
- [S44] osu! wiki「Hidden」 https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier/Hidden
- [S45] osu! wiki「Random」 https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier/Random
- [S46] osu! wiki「Game modifier」 https://osu.ppy.sh/wiki/en/Gameplay/Game_modifier
- [S47] Reddit r/osugame（二次） https://redlib.ssps.io/r/osugame/comments/1l5dwdy/cant_we_finally_get_practice_mod
- [S48] Rhythm Quest Devlog 10「Latency Calibration」 https://rhythmquestgame.com/devlog/10.html
- [S49] Synthesia「Labels」ガイド https://www.synthesiagame.com/support/guide/labels
- [S50] RemyWiki「jubeat Markers」 https://remywiki.com/Jubeat_Markers
- [S51] itch.io コメント（非公式） https://itch.io/post/16884186 ／ https://itch.io/post/6968498
- [S52] dev.to「Building fair rhythm game judgement windows in JavaScript」 https://dev.to/skywalker_2de7de5f97df567/building-fair-rhythm-game-judgement-windows-in-javascript-1og9
- [S53] YouTube 利用規約 https://www.youtube.com/t/terms

## 検証結果

検証日 2026-10-23。確かめ役。出どころ URL を WebFetch で実際に読み、一致を見た。WebSearch は予算切れで使えず、補強は WebFetch で一次ソース（GitHub の生ファイル等）を直接たどった。判定・提案は書かない。

| # | 事実 | 結果 | 補足・訂正 |
|---|---|---|---|
| 1 | osu!mania 判定幅 MAX 16（実機 ±16.5）/ 64−3·OD / 97−3·OD / 127−3·OD / 151−3·OD、DT 33% 縮小・HT 33% 拡大 | confirmed | [S1] の表と一致。「In osu!mania, the hit window of a MAX is ±16.5 ms」「hit error <= round(hit window)」の記述あり。DT/HT は「hit windows are 33% shorter / larger」と書かれ、窓ごとに縮み方が異なる（100・50 の方が強く縮む）とも書かれている。ページは stable 前提で lazer への言及なし（lazer で同じかは未確認）。 |
| 2 | Etterna J4 = 22.5/45/90/135/180ms、J5 ×0.84、J6 ×0.66、J7 ×0.50、J9 ×0.20、Bad 180 固定、Hold 250、Mine 75 | confirmed | [S2] の crate と一致（`marvelous_window: 0.0225` … `bad_window: 0.18`、J5–J9 の `timing_scale`、J4 は「Default judge for official scoring」）。Etterna 本体ソースでも裏取り: Player.cpp の既定 0.0225/0.045/0.090/0.135/0.180、GameConstantsAndTypes.h の `MISS_WINDOW_BEGIN_SEC = 0.18F`（boo 窓の硬い端）・`MINE_WINDOW_SEC = 0.075F`・`HOLD_DROP_SEC = 0.250F`、GameState.h の `timingscales = {1.00,1.00,1.00,1.00,0.84,0.66,0.50,0.33,0.20}`（J1–J3 は J4 と同じ 1.0 に統一済み、J8 は ×0.33）。本体では Bad 判定は max(スケール後 W5, 0.18) で実質 180ms 固定。本体では Hold/Mine 窓はスケールされない（crate は Hold をスケールして書いており、J5 以降の Hold 値は本体と食い違う。J4 のみを引く本事実には影響なし）。 |
| 3 | Quaver Standard 18/43/76/106/127/164ms、LN 離し ×1.5、精度重み 100/98.25/65/25/−100/−50、体力は密度でスケール | confirmed | [S4] の `JudgementWindow`・`WindowReleaseMultiplier`（Miss 以外 1.5f）・`JudgementAccuracyWeighting` と一致。密度は `Map.GetActionsPerSecond(rate)`。密度 0〜2 は 2 に切り上げ、12 以上は無スケール、Miss（−6.0）はスケール対象外。「Standard」の名はクライアント側 JudgementWindowsDatabaseCache.cs の `CreatePresetWindows("Standard*", 0)`（n=0 で基底値そのまま、既定）で確認。 |
| 4 | Bemuse Normal 20/50/100/200ms、Lv1〜2 で 24/100/180/200ms、Accuracy 500,000＋Combo 55,555、AutoVel で落下時間 ms 指定、Calibrate で音＋入力遅延 | confirmed | 判定幅とスコアは [S5] と一致。レベル別はさらに段階があり Level5 21/60/120、Level4 22/70/140、Level3 23/80/160、Beginner（Lv1〜2）24/100/180、Normal は Lv6 以上。AutoVel と Calibrate は [S5] には無く、FAQ [S16]（「click on the "Calibrate" button to find out your system's audio+input latency」「Enabling "auto-velocity" replaces the speed multiplier with a milliseconds input」）と User guide [S31]（AutoVel オン時に Speed が LeadTime になる）に書かれている。出どころの割り当ては [S5]＋[S16]＋[S31] と読むのが正しい。 |
| 5 | FNF PBOT1: 5ms 以内 500 点、シグモイドで 9 点まで減衰、境界 45/90/135/160ms、Miss −100 | confirmed | [S6] の定数と完全一致（`PBOT1_PERFECT_THRESHOLD = 5.0`、`MAX_SCORE = 500`、`MIN_SCORE = 9.0`、`SCORING_SLOPE = 0.080`、`SCORING_OFFSET = 54.99`、SICK/GOOD/BAD/SHIT = 45/90/135/160、`MISS_SCORE = -100`）。 |
| 6 | osu! preempt = 1200＋120×(5−AR)／1200−150×(AR−5)、AR0 1800ms・AR10 450ms、mania は AR 無効でスクロールは BPM×倍率、既定 BPM スケーリング・オプションで固定速度 | confirmed | 式と 1800/450ms は [S30] と一致。「has no effect」in osu!mania も [S30]。既定 BPM スケーリングと固定速度オプション（「Scale osu!mania scroll speed with BPM」をオフ）、速度 1〜40 は [S13] に書かれている。 |
| 7 | osu!mania 既定 Symmetrical（A S D F／J K L ;／奇数鍵は Space）、Co-op 2〜18K、xK 1〜9K、コンボはスコア無関係、HP 自然減なし、空打ちでコンボ切れず | confirmed | [S13] と一致。「The current default key settings is based on Symmetrical style」、xK「from 1 to a total of 9 keys」、Co-Op「from 2 to a total of 18 keys」（mania 専用譜面ではキー数は倍にならない）、combo「has no effect on total score」、「health drain is disabled in osu!mania」、「Combo will not break when playing the keys on empty judgement line」。 |
| 8 | IIDX ゲージ 22% 開始・80% クリア（ASSISTED EASY 60%）、HARD 100% 開始・0% 即終了、EX-HARD 1 ミス約 16%、SUDDEN+／HIDDEN+／LIFT、EXPAND-JUDGE は上位 2 窓 4 倍 | confirmed | [S17] と一致。「The gauge starts at 22%」（下限 2%）、クリア 80%、ASSISTED EASY「from 80% to 60%」、HARD「starts at 100% … failed instantly at 0%」、EX-HARD「roughly 16% for each miss」、EXPAND-JUDGE「timing windows for PERFECT GREATS and GREATS are quadrupled」。補足: EXPAND-JUDGE は PENDUAL で導入され EPOLIS で削除されたとページに記載。 |
| 9 | CHUNITHM ExTAP／DAMAGE、判定タイミング A/B を −2.0〜2.0 で別々に調整、理論値 1,010,000、JC ±33.33ms は「説が有力、公式発表なし」 | confirmed | [S12] と一致。「ExTAPは、MISSでなければどのタイミングでも最高評価(JUSTICE CRITICAL)判定になり」「タップしてしまうと…MISS判定になる。触れずにやり過ごすとJUSTICE CRITICAL判定になる」、A「楽曲に対して譜面の位置を調整する」・B「譜面の位置を変えず判定だけ調整する」（−2.0〜2.0、0.1 刻み）、「最高点数(理論値)は1,010,000点」、「現時点で公表はされていないが、有志の検証により…±33.33ms(120fpsで±4フレーム)という説が有力」。 |
| 10 | jubeat はレーンなし 4×4 固定パネル、マーカーは反応時間順、Egg は早遅が分かりやすい、Gauge は練習向き | corrected | 4×4（「16 panel areas arranged in a 4x4 grid」、マーカーは「shown within the panels」）は [S19] What is jubeat に、反応時間順（「Currently known order for reaction time」Long→Short）と Egg・Gauge は [S50] に書かれている。訂正点: Egg は「早い／遅い」ではなく「判定の良し悪しが分かりやすい」（孵るひよこの数が判定ごとに変わり「very easy to understand whether the timing is good or bad」）。「Recommended for beginners just getting started」「Not suitable for high density charts」。Gauge は「Suitable for practice of timing」で一致。 |
| 11 | Synthesia Virtual Piano Mapping はデジタルピアノ未接続時にタイピングキーボードのキーを自分のパートにだけ表示、鍵盤側／ノート側ラベルを別スイッチで切替 | confirmed | [S49] と一致。Virtual Piano Mapping は「These only appear if you've selected a part to play yourself」。Key Labels／Note Labels の切替トグルがあり、「the pane looks the same」と注意書き。別途「Only show labels on my notes」オプションあり。ラベル種類は Octaves／Finger Hint Numbers／Virtual Piano Mapping／English Note Names／Scale Number／Fixed-Do／Movable-Do／Simple Names。 |
| 12 | YouTube 利用規約: 書面の許可なく「アクセス、複製、ダウンロード」等を禁止、ボット／スクレイパー等の自動化手段によるアクセスを禁止、埋め込みプレイヤーでの表示は許可 | confirmed | [S53]（取得時は日本語版）と一致。「本サービスまたはコンテンツのいずれかの部分に対しても、アクセス、複製、ダウンロード、配信…を行うこと」を禁止（例外: 本サービスが明示的に承認、または YouTube と権利所持者の事前の書面許可）。「自動化された手段（ロボット、ボットネット、スクレーパなど）を使用して本サービスにアクセスすること」を禁止（例外: robots.txt に従う公開検索エンジン、書面許可）。「埋め込み型 YouTube プレーヤーに YouTube 動画を表示させることもできます」。 |

集計: confirmed 11、corrected 1（#10 jubeat の Egg の説明）、refuted 0、unverifiable 0。

検証で足した出どころ:
- [V1] Etterna Player.cpp（判定幅既定値・スケール適用） https://raw.githubusercontent.com/etternagame/etterna/develop/src/Etterna/Actor/Gameplay/Player.cpp
- [V2] Etterna GameConstantsAndTypes.h（MISS_WINDOW_BEGIN_SEC 0.18・MINE 0.075・HOLD_DROP 0.250） https://raw.githubusercontent.com/etternagame/etterna/develop/src/Etterna/Models/Misc/GameConstantsAndTypes.h
- [V3] Etterna GameState.h（timingscales 1.00×4, 0.84, 0.66, 0.50, 0.33, 0.20） https://raw.githubusercontent.com/etternagame/etterna/develop/src/Etterna/Singletons/GameState.h
- [V4] Quaver JudgementWindowsDatabaseCache.cs（「Standard*」が既定） https://raw.githubusercontent.com/Quaver/Quaver/develop/Quaver.Shared/Database/Judgements/JudgementWindowsDatabaseCache.cs
- [V5] RemyWiki「What is jubeat」（4×4 パネル） https://remywiki.com/What_is_jubeat
