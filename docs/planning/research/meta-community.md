# 継続性・コミュニティ・収益・配信連携

調査日: 2026-10-23。調査役の集め書き（判定・採否・提案はしない）。

調べ方の注記: この回は WebSearch の予算（全エージェント共有）が使い切られていたため、検索は行えず、既知の一次情報 URL を WebFetch で直接読んだ。読めなかった出どころ（Rhythm Hive 公式、Malody 公式、Chorus Encore、darkpattern.games、Zagal らの論文 PDF、Melodics 価格ページ、太鼓の達人公式）は本文で「未取得」と明記し、記憶由来の記述は「推測」と印を付けた。

## 事実

### 継続要素（ランキング・リプレイ・デイリー・実績・シーズン・マルチ）
- osu! の pp（performance points）は上位スコアの重み付き和で、n 番目のスコアは `0.95^(n-1)` 倍で加算される。さらにランク譜面にスコアを残した数 N に応じ `416.6667 * (1 - 0.995^min(N,1000))` のボーナス（上限 413.894pp、N=1000 で到達）が付く。精度も強く効き、FC でも 80% 精度は 95% 精度の約 2/3 の価値とされる。<https://osu.ppy.sh/wiki/en/Performance_points>
- osu! の譜面カテゴリは Graveyard / WIP・Pending / Qualified / Ranked / Loved。Ranked のみ pp が付き、Loved と Qualified はリーダーボードはあるが pp なし。Pending は 4 週間更新がないと Graveyard へ自動移動。Qualified には 2 名以上の Beatmap Nominator の推薦が要る。<https://osu.ppy.sh/wiki/en/Beatmap/Category>
- osu! Project Loved は投票制で、締切時に賛成 80% 以上で Loved 入り。応募条件は原則 1 年以上前の譜面、お気に入り 30 以上、月 12 譜面まで（2023 年 2 月からカテゴリ制）。<https://osu.ppy.sh/wiki/en/Community/Project_Loved>
- osu!(lazer) の Daily challenge は 2024-07-25 に公開。毎日 1 譜面、難度は 7 日ごとにリセット、ストリークは日・週・累計の 3 軸で 8 段階（Iron〜Lustrous。Lustrous は累計 1080 日／日 360／週 53）。発想元は TrackMania の "cup of the day" 形式を求めた YouTube コメント。<https://osu.ppy.sh/wiki/en/Gameplay/Daily_challenge>
- osu! マルチプレイは 2〜16 人（既定 8）、勝敗条件は Score / Accuracy / Combo / Score v2、モードは Head-to-head / Team VS / Tag co-op / Tag-team VS。<https://osu.ppy.sh/wiki/en/Multiplayer>
- osu! のリプレイ `.osr` は動画ではなく入力ログ。「前イベントからの経過 ms, カーソル x(0-512), y(0-384), 押下キーのビットマスク」の列を LZMA 圧縮して持ち、譜面の MD5 と一致する譜面でしか再生できない。<https://osu.ppy.sh/wiki/en/Client/File_formats/osr_(file_format)>
- osu!(lazer) のコードは MIT ライセンス、"A free-to-win rhythm game" を標榜。リソース（画像・音）は別ライセンス、"osu!" と "ppy" は商標で MIT 対象外。ユーザー作成の「ルールセット」を許す設計。<https://github.com/ppy/osu>
- Beat Saber の第三者リーダーボード BeatLeader は「no replay, no score」で、リプレイが主データ源。OAuth2（profile / clan / offline_access）で外部アプリ連携。MIT。<https://github.com/BeatLeader/beatleader-server>
- DJMAX RESPECT V の Ladder Mode は 2 人対戦で Bronze〜Grandmaster のティア制、ピック&バン・Clear Pass あり。第 1 シーズンは 2021-01-28 開始。Steam/Xbox 版は XIGNCODE3 常時接続要求でシングルでもオフライン不可と批判された。<https://en.wikipedia.org/wiki/DJMax_Respect>
- 太鼓の達人 ドンダフルフェスティバルのオンラインランクマッチは「ランクは C から S まで」でランクポイントで変動、月末に順位に応じたごほうび。<https://ja.wikipedia.org/wiki/太鼓の達人_ドンダフルフェスティバル>
- Quaver（Steam、Free To Play）は Very Positive（英語レビュー 11,172 件中 91% 好評）、エディタで作った譜面を「submit them for official ranking」できる。2 モード別の global/country リーダーボード、Online PvP、Steam Workshop。コードは MPL-2.0。<https://store.steampowered.com/app/980610/Quaver/> / <https://github.com/Quaver/Quaver>

### 譜面共有サイト・サーバー
- BeatSaver は BSMG wiki で「master repository of custom songs made by the community」とされ、本体コードは GPL-3.0（Kotlin + React + PostgreSQL + Solr）。アカウントの処分履歴は既定 90 日間公開。<https://github.com/beatmaps-io/beatsaver-main> / <https://bsmg.wiki/faq/>
- Sonolus のカスタムサーバーは HTTP/HTTPS + JSON の「受動的な情報提供者」で、静的ホスティングでも成立する。エンドポイントは `GET /sonolus/info`、`/sonolus/{type}/list`、`/sonolus/levels/result/submit`、`/leaderboards/{name}/records/list`、`POST /sonolus/authenticate`、`POST /sonolus/rooms/create` など。ヘッダに `Sonolus-Session` / `Sonolus-Signature`。<https://wiki.sonolus.com/custom-server-specs/> / <https://wiki.sonolus.com/custom-server-specs/overview.html>
- Malody V は Steam ¥350、Key/Catch/Pad/Taiko/Ring/Slide/Live/Cube の各モードに譜面エディタ・スキンエディタ・オンラインランキングがあり、osu/sm/bms/pms/mc/tja 形式を読み、「Support private server」。オンラインには第三者の Mugzone アカウントが要る。<https://store.steampowered.com/app/1512940/Malody_V/>
- Clone Hero は Windows/Mac/Linux/Android/iOS 向けで「even your keyboard」で遊べ、ローカル・オンライン・グローバルリーダーボードあり。<https://clonehero.net/>
- 旧 Chorus（Clone Hero 譜面検索）は Google Drive 等のリンクを巡回し、リンクとメタデータだけを保存（"not the song bundles themselves"）、20,000 譜面超を索引し、2025-02-22 にアーカイブ。後継 enchor.us は JS 描画で本文未取得。<https://github.com/Paturages/chorus>
- BMS は 1998 年の BM98 由来のテキスト形式。音をキーごとに分割する必要があるため「ほとんどの BMS 曲はそのために作曲された」。最大イベント BOF は 2004 年から毎年 250 曲超。LR2 の独自オンラインランキングは 2026-05-31 に停止。<https://en.wikipedia.org/wiki/Be-Music_Source>
- beatoraja は Java/libGDX 製の BMS プレイヤーで GPL-3.0、8 種のゲージ・11 種のクリアランプ、LR2 のスキンとスコア取込み。<https://github.com/exch-bms2/beatoraja>

### スキン・モッド
- osu! のスキンは osu!/taiko/catch/mania/Interface/音 の 6 分類。譜面同梱スキンは「セットの 1 要素を入れたら全要素を入れる」規則。<https://osu.ppy.sh/wiki/en/Skinning>
- Beat Saber のモッドは「更新のたびに壊れるのが普通」（"Mods are subject to being broken by updates and that's normal"）、Quest では「modifying the game on Quest disables official multiplayer」。<https://bsmg.wiki/pc-modding.html> / <https://bsmg.wiki/faq/>

### 収益モデル
- osu!supporter は「voluntary, monetary donation」で、特典はゲーム内 DL（osu!direct）、黄色名、国別・フレンド・mod 別ランキング、Pending 枠 20（通常 8）、お気に入り 1000（通常 100）など。「ゲームプレイやスコア上の優位は一切ない」と明記。<https://osu.ppy.sh/wiki/en/osu!supporter>
- Beat Saber は Steam ¥3,100、「Content For This Game」が 280 件、楽曲 DLC は 1 曲 ¥300〜310 前後、「60+ free songs」+「239+ songs」拡張、5 人クロスプレイ。<https://store.steampowered.com/app/620980/Beat_Saber/>
- DJMAX RESPECT V は Steam ¥4,980、DLC 58 件（¥480〜¥2,980）、基本 150 曲超。Deemo / Cytus / CHUNITHM / Muse Dash / TEKKEN / Blue Archive / Arcaea / GROOVE COASTER など他社 IP パックが多数。<https://store.steampowered.com/app/960170/DJMAX_RESPECT_V/>
- Simply Piano（App Store）は評価 859K 件・4.7、IAP は 12 か月 $119.99〜$149.99、Family $179.99 等。2 コースは無料、残りは購読。「tens of thousands of music teachers worldwide」が利用と記載。<https://apps.apple.com/us/app/simply-piano-learn-piano-fast/id1019442026>
- Yousician は Guitar/Bass/Piano/Ukulele/Singing、「20M+」月間アクティブ（GuitarTuna 含む）、2000+ 曲、平均セッション 17 分、7 日無料。<https://yousician.com/>
- Synthesia は落ちてくる音符型のピアノ学習ソフトで買い切り（"Unlock for $39 $29"）、150 曲同梱・任意 MIDI 読込。<https://synthesiagame.com/>
- Arcaea はモバイル無料+楽曲パック課金、Switch 版は買い切り。World Mode は時間制ゲートで進行を制限。DJMAX / Groove Coaster / CHUNITHM 等と相互コラボ。<https://en.wikipedia.org/wiki/Arcaea>
- プロジェクトセカイは F2P+ガチャ、通常のスタミナでなく「Bonus Energy」（切れても遊べる）。2021-07 に 500 万、2022-06 に 1000 万、2025-07 に 1500 万人。月約 4 曲追加。<https://en.wikipedia.org/wiki/Hatsune_Miku:_Colorful_Stage!>
- Rhythm Hive（HYBE 系）: 公式サイト・ストア・各国 Wikipedia とも取得できず。開発元 Superb は 2019 年 8 月に HYBE が買収、Hybe IM は 2025-07-01 に Drimage へ改名（<https://en.wikipedia.org/wiki/Hybe_Corporation>）。「所属アーティストの楽曲＋カード収集＋ミッション」という構造は推測（記憶由来、未確認）。

### Duolingo 型の継続設計と批判
- Duolingo 公式: 7 日以上のストリークが 600 万人超。マイルストーン演出で新規学習者の 7 日後残存が +1.7%、Streak Freeze を 2 個装備可能にして DAU が相対 +0.38%、7 日ストリーク到達者はコース完了率 3.6 倍。「2→3 日は +50% だが 200→201 日は +0.5%」で長期は損失回避に動機が移ると説明。<https://blog.duolingo.com/how-duolingo-streak-builds-habit/>
- Silverman & Barasch (JCR 2023) 要旨: ログ上のストリークは継続を増やすが、途切れると「reduced engagement or abandonment」。効果は自責で途切れたとき強く、修復手段があると弱まる。7 研究、効果量は要旨に無し。<https://academic.oup.com/jcr/article/49/6/1095/6675535>
- Duolingo への批判: 「ゲーミフィケーションが不正や学習と相反する攻略を誘発」、通知の執拗さがミーム化、通知はバンディットアルゴリズムで個別化。2025 年の AI 方針反発で「ストリークを終わらせて抗議」が起きた。有料会員 1090 万（2025-06）、MAU 1.3 億（2025Q1）。<https://en.wikipedia.org/wiki/Duolingo>
- Zagal ら "Dark Patterns in the Design of Games"（FDG 2013）の "playing by appointment" / "grinding" 定義は PDF 取得失敗（証明書切れ）。darkpattern.games も 403。内容は記憶由来のため本稿では引用しない。

### Twitch / YouTube 配信との連携
- Twitch Extensions は Panel / Overlay（動画全面の透明層）/ Component の 3 種、iframe サンドボックスで `postMessage` 経由。視聴者は `U-` 始まりの不透明 ID。`alert()` 等のモーダル、トップレベル遷移、iframe 埋め込みは禁止、CSP は開発者コンソールで設定、Bits 課金 API あり、審査必須。<https://dev.twitch.tv/docs/extensions/>
- Twitch EventSub: `channel.channel_points_custom_reward_redemption.add` v1、`channel.chat.message` v1（`user:read:chat`）、`channel.cheer` v1（`bits:read`）、`channel.follow` v2、poll / prediction / hype_train 系。<https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/>
- YouTube Live Chat API `liveChatMessages.list` は 1 回 5 クォータ単位、`maxResults` 200〜2000（既定 500）、早すぎると `rateLimitExceeded`。`streamList` のプッシュ型が推奨。<https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list>
- Crowd Control: 視聴者が Bits / Channel Points / TikTok Gift をコインに替えゲーム内効果を発動、対応 250 ゲーム超、効果送信 1000 万回、「2025 Streamlabs 調査で平均 1.8 倍の収益増」（同社サイトの引用）。<https://crowdcontrol.live/>
- BeatSaberPlus は Kick/Twitch/YouTube チャット、視聴者の譜面リクエスト（履歴・ブラックリスト・OBS オーバーレイ付）、エモートレイン、Multiplayer+ に「Democracy」モード。<https://github.com/hardcpp/BeatSaberPlus>
- StreamCompanion（osu!）は pp カウンタ・譜面情報・キーカウンタを `localhost:20727` の Web オーバーレイで出し、HTML/CSS 編集で見た目を変える。MIT。<https://github.com/Piotrekol/StreamCompanion>

### VTuber・楽曲提供者との提携
- グルーヴコースター ワイワイパーティー!!!!（Switch, 2019-11-07 DL 専売）はタイトル画面にキズナアイ等 VTuber が登場し、DECO*27 作のコラボ曲「GROOVE LOOP」にミライアカリ・電脳少女シロ・月ノ美兎が参加。2021-12-16 にオンライン対戦追加。<https://ja.wikipedia.org/wiki/グルーヴコースター_ワイワイパーティー!!!!>
- Cytus II の著名コラボに初音ミクとキズナアイ（詳細日付・価格は未記載）。初代 Cytus は「10 万有料 DL ごとに無料 10 曲章を解放」する Million Downloads Plan を 2015-07 に完遂。<https://en.wikipedia.org/wiki/Cytus_II>
- osu! は Featured Artist 制度でライセンス済み楽曲一覧を持ち「has no risk of removal」、それ以外は作者の利用規約確認か許諾依頼（無料・無広告ゲームである旨を添えると良いと案内）。配信は「別のライセンス要件に当たる場合がある」と注記。<https://osu.ppy.sh/wiki/en/Rules/Content_usage_permissions>
- hololive の音ゲー DLC（太鼓の達人・Groove Coaster 等）は記憶にあるが、今回読めた Wikipedia・公式ページには記載が無く未確認（推測扱い）。

### 教育市場
- Piano Marvel は「approved vendor with many charter schools and grant programs」、教師は 24/7 で生徒の練習・SASR（初見力テスト）を追跡、課題作成。BYU のグループピアノ担当が採点時間削減を証言。曲・練習 25,000 以上。価格は見積り制。<https://pianomarvel.com/> / <https://pianomarvel.com/schools>
- Simply Piano のサイトに「ESA funds for Simply Piano」（米国の教育貯蓄口座で購入）のリンク（詳細ページは 404）。<https://www.hellosimply.com/simply-piano>
- Chrome Music Lab は「多くの教師が教室で使い」、Web Audio API / WebMIDI / Tone.js 製でオープンソース。<https://musiclab.chromeexperiments.com/About/>
- 日本の学校・教室での音ゲー採用事例は、今回の手段では一次情報に当たれなかった（未取得）。

## 事例

- **osu! / osu!(lazer)**（<https://osu.ppy.sh/>）: 無料、MIT、pp と Ranked/Loved の二層キュレーション、Daily challenge、入力ログ型リプレイ、寄付型 supporter。接点: 「無料＋寄付＋優位なし」の収益、譜面の段階的昇格、ストリークの 3 軸ティア、入力ログで軽いリプレイ。
- **Quaver**（<https://store.steampowered.com/app/980610/Quaver/>）: キーボード縦スクロール、F2P、MPL-2.0、エディタ→公式ランク申請、Steam Workshop スキン。接点: PC キーボード音ゲーの OSS コミュニティ運営の先行例。
- **BMS / BOF / beatoraja**（<https://en.wikipedia.org/wiki/Be-Music_Source>）: 作曲家が曲を書いて出す「イベント駆動」の譜面文化、プレイヤー側が IR（ランキング）を運用。接点: 権利処理を「オリジナル曲のみ」で回避した 20 年続く日本発コミュニティ。
- **Beat Saber + BeatSaver / BeatLeader / BSMG**（<https://bsmg.wiki/>）: 公式は楽曲 DLC 販売、非公式がカスタム譜面・リーダーボード・リプレイを担う二重構造。接点: 公式と非公式の役割分担、更新でモッドが壊れる前提。
- **Sonolus**（<https://sonolus.com/>）: エンジン（ゲームルール）も譜面も第三者サーバーが配布、静的ホスティング可。接点: 「譜面サーバー仕様を公開して誰でも立てられる」設計の実例。
- **Malody V**（<https://store.steampowered.com/app/1512940/Malody_V/>）: ¥350 買い切り、複数モード、他形式読込、プライベートサーバー対応。接点: 他ゲームの譜面形式を取り込む互換戦略。
- **Clone Hero + Chorus**（<https://github.com/Paturages/chorus>）: 本体は音源非同梱、索引サイトはリンクのみ保存。接点: 音源を持たない設計と検索サイトの分離。
- **DJMAX RESPECT V**（<https://store.steampowered.com/app/960170/DJMAX_RESPECT_V/>）: 買い切り＋DLC 58 件、他社 IP パック、Ladder のシーズン制。接点: IP コラボを DLC 単位で積む収益と、常時接続アンチチートへの反発。
- **プロジェクトセカイ**（<https://en.wikipedia.org/wiki/Hatsune_Miku:_Colorful_Stage!>）: F2P＋ガチャ、罰則の薄いエナジー設計、1500 万人。接点: スタミナ無しで「ボーナス倍率」だけで課金導線を作る例。
- **Duolingo**（<https://blog.duolingo.com/how-duolingo-streak-builds-habit/>）: ストリーク＋フリーズ＋通知の個別化。接点: 公式が公開した数値（+1.7% / +0.38% / 3.6 倍）と、途切れ時の離脱研究（JCR）が対になる。
- **osu! Daily challenge**（<https://osu.ppy.sh/wiki/en/Gameplay/Daily_challenge>）: 音ゲーにおけるストリーク実装の具体例（TrackMania COTD 由来）。
- **Crowd Control**（<https://crowdcontrol.live/>）: 視聴者課金→ゲーム内効果の汎用基盤。接点: 自作ゲームを「対応ゲーム」として接続する側の選択肢。
- **BeatSaberPlus / StreamCompanion**（<https://github.com/hardcpp/BeatSaberPlus> / <https://github.com/Piotrekol/StreamCompanion>）: チャットからの曲リクエストと localhost Web オーバーレイ。接点: 配信連携の最小構成（リクエスト・オーバーレイ・民主投票）。
- **Groove Coaster WWP / Cytus II**: VTuber 本人の歌唱コラボ曲・タイトル登場。接点: 楽曲提供者としての VTuber 提携の既存形。
- **Piano Marvel / Simply Piano / Chrome Music Lab**: 教師ダッシュボード、ESA 資金、Web 技術での教室普及。接点: 教育市場の入口は「教師が進捗を見られる」機能と公的資金の適合。

## 類推

- TrackMania の Cup of the Day → osu! Daily challenge: 「毎日 1 コースで全員同条件」は他ジャンルからの移植が機能した例。
- 作曲コンテスト（BOF）型コミュニティ: 譜面ではなく「曲」を公募し、権利を内製化する。同人音楽圏との親和。
- Clone Hero の「音源非同梱・索引のみ」: トレント索引サイトや楽譜リンク集と同じ構造で、ホスト側の権利リスクを分離。
- Crowd Control の「視聴者の課金→即時のゲーム内効果」: 投げ銭を「妨害・支援」に変換する経済。音ゲーでは譜面の難度変更・速度変更に相当しうる（推測）。
- Duolingo の Streak Freeze: 学習アプリの「修復可能な連続記録」。JCR 研究は修復可能性が効果を弱めると言う一方、Duolingo はフリーズで DAU が増えたと報告し、両者は矛盾ではなく「途切れた後の離脱回避」と「連続の動機」のトレードオフとして読める（推測）。
- osu! の supporter: Wikipedia 型の寄付モデルを「称号と便利機能」で包んだ形。
- タイピング練習ソフト／ピアノ学習アプリ: 「キーボード上の運指」を教える点で、本企画の Q/W/E 配列は楽器練習より入力練習に近い（推測、未調査）。

## 制約

- **YouTube 利用規約**: API クライアントは YouTube 音声・映像を「download, import, backup, cache, or store」してはならず（III.E.1.a）、オフライン再生不可（III.E.1.b）、音声と映像の分離・改変禁止（III.I.7）、プレイヤー上へのオーバーレイ禁止（必須機能要件）、バックグラウンド再生禁止（III.I.9）、埋め込みは最低 200×200px、自動再生はプレイヤーが半分以上見えてから。<https://developers.google.com/youtube/terms/developer-policies> / <https://developers.google.com/youtube/terms/required-minimum-functionality>
- **楽曲権利**: osu! は許諾なし楽曲を削除対象とし、投稿権停止もあり得る。BMS は分割音源が要るため既存曲が使えない構造。Clone Hero は音源を持たず索引はリンクのみ。Beat Saber 公式は楽曲 DLC をライセンス販売。配信は別の許諾要件になり得る（osu! wiki）。
- **配信プラットフォームの技術制約**: Twitch Extension は審査・CSP・iframe 禁止・モーダル禁止。YouTube Live Chat は 1 呼び出し 5 単位のクォータとレート制限。EventSub は種別ごとに必要スコープが異なる。
- **モッド・互換**: Beat Saber はゲーム更新でモッドが壊れるのが前提、Quest 改変で公式マルチ停止。Malody のオンラインは第三者アカウント必須。DJMAX は常時接続アンチチートで批判。
- **ストリーク設計の副作用**: 途切れたストリークは離脱を招き（JCR）、ゲーミフィケーションは不正や学習と相反する攻略を誘発する（Duolingo 批判）。Duolingo の数値は自社 A/B テスト由来で第三者検証なし。
- **リプレイと不正対策**: BeatLeader は「no replay, no score」。osu! のリプレイは入力ログで、譜面 MD5 一致が再生条件。公正なランキングは入力ログの保存と譜面の固定を前提にする。
- **ライセンス（コード）**: osu! MIT（商標は別）、Quaver MPL-2.0（アセット別）、BeatSaver / beatoraja / Chorus GPL-3.0。GPL コードの取込みは配布条件に影響する。
- **人間工学**: 本話題の出どころからは得られず（他話題の担当範囲）。Duolingo の「1 日 5 分」設計はセッション長の目安として参照可能。

## 問い

- Rhythm Hive（HYBE/Drimage）の一次情報（カード・ミッション・課金構造・DL 数）は今回取れていない。レーベル直営の音ゲーが「楽曲提供者＝運営」である利点・制約は何か。
- hololive 等の大手 VTuber 事務所と音ゲーの DLC 提携（太鼓の達人・Groove Coaster 等）の実在・条件・価格は未確認。提携窓口はどこか。
- YouTube を音源にする前提で、ランキング・リプレイ・視聴者リクエストを成立させるとき、「同じ動画・同じ譜面」をどう同定するか（動画 ID の削除・差し替え・地域制限時の扱い）。
- 日本の学校・音楽教室での音ゲー採用の一次情報（教育委員会・教材会社・教室チェーン）はどこにあるか。
- osu! の Ranked/Loved のような多段キュレーションを、個人開発規模で回せる最小の人数と手順は何か。
- Daily challenge 型ストリークと Duolingo 型フリーズを併用したとき、JCR の「修復可能だと効果が弱まる」知見とどう整合するか。
- Twitch Extension（審査あり）と、BeatSaberPlus/StreamCompanion 型のローカル Web オーバーレイ＋チャットボット（審査なし）のどちらが配信者の導入障壁が低いか、実測データはあるか。
- 譜面サーバー仕様を公開する場合（Sonolus 型）、公式サーバーの責任範囲と第三者サーバーの権利リスクをどう線引きしているか（Sonolus の ToS は未読）。

## 出どころ一覧

- osu! wiki: Performance points <https://osu.ppy.sh/wiki/en/Performance_points>
- osu! wiki: Beatmap category <https://osu.ppy.sh/wiki/en/Beatmap/Category>
- osu! wiki: Project Loved <https://osu.ppy.sh/wiki/en/Community/Project_Loved>
- osu! wiki: Daily challenge <https://osu.ppy.sh/wiki/en/Gameplay/Daily_challenge>
- osu! wiki: Multiplayer <https://osu.ppy.sh/wiki/en/Multiplayer>
- osu! wiki: .osr <https://osu.ppy.sh/wiki/en/Client/File_formats/osr_(file_format)>
- osu! wiki: osu!supporter <https://osu.ppy.sh/wiki/en/osu!supporter>
- osu! wiki: Skinning <https://osu.ppy.sh/wiki/en/Skinning>
- osu! wiki: Content usage permissions <https://osu.ppy.sh/wiki/en/Rules/Content_usage_permissions>
- ppy/osu (GitHub) <https://github.com/ppy/osu>
- BSMG wiki <https://bsmg.wiki/> / FAQ <https://bsmg.wiki/faq/> / PC modding <https://bsmg.wiki/pc-modding.html>
- beatsaver-main (GitHub) <https://github.com/beatmaps-io/beatsaver-main>
- beatleader-server (GitHub) <https://github.com/BeatLeader/beatleader-server>
- Beat Saber (Steam) <https://store.steampowered.com/app/620980/Beat_Saber/>
- DJMAX RESPECT V (Steam) <https://store.steampowered.com/app/960170/DJMAX_RESPECT_V/>
- DJMax Respect (Wikipedia) <https://en.wikipedia.org/wiki/DJMax_Respect>
- 太鼓の達人 ドンダフルフェスティバル (ja Wikipedia) <https://ja.wikipedia.org/wiki/太鼓の達人_ドンダフルフェスティバル>
- Quaver (Steam) <https://store.steampowered.com/app/980610/Quaver/> / (GitHub) <https://github.com/Quaver/Quaver>
- Sonolus <https://sonolus.com/> / custom server specs <https://wiki.sonolus.com/custom-server-specs/> / overview <https://wiki.sonolus.com/custom-server-specs/overview.html>
- Malody V (Steam) <https://store.steampowered.com/app/1512940/Malody_V/>
- Clone Hero <https://clonehero.net/> / Chorus (GitHub, archived) <https://github.com/Paturages/chorus>
- Be-Music Source (Wikipedia) <https://en.wikipedia.org/wiki/Be-Music_Source> / beatoraja <https://github.com/exch-bms2/beatoraja>
- Simply Piano (App Store) <https://apps.apple.com/us/app/simply-piano-learn-piano-fast/id1019442026> / 公式 <https://www.hellosimply.com/simply-piano>
- Yousician <https://yousician.com/>
- Synthesia <https://synthesiagame.com/>
- Piano Marvel <https://pianomarvel.com/> / Schools <https://pianomarvel.com/schools>
- Chrome Music Lab About <https://musiclab.chromeexperiments.com/About/>
- Arcaea (Wikipedia) <https://en.wikipedia.org/wiki/Arcaea>
- Hatsune Miku: Colorful Stage! (Wikipedia) <https://en.wikipedia.org/wiki/Hatsune_Miku:_Colorful_Stage!>
- Hybe Corporation (Wikipedia) <https://en.wikipedia.org/wiki/Hybe_Corporation>
- Duolingo blog: streak <https://blog.duolingo.com/how-duolingo-streak-builds-habit/> / Duolingo (Wikipedia) <https://en.wikipedia.org/wiki/Duolingo>
- Silverman & Barasch, JCR 2023 <https://academic.oup.com/jcr/article/49/6/1095/6675535>
- Twitch Extensions <https://dev.twitch.tv/docs/extensions/> / EventSub types <https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/>
- YouTube Live Chat API <https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list>
- YouTube API Developer Policies <https://developers.google.com/youtube/terms/developer-policies> / Required Minimum Functionality <https://developers.google.com/youtube/terms/required-minimum-functionality>
- Crowd Control <https://crowdcontrol.live/>
- BeatSaberPlus (GitHub) <https://github.com/hardcpp/BeatSaberPlus> / StreamCompanion (GitHub) <https://github.com/Piotrekol/StreamCompanion>
- グルーヴコースター ワイワイパーティー!!!! (ja Wikipedia) <https://ja.wikipedia.org/wiki/グルーヴコースター_ワイワイパーティー!!!!>
- Cytus II (Wikipedia) <https://en.wikipedia.org/wiki/Cytus_II>
- 未取得（参照のみ）: Rhythm Hive 公式 / Malody 公式 <https://malody.mugzone.net/> / Chorus Encore <https://enchor.us/> / darkpattern.games <https://www.darkpattern.games/> / Zagal et al. FDG 2013 <http://www.fdg2013.org/program/papers/paper06_zagal_etal.pdf> / Melodics <https://melodics.com/> / 太鼓の達人公式 <https://dondafulfestival-20th.taiko-ch.net/>

## 検証結果

検証日: 2026-10-23。確かめ役。対象 12 件の「要の事実」を、出どころ URL を WebFetch で実際に読んで照合した。WebSearch は全エージェント共有の予算が尽きており 1 回も実行できなかったため、別の一次情報が要る箇所は既知の URL を直接読むことで補った（読めなかったものは明記）。判定・提案はしない。

| # | 事実 | 結果 | 要点 |
|---|---|---|---|
| 1 | osu! pp の重み `0.95^(n-1)` とボーナス `416.6667*(1-0.995^min(N,1000))`（上限 413.894） | confirmed | 式・上限とも原文どおり。「1,000 スコアで 413.894 ボーナス pp」と明記。 |
| 2 | 譜面カテゴリ（Ranked のみ pp、Pending 4 週で Graveyard、Nominator 2 名、Loved 投票 80%） | corrected | 数値はすべて一次情報と一致するが、「80%」は Category ページにはなく Project Loved ページの記述。また「リーダーボードあり・pp なし」は Loved だけでなく Qualified も同じ。 |
| 3 | Daily challenge（2024-07-25、7 日リセット、3 軸 8 段階、Lustrous 1080/360/53、TrackMania COTD 由来） | confirmed | 日付・周期・8 段階の名称と閾値・発想元（waxxx14 の YouTube コメント）すべて一致。「毎日 1 譜面」は "consecutive daily beatmaps" からの読みで、枚数を明記した文は無い。 |
| 4 | .osr は入力ログ（ms, x, y, キービットマスク）の LZMA 圧縮、譜面 MD5 一致が再生条件。BeatLeader は "no replay, no score" | confirmed | .osr は譜面 MD5 を保持し「その譜面が無いと再生できない」と記載（x 0–512 / y 0–384、M1=1 M2=2 K1=4 K2=8 Smoke=16）。BeatLeader README に "The main data source for the server are replays" と "no replay, no score" の両方あり。 |
| 5 | osu!supporter は寄付、特典一覧、Pending 枠 20（通常 8）、ゲームプレイ上の優位なし | confirmed | "voluntary, monetary donation"、"do not give any advantage in gameplay, performance, or score, and never will" を確認。Pending 上限は通常 8 / supporter 20（開始値は 4 / 8）。お気に入り 100→1000、フレンド 500→1000。 |
| 6 | Beat Saber ¥3,100・DLC 280・1 曲 ¥300 前後・60+ 無料＋239+。DJMAX RESPECT V ¥4,980・DLC 58（¥480〜¥2,980）・他社 IP パック | confirmed | 2026-10-23 の Steam 日本ストア表示と一致（Beat Saber 単曲 ¥300/¥310、パックは ¥4,354〜4,556、合計 "300+ songs"。DJMAX の最安は GIRLS' FRONTLINE PACK ¥480、最高は V LIBERTY PACK 等 ¥2,980、Deemo/Cytus/CHUNITHM/Muse Dash/TEKKEN/Blue Archive/Arcaea/GROOVE COASTER 各パックあり）。価格は地域・セールで変動する時点値。 |
| 7 | Duolingo 公式の数値（600 万人超、+1.7%、+0.38%、3.6 倍、2→3 日 +50% / 200→201 日 +0.5%、損失回避） | confirmed | すべて原文と一致。+1.7% は "likelihood a brand new learner was still using Duolingo 7 days later"、+0.38% は "relative number of active learners ... every day"（相対値）。+1.7% が相対か絶対かは記載なし。いずれも自社報告。 |
| 8 | Silverman & Barasch (JCR 2023): 途切れると "reduced engagement or abandonment"、自責で強く、修復手段で弱まる、7 研究、要旨に効果量なし | corrected | 7 研究・自責で増幅・修復可能で減衰・効果量なしは要旨と一致。ただし要旨の知見は「ログで強調された無傷のストリークは、途切れたものと比べて後続の関与を高める（実際の過去行動とは独立）」という比較で、"reduced engagement or abandonment" は最終文で企業が避けたい「コストの例」として挙がる含意であり、検証された結果として書かれてはいない。Vol.49 No.6 pp.1095–1117、オンライン公開 2022-06-30（DOI 10.1093/jcr/ucac029）。 |
| 9 | YouTube API ポリシー III.E.1.a / III.I.7 / III.I.9 と必須機能要件（オーバーレイ禁止・200×200・半分以上可視で自動再生） | confirmed | 条番号は原文どおり（III.E "Handling YouTube Data and Content" の 1.a、III.I "Additional Prohibitions" の 7 と 9）。オーバーレイ・サイズ・自動再生は別文書 Required Minimum Functionality（番号なし、見出し "Overlays and frames" / "Embedded YouTube Player size" / "Autoplay and scripted playbacks"）にあり、自動再生は "more than half of the player is visible"（厳密には「半分より多く」）。16:9 は 480×270 以上を推奨。 |
| 10 | Twitch Extensions 3 種・iframe サンドボックス・postMessage・モーダル/トップレベル遷移/iframe 禁止・審査必須・Bits API。YouTube Live Chat API 5 単位・maxResults 200〜2000 | confirmed | 3 種・サンドボックス・alert/prompt/confirm/print 禁止・frame-src による埋め込み禁止（Guidelines 2.2 "Extensions may not use iframes"）・Bits Support/Microtransactions を確認。「審査必須」を一文で述べた箇所は無いが、ライフサイクルは Local Test → Hosted Test → In Review → Approved → Released で、Review を経ずに Released へ至る経路が無い。YouTube は 5 単位、200〜2000（既定 500）、rateLimitExceeded、streamList 推奨を確認。 |
| 11 | Sonolus カスタムサーバーは HTTP+JSON の受動的な情報提供者で静的ホスティング可、各エンドポイントが公開仕様 | confirmed | "no mechanism or need for server to client communication"、"It is also possible to use a static host serving files" を確認。要素技術は HTTP/HTTPS・WebSocket（ルーム用）・JSON・SHA・RSA。23 エンドポイントの一覧に claim の各パスがあり、leaderboards の正式パスは `/sonolus/{type}/{itemName}/leaderboards/{leaderboardName}/records/list`。 |
| 12 | BMS はキー分割が要るため多くが専用に作曲、BOF は 2004 年から毎年 250 曲超、LR2 の IR は 2026-05-31 停止 | corrected | 3 点とも Wikipedia の本文とは一致。ただし BOF の公式イベントポータル（manbow.nothing.sh）の Entry 数は 2004: 120、2005: 127、2008: 155、2009: 209 で、250 を超えるのは 2010（282）以降（2011: 375、2016: 610、2024 BOF:TT 480、2025 BOF21 416、2026 BOF:22 468）。「2004 年から毎年 250 曲超」は 2010 年以降についてのみ正しい。LR2IR 停止日の典拠は Wikipedia が引く X の投稿 1 件（ID から 2026-05-27 投稿と推定、本文は HTTP 402 で取得不可）のみで一次情報では確認できず。LR2IR のホスト dream-pro.info は現在 DNS 解決不能（停止と整合するが日付の証拠ではない）。 |

### 補足（読めなかった出どころ）
- `https://x.com/kenjidct/status/2059644318596661391`（LR2IR 停止の典拠）: HTTP 402。
- `http://www.dream-pro.info/~lavalse/LR2IR/`（LR2IR 本体）: DNS 解決不能。
- `https://keysounds.net/bofguide/`（Wikipedia が BOF 件数の典拠にしたガイド）: DNS 解決不能。
- osu!(lazer) 2024.725.0 のチェンジログページには Daily challenge の説明文は無く、ランキングへのリンクのみ。

### 検証に使った URL
- https://osu.ppy.sh/wiki/en/Performance_points
- https://osu.ppy.sh/wiki/en/Beatmap/Category
- https://osu.ppy.sh/wiki/en/Community/Project_Loved
- https://osu.ppy.sh/wiki/en/Gameplay/Daily_challenge （GitHub raw: https://raw.githubusercontent.com/ppy/osu-wiki/master/wiki/Gameplay/Daily_challenge/en.md）
- https://osu.ppy.sh/wiki/en/Client/File_formats/osr_(file_format)
- https://github.com/BeatLeader/beatleader-server
- https://osu.ppy.sh/wiki/en/osu!supporter
- https://store.steampowered.com/app/620980/Beat_Saber/
- https://store.steampowered.com/app/960170/DJMAX_RESPECT_V/
- https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- https://academic.oup.com/jcr/article/49/6/1095/6675535
- https://developers.google.com/youtube/terms/developer-policies
- https://developers.google.com/youtube/terms/required-minimum-functionality
- https://dev.twitch.tv/docs/extensions/
- https://dev.twitch.tv/docs/extensions/life-cycle/
- https://dev.twitch.tv/docs/extensions/guidelines-and-policies/
- https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list
- https://wiki.sonolus.com/custom-server-specs/overview.html
- https://en.wikipedia.org/wiki/Be-Music_Source
- https://manbow.nothing.sh/event/event.cgi
