# YouTube 再生との同期と法務・音源の扱い

調査日 2026-10-23。判定はしない。推測は「推測」と明記。JASRAC 公式サイトは当日接続不可で、FAQ・弁護士解説・検索要約で補った箇所は「原典未確認」と記す。

## 事実

### 1. IFrame Player API の仕様 [S1][S2]
- `getCurrentTime()` は「再生開始からの経過秒数」を返すとだけあり、精度・更新頻度の記述はない。
- `setPlaybackRate()` は「提案」で変更は保証されず、`onPlaybackRateChange` で確認する。未対応値は 1 に近い値へ丸め、cue/load で 1 に戻る。実測の利用可能レートは 0.25〜2 の 8 段階 [S0]。
- `seekTo()` は未取得区間では直前のキーフレームへ寄る。`start` も最大約 2 秒手前に寄る。
- `onStateChange`: -1 未開始 / 0 終了 / 1 再生 / 2 停止 / 3 バッファ / 5 キュー済。
- `onAutoplayBlocked`: ブラウザが autoplay や `playVideo` を止めると発火（典型は「操作なしの非ミュート再生」）。
- `playsinline=1` で iOS インライン再生（既定は全画面）。`disablekb=1` でプレイヤーのキー操作（Space/k・矢印・f/j/l/m・0-9）を止められる。`controls=0` でコントロール非表示。
- 最低 200×200px、16:9 なら 480×270 推奨。
- 「音声に触れない」との明文はないが、クロスオリジン iframe の中の `<video>` に親は触れず [S9]、Web Audio 解析には CORS が要る [S10][S11]。
- 非公式解析: API は iframe へ 250ms ごとに「listening」を再送し、時刻は poll が必要 [S3]。

### 2. 実測（調査者の一回測定、環境依存の参考値）[S0]
Windows 11、Claude デスクトップ内蔵ブラウザ（Chromium 152）、タブ可視、`autoplay:1, mute:1`、動画 M7lc1UVf-VE、1ms setInterval で監視。
- 値の変化は 6 秒で 413 回（約 69 回/秒）。間隔の中央値 15.2ms（p25 14.9 / p75 15.6 / 最大 18.1）、増分の中央値 15.0ms。`performance.now()` とのずれは 6 秒で +2.8ms。
- 4 秒に 2 回、値が逆行（最大 −8.4ms）。
- レート 1.5 では 15.8ms 間隔で増分 24.0ms。
- `seekTo(200,true)`: 約 31ms で値が目標付近へ、状態 3 が 31→187ms、約 208ms で再進行。
- 停止中は値が凍結。15 桁の浮動小数。広告は出ず、モバイルは未測定。

### 3. ブラウザの自動再生・タイマー
- Chrome: ミュート autoplay は常に可、音ありはクリック/タップ後か MEI 閾値後。クロスオリジン iframe は `allow="autoplay"`。`AudioContext` はジェスチャ前は suspended [S12]。
- iOS WebKit: 無音か `muted` ならジェスチャなし可、音ありは `touchend/click/keydown` 内で再生。`playsinline` なしは全画面。可視時のみ autoplay、ジェスチャなしのミュート解除は停止 [S13]。macOS Safari も同様 [S14]。
- `setInterval` は数十 ms ぶれ、バックグラウンドタブは毎秒 1 回 [S15]。`currentTime` の更新頻度はブラウザ依存 [S16][S17]。

### 4. YouTube の規約
- 利用規約: コンテンツの「アクセス、複製、ダウンロード、配信…」を明示許可なく行うこと、コピー防止機能の「迂回、無効化」、自動アクセスを禁止 [S4]。
- API 利用規約: Developer Policies 順守が義務（1.3/3.1）。視聴覚コンテンツを API 以外で複製・配布する権利はない（16.3）。監視・監査（6）、通知なき停止（24.2）[S5]。
- Developer Policies: III.E.1.a 音声・動画の download/cache/store を書面承認なく禁止。III.F.3.a 埋め込み視聴への課金禁止、III.F.3.b 再生ボタン以外の操作要求禁止、III.F.3.c 視聴への「incentives or rewards」禁止。III.I.5 広告の改変・ブロック禁止。III.I.6 プレイヤーの modify/build upon/block 禁止。III.I.7 音声と映像の分離禁止。III.I.9 表示中ページ外のバックグラウンド再生禁止 [S6]。
- Required Minimum Functionality: 「埋め込みプレイヤーのいかなる部分の前にも overlays, frames, その他の視覚要素を表示してはならない」。最低 200×200。可視（半分超）になるまで自動再生不可 [S7]。
- 順守ガイド: 同意取得や再生操作（ミュート・全画面・再生・停止）のオーバーレイは「プレイヤー UI と衝突しない限り」可。歯車など標準機能の非表示、関連動画の無効化、広告制限は不可 [S8]。
- 埋め込みの広告収益は「YouTube と動画所有者のみ」。埋め込み先は審査され「侵害を助長するサイト」は不可。「click-to-play で、スクリプト再生でなく」推奨 [S18]。権利者はドメイン・アプリ単位で埋め込みをブロック可 [S19]。
- Content ID: 自動照合し、権利者はブロック/収益化/追跡を選択 [S20]。第三者サイトへの埋め込みにも請求が及ぶ [S21]。

### 5. ダウンロード経路（yt-dlp）
- 2020-10 RIAA が DMCA 1201 を理由に youtube-dl の削除を要求、GitHub は約 1 か月後に復元し 100 万ドルの防衛基金を設立 [S22][S23]。
- yt-dlp Wiki（2026-07-12 更新）: YouTube は「再生に PO Token を強制する変更を展開中」。無いと 403 や IP ブロック。トークンは動画 ID に紐づき約 12 時間で失効 [S24]。提供者は「PO Token でも大半のボット判定は回避不能」と注記 [S25]。

### 6. 日本の著作権・JASRAC
- JASRAC FAQ: ゲームへの複製は J-WID 確認 → 権利者と使用料を含む条件確認 → J-RAPP 申込 → 承諾書 → 支払い [S26]。
- 「ゲームの配信」ページ（原典未確認・検索要約）: 配信にはインタラクティブ配信に加え「ゲームソフトへの録音」手続きが原則必要。特定ゲーム（音楽ゲーム）の国内作品は録音手続き不要との注記 [S27]。
- 弁護士解説: 音楽ゲームは特例措置の対象外。権利者との契約が優先し、配信使用料不要の合意を発売前に届け出れば手続き不要 [S28]。ゲームソフトの使用料は「指値」、外国曲は JASRAC 非管理が多い。動画投稿サービスの包括契約は原盤を含まない [S29]。
- 大合奏！バンドブラザーズDX（2008）: 投稿曲を「JASRAC 管理でインタラクティブ配信が信託された国内曲＋著作権消滅曲」に限定、作品コード入力、審査後配信、会社がダウンロード毎に使用料負担、上限 100 曲 [S30]。
- JASRAC と YouTube: 2008-10-23 包括契約（曲と歌詞、公式 MV とユーザー動画、収入の 1.875%）[S31]。2023-02-10 更新で 7,500 万超の作品、JASRAC が Content ID を本格活用、Shorts も対象 [S32]。
- 採譜・譜面: 知財高裁 令和5年4月20日（始まりの紋章事件）は譜面作成とピアノ録音を 30条の3「検討の過程における利用」と認めず、編曲を翻案と位置づけ、確定 [S33]（解説本文は未読）。バンドスコア模倣事件では被告が「採譜すれば本質的演奏情報は必然的に一致」と主張、2026-10-09 に最高裁で損害賠償が確定した見出しがある [S34][S35]（本文未読）。
- 違法動画へのリンクは「自動公衆送信の幇助」になり得るとの弁護士見解（2006）。埋め込みの確立判例は見つからず [S36]。
- 二次創作: 東方 Project はブラウザ・スマホゲームを「無料に限る（広告可）」、音源データは明記なし [S37]。ボカロは P ごとに規約が異なり、譜面への言及はほぼない [S38][S39]。ピアプロ PCL はキャラクター規約 [S40]。

### 7. 代替音源の条件
- osu! Featured Artists: 「osu! 内での利用に非独占ライセンス」、タイミング済み .osz、2016〜2025 で 519 組（調査者計算）。FA 外は作者条件確認・CC は安全・不明なら許可。無許可譜面は「削除の危険」[S41][S42]。
- DOVA-SYNDROME: 商用可・表記不要だが「音源が主役のコンテンツ」「聴かせることが主機能の製品」「楽譜の作成・販売」「JASRAC や Content ID への登録」を禁止、プラットフォームは事前相談 [S43]。
- 魔王魂: 商用無料、「魔王魂」表記必須、改変可、単体再配布不可、ゲーム用暗号化可、音楽主体の配信・販売は禁止 [S44]。
- YouTube オーディオライブラリは Content ID 請求なし [S45]。

### 8. 判定幅の参考値
osu! standard の 300 は ±(80−6×OD)ms（OD10 で ±20ms）、mania の MAX は ±16ms、taiko の Great は ±(50−3×OD)ms [S46]。実測の更新粒度 約 15ms はこれと同程度。

## 事例
- Rhythm Plus（henryzt、GPL-3.0、Vue2+Canvas+Firestore、V2 非公開）: YouTube か URL 音源を選ぶ。`youtube.js` は `getCurrentTime()` の薄いラッパー、`gameInstance.js` は毎フレームと 100ms ループで直読みし遅延補正項なし。判定はノート距離比 <0.5 [S47][S48][S49]。
- Falling Nikochan（na-trium-144、AGPL-3.0、nikochan.utcode.net）: 「YouTube 埋め込みを音源に」、6 桁 ID で譜面共有。規約で「公式 IFrame Player API で YouTube 規約に従う」「再生で収益なし」「違法アップロード・埋め込み禁止動画の譜面は禁止」「権利者申立で削除」[S50][S51]。
- UTap（Code and DESIGN、2026-07-02、iOS/Android）: 埋め込み動画からテンポ・リズム・盛り上がりで譜面を自動生成。法務・収益は非公表 [S52]。
- YouTube Rhythm Hero Pro（itch.io）: URL/ID 入力とオフセット調整。ユーザーが「ノートが一定間隔で曲に追従しない」と指摘 [S53]。
- TubeSurf（userscript、GPL-3.0）: youtube.com のプレイヤー上に 3D ゲームを重ね、タブ内音声を解析。広告中は停止、176BPM 超は半分で検出 [S54]。
- yt-beat-sync（dev.to）: `getCurrentTime` を「粗く、塊で更新、バッファ中は凍結」と評し `time()=getCurrentTime()−intro` で駆動。音は 40ms 間隔・150ms 先読みで AudioContext に予約。最初の pointerdown で API を先読み [S15]。
- Sonolus: 誰でもカスタムサーバーを立てられる枠組み。レベルは cover/preview/bgm（.mp3 推奨）/data。公式サーバー 3 つ、著作権の責任分担は Wiki に記載なし [S56][S57][S58]。
- StepMania: エンジン MIT、ユーザーが .ogg/.mp3 に simfile を作り第三者サイトで共有。公式コンテストはライセンス済み曲のみ [S59]。
- Clone Hero: v1.0 で同梱 17 曲（DragonForce のゲーム用書き下ろしを含む）、主力はコミュニティ譜面 [S60]。
- BeatSaver（Beat Saber カスタム曲）: DMCA 窓口と繰り返し侵害者の永久停止（2021-01-11）[S61]。

## 類推
- 時刻同期: W3C timing object は映像を約 7ms、JS キューを約 1ms 以内に合わせ、表示遅延は 60fps で最大約 16ms [S17]。「プレイヤー時刻＋ローカル単調時計」の補間は W3C でも提案 [S16]。Godot は「再生位置から出力遅延を引く」[S64]。ウォッチパーティ同期は 5 秒ごと交換・1.5 秒超でシーク [S65]。
- 権利仲介: バンブラ DX の「作品コード＋審査＋従量払い」[S30]、osu! の「非独占ライセンス曲庫＋タイミング済みファイル」[S41]。

## 制約
- 技術: 埋め込みの波形には触れない [S9][S10][S11]。`getCurrentTime` は約 15ms 刻みで逆行（−8ms）や seek 後 約 200ms のバッファがある [S0]。レート変更は非保証 [S1]。モバイルは muted 以外ジェスチャ必須、`playsinline` 必須、不可視なら再生不可 [S12][S13]。バックグラウンドはタイマー 1 回/秒 [S15]。iframe にフォーカスが移ると Space や数字キーをプレイヤーが消費する [S2]（推測: フォーカス管理が要る）。
- 法務（YouTube）: プレイヤーの前に何も重ねられず、半分超可視、200×200 以上 [S7]。音声の保存・キャッシュ禁止 [S6] のため yt-dlp でサーバー側採譜する設計は API 規約と利用規約に抵触し [S4][S6]、PO Token で技術的にも不安定 [S24]。広告は止められず埋め込み先に収益は入らない [S6][S18]。
- 法務（日本）: 譜面作成は翻案に当たり得る [S33][S34]。JASRAC 管理曲のブラウザゲームはインタラクティブ配信と録音の手続きが想定され、音楽ゲームは特例対象外 [S27][S28]。原盤は JASRAC の範囲外 [S29]。
- 音源: DOVA は「音源が主役」「楽譜作成」を禁じるため音ゲー用途は規約外の可能性（推測）[S43]。魔王魂は表記必須 [S44]。
- 人間工学: 判定幅 ±16〜20ms の設計 [S46] に対し時刻源の粒度が 15ms [S0]。

## 問い
1. 広告中の `getCurrentTime` と状態の挙動。TubeSurf は「広告中は停止」とする [S54] が API 上の検出手段は未確認。
2. iOS Safari / Android Chrome での更新間隔と逆行頻度（未測定）。
3. ノートをプレイヤー矩形の外に描く構成は RMF の「前に重ねる」に当たらないか。Compliance Audit の要否。
4. `controls=0`（公式パラメータ）と「標準機能のブロック禁止」[S8] の関係。
5. 得点・ランキングは III.F.3.c「視聴への incentives or rewards」に当たるか。
6. 音を複製しない運営者は JASRAC のインタラクティブ配信の主体か。譜面データの共有は翻案物の公衆送信か。
7. 埋め込み禁止・違法アップロード動画の検出と譜面の無効化（`onError` の扱いは未確認）。
8. `getCurrentTime` と実際の音出力の遅延（未測定）。

## 出どころ一覧
- [S0] 調査者の実測（2026-10-23、Chromium 152 / Windows 11、scratchpad 内 ytmeasure/index.html）
- [S1] https://developers.google.com/youtube/iframe_api_reference
- [S2] https://developers.google.com/youtube/player_parameters
- [S3] https://nutbread.github.io/yia/
- [S4] https://www.youtube.com/t/terms
- [S5] https://developers.google.com/youtube/terms/api-services-terms-of-service
- [S6] https://developers.google.com/youtube/terms/developer-policies
- [S7] https://developers.google.com/youtube/terms/required-minimum-functionality
- [S8] https://developers.google.com/youtube/terms/developer-policies-guide
- [S9] https://lists.whatwg.org/pipermail/whatwg-whatwg.org/2008-November/017084.html
- [S10] https://michaelbromley.co.uk/blog/audio-visualization-with-web-audio-canvas-and-the-soundcloud-api
- [S11] https://codereview.chromium.org/2314903002
- [S12] https://developer.chrome.com/blog/autoplay
- [S13] https://webkit.org/blog/6784/new-video-policies-for-ios/
- [S14] https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/
- [S15] https://dev.to/leviyi/syncing-a-rhythm-game-to-a-youtube-iframe-a-metronome-on-someone-elses-player-3la0
- [S16] https://www.w3.org/community/webtiming/2016/02/25/currenttime-reporting-chromium-on-android
- [S17] https://lists.w3.org/Archives/Public/public-web-and-tv/2018Jun/0039.html
- [S18] https://support.google.com/youtube/answer/132596
- [S19] https://support.google.com/youtube/answer/6301625
- [S20] https://support.google.com/youtube/answer/2797370
- [S21] https://help.songtrust.com/knowledge/what-if-the-youtube-video-that-contains-my-music-is-embedded-in-a-webpage
- [S22] https://techcrunch.com/2020/11/16/github-defies-riaa-takedown-notice-restoring-youtube-dl-and-starting-1m-defense-fund
- [S23] https://www.eff.org/node/104087
- [S24] https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- [S25] https://pypi.org/project/bgutil-ytdlp-pot-provider
- [S26] https://secure.okbiz.jp/faq-jasrac/faq/show/2176?category_id=191&site_domain=jp
- [S27] https://www.jasrac.or.jp/users/internet/game/ （当日接続不可、検索要約のみ）
- [S28] https://note.com/maeben/n/nce7335b43042
- [S29] https://www.kottolaw.com/column/000496.html
- [S30] https://www.nintendo.co.jp/ds/interview/axbj/vol1/index2.html
- [S31] https://av.watch.impress.co.jp/docs/20081023/jastube.htm
- [S32] https://blog.youtube/intl/ja-jp/news-and-events/2023_02_youtube-content-id-jasrac
- [S33] https://www.hanketsu.jiii.or.jp/hanketsu/jsp/hatumeisi/hyou/202605hyou.pdf （解説、本文未読）
- [S34] https://www.courts.go.jp/app/files/hanrei_jp/656/011656_hanrei.pdf （本文未読）
- [S35] https://www.nippon.com/en/news/yjj2026100900696/ （取得時 404、見出しのみ）
- [S36] https://www.itmedia.co.jp/news/articles/0610/27/news029.html
- [S37] https://touhou-project.news/guideline/
- [S38] https://note.com/kasamuratota/n/n82aa588956a1
- [S39] https://scrapbox.io/uaolpian/ボカロP別・二次創作ガイドライン
- [S40] https://piapro.jp/license/pcl/summary
- [S41] https://osu.ppy.sh/wiki/en/Featured_Artists
- [S42] https://osu.ppy.sh/wiki/en/Rules/Content_usage_guidelines
- [S43] https://opentracks.com/help/articles/license/ （dova-s.jp からリダイレクト）
- [S44] https://maou.audio/rule/
- [S45] https://support.google.com/youtube/answer/3376882
- [S46] https://osu.ppy.sh/wiki/en/Beatmap/Overall_difficulty
- [S47] https://github.com/henryzt/Rhythm-Plus-Music-Game
- [S48] https://raw.githubusercontent.com/henryzt/Rhythm-Plus-Music-Game/master/src/javascript/youtube.js
- [S49] https://raw.githubusercontent.com/henryzt/Rhythm-Plus-Music-Game/master/src/javascript/gameInstance.js
- [S50] https://github.com/na-trium-144/falling-nikochan
- [S51] https://nikochan.utcode.net/ja/main/policies
- [S52] https://www.value-press.com/pressrelease/376922
- [S53] https://ocuc.itch.io/youtuberhythmheropro
- [S54] https://greasyfork.org/scripts/589694-tubesurf
- [S56] https://sonolus.com/
- [S57] https://wiki.sonolus.com/getting-started/explore/custom-servers.html
- [S58] https://wiki.sonolus.com/level-specs/resources/level-bgm.html
- [S59] https://en.wikipedia.org/wiki/StepMania
- [S60] https://en.wikipedia.org/wiki/Clone_Hero
- [S61] https://beatsaver.com/policy/dmca
- [S64] https://docs.godotengine.org/en/3.6/tutorials/audio/sync_with_audio.html
- [S65] https://www.mintlify.com/nawinsharma/watchNChill/architecture/real-time-sync

## 検証結果

検証日 2026-10-23（確かめ役）。各事実の出どころ URL を WebFetch で読み直し、足りない分は別の一次情報に当てた。WebSearch は当日の上限に達して使えず、JASRAC 公式サイト（jasrac.or.jp）は接続拒否（ECONNREFUSED）で当日も未確認。実測は同じ計測ページを内蔵ブラウザで再実行して照合した。判定・提案はしない。

1. IFrame API の仕様（getCurrentTime / setPlaybackRate / seekTo）: **confirmed**。公式リファレンスの記述どおり。getCurrentTime は "Returns the elapsed time in seconds since the video started playing" のみで精度・更新頻度の記述なし。setPlaybackRate は "does not guarantee that the playback rate will actually change"、未対応値は "round that value down to the nearest supported value in the direction of 1"、cue/load で "reset the playback rate to 1"。seekTo は未取得区間で "advance to the closest keyframe before that time"。根拠: https://developers.google.com/youtube/iframe_api_reference

2. 調査者の一回実測（約 69 回/秒、間隔中央値 15.2ms、逆行、seek 後の挙動）: **confirmed（再現）**。ただし出どころ URL（iframe_api_reference）にこの数値は無く、実際の出どころは scratchpad の計測ページ ytmeasure/index.html。同ページを 2026-10-23 に内蔵ブラウザ（Chrome/152.0.7977.167、タブ可視、autoplay+mute、同じ動画 M7lc1UVf-VE、1ms setInterval）で再実行した結果: 6 秒で 412 回変化、間隔 中央値 15.3ms（p25 14.9 / p75 15.6 / 最大 16.6）、増分 中央値 15.0ms（最大 17.0 / 最小 −9.9）、performance.now とのずれ −13.7ms/6 秒（初回は +2.8）。逆行は 4 秒で 3 回（−8.0 / −2.9 / −4.3ms）。レート 1.5 では間隔 中央値 15.2ms・増分 中央値 22.5ms（最大 36.0）。seekTo(200,true) は 28.7ms で値が 200 に達し同時に状態 3、259.6ms で状態 1 かつ前進（初回 31ms / 208ms）。停止中は 1 秒間値が凍結。広告・モバイルは今回も未測定。一回測定の環境依存という性格は変わらない。

3. Required Minimum Functionality（オーバーレイ禁止・200×200・半分超可視まで自動再生禁止）: **confirmed**。"You must not display overlays, frames, or other visual elements in front of any part of a YouTube embedded player"、"at least 200px by 200px"、"must not initiate an automatic playback until the player is visible and more than half of the player ..."。加えて "must not make changes to the YouTube player that are not explicitly described by the API documentation"、マウスオーバー/タッチで操作を起こすことの禁止もある。根拠: https://developers.google.com/youtube/terms/required-minimum-functionality

4. Developer Policies（III.E.1.a / III.I.5 / III.I.6 / III.I.7 / III.I.9 / III.F.3.c）: **confirmed**。条番号・文言とも一致。補足: III.F.3.c の対象は「視聴」に限らず "incentives, rewards, or other compensation to users for engaging with YouTube Applications"（例: 視聴・高評価・共有・登録・コメント）。III.I.9 の background player は「利用者が見ているページ・タブ・画面に表示されていないプレイヤー」と定義。III.E.1.b でオフライン再生の提供も禁止。根拠: https://developers.google.com/youtube/terms/developer-policies

5. YouTube 利用規約（日本語版）: **confirmed**。発効 2023-06-01 版。「アクセス、複製、ダウンロード、配信、送信、放送、展示、販売、ライセンス供与、改変、修正、またはその他の方法での使用」を明示的承認か書面許可なく行うことの禁止、「コンテンツのコピーもしくはその他の利用法を防止もしくは制限する機能」を含むセキュリティ関連機能の「迂回、無効化、不正利用」の禁止、「自動化された手段（ロボット、ボットネット、スクレーパなど）」によるアクセスの禁止（公開検索エンジンの robots.txt 準拠利用は例外）。根拠: https://www.youtube.com/t/terms

6. クロスオリジン iframe と Web Audio: **corrected**。出どころに挙げた WHATWG 2008-11-10 の投稿（Maciej Stachowiak、スレッド "Same-origin checking for media elements"）は media 要素のクロスオリジン読み込みの是非を論じたもので、iframe の DOM 到達性・Web Audio・ジェスチャ・Chromium のいずれにも触れていない。内容そのものは次で裏づく: (a) 親から別オリジン iframe の Window に触れられるのは postMessage/location 等ごく一部（MDN Same-origin policy）、よって iframe 内の video 要素には届かない。(b) CORS: Chromium の実装が CORS 不可の media 要素からの音を無音にし "MediaElementAudioSource outputs zeroes due to CORS access restrictions" を出す（media_element_audio_source_handler.cc）。(c) 「Chromium はクロスオリジン iframe にジェスチャなしの Web Audio を許さない」の典拠 codereview 2314903002（2016-09）は Android の mediaPlaybackRequiresUserGesture 設定下だけの介入で古い。現行は Chrome 71 以降の autoplay ポリシーで AudioContext はユーザー操作（sticky activation）まで suspended、別オリジン iframe は allow="autoplay" で権限を委譲されない限り AudioContext が動かない、という形。根拠: https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy / https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webaudio/media_element_audio_source_handler.cc / https://www.chromium.org/audio-video/autoplay/ / https://codereview.chromium.org/2314903002

7. 自動再生（Chrome / iOS WebKit）: **confirmed**。iOS 側は出どころどおり（iOS 10 以降: "<video muted> elements will also be allowed to autoplay without a user gesture"、playsinline なしは iPhone で全画面、"<video autoplay> elements will only begin playing when visible on-screen"、ジェスチャなしのミュート解除で "playback will pause"）。Chrome 側は出どころ URL に無く、developer.chrome.com/blog/autoplay（"Muted autoplay is always allowed"、音ありはクリック/タップ後・デスクトップは MEI 閾値後・ホーム画面追加/PWA、クロスオリジン iframe は allow="autoplay" で委譲）と chromium.org の autoplay ページで確認。根拠: https://webkit.org/blog/6784/new-video-policies-for-ios/ / https://developer.chrome.com/blog/autoplay / https://www.chromium.org/audio-video/autoplay/

8. yt-dlp の PO Token と RIAA の削除要求: **corrected（細部）**。Wiki（"edited this page Jul 12, 2026"）は "YouTube is at present rolling out changes to enforce PO Tokens for video playback"、無いと "HTTP Error 403, or result in your account or IP address being blocked"、"Most PO Tokens (such as for web GVS/Player) are bound to the video ID" と記す一方、寿命は "possibly as short as 12 hours" に続けて "some reports suggest that the token may be valid for several months" ともあり、「約 12 時間で失効」と言い切ってはいない。また "Currently, only GVS and Subs require PO Tokens for some clients" で、表では web_embedded / tv / android_vr は不要。RIAA の通知は 2020-10-23 付で 17 USC 1201(a)(2), 1201(b)(1) を根拠に ytdl-org/youtube-dl の削除を要求、GitHub は 2020-11-16 に復元し 100 万ドルの基金を設立（約 3 週間半）。根拠: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide / https://github.com/github/dmca/blob/master/2020/10/2020-10-23-RIAA.md / https://github.blog/2020-11-16-standing-up-for-developers-youtube-dl-is-back/

9. JASRAC FAQ と弁護士解説（音楽ゲームは特例対象外・指値）: **corrected（補足）**。FAQ の 5 段階（J-WID 確認 → 権利者と使用料額を含む条件確認 → J-RAPP 申込 → 権利者の承諾書の写し提出 → 許諾・請求後に支払い）は原文どおり。FAQ 自体は音楽ゲーム・指値に触れない。「音楽ゲームは特例措置の対象外」は前原一輝弁護士の note（2025-08-23）が引く JASRAC の文「『特定ゲーム（音楽ゲーム）』以外のゲームで、利用する楽曲すべてがそのゲームのために書き下ろされた楽曲で、かつ JASRAC 管理楽曲を 1 曲以上利用するものについては、特例措置を適用します」に基づく。つまり特例措置はそもそも「全曲書き下ろし」のゲーム向けで、既存曲を使う企画には音楽ゲームか否かにかかわらず当たらない。「ゲームソフトの使用料は指値」は骨董通り法律事務所・唐津真美弁護士のコラム（2013-01-30）「ゲームソフトに使用する場合や、ＣＭ用の録音に使用する場合の使用料は『指値』とされています」で、13 年前の解説。JASRAC 公式の現行規程は当日接続不可で未確認。根拠: https://secure.okbiz.jp/faq-jasrac/faq/show/2176?category_id=191&site_domain=jp / https://note.com/maeben/n/nce7335b43042 / https://www.kottolaw.com/column/000496.html

10. JASRAC と YouTube の契約: **confirmed**。2008-10-23 の記事: 包括的な利用許諾契約、「YouTube の売り上げの 1.875% を JASRAC に支払う」、対象は「音楽著作物（曲及び歌詞）」で公式 MV とユーザー投稿動画の双方。原盤については記事に記載がなく、「音源の権利は含まない」は唐津コラム（2013）による。2023-02-10 の YouTube 公式ブログ: 「2023 年現在 7500 万を超える JASRAC 管理楽曲を対象に」「Content ID の活用を本格的に開始」、ショートのオーディオライブラリ利用も対象。ブログは「新たな許諾契約」と書き「更新」「包括契約」の語は使っていない。根拠: https://av.watch.impress.co.jp/docs/20081023/jastube.htm / https://blog.youtube/intl/ja-jp/news-and-events/2023_02_youtube-content-id-jasrac / https://www.kottolaw.com/column/000496.html

11. 採譜・譜面の判例: **corrected（前半 unverifiable）**。(a) 知財高裁 令和5年4月20日（始まりの紋章事件）の 30 条の 3・編曲＝翻案の要旨は未確認。出どころの PDF（発明誌 2026 No.5 pp.40-41）は CID フォントで文字層が読めず、画像化の道具も無し。courts.go.jp の 011656_hanrei.pdf は 404。検索枠も尽きたため裏づけ不能。(b) バンドスコア訴訟: 時事通信 2026-10-09 で確認。最高裁第二小法廷が上告を棄却し、約 1 億 6,900 万円の支払いを命じた二審判決が確定。ただし根拠は著作権侵害ではない。記事は「楽譜は曲自体と異なり『創作的表現』に当たらず、著作権法の保護対象外とされてきた」とし、最高裁は「自由競争の範囲を逸脱して営業を妨害した」として民法上の不法行為を認めた（著作権法で保護されない表現物の利用で最高裁が賠償責任を認めた初の判断）。一審東京地裁 2021 年は模倣を否定して棄却、二審東京高裁 2024 年は「表記の一致率が 9 割超」で模倣を認定。約 6 年半・579 曲分。「採譜すれば本質的演奏情報は必然的に一致」の主張は本文未確認。根拠: https://www.jiji.com/jc/article?k=2026100900696 （nippon.com の英語版は 404）

12. 埋め込み動画の広告収益・埋め込み先の審査・click-to-play・埋め込みブロック: **confirmed**。"Only YouTube and the video owner will earn revenue from ads on embedded videos. The site owner where the video is embedded will not earn a share."、審査要因に "sites that promote infringement"、"videos should be embedded using the standard click-to-play embed and not a scripted play"（200×200 以上推奨）。ドメイン・アプリ単位のブロックは別ページ「Restrict embedding」で確認、ただし "only available to partners who use YouTube Studio Content Manager"。一般投稿者は埋め込みを全面オフにするしかない。根拠: https://support.google.com/youtube/answer/132596 / https://support.google.com/youtube/answer/6301625

検証で読めなかったもの: jasrac.or.jp（接続拒否）、courts.go.jp 011656_hanrei.pdf（404）、nippon.com yjj2026100900696（404）、発明誌 PDF の本文、Web Audio 仕様本文の 1.22.4（WebFetch の取得上限超え。代わりに Chromium 実装で確認）。
