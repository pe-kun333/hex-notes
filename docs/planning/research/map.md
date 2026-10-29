# 地図（段階①-2 整える）

作成 2026-10-23。整える役。research/ の 12 ファイル（fall-games, piano-learn, hex-layout, pc-keyboard, transcription, youtube-legal, judgment-ux, web-stack, meta-community, qwerty-sheet-culture, midi-score-sources, target-users）を一枚にまとめた。判定・採否はしない。事実は確かめ役が confirmed／corrected にしたものだけを載せ、corrected は訂正後の内容で書く。

## 1. 一枚の地図

企画の骨子: YouTube 等の楽曲を音符にし、画面上部から Q/W/E… の文字が書かれた六角形セルが流れ、画面下部の PC キーボード＝ピアノ鍵盤でタイミングよく押す音ゲー。

領域は 7 つ。矢印はデータと制約の流れ。

```
[A 音源と権利] ─ YouTube 埋め込み／自前音源 ─────────────┐
   │ 音声は手元に取り出せない（規約・技術）             │ 時刻 getCurrentTime()（約15ms刻み）
   ▼                                                    ▼
[B 音符データ] ─ 採譜／MIDI 持ち込み／手入力 ─▶ [C 譜面と同期] ─▶ [D 画面: 六角セルと流れ]
   │ 音域を PC キーの段数に収める                         │ 可視時間・判定線・プレイヤー矩形との配置
   ▼                                                    ▼
[E 入力: PC キー→鍵盤] ◀─ code／配列／ロールオーバー ─ [F 判定・採点・遅延補正]
   │                                                    │
   └──────────▶ [G 学習・継続・コミュニティ・配信] ◀───────┘
```

- A→B: 音源が YouTube なら音声解析は不可で、音符は別経路（持ち込み MIDI・PD 譜面・自前音源・手入力）になる。音符精度の研究値は「音声が手元にある」前提。
- B→C: 多声を鍵盤音域に折り畳む処理（Sky／原神／RB3 の流儀）と、動画時刻への同期（タップ・アンカー・自動整列）。
- C→D: 流れる速さ（可視時間）、六角格子の座標、YouTube プレイヤーの前に何も置けない配置。
- D↔E: 画面の六角配置と物理キーの千鳥配列は幾何学的に一致しない。文字は `code` から配列別の刻印で引く。
- E→F: 入力遅延（15〜60 ms）・時刻丸め・校正。判定幅は OSS の値が揃っている。
- F→G: スコア・ストリーク・ランキング・配信は、権利（YouTube の報酬禁止）と不正対策（入力ログ）に跨る。
- 横断: ライセンス（AGPL／GPL／MIT）、対象層（楽器を持たないピアノ志望、PC 音ゲー、タイピング、ゲーム内楽器）。

## 2. 確かめた事実

### A 音源と権利
- IFrame API: `getCurrentTime()` は秒を返すのみで精度・更新頻度の記述なし。`setPlaybackRate()` は反映を保証しない。`seekTo` は未取得区間で直前キーフレームへ。`onAutoplayBlocked`、`disablekb=1`、`controls=0`、`playsinline=1` あり。最小 200×200 px。音声を取り出す API は無い。 https://developers.google.com/youtube/iframe_api_reference
- 調査者実測（Chromium 152／Windows 11、再実行で再現）: 値の更新は約 15 ms 刻み（中央値 15.2〜15.3）、4 秒に 2〜3 回の逆行（最大 −8〜−10 ms）、seekTo 後は約 30 ms で値が飛び 210〜260 ms で再進行、停止中は凍結。広告・モバイルは未測定。（youtube-legal S0）
- Required Minimum Functionality: プレイヤーのいかなる部分の前にもオーバーレイ・フレーム等を置かない、隠さない、API 文書に無い改変をしない、半分より多く可視になるまで自動再生しない。 https://developers.google.com/youtube/terms/required-minimum-functionality
- Developer Policies: III.E.1.a 音声・映像の download/cache/store 禁止、III.E.1.b オフライン再生禁止、III.F.3.c「YouTube Applications への関与」への incentives/rewards 禁止、III.I.6 プレイヤー改変、III.I.7 音声と映像の分離、III.I.9 非表示プレイヤーでの再生禁止。 https://developers.google.com/youtube/terms/developer-policies
- 利用規約（2023-06-01 版）: 明示許可なき「アクセス、複製、ダウンロード…」と自動化手段によるアクセスを禁止。埋め込みプレイヤーでの表示は許可。 https://www.youtube.com/t/terms
- 埋め込み動画の広告収益は YouTube と動画所有者のみ。「侵害を助長するサイト」は審査で不可。click-to-play 推奨。ドメイン単位の埋め込み制限は Content Manager 利用パートナーのみ。 https://support.google.com/youtube/answer/132596
- 別オリジン iframe の中身に親は触れられず、CORS 不可の media 要素は Chromium で無音化。AudioContext は sticky activation まで suspended、別オリジン iframe は allow="autoplay" が要る。 https://www.chromium.org/audio-video/autoplay/
- Chrome: ミュート autoplay は常に可、音ありは操作後。iOS WebKit: muted ならジェスチャ不要、playsinline なしは全画面、不可視なら再生しない。 https://developer.chrome.com/blog/autoplay ／ https://webkit.org/blog/6784/new-video-policies-for-ios/
- yt-dlp Wiki（2026-07-12）: PO Token 強制を展開中、無いと 403 や IP ブロック、動画 ID に紐づき、寿命は「12 時間」とも「数か月」とも書かれ不定。web_embedded／tv／android_vr は不要。RIAA の DMCA 1201 通知 2020-10-23、GitHub は 2020-11-16 に復元。 https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
- JASRAC FAQ: ゲーム複製は J-WID 確認→条件確認→J-RAPP 申込→承諾書→支払い。特例措置は「全曲書き下ろし」のゲーム向けで、既存曲を使う企画には当たらない。「指値」は 2013 年の弁護士コラム。JASRAC–YouTube は 2008 年包括契約（1.875%）、2023 年 Content ID 本格活用、原盤は範囲外。 https://secure.okbiz.jp/faq-jasrac/faq/show/2176?category_id=191&site_domain=jp ／ https://note.com/maeben/n/nce7335b43042
- バンドスコア模倣訴訟: 2026-10-09 最高裁が上告棄却、約 1 億 6,900 万円確定。根拠は著作権ではなく民法上の不法行為（楽譜は創作的表現に当たらないとされてきた）。 https://www.jiji.com/jc/article?k=2026100900696
- 著作権法 30 条 1 項（私的使用の複製）と 47 条の 6 第 1 項 1 号（その場合の編曲・翻案可）。CRIC: 私的録音録画でも「インターネットで送信」は範囲外。 https://laws.e-gov.go.jp/api/1/articles;lawId=345AC0000000048;article=第三十条 ／ https://www.cric.or.jp/qa/cs02/index.html

### B 音符データ
- Basic Pitch: 16,782 パラメータ、オンセット 50 ms の Fno 歌 .52／ギター .79／ピアノ .71／Slakh .42／Phenicx .49（後 2 つは単一楽器ステム。混合音源は未評価）、ピアノ特化 O&F は 95.2%。2017 MacBook Pro で 7 分 45 秒を 24 秒・951 MB。TS 版 1.0.1 は 1.76 MB・Apache-2.0・22,050 Hz・「一度に一楽器」。 https://arxiv.org/abs/2203.09893 ／ https://github.com/spotify/basic-pitch-ts
- Onsets and Frames: MAPS note F1 82.29、note+offset 50.22（±50 ms）。magenta.js 版 60 MB、音声長の半分の時間、Safari は遅い。 https://arxiv.org/abs/1710.11153
- ByteDance ピアノ採譜: MAESTRO オンセット F1 96.72、オンセット＋オフセット 82.47、音符サブモジュール 20,218,778 パラメータ（ペダル側は別）、Apache 2.0、Windows 未検証（推論リポジトリ）。 https://arxiv.org/abs/2010.01815 ／ https://github.com/qiuqiangkong/piano_transcription_inference
- MT3: MAESTRO .9455／Slakh .7585／楽器別 Flat .4777、Apache-2.0、Colab/T5X。 https://arxiv.org/abs/2111.03017
- Demucs: MIT、SDR 9.00 dB、CPU で曲長の約 1.5 倍、2025-01-01 アーカイブ。demucs-web 約 172 MB・COOP/COEP 必須、fp16 混合版 126 MB。 https://github.com/facebookresearch/demucs ／ https://github.com/timcsy/demucs-web
- DDC: ±20 ms で F-score_m 0.756、F-score_c は最難 0.844／最易 0.389（別指標）、初級は 4・8 分のみ、満足度 3.87 は回答者 22 名の平均。GenéLive!: Beginner F1 0.8664（DDC 0.7839）、易の 97% 超は難に含まれる、1 曲 40→20 時間。ChartGenEval: 6 問・9 破壊テスト、局所整合 6 ms。Mania Archetype: 経験者 8 名・4 軸。 https://arxiv.org/abs/1703.06891 ／ https://arxiv.org/abs/2202.12823 ／ https://arxiv.org/abs/2607.12857
- ライセンス: Essentia.js AGPLv3 か商用、madmom コード BSD・モデル CC BY-NC-SA、aubio GPLv3、librosa ISC、Basic Pitch／MT3／ByteDance Apache、Demucs／Spleeter／Omnizart／Mapperatorinator MIT。 https://essentia.upf.edu/licensing_information.html
- 音符データの入手: Lakh 176,581 本（45,129 本が音源整列済み、CC-BY 4.0、作者特定不可）、Mutopia 2,124 曲（PD／CC を曲ごと明記）、IMSLP はカナダ基準・校訂版は別権利、MuseScore.com は 2019 年に DL 有料化→PD／オリジナル印で無料化。Synthesia は MIDI/MusicXML 持ち込み、ストア単曲 $0.99/1.99/2.99「出版社ライセンス済み」、規約は持ち込みファイルに触れない。Piano Marvel は投稿物に irrevocable・transferable なライセンスを取る。 https://colinraffel.com/projects/lmd/ ／ https://www.mutopiaproject.org/ ／ https://synthesiagame.com/support/faq ／ https://pianomarvel.com/terms-of-service
- 楽譜—音声整列: Sync Toolbox（MIT、MrMsDTW、feature_rate 50＝20 ms 粒度、音声必須）。TISMIR 2023（ASAP）: 楽譜×演奏 MIDI で F 98.53%、拍アンカー付き 99.87%、アンカー誤差 ±100 ms 未満なら一貫、人の拍アノテーション SD 27〜68 ms。 https://github.com/meinardmueller/synctoolbox ／ https://transactions.ismir.net/articles/10.5334/tismir.149
- キー文字譜の文化: Sky は 3×5 を ABC1-5 で書くタブ譜（約 205 曲、Sheet Maker MIT）。Specy genshin-music は原神 21 鍵（MIDI 48〜83 自然音のみ）／Sky 15 鍵、MIDI 取り込みで「音程オフセット」「臨時記号を 1 音下げ」「範囲外を 1 オクターブ下げる回数」を選ばせる、譜面 JSON は鍵位置 index、AGPL-3.0、12 言語。 https://sky-music.github.io/how-to-read.html ／ https://genshin-music.specy.app/blog/posts/midi-transpose ／ https://github.com/Specy/genshin-music/wiki/Exported-Music-sheet-format
- RB3 Pro Keys: MIDI 48〜72 の 25 鍵中 17 鍵表示（白鍵 10 は Wikipedia、黒鍵 7 は差引）、範囲シフト 6 種を矢印で予告、最大 4 音、Easy は 5 鍵固定。Kotaku: 10 レーン幅、黒ノートが見づらい、「1 オクターブ以上は滑らせられない」。色分け習熟 20〜30 分（Harmonix 見込み）。 https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/mid-format/Tracks/Pro-Keys/ ／ https://kotaku.com/the-good-and-worrisome-about-rock-band-3s-keyboard-5614510
- KEYBOARDMANIA: 24 鍵 C3〜B4、GREAT/GOOD/MISS、LIGHT 12 鍵。ノスタルジア: ノーツ幅 2〜10 鍵分でどこを押しても可。Virtual Piano: REAL 3 オクターブ／MAX は Shift 黒鍵 5 オクターブ、Song Mode は押すまで待つ（採点なし）。 https://ja.wikipedia.org/wiki/KEYBOARDMANIA ／ https://recursivearts.com/virtual-piano/

### C 譜面と同期
- osu! エディタ: オフセット ms、T 連打で BPM/オフセット、Ctrl 1／既定 2／Shift 10 ms。ガイド: タップ 30 秒〜1 分、Test Mode で平均 0 近く・最大 3〜5 ms、3 ms 未満は無意味。50% 再生は手順の例示で「できれば落とさない」と併記。 https://osu.ppy.sh/wiki/en/Guides/How_to_Time_Songs
- ArrowVortex: 2025-07 に OSS 化、自動 BPM/オフセットは複数候補、「半拍ずれ」修正ボタン。 https://arrowvortex.ddrnl.com/guide.html
- .chart: B＝テンポ×1000、A（anchor）＝音源時刻 μs（編集用）、Offset 秒。song.ini の delay は「ハッシュを変えずに演奏が変わる」ため非推奨。 https://thenathannator.github.io/GuitarGame_ChartFormats/Chart-File-Formats/chart-format/Format-Overview/
- Falling Nikochan（YouTube 埋め込み音源の OSS 音ゲー、AGPL-3.0）: `ytBegin`（動画開始位置）と `offset`（譜面開始の動画内秒）を独立に持つ、BPM 列の累積で時刻計算、判定 good 40／ok 80／bad +150〜−250 ms、playbackRate 倍にスケール。 https://github.com/na-trium-144/falling-nikochan
- 形式: .osu は time ms・mania 列＝floor(x·列数/512)、.sm は #OFFSET 秒＋拍分割、BMS はチャンネル base-36、bmson はパルス（resolution 240）、Sonolus は entity/archetype の gzip JSON。 https://osu.ppy.sh/wiki/en/Client/File_formats/osu_(file_format) ／ https://bmson-spec.readthedocs.io/

### D 画面: 六角セルと流れ
- Red Blob（pointy-top）: x＝size·(√3·q＋√3/2·r)、y＝size·(3/2·r)、幅 √3·size、高さ 2·size、縦の中心間隔 3/4·h、隣接 6 方向 (+1,0)(+1,−1)(0,−1)(−1,0)(−1,+1)(0,+1)、hex_round は最大誤差成分を再計算、角は 30°＋60°·i。正六角形の内接円半径＝(√3/2)·R。 https://www.redblobgames.com/grids/hexagons/implementation.html
- 等方性配列（Musix）: 2 音程（SE・SW）に加え向き（Horizontal／Vertical）で決まる。W–H 右 +2・右上 +7・左上 +5（行は全音音階）、Harmonic Table 上 +7・右上 +4・左上 +3、Jankó 右 2・対角 1。「学習が容易」は厳密には未検証（Wikipedia）。 https://shiverware.com/musixpro/customization.html ／ https://en.wikipedia.org/wiki/Isomorphic_keyboard
- 実験: MacRitchie & Milne 2017（音楽家 24 名）長 2 度の隣接は訓練・保持↑、せん断は訓練↓転移↑。Stanford ら 2018: 音楽家は等方性で転移↑、非音楽家は混在。 https://doi.org/10.3390/app7121218 ／ https://doi.org/10.3390/app8122514
- AXiS-49（98 鍵、$495）: 「初期の学習曲線はほぼ無い」が 2・4・6 度とオクターブは時間がかかり、速いソロは数か月。ボタンの輪郭が隣接誤打を防ぐ。Lumatone: 鍵径 24 mm・中心間隔 24.15 mm。Novation: 「yes and no」「手の形の手掛かりが無く目で見る」。Roger Linn は六角 4.5 半音を検討し「格子より直感的でない」として正方格子。 https://www.soundonsound.com/reviews/c-thru-music-axis-49 ／ https://www.rogerlinndesign.com/support/support-linnstrument-fourths-layout
- Plamondon 出願 US20090114078A1: 英数キーボードに W–H（右 長 2 度、左上 完全 4 度）を割り当てる請求、2011 年放棄、段ずれには触れない。 https://patents.google.com/patent/US20090114078A1/en
- 千鳥配列: 段間ずれ 1/2・1/4・1/2 キー（ダブルスタッガー）、均等 1/4u はコンパクト機。1u≈19.05 mm（¾ インチ）。 https://deskthority.net/wiki/Staggering ／ https://deskthority.net/wiki/Unit
- jubeat: レーン無しの 4×4 パネル、マーカーは反応時間順、Egg は「判定の良し悪しが分かりやすい」。Synthesia: Virtual Piano Mapping は自分のパートにだけ表示、鍵盤側／ノート側ラベルを別に切替、左手青・右手緑。 https://remywiki.com/Jubeat_Markers ／ https://www.synthesiagame.com/support/guide/labels
- 可視時間: osu! preempt AR0 1800〜AR10 450 ms、lazer mania 11485÷速度(1〜40)、Bemuse は LeadTime ms 直指定。WCAG: ポインタ対象 24×24 px、閃光 1 秒 3 回以下。色だけで伝えない（男性 8〜10%）。 https://osu.ppy.sh/wiki/en/Beatmap/Approach_rate ／ https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

### E 入力: PC キー→鍵盤
- DAW の鍵割り当ては二系統（§4 に表）。Ableton/Logic 型は中段 A S D… が C3 からの白鍵・上段が黒鍵で、鍵盤モード中は単文字ショートカットを「奪う」。VMPK/FL/REAPER/Cubase 型は 2 段×（白鍵段＋黒鍵段）で、VMPK は 30 キー・XML 保存、FL は Ctrl+T・ON 中は単キーショートカット無効・Snap to scale あり。 https://www.ableton.com/en/live-manual/12/routing-and-i-o/ ／ https://raw.githubusercontent.com/pedrolcl/drumstick/master/library/widgets/pianokeybd.cpp
- W3C UI Events code: JIS 106 は 101 に IntlYen（= と Backspace の間）・IntlRo（/ と右 Shift の間）・Backslash（]む）を足し、Backquote 位置＝半角/全角、NonConvert＝無変換、Convert＝変換、KanaMode の刻印は「カタカナ/ひらがな/ローマ字」。Mac JIS の Lang1/Lang2 はイベントが発火しない。 https://www.w3.org/TR/uievents-code/
- `code` は配列非依存（KeyQ は AZERTY の A）。刻印は `navigator.keyboard.getLayoutMap()`（Chromium 69+・HTTPS・実験的、Firefox/Safari 非対応）。Android ブラウザでは code が空。 https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
- IME 処理中の keydown は keyCode 229。key "Process" はブラウザで値が異なる。Safari は compositionend が確定 keydown より先。CapsLock は macOS Chrome で ON 時 keydown のみ・OFF 時 keyup のみ（Guacamole は 1.6.1 で回避済）。`repeat` は Baseline 2025-05（Chrome 137 まで最後のキーで誤 false）、Windows リピートは遅延 250 ms〜1 s・2.5〜30 回/秒。 https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing
- ロールオーバー: 大半の膜式はダイオード無し、矩形 3 隅でゴースト、現代機は 3 キー目を無視、USB ブートプロトコルは修飾 8＋キー 6。「よくある組合せで 4〜5 キー」。 https://en.wikipedia.org/wiki/Rollover_(keyboard)
- 遅延: Dan Luu 実測（キー動き始め→USB）Apple Magic 15、HHKB Lite2 20、K120 30、Ornata 35、Kinesis 50、K360 60 ms。ポーリング 8→1 ms の差は 3.5 ms。Cherry MX2A データシートは bounce time 5 ms。押下→画面は 50〜200 ms。 https://danluu.com/keyboard-latency/
- Web MIDI: Chrome 43／Edge 79／Firefox 108、Safari 非対応（WebKit bug 107250 は 2013 年起票で NEW）、HTTPS 必須、Chrome 124 から許可プロンプト。BLE MIDI 実測 7 ms（3〜11）。 https://caniuse.com/midi

### F 判定・採点・遅延補正
- 判定幅は §4 の表。osu!mania ホールドは頭と尻の誤差を合算、胴体で離すと MEH 止まり（ScoreV2 は別判定・尻 1.5 倍）。Quaver は離し窓 ×1.5、体力を密度でスケール。Etterna J4〜J9 倍率 1.00/0.84/0.66/0.50/0.33/0.20、Hold/Mine は非スケール。Wife3 は |誤差|≤5·ts で満点、erf で減衰、180·ts で −5.5。beatoraja の符号は負＝遅・正＝早、KEYBOARD の LN 終端は早離し 25/75/140 ms・遅離し 160/200/260 ms と非対称。 https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!mania ／ https://raw.githubusercontent.com/exch-bms2/beatoraja/master/src/bms/player/beatoraja/play/JudgeProperty.java
- 校正: StepMania AutoSync は 24 打の SD<0.03 s のときだけ平均を適用。osu!lazer はセッション平均を 1 ms 丸めで提示。Arcaea は |調整|≥101 で SE 音量 0%、同じ iPad mini 6 でスピーカー 97／AirPods Pro 221。Bemuse は Calibrate で音＋入力遅延を測定。 https://raw.githubusercontent.com/stepmania/stepmania/master/src/AdjustSync.cpp
- ブラウザの時計: AudioContext.currentTime 基準で「25 ms ごとに 100 ms 先読み」、Event.timeStamp は Chrome 0.1／Safari 1／Firefox 1 ms（resistFingerprinting 16.667 ms）、rAF 同期は 1 フレーム、baseLatency 2021-04、outputLatency Baseline 2025-03、getOutputTimestamp で performance.now と対応。非表示タブのタイマー 1 Hz は Chrome 11 から、Chrome 88 で「5 分超・チェーン 5・30 秒無音・WebRTC 不使用」なら毎分 1 回、rAF 停止。 https://web.dev/articles/audio-scheduling ／ https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- 遅延知覚: Jack ら 2016 は 0 と 10 ms に差なし、20 ms と 10±3 ms（ジッタ）は有意に低評価。Wessel & Wright は 10 ms 未満・ジッタ 1 ms 未満。打鍵→音の検出閾値は非音楽家 180±104／音楽家 102±65 ms。JND 49/27/77 ms（基準 0/64/512 ms）。 https://andrewmcpherson.org/instrumentslab-data/data/andrew/jack_am2016.pdf
- 学習研究: P.I.A.N.O. 2014（鍵盤上投影 vs Synthesia vs Finale、n=56＋18）は認知負荷↓・正答↑だが誤打鍵は多く見逃しは少ない。Banquiero 2024（MR vs Synthesia、N=33）は教師採点で MR 優位（両手の困難は Synthesia 側の観察）。Hsieh ら 2026（N=30）は成績連動の透明度が固定表示より音高・運指↑。VRSJ 2025 1B1-08 はピアノロール支援を「受動的になりやすい」と記す。 https://www.uni-ulm.de/fileadmin/website_uni_ulm/iui.inst.100/1-hci/hci-paper/2014/2014-gugenheimer-piano.pdf ／ https://arxiv.org/abs/2603.06253
- 学習アプリ: Synthesia は Melody／Rhythm／Recital の 3 モード、正答/総音符の分数表示、区間ループあり（ガイドに無いだけ）。Yousician は 25〜125% を 5% 刻みで自動増減・ループ・片手オフ。Simply Piano は青（ヒント無し正解）／黄（ヒント後）／赤。flowkey は Wait Mode・Loop、マイク判定の不調には MIDI 推奨。 https://apps.apple.com/us/app/synthesia/id579518445
- 描画・音源: rAF は 60/75/120/144 Hz に追従、WebGPU は Chrome 113・Firefox 141（Windows）/145（Apple Silicon）・Safari 26、OffscreenCanvas 2023-03。Salamander V3（Yamaha C5、16 層、CC BY 3.0、SF2 296 MiB）、Tone.js は 30 音 mp3/ogg（V2/V3 不定）、smplr 1.1.0 MIT、WebAudioFont GPL-3.0。 https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html ／ https://github.com/danigb/smplr
- OSS ライセンス: osu MIT（リソース CC BY-NC・商標別）、Etterna MIT、Quaver MPL-2.0、Dancing☆Onigiri MIT、Bemuse／sunniesnow／Specy／Falling Nikochan AGPL-3.0、beatoraja／rhythm-plus GPL-3.0。 https://github.com/bemusic/bemuse

### G 学習・継続・コミュニティ・配信
- osu!: pp は 0.95^(n−1) 重み＋416.6667·(1−0.995^min(N,1000)) ボーナス。カテゴリは Pending 4 週で Graveyard、Qualified に Nominator 2 名、Loved は投票 80%（Qualified もスコアボードあり pp 無し）。Daily challenge（2024-07-25）は日・週・累計の 3 軸 8 段階。.osr は入力ログ＋譜面 MD5。supporter は寄付で優位なし。 https://osu.ppy.sh/wiki/en/Performance_points ／ https://osu.ppy.sh/wiki/en/Gameplay/Daily_challenge
- Duolingo 公式: 7 日残存 +1.7%、Streak Freeze 2 個で DAU +0.38%、7 日到達で完了率 3.6 倍（自社 A/B）。Silverman & Barasch JCR 2023 要旨: ログで強調された無傷のストリークが関与を高める、自責で増幅、修復可能で減衰（「途切れると離脱」は検証結果ではなく含意）。 https://blog.duolingo.com/how-duolingo-streak-builds-habit/ ／ https://academic.oup.com/jcr/article/49/6/1095/6675535
- 配信: Twitch Extensions は Panel/Overlay/Component、iframe サンドボックス、審査必須。YouTube Live Chat は 1 回 5 単位。Sonolus サーバーは HTTP+JSON で静的ホスト可。BOF のエントリは 2010 年以降 250 超。 https://dev.twitch.tv/docs/extensions/ ／ https://wiki.sonolus.com/custom-server-specs/overview.html
- 料金: Synthesia $39→$29 買い切り、flowkey 1 年 12,800 円、Simply Piano 1 年 9,800 円／US $169.90、Piano Marvel $129.99/年、Melodics $179.99、Pianote $200〜240、Yousician は経路で差。不満の定番は無料部分の短さと自動更新。 https://coeteco.jp/articles/12592
- 対象層: レジャー白書 2025（n=3,467）洋楽器演奏 7.0%・希望 9.9%・年 32.3 千円、テレビゲーム 21.4%。osu! 登録 3,840 万、日本アクティブ 127,801（mania 30,021）。DJMAX RESPECT V 同時接続 30 日平均 571。Steam 日本語 2.41%。文科省: 入力速度 小 5 15.8／中 2 23.0／高 2 28.4 字/分、高 2 の 46.3% が学校外でキーボード付き PC。JEITA ノート比率 87.7%、StatCounter 日本デスクトップ Windows 78.75%。JIS X 6002 は文字キーが US と同じで記号が違う。e-typing 会員 100 万（日付は ID 推定）、マイタイピングはサビ打ち課題が上位（68 万回）。河合ら 5 者が「大人のピアノ再開」共同研究（2026-06-01）。 https://www.jpc-net.jp/research/assets/pdf/app_2025_leisure_pre.pdf ／ https://osu.ppy.sh/rankings/mania/country ／ https://www.mext.go.jp/content/20230712-mxt_jogai01-000026776-001.pdf

### 保留（unverifiable／未照合）
- 知財高裁 令和 5 年 4 月 20 日「始まりの紋章事件」（譜面作成を 30 条の 3 と認めず、編曲＝翻案）: 解説 PDF が読めず unverifiable。
- 公式未公表の判定幅（IIDX PGREAT ±16.7、SDVX ±20.83、CHUNITHM JC ±33.33、太鼓 良 ±25、DJMAX ±41.67 ms）: コミュニティ推定で出どころ自身が「信憑性はない」「要検証」と注記。
- 検証の対象外だった事実（出どころはあるが未照合）: osu! Featured Artists の非独占ライセンス、DOVA・魔王魂の規約、Rhythm Plus の実装、Beat Sage、Launchpad の「上 +5」、FFXIV 演奏、Chrome Music Lab、Twitch EventSub の種別、Roblox・virtualpiano.net の記法（403）、RB3 本体の判定幅（YARG 140 ms は代替値）。
- 記憶ベース・未確認と明記されたもの: virtualpiano.net の `[ ]`・大文字黒鍵記法、hololive の音ゲー DLC、Rhythm Hive の構造。

## 3. 制約

### 絶対に動かせないもの
- 技術: YouTube 埋め込みの音声は Web Audio に流せない（別オリジン iframe＋CORS）。時刻源は `getCurrentTime()` のみで約 15 ms 刻み・逆行あり・seek 後 200 ms 級の再進行待ち。`setPlaybackRate` は保証なし。
- 技術: 判定の時間分解能は Event.timeStamp の丸め（1 ms、Firefox 指紋対策で 16.7 ms）と rAF 1 フレーム（16.7 ms@60Hz）。背景タブは rAF 停止・タイマー絞り。
- 技術: PC キーボードのロールオーバー（膜式 3 キーでゴースト、USB ブート 6 キー）は譜面側で避けるしかない。キーボード単体遅延 15〜60 ms は個体差で、校正なしには吸収できない。
- 技術: `code` は配列非依存だが刻印取得は Chromium・HTTPS 限定。Safari に Web MIDI 無し。Mac JIS の かな/英数 はイベントを出さない。
- 法務: YouTube プレイヤーの前にオーバーレイを置けない、200×200 以上、半分超可視まで自動再生不可、音声の保存・分離・バックグラウンド再生禁止、YouTube 関与への報酬禁止。音声のダウンロード採譜（yt-dlp）は利用規約・API 規約に抵触し PO Token で技術的にも不安定。
- 法務: 既存曲の JASRAC 特例措置は当たらない（全曲書き下ろしゲーム向け）。原盤権は JASRAC の外。私的使用（30 条）は本人の複製・編曲まで、送信・共有は範囲外。AGPL／GPL のコードを取り込めば配布条件が変わる。
- 人間工学: 画面の六角格子（行間 √3/2、均等 1/2 ずれ）と物理キー（行間 1.0、1/2・1/4・1/2 ずれ）は一致しない。黒鍵ノートの視認性低下、範囲シフトは 1 オクターブ以上滑らせられない（RB3 の実績）。ジッタは平均遅延より体感に効く（20 ms、10±3 ms で評価低下）。閃光 3 回/秒・色だけで伝えない。

### 調整できるもの
- 技術: 音符データの経路（持ち込み MIDI／PD 譜面／自前音源の採譜／手入力／ユーザー投稿）、採譜モデルの選択（軽量 Basic Pitch TS 1.76 MB〜ByteDance）、時計の基準（音声時計か動画時刻か）、校正方式（タップ測定か プレイ中推定か）、譜面形式（ms か 拍パルスか）、描画（Canvas 2D／PixiJS／WebGPU）、配布（Web／PWA／Tauri／Electron）、鍵割り当て（Ableton 型 1 段＋黒鍵段、VMPK 型 2 段、原神型 3 段自然音のみ、Shift 黒鍵）。
- 法務: 音源を YouTube 埋め込みに限るか自前音源も持つか、譜面共有をサーバーで持つかリンク索引だけにするか（Clone Hero/Chorus 型）、Featured Artist 型のライセンス曲庫、Sonolus 型の第三者サーバー分離、投稿物の規約（Piano Marvel 型／Synthesia 型）。
- 人間工学: 判定幅（最上位 ±16〜33 ms の相場、キーボード向け ±30〜40 ms の前例）、段階数（3〜6）、ホールド終点の扱い、可視時間（287〜11485 ms の幅）、六角セルの径（Lumatone 24 mm、WCAG 24 px が下限の目安）、ラベルの種類と足場外し（Synthesia 型の鍵盤側／ノート側別スイッチ、成績連動の透明度）、待ちモードと固定テンポ採点の併存、同時押し上限（4 音＝RB3、2〜3 音＝膜式安全圏）。

## 4. 材料

### 判定幅（片側 ms、出どころは §2）
| 実装 | 窓 | 備考 |
|---|---|---|
| osu!mania stable | 16 / 64−3OD / 97−3OD / 127−3OD / 151−3OD / miss 188−3OD | PERFECT は OD 非依存 |
| Etterna J4 | 22.5 / 45 / 90 / 135 / 180 | J7 ×0.50、Hold 250、Mine 75 |
| Quaver Standard | 18 / 43 / 76 / 106 / 127 / 164 | 離し ×1.5 |
| Bemuse Normal | 20 / 50 / 100 / 200 | Lv1〜2 は 24 / 100 / 180 / 200 |
| beatoraja 7KEYS | 20 / 60 / 150 / BD 遅 280・早 220 | LN 終端 ±120/160/200 |
| beatoraja KEYBOARD | 30 / 90 / 200 / BD 遅 320・早 240 | PC キー向け緩和の前例 |
| FNF PBOT1 | 45 / 90 / 135 / 160 | 5 ms 以内 500 点、シグモイド減衰 |
| Falling Nikochan | 40 / 80 / 遅 150・早 250 | YouTube 音源の OSS |
| Dancing☆Onigiri | ±2f(≈33) / 3〜4f / 5〜6f / 7〜8f | 60 fps 基準 |
| Arcaea | 25 / 50 / 100 | ロングは二値 |
| osu!standard | 80−6OD / 140−8OD / 200−10OD | OD10 で 20/60/100 |

### PC キー→鍵盤の配列表
- 系統 A（Ableton）: 中段 A S D F G H J K L ; ' ＝ C D E F G A B C D E F、上段 W E T Y U O P ＝ C# D# F# G# A# C# D#。Z/X オクターブ、C/V ベロシティ。
- 系統 B（VMPK、MIDI 番号）: 下段 Z=12 S=13 X=14 D=15 C=16 V=17 G=18 B=19 H=20 N=21 J=22 M=23、上段 Q=24 2=25 W=26 3=27 E=28 R=29 5=30 T=31 6=32 Y=33 7=34 U=35 I=36 9=37 O=38 0=39 P=40（約 2.5 オクターブ、FL 式は , L . ; / と [ = ] で 37 キーに延長）。
- 系統 C（原神／Sky）: Q W E R T Y U ／ A S D F G H J ／ Z X C V B N M の 3 段×7（自然音のみ、MIDI 48〜83）／3 段×5。
- 既定キーの他例: osu!mania 4K D F J K、7K S D F Space J K L、9K A S D F Space J K L ;（記号は配列依存）。
- US/JIS の差: 文字キー（A〜Z・数字）は同じ。記号キーが違う（JIS は P の右が @ [、L の右が ; : ]、数字段右端が ^ ¥）。`code` で判定し、刻印は getLayoutMap（Chromium）か配列選択 UI で補う。JIS 固有の code: IntlYen・IntlRo・Backslash(]む)・NonConvert・Convert・KanaMode・Backquote(半角/全角)。
- 物理寸法: 1u＝19.05 mm、段ずれ 数字→Q 1/2u、Q→A 1/4u（≈4.8 mm）、A→Z 1/2u（≈9.5 mm）。

### 六角座標（Red Blob、pointy-top）
- 中心: x＝size·(√3·q＋√3/2·r)、y＝size·(3/2·r)。幅 w＝√3·size、高さ h＝2·size、横間隔 w、縦間隔 3/4·h。
- 逆変換: q＝(√3/3·x − 1/3·y)/size、r＝(2/3·y)/size → cube_round（q+r+s=0、誤差最大の成分を再計算）。
- 頂点: 角度 30°＋60°·i。文字の収まる上限は内接円径 √3·size。
- 隣接 6 方向: (+1,0)(+1,−1)(0,−1)(−1,0)(−1,+1)(0,+1)。
- 千鳥配列との対応: 1/2 ずれの段間（Z–A、Q–数字）は六角の隣接位相に合うが、A–Q 間（1/4 ずれ）は上 2 隣接が 3/4・1/4 の重なりで非対称〔導出〕。

### YouTube API の制約（数値）
- getCurrentTime 更新 ≈15 ms、逆行 ≤10 ms、seek 後 210〜260 ms、停止中凍結、レート 1.5 でも間隔は 15 ms（増分 22〜24 ms）。
- 利用可能レート 0.25〜2 の 8 段階（実測）。状態 −1/0/1/2/3/5。
- 最小 200×200、16:9 なら 480×270 推奨。プレイヤー前のオーバーレイ禁止、半分超可視まで自動再生不可、報酬禁止、音声保存・分離禁止。
- 非公式: API は iframe へ 250 ms ごとに listening 再送（未照合）。

### 採譜・整列ツール
| ツール | 精度 | 重さ | ライセンス |
|---|---|---|---|
| Basic Pitch TS | ピアノ Fno .71、歌 .52（単一楽器） | 1.76 MB、CPU 可 | Apache-2.0 |
| Onsets and Frames (magenta.js) | MAPS F1 82.29 | 60 MB（量子化 30 MB）、曲長の半分 | Apache-2.0 |
| ByteDance piano_transcription | MAESTRO 96.72 | 20M＋、GPU 推奨、Windows 未検証 | Apache-2.0 |
| MT3 | MAESTRO .9455、多楽器 .48〜.76 | Colab/T5X | Apache-2.0 |
| Demucs（分離） | SDR 9.00 | Web 版 126〜172 MB、COOP/COEP | MIT |
| Sync Toolbox（整列） | 20 ms 粒度 | Python、音声必須 | MIT |
| parangonar（MIDI 整列） | ASAP 98.5〜99.9% | Python | — |
| Essentia.js（f0・拍） | — | WASM | AGPLv3／商用 |

### ピアノ音源
- Salamander Grand Piano V3: CC BY 3.0、SF2 296 MiB、SFZ FLAC 707 MiB。Tone.js 配布は A0〜C8 の短三度 30 音×mp3/ogg（Sampler がリピッチ）。
- smplr 1.1.0（MIT）: SplendidGrandPiano 4 層、`start({time})` は currentTime 基準。WebAudioFont は GPL-3.0。

### OSS 参考実装
- Bemuse（AGPL、React/PixiJS、Calibrate・AutoVel・Early/Late）、Falling Nikochan（AGPL、YouTube 埋め込み音源、ytBegin/offset）、Dancing☆Onigiri CW（MIT、日本発キーボード音ゲー、5/7/9 鍵）、Quaver（MPL、判定・体力・離し窓のソース）、Etterna（MIT、Wife3・J1〜J9）、osu!lazer（MIT、オフセット推奨・Adaptive Speed・11485/速度）、StepMania（MIT、AutoSync 24 打 SD ゲート）、beatoraja（GPL、KEYBOARD モード）、Specy genshin-music（AGPL、MIDI→鍵位置の折り畳みオプション）、Sky Sheet Maker（MIT、5 記法相互変換）、GuitarGame_ChartFormats（CC0、譜面形式文書）、Sonolus（サーバー仕様公開、sonolus.js MIT）。
- 描画・音: PixiJS 8.22（MIT）、Phaser 4.2（MIT）、Tone 15.1（MIT）、Tauri 2（MIT/Apache）、Electron 45（MIT）。
- 遅延の設計値: web.dev 25 ms 周期・100 ms 先読み、Rhythm Quest の 3 種遅延（音声・映像・入力）、Clone Hero の映像オフセット目安 PC 0〜5 ms・TV 30〜100 ms。

### 人間工学の数値
- 遅延評価: 0〜10 ms は差なし、20 ms・10±3 ms で低下。検出閾値 102（音楽家）〜180（非音楽家）ms。
- 入力速度（学校層）: 小 5 平均 15.8 字/分（≈0.26 キー/秒）、高 2 28.4 字/分。
- 色分け習熟 20〜30 分（RB3）。AXiS 和音は即・旋律は時間・独立両手は数か月。
- 対象寸法 24×24 px 以上、閃光 3 回/秒以下、色覚 8〜10%。

## 5. 問い（主担当の判断が要る論点）

1. 音符データの主経路は何か。 (a) 持ち込み MIDI/MusicXML のみ（Synthesia 型） (b) 自前音源ファイルをブラウザ内採譜（Basic Pitch TS） (c) PD/CC 曲庫＋Featured Artist 型の許諾曲 (d) ユーザー投稿譜面の共有サーバー
2. YouTube をどう使うか。 (a) 埋め込み再生を主音源にし譜面は別経路（Falling Nikochan 型） (b) 自前音源を主にし YouTube はプレビュー・導線のみ (c) YouTube を使わない
3. 時計の基準。 (a) getCurrentTime を毎フレーム読み補間（15 ms 刻み前提） (b) performance.now で単調補間し getCurrentTime で周期補正 (c) 自前音源なら AudioContext.currentTime
4. 鍵割り当ての系統。 (a) Ableton 型（1 段白鍵＋上段黒鍵、1 オクターブ強） (b) VMPK 型（2 段、2.5 オクターブ、JIS 記号を含む） (c) 原神型（3 段×7 自然音のみ、半音は折り畳み） (d) Shift で黒鍵（Virtual Piano MAX 型）
5. 画面の六角セルと物理キーの対応。 (a) 六角は見た目だけで判定は列（1 セル＝1 キー）の矩形格子 (b) 1/2 ずれの段間のみ六角隣接とみなす (c) 画面下部の鍵盤図は実配列のまま描き、流れるセルだけ六角 (d) 等方性配列（W–H）を画面側に採用
6. 最上位の判定幅。 (a) ±16〜20 ms（osu!mania/Quaver 相場） (b) ±30〜33 ms（beatoraja KEYBOARD／Dancing☆Onigiri） (c) ±40 ms（Falling Nikochan） (d) 段階選択制（Etterna J1〜J9 型）
7. 校正の既定。 (a) タップ測定（osu!stable／Bemuse 型） (b) プレイ中の平均を提示（lazer 型、SD ゲート付き） (c) 両方（初回タップ＋以後自動）
8. 同時押しの上限。 (a) 単音のみ (b) 2 音まで（膜式安全圏） (c) 4 音（RB3） (d) キーボード検出で可変
9. ホールド（音の長さ）の扱い。 (a) 評価しない（CHUNITHM/Cytus 型） (b) 離し窓を広く（Quaver ×1.5） (c) 頭と尻を合算（osu!mania）
10. 譜面の時間表現。 (a) ms 絶対時刻（.osu） (b) 拍パルス＋BPM 列（bmson/Falling Nikochan） (c) 両方を持ち anchor で固定（.chart）
11. 文字ラベルの足場外し。 (a) 常時表示 (b) 鍵盤側／ノート側を別スイッチ（Synthesia） (c) 成績連動で薄める（Hsieh 2026） (d) 難易度で固定
12. 継続とランキングの範囲。 (a) ローカルのみ (b) 入力ログ付きのオンラインランキング（osu! .osr 型） (c) デイリー・ストリーク（修復手段の有無） (d) YouTube 関与への報酬禁止を踏まえ、スコアを YouTube 視聴と切り離す設計
13. ライセンスの線。 (a) MIT/MPL のみ参照し自前実装 (b) AGPL のコードを使い全体を AGPL 公開 (c) 部品ごとに分離（分離プロセス・サーバー）
14. 対象層の優先。 (a) 楽器を持たないピアノ志望（希望 9.9%−参加 7.0%） (b) PC 音ゲー層（osu!mania 日本 3 万） (c) タイピング層（サビ打ち課題の延長） (d) ゲーム内楽器層（原神/Sky の譜面資産）

## 6. 考察の観点候補

1. 時計と同期の観点: 動画時刻・音声時計・入力時刻の 3 つをどう一本化するかから案を広げる。
2. 音域折り畳みの観点: 多声・半音・広音域を段数の限られたキーに写す規則（移調、1 音下げ、オクターブ折り、幅許容）を列挙する。
3. 六角幾何の観点: 画面の六角格子と千鳥配列のずれを「見た目」「判定」「隣接」のどこで吸収するかを比べる。
4. ラベルと足場外しの観点: キー文字・音名・ドレミ・度数の切替と、成績連動で消す設計を練習と本番で分ける。
5. 判定幅と遅延予算の観点: 入力 15〜60 ms・丸め 1〜16.7 ms・時刻源 15 ms を積み上げ、窓と校正をどう組むか。
6. 同時押し制約の観点: ロールオーバー上限を譜面生成・難易度・和音表現の側でどう扱うか。
7. 音符データ経路の観点: 採譜・MIDI 持ち込み・PD 曲庫・投稿の各経路を精度・権利・手間で並べる。
8. YouTube 規約適合の観点: オーバーレイ禁止・報酬禁止・音声非取得の枠内で成立する画面と導線を描く。
9. 権利と共有範囲の観点: 私的使用（30 条）の内側に留める設計と、共有・ランキングを持つ設計の線引き。
10. 学習効果の観点: 待ちモード・テンポ可変・ヒント減衰・区間ループの組合せを研究知見（依存・転移）に照らす。
11. 難易度生成の観点: 「難から間引いて易」「拍スナップ」「密度帯」の規則で自動生成と手直しをどう分けるか。
12. 継続設計の観点: ストリーク・デイリー・ランキングの効果と副作用（途切れ・不正・報酬禁止）を並べる。
13. 配列差と環境差の観点: JIS/US、Safari/Firefox、ノート PC 膜式、学校端末を前提にした最小構成を考える。
14. 先行文化の観点: Sky/原神のキー文字譜、タイピングのサビ打ち、Synthesia 動画の視覚言語から、共有フォーマットと入口を考える。
