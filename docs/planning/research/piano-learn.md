# ピアノ学習アプリと落下ノート表示

調査日 2026-10-23。判定・提案はしない。推測は「推測」と明記。数値は出どころ付き（[ ] は末尾の一覧）。検索上限のため Melodics の判定幅や Rocksmith+ 公式ヘルプは未読。

## 事実

### 落下ノートと鍵盤の対応の見せ方
- Synthesia の既定色は左手＝青、右手＝緑。運指は数字（1＝親指、5＝小指）を手の位置が変わる所だけに付け、残りは推測させる [S1]。
- Synthesia のラベルは鍵盤側とノート側で別々に設定でき、英語音名 / 固定ド / 移動ド / 音階度数 / オクターブ / 運指 / 白鍵のみ簡易名。「Virtual Piano Mapping」は MIDI 鍵盤が無いとき押すべき PC キーボードのキーをノートに表示する [S2]。手の割当は split 線で左右に分け、Auto Color で色を統一 [S3]。
- Yousician（ピアノ）の記譜は enhanced（色付きバーで音高・長さ・運指）/ falling notes / colored（五線譜＋運指色）/ sheet の 4 種 [Y1]。画面下に両手の色凡例、再生ヘッド上の玉がタイミング目安 [Y2]。
- Simply Piano の判定色は青＝ヒント無しで正解、黄＝画面鍵盤のヒント後に正解、赤＝誤り（動くステージのみ）[SP1]。運指番号は出るが表示タイミングは選べない [SP2]。
- 五線譜アプリ OKTAV も「Falling Notes」モードを持つ [O1]。Rocksmith+ のピアノ（2023-12-05 追加、約 400 曲）は落下ノートの 3D ビューか楽譜かを選ぶ [R1]。

### 待ちモード・スロー・区間ループ
- Synthesia の 3 モード: Melody Practice は正しい鍵まで止まる（テンポ不問）、Rhythm Practice はテンポを下げられるがメトロノーム基準、Song Recital は全速で採点。採点は「正答音符/総音符」の分数を色分け表示 [S4][S5]。公式ガイドに区間ループは無く、タイムラインをタップして飛ぶ操作のみ [S1]。
- flowkey: Wait Mode（正しい音・和音まで待つ）、Loop、片手選択、マイクまたは Bluetooth/MIDI [F1]。スローはレビューで 50%/75% [F2]。
- Yousician: Practice モードでテンポ 25〜125%、Auto-adjust が演奏に応じ 5% 刻みで増減、任意区間ループ、片手オフ [Y1]。レッスンは間違えても止まらない（レビューの批判）[Y2]。
- Simply Piano: テンポ 85%/95% と「Wait for me」（正しい音まで進まない）がレビューで報告 [SP2]。公式ヘルプはテンポ調整のみ記述 [SP1]。区間ループが無いのが不満 [SP2]。
- Piano Adventures Player は停止 / 固定テンポ / 演奏者追従の 3 段階 Follow Mode を持つ（MIDI 必須）[PA1]。
- Rocksmith（2014 版）の Riff Repeater は 1% 刻みで 25% まで減速、自動加速と難易度段階あり [R2]。Rocksmith+ は「全音を聴いてリアルタイムに難易度調整」を掲げる [R3]。

### 採点とフィードバック
- Yousician: perfect / good / bad と early / late の即時表示、最大 3 つ星。「初心者には速すぎる」「終了後の内訳が無い」が不満 [Y2]。
- Simply Piano: 曲後に正答数・タイミング点・ヒント使用量を表示。リズムや音長を間違えても全部緑になり得る [SP2]。裏拍で弾いても正解扱い [SP3]。
- Piano Marvel の SASR: 20 秒楽譜を見てから演奏、80% 以上で次の難しい曲、3 ストライクで終了、90 段階、最高 1900 点（189 以下＝Early Beginner、1436＝Professional Accompanist）[PM1]。
- Melodics: レッスンは MIDI ファイルで、正誤と早い/遅いを判定、SysEx で機器を自動設定 [M1][M2]。判定幅の ms は非公開。
- Playground Sessions は MIDI で緑/赤 [PG1]、Pianote はリアルタイム判定なし [PT1]。

### 入力（MIDI / マイク / PC キーボード）
- PC キーボード入力を確認できたのは Synthesia [S2][S6] と Pianu（Web MIDI / タッチ / QWERTY）[PU1][PU2]。Simply Piano / flowkey / Yousician の公式説明はマイクと MIDI のみ [F1][SP1][Y2]。
- マイク認識の不満: flowkey「複数音で判定できない」「Wait mode がときどき飛ぶ」→開発側は MIDI 接続を推奨 [F1]。Simply Piano「古い端末で検出が不安定」[SP5]。
- Web MIDI API: Chrome 43+、Edge 79+、Firefox 108+、Safari 非対応 [W1]。HTTPS 必須・ユーザー許可が要る [W2]。
- Bluetooth MIDI 実測: アダプタ間平均 7 ms（3〜11 ms）、PC まで 6〜8 ms。BLE 6.2 以前は接続間隔下限 7.5 ms が理由とされる（購入者の実測）[L1]。Chrome/Windows の音声コールバックは概算 10 ms [L2]。

### 料金（確認できた表示。地域・時期で変動）
- Synthesia 買い切り $39（セール $29）[S7]。flowkey 日本 1 か月 2,100 円・1 年 12,800 円 [F3]。Simply Piano 日本 12 か月 9,800 円 [SP4]、US $169.90/年 [SP5]。Yousician Premium $89.99/年・Premium+ $139.99/年 [Y2]。Piano Marvel 年 $129.99（無料枠あり）[PM2]。Playground Sessions $99/年 [PG1]。Melodics $179.99/年、無料は楽器ごと 20 レッスン＋1 日 5 分 [M2]。Pianote $200〜240/年 [PT1]。Magic Piano $7.99/週〜 [MP1]。SeeMusic PRO $79.99/年 [YT2]。Rocksmith+ 無料 20 曲 [R3]。
- 不満の定番: 無料部分の短さ、トライアル自動更新と解約の摩擦 [SP4][Y3]。

### 学習効果の研究
- Rogers ら 2014「P.I.A.N.O.」: 鍵盤上に拡張ピアノロールを投影する方式を Synthesia（画面上ピアノロール）と Finale（五線譜）と比較。n=56 被験者内と n=18 の 5 日間。投影方式は認知負荷が有意に低く、正しく押した音符数で有意差（F(2,88)=121）、誤って押した音符数は 3 方式で差なし [P1][P2]。
- Banquiero ら 2024: 実鍵盤に立方体が落ちる MR アプリ（Meta Quest Pro）を Synthesia＋iPad＋MIDI と比較。N=33（7〜65 歳）、教師採点で MR が有意に高く、年齢・性別の影響なし [P2]。Molloy ら 2019 も Synthesia より音符正確性が高かった（同論文の引用）[P2]。piARno 2020 は 22 名で音名想起が向上 [P3]。
- arXiv 2603.06253（2026）: VR の指の手本について「常時キューは過依存を生み記憶と転移を損なう」とし、N=30 で透明度を成績に応じて変える方式が固定表示より音高・運指の正確さを高めた [P4]。
- 国内: VRSJ 2025 1B1-08（東北大 和泉・菅沼）はピアノロール型視覚誘導が「システムに依存し譜読み能力の育成につながりにくい」課題を指摘 [J1][J2]。竹川ら 2017: 鍵盤上投影は光る鍵盤より打鍵ミスが少なく短時間で習得、6 名・5 日・1 日 30 分 [J3]。
- Simply Piano / Yousician のランダム化比較試験は見つからず。Yousician のギター事例研究は 4 名・1 週間 [P5]。Rocksmith の「最速で上達」は Ubisoft 委託調査、「95% が上達」は自己申告調査 [R4]。
- 遅延知覚: Jack ら 2016 は 0 / 10 / 20 / 10±3 ms を比較、0 と 10 ms の評価に差はなく、20 ms と 10±3 ms（ジッタ）は有意に低評価、同期誤差には差なし。Wessel & Wright の推奨は遅延 10 ms 未満・ジッタ 1 ms 未満 [L4]。打鍵→音の遅延検出閾値は非音楽家 180±104 ms、音楽家 102±65 ms [L5]。基準遅延 0 / 64 / 512 ms への JND は 49 / 27 / 77 ms（N=37、洗練度が高いほど小さい）[L6]。
- リズムゲームの判定幅: osu! の 300 判定は 80−6×OD ms（OD10 で ±20 ms）、mania の MAX は ±16 ms 固定 [G1]。DDR の Marvelous ±16.7 ms・Perfect ±33 ms は非公式集計 [G2]。Clone Hero は映像オフセットの目安を PC モニタ 0〜5 ms、TV 30〜100 ms 以上とし、ストラムの平均ずれを較正に使う [G3]。

### YouTube の落下ノート動画文化
- Synthesia は 2006 年「Piano Hero」として開始、2007 年 Activision の書簡で改名、2011 年に「教則動画を作る最も普及した方法」になったと自称 [S6][S8]。Yamaha は Pietschmann / Rousseau / Amosdoll の 3 チャンネル合計 20 億回超、いずれも Synthesia 表示と記述 [S5]。Rousseau は登録者約 561 万（第三者集計）[YT1]。
- SeeMusic（iOS）は MIDI 録音・音声→MIDI・3D 落下ノート・実写合成で 4K60 書き出し [YT2]。Synthesia 動画の制作受注が Upwork 等に多数 [YT3]。日本の投稿タグ例は「簡単ピアノ」「ドレミ付き」「ゆっくりピアノ」[YT4]。
- 権利: カバー動画は作曲の複製権に加え同期権が要り、同期には強制許諾が無い。Content ID はメロディ照合でカバーも検知し、権利者が収益化を選ぶ運用が一般的とされる（2010 年代の記事）[C1][C2]。Synthesia ストアの曲は「出版社から配信許諾」と明記するが、動画投稿には触れていない [S8]。

## 事例
- **Synthesia**: 落下ノート＋待ち/リズム/本番の 3 モード、手の色分け、運指、多種ラベル、PC キーボード割当。含意: ラベルを鍵盤側とノート側で別に切り替える設計は、六角セルに文字を載せる本企画と直接比較できる。
- **Yousician**: 4 記譜、25〜125% 自動テンポ、ループ、early/late。含意: 成績連動テンポの商用例。
- **flowkey**: Wait Mode＋Loop。含意: マイク入力だと待ちモードが「飛ぶ」事例があり、入力方式と待ちモードの信頼性が結び付く。
- **Simply Piano**: 青/黄/赤でヒント後の正解を区別。含意: キー文字をヒントとみなす採点区分の先例。
- **Piano Marvel SASR**: 20 秒閲覧→80% で昇級→3 ストライク。含意: 初見力の数値化。
- **Melodics**: 早い/遅い/ポケットの 3 値、MIDI 前提。含意: 鍵盤以外の落下レーン採点。
- **Piano Tiles**（2014、Umoni）: 黒タイルをタップ、白で終了 [T1]。含意: 音高対応を捨て「列」だけにした単純化の極。
- **Magic Piano**（Smule）: 光の筋をなぞり、テンポは演奏者が決める [MP1]。含意: 待ちモードだけで成立する音ゲー。
- **Pianu**: ブラウザで QWERTY / MIDI / タッチ [PU1][PU2]。含意: Web MIDI＋PC キーボードの先行例。
- **Rocksmith+**: 落下 3D か楽譜、適応難易度、Riff Repeater、PS Store 評価 2.31/5（5,862 件）[R3]。含意: 適応難易度と区間反復の商用実装。
- **P.I.A.N.O. 2014 / Banquiero 2024 / arXiv 2603.06253**: Synthesia を基準に、鍵盤上投影・MR・適応的ヒントが上回った。含意: 「ノートを鍵盤に近づける」「ヒントを成績で薄める」方向が繰り返し効いている。

## 類推
- リズムゲームの判定幅（osu! の OD 可変、DDR の ±16.7 ms）は「難易度で判定幅を変える」設計語彙を与える。
- Clone Hero の「ストラムの平均ずれでオフセットを求める」較正は、PC キーボード＋ブラウザ音声の未知の遅延を吸収する手順の類推。
- Jack らの結果は、平均遅延よりジッタが体感に効くという類推。
- Yousician の自動テンポ、Rocksmith+ の適応難易度、arXiv 論文の適応透明度は「成績に応じて支援量を変える」同型の仕組み。
- Simply Piano の「ヒント後の正解」色は、本企画のキー文字（Q/W/E）をヒントとみなしたときの採点区分の類推。

## 制約
- 技術: Web MIDI は Safari 非対応・HTTPS 必須 [W1][W2]。BLE MIDI は 7 ms 前後のジッタ付き遅延 [L1]。Chrome/Windows の音声出力は概算 10 ms [L2]。PC キーボードの同時押し上限は出典未確認（推測）。
- 法務: 他人の楽曲を落下ノート化して公開する行為は複製権と同期権の両方に関わり、同期権に強制許諾は無い [C1][C2]。YouTube から採譜した MIDI は権利処理されていない可能性が高い（推測）。
- 人間工学: 遅延検出閾値は音楽家約 100 ms・非音楽家約 180 ms [L5] だが、評価品質は 20 ms で下がる [L4]。洗練度が高いほど JND は小さい [L6]。
- 学習効果: 落下ノートは「どの鍵をどれだけ押すか」は教えるが読譜・技術・表現は教えないという批判が実務者から複数 [E1][E2]。VRSJ 2025 も依存の課題を指摘 [J2]。
- 市場: 定額制の解約摩擦と無料部分の短さが不満の中心 [SP4][Y3]。

## 問い
- 待ちモードと固定テンポ採点をどの段階で切り替える／併存させるのが学習に効くかを示す比較研究は見つかっていない。
- PC キーボードを鍵盤に見立てる場合の遅延（ポーリング・デバウンス）とジッタの実測値は未入手。
- Melodics・Simply Piano・Yousician の判定幅（ms）は非公開で、リズムゲームの値を当てはめてよいかは不明。
- 落下ノートの「依存」を測る指標（ヒントを消したときの保持率など）を arXiv 2603.06253 以外で定義した研究があるか。
- YouTube 由来の楽曲を素材にする場合、Content ID の運用とアプリ内利用の許諾は別問題で、権利処理の範囲は未整理。
- Pianu の稼働状況、Rocksmith+ のピアノ入力（MIDI 対応の有無）は未確認。

## 出どころ一覧
- [S1] https://www.synthesiagame.com/support/guide/firstSong
- [S2] https://www.synthesiagame.com/support/guide/labels
- [S3] https://www.synthesiagame.com/support/guide/assignHands
- [S4] https://apps.apple.com/us/app/synthesia/id579518445
- [S5] Yamaha Hub https://hub.yamaha.com/?p=44644
- [S6] https://en.wikipedia.org/wiki/Synthesia_(video_game)
- [S7] https://www.synthesiagame.com/
- [S8] https://www.synthesiagame.com/About
- [Y1] Yousician サポート https://support.yousician.com/hc/en-us/articles/208678605-Notation-options-in-piano と https://support.yousician.com/hc/en-us/articles/204796991-Practice-and-Play-modes-in-piano（本文 403、検索要約で確認）
- [Y2] https://pianistscompass.org/?p=15355
- [Y3] https://www.commonsensemedia.org/app-reviews/yousician-your-personal-music-teacher
- [F1] https://apps.apple.com/us/app/flowkey-learn-to-play-piano/id1020357408
- [F2] https://au.yamaha.com/en/products/contents/pianos/flowkey/
- [F3] https://coeteco.jp/articles/12592
- [SP1] https://piano-help.hellosimply.com/en/articles/7943490-learning-with-simply-piano-the-basics
- [SP2] https://pianistscompass.org/?p=9588
- [SP3] https://learnopoly.com/simply-piano-review/
- [SP4] https://apps.apple.com/jp/app/id1019442026
- [SP5] https://pianoers.com/simply-piano-review-the-honest-truth-about-learning-piano-with-an-app/
- [PM1] https://pianomarvel.com/article/the-ultimate-sight-reading-test
- [PM2] https://pianomarvel.com/pricing
- [PG1] https://equipboard.com/items/playground-sessions
- [M1] https://midi.org/melodics-using-midi-to-learn-music
- [M2] https://apps.apple.com/app/id1474895145
- [PT1] https://pianoers.com/pianote-review/
- [T1] https://en.wikipedia.org/wiki/Piano_Tiles
- [MP1] https://apps.apple.com/us/app/magic-piano-by-smule/id421254504
- [PU1] https://pianu.com/faq（403、検索要約で確認）
- [PU2] https://www.alternativeto.net/software/pianu/about/
- [R1] https://en.wikipedia.org/wiki/Rocksmith%2B
- [R2] https://blog.playstation.com/archive/2012/09/28/rocksmith-powerslides-into-stores-today/
- [R3] https://store.playstation.com/en-gb/concept/234784
- [R4] https://www.engadget.com/2013-06-05-rocksmith-serenades-1-4-million-ubisoft-teases-news-at-e3.html
- [O1] https://help.oktav.com/en/articles/39-falling-notes
- [PA1] https://help.pianoadventures.com/support/solutions/articles/43000675592-practice-tools
- [P1] Rogers et al. 2014 https://www.uni-ulm.de/fileadmin/website_uni_ulm/iui.inst.100/1-hci/hci-paper/2014/2014-gugenheimer-piano.pdf
- [P2] Banquiero et al. 2024, Virtual Reality 28:67 https://link.springer.com/article/10.1007/s10055-024-00953-w（全文 https://d-nb.info/1328860132/34）
- [P3] https://dl.acm.org/doi/10.1145/3441000.3441039
- [P4] https://arxiv.org/abs/2603.06253
- [P5] https://shdl.mmu.edu.my/8764/
- [J1] https://conference.vrsj.org/ac2025/program/1B1.html
- [J2] https://conference.vrsj.org/ac2025/program/doc/1B1-08.pdf（本文は検索要約で確認）
- [J3] 竹川ら 2017 https://ipsj.ixsq.nii.ac.jp/records/178933
- [L1] https://www.thomannmusic.com/cme_widi_uhost_reviews.htm
- [L2] https://groups.google.com/a/chromium.org/g/blink-dev/c/dTQniJNVVMY/m/LKo0cx7-CwAJ
- [L4] Jack, Stockman, McPherson 2016 https://andrewmcpherson.org/instrumentslab-data/data/andrew/jack_am2016.pdf
- [L5] Van Vugt & Tillmann 2014 https://pmc.ncbi.nlm.nih.gov/articles/PMC3911931/
- [L6] Schmid et al. 2024 https://epub.uni-regensburg.de/59003/3/3678299.3678331.pdf
- [W1] https://caniuse.com/midi
- [W2] https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API
- [G1] https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty
- [G2] 非公式 https://scrapbox.io/0b5vr/Timing_Window
- [G3] https://wiki.clonehero.net/books/guides-and-tutorials/page/calibrating-audio-and-video
- [C1] https://drummagazine.com/legal-beat-do-you-need-permission-to-upload-a-cover-song-to-youtube/
- [C2] https://www.hypebot.com/hypebot/2017/07/how-to-post-a-cover-song-on-youtube-legally.html
- [YT1] https://sponsorradar.com/channels/rousseau
- [YT2] https://apps.apple.com/us/app/id1494198562
- [YT3] https://www.upwork.com/services/product/video-audio-a-synthesia-piano-tutorial-video-for-your-learning-or-youtube-1598037469095067648
- [YT4] https://yutura.net/channel/49683/video/ookevt7KJ2U/
- [E1] https://www.pianosightreading.com.au/synthesia/
- [E2] https://pianoers.com/synthesia-piano-review/
- 二次資料の比較表: https://hackernoon.com/best-piano-learning-apps-in-2026-an-in-depth-comparison-of-music-education-technology

## 検証結果

検証日 2026-10-23。出どころ URL を実際に読み、書かれている内容と突き合わせた。PDF は pdftotext でテキスト化して確認。WebSearch は上限に達していたため使えず、代替は既知の一次 URL の直接取得のみ。判定・提案はしない。

| # | 事実 | 結果 | 根拠と補足 |
|---|---|---|---|
| 1 | Synthesia の既定色・運指・ラベル・Virtual Piano Mapping | **confirmed** | labels ページ: Key Labels / Note Labels を切り替えて別々に設定、種類は Octaves / Finger Hint Numbers / Virtual Piano Mapping / English Note Names / Scale Number / Fixed-Do / Movable-Do / Simple Names。Virtual Piano Mapping は「shows which keys to press on your typing keyboard when you don't have a digital piano connected」で、自分で弾くパートを選んだときだけ表示。既定色と運指の置き方は labels ページではなく firstSong ページ（「Usually the left hand is blue and the right hand is green」「A finger hint is generally the marker that says it's time to move your hand」、残りは「can be inferred」）。 |
| 2 | Synthesia の 3 モードと採点、公式ガイドにループ無し | **corrected** | Yamaha Hub「5 Ways to Use Synthesia」（Tyler Swick、2022-04-20）は 3 モード（記事内の名称は Practice the Melody / Practice the Rhythm / Song Recital）、Melody は正しい鍵まで待ち「Tempo is not a concern」、Rhythm はテンポを落とせるがメトロノーム基準、Recital は全速、採点は「a fraction of correct notes over possible notes and is color-coded」で一致。ループ: 公式サポートガイドの索引（11 ページ）にループの項目は無く firstSong はタイムラインで飛ぶ操作のみ、という限定なら正しいが、Synthesia 自身の App Store 説明文は「loops, bookmarks, and the built-in metronome」を機能に挙げ、更新履歴に「Set the number of errors you'd like before your loop restarts automatically」とある。つまり**区間ループは存在する**（ガイドに書かれていないだけ）。根拠 https://apps.apple.com/us/app/synthesia/id579518445 |
| 3 | Yousician の記譜 4 種・25〜125%・5% 刻み自動・ループ・片手オフ・判定・3 つ星・止まらない | **confirmed** | 元 URL は 403 だが、同記事の Zendesk API JSON（https://support.yousician.com/api/v2/help_center/en-us/articles/204796991.json）で本文確認: Auto-adjust speed は「It works from 25% to 125% in 5% increments」「adjusts it up or down depending on how you play」、「You can loop any section by moving the sliders」、Left / Right hand でどちらかをオフ。記譜は同 API の 208678605 で enhanced / falling notes（左手青・右手紫、運指番号と音名）/ colored / standard sheet の 4 種。perfect/good/bad・early/late・最大 3 つ星（白＝合格、金＝完璧）・間違えても止まらない、はレビュー（pianistscompass 2026-01-12）の記述で、公式記事には無い。 |
| 4 | Simply Piano の判定色、85%/95%、Wait for me、リズムの甘さ | **confirmed** | 公式ヘルプ: 青「correctly with no hint given」、黄「after the app gave you a hint on the visual keyboard」、赤「wrong note」、「in moving stages only」で一致。85% / 95% と「Wait for me」は pianistscompass（2026-01-09）、「You can play the wrong rhythm entirely and still get all green notes」も同記事。裏拍で弾いても正解扱いは learnopoly（「deliberately played off-beat. The app still marked my playing as correct」）。注: レビュー側の色は緑/赤/黄で公式の青/黄/赤と呼び方が違う（版の違いか不明）。 |
| 5 | flowkey の Wait Mode・Loop・片手・入力・レビュー・4.7（66K） | **confirmed** | App Store: 4.7 / 66K、Wait Mode「waits for you to hit the right notes and chords」、Loop、Select a Hand、「microphone – or through Bluetooth/MIDI」。レビュー「Wait mode sometime skipped」（2020-07-07）への開発側返信「I'd highly recommend to use a MIDI connection」、複数音の判定不良（2021-01-16）への返信「will definitely disappear with the cable connection」。 |
| 6 | Rogers ら 2014 P.I.A.N.O. の比較結果 | **corrected** | PDF 本文: n1=56 被験者内、n2=18 被験者間で「5 consecutive days」（D1–D5）、認知負荷の有意な低減、正答音符 F(2,88)=121.64, p<.001 は一致。しかし**「誤って押した音符数は 3 方式で差なし」は誤り**。rANOVA で有意差（F(1.75,76.92)=60.11, p<.001）があり、P.I.A.N.O. 学習者は Synthesia（F(1,44)=60.62）・Finale（F(1,44)=85.70）より**誤打鍵が多かった**。著者はより多くの音を弾こうとした結果と説明し、見逃し音符は有意に少ない。本文「In summary, with the exception of incorrectly pressed notes, ...」。 |
| 7 | Banquiero ら 2024 の MR vs Synthesia | **corrected**（細部） | d-nb.info 全文: Virtual Reality (2024) 28:67、Meta Quest Pro のカラーパススルー、実鍵盤上に落ちる立方体「falling notes」、比較は Synthesia v10.9.5895 ＋ iPad Pro ＋ CME M-Key 49 鍵 MIDI、N=33（7〜65 歳、MR 群 17・Syn 群 16）、教師 4 名が 0〜10 で採点、初回使用で MR が有意に高い（U=197.5, p=0.027）、年齢・性別と独立、は一致。「両手の曲は正しく弾けなかった」は**Synthesia 条件についての観察**（iPad と鍵盤を交互に見る必要があるため）で、Simply Piano 等の経験者を除く、と限定されている。MR 側の結果ではない。 |
| 8 | arXiv 2603.06253 と VRSJ 2025 1B1-08 | **corrected**（VRSJ の語句） | arXiv: Hsieh, Visser, Eisemann, Marroquim「Skill-Adaptive Ghost Instructors」（CHI 2026 採録、2026-03-06 投稿）、N=30 被験者内、「constant cueing can induce overreliance and erode memorization and skill transfer」、成績連動透明度（Dynamic）が固定（Static）より音高・運指の正確さが高く、タイミングは同等、保持は 10 分後まで。一致。VRSJ: プログラム頁の 1B1-08「ピアノ演奏者の譜読み能力向上を目指した AR 学習支援手法の設計と実装」（和泉慶乃佑・菅沼拓夫、東北大学）の概要は「従来のピアノロール型支援は視覚的に直感的である一方、学習者が受動的になりやすく、演奏者の能力向上にはつながりにくい」「習熟度に応じて AR 支援を段階的に減少させる」。**「依存」という語は概要に無く**、PDF 本文は暗号化＋CJK フォントのため手元でテキスト化できず未確認。 |
| 9 | 遅延知覚（Jack 2016、Wessel & Wright、Van Vugt & Tillmann 2014、Schmid 2024） | **confirmed** | Jack, Stockman, McPherson 2016 PDF: 条件 0 / 10 / 20 / 10±3 ms、0 ms は 20 ms と 10±3 ms より 6 項目で有意に高評価、0 と 10 ms は有意差なし（例外: Naturalness のみ 10 ms が 0 ms より有意に高評価）、平均同期誤差は有意差なし、Wessel & Wright 2002 は「less than 10ms ... jitter of less than 1ms」。Van Vugt & Tillmann 2014（PLoS ONE 9(2): e87176）: 非音楽家 180±104 ms、音楽家 102±65 ms。Schmid ら 2024（AM '24）: n=37、JND 49 / 27 / 77 ms（基準 0 / 64 / 512 ms）、洗練度が高いほど小さい。 |
| 10 | リズムゲームの判定幅と較正 | **confirmed** | osu! wiki: 300 = 80 − 6×OD、mania MAX = 16（stable では実質 ±16.5 ms との注記）。DDR ±16.7 / ±33 ms は scrapbox 頁で、同頁自身が「だいたい公式情報は出てないので、信憑性はないです」と注記（＝非公式）。Clone Hero wiki: PC モニタ「0-5 ms」、TV「30-100 ms or higher」、較正はストラムごとのオフセットを平均。 |
| 11 | Web MIDI 対応・HTTPS と許可・BLE MIDI 実測・Chrome/Windows 10 ms | **confirmed** | caniuse: Chrome 43 / Edge 79 / Firefox 108、Safari「no native support」（Safari 18.4+ 向け第三者拡張のみ）。MDN: secure context（HTTPS）必須、「The user must explicitly grant permission」。Thomann レビュー（7thsven、2026-01-06、1 件のみ）: 「7 ms, with a range of 3 to 11 ms」「6-8 ms on average」（Linux PC、Bluetooth 5.2）、「connection interval is 7.5 ms in the spec」「no way around these latency figures with Bluetooth versions before 6.2」。blink-dev「Intent to Ship: AudioContext.outputLatency」（2021-11-13）: 「MacOS = 128 frames, Windows = 10ms, Android = 96 frames」。 |
| 12 | 料金と不満 | **corrected**（細部） | 各値は確認: Synthesia「Unlock for $39 $29」（18th Anniversary Sale）、flowkey 1 年 12,800 円・Simply Piano 1 年 9,800 円（coeteco、更新 2025-11-12）、Simply Piano US $169.90/年（pianoers、2026-07 更新）、Piano Marvel $129.99/年＋Free プラン、Playground Sessions $99（B&H の 1 年サブスク表示）、Melodics $179.99/年・「20 free lessons for each instrument with 5 minutes of play time each day」、Pianote $200 / $240 年。Yousician $89.99 / $139.99 は pianistscompass の表示だが、**US App Store の IAP 一覧は One Instrument 年 $119.99、Premium+ 年 $159.99〜$179.99** で、経路・時期で異なる。不満: commonsensemedia（Yousician）「limited to using it for a only few minutes a day」と自動更新への注意、JP App Store（Simply Piano）レビュー「課金の自動更新注意」と開発側説明「アプリ内の操作によって解約することはできません」。source_url の coeteco は flowkey と Simply Piano の日本円のみ。 |

### 補足
- 今回の訂正で向きが変わるのは #6（投影方式は誤打鍵が**多い**。少ないのは見逃し）と #2（Synthesia にループはある）。
- #7 の「両手で弾けなかった」は比較側（Synthesia）の観察であり、MR 方式の限界として引くと誤読になる。
- #8 の VRSJ 本文は未読。「依存」の語の有無は本文で要確認。
- Yousician の判定語（perfect/good/bad、early/late）と星の仕様は公式記事では確認できず、レビュー出典に留まる。
