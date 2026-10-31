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
