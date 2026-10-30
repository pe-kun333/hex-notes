# 試験の台帳

モックには試験節・assert が無い（docs/planning/m0-kickoff.md §0）。各手順の「期待値（手計算）」をここに写し、単体試験に落としたら状態を更新する。状態は **未検算**（手計算のみ）／**仮**（出どころが本書以外に無い）／**検算済**（試験が通った）。行番号は手順書の「元」の欄のとおり（m1'＝m1-geometry）。

| 手順 | 対象 | 入力 | 期待値 | 出所（モック・関数・行） | 状態 |
|---|---|---|---|---|---|
| 1 | ライセンス式 `isAllowed` | `(MIT AND GPL-3.0)`、`MIT*`、`(MIT OR CC0-1.0)`、`UNKNOWN` | 止まる／通る／通る／止まる | decisions #16、ADR 0002、手順書 §1.6（推定印 1 件の代替） | 検算済（tests/unit/licenses.test.ts） |
| 1 | 帰属 `checkAttribution` | 6 項目の行が無い・値が空・「未同梱」・URL 無し | 項目欠けで fail | 手順書 手順 10 の期待値、CC BY 3.0 §4(b) | 検算済（tests/unit/licenses.test.ts） |
| 2 | ms 表 `mstable` | tempo [{beat 0, 120}, {beat 4, 60}] | 拍 4 ＝ 2,000 ms | m5 `makeClock` L317–321（`b2s`） | 検算済（tests/unit/chart/mstable.test.ts） |
| 2 | ms 表 `mstable` | 同上の tempo の拍 6／3,000 ms、3 区間 [{0,120},{4,60},{8,240}] の拍 12 | 4,000 ms／拍 5、7,000 ms（区間の開始 ms は 0・2,000・6,000） | m5 `makeClock` L317–321 の累積（手計算） | 検算済（tests/unit/chart/mstable.test.ts） |
| 2 | ms 表 `mstable` | tempo [] | RangeError（既定 120 は持たない。バリデータの `empty` と同じ） | 手順書 手順 2 の手直し「bpm 既定 120 → pulse.tempo 必須」 | 検算済（tests/unit/chart/mstable.test.ts） |
| 2 | バリデータ | format `hexnote-chart/2` | 拒否 | 設計 §3.2 | 検算済（tests/unit/chart/validate.test.ts） |
| 2 | バリデータ | notes [{64@1}, {60@1+1e-9}]／notes []／layout `constructor` | 同拍 midi 昇順の違反（1/resolution の目盛りで比較）／`empty`／別名を引かず `enum` | 設計 §3.2（notes 1 つ以上・重複不可は本書以外に無い） | 仮（tests/unit/chart/validate.test.ts） |
| 2 | ハッシュ `hash` | `abc`／空文字／`日本語` の SHA-256 | ba7816bf…15ad／e3b0c442…b855／77710aed…e0a5 | FIPS 180-4 の既知値 | 検算済（tests/unit/chart/hash.test.ts） |
| 2 | ハッシュ `hash` | 見本 {notes 60@0 dur 1, 64@1 dur 0.5, 67@1.5 dur 0.33333; tempo [{0,120},{4,60}]} の canonical JSON | 固定文字列（dur 0.3333）、id `sha256:3ba25045…2860` | 設計 §3.3、丸めは m5 `r4` L416 の式（Math.round、§7-6 を四捨五入に決定）。node:crypto で別計算 | 検算済（tests/unit/chart/hash.test.ts） |
| 2 | ハッシュ `round4` | 1.00005／0.00015 | 1.0001／0.0001（JS の 2 進丸め。他言語も同じ式で） | m5 `r4` L416 | 検算済（tests/unit/chart/hash.test.ts） |
| 2 | 見本譜面 `fixture` | tests/fixtures/charts/minimal.hexnote.json（きらきら星 7 音、bpm 100） | normalize→validate 0 件、id `sha256:f33acca6…53a7`、最後の音の終わり 4,800 ms、keys が ableton の表と合う | 設計 §3.2・§3.3、node:crypto で別計算 | 検算済（tests/unit/chart/fixture.test.ts） |
| 2 | 検査ツール `validate-charts` | フィクスチャ／id 1 文字改変／空ディレクトリ／未ソート／未丸め beat・別名 layout／表に無い鍵／dir がファイル | exit 0／1（`id`）／0／1（`order`、`--lenient` は 0）／1（`not_normalized`）／1（`unknown_key`）／2 | 手順書 §1.3 L57（CI の並び）、手順 2 | 検算済（tests/unit/tools/validate-charts.test.ts） |
| 2 | 配列表 `presets` | wicki の KeyZ／KeyA | 48／53 | m2 `LAYOUTS` L219 | 検算済（tests/unit/layout/presets.test.ts） |
| 2 | 配列表 `presets` | ableton の KeyA／KeyW | 60／61 | 設計 §2.1 | 検算済（tests/unit/layout/presets.test.ts） |
| 2 | 配列表 `presets` | 表の総数／音域 | ableton 17・vmpk 34・genshin 21・wicki 40／60–76・48–76・48–83・48–81 | spec 草稿 §1、設計 §2.1 | 検算済（tests/unit/layout/presets.test.ts） |
| 2 | 配列表 `presets` | vmpk の 60 の逆引き／`resolveLayoutId('constructor')` | [KeyQ, Comma]（Q 段が先）／null | 設計 §2.1「60 以上は Q 段側（仮）」 | 検算済（tests/unit/layout/presets.test.ts） |
| 3 | 変換器の入力 `m5BuildVariant` | canon、garage（ableton）、octave、limit 2 | out 34、dropThin 17（src 51、dropFold 0、moved 24） | m5 `buildVariant` L324–363。元のコードを評価した値と移植の値で検算（手計算と一致） | 検算済（tests/unit/chart/m5-port.test.ts・convert-m5.test.ts） |
| 3 | 間引き `buildVariant` | 和音 [60, 64, 67, 72]、ableton、limit 2／3／4 | 残る 67・72／64・67・72／全部（低い音から落とす） | 設計 §2.4 | 検算済（tests/unit/chart/variants.test.ts） |
| 3 | 変換後 `convertM5` | 同上の曲 | notes 51（原曲音高、vel 102）、variants[0].id `ableton/2/octave`、keys 長 51 で null 17（51 個を固定値で照合）、id `sha256:ee99a593…373b`（m1' の canon と同じ。keys は variants.ts の版と 24 か所違う、decisions #22） | 設計 §3.3、kickoff 手順 3。id は node:crypto で別計算。keys は元のモックの out[].orig・key と突き合わせてから固定 | 検算済（tests/unit/chart/convert-m5.test.ts） |
| 3 | m5 の写し `m5-port` | twinkle・canon・手作りの曲・全 128 音の曲 × 5 配列 × 3 折り畳み × 上限 2〜4、fmtJSON（同期なし／計測済み） | 元のコードの戻り・文字列と全て同じ。PRESETS の map は挿入順まで同じ。m1' の 6 曲の notes も同じ | m5 L206–429、m1' mel・SONGS L244–257（行番号で切り出して評価） | 検算済（tests/unit/chart/m5-port.test.ts） |
| 3 | m5 の JSON 出力との照合 | canon・twinkle の m5 JSON（tests/fixtures/m5-json） | 鍵のある音を拍ごとに並べると、notes[i] を畳んだ音高・keys・hand が同じ。metrics・stats も同じ | m5 `buildJSON` L417–424・`fmtJSON` L425–429 | 検算済（tests/unit/chart/convert-m5.test.ts） |
| 3 | 折り畳み `foldPitch` | 全 128 音 × 4 配列 × 3 折り畳み | m5 の折り畳みと同じ（例: ableton octave 100 → 76、genshin nearest 61 → 62、genshin octave 61 → 落とす、wicki octave 78 → 66・80 → 68（下向き探索）） | m5 `buildVariant` L329–337。下向き探索 L334 は全音の曲で元のコードとも突き合わせた | 検算済（tests/unit/chart/variants.test.ts） |
| 3 | 間引き・重複の比べ方 | [57, 61, 64]／[48, 60]、ableton、octave、limit 2 | 61・64 が残る／60 が残る（原曲音高で高い方。m5 は 57→69・64／48） | decisions #20（本書以外に無い） | 仮（tests/unit/chart/variants.test.ts） |
| 3 | 同音の鍵 `defaultKeyOf` | vmpk 60〜64、wicki 58／65 | KeyQ・Digit2・KeyW・Digit3・KeyE、KeyN／Digit2 | 設計 §2.1（vmpk のみ）、decisions #21 | 仮（tests/unit/chart/variants.test.ts） |
| 3 | 鍵と音の対応 `convertM5` | m5 の 2 曲＋m1' の 6 曲 × 4 配列 × 3 折り畳み × 上限 2〜4（288 件） | 鍵の音高 ＝ notes[i] を畳んだ音高、(tick, 原曲音高, 鍵) が m5 の out[] と同じ、同 tick の鍵は重ならず上限以下 | 設計 §3.3、decisions #22 | 検算済（tests/unit/chart/convert-m5.test.ts） |
| 3 | 変換の規則 | vel 0.3／1／省略、同 tick 同音、fl・harmonic、範囲外の limit・fold・division、目盛りに乗らない拍で同 tick に鍵が重なる・上限超え | 38／127／省略、最初の 1 つ、vmpk・拒否、RangeError、Error | decisions #22（kickoff の「parseMidi 0–127」を訂正） | 仮（tests/unit/chart/convert-m5.test.ts） |
| 3 | フィクスチャ `from-mel` | `--check`、`validate-charts tests/fixtures/charts` | 10 件が生成物と 1 バイトも違わない、9 件が strict で ✓ | 手順 3 の完了条件 | 検算済（tests/unit/tools/from-mel.test.ts） |
| 4 | 六角幾何 `hexDist` | Digit1–KeyW／KeyW–KeyA・KeyS／KeyQ–KeyS／Digit1–Slash | 2／1・1／2／12。40×40 の全組で対称・整数・三角不等式、tools/charts/m5-port.ts の写し（m5 L223）と同じ | m0 `hexDist` L169、`ROWS` L157–162 | 検算済（tests/unit/render/hex/hex.test.ts） |
| 4 | 6 方向 `HEX_DIRS` | KeyS の 右・右下・左下・左・左上・右上 | KeyD・KeyX・KeyZ・KeyA・KeyW・KeyE | m2 `DIRS` L231–238 | 検算済（tests/unit/render/hex/hex.test.ts） |
| 4 | 格子 `ROW_OFF` | A 段と Q 段の x 差／Slash の gx | 0.5／10.5 | m0 `ROW_OFF` L163 | 検算済（tests/unit/render/hex/hex.test.ts） |
| 4 | 鍵盤図 `grid` | ableton [1,2]／vmpk [0..3]／genshin [1,2,3] の幅・高さの係数。vmpk・R 28・左上 (100, 200) の Digit1・Slash の中心 | 10.5／3.5、11.5／6.5、11／5。(100 + hexW/2, 228)、(100 + 11·hexW, 354) | m0 `computeGeom` L220・L236、設計 §2.5 | 検算済（tests/unit/render/hex/grid.test.ts） |
| 4 | R と v `sizing` | 右列の箱 850×644（内側 1366×668）／764×596（1280×620）／577×490（1093×514@125%）× ableton・vmpk × T 1500／1000 | 係数 10.5/3.5・11.5/6.5。R 28 ×5、1093×vmpk は 27（R_w 27.36）。D 538／454／490／406／384／306.5。v(1500) 0.3587／0.3027／0.3267／0.2707／0.2560／0.2043、v(1000) ＝ D/1000。可視時間 上段／最下段（1.5 s）1578/1695・1593/2009・1586/1714・1603/2069・1609/1773・1632/2227、全段 ≥ T | 設計 §2.5（改訂）、decisions #24、m0 `computeGeom` L215–239、m1' L373。相談 A の表を node で別計算 | 検算済（tests/unit/render/hex/sizing.test.ts） |
| 4 | 境界と退避 `sizing` | vmpk・1.5 s。内側の高さ 514／513／488／487／470、幅 1000／900（高さ 668） | 514: R 28・D 300・v 0.2。513: R 27・D 305.5。488: R 24・D 300・limited なし。487: R 24・D 299・limited height・v 0.2・T 1495。470: D 282・T 1410。幅 1000: プレイヤー 356×200・R_w 28.92・R 28。幅 900: R_w 23.90・R 24・limited width | decisions #24（仮） | 検算済（tests/unit/render/hex/sizing.test.ts） |
| 4 | 奥行き `depthScale` | R 28 で最下段から 0〜3 段上／R 27 の 3 段上／R 24 | 1・0.96・0.9216・0.884736／24/27 ＝ 0.8889 に切り上げ／全段 1（奥行きが消える） | 設計 §2.2 L101、m1' `DEPTH_SCALE` L211 | 検算済（tests/unit/render/hex/landing.test.ts） |
| 4 | 着地 `landing` | vmpk・1366×668: 着地 1500 ms 前の数字段の y／一本線の y | 箱の上端 + R／鍵盤図の上端 − 0.8·R | 設計 §2.5、m0 `yLine` L238、m1' `targetY` L376 | 検算済（tests/unit/render/hex/landing.test.ts） |
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
