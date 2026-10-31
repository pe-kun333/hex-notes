# spike: COEP × YouTube iframe（M0-11）

目的: `Cross-Origin-Embedder-Policy: require-corp` または `credentialless` を付けたページで YouTube の IFrame Player が動くかを確かめる。その結果で、cross-origin isolation（SharedArrayBuffer）の要る経路（tech-08 の Worker 描画と入力分離、pipeline-06 の音源分離）の箱を決める。

- 結果と結論: `RESULT.md`（Chromium は 2026-10-31 に測った。Firefox は U-05）
- ヘッダの組・付け方・YouTube の応答のヘッダ・ブラウザの対応: `headers.md`
- 裁定: decisions #57（仮）

動かし方:

1. `node spikes/coep-youtube/serve.ts [--port 5180]` を起こす。Claude アプリの browser pane では `.claude/launch.json` の `coep-spike` を使う。
2. `http://localhost:5180/?coep=none|require-corp|credentialless&iframe=normal|credentialless` を開く。ページ上の 6 つのリンクで組を切り替えられる。
3. 「読み込む」→「再生（ミュート）」の順に押す。窓は表に出したままにする（非表示のページでは YouTube が自分で止まる）。
4. 表と JSON を `RESULT.md` に写す。

当初の案（静的な HTML を 3 枚）は、1 枚の `index.html` と問い合わせで分ける形に改めた。iframe の型（`<iframe credentialless>`）を足して組が 6 つに増えたため。製品のビルドには COEP を足さない（`vite.config.ts`、ADR 0004）。spike は src/ から辿らない。
