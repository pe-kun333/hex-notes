# ADR 0003: content/ はリポジトリ直下に置き、ビルド時に dist/ へ写す

日付: 2026-10-30。状態: 採用（m0-kickoff.md §7-12 の未決を閉じる）。

## 文脈

同梱曲 `content/charts/**/*.json` と音源 `content/samples/` は `public/` の外にある（§1.1 の木。core＝`src/` MIT、assets＝`content/` の線引き）。`vite build` は `public/` しか dist に写さないので、そのままでは本番で `/content/charts/*.json` が 404 になり、`tools/size/check-initial-load.ts` が数える `dist/content/charts/tutorial/` も生まれない。dev では Vite がルート直下のファイルを配信するので気づかない。選択肢は (a) `public/content/` に移す、(b) `content/` のまま build 時にコピーする。

## 決定

- (b)。`content/` はリポジトリ直下のまま。`vite.config.ts` の自前プラグイン `copyContent`（数十行、依存なし）が `closeBundle` で `content/charts/**/*.json`（`rights.json` を除く）と `content/samples/**`（LICENSE・ATTRIBUTION.md・manifest.json を含む）を `dist/content/` に写す。vite-plugin-pwa の `closeBundle` より先に走るので、precache の glob が写した後の `dist/` を見る。
- precache は殻＋チュートリアル曲（`content/charts/tutorial/**/*.json`）。他の曲と音源は runtime cache-first（§1.4）。
- LICENSE の置き方: ルートの `LICENSE`（MIT）が `src/`・`tools/`・`tests/`・`docs/`・ビルド設定を覆う。`content/charts/` は `RIGHTS.md` と `rights.json`（曲ごと）、`content/samples/<音源>/` は各 `LICENSE` と `ATTRIBUTION.md`。REUSE（SPDX ヘッダ）は採らない。
- tools（`charts:validate`・`charts:rights`）の既定パスは `content/charts` のまま。

## 帰結

- 同梱曲を足すときは `content/charts/<pd|cc|own>/` に置くだけで dist に入る。`cc/` の曲は decisions #18 の語彙（rights cc0／cc-by）で置く（RIGHTS.md）。
- (a) に変えるときは本 ADR を改訂し、`vite.config.ts`・`package.json` の scripts・`check-initial-load.ts` の 3 箇所を揃える。
