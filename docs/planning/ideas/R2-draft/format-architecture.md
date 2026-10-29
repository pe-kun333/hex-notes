# 譜面形式とシステム構成（R2 設計書・節 format-architecture）

起草 2026-10-30。前提は ideas/R2/decisions.md。元の案は catalog の id、事実は research/map.md の節で示す。画面の細部は screens、閾値は spec、順序は worktable、危険は risks に譲る。

## 1. 譜面形式 hexnote-chart/1

### 1.1 方針

- 三層（pipeline-03、決定「譜面形式」）: 音高譜 notes（配列に依存しない）、拍パルス pulse、同期 sync。位置譜 keys は本体に持たず、譜面版 variants（配列×上限×折り畳み）が持つ（決定 #1・#7）。
- 真実は一つずつ: 時刻は pulse、音は notes、押す鍵は variants[].keys。bpm／beats は表示用の写しで、食い違えば pulse を取る（song.ini delay の教訓、map §2 C）。
- 音声・動画は含めない（pipeline-15）。

### 1.2 トップレベル

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| format | string | 必須 | 固定 `"hexnote-chart/1"`。未知のフィールドは無視、`/2` 以降は拒む |
| id | string | 必須 | `"sha256:…"`（§1.9）。保存・履歴・リプレイの鍵 |
| name | string | 必須 | 曲名 |
| bpm, beats | number | 任意 | 先頭テンポと長さ拍の写し。m1' の後方互換 |
| notes | Note[] | 必須 | §1.3。beat 昇順、同拍は midi 昇順 |
| pulse | Pulse | 必須 | §1.4 |
| sync | Sync | 必須 | §1.5。動画なしでも `sources: []` |
| variants | Variant[] | 任意 | §1.6。無ければ読み込み時に既定配列で生成 |
| metrics | Metrics | 任意 | §1.7 |
| source | Source | 必須 | §1.8 |
| created, generator, ext | string, string, object | 任意 | ISO 8601、生成器名、拡張の置き場（§1.11） |

### 1.3 notes

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| midi | int 0–127 | 必須 | 折り畳む前の原曲の音高 |
| beat | number ≥ 0 | 必須 | 拍。`1/pulse.resolution` の刻みに丸める（pipeline-05） |
| dur | number > 0 | 必須 | 長さ（拍）。ホールド扱いの閾値は spec |
| hand | `"L"`/`"R"` | 任意 | 手。m5 の「60 を境」は推定なので `handGuess: true` を併記 |
| vel | int 1–127 | 任意 | 強さ。既定 80 |
| finger, lyric | int 1–5, string | 任意 | 運指（pipeline-10）、歌詞モーラ（far-15）。§1.11 |

和音は同じ beat の複数 Note。順序規約により配列添字が安定した番号になり、variants[].keys がそれを参照する。

### 1.4 pulse

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| resolution | int | 必須 | 1 拍の分割数。既定 240（bmson、map §2 C） |
| tempo | {beat, bpm}[] | 必須 | テンポ列。先頭は beat 0 |
| timeSig | {beat, num, den}[] | 任意 | 拍子。小節線と拍の重み（pipeline-04） |

譜面秒＝区間ごとの 60/bpm×拍の累積（Falling Nikochan の方式を仕様だけ参考、map §2 C）。読み込み時に ms 表へコンパイルし、プレイ中は拍を見ない。

### 1.5 sync

critic-09（1 譜面に複数の動画 ID）を取り込み、m5 の単一オブジェクトを配列にする。

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| sources | SyncSource[] | 必須 | 空なら動画なし専用。先頭が既定 |
| .kind | `"youtube"`/`"audio"` | 必須 | audio は同梱・自前音源（`file` にキャッシュ内の名） |
| .videoId | string | youtube で必須 | 11 文字の ID のみ |
| .offset | number（秒） | 必須 | 拍 0 の動画時刻（m5 と同じ） |
| .rate | number | 必須 | 動画 BPM÷譜面 BPM。tempo 全区間に一様に掛ける（m5 と同じ） |
| .begin | number（秒） | 任意 | 再生開始位置（ytBegin 相当）。既定 offset−2 |
| .label | string | 任意 | 「公式 MV」「ピアノカバー」 |
| .measured | object | 任意 | `{residualMs, elapsedS, attempts, at}`。m5 の stats の同期計測をここへ |

onError（埋め込み不可・削除）なら次の source、尽きれば動画なしモード（§2.4）。

### 1.6 variants

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| id | string | 必須 | `"ableton/2/octave"`＝配列/上限/折り畳み。スコアの集計単位（a-02、決定 #8） |
| layout | string | 必須 | `ableton`（決定 #1 の既定）, `vmpk`, `genshin`, `wicki`（対照）, `harmonic`, `custom`。m5/m1' の `garage`→ableton、`fl`→vmpk は別名として受ける |
| limit | int 2–4 | 必須 | 同時押し上限（決定 #7） |
| fold | `"octave"`/`"cut"`/`"nearest"` | 必須 | 折り畳み 3 択（pipeline-07） |
| keys | (string\|null)[] | 必須 | notes と同じ長さ。KeyboardEvent.code か、落とした音は null。鳴る音高は配列表 `map[code]` で引く |
| metrics, stats | object | 任意 | この版の指標と `{srcNotes, droppedFold, movedFold, droppedThin, warnings[]}` |
| custom | object | 任意 | layout が custom のときの code→midi 表（input-07） |

履歴・ランキングは (id, variant id) の組で集計する（決定 #8）。

### 1.7 metrics（a-05）

`{notes, seconds, density, leap, leapMax, chord, chordMax, rowCross, level}`。density＝音/秒、leap＝連続セル間の六角距離（cube 座標、pipeline-10）、chord＝和音率、rowCross＝段またぎ率。level（1〜10）の式は spec、閾値は利用者データ待ち（pipeline-04 の「反する」）。

### 1.8 source

| フィールド | 型 | 必須 | 意味 |
|---|---|---|---|
| kind | `"bundled"`/`"midi"`/`"text"`/`"editor"` | 必須 | 同梱／MIDI 持ち込み／キー文字譜（far-14）／エディタ |
| rights | `"pd"`/`"own"`/`"licensed"`/`"private"` | 必須 | 権利印 4 種（pipeline-15）。private は共有・索引に出せない |
| license | {id, holder, url} | private 以外で必須 | SPDX 風: `CC-BY-4.0`, `CC0-1.0`, `PD`。url は出典 |
| title, composer, arranger | string | 任意 | 原曲情報 |
| origin | {file, importedAt, transcribed} | 任意 | 持ち込み元、日時、AI 採譜なら true |

同梱曲は rights を pd／own に限る（決定 #0）。

### 1.9 ハッシュ

- `id = "sha256:" + SHA-256(canonical JSON of {format, notes[midi,beat,dur], pulse.resolution, pulse.tempo})`。小数 4 桁丸め、キー順固定、空白なし。
- 含めない: sync・variants・metrics・source・name（pipeline-03、social-01）。
- 同期を外すと「同じハッシュで演奏が変わる」問題（social-01）が残るので、履歴とリプレイは使った sources[i] の offset/rate を自分のヘッダに写す。

### 1.10 m5 の出力と m1' の読み込みの差分

| 項目 | m5 | m1' | 製品での埋め方 |
|---|---|---|---|
| notes | 折り畳み・間引き後 | midi/beat/dur のみ | notes は原曲の音高譜、折り畳み結果は variants[].keys |
| keys/layout/limit | トップレベル | 未使用 | variants[0] に畳む。m1' は keys を使って描く |
| sync と同期計測 | 単一＋説明文、stats に混在 | videoId 表示のみ | sources[] と sources[].measured。説明文は外す |
| pulse.tempo | 出す | bpm だけ | 読み込み側でテンポ列をコンパイル |
| source/id | 無い | 無い | 必須化。m5 に権利印の UI（screens） |

### 1.11 拡張の余地

- 手・運指: notes[].hand/finger。両手分担（input-11）は variants[].zones に左右の code 集合。
- 歌詞: notes[].lyric と `ext.lyrics: [{beat, text}]`。24 px セルに 2 段は入らない（far-15）。
- 複数動画: §1.5 で済み。テンポが違う動画は rate 1 本で合わない（critic-09）ので将来 ext に tempoMap（拍→秒の折れ線）。
- 修飾キーのレイヤ・曲中オクターブ移動（input-06/12）は静的な keys で表せず、keys 要素を `{code, mod}` にする `/2` 案件。

### 1.12 例（抜粋）

```json
{"format":"hexnote-chart/1","id":"sha256:3f…","name":"きらきら星",
 "notes":[{"midi":60,"beat":0,"dur":1},{"midi":67,"beat":2,"dur":1}],
 "pulse":{"resolution":240,"tempo":[{"beat":0,"bpm":100}]},
 "sync":{"sources":[{"kind":"youtube","videoId":"XXXXXXXXXXX","offset":1.82,"rate":1}]},
 "variants":[{"id":"ableton/2/octave","layout":"ableton","limit":2,"fold":"octave","keys":["KeyA","KeyG"]}],
 "source":{"kind":"bundled","rights":"pd","license":{"id":"PD"}}}
```

## 2. システム構成

### 2.1 モジュールと境界

| モジュール | 責務 | 持たないもの |
|---|---|---|
| 入力層 | keydown/up を `{code, tsPerf, source}` に正規化。repeat 捨て・IME 無視・blur で全離し（input-09）。MIDI・タッチは後（input-10） | 判定・時刻変換 |
| 時計・同期層 | 唯一の ClockSource（§2.3）。プレイヤーの時刻読みはここだけ | 描画・判定 |
| 判定層 | ms 表と入力列から判定・連続採点・離し窓。値は spec | 画面。結果は出来事の配列 |
| 描画層 | Canvas 2D、rAF 1 本。格子・落下・鍵盤図・塊／殻・辺ヒント | 入力。曲時刻と判定結果だけ受ける |
| 譜面層 | 読み書き・検証・ms 表へのコンパイル・variants 生成（折り畳み→間引き→指標） | 発音 |
| 練習層 | 待ち・ループ・テンポ段・足場外し・自力率（learning-01/02/03/05） | 時計の直接操作（停止・seek・レートは要求） |
| 保存層 | §2.5 の鍵で読み書き。スキーマ版を持つ | 他層の型 |
| 音源層 | Web Audio。合成音→Salamander。打鍵音・ガイド音・メトロノーム・動画なしの演奏（tech-10） | 時計（変換は時計層から受ける） |
| YouTube 連携層 | IFrame API の生成・状態・onError・規約（オーバーレイ禁止、200×200、報酬禁止、map §3）。ランキング対象外の印（決定 #5） | 時刻の補間 |
| 計測層 | §4。出来事を匿名で端末内に貯める | 送信 |

### 2.2 データフロー

1. 起動: 保存層から設定・校正・上限・足場外しを読む。初回は導線（決定 #9、a-03）。
2. 選曲: 譜面層が同梱＋IndexedDB の一覧と level を出し、選んだ譜面を ms 表へコンパイルし、端末の上限と配列に合う variant を選ぶ（無ければ生成）。
3. プレイ: YouTube 層がプレイヤーを作り時計層が同期。入力層→時計層（曲時刻へ写像）→判定層→描画・音源・計測層。
4. 結果: 精度%・ランク（入門者）、ゲージ・フルコンボ（音ゲー向けのみ、決定 #8）、和音統計、自力率（決定 #6）。
5. 保存: 履歴、リプレイ（social-01）、校正の提案（段 2）、計測の行。

### 2.3 時計の一本化

- 主時計は performance.now。曲時刻 t＝a·now＋b の直線を時計層が一本だけ持つ（tech-01）。
- 動画時刻 getCurrentTime（約 15 ms 刻み、逆行 ≤10 ms、seek 後 210〜260 ms、map §4）は補正源: 直近 2 秒窓（128 サンプル）の最小二乗で a・b を更新、負の増分は捨て、250 ms 超の飛びは再同期（m3 の実装値）。a は実効 playbackRate の推定。
- Web Audio は発音のみ。getOutputTimestamp で performance.now↔AudioContext.currentTime を対応させ、25 ms 周期・100 ms 先読みで予約（map §2 F）。動画なし・同梱曲でも判定時計は performance.now 単独。
- 入力は Event.timeStamp（Chrome 0.1／Firefox 1 ms、指紋対策で 16.7 ms、map §2 F）を同じ直線で写す。校正オフセットは判定層で加える。

### 2.4 プレイの状態機械

| 状態 | 入る条件 | 出る先 |
|---|---|---|
| 待機 | 選曲直後。プレイヤー準備待ち | 再生→同期中 |
| 同期中 | 開始・seek・再開・バッファ（状態 3）・飛び検出の直後。300 ms 判定猶予と帯（決定「時計」、a-01） | 残差が収まれば再生。時計 2 秒停止で動画なし |
| 再生 | 直線が有効で動画が進行 | 停止→一時停止、曲末→終了、練習の停止→待ち |
| 待ち | 音待ち／フレーズ待ちで止めた状態（learning-01） | 正しい入力→同期中（250 ms の空白） |
| 一時停止 | 操作・visibilitychange・PAUSED | 再開→同期中 |
| 動画なし | sources が尽きた／時計 2 秒停止／オフライン／同梱曲 | 自前音源で進行。2 秒以内に動画が戻れば同期中 |
| 終了 | 最終ノート＋余白 1.2 秒（m1' の現状値） | 結果→保存→待機 |

動画なしのスコアは履歴に `clock: "novideo"` を付け、動画あり（15 ms 刻み）と分けて集計する（critic-09 の「反する」）。

### 2.5 保存するもの

| もの | 置き場 | 鍵／形 | 備考 |
|---|---|---|---|
| 設定（プロファイル、配列、ヒント、ラベル、透明度の手動値、ハイスピード） | localStorage | `hexnote.settings`（v:1） | 同期読み |
| 校正（段 1 メトロノーム、段 2 YouTube） | localStorage | `hexnote.calibration` | SD<30 ms のときだけ適用（決定「校正」） |
| 同時押し上限（診断 10 組の結果） | localStorage | `hexnote.device`（m1' の `hexnote.limit` を取り込む） | 外付け交換で陳腐化→再診断（input-05） |
| 足場外し（音高ごとの透明度） | localStorage | `hexnote.fade`（m4 の `hexnote-m4-practice` から移行） | 成績連動（決定 #6） |
| 譜面（持ち込み・同梱の写し・variants） | IndexedDB `charts` | 主キー id、索引 rights | private は書き出し以外に出さない |
| 履歴 | IndexedDB `results` | `{chartId, variantId, clock, at, acc, rank, counts, syncUsed}` | ランキング対象は rights≠private かつ非 YouTube（決定 #5） |
| リプレイ／計測 | IndexedDB `replays`／`telemetry` | `{resultId, deltas[], codes[], header}`／§4 | 約 15 KB/3 分／リング 1,000 行 |
| 書き出し／取り込み | ファイル | `*.hexnote.json`、`*.hexreplay.json` | 共有の一次手段 |
| 同梱曲・ピアノ音源 | Service Worker キャッシュ | 版付き URL | YouTube 曲はオフライン再生しない（tech-16） |

Safari の ITP で 7 日で消え得る（social-01、未確認）ので PWA 化と書き出しを勧める（screens）。

## 3. 技術選定

| 領域 | 既定 | 後回し／代替 | 根拠 |
|---|---|---|---|
| 描画 | Canvas 2D、rAF 1 本 | PixiJS 8（MIT）は 1 画面 300 セル超で 60 fps を割ったら。WebGPU・Worker 分離（tech-08）は見送り | モック 7 本が Canvas 2D で足りた（report §6）。COEP と YouTube iframe の同居が未確認 |
| 音 | Web Audio 合成音 | Salamander V3（CC BY 3.0）30 音 mp3/ogg を smplr（MIT）か自前 Sampler。SF2 296 MiB は使わない | map §4。WebAudioFont は GPL |
| 入力 | KeyboardEvent.code＋getLayoutMap（Chromium・HTTPS） | Web MIDI（Safari 非対応、Chrome 124 から許可）は抽象層の後 | map §3 |
| 配布 | PWA | Tauri 2（MIT/Apache）は MIDI フォルダ監視・常時前面が要るとき | 決定「配布」、tech-16 |
| 採譜 | 入れない（決定 #0） | 私的モードを足すなら Basic Pitch TS 1.76 MB（Apache-2.0）だけ | map §4 |
| 構成 | TypeScript、依存最小、core（MIT）／assets（CC BY） | tools（AGPL 可）は別リポジトリ・別オリジン | business-15 |

ライセンスの線引き（決定「ライセンス」）:

- 取り込んでよい: MIT／MPL-2.0／Apache-2.0（osu!lazer・Etterna・StepMania・Quaver・Dancing☆Onigiri・smplr・PixiJS・Basic Pitch）。MPL は改変ファイルを公開。
- 仕様だけ参照（コードを写さず自前で書く）: Falling Nikochan（AGPL、ytBegin/offset・判定値）、Bemuse（AGPL、Calibrate）、Specy（AGPL、折り畳み選択肢）、beatoraja（GPL、KEYBOARD 窓・LN 離し窓）、WebAudioFont・Essentia.js。参照元と数値は設計書に書き、コードには書かない。
- 資産: Salamander の帰属表示を設定画面と README に。osu! のリソース（CC BY-NC）は使わない。license-checker は「写し」を検出しない（business-15）ので、レビュー項目に「AGPL/GPL 実装を開いて書いたか」を置く（worktable）。

## 4. 計測の仕組み

目的は遅延・ジッタ・判定の質・離脱を端末内で集め、判定窓・同期猶予・導線の段を利用者データで決め直すこと。送信は後（opt-in、匿名化は risks）。IndexedDB `telemetry` にリング 1,000 行、個人を指す値は持たない。

- play: chartId、variantId、clock、profile、UR、早遅ヒストグラム（10 ms 刻み）、精度%、NEAR 率、再同期回数、動画なしへ落ちた回数、入力遅延の中央値（PerformanceEventTiming は既定で 104 ms 以上のみ: feel-08 要確認）、フレーム間隔 SD、時計残差 SD。
- calib: 段 1 の 24 打 SD と採否、段 2 の提案値と採否。
- onboard／quit: 導線の各段の到達・所要秒・離脱した段（a-03）。曲の何%で止めたか、直前 10 秒の MISS 数。
- device: UA の大分類、画面 px、refresh 推定、同時押し上限、getLayoutMap の可否。

設定画面の「計測盤」（feel-08）で自分の行を見て JSON で書き出せ、当面はそれが送信の代わり。動画 ID と視聴時間を報酬や順位に結び付ける集計はしない（決定 #5）。

## 5. 確定事項との衝突

反する設計は無い。提案として留めるもの:

- 譜面版 id に fold を含めた（決定 #1 は「配列＋上限」）。fold が違えば押す音符が違うため。不要なら fold を octave に固定して id から外す。
- 動画あり／なしで履歴を分ける `clock` 印（§2.4）。決定 #8 の「同じ譜面版の中」をさらに割る提案。
