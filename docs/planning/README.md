# 計画の資料（R1 下調べ・考察 / R2 計画とデザイン）

2026-10-23〜30 の企画セッションの成果物を、体裁を変えずに写したもの。**正となる文書は `docs/design.md` と `docs/decisions.md`**（この下にある言及は元のパスのまま）。

| ここ | 中身 | 元のパス |
|---|---|---|
| `report.md` | 考察レポート。§0〜§9 が R1、§10 が R2 と M0 の追記 | `report.md` |
| `m0-kickoff.md` | M0 着手手順書（14 手順・累積 31 日、§1.5 末尾に「実際に取った手順」） | `ideas/R2/m0-kickoff.md` |
| `m1-kickoff.md` | M1 着手手順書（14 手順・累積 24 日。起草 2026-10-31。§7 の重い 6 件は利用者が採用 → decisions #58〜#64、残りは着手時に裁定） | （リポジトリで起草。元のパス無し） |
| `m2-kickoff.md` | M2 着手手順書（10 手順・累積 28 日。起草 2026-11-01。§7 の重い 5 件〔1〜4・8〕は利用者が採用 → decisions #78〜#82、残りは着手時に裁定） | （リポジトリで起草。元のパス無し） |
| `research/` | 下調べ 13 話題（出どころ付きの事実と事例）と地図 `map.md` | `research/` |
| `ideas/main-ideas-R1.md` | 主担当の先出し案 | `ideas/main-ideas-R1.md` |
| `ideas/R1/catalog.md` `plan.md` | 案 90 件の一覧と計画（比較表・箱分け・モック仕様・問い） | `ideas/R1/` |
| `ideas/R2-draft/` | 設計書の起草 5 節（画面・仕様値・形式と構成・作業表・リスク台帳） | `ideas/R2/draft/` |
| `mocks/` | モック m0〜m6（単一 HTML の断片。設計書・手順書・試験台帳の行番号はこのファイルを指す） | `mocks/` |
| `../design.md` | 設計書（統合版） | `ideas/R2/design.md` |
| `../decisions.md` | 確定事項 #0〜#18 | `ideas/R2/decisions.md` |

## モックの見方

モックは artifact 向けの断片 HTML（doctype・head・body 無し）。このディレクトリで

```
sh build-preview.sh
node serve.js
```

を走らせると `mocks/preview/` に骨組み付きの写しができ、http://localhost:8787/ で開ける（`mocks/preview/` は生成物で git には入れない）。非公開アーティファクトの URL は `report.md` §6.1・§10.3。

## 読み替え

- 文中の `ideas/R2/design.md` → `docs/design.md`、`ideas/R2/decisions.md` → `docs/decisions.md`、`ideas/R2/m0-kickoff.md` → `docs/planning/m0-kickoff.md`、`research/<話題>.md` → `docs/planning/research/<話題>.md`、`mocks/<名>.html` → `docs/planning/mocks/<名>.html`。
- `m1'`＝`mocks/m1-geometry.html`。
- 行番号の参照（例「m5 `buildVariant` L324–363」）は写した時点のファイルに対するもの。モックは今後編集しない。
