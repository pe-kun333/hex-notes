// 依存に許すライセンスの一覧（M0-01）。check-deps.ts と tests/unit/licenses.test.ts が使う。
// 足すときは docs/decisions.md #16（配布物）か docs/adr/0002（開発依存）を先に改訂する。

// 配布物に入れてよい（decisions #16）
export const ALLOW_DIST = [
  'MIT',
  'Apache-2.0',
  'MPL-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'CC0-1.0',
  'Unlicense',
  '0BSD',
]

// 開発依存にだけ許す（配布物には入らない。ADR 0002）。
// (MIT AND CC-BY-3.0)（spdx-ranges）は項ごとの評価で通るので、式そのものは列挙しない。
export const ALLOW_DEV_ONLY = [
  'BlueOak-1.0.0', // glob 11 系（jackspeak、@isaacs/cliui、path-scurry など）
  'CC-BY-4.0', // caniuse-lite（データ）
  'CC-BY-3.0', // spdx-exceptions、spdx-ranges（データ）
]
