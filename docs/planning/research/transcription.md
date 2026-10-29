# 楽曲の自動採譜と音ゲー譜面の自動生成

調査日 2026-10-23。数値は出典付き、推測は明記。判定はしない。

## 事実

### 採譜（音→音符）
- **Basic Pitch（Spotify）**: パラメータ 16,782 個。オンセット 50 ms 以内の Fno: 歌 .52、ギター .79、ピアノ .71、シンセ混合 .42、管弦楽 .49。ピアノ特化の Onsets and Frames は同条件 95.2% [S1][S2]。TS 版 1.0.1（tfjs ^3.2 依存、1.76 MB）、「works best on one instrument at a time」[S3][S4]。
- **Onsets and Frames（Magenta）**: MAPS で note F1 82.29、note+offset 50.22、許容 ±50 ms [S5]。Magenta.js 版 60 MB、「音声長の半分の時間で処理」、Safari は遅い [S6][S7]。
- **ByteDance（Kong ら）**: MAESTRO オンセット F1 96.72%（O&F 94.80%）、Apache 2.0 [S8][S9]。
- **MT3（Google）**: オンセット F1 ピアノ .95、Slakh .76、楽器別 F1（Slakh）.48。Apache-2.0、Colab/T5X のみ [S10][S11]。

### 音源分離
- **Demucs**: MIT、SDR 9.00 dB、CPU 時間は曲長の約 1.5 倍、本家は 2025-01-01 アーカイブ [S13]。ブラウザ移植: demucs-web（約 172 MB）[S14]、fp16 版（126 MB、約 22 倍速）[S15]。

### 拍・オンセット・メロディ
- Essentia.js（AGPLv3 か商用契約）に BeatTrackerMultiFeature、OnsetDetection、PredominantPitchMelodia（MELODIA、多声から主旋律 f0＋信頼度）を収録 [S21][S22][S23][S24]。
- 指標は RPA（50 セント）と OA [S25]。Hsieh ら 2019: OA は ADC2004 83.7/70.8（Bittner）/74.9（Lu&Su）[S26]。

### 譜面生成の研究
- **DDC（2017）**: 配置 F-score 0.756、最難 0.844／最易 0.389、許容 ±20 ms。最易 1 ステップ/秒未満、最難 7 超 [S28][S29]。**DDCL（2025）**: 配置 F1 0.7245（DDC 再現 0.5797）、難易度 1 は人間が極端に少なく置く外れ値 [S30]。
- **GenéLive!（KLab）**: ビートガイド（小節頭 2・拍 1・他 0）。F1（±50 ms）Beginner 0.866（DDC 0.784）。「易しい譜面の音符の 97% 超は難しい譜面にも含まれる」ため全難易度を 1 モデルで学習。110 曲に運用、1 曲約 40→20 時間 [S31]。
- **Mania Archetype（2024）**: 経験者 8 名。没入 3.0 対 2.75、達成感 2.63 対 2.25、苛立ち 2.5 対 3.0、上達意欲 3.88 対 3.5（MA 対 DDC）。人間譜面との一致率は 21.7% 対 22.7% と微減 [S32]。
- **ChartGenEval（2026）**: 6 問＋9 種の破壊テスト。15/30/60 ms のずれを 3 ms 以内に復元、局所整合 6 ms。「配置 F1 は再構成の尺度で、妥当な別解も誤りと同じく減点される」[S34]。TCP は拍スナップを使う [S35]。
- 国内: 辻野・山西（2018）は高低難易度の関係を学習して難易度調整 [S36]。

### 製品・規範
- **Beat Sage**: 2 つの NN（配置時刻／ブロック種別）、YouTube リンク入力。「バラードやロックは奇妙か退屈」が課題 [S38][S39]。
- **Mapperatorinator**: Whisper 系 219M、要 GPU [S40]。osu! は「hit objects, hitsounds and timing must be created exclusively by direct human input」[S41][S42]。BeatSaver は AI-assisted 申告制 [S43]。
- Melody's Escape「曲全体を数秒で解析」・保持音をスライドに対応 [S45]。
- ブラウザ推論: ORT Web は軽量モデルは WASM、重いモデルは WebGPU 推奨 [S48]。WebGPU は Chrome 113、Firefox 141、Safari 26、Linux は進行中 [S50]。

## 事例

| 名前 | 含意 |
|---|---|
| Basic Pitch TS [S3] | ブラウザ内音符化の最小構成（1.76 MB） |
| Magenta.js O&F [S6] | ピアノ曲限定なら高精度 |
| demucs-web [S14] | 歌と伴奏を分ける前段 |
| Essentia.js [S23] | 主旋律 f0 だけ取る DSP 系。AGPL |
| DDC/DDCL [S28][S30] | 難易度条件付き配置。低難易度が弱い |
| GenéLive! [S31] | 「難から間引いて易」を支持 |
| Mania Archetype [S32] | モック評価項目の雛形（4 軸） |
| ChartGenEval [S34] | 生成譜面の自己検査の設計例 |
| Beat Sage [S38] | YouTube 入力の先行例と課題 |
| BeatMapSynthesizer [S51] | 拍＋HMM の軽量例 |

## 類推
- GenéLive! の「易⊂難（97%）」は、全音符を採ってから難易度別に間引く設計と整合（推測）。DDCL の「難易度 1 は極端に少ない」は最易だけ別規則が要る示唆。
- ChartGenEval の密度急変ペナルティと 6 ms 局所整合、TCP の拍スナップは、拍に揃えてから間引く自己検査に転用できそう（推測）。
- Melody's Escape の保持音→スライドは、オフセット精度の低さ（note+offset F1 50〜82）を長音の押しっぱなしで吸収する類推（推測）。

## 制約
- ライセンス: Essentia.js は AGPLv3 か商用契約、madmom モデルは CC BY-NC-SA、aubio は GPLv3 [S19][S20][S21]。
- YouTube 利用規約は「アクセス、複製、ダウンロード…を行うこと」と迂回を禁止 [S52]。埋め込み音声の Web Audio 解析可否は未確認（推測: 不可）。
- 著作権法: 複製権（21 条）、公衆送信権（23 条）、「編曲し…その他翻案する権利」（27 条）[S53]。
- 精度: 混合音源で Basic Pitch Fno .42〜.49、MT3 楽器別 F1 .48 [S1][S10]。指標の許容が ±50 ms なので、判定幅をそれより狭くすると採譜誤差がミス判定に直結する。
- 時間: Basic Pitch CPU で 465 秒の曲を 24 秒 [S1]、O&F JS は曲長の約 50% [S7]。ブラウザ分離は 126〜172 MB の重みと COOP/COEP が要る [S14]。
- 規範: osu! は AI 生成を Ranked から排除、BeatSaver は申告制 [S41][S43]。人間工学（推測）: 多声の鍵盤化は同時押しが増える。

## 問い
1. 歌メロだけを取るなら、分離→採譜と MELODIA 系 f0 直接抽出のどちらが精度・時間で勝るか。
2. 判定幅を ±50 ms より狭くする場合、拍へのスナップでどこまで採譜誤差を吸収できるか。
3. 難易度別の間引きの主軸は密度帯、拍の細分（4→8→16 分）、信頼度しきい値のどれか。
4. 遊びやすさは Mania Archetype の 4 軸と ChartGenEval の 6 問のどれで測るか。
5. YouTube 入力の規約上の経路は何か。
6. Basic Pitch TS の WebGPU 実績、ByteDance・MT3 のブラウザ移植、多声→単鍵盤の写像（和音、オクターブ折りたたみ）の先行研究は未調査。

## 出どころ一覧
- [S1] Basic Pitch 論文 https://arxiv.org/abs/2203.09893
- [S2] https://github.com/spotify/basic-pitch
- [S3] https://github.com/spotify/basic-pitch-ts
- [S4] https://registry.npmjs.org/@spotify/basic-pitch
- [S5] Onsets and Frames https://arxiv.org/abs/1710.11153
- [S6] https://github.com/magenta/magenta-js/blob/master/music/checkpoints/README.md
- [S7] https://github.com/magenta/magenta-js/blob/master/music/README.md
- [S8] Kong ら 2020 https://arxiv.org/abs/2010.01815
- [S9] https://github.com/bytedance/piano_transcription
- [S10] MT3 https://arxiv.org/abs/2111.03017
- [S11] https://github.com/magenta/mt3
- [S12] https://github.com/Music-and-Culture-Technology-Lab/omnizart
- [S13] https://github.com/facebookresearch/demucs
- [S14] https://github.com/timcsy/demucs-web
- [S15] https://huggingface.co/monteslu/htdemucs-web-onnx
- [S16] https://github.com/nikhilunni/demucs-rs
- [S17] https://github.com/deezer/spleeter
- [S18] https://github.com/librosa/librosa
- [S19] https://github.com/CPJKU/madmom
- [S20] https://github.com/aubio/aubio
- [S21] https://mtg.github.io/essentia.js/
- [S22] https://essentia.upf.edu/licensing_information.html
- [S23] https://mtg.github.io/essentia.js/docs/api/Essentia.html
- [S24] https://essentia.upf.edu/reference/std_PredominantPitchMelodia.html
- [S25] メロディ抽出レビュー https://arxiv.org/abs/2202.01078
- [S26] Hsieh ら 2019 https://arxiv.org/abs/1810.12947
- [S27] CREPE https://github.com/marl/crepe / https://marl.github.io/crepe/
- [S28] DDC https://arxiv.org/abs/1703.06891
- [S29] https://github.com/chrisdonahue/ddc
- [S30] DDCL https://arxiv.org/abs/2507.01644
- [S31] GenéLive! https://arxiv.org/abs/2202.12823
- [S32] Mania Archetype https://openaccess-api.cms-conferences.org/articles/download/978-1-964867-13-7_19
- [S33] TaikoNation https://arxiv.org/abs/2107.12506
- [S34] ChartGenEval https://arxiv.org/abs/2607.12857
- [S35] TCP (AIIDE) https://ojs.aaai.org/index.php/AIIDE/article/view/36808
- [S36] 関西大学 研究シーズ https://www.kansai-u.ac.jp/renkei/seeds/asset/list/2022/telecommunications/telecommunications_41.pdf
- [S37] 柴崎ほか 2018 https://ipsj.ixsq.nii.ac.jp/records/188597
- [S38] https://uploadvr.com/beat-sage-ai-beat-saber-custom/
- [S39] https://uploadvr.com/beat-sage-mp3-support/
- [S40] https://github.com/OliBomby/Mapperatorinator
- [S41] https://osu.ppy.sh/wiki/en/Ranking_criteria
- [S42] https://osu.ppy.sh/community/forums/posts/9939828
- [S43] https://bsmg.wiki/mapping/
- [S44] https://store.steampowered.com/app/12900
- [S45] https://store.steampowered.com/app/270210
- [S46] https://store.steampowered.com/app/49600
- [S47] https://www.mobygames.com/game/29775/frets-on-fire/
- [S48] https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- [S49] https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-webgpu
- [S50] https://web.dev/blog/webgpu-supported-major-browsers
- [S51] https://github.com/wvsharber/BeatMapSynthesizer
- [S52] https://www.youtube.com/t/terms
- [S53] 著作権法 https://www.japaneselawtranslation.go.jp/en/laws/view/4207

## 検証結果

検証日 2026-10-23。対象 12 件の出どころ URL を WebFetch で読み、arXiv の論文は PDF を取得して pdftotext で本文・表を抽出し照合した（arXiv の要旨ページだけでは数値が確認できないため）。WebSearch はこのターンの上限に達して使えなかったので、別の一次情報は出どころ一覧の URL とその派生（npm registry、GitHub README、arXiv HTML 版、推論用リポジトリ）に限った。判定・提案はしない。

| # | 事実（要約） | 結果 | 照合した内容・補足 |
|---|---|---|---|
| 1 | Basic Pitch: 16,782 パラメータ、Fno 歌 .52／ギター .79／ピアノ .71／Slakh .42／Phenicx .49、O&F 95.2%、2017 MacBook Pro で 7 分 45 秒を 24 秒・951 MB | corrected | 数値はすべて論文本文・Table 2・Table 3 と一致（「a total of only 16,782 parameters」「achieves 95.2% Fno, in comparison to 70.9% of our method」「951 MB peak memory and taking 24 s」）。ただし「シンセ混合」「管弦楽」は混合音源ではない。Slakh は「instrument-balanced subset of 120 of the non-percussive test-set stems」、Phenicx は「42 instrumental section-grouped stems（violins, bassoons など）」で評価されており、どちらも単一楽器（セクション）のステム。混合音源での音符精度は本論文では測られていない。 |
| 2 | basic-pitch-ts 1.0.1（2022-08-05）、Apache-2.0、tfjs ^3.2.0、1.76 MB、22,050 Hz、「works best on one instrument at a time」 | confirmed | npm registry: 1.0.1 の time は 2022-08-05T16:42:46Z、latest は 1.0.1、dependencies は @tensorflow/tfjs ^3.2.0 と @tonejs/midi ^2.0.28、unpackedSize 1,761,856、license Apache-2.0。README: 「all audio will be resampled to 22050 Hz before processing」「Basic pitch works best on one instrument at a time」。 |
| 3 | O&F: MAPS note F1 82.29、note+offset 50.22、±50 ms。Magenta.js 版 60 MB（2 バイト量子化 30 MB）、音声長の半分で処理、Safari は遅い、ソロピアノ向け | confirmed | O&F 論文 Table 1（MAPS config 2）: Onsets and Frames 行の note F1 82.29、note w/ offset F1 50.22。許容は「onsets be within ±50ms of ground truth」（mir_eval）。checkpoints/README.md: onsets_frames_uni 60 MB、onsets_frames_uni_q2 30 MB「Quantized to 2-byte weights」。music/README.md: 「takes half the duration of audio to run on most browsers」、WebKit のバグで再標本化が「significantly slower on Safari」、「works best on solo piano recordings」。 |
| 4 | ByteDance: MAESTRO オンセット F1 96.72%（O&F 94.80%）、オンセット＋オフセット 82.47%、20,218,778 パラメータ、Apache 2.0、cuda/cpu、Linux/Mac 対応で Windows 未検証 | corrected | 論文 Table I: 「Regress cond on. & off. & vel.」行 note F1 96.72、note w/ offset F1 82.47、Onsets & frames 行 94.80。本文「The note transcription system consists of 20,218,778 trainable parameters」。ただしこれは音符採譜サブモジュールのみの数で、ペダル採譜サブモジュールは「same acoustic model architecture」を別に持つため、配布される全体はこれより大きい。Apache 2.0 は bytedance/piano_transcription の LICENSE 節。「cuda / cpu」と「This repo support Linux and Mac. Windows has not been tested.」は qiuqiangkong/piano_transcription_inference の README の記述（arXiv ページには無い）。 |
| 5 | MT3: T5-small、ICLR 2022、混合学習のオンセット F1 MAESTRO 0.9455／Slakh2100 0.7585／GuitarSet 0.895／MusicNet 0.5016、Slakh Flat 0.4777、Apache-2.0、Colab/T5X | confirmed | arXiv HTML v4: 「We use the T5 small model, which contains approximately 60 million parameters」（Table 4 は 93.7M と記載、論文内で食い違い）。Table 2 の MT3 (mixture) 行: MAESTRO 0.9455、Cerberus4 0.9187、GuitarSet 0.895、MusicNet 0.5016、Slakh2100 0.7585、URMP 0.77。Table 3 Slakh2100: Flat 0.4777、MIDI Class 0.6188、Full 0.5453。Comments 欄「ICLR 2022 camera-ready version」。magenta/mt3: Apache-2.0、Colab notebook、「uses the T5X framework」、「we do not (easily) support training」。README は「のみ」とは書いていないが、提示されている実行経路は Colab と T5X だけ。 |
| 6 | Demucs: MIT、HT Demucs ft が MUSDB HQ で SDR 9.00 dB、CPU は曲長の約 1.5 倍、2025-01-01 アーカイブ。demucs-web（ONNX 約 172 MB、ORT Web WebGPU/WASM、COOP/COEP 必須）、fp16 版（126 MB、RX 7600 で約 22 倍速、描画と両立で約 8 倍速） | confirmed | facebookresearch/demucs: 「released under the MIT license」「archived by the owner on Jan 1, 2025」「achieves a SDR of 9.00 dB on the MUSDB HQ test set」、表の HT Demucs f.t. (v4) 9.0、「processing time should be roughly equal to 1.5 times the duration of the track」（-d cpu の説明の直後）。timcsy/demucs-web: 「ONNX 模型（約 172MB）」「ONNX Runtime Web 實現 WebGPU/WASM 加速推論」、COOP: same-origin と COEP: require-corp が必須、MIT。monteslu/htdemucs-web-onnx: 「126MB total instead of 173MB」「Throughput ~22x realtime run back-to-back, ~8x with compositor-friendly pacing」、Radeon RX 7600 で計測、MIT。補足: 「fp16 版」は Conv/ConvTranspose を fp32 に残した混合精度（「fp16 everywhere except Conv/ConvTranspose」）。 |
| 7 | DDC: ±20 ms、F-score_m 0.756（Fraxtil）、最難 0.844／最易 0.389、初級は 4 分・8 分のみ、最易 1 ステップ/秒未満・最難 7 超、デモ 220 人・1,370 譜面・満足度 3.87/5 | corrected | 論文: 「true positives if they lie within a ±20ms window」、Table 2 の C-LSTM Fraxtil 行 F-score_m 0.756、「Beginner charts tend to contain only quarter notes and eighth notes」、「For low-difficulty charts, the average number of steps per second is less than one … the highest-difficulty charts exceed seven steps per second」、「220 players have produced 1370 step charts」。訂正点 2 つ: (a) 0.844／0.389 は F-score_c（譜面ごとの F の平均）であり、0.756 の F-score_m とは別の指標（「the C-LSTM achieves an F-score_c of 0.844 for the hardest difficulty charts but only 0.389 for the lowest difficulty」）。(b) 満足度 3.87 は 220 人ではなく、1〜5 で回答した 22 名の平均（「The 22 respondents reported an average satisfaction of 3.87」）。 |
| 8 | GenéLive!: F1（±50 ms）Beginner 0.8664（DDC 0.7839）、全体 0.8019（0.7514）、易しい譜面の 97% 超が難しい譜面に含まれる、2020 年 7 月から 110 曲、約 40→20 時間、22 音中 21 音採用、ビートガイドは易しい難易度ほど効く | confirmed | arXiv HTML v2 Table 1: Beginner 0.8664±0.0036 対 0.7839±0.0081、all 0.8019±0.0026 対 0.7514±0.0046。「within ±50 ms around the ground truth」「more than 97% of notes in an easier chart appears also in a harder one」「Since the first deployment … (July 2020) … all 110 songs released」「About 20 hours of work are saved per song, whereas it used to take about 40 hours per song」「Of the 22 auto-generated notes, 21 were accepted as they were」。Table 8: ビートガイド無しで Beginner 0.8034、「the effect of adding the beat guide to the input was larger for the easier difficulty modes」。 |
| 9 | ChartGenEval（2026）: 太鼓系 3,880 譜面、6 問、9 種の破壊テスト、15/30/60 ms のずれを 170 譜面中 169 以上で 3 ms 以内に復元、局所整合 6 ms、「配置 F1 は再構成の尺度」 | confirmed | arXiv 2607.12857（2026-07-14 投稿、Jhen-Ke Lin）HTML v1: 「The calibration set contains 3,880 course charts from 813 separate song groups」（別に held-out 333 譜面）、「Taiko-style chart files」、Table 1 の 6 問（Timing／Note sequence／Repetition and form／Response to music／Human-chart distance／Difficulty and limits）、Table 2 の 9 テスト（dense timing jitter、sparse 60 ms timing errors、whole-chart shift、note-type shuffle、loop collapse、common-pattern rewrite、note-rate scaling、local burst insertion、bar-order shuffle）、「at least 169 of 170 charts are within 3 ms of the injected value」（40 曲の開発パネル）、「We treat a note within 6 ms of the authored grid as locally aligned」（6 ms は整合判定の許容幅）、「A placement F1 score measures reconstruction: a valid alternative loses credit in the same way as an error」。 |
| 10 | Mania Archetype（AHFE 2024）: osu!mania 4K 110 譜面、経験者 8 名、YOASOBI 10 曲、没入 3.0/2.75、達成 2.63/2.25、苛立ち 2.5/3.0、上達意欲 3.88/3.5、一致率 21.67%/22.73% | confirmed | PDF 本文（pdftotext）: 「Human Factors in Virtual Environments and Game Design, Vol. 137, 2024」「2024. Published by AHFE Open Access」、Wang・Huang・Li。「A dataset containing 110 high-difficulty charts of Mania 4k」「we select 8 players with medium to high difficulty gaming levels in OSU!」「selected 10 charts from the high-popularity group YOASOBI's songs」。Table 5: DDC 2.75/2.25/3/3.5、MA 3/2.63/2.5/3.88（Immersion／Achievement／Irritability／Improvement Motivation）。Table 3: Same DDC 22.73%、MA 21.67%、Fit／Predictability／Memorability の 3 軸。 |
| 11 | ライセンス: Essentia.js AGPLv3 か商用、モデル CC BY-NC-ND 4.0。madmom コード BSD／モデル CC BY-NC-SA 4.0。aubio GPLv3。librosa ISC。Basic Pitch・MT3・ByteDance Apache-2.0。Demucs・Spleeter・Omnizart・Mapperatorinator MIT | confirmed | essentia.upf.edu: 「Affero GPLv3, for non-commercial applications」、商用ライセンスは MTG（UPF）に連絡、モデルは「CC BY-NC-ND 4.0」で商用は別契約。mtg.github.io/essentia.js: 「License: AGPL v3」バッジ（同じ licensing ページにリンク）。CPJKU/madmom: 「all source code files are published under the BSD license」「model and data files … Creative Commons Attribution-NonCommercial-ShareAlike 4.0」。aubio: GPL「either version 3 of the License, or (at your option) any later version」。librosa: ISC license。spotify/basic-pitch・magenta/mt3・bytedance/piano_transcription: Apache 2.0。facebookresearch/demucs・deezer/spleeter・omnizart・OliBomby/Mapperatorinator: MIT。 |
| 12 | WebGPU: Chrome/Edge 113（Win/mac/ChromeOS）、Android は Chrome 121、Firefox 141（Windows）・145（macOS Tahoe ARM）、Safari 26（macOS Tahoe 26/iOS 26/iPadOS 26/visionOS 26）、Linux と Intel Mac は進行中（web.dev 2025-11-25）。ORT Web は軽量は WASM、重いは WebGPU。TF.js WebGPU は FP16 未対応 | confirmed | web.dev「Published: November 25, 2025」: 「starting with Chrome and Edge version 113」（Windows は Direct3D 12、macOS、ChromeOS）、「Support for Android was added in Chrome version 121 for devices running at least Android 12」、「WebGPU is available on Windows as of Firefox 141」「available in macOS Tahoe 26 on ARM64 machines, as of Firefox 145」、Safari は「macOS Tahoe 26, iOS 26, iPadOS 26, and visionOS 26」、「Support for Linux … and Intel-based Macs is in progress」。onnxruntime.ai: 「very lightweight models … keep using the default WebAssembly (WASM) execution provider」「more compute intensive models … use the WebGPU execution provider」。tfjs-backend-webgpu README: 「Many exciting features, like FP16, DP4A, will be brought in soon」（README の記述で、日付は無い）。 |

### 訂正文（corrected の 3 件）
- **#1 Basic Pitch**: 数値は正しいが、Slakh .42 と Phenicx .49 は「混合音源」ではなく単一楽器（セクション）ステムでの値。論文は Slakh を非打楽器ステム 120 本、Phenicx を楽器セクション別ステム 42 本で評価しており、歌や伴奏が混ざった音源での音符精度は示していない。根拠: https://arxiv.org/html/2203.09893v2（4 節、Table 1・2）。
- **#4 ByteDance**: 20,218,778 は音符採譜サブモジュールの学習可能パラメータ数。ペダル採譜サブモジュールは同じ音響モデル構造を別に持つため、システム全体はその分大きい。Windows 未検証の記述は推論用リポジトリ側にある。根拠: https://arxiv.org/pdf/2010.01815（III 節）、https://github.com/qiuqiangkong/piano_transcription_inference。
- **#7 DDC**: 0.844／0.389 は F-score_c（譜面単位）で、0.756 の F-score_m とは別指標。満足度 3.87/5 は 220 人ではなく回答者 22 名の平均。根拠: https://arxiv.org/pdf/1703.06891（5.1 節、7 節）。

### 確認できたが補足が要る点（confirmed のうち）
- #3 の 60 MB／30 MB は music/README.md 本体ではなく、そこからリンクされる music/checkpoints/README.md の表にある。
- #5 の「Colab/T5X でのみ」は README の言い回しではない（提示されている経路が Colab と T5X だけ、という事実に基づく）。MT3 のパラメータ数は本文 60M と Table 4 93.7M で論文内に食い違いがある。
- #6 の「fp16 版」は Conv/ConvTranspose を fp32 に残す混合精度。COOP/COEP の記述は demucs-web 側にあり、monteslu 版のページには無い。
- #9 の 3,880 は較正セットの数で、held-out テストは別に 333 譜面。169/170 は 40 曲の開発パネルでの結果。
- #12 の TF.js FP16 未対応は tfjs-backend-webgpu の README の記述に依る（日付の無い FAQ）。WebSearch が使えず、より新しい状況は確かめていない。

### 検証に使った一次情報
- https://arxiv.org/html/2203.09893v2 ／ https://arxiv.org/pdf/2203.09893
- https://registry.npmjs.org/@spotify/basic-pitch ／ https://github.com/spotify/basic-pitch-ts ／ https://github.com/spotify/basic-pitch
- https://arxiv.org/pdf/1710.11153 ／ https://github.com/magenta/magenta-js/blob/master/music/README.md ／ https://github.com/magenta/magenta-js/blob/master/music/checkpoints/README.md
- https://arxiv.org/pdf/2010.01815 ／ https://github.com/bytedance/piano_transcription ／ https://github.com/qiuqiangkong/piano_transcription_inference
- https://arxiv.org/html/2111.03017v4 ／ https://arxiv.org/abs/2111.03017 ／ https://github.com/magenta/mt3
- https://github.com/facebookresearch/demucs ／ https://github.com/timcsy/demucs-web ／ https://huggingface.co/monteslu/htdemucs-web-onnx
- https://arxiv.org/pdf/1703.06891
- https://arxiv.org/html/2202.12823v2
- https://arxiv.org/html/2607.12857v1 ／ https://arxiv.org/abs/2607.12857
- https://openaccess-api.cms-conferences.org/articles/download/978-1-964867-13-7_19（PDF、pdftotext で抽出）
- https://essentia.upf.edu/licensing_information.html ／ https://mtg.github.io/essentia.js/ ／ https://github.com/CPJKU/madmom ／ https://github.com/aubio/aubio ／ https://github.com/librosa/librosa ／ https://github.com/deezer/spleeter ／ https://github.com/Music-and-Culture-Technology-Lab/omnizart ／ https://github.com/OliBomby/Mapperatorinator
- https://web.dev/blog/webgpu-supported-major-browsers ／ https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html ／ https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-webgpu
