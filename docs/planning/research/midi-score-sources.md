# 音声採譜以外の音符データの入手経路と動画への同期手段

調査日 2026-10-23。調査役。判定・採否はしない。出どころは末尾の [S番号] で示す。

調査の制約: このセッションは開始時点で WebSearch の枠が使い切られており、検索は一度も行えず、既知 URL への WebFetch のみで集めた。musescore.com・pianu.com は 403、ヤマハ楽譜サイトは 429、ぷりんと楽譜は本文が JS 描画で空、JASRAC は接続拒否。読めなかったものは「未確認」と明記する。

## 事実

### 入手経路: 公開アーカイブ・データセット

- Lakh MIDI Dataset: 176,581 本のユニーク MIDI、うち 45,129 本が Million Song Dataset の音源と整列済み。配布は CC-BY 4.0。作者は「自分で採譜したものではない」とし、Copyright メタイベントは「一貫して使われていない」ため作者特定は不可と明記 [S1]。データセットのライセンスと楽曲・打ち込みの権利は別。
- BitMidi: 「世界中のボランティアが選んだ」、初期コレクションは「Reddit に投稿された 10 万本超の zip」。権利・規約の記述なし。公開されているのはサイトのコードのみ [S2]。
- FreeMidi: 「ニュースグループから生まれた」「会員が追加・リクエストできる」のみで、出所・権利・DMCA の記述はトップにも About にもない [S3]。
- Mutopia: 2,124 曲、各曲に PDF・LilyPond・MIDI。「すべてパブリックドメインまたは Creative Commons」で曲ごとに明記。種類は PD / CC BY-SA / CC BY [S4]。
- IMSLP: EU・韓国・日本は死後 70 年超で PD。サーバーはカナダで「カナダで PD」なら掲載可、米国のみ PD は PML-US へ。校訂版は EU で最大 30 年の保護があり得て IMSLP は 25 年ルールを自主適用。録音は作曲と録音の両方が PD である必要 [S5]。「クラシック=自由」ではなく編曲・校訂・録音ごとに権利が分かれる。

### 入手経路: 楽譜共有・販売・学習アプリ

- MuseScore.com: 規約本文は 403 で未読。英語版 Wikipedia では、2019 年 7 月に権利者の苦情でダウンロードを有料会員限定にし（CC 共有目的の譜面も巻き込まれた）、同年 8〜9 月に投稿者が「パブリックドメイン」「オリジナル」の印を付ければ無料ダウンロード可に、2020 年 2 月にアップロード無制限が無料化、2021 年に出版社由来の Official Scores（別途サブスク）が追加。有料会員は「Track setup and downloads」を使える [S6]。musescore.org の FAQ は PRO/PRO+/Premium を musescore.com が販売し、「MuseScore does not impose any ownership or license on your work」と述べる [S7]。公式 API: developers.musescore.com は DNS 解決不可で現存は未確認。
- ヤマハ ミュージックデータショップ（yamahamusicdata.jp）は sheetmusic.jp.yamaha.com へ 301（統合と推測）。同サイトは 429、ぷりんと楽譜は本文空で、国内 MIDI 販売の規約（ゲーム利用の可否）は未確認。
- Synthesia: FAQ で「Synthesia uses standard MIDI or MusicXML songs」。Music Store は 2013 年開始、人気曲の MIDI を自社制作し「All songs are fully licensed by the original publisher for digital download」[S8]。価格は単曲 $0.99〜$2.99、バンドルあり、約 105 曲。形式・書き出し可否・ライセンス文はストアに無い [S9]。規約はアプリのライセンスのみで、持ち込み MIDI の著作権責任には触れない [S10]。持ち込みは「MIDI or MusicXML files」（WAV/MP3 不可）で、Settings > Songs の + でフォルダ登録。入手先や著作権の案内なし [S11]。
- Piano Marvel: Free 150+ 曲、Premium（$17.99/月、年 $129.99）で 25,000+ 曲と「Upload Your Own Music」。ライブラリは Hal Leonard・Alfred・FJH を含む [S12]。規約: 投稿の所有権はユーザーに残るが「irrevocable, perpetual, non-exclusive, transferable, royalty-free」なライセンスを付与し、第三者権利の非侵害を保証。コンテンツは「personal, non-commercial use」のみ [S13]。
- Simply Piano: 「Simply Piano listens to the notes you play」。曲数・出版社・持ち込みの記述なし、サポートサイトは DNS 不可 [S14]。Pianu は 403 で未確認。

### 同期手段: タップ同期 UI

- osu! エディタ: オフセットは ms 単位、T 連打で初期 BPM とオフセットを得る。刻みは Ctrl=1 ms、クリック=2 ms、Shift=10 ms、BPM は 0.25/1/5。赤線がテンポ・拍子、緑線は継承 [S15]。ガイド: タップは 30 秒〜1 分、50% 再生で合わせる（25% は不安定）、Test Mode で「平均誤差 0 ms 近く、最大 3〜5 ms」、ミス 5% 未満、3 ms 未満の誤差は「意味がない」。テンポ変化は赤線を追加するが「急いで増やすな」[S16]。Offset には beatmap（音源先頭から最初のダウンビート）、universal（全譜面）、local（譜面ごと）、online（NAT 適用）の区別 [S17]。
- osu!mania の判定幅（片側）: PERFECT 16 ms（OD 非依存）、GREAT 64−3×OD、GOOD 97−3×OD、OK 127−3×OD、MEH 151−3×OD、MISS 188−3×OD [S18]。
- ArrowVortex: 「Automatic BPM/offset detection」、.sm/.ssc/.dwi/.osu、音源 ogg/mp3/wav、2025 年 7 月にオープンソース化 [S19]。ガイド: Adjust sync（Shift+S）の find BPM が「音楽を解析して BPM とオフセットを検出」、複数候補を選んで適用、波形（Shift+W）とビートティック（F3）で確認。よくある誤りは「半拍ずれ」で first beat を 0.5 拍動かすボタンで直す [S20]。
- Clone Hero 系 .chart: Resolution は「1/4 音符あたりのティック数」。SyncTrack の B はテンポ×1000 の整数、TS は拍子、A（anchor）は「テンポマーカーを音源時刻（μs）に固定」し「主にエディタ用、再生時は無視」。Offset は秒で「大きいほど音源が早く始まる」[S21]。song.ini の delay は ms で「譜面を音源に対して遅らせる」が「ハッシュを変えずに演奏が変わる」ため非推奨。video_start_time は動画の開始 ms [S22]。
- Moonscraper: 「Guitar Hero 系の譜面エディタ」、Clone Hero・YARG がソースを流用、2 開発中のため大型更新停止 [S23]。BPM/anchor の操作は公式ページから読めず。
- Falling Nikochan（YouTube 埋め込みを音源にするブラウザ音ゲー、AGPL-3.0）: `offset` は「譜面を開始する動画内の時刻（秒）」で `ytBegin`（動画の再生開始位置）とは独立（ytBegin=1, offset=2 なら動画は 0:01 から、譜面はその 1 秒後）。`ytId` は 11 文字。`bpmChanges` は step（拍）と bpm の列で `timeSec += (60/bpm)×Δstep` の累積。`speedChanges` は表示速度で `interp` を持つ。拍子は表示のみ [S24][S25]。判定定数 goodSec 0.04 / okSec 0.08 / badFastSec −0.25 / badLateSec 0.15 秒、`playbackRate` 倍にスケール。公式説明も「よい(±40ms)、まあまあ(±80ms)、だめ(+150ms〜-250ms)」[S26][S27]。
- YouTube IFrame API: `getCurrentTime()` は「再生開始からの経過秒」、精度・更新頻度の記述なし。`setPlaybackRate()` は「変更を保証しない」。最小 200×200 px [S28]。Required Minimum Functionality: プレイヤーの前に「overlays, frames, or other visual elements」を置かない、自動再生は半分超が見えてから、同時自動再生は 1 つ [S29]。Developer Policies: III.I.7 音声・映像の分離禁止、III.I.9 バックグラウンド再生禁止、III.I.6 プレイヤー改変禁止、III.E.1 ダウンロード・キャッシュ禁止。ゲーム利用・同期再生自体の条項はない [S30]。

### 同期手段: 楽譜—音声の自動アライメント

- Sync Toolbox（MIT）: 核は DTW、MsDTW・メモリ制限付き MrMsDTW・高解像度同期（クロマ＋オンセット特徴）で「幅広い西洋音楽で state-of-the-art」（数値提示なし）。audio-audio と audio-score の例あり [S31]。audio-score ノートブック: 楽譜側は「MIDI から作った CSV 音符リスト」、音符リストからクロマと DLNCO を作り `feature_rate = 50`（1 フレーム 20 ms）で音声側と MrMsDTW（step_weights [1.5,1.5,2.0]）。クロマは粗い階層、DLNCO は最も細かい階層。ワーピングパスを単調化し `interp1d` で音符の start/end を楽譜時間→音声時間に写す [S32]。音声は必須。楽譜側は合成せず特徴に直接変換。粒度の上限はフレーム率。
- FMP Notebooks C3: 基本例は 22,050 Hz・ホップ 2205 で「10 features per second」（100 ms 粒度）。精度の数値なし [S33]。
- partitura: MusicXML・MIDI の読み書き、**kern・MEI の読み込み [S34]。parangonar: 楽譜—演奏の音符整列。DualDTWNoteMatcher（既定・SOTA）、AnchorPointNoteMatcher（拍アンカー付き半自動）、TheGlueNoteMatcher（学習済み、任意の 2 MIDI）、オンライン版、AudioToScoreMatcher（MEC 2026）。入力は多くが「楽譜＋演奏 MIDI」、音声版は音声＋楽譜 [S35]。
- TISMIR 2023（ASAP）: 入力は MusicXML 楽譜とピアノ MIDI 演奏（音声不要）。F 値は hDTW+sym で 4×22: 98.53%、Zeilinger 97.98%、Magaloff 94.57%。拍アンカー付き Linear は 99.87 / 99.67 / 98.87%。アンカーに 0〜±300 ms の一様ノイズを加えると「±100 ms 未満ではすべてのモデルが一貫して動作」、以降ほぼ線形に劣化。人間の拍アノテーションのばらつき 27〜68 ms を参照 [S36]。「粗いタップをアンカーに自動整列で詰める」構成の数値的根拠になる。

### 法務: 著作権法 30 条

- 30 条 1 項: 「個人的に又は家庭内その他これに準ずる限られた範囲内」での使用目的なら「その使用する者が複製することができる」。除外は 1 号 公衆用自動複製機器、2 号 技術的保護手段の回避を知りながら、3 号 違法配信からの録音・録画を知りながら、4 号 違法配信からのその他デジタル複製（軽微・特別事情は除く）。2 項: 3・4 号の「知りながら」は重過失を含めて解釈しない [S37]。47 条の 6 第 1 項 1 号: 30 条 1 項の場合は「翻訳、編曲、変形又は翻案」も可 [S38]。
- CRIC: 私的使用は「自分自身や家族、ごく親しい少人数の友人など限られた範囲内」。「大量に複製したり、他人に売ったり、インターネットで送信したりすることは、私的目的の使用の範囲を超える」[S39][S40]。Wikipedia 日本語版: 私的目的の編曲・翻案は可だが「同一性保持権を侵害することはできない」、デジタル録音・録画は補償金の対象 [S41]。
- 「ローカルの自分の音声を採譜する行為」を 30 条で直接解説した記事は見つけられず（未達）。CARS「楽譜コピーQ&A」は本文が JS で読めず [S42]。

## 事例

- Lakh MIDI Dataset [S1]: 音源と MIDI が整列済みのペア 45,129 本。整列アルゴリズムの検証データになる。
- Mutopia [S4]: 権利が明確な同梱曲・デモ曲の供給源。MIDI は「大まかな音の確認用」で演奏表情なし。
- IMSLP [S5]: PD 楽譜。国別判定と校訂版の権利に注意。MIDI/MusicXML は少数（推測）。
- Synthesia [S8][S11]: 本体は形式（MIDI/MusicXML）だけ決めて中身はユーザー持ち込み、公式曲は出版社ライセンス済みで別売り、という二層モデルの先例。
- Piano Marvel [S12][S13]: 持ち込み機能を有料側に置き、投稿物に広いライセンスを取る規約の先例。
- osu! エディタ [S15][S16]: 「タップ→1 ms 刻み→実際に叩いて平均誤差を見る」三段階の同期 UI。
- ArrowVortex [S20]: 自動検出は複数候補を返す前提で UI を作り、波形で目視確認。
- Clone Hero .chart の Anchor [S21]: 拍位置（tick）と音源時刻（μs）を併記して整合を保つデータ設計。
- Falling Nikochan [S24]〜[S27]: 本企画と同じ「YouTube を音源にする」ブラウザ音ゲー。譜面側に動画内の開始秒を持たせ、ノーツ時刻は BPM 列から累積計算、判定 ±40/80 ms。
- Sync Toolbox [S31][S32]: 「MIDI と音声の両方がある」ときに音符ごとの時刻を 20 ms 粒度で得る既製パイプライン。
- parangonar / partitura [S34][S35]: 演奏 MIDI（ユーザーの鍵盤演奏など）を楽譜に合わせる用途にも使える。
- TISMIR 2023 [S36]: ±100 ms のアンカー誤差に頑健。人の粗いタップをアンカーにする設計の根拠。
- YouTube API ポリシー [S29][S30]: 動画の上に六角形セルを重ねる画面は、プレイヤーの「前」に要素を置かない配置が要る。

## 類推

- DAW のテンポマップ／タップテンポ: Clone Hero の Anchor は拍グリッドと音源時刻の両方を持つ点で DAW のテンポマップと同型（一般知識）。
- 字幕編集の一括オフセット: osu! の universal/local offset は SRT の一括シフトと同じ操作（一般知識）。
- 音声認識の forced alignment: 「既知テキスト＋音声→語の時刻」は「既知楽譜＋音声→音符の時刻」と同じ問題構造（一般知識）。
- 映像編集の同期点: ArrowVortex の「半拍ずれ」修正は、波形ピークを手がかりにクリップを合わせる操作に近い（一般知識）。

## 制約

- 技術: 自動整列は音声が手元にあることが前提 [S32]。YouTube 埋め込みは音声の取り出し・分離がポリシーで禁止 [S30]。
- 技術: 整列の粒度はフレーム率で決まる（50 Hz=20 ms [S32]、10 Hz=100 ms [S33]）。判定幅が ±40 ms [S26] や 16 ms [S18] 級なら人手の微調整（1 ms 刻み [S15]）が要る可能性。
- 技術: `getCurrentTime()` の精度・更新頻度は未記載、`setPlaybackRate()` は保証なし [S28]。
- 技術: MIDI にはテンポはあるが動画内の開始位置はない。Falling Nikochan の `offset` と `ytBegin` の分離が最小設計の一例 [S24]。
- 法務: 公開 MIDI アーカイブは出所・権利の記述がなく [S2][S3]、Lakh も作者特定不能 [S1]。同梱・再配布の根拠にならない。
- 法務: 30 条は私的使用の複製と編曲・翻案を許すが「インターネットで送信」は範囲外 [S37][S38][S40]。利用者の譜面データをサーバーで共有する設計は 30 条の外。
- 法務: 持ち込みデータの規約は Piano Marvel 型（広いライセンス）[S13] と Synthesia 型（触れない）[S10] に分かれる。
- 法務: プレイヤーの前にオーバーレイを置けない [S29]。
- 人間工学: タップは 30 秒〜1 分、3 ms 未満の誤差は無意味、50% 再生で合わせる [S16]。

## 問い

- MuseScore.com の現行規約で、Pro でダウンロードした MIDI/MusicXML を自分のアプリに読み込む行為はどう扱われるか。公式 API は現存するか（いずれも未読）。
- ヤマハ・ぷりんと楽譜の MIDI/音源付き楽譜の規約は、第三者アプリでの再生・譜面化を許すか（未読）。
- YouTube の音声を解析せずに MIDI を動画に合わせるには、タップ以外にどんな手がかりがあるか（チャプター、公式テンポ表記など）。
- `getCurrentTime()` の実効分解能・ジッタはどの程度か（公式記述なし）。
- 30 条の観点で「自分の手元の音声を採譜する」行為を直接扱った解説は未発見。次回は「耳コピ 著作権 私的使用」「楽譜コピー問題協議会 Q&A」を当たる。
- Simply Piano・Pianu の曲調達（出版社ライセンスか自社編曲か）は未確認。
- 粗いタップをアンカーに自動整列で詰める構成は、ピアノ MIDI 演奏 [S36] 以外（ポップスの音声＋MIDI）でも同等に効くか。

## 出どころ一覧

- [S1] https://colinraffel.com/projects/lmd/
- [S2] https://bitmidi.com/about , https://github.com/feross/bitmidi.com
- [S3] https://freemidi.org/ , https://freemidi.org/about
- [S4] https://www.mutopiaproject.org/ , https://www.mutopiaproject.org/legal.html
- [S5] https://imslp.org/wiki/IMSLP:Copyright_Made_Simple
- [S6] https://en.wikipedia.org/wiki/MuseScore
- [S7] https://musescore.org/en/faq
- [S8] https://synthesiagame.com/support/faq
- [S9] https://synthesiagame.com/store
- [S10] https://synthesiagame.com/legal/terms
- [S11] https://synthesiagame.com/support/guide/addSongs
- [S12] https://pianomarvel.com/ , https://pianomarvel.com/pricing
- [S13] https://pianomarvel.com/terms-of-service
- [S14] https://www.hellosimply.com/simply-piano
- [S15] https://osu.ppy.sh/wiki/en/Client/Beatmap_editor/Timing
- [S16] https://osu.ppy.sh/wiki/en/Guides/How_to_Time_Songs
- [S17] https://osu.ppy.sh/wiki/en/Offset
- [S18] https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!mania
- [S19] https://arrowvortex.ddrnl.com/ , https://arrowvortex.ddrnl.com/overview.html
- [S20] https://arrowvortex.ddrnl.com/guide.html
- [S21] https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/chart-format/Format-Overview/
- [S22] https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/song-ini/Standard-Tags/
- [S23] https://moonscrapercharteditor.com/ , https://github.com/FireFox2000000/Moonscraper-Chart-Editor
- [S24] https://raw.githubusercontent.com/na-trium-144/falling-nikochan/main/chart/src/legacy/chart15.ts
- [S25] https://raw.githubusercontent.com/na-trium-144/falling-nikochan/main/chart/src/bpm.ts , https://github.com/na-trium-144/falling-nikochan
- [S26] https://raw.githubusercontent.com/na-trium-144/falling-nikochan/main/chart/src/gameConstant.ts
- [S27] https://nikochan.utcode.net/ja/main/about/4
- [S28] https://developers.google.com/youtube/iframe_api_reference
- [S29] https://developers.google.com/youtube/terms/required-minimum-functionality
- [S30] https://developers.google.com/youtube/terms/developer-policies
- [S31] https://github.com/meinardmueller/synctoolbox （JOSS: https://joss.theoj.org/papers/10.21105/joss.03434 ）
- [S32] https://raw.githubusercontent.com/meinardmueller/synctoolbox/master/sync_audio_score_full.ipynb
- [S33] https://www.audiolabs-erlangen.de/resources/MIR/FMP/C3/C3_MusicSynchronization.html
- [S34] https://github.com/CPJKU/partitura
- [S35] https://github.com/sildater/parangonar , https://github.com/sildater/parangonar/blob/main/refs.md
- [S36] https://transactions.ismir.net/articles/10.5334/tismir.149
- [S37] https://laws.e-gov.go.jp/api/1/articles;lawId=345AC0000000048;article=第三十条
- [S38] https://laws.e-gov.go.jp/api/1/articles;lawId=345AC0000000048;article=第四十七条の六
- [S39] https://www.cric.or.jp/qa/hajime/hajime7.html
- [S40] https://www.cric.or.jp/qa/cs02/index.html
- [S41] https://ja.wikipedia.org/wiki/私的複製
- [S42] https://www.cars-music-copyright.jp/qa （本文未読）
- 読めなかったもの: https://musescore.com/legal/terms-of-use（403）, https://sheetmusic.jp.yamaha.com/（429）, https://www.print-gakufu.com/（本文空）, https://pianu.com/（403）, https://www.jasrac.or.jp/（接続拒否）, developers.musescore.com（DNS 不可）

## 検証結果

検証日 2026-10-24。確かめ役。各事実の出どころ URL を WebFetch で読み直し、書かれている内容と照合した。WebSearch は枠が使い切られており一度も使えなかったため、別の一次情報は既知 URL への WebFetch だけで当たった。判定・提案はしない。

| # | 事実 | 結果 | 根拠と補足 |
|---|---|---|---|
| 1 | Lakh MIDI Dataset（176,581 本・45,129 本整列済み・CC-BY 4.0・採譜していない・Copyright メタイベント不統一） | confirmed | [S1] に「176,581 unique MIDI files」「45,129 of which have been matched and aligned to entries in the Million Song Dataset」「distributed with a CC-BY 4.0 license」「I did not transcribe any of the MIDI files」、Copyright メタイベントは「is not used consistently」で作者特定は「not feasible」とある。 |
| 2 | BitMidi（Reddit の 10 万本超 zip）・FreeMidi（会員投稿制）・Mutopia（2,124 曲、PD/CC BY/CC BY-SA を曲ごとに明記、PDF・LilyPond・MIDI） | confirmed | BitMidi [S2]: 「found a .zip file with 100K+ MIDI files that someone posted to Reddit」、現在 113,229 本、権利・規約の記述なし。FreeMidi [S3]: 「Members can add midi files and request midi files」（要無料会員）、About に「born out of the news groups」、権利・規約の記述なし。Mutopia トップ [S4]: 「2124 pieces of music」「PDF, MIDI, and editable LilyPond file formats」「Each piece clearly lists what license it is distributed under」。legal.html は CC BY-SA（4.0〜1.0）・CC BY（4.0〜2.5）・Public Domain の三種を列挙。曲数と形式は legal.html ではなくトップページに書かれている。 |
| 3 | MuseScore.com（2019 年 7 月に有料会員限定、8〜9 月に PD/オリジナル印で無料化、2021 年 Official Scores、規約 403、developers.musescore.com DNS 不可） | confirmed | [S6] 英語版 Wikipedia に 2019 年 7 月「only paying subscribers could download music sheets」（権利者の苦情が契機、CC 譜面も巻き込み）、2019 年 8〜9 月「allow works to be marked as public domain or original」「so they could be made available for free download」、2021 年 9 月 Official Scores「scores licensed from sheet music publishers, available with an additional subscription」。本日も musescore.com/legal/terms は HTTP 403、developers.musescore.com は getaddrinfo ENOTFOUND で再現した。 |
| 4 | Synthesia（MIDI/MusicXML、WAV/MP3 不可、Music Store 2013 年〜、「fully licensed by the original publisher」、単曲 $0.99〜$2.99、規約は持ち込み MIDI の著作権に触れない） | corrected | FAQ [S8] に「Synthesia uses standard MIDI or MusicXML songs」、Project History 2013 年「The Music Store launches」、「All songs are fully licensed by the original publisher for digital download」はある。ただし FAQ に WAV/MP3 の記述はなく、「不可」の根拠は addSongs ガイド [S11] の「which types of music Synthesia can use: MIDI or MusicXML files」と「This is different than a WAV or MP3 file which only contain a squashed-down signal」という対比で、「WAV/MP3 は非対応」と明言した文は無い。ストア [S9] の単曲は $0.99 / $1.99 / $2.99 の三段で、ほかにバンドル $2.99〜$5.99 と無料曲 2 曲（Love is Strange, The Wanderer）があり、ストアページ自体にライセンス文は無い（ライセンス文は FAQ 側）。規約 [S10] は「a non-exclusive, non-transferable right to use the Application」のアプリ利用許諾で、ユーザー持ち込みファイル・ユーザーコンテンツ・著作権責任の条項は無い（この点は一致）。訂正文: 「WAV/MP3 不可」は FAQ ではなく addSongs ガイドの対比文からの読み取りであり、明示の非対応表記ではない。単曲価格は $0.99/$1.99/$2.99 の三段で、別にバンドルと無料曲がある。 |
| 5 | Piano Marvel（Premium $17.99/月・25,000+ 曲・Hal Leonard/Alfred/FJH・Upload Your Own Music・投稿物に広いライセンス・非侵害保証） | confirmed | 料金ページ [S12]: 「$17.99/month」「25,000+ Songs」、「Upload Your Own Music」は Premium と Annual に掲載され Free には無い。トップ [S12]: 「Over 25,000 songs and exercises」「Including popular titles from Hal Leonard, Alfred, and FJH Music Company publishers!」。規約 [S13] 第 11 条: 「an unrestricted, unlimited, irrevocable, perpetual, non-exclusive, transferable, royalty-free, fully-paid, worldwide right」（用途は「any purpose, commercial, advertising, or otherwise」、派生物作成を含む）、「We do not assert any ownership over your Contributions」。第 10 条: 「do not and will not infringe the proprietary rights, including but not limited to the copyright」。出版社名・料金・曲数は規約ではなくトップと料金ページにある。 |
| 6 | osu! タイミングガイド（ms 単位、T 連打、Ctrl 1 ms/クリック 2 ms/Shift 10 ms、タップ 30 秒〜1 分、50% 再生、Test Mode で平均 0 ms 近く・最大 3〜5 ms、3 ms 未満は「意味がない」） | corrected | エディタ Timing ページ [S15]: Offset は「measured in milliseconds」、T キーまたは「Tap Here!」、増分表は Ctrl=1 ms / 既定=2 ms / Shift=10 ms（BPM は 0.25/1/5）。ガイド [S16]: 「Spend half a minute on this, a minute at maximum」、「aim to nullify the hit error or make it as close to zero as possible, preferably less than 3-5 milliseconds」「Keep the readings as low as possible (maximum 3-5 ms)」、「Hit error which is less than, say, 3 ms means nothing and can be safely omitted」。50% は Finding offset の手順に「Choose 50%, move back shortly before the red line and press the spacebar」とある一方、同じ節に「Avoid using 25% playback (and, to be frank, slowing playback down at all if you can) since it gives inaccurate and unstable results」とあり、Finding BPM では「Slow down (75%, 50% or so if required) if you encounter difficulty」と「必要なら」の扱い。訂正文: ガイドは 50% 再生を手順として示すが、同時に「できれば再生速度を落とさない」と注意しており、50% は推奨ではなく手順上の例示。 |
| 7 | osu!mania 判定幅（PERFECT 16、GREAT 64−3×OD、GOOD 97−3×OD、OK 127−3×OD、MEH 151−3×OD、MISS 188−3×OD、片側） | confirmed | [S18] の表と一致。表の値は「max hit error」（片側、±）で、判定は「hit error ≤ max hit error」。補足: 同ページは hit error が丸められ max hit error が整数に切り捨てられるため、実際の窓は式より片側 0.5 ms 前後ずれ得るとする。 |
| 8 | Clone Hero 系 .chart（B はテンポ×1000 の整数、A は音源時刻 μs に固定する編集用、Offset は秒で大きいほど音源が早く始まる、song.ini の delay はハッシュを変えずに演奏が変わるため非推奨） | confirmed | [S21]: B は「a whole number representation of the desired tempo」で例 120000=120 BPM、「The first 3 digits starting from the right are the decimals」（×1000 と等価）。A は「the time relative to the audio that the associated tempo marker should be set to, in microseconds」「typically only used for chart editing, and should be ignored otherwise」。Offset は「Start time of the audio, in seconds」「A higher value makes the audio start sooner」。delay は chart Format-Overview ではなく song.ini Standard-Tags [S22] にあり、「Delays the chart relative to the audio by the specified number of milliseconds」「Higher = later notes. Can be negative.」で「Not Recommended」節に置かれ、理由は「they can affect how the chart plays without affecting the hash of the chart file itself」。 |
| 9 | Falling Nikochan（AGPL-3.0、offset と ytBegin が独立、timeSec += (60/bpm)×Δstep、goodSec 0.04 / okSec 0.08 / badFastSec −0.25 / badLateSec 0.15、playbackRate 倍） | confirmed | リポジトリ [S25]: 「AGPL-3.0-or-later」（frontend/public/assets/ は CC-BY-4.0）、「Uses YouTube embed as audio source」。chart15.ts [S24]: ytBegin は「The time in seconds (timestamp of the video) to start the video」、offset は「The time in seconds (timestamp of the video) to start the chart. This is independent of the `ytBegin` value; for example, if `ytBegin=1` and `offset=2`, playback of the video starts at the 0:01 mark, and the chart begins one second later (at 0:02)」。bpm.ts [S25] の updateBpmTimeSec: 「timeSum += (60 / bpm[bi].bpm) * (stepToFloat(bpm[bi + 1].step) - stepToFloat(bpm[bi].step))」。gameConstant.ts [S26]: goodSec = 0.04、okSec = 0.08、badLateSec = 0.15、badFastSec = -0.25（ほかに goodSecThru = 0.025、okSecThru = 0.04）。judge.ts: 「Math.abs(late) <= goodSec * this.opts.playbackRate」など各窓を playbackRate 倍で比較。公式説明 [S27]: 「よい(±40ms)、まあまあ(±80ms)、だめ(+150ms 〜 -250ms)」。補足: chart15.ts にあるのは offset/ytBegin の定義のみで、累積式と判定定数は bpm.ts・gameConstant.ts・judge.ts にある。 |
| 10 | YouTube IFrame API・Developer Policies・RMF（getCurrentTime は精度記述なし、setPlaybackRate は保証なし、III.I.7/III.I.9/III.I.6/III.E.1、オーバーレイ禁止） | confirmed | [S28]: getCurrentTime は「Returns the elapsed time in seconds since the video started playing.」のみで精度・更新頻度の記述なし。setPlaybackRate は「Calling this function does not guarantee that the playback rate will actually change.」。[S30]: III.E.1(a)「download, import, backup, cache, or store copies of YouTube audiovisual content without YouTube's prior written approval」、III.I.6「modify, build upon, or block any portion or functionality of a YouTube player」、III.I.7「separate, isolate, or modify the audio or video components of any YouTube audiovisual content」、III.I.9「create, include, or promote features that play content, including audio or video components, from a background player」。オーバーレイ禁止は Developer Policies 本文ではなく RMF [S29] の「You must not display overlays, frames, or other visual elements in front of any part of a YouTube embedded player」。 |
| 11 | Sync Toolbox audio-score（CSV 音符リスト→クロマ＋DLNCO、feature_rate=50、MrMsDTW、単調化、interp1d、数値提示なしで「state-of-the-art」、FMP 基本例 10 Hz） | confirmed | ノートブック [S32]: 「Loading the .csv annotation file, created from a MIDI file」、df_to_pitch_features / pitch_to_chroma / pitch_onset_features_to_DLNCO、`feature_rate = 50`（Fs=22050）、`sync_via_mrmsdtw`（クロマは粗い階層、DLNCO は最も細かい階層）、`make_path_strictly_monotonic(wp)`、`scipy.interpolate.interp1d(kind='linear', fill_value="extrapolate")` で start/end を写像。精度の数値は無く、「exactly reproduces the techniques described in [1]」とするのみ。「state-of-the-art」はノートブックではなく README [S31] の「yields state-of-the-art alignment results for a wide range of Western music」。FMP [S33]: 「Fs=22050」「hop size of H=2205 samples」「10 features per seconds (feature resolution of 10 Hertz)」。 |
| 12 | TISMIR 2023（hDTW+sym 98.53%（4×22）、拍アンカー付き Linear 99.87%、0〜±300 ms ノイズで ±100 ms 未満は一貫、人間の拍アノテーション 27〜68 ms） | confirmed | [S36]「Automatic Note-Level Score-to-Performance Alignments in the ASAP Dataset」（Peter ほか、2023）。評価データは Vienna 4x22・Zeilinger・Magaloff の三つ（4×22 は Vienna 4x22 Piano Corpus）。Table 2（アンカーなしのモデル比較）の Vienna 4x22 列で hDTW+sym 98.53%、Table 5 の Beats ブロック Vienna 4x22 列で Linear 99.87%（Nakamura 法より統計的に良い印付き）。「uniformly distributed noise between 0 and ±300 ms in increments of 25 ms」を演奏側アンカーに加え、「All models perform consistently for noise levels below ±100 ms, and degrade almost linearly for higher noise levels」。Gadermaier & Widmer (2019) の「median beat annotation standard deviations between 27 and 68 ms」を参照。 |
| 13 | 著作権法 30 条 1 項・47 条の 6 第 1 項 1 号・CRIC の説明・採譜の直接解説は未発見 | confirmed | e-Gov [S37] 30 条 1 項に「個人的に又は家庭内その他これに準ずる限られた範囲内」「その使用する者が複製することができる」。[S38] 47 条の 6 第 1 項 1 号は左欄に「第三十条第一項、第三十三条第一項（同条第四項において準用する場合を含む。）、第三十四条第一項、第三十五条第一項又は前条第二項」、右欄に「翻訳、編曲、変形又は翻案」。CRIC の引用文は hajime7 [S39] ではなく cs02（私的録音録画と著作権）[S40] の Q2 にあり、原文は「したがって私的な録音・録画だからといって大量に複製したり、他人に売ったり、インターネットで送信したりすることは、私的目的の使用の範囲を超えることとなり、著作権侵害になります。」で、私的録音・録画の文脈の説明。同ページ冒頭に 2019 年 1 月 1 日施行の改正を反映していない旨の注記がある。hajime7 [S39] にあるのは「自分自身や家族、ごく親しい少人数の友人など限られた範囲内で使用することを目的とする場合、著作物を許可なく複製することができる。」。「採譜の直接解説は未発見」は調査過程の記述で、本検証でも検索枠がなく確認できていない。 |

補足（出どころの対応）:
- #2 の曲数・形式、#5 の料金・曲数・出版社名、#8 の delay、#10 のオーバーレイ、#11 の「state-of-the-art」、#13 の CRIC 引用は、事実欄に添えられた単一の URL ではなく、出どころ一覧の別 URL（[S4] トップ、[S12]、[S22]、[S29]、[S31]、[S40]）に書かれている。内容自体は一致。
- #4 の WAV/MP3 は [S11]、価格は [S9]、規約は [S10] に分かれる。
