# M0 着手手順書（ヘクサノート）

起草 2026-10-30、改訂 2 回目（反論 2 観点を反映）。前提は decisions.md #0〜15 と design.md §2〜§5。食い違うときは設計書と決定を正とし、モックの値は「モックの値 → 設計書の値」と書く。根拠はモック名・部品名・行番号（m1'＝m1-geometry）。推測は「仮」。

## 0. 前提と読み方

目的: 7 本のモックから部品を層ごとに切り出し、§4.1 の層構成で M1 に渡す。製品画面は作らない。各手順の後に開発ページ（`src/app/dev/`）が動く状態を保つ。m6-flow.html は M1 の画面で使い、M0 では読まない。

**モックに試験節・assert・自己検査は無い**（m5 L613 の `window.__m5` は関数の公開だけ）。各手順の「期待値」行が唯一の出所で、手順 1 で `docs/tests-inventory.md` に入力・期待値・出所（モック名・関数・行）付きで写す。未検算の値は「仮」。

規模（§5 L198）: S＝1 日、M＝3 日、一人開発・並行なし、M0 の和は 31 日（§5.1 L200）。決定 #10〜15（decisions L36–41）: 初回読込 10 MB（仮）、動画ありで待ちを出さない、譜面版 id に fold、同梱曲に動画 ID なし、同期タップはダミー時計、#7 は M-3 で改訂しうる。

## 1. リポジトリの作成（手順 1、M0-01）

### 1.1 名前と構成

`hexnote`（仮）。短いパス（例 `C:\dev\hexnote`。長いパスで npm が止まった実測あり）。core＝`src/`（MIT）、assets＝`content/`（CC BY・PD。§4.5 L190）。`src/practice/`・`src/youtube/` は M2／M3 で足す。

```
hexnote/
├─ LICENSE  README.md（Salamander の帰属、権利表、「参照のみ」の節）
├─ package.json  tsconfig.json  vite.config.ts  index.html  .nvmrc  .gitignore
├─ public/                 manifest.webmanifest  icons/
├─ src/                    main.ts  app/dev/（開発ページ）  shared/（型）
│  ├─ chart/  layout/  input/  clock/  judge/  audio/  storage/  telemetry/  sw/
│  └─ render/hex/（03a）  render/canvas/（03b）
├─ content/charts/         RIGHTS.md  rights.json  pd/  cc/  own/
├─ content/samples/salamander/  LICENSE  ATTRIBUTION.md  manifest.json
├─ tools/                  licenses/  size/  salamander/  charts/  harness/（.ts、Node 24 の型剥がしで直接実行、enum 不使用）
├─ tests/                  unit/  fixtures/  harness/
├─ docs/                   design.md  decisions.md  references.md  tests-inventory.md  adr/
├─ spikes/coep-youtube/
└─ .github/                workflows/ci.yml  PULL_REQUEST_TEMPLATE.md  dependabot.yml
```

### 1.2 ツールとライセンス

| 名前 | 用途 | ライセンス |
|---|---|---|
| Node.js 24、npm 11 | 実行基盤。tools は `node tools/x.ts`（型剥がし） | MIT、Artistic-2.0（配布物でない） |
| TypeScript 7.0.2 | 型検査（tsconfig は node で書く） | Apache-2.0 |
| Vite 8.3.5、Vitest 5.0.5 | ビルド（`--manifest`）、単体試験（Node。DOM・Canvas なし） | MIT |
| license-checker-rseidelsohn 5.0.1 | ライセンス検査 | BSD-3-Clause |
| Prettier 3.9.10、vite-plugin-pwa 2.0.0、smplr 1.1.0 | 整形、SW、Sampler（代替は自前） | MIT |
| opus-tools | Salamander の FLAC→Opus。手元のみ | BSD-2-Clause |
| gh CLI、actions/checkout・setup-node・upload-artifact | リモート作成、CI、差分表の保存 | MIT |
| @types/node 24.19.2 | Node API の型（tools・tests） | MIT |

試験の環境: 描画層は「描画コマンド列を返す純関数」と「Canvas へ流す薄い関数」に分け、コマンド列を試験する。入力層は `{code, keyCode, isComposing, repeat, timeStamp}` のレコードを受け、DOM 無しで試す。画素差分・jsdom・ブラウザ runner は使わない（要るなら `@napi-rs/canvas`（MIT）、仮）。

Salamander V3（Alexander Holm、CC BY 3.0）は 30 音の間引き版だけ置く（§2.9 L148）。間引き＋Opus 変換は改変物なので帰属と改変表示が要る（手順 10）。

### 1.3 CI

1. checkout → setup-node → `npm ci`。
2. ライセンス検査（§5.1 L204）。`tools/licenses/check-deps.ts` が license-checker の `--json` を読み、SPDX の式を項ごとに評価する 2 段検査（配布物は decisions #16 の一覧だけ、開発依存は ADR 0002 の拡張一覧）。`--onlyAllow` は部分一致で `(MIT AND GPL-3.0)` が通るので使わない（2026-10-30 実測）。根拠は §4.5 L190（AGPL／GPL の排除）。BSD／ISC／CC0 等は decisions L29「MIT／MPL／Apache のみ」の拡張（仮、§7-4）。狭めるなら `MIT;Apache-2.0;MPL-2.0`。`(MIT OR Apache-2.0)` 型の式は一覧に列挙。資産: `tools/licenses/check-license-files.ts`（有無＋ATTRIBUTION.md の必須項目）、`tools/charts/check-rights.ts`（欠け 1 件で fail。M-9 L322）。
3. `tsc --noEmit` → `vitest run` → `node tools/charts/validate-charts.ts content/charts` → `vite build --manifest`。手順 1 では tools は空実装（曲が無ければ exit 0）、本体は手順 2。
4. `node tools/size/check-initial-load.ts dist`。初回読込（仮）＝index.html＋isEntry チャンク＋静的 imports＋css＋manifest＋合成音定義＋配列表＋チュートリアル曲 1 曲。除外＝dynamicImports、samples。閾 10,485,760 バイト（決定 #10）。
5. upload-artifact: `tests/harness/expected/` の差分表（手順 13）。PR テンプレ: 「参照元」欄と「AGPL／GPL の実装を開いて書いたか」（§4.5 L190）。

### 1.4 PWA の殻

manifest: name「ヘクサノート」（仮）、standalone、landscape（仮）、lang ja、icons 192・512 の PNG ＋ SVG（any）。SW（vite-plugin-pwa の generateSW、更新は prompt。ADR 0004）: precache＝殻＋チュートリアル曲、runtime cache-first＝`/content/charts/*.json`・`*.opus`、YouTube は素通し（§4.3 L182）。COEP は足さない（M0-11）。dev では無効。

### 1.5 初期化コマンド列（PowerShell 5.1 と Git Bash で同じ行）

```
mkdir hexnote
cd hexnote
git init -b main
npm init -y
npm pkg set name=hexnote type=module license=MIT
npm pkg set private=true --json
node -e "require('fs').writeFileSync('.nvmrc','24\n')"
node -e "require('fs').writeFileSync('.gitignore','node_modules\ndist\n')"
npm install --save-dev typescript@7.0.2 vite@8.3.5 vitest@5.0.5 prettier@3.9.10 license-checker-rseidelsohn@5.0.1
node -e "require('fs').writeFileSync('tsconfig.json',JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'ESNext',moduleResolution:'bundler',erasableSyntaxOnly:true,allowImportingTsExtensions:true},include:['src','tools','tests']},null,2))"
npm pkg set scripts.dev=vite scripts.build="vite build --manifest" scripts.typecheck="tsc --noEmit" scripts.test="vitest run" scripts.format="prettier --write ."
node -e "for (const d of ['src/app/dev','src/chart','src/layout','src/input','src/clock','src/judge','src/render/hex','src/render/canvas','src/audio','src/storage','src/telemetry','src/sw','src/shared','content/charts','content/samples/salamander','tools/licenses','tools/size','tools/salamander','tools/charts','tools/harness','tests/unit','tests/fixtures','tests/harness','docs/adr','spikes/coep-youtube','.github/workflows']) require('fs').mkdirSync(d,{recursive:true})"
node -e "require('fs').writeFileSync('src/main.ts','export {};\n')"
npx --yes license-checker-rseidelsohn --production --excludePrivatePackages --onlyAllow "MIT;Apache-2.0;MPL-2.0;BSD-2-Clause;BSD-3-Clause;ISC;CC0-1.0;Unlicense;0BSD"
npx --yes tsc --noEmit
git add -A
git commit -m "chore: skeleton (M0-01)"
gh repo create hexnote --private --source . --push
```

注意: `mkdir a b` は PowerShell で失敗する。`echo > file` は UTF-16 になる。`--onlyAllow` のセミコロンは npm scripts に入れない。tsc は .ts が無いと TS18003 で止まるので `src/main.ts` を先に作る。

実際に取った手順（2026-10-30、M0-01）: フォルダは利用者が選んだ `hex-notes`（空白を含むパスでも npm install・build は通った）。ファイルは直接作り、`npm install --save-dev typescript@7.0.2 vite@8.3.5 vitest@5.0.5 prettier@3.9.10 license-checker-rseidelsohn@5.0.1 vite-plugin-pwa@2.0.0 @types/node@24.19.2`。ライセンス検査は `--onlyAllow` でなく `tools/licenses/check-deps.ts`（`--json` を項ごとに評価する 2 段）。tools は空実装でなく検査 5 本（check-deps・check-license-files・validate-charts・check-rights・check-initial-load）＋純関数 3 本を最初から入れ、単体試験 15 件を付けた。検査は `npm run check` と `npm run build && npm run size`。ブランチは `m0-01-skeleton`（main は未作成）。gh CLI が無いのでリモートは利用者が GitHub で作り、`git remote add origin …` と `git push -u origin m0-01-skeleton` を手で行う。

### 1.6 最初のコミットと完了条件

LICENSE と `content/samples/salamander/LICENSE`。README の帰属と「参照のみ」一覧（Falling Nikochan・Bemuse・Specy・beatoraja・WebAudioFont）。`docs/design.md`・`decisions.md`・`references.md`（判定窓名・Wife3 の係数など参照の数値をコードから外して置く。§4.5 L190）・`tests-inventory.md`。ci.yml、PR テンプレ、`index.html`、`src/main.ts`、tools の空実装 4 本。完了条件: 「CI のライセンス検査が通る」（§5.1 L204）、push 済みで CI が実際に走る、デュアルライセンス 1 件と推定印 1 件を含めて通る。

## 2. 移植の順序

軸は §5.7 L288 の M0-02→03a→03b→06。入力層（M0-04）は前提が 01 だけ（§5.1 L208）なので手順 4 の直後に置き、以後の開発ページを手で弾けるようにする。手順 5・7・10・11 は人手があれば M0-02 と同時（§5.7 の 04／05／08／09）。一人開発では番号順。

| 手順 | M0 id | 規模 | 累積日 | 前提 |
|---|---|---|---|---|
| 1 | M0-01 | S | 1 | なし |
| 2 | M0-02 前半（型・バリデータ・配列表） | M/2 | 2.5 | 1 |
| 3 | M0-02 後半（変換器・variants） | M/2 | 4 | 2 |
| 4 | M0-03a | M | 7 | 3 |
| 5 | M0-04 | M | 10 | 1 |
| 6 | M0-03b | M | 13 | 4、5（手弾き、仮） |
| 7 | M0-05 | M | 16 | 1 |
| 8 | M0-06 | M | 19 | 3、7 |
| 9 | M0-07（段ずれ・刻印・位相・退避） | M | 22 | 2、5、U-01 |
| 10 | M0-08 | M | 25 | 3 |
| 11 | M0-09 | M | 28 | 3 |
| 12 | M0-12 | S | 29 | 11 |
| 13 | M0-10 | S | 30 | 3、7、8、9 |
| 14 | M0-11 | S | 31 | なし |

§5.1 との差: 配列表（code→MIDI）は M0-07 の一部だが手順 3・4・6・13 が使うので手順 2 へ前倒し（§7-1）。M0-08・09 の前提は §5.1 どおり 02 全体（手順 3）。型だけ固定して 2 の直後に着手する案は「仮」。

共通の手直し: グローバル状態（m0 S、m1' state・GM、m2 state、m3 S、m4 state・heat、m5 state）を引数と戻り値に。DOM（`$`）と Canvas を層の外へ。時刻は秒 → ms（§3.2 L158）。garage→ableton、fl→vmpk（§3.2 L161）。Google Fonts → system-ui。**時刻源は注入**: `now` は引数か `NowFn`。`performance.now` の直呼びは `src/clock/clock-source.ts` と `src/app/` だけ（直呼びの元: m3 L367・L368・L418・L599、m1' L452、m4 L427–428）。手順 7・8・13 の試験は `now` を手で進める。

### 手順 2: /1 の型・バリデータ・ハッシュ・ms 表・配列表（M0-02 前半）

- 元: m5 `r4` L416、`FOLD_DESC` L242–246（そのまま）、`makeClock` L317–321（手直し）、`PRESETS` L226–241。m2 `LAYOUTS` L211–225。m4 `validateChart` L329–332、m1' `loadJson` L478–485（作り直し）。
- 作る: `src/shared/types.ts`（chart・results §4.3 L182・telemetry §4.6 L194 の型を初日に固定）、`src/chart/validate.ts`、`hash.ts`、`mstable.ts`、`src/layout/presets.ts`（4 配列の code→MIDI、使う段、別名 garage→ableton・fl→vmpk。harmonic／janko／auto は外す）、`tools/charts/validate-charts.ts` の本体。
- 手直し: dur 既定 1／0.5 → 必須（§3.2 L159）。bpm 既定 120 → pulse.tempo 必須。makeClock の秒 → ms 表、beat は 1/240 に丸め。format を見ない → `/1` 一致、`/2` 拒否。layout は 4 値以外を拒む（custom・zones は ext）。
- 期待値（手計算）: makeClock [{0,120},{4,60}] → 拍 4 ＝ 2,000 ms（m5 `b2s` L317–321）。`/2` は拒否。wicki KeyZ 48・KeyA 53（m2 L219）。
- 完了条件: 手順 3 と合わせ「m5 の出力が変換器の後に通る」（§5.1 L205）。

### 手順 3: m5 変換器・variants・6 曲の /1 化（M0-02 後半）

- 元: m5 `buildVariant` L324–363（TS へ移植）、`buildJSON` L417–424（照合用）、`EXAMPLES` L252、`mel` L249。m1' `buildChart` L275–304、`mel` L244、`SONGS` L246–257。m4 L340–371（作り直し）。
- 作る: `src/chart/convert-m5.ts`、`variants.ts`、`tools/charts/from-mel.ts`（m1' の 6 曲と m5 EXAMPLES を /1 に）、`tests/fixtures/`（6＋2 曲の /1 JSON と m5 の JSON 出力）。
- 変換器の入力は **m5 内部表現**（song＋移植した buildVariant の戻り `out[].orig` L338–339）。m5 の JSON（L418 は midi・beat・dur・hand だけ。vel・orig 無し）は入力にせず変換結果の照合に使う。vel は mel 経路 0.8 → ×127、parseMidi 経路 0–127 → そのまま、JSON 照合は既定 80（§3.2 L159）。parseMidi は M2-01 へ（§4）。→ 2026-10-30 訂正: m5 の parseMidi も L308 で `max(0.3, v/127)` の 0..1 にしているので、変換器は両経路とも 0..1 → round(×127)（decisions #22。元の速度を残すのは M2-01、§7-22）。
- 手直し: notes＝折り畳み後 → 原曲音高、折り畳みは keys（§3.1 L154）。トップレベル keys／layout／limit → variants[0]（§3.3 L166）。keys は落とした音を除く → notes と同じ長さ、null（§3.2 L161）。重複判定 round(beat×1000) → 1/240 丸め。同音選択（前音から hexDist 最小）→ keys が決める、既定「60 以上は Q 段側」（§2.1 L97、仮。生成器 variants.ts は全配列で「60 以上は上の段、未満は下の段」、変換器は m5 の選択をそのまま写す。decisions #21・#22）。間引き・重複は原曲音高で比べ高い方を残す（m5 は畳んだ後の音高。decisions #20）。警告 w4・rect → 外す。hand → ext.hand。
- 期待値: canon・ableton・octave・limit 2 → out 34、dropThin 17（buildVariant L324–363 の手計算）。[60,64,67,72] limit 2 → 67,72。変換後 notes 51、id `ableton/2/octave`、keys 長 51 で null 17（仮）。→ 2026-10-30 全て検算済（out 34・dropThin 17・moved 24 は m5 の元のコードを評価した値と移植の値で一致、他は製品のコードの試験で確認。譜面 id `sha256:ee99a593…373b` は m1' の canon と同じだが、keys は m5 の規則なので variants.ts の版と 24 か所違う（decisions #22）。台帳の手順 3）。
- 完了条件: 「m5 の出力が変換器の後に通る」（§5.1 L205）。
- 実際に取った手順（2026-10-30、手順 3、ブランチ `m0-03-convert-m5`）: m5 の忠実な写しは製品外の `tools/charts/m5-port.ts`（buildVariant・makeClock・mel・buildJSON・fmtJSON）に置き、元のモックを行番号で切り出して評価し突き合わせる試験（`tests/unit/chart/m5-port.test.ts`、3 曲×5 配列×3 折り畳み×上限 2〜4）を付けた。曲は `tools/charts/mel-songs.ts`、生成は `mel-fixtures.ts`、CLI は `from-mel.ts [outDir] [--check]`。フィクスチャは `tests/fixtures/charts/m1/`（6 曲×同梱 4 版）・`charts/m5/`（2 曲、変換器の出力）・`m5-json/`（m5 の JSON 出力、照合用）。npm scripts に `charts:fixtures`・`charts:fixtures:check`・`charts:validate:fixtures`（手で使う）を足した。CI では `npm test` の `tests/unit/tools/from-mel.test.ts` が同じ照合と strict 検査を行う。

### 手順 4: 六角幾何（M0-03a、M）

- 元: m0 `SQ3` L154、`ROW_OFF` L163、`hexDist` L169（そのまま）、`computeGeom` L214–250、`yLine` L238–241（手直し）。m1' `layout` L370（作り直し）、`targetY` L376、`rowScale／rotOf` L376–378、`DEPTH_SCALE` L211。m2 `DIRS` L231–238（そのまま）。
- 作る: `src/render/hex/hex.ts`、`grid.ts`、`landing.ts`（cell｜line の 2 方式。既定 cell、line は対照オプション。決定 #3）、`sizing.ts`。
- 手直し: 「セル 24 px」＝幅 hexW → 径 R（§2.5 L124）。hexW 上限 68 → R＝clamp(24, 28, min(R_w, R_h))。m0 BASE 0.5 px/ms 固定 → 1500 ms 固定で v＝(舞台高−32−k_n·R)/1500、v<0.2 で R を 24 へ、足りなければプレイヤー 356×200（L125）。DEPTH_SCALE 線形 → ×0.96/段、下限 max(0.88, 24/R)（§2.2 L101）。m0 perCell → 左右分割＋段別着地（§1.3 L79）。SCREENS → 3 視口（L126）。
- 期待値: hexDist Digit1–KeyW＝2（m0 L169、ROWS L157–162）。舞台高 668／620／514 で R 28、v 0.30／0.27／0.20。rowScale Q 段 0.96²＝0.9216。
- 完了条件: 「3 視口で §2.5 どおり」（§5.1 L206）。

### 手順 5: 入力層（M0-04、M）

- 元: m1' keydown／keyup／blur L524–533、m3 L647–655（timeStamp と入力遅延）、m4 L650–659・L674、m2 L409–416（手直し）。
- 作る: `src/input/keyboard.ts`（入力レコード → `{code, tsPerf}`）、`ime.ts`、`focus.ts`、`roles.ts`。開発ページ `src/app/dev/input-dev.ts`（押下集合と帯）。
- 手直し: Enter＝やり直し（m1' L528、m3 L654、m4 L654）→ ボタン決定（§2.8 L141）。m2 Escape＝和音消去 → 一時停止。IME 無視のみ → 無視＋帯イベント。禁止 code 無し → Backquote・KanaMode・Convert・NonConvert・CapsLock・Lang1/2・Meta・F1〜F12。blur 全離しだけ → ＋Pause 要求。m2 の修飾付き keyup 捨て → 捨てない。
- 期待値: 同じ code の 2 度目は無視。blur で押下集合が空。keyCode 229 → 入力列に入らず帯 1 件。
- 完了条件: 「IME 中の打鍵が入らず帯が出る」（§5.1 L208）。Firefox 列は M0 末（U-05）。

### 手順 6: 描画層（M0-03b、M）

- 元: m1' `hexPath／hexVerts` L379–380、`drawLabel` L384–388、`edgeToward` L381、`drawCell` L390–403、`drawNotes` L406–427、`drawEffects` L429–436（手直し）。m2 `hull` L329–331、`components` L327–328（そのまま）、塊／殻 L353–362。m4 判定文字 L547。
- 作る: `src/render/canvas/commands.ts`（描画コマンド列を返す純関数）、`flush.ts`（Canvas へ流す）、`cells.ts`、`hints.ts`、`chords.ts`、`feedback.ts`、`budget.ts`、`lowload.ts`。開発ページ `src/app/dev/play-dev.ts`（仮時計は m3 `nvTime` L351 相当、手順 7 で差し替え。手順 5 の keyboard.ts を繋ぎ手で弾ける）。
- 順序と確認点: 1 日目に cells.ts・landing.ts・play-dev を繋ぎ、6 曲×2 配列を段別着地で流して主担当が「位置で読めるか」を見る（§5.7 L288「M0-03b の途中」）。読めなければ一本線を既定に戻す提案を `docs/adr/` に書き、landing.ts の既定を line に切り替える（手順 4・6 のやり直しは最大 M×2、§7-2）。2〜3 日目に hints／chords／feedback／budget／lowload。
- 手直し: 辺ヒント白 4 px → 3 px 明度、距離 ≥2 で数字（§2.2 L101）。殻 破線 1.5 px・50%（m2 L361）／2 px・50%（m1' L414）→ 実線 1.5 px・35%。塊 色で上書き → 共有辺を消す。ヒット輪 1.85R・450 ms → 縁 2→6 px・120 ms（§1.3 L79）。段色 → 明度と記号（decisions L27）。追加（§2.2 L101、§2.5 L127、§2.8 L139、§1.3 L79）: VMPK 型の A–Q 間に 2 px 二重線、黒鍵 30°＋♯ 0.4·R、キー文字 0.95·R 太字・音名 0.62·R、R<26 で角の補助を消す、NEAR はセルが押したキーへ半分滑る（m1' drawEffects L431 の 160 ms を流用）、判定文字 600 ms（m4 L547）、閃光 1 秒 3 回・面積 25%、低負荷 3 段（閾は仮）。
- 期待値: isConnected [A,S,D] true（m1' L406–427）。コマンド列の全図形が落下域＋鍵盤図の矩形内。「同じ絵」＝6 曲×2 配列の初期フレームのコマンド列スナップショット一致。
- 完了条件: 「m1' の 6 曲が同じ絵。演出が領域外に出ない」（§5.1 L207）。

### 手順 7: 時計層（M0-05、M）

- 元: m3 `lsq` L321–323、`nvTime` L351（そのまま）、`clk` L324–350、`clockAt` L354–355、`resync` L376–382、`enterNoVideo／leaveNoVideo` L383–384、`frame` L599–610（停止検知の本体。手直し）、`dummy` L278–302（試験用に作り直し）、`startCal` L443–445（AC→performance 換算）。
- 作る: `src/clock/clock-source.ts`、`fit.ts`、`jump.ts`、`grace.ts`、`stall.ts`、`audio-bridge.ts`、`tests/unit/clock/dummy-video.ts`（state 列 PLAYING／PAUSED／BUFFERING、`pauseLatencyMs`（数値か never）、`visible`、15 ms 量子化、逆行、seek 凍結）。開発ページ `src/app/dev/clock-dev.ts`（残差グラフ）。
- 手直し: 停止検知「2000 ms 不変」だけ → 可視・PLAYING で 2 秒凍結→pauseVideo 要求→500 ms 以内に PAUSED なら切替、でなければ広告中（§2.6 L131、決定 #11）。呼び出し口は抽象。skipped「n.t < T+0.3」→「猶予内に窓が終わるノート」。判定窓を曲時間で比較 → 実時間で固定。direct／ema → 外す。非表示中は停止検知しない。
- 期待値: 15 ms 量子化 121 点 → 傾き 0.99986（仮、未検算）。jump +300 → 飛び、+200 → 0（m3 `clk.feed` L324–350）。stuck 3 s → 2,000 ms で停止検知。`pauseLatencyMs: never` では切り替わらない。`visible: false` では検知しない。
- 完了条件: 「傾き 1.00±0.01。非表示・広告模擬で切り替わらない」（§5.1 L209）。

### 手順 8: 判定・採点層（M0-06、M）

- 元: m1' `windows` L270、`GRADE_W` L317、`miss` L325、`accuracy／rankOf` L356–357（そのまま）、`judge` L318–324、`releaseHold` L327、`onKey` L330–341（作り直し）。m4 `classify` L420–422、`labelVisible` L315、`fadeOf` L314（そのまま）、`judge` L423–430（作り直し）。
- 作る: `src/judge/windows.ts`、`judge.ts`、`hold.ts`、`score.ts`、`self-rate.ts`、`calibration-offset.ts`。
- 手直し: etterna・m1 40/80/120、甘さ倍率 → 2 組だけ（§2.3 L107）。HOLD_MIN 0.55 s → ≥500 ms。離し窓 1.3×／1.0×GOOD（プロファイル別、`windows(-1).good` L327）→ 1.5×GOOD、音ゲー向け 300 ms（L110）。+300 点・NEAR 400 点 → 無し。m4 NEAR を good に合算 → counts.near、重み 0.4（L111）。Wife3 → 外す。点・ゲージは音ゲー向けだけ（L113）。m4 tainted → 「外した」（§2.7 L135）。
- 期待値: 入門者 遅れ側 −30 ms → perfect、−235 ms → miss（windows L270 ×1.3）。accuracy 0.5 → C。α 0.2 → hint、0.19 → self（m4 L314–315）。
- 完了条件: 「人工ジッタで精度%が単調に下がる」（§5.1 L210、手順 13 で測る）。手順 6 の開発ページで手弾きも確かめる。

### 手順 9: 配列プリセット層の残り（M0-07、M。U-01 の後）

- 元: m2 `STAG_BUILTIN` L198–203、`GAP_NAMES` L184、`physOffFor` L208、`gapDevs` L266–267、`redPairs` L264–265、`updatePhase` L453–463、`updateFallbackNote` L466–468。m4 getLayoutMap L668–669。
- 作る: `src/layout/stagger.ts`、`legend.ts`、`same-pitch.ts`、`phase.ts`、`fallback.ts`（退避＝正六角のまま文字だけで判定。設定 `hexnote.settings.geometry: regular｜physical｜fallback`、決定 #2）。開発ページ `src/app/dev/layout-dev.ts`（m2 の位相表）。
- 手直し: 段ずれの順は m2 の **[数字–Q, Q–A, A–Z]**（GAP_NAMES L184。physOffFor・updatePhase の添字がこの順に依存）をそのまま採り、U-01 の記録用紙もこの順にする。worktable L93 の「Z–数字」は隣り合わない段なので「数字–Q」の誤り（ADR に残す。§5.6 L278 に順の記述は無い）。m2 `hc` の conv → 無し。updatePhase 閾 0.125／0.375 → 仮のまま。getLayoutMap 無しなら JIS／US 選択、ja は JIS（§2.1 L97）。
- 期待値: physOffFor([0.5,0.25,0.5])＝[0,0.5,0.75,1.25]（L208）。ANSI×ableton → mid、ANSI×vmpk → ok（updatePhase L455、gaps L212・L214）。U-01 の値で合否。
- 完了条件: 「m2 が再現。U-01 で黒鍵位相の合否」（§5.1 L211）。

### 手順 10: 音源層（M0-08、M）

- 元: m5 `ensureAudio` L440、`playNoteAt` L443–447、`clickAt` L448（そのまま）、`playItems／pump` L457–464（手直し）。
- 作る: `src/audio/context.ts`、`scheduler.ts`、`synth.ts`、`sampler.ts`、`metronome.ts`、`keyclick.ts`、`tools/salamander/thin-salamander.ts`、`content/samples/salamander/manifest.json`（元ファイル名、出典版 V3、音ごとの速度層）、`ATTRIBUTION.md`（必須項目: 題名・作者・出典 URL・ライセンス名と URL・改変内容＝音の選定・速度層・Opus 変換・正規化・変換日。CC BY 3.0 §4(b)）。開発ページ `src/app/dev/audio-dev.ts`。
- 手直し: pump 40 ms・250 ms 先読み → 25 ms・100 ms（§4.1 L172）。基準時刻は audio-bridge から。合成音の係数は自作値 → 仮と注記。追加: accompaniment の予約、Salamander 30 音（A0 から短三度）を Opus で遅延読込、打鍵音は誤打のみ −18 dB・300 ms（§2.9 L146–148）、予約の遅れ最大値を telemetry に記録（主スレッド 75 ms 停止で音が抜ける検知。M-7 の閾 20 ms 超で帯）。
- 期待値: midi 69 → 440 Hz（m5 L443）。初回読込の実測を docs に記録。check-license-files が ATTRIBUTION.md の項目欠けで fail。
- 完了条件: 「伴奏付きで鳴る。初回読込 ≤10 MB」（§5.1 L212）。

### 手順 11: 保存層（M0-09、M）

- 元: m4 `save／load` L320–323、m3 `saveOffset` L665–667、m1' L269、m2 L204–207、m5 L371–372、m0 L443–448（範囲検査）、m5 download L434–436。
- 作る: `src/storage/local.ts`、`session.ts`、`idb.ts`、`fallback.ts`、`file.ts`、`migrate.ts`。
- 手直し: 鍵名 hexnote-m0／hexnote.limit／hexnote-m2-staggers／hexnote-m3-offset／hexnote-m4-practice／hexnote-m5 → hexnote.settings（v:1）、hexnote.calibration、hexnote.device、hexnote.fade、sessionStorage hexnote.booted（§4.3 L182）。上限の丸め 2..6 → 2..4。黙殺 → storageFail＋メモリ内続行（§4.1）。追加: IndexedDB charts／results／telemetry、`*.hexnote.json` の往復。
- 期待値: '7' → 4（m1' L269 の丸めを直す）。setItem の例外で storageFail 1 回、処理は続く。
- 完了条件: 「プライベートウィンドウと容量超過で通知」（§5.1 L213）。

### 手順 12: 計測層（M0-12、S）

元: m3 `logEvent` L385–386、`recordResult` L407–410（手直し）、`welford` L404、`mean／sd` L247–248（そのまま）。作る: `src/telemetry/rows.ts`（型は手順 2）、`ring.ts`、`collect.ts`、`export.ts`。手直し: 文字ラベル → §4.6 L194 の行、リング 40 → 1,000、入力遅延 mean → 中央値、動画 ID は入れない、予約遅れ最大値（手順 10）を play 行に。期待値: sd([1,2,3,4])＝1.2909944（m3 L248）、1,001 行目で先頭が消える。完了条件: 「§4.6 の行が貯まる」（§5.1 L216）。

### 手順 13: 回帰ハーネス（M0-10、S）

元: m3 `mulberry32` L244、`gauss` L245（そのまま）、`buildNotes` L358–360（作り直し）、自動プレイ L388–395、`sweep` L405–406。m4 `sampleAuto` L377–378（SD 表記 28 と実装 19.8 の不一致、m3 を採る）。作る: `tools/harness/autoplay.ts`、`jitter.ts`、`run.ts`、`diff.ts`、`tests/harness/expected/`。手直し: 固定譜面 → 6 曲×2 プロファイル×2 配列、SD 0／5／10 ms、種固定、`now` は手で進める。差分表: 行＝曲×プロファイル×配列×SD（72 行）、列＝chartId、variantId、profile、jitterSd、precision、rank、counts、selfRate、seed。期待値: 同じ種で差分 0。SD 0→5→10 で precision が単調に下がる（M0-06 の完了条件）。完了条件: 「6 曲×2 プロファイル×2 配列の差分」（§5.1 L214）。

### 手順 14: COEP×YouTube（M0-11、S）

元: m3 `loadYT` L461–475。作る: `spikes/coep-youtube/index.html`、`headers.md`、`RESULT.md`。試験: require-corp／credentialless × Chromium／Firefox。Firefox 列は手順 5 の分と合わせて M0 末に U-05 で埋める（§5.6 L282）。完了条件: 「tech-08 の箱だけ決める」（§5.1 L215、§6.2 L309）。

## 3. 譜面形式の移行

| 項目 | m5 内部（入力） | m5 JSON（照合、L417–424） | m1' 読込（L478–485） | /1（§3.2） | 変換器 |
|---|---|---|---|---|---|
| format／id | 無し | あり／無し | 見ない | 必須、/2 拒否／sha256 | 付ける・計算 |
| notes.midi | `src`（原曲音高、落ちた音も含む。2026-10-30 訂正: 旧「`out[].orig`」は間引き後の 34 音だけ） | 折り畳み後 | 原曲 | 原曲音高 | src を採る。out[] は (tick, orig) で keys に対応させるだけ（decisions #22） |
| notes の順 | 時刻順 | 時刻順 | 任意 | beat 昇順、同拍 midi 昇順 | 並べ替え |
| vel／hand | mel 0.8・parseMidi max(0.3, v/127)（どちらも 0..1。2026-10-30 訂正、decisions #22） | 無し／hand | 無し | 0–127 既定 80／ext | round(×127)、JSON は 80、ext.hand |
| pulse | resolution＋tempo | 同 | bpm のみ | {resolution, tempo[], timeSig[]?} | timeSig を補う |
| sync | 単一＋説明文 | 同 | videoId 直読み | {sources[]} | sources[0] に畳む |
| layout／keys／limit／fold | state | トップレベル、fold は stats | layout のみ | variants[0] | 畳む。別名を正規名に |
| keys の長さ | 間引き後 | 同 | 無し | notes と同じ、null | null を補う |
| source | 無し | 無し | 無し | 必須 | kind midi、rights private |
| 時間 | 拍と秒 | 同 | 秒（LEAD 2.2 s） | 拍。読込時に ms 表 | LEAD を外す |

変換器の責務（§3.3 L166）: 原曲音高に戻す、variants[0] に畳む、source と id を補う、順序を正す。バリデータは変換後だけに掛ける。譜面版 id: `<layout>/<limit>/<fold>`、layout は ableton｜vmpk｜genshin｜wicki の 4 値のみ、limit 2〜4、fold octave／cut／nearest（§3.2 L161、決定 #12）。例 `ableton/2/octave`。custom は id から外し ext として後の M へ。results.variantId はこの文字列。鍵数制限は実行時フィルタ（§3.2 L161）だが M0 は results.keyset の型だけ、本体は M1-10（§7-3）。

## 4. 移植しない物

| 物 | モック | 理由・行き先 |
|---|---|---|
| 仮想画面枠・寸法注記・3 配置比較・far-16 | m0 L1–148、L198–209、L285–327、L374–379 | 左右分割固定（§1.3 L79） |
| 設定パネル・ログ・結果表の DOM | m1' L125–196、m2 L93–164、m3 L100–220、m4 L135–230、m5 L95–197 | 製品画面は M1 以降 |
| etterna・m1 判定窓、Wife3、erf | m1' L241、m3 L246–260 | 2 組だけ（§2.3）。数値は docs/references.md |
| 三和音探索・移調・ローズ・Harmonic／Jankó・conv | m2 L140–145、L221–224、L245、L307–324 | 設計に無い。4 配列固定 |
| direct／ema 補間、sweep、隙間／回転の着地演出 | m3 L324–350、L405–406、L508–510 | lsq のみ（§2.6）。返しは縁 2→6 px |
| 待ち方既定「フレーズ待ち」、甘さ倍率、ヒートマップ | m4 L135–157、L185–226、L513–519 | 固定テンポ（§2.7）。待ちは M2-03、ヒートマップは M4-04 |
| 差の図、方式比較表 | m5 L155–163、L182–186 | S5 に無い（§1.3 L85） |
| SMF パーサー `parseMidi` | m5 L263–314 | M2-01 へ送る（§5.3 L241） |
| pointer のセルタップ | 全モック | タッチ鍵盤は見送り（§6.2 L309） |
| 固定曲 buildNotes、genRandom、PRESETS.auto | m3 L358–360、m1' L258–261、m4 L273–275 | /1 の譜面に置換 |
| 段色分け、Google Fonts 直書き | 全モック | 色に頼らない（decisions L27）。PWA オフライン |
| 画面遷移 | m6-flow.html | M1 の画面で使う。M0 では読まない |

一本線の着地は「移植しない物」ではなく手順 4 の landing.ts に切替として入る（決定 #3）。

## 5. 手元作業との同期

| 作業 | 使う手順 | 要る日（直列） | 遅れたときの代替 |
|---|---|---|---|
| U-01 段ずれ計測（2 台、1u 単位、順は 数字–Q／Q–A／A–Z） | 手順 9 | 23 日目 | 既定 ANSI 1/2・1/4・1/2（m2 L198–203）で先に作り、値は後からフィクスチャで読む。受け取りは m2 の {name, v[3]}（L204–207） |
| U-03 同梱曲 10 曲と権利表 | 手順 11、M1-01 | M0 末（§5.6 L280） | チュートリアル曲 1 曲（PD）だけ先に置き check-rights を 1 曲で通す |
| U-05 Firefox・実機 2 台 | 手順 5、14 | 31 日目（M0 末、手順 14 と同日） | Chromium で先に埋め、Firefox 列は M1-14 へ |

U-01・U-03 は M0 初日から（§5.7 L288）。人手があるときだけ手順 5・7・10・11 を並行し、U-01 は 7 日目に前倒す。

## 6. M0 の出口

M1 に渡す物: `src/shared/types.ts`、`src/chart/`（バリデータ・ハッシュ・ms 表・変換器・variants）、`src/layout/`（4 配列の表、段ずれ、退避、刻印、位相の合否）、`src/render/`（3 視口の R と v、6 曲のコマンド列スナップショット、領域と予算）、`src/clock/`（ClockSource、状態列付きダミー、停止検知の口）、`src/judge/`、`src/input/`、`src/audio/`（予約 API、合成音、Salamander manifest と ATTRIBUTION、初回読込の実測）、`src/storage/`・`src/telemetry/`、`tools/harness/` の差分表、`spikes/coep-youtube/RESULT.md`、`docs/references.md`・`tests-inventory.md`・`adr/`（段ずれの順、一本線の判断）。

## 7. 未決と設計書への提案

2026-10-30 主担当: 提案 1〜4 は decisions.md #16（許可ライセンスの範囲）・#17（M0 作業表の手直し）として採用し、design.md §5.1 に注記した。§1.2 のツールの版は同日に npm registry で確認済み（手元は Node 24.21.0／npm 11.19.0）。着手時に再確認する。

1. **配列表の前倒し**（提案）: M0-07 ←04 を「code→MIDI 表は M0-02 前半、段ずれ・位相・退避は ←04」に分ける。§5.1 L211。
2. **確認点の予備日**（提案）: 一本線へ戻すとき手順 4・6 のやり直し最大 M×2＝6 日。§5.1 の 31 日に含まれないので予備として明記する。
3. **鍵数制限の実行時フィルタ**（提案）: §4.1 L172 は譜面層、作業表は M1-10・M2-07。M0 は results.keyset の型だけ、本体は M1-10。
4. **ライセンス許可一覧**（提案）: decisions L29「MIT／MPL／Apache のみ」に BSD／ISC／CC0／Unlicense／0BSD を足した。正とするなら decisions か ADR に書く。
5. **ms 表の形**（手順 2）: 整数か小数か、tempo 変化の累積方式。§3.2 L158。 → decisions #19 で閉じた（float、区間の開始 ms を累積）。
6. **canonical JSON の丸め**（手順 2）: 四捨五入か切り捨てか。§3.3 L166。 → decisions #19 で閉じた（四捨五入 Math.round、入れ子とキー順を §3.3 に明記）。
7. **R と v の式**（手順 4）: 音ゲー向け 1.0 s の R_h、「舞台高」「右列幅−32」の定義、514 の境界。§2.5 L124–126。
8. **pauseVideo の呼び出し層**（手順 7）: 時計層が要求イベント、YouTube 層が結果を返す形。§2.6 L131、§4.1 L172。
9. **tsPerf の出所**（手順 5）: Event.timeStamp（16.7 ms 刻み、§6.1 L299）か performance.now()。
10. **10 MB の中身**（手順 10）: 生か gzip か、同梱曲は 1 曲か 10 曲か。
11. **2 プロファイルの既定値**（手順 8・13）: 音ゲー向けは M2-05。仮: 定数だけ持つ。
12. **LICENSE の置き方・content の名前・配信**（手順 1）: ルート＋各ディレクトリ全文か REUSE か。public/ 直置きか static-copy か。 → 2026-10-30 ADR 0003 で閉じた（content/ は直下のまま build 時に dist/ へ写す。REUSE は採らない）。
13. **黒鍵位相の合否の式**（手順 9）: m2 の閾 0.125／0.375。
14. **SW の方式と更新**（手順 1）: vite-plugin-pwa か自前か。prompt か autoUpdate か。 → ADR 0004 で閉じた（generateSW、prompt）。
15. **権利表の欄**（手順 11、U-03）: 6 欄の定義が 2 通り。Source.rights に cc0・cc-by が無い（§3.2 L162 と §2.9 L147）。 → ADR 0005（U-03 の 6 欄＋file・owner）と decisions #18（rights に cc0・cc-by を追加）で閉じた。
16. **ホールド離し窓の終端、skipped の分母**（手順 8）: §2.3 L110。
17. **Salamander**（手順 10）: V3 自前間引きか Tone.js の V2 30 音か。Opus か MP3 か。
18. **自作値**（仮のまま注記）: 合成音の係数、コンプレッサ −18 dB／4:1、DPR 上限 2、q̂ の条件、低負荷の閾（M-7）、15 ms 量子化の傾き 0.99986。
19. **TypeScript 7.0.2**（手順 1）: Go 実装での入力なし時の挙動と `erasableSyntaxOnly` の有無は未確認。Node 24 か 26 か、Windows の長いパスの規約。
20. **tools の AGPL**（手順 1・13）: §4.5 L190「初版は使わない」が正。
21. **譜面版の指標 metrics**（手順 3）: variants.ts は stats（srcNotes・droppedFold・movedFold・droppedThin・chordMax）だけ作り、難度指標（密度・跳躍・同時押し率・段またぎ率、§2.4）は作らない。変換器は m5 の値を写す。生成は M1-08（S1 の難度 4 軸）か M2-01（S5 の指標）で、六角距離は手順 4 の `src/render/hex/hex.ts` を使う。
22. **parseMidi の vel**（手順 3 → M2-01）: m5 は `max(0.3, v/127)` で 0..1 にするので、床 0.3 で元の速度 1〜37 が 38 に潰れる（38 以上は round(×127) で元に戻る）。SMF パーサーを移すときは 0–127 の整数のまま持ち、変換器を通さない。
23. **m1' と m5 の折り畳みの違い**（手順 6）: m1' buildChart L282–283 は ±12・±24 の後に ±1・±11・±13 で寄せる（半音寄せ）。製品は m5 の 3 種（octave／cut／nearest、決定 #12）に揃えた。手順 6 の「同じ絵」は variants.ts の譜面版（`tests/fixtures/charts/m1/`）で取る。
24. **間引き・同音の規則の確定**（手順 3）: decisions #20（原曲音高で比べる）・#21（60 以上は上の段）・#23（同梱曲の 4 版は octave）は仮。M-10・同梱曲の譜面化（M1-01）で不自然な版が出たら見直す。

閉じた物: 変換器の入力（m5 内部表現。手順 3）、手順 3 の期待値の検算（m5 の元のコードと移植で一致）、変換器の細部（decisions #22）、並行の折り合い（§5.1 どおり 02 全体）、「同じ絵」の物差し（コマンド列スナップショット。手順 6）、M0-02 の範囲（m5 と m1' 6 曲を from-mel で同じ /1 へ。手順 3）。
