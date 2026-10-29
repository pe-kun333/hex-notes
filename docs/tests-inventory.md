# 試験の台帳

モックには試験節・assert が無い（docs/planning/m0-kickoff.md §0）。各手順の「期待値（手計算）」をここに写し、単体試験に落としたら状態を更新する。状態は **未検算**（手計算のみ）／**仮**（出どころが本書以外に無い）／**検算済**（試験が通った）。行番号は手順書の「元」の欄のとおり（m1'＝m1-geometry）。

| 手順 | 対象 | 入力 | 期待値 | 出所（モック・関数・行） | 状態 |
|---|---|---|---|---|---|
| 1 | ライセンス式 `isAllowed` | `(MIT AND GPL-3.0)`、`MIT*`、`(MIT OR CC0-1.0)`、`UNKNOWN` | 止まる／通る／通る／止まる | decisions #16、ADR 0002、手順書 §1.6（推定印 1 件の代替） | 検算済（tests/unit/licenses.test.ts） |
| 1 | 帰属 `checkAttribution` | 6 項目の行が無い・値が空・「未同梱」・URL 無し | 項目欠けで fail | 手順書 手順 10 の期待値、CC BY 3.0 §4(b) | 検算済（tests/unit/licenses.test.ts） |
| 2 | ms 表 `mstable` | tempo [{beat 0, 120}, {beat 4, 60}] | 拍 4 ＝ 2,000 ms | m5 `makeClock` L317–321（`b2s`） | 未検算 |
| 2 | バリデータ | format `hexnote-chart/2` | 拒否 | 設計 §3.2 | 未検算 |
| 2 | 配列表 `presets` | wicki の KeyZ／KeyA | 48／53 | m2 `LAYOUTS` L219 | 未検算 |
| 2 | 配列表 `presets` | ableton の KeyA／KeyW | 60／61 | 設計 §2.1 | 未検算 |
| 3 | 変換器 `convert-m5` | canon、ableton、octave、limit 2 | out 34、dropThin 17 | m5 `buildVariant` L324–363 | 仮 |
| 3 | 間引き | 和音 [60, 64, 67, 72]、limit 2 | 残る 67、72（低い音から落とす） | 設計 §2.4 | 未検算 |
| 3 | 変換後 | 同上の曲 | notes 51、id `ableton/2/octave`、keys 長 51 で null 17 | 手計算 | 仮 |
| 4 | 六角幾何 `hexDist` | Digit1–KeyW | 2 | m0 `hexDist` L169、`ROWS` L157–162 | 未検算 |
| 4 | 格子 `ROW_OFF` | A 段と Q 段の x 差 | 0.5 | m0 `ROW_OFF` L163 | 未検算 |
| 4 | R と v `sizing` | 舞台高 668（1366×768@100%）／620（1280×720）／514（1093×614@125%） | R 28、v 0.30／0.27／0.20（514 は境界） | 設計 §2.5 L126 | 未検算 |
| 4 | 奥行き `rowScale` | Q 段（最下段から 2 段上） | 0.96²＝0.9216 | 設計 §2.2 L101、m1' `DEPTH_SCALE` L211 | 未検算 |
| 5 | 入力 `keyboard` | 同じ code の 2 度目の keydown | 無視 | m1' L524–533、設計 §2.8 | 未検算 |
| 5 | 入力 `focus` | blur | 押下集合が空＋Pause 要求 | m1' L524–533、設計 §2.8 | 未検算 |
| 5 | 入力 `ime` | keyCode 229 | 入力列に入らず帯 1 件 | 設計 §2.8 L141、§5.1 M0-04 | 未検算 |
| 6 | 和音 `isConnected` | [A, S, D] | true | m1' `drawNotes` L406–427、m2 `components` L327–328 | 未検算 |
| 6 | 描画コマンド列 | 6 曲×2 配列の初期フレーム | 全図形が落下域＋鍵盤図の矩形内 | 設計 §2.8 L139、§5.1 M0-03b | 未検算 |
| 6 | 「同じ絵」 | 6 曲×2 配列の初期フレーム | コマンド列スナップショット一致 | 手順書 手順 6 | 未検算 |
| 7 | 時計 `lsq` | 15 ms 量子化の 121 点 | 傾き 0.99986 | 手計算（本書以外に根拠なし。§7-18） | 仮 |
| 7 | 飛び `jump` | 残差 +300 ms／+200 ms | 飛び／0（飛びでない） | m3 `clk.feed` L324–350 | 未検算 |
| 7 | 停止検知 `stall` | 可視・PLAYING・3 秒凍結 | 2,000 ms で停止検知→pauseVideo 要求→500 ms 以内に PAUSED で動画なしへ切替 | 設計 §2.6 L131、決定 #11、m3 `frame` L599–610 | 未検算 |
| 7 | 停止検知 `stall` | `pauseLatencyMs: never`（広告模擬）／`visible: false` | 切り替わらない／検知しない | 設計 §2.6、§5.1 M0-05 | 未検算 |
| 8 | 判定窓 `windows` | 入門者、遅れ側 | 24／100／180 × 1.3 | 設計 §2.3、m1' `windows` L270 | 未検算 |
| 8 | 判定 `judge` | 入門者、遅れ側 −30 ms／−235 ms | perfect／miss（180×1.3＝234 の外） | m1' `windows` L270 ×1.3、設計 §2.3 | 未検算 |
| 8 | ランク `rankOf` | accuracy 0.5 | C | m1' `accuracy／rankOf` L356–357、設計 §2.3 | 未検算 |
| 8 | 足場外し `labelVisible` | α 0.2／0.19 | hint／self | m4 `labelVisible` L315、`fadeOf` L314 | 未検算 |
| 8 | 精度% | 人工ジッタ SD 0→5→10 ms（手順 13 で測る） | 精度%が単調に下がる | 設計 §5.1 M0-06、手順書 手順 13 | 未検算 |
| 9 | 段ずれ `physOffFor` | [0.5, 0.25, 0.5] | [0, 0.5, 0.75, 1.25] | m2 `physOffFor` L208、ADR 0001 | 未検算 |
| 9 | 位相 `phase` | ANSI×ableton／ANSI×vmpk | mid／ok | m2 `updatePhase` L455、`gaps` L212・L214（閾 0.125／0.375 は仮、§7-13） | 未検算 |
| 10 | 合成音 `synth` | midi 69 | 440 Hz | m5 `playNoteAt` L443 | 未検算 |
| 10 | 帰属検査 | ATTRIBUTION.md の項目欠け | `npm run licenses:files` が fail | 手順書 手順 10（手順 1 の行で検算済） | 検算済 |
| 10 | 初回読込 | `npm run build && npm run size` | 実測を docs に記録、≤ 10 MB | 決定 #10 | 未検算 |
| 11 | 上限の丸め | '7' | 4（2..4 に丸める） | m1' L269（2..6 を直す）、決定 #7 | 未検算 |
| 11 | 保存の失敗 | setItem が例外 | storageFail 1 回、処理は続く | 設計 §4.1、§4.3 | 未検算 |
| 12 | 統計 `sd` | [1, 2, 3, 4] | 1.2909944 | m3 `sd` L248 | 未検算 |
| 12 | リング `ring` | 1,001 行目 | 先頭が消える（1,000 行） | 設計 §4.3、手順書 手順 12 | 未検算 |
| 13 | ハーネス `run` | 同じ種（mulberry32） | 差分 0 | m3 `mulberry32` L244、`gauss` L245 | 未検算 |
| 13 | ハーネス `jitter` | SD 0／5／10 ms | SD 0→5→10 で precision が単調に下がる | m3 `gauss` L245、手順書 手順 13 | 未検算 |
| 13 | 差分表 | 6 曲×2 プロファイル×2 配列×3 SD | 72 行 | 手順書 手順 13 | 未検算 |
