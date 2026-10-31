# ヘッダの組と付け方（M0-11 の spike）

出どころ: kickoff 手順 14（require-corp／credentialless × Chromium／Firefox）、decisions #57（仮）。製品のビルド（`vite.config.ts`）には COEP を足さない（ADR 0004）。

## 付け方

`node spikes/coep-youtube/serve.ts [--port 5180]` が `index.html` を返し、問い合わせ `?coep=` で応答のヘッダを変える（localhost だけで待つ。`http://localhost` は安全な文脈なので crossOriginIsolated になれる）。開発ページの vite（5173）とは別のサーバにした（ページごとにヘッダを変えたい。vite の `server.headers` は全ページに同じヘッダを付ける）。Claude アプリの browser pane では `.claude/launch.json` の `coep-spike` で起こす。ヘッダの値は `tests/unit/spikes/coep-serve.test.ts` が子プロセスで確かめる。

| `?coep=`                   | Cross-Origin-Opener-Policy | Cross-Origin-Embedder-Policy |
| -------------------------- | -------------------------- | ---------------------------- |
| `none`（既定・知らない値） | 付けない                   | 付けない                     |
| `require-corp`             | `same-origin`              | `require-corp`               |
| `credentialless`           | `same-origin`              | `credentialless`             |

crossOriginIsolated には COOP `same-origin` と COEP の両方が要る。iframe の型は `?iframe=normal|credentialless` で、`credentialless` は `<iframe credentialless>`（ページが iframe を作るときに属性を立てる。属性の対応は Chromium 110 以後だけ）。

## YouTube の応答のヘッダ（2026-10-31、curl で取得）

| URL                                                                     | Cross-Origin-Resource-Policy | Cross-Origin-Embedder-Policy                                   |
| ----------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| `https://www.youtube.com/iframe_api`（とそれが読む `www-widgetapi.js`） | `cross-origin`               | 無し                                                           |
| `https://www.youtube.com/embed/<ID>?enablejsapi=1`                      | `cross-origin`               | `report-only` だけ（`require-corp; report-to="youtube_main"`） |

スクリプトは CORP `cross-origin` なので require-corp のページでも読める。埋め込みの文書は COEP を報告だけで強制していないので、COEP のページの中の普通の iframe としては読めない（入れ子の文書にも COEP が要る）。`<iframe credentialless>` はこの要件を外す代わりに、cookie と保存を持たない使い捨ての文脈で読む。

## ブラウザの対応（MDN の browser-compat-data、2026-10-31）

| 機能                                | Chromium | Firefox | Safari |
| ----------------------------------- | -------- | ------- | ------ |
| COEP `require-corp`                 | 83       | 79      | 15.2   |
| COEP `credentialless`               | 96       | 119     | 無し   |
| `<iframe credentialless>`（実験的） | 110      | 無し    | 無し   |
