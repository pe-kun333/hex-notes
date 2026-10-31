# ADR 0004: Service Worker は vite-plugin-pwa の generateSW、更新は prompt

日付: 2026-10-30。状態: 採用（m0-kickoff.md §7-14 の未決を閉じる）。

## 文脈

PWA の殻（§1.4）に SW が要る。自前（`src/sw/sw.ts` を手で書く）か vite-plugin-pwa（MIT、workbox-build）か。更新の方式は autoUpdate（新版を黙って入れ替え）か prompt（利用者に「更新」を出す）か。プレイ中に SW が入れ替わると譜面や音源のキャッシュが途中で変わりうる。

## 決定

- vite-plugin-pwa 2.0.0 の `generateSW`（workbox）。`injectRegister: 'script-defer'`、`manifest: false`（`public/manifest.webmanifest` を手書き）、`devOptions.enabled: false`（dev では SW 無効）。
- `registerType: 'prompt'`。更新は S6（設定）か結果画面で利用者が押したときだけ適用し、プレイ中に入れ替えない。
- precache ＝ `**/*.{js,css,html,svg,webmanifest}` ＋ チュートリアル曲（ADR 0003）。runtime ＝ `/content/charts/*.json` と `*.opus|mp3|ogg` は CacheFirst。YouTube の規則（NetworkOnly）は親ページが読む `iframe_api`・`www-widgetapi.js` にだけ効く。iframe の中の要求は親の SW を通らないので、規則が無くても挙動は同じ（意図の記録として残す）。
- COEP は足さない（M0-11 で可否を見る）。→ 2026-10-31 M0-11 の結果で確定（decisions #57。YouTube の埋め込みは COEP を report-only でしか付けず、COEP のページでは Chromium の `<iframe credentialless>` でしか読めない。spikes/coep-youtube/RESULT.md）。

## 帰結

- 自前に切り替えるときは `src/sw/` に書き、`vite.config.ts` の VitePWA を `injectManifest` に変える。本 ADR を改訂する。
- prompt の UI は M1 の S6 で作る。M0 では `registerType` の値だけ置く。

## 改訂（2026-10-31、decisions #64）

- precache を 殻＋チュートリアル曲 から 殻＋同梱曲全部（`content/charts/**/*.json`。design.md §2.9 の 10 曲 ＝ チュートリアル 1 曲＋入門 9 曲）に広げる。M1-09 の完了条件「オフラインで 10 曲」は cache-first（一度読んだ物だけ残る）では満たせないため。runtime の CacheFirst は音源（`*.opus|mp3|ogg`）だけに絞る。
- 初回読込の数え方（decisions #49: 殻＋チュートリアル曲、生のバイト数）は変えない。precache はページの読込の後に背景で落ちる。
- 持ち込み曲（M2）は IndexedDB に入るので SW の外。実装は M1 の手順 13（`vite.config.ts` の `globPatterns` と `runtimeCaching`）。

## 改訂（2026-11-01、decisions #76、M1 の手順 13）

- `injectRegister` を `'script-defer'` から `false` に変えた（`registerSW.js` を出さない）。登録は `src/app/sw-register.ts` が `virtual:pwa-register` の `registerSW` で行い、`onNeedRefresh` を S6 の群「オフラインと更新」と S3 の「更新する」に出す。S2 には出さない。
- 同梱曲が全部 precache にあることは `npm run pwa:check`（`tools/pwa/check-precache.ts`、CI はビルドの後）で見る。
