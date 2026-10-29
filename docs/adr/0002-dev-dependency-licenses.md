# ADR 0002: 開発依存にだけ許すライセンス

日付: 2026-10-30。状態: 採用。

## 文脈

決定 #16 の許可一覧（MIT／Apache-2.0／MPL-2.0／BSD-2／BSD-3／ISC／CC0／Unlicense／0BSD）で開発依存まで検査すると、Vite・vite-plugin-pwa（workbox-build → glob 11）の推移的な依存が止まる。2026-10-30 の木: BlueOak-1.0.0 が 15 件（jackspeak、@isaacs/cliui、path-scurry など）、CC-BY-4.0 が 1 件（caniuse-lite のデータ）、CC-BY-3.0 が 1 件（spdx-exceptions のデータ）、(MIT AND CC-BY-3.0) が 1 件（spdx-ranges）。配布物（`--production`）の依存は 0 件。

## 決定

- 検査は 2 段。**配布物**は決定 #16 の一覧だけ。**開発依存を含む全体**は、それに BlueOak-1.0.0、CC-BY-4.0、CC-BY-3.0 を足した一覧。
- SPDX の式は項ごとに評価する（`tools/licenses/spdx-allow.ts`）: AND は全項が一覧にあること、OR は 1 項でよい、末尾の `*`（推定印）は外して比べる。式そのもの（`(MIT AND CC-BY-3.0)` など）は列挙しない。license-checker-rseidelsohn の `--onlyAllow` は式の部分一致（許可名を 1 つ含めば通す。`(MIT AND GPL-3.0)` が MIT の許可で通る）なので使わず、`--json` の出力を読む。
- BlueOak-1.0.0 は寛容なライセンス（OSI 承認）で、配布物に入らない限り問題にしない。CC BY のデータ（ブラウザ対応表、SPDX の一覧）はビルド時に読むだけで配布物に入らない。
- GPL／AGPL／LGPL と不明は、どちらの一覧にも無いので、単独でも AND の一項でも止まる（design.md §4.5「開発用 tools も初版は AGPL を使わない」）。試験は `tests/unit/licenses.test.ts`（`(MIT AND GPL-3.0)` が落ち、`MIT*` と `(MIT OR CC0-1.0)` が通る）。

## 帰結

- `tools/licenses/allow-lists.ts` の `ALLOW_DEV_ONLY`。足すときはこの ADR を改訂する。
- 配布物の依存を足すとき（smplr など）は厳しい一覧に通ることを先に確かめる。
