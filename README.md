# ヘクサノート（hexnote）

六角セルの音符が上から流れ、PC キーボードを鍵盤に見立てて押す音ゲー。PC キーボードの千鳥配列（段ずれ 1/2・1/4・1/2 キー）を六角格子として扱い、六角セルの音符と鍵盤を一体の見立てにする。

状態: **M1（遊べる最小版）の手順 1〜14 済み（main）、出口は手元の確かめ待ち**（初回導線の秒・実機・音・Firefox と同梱曲の入門 9 曲。`docs/planning/m1-verification.md` §4）。**M2（持ち込みと練習）の手順 1〜3 済み**（SMF の取り込みと CLI `npm run charts:smf`、S5 曲の持ち込みと S1 の一覧、同期タップの部品と開発ページ。手順 3 は PR の取り込み待ち）（手順書は `docs/planning/m2-kickoff.md`、10 手順・累積 28 日。§7 の重い 5 件は利用者が採用 → decisions #78〜#82）。設計は `docs/design.md`、決定は `docs/decisions.md`、手順は `docs/planning/m2-kickoff.md`（M1 の記録は `docs/planning/m1-kickoff.md` と `docs/planning/m1-verification.md`、M0 の記録は `docs/planning/m0-kickoff.md`、下調べは `docs/planning/research/`）。

## 構成

| 場所 | 中身 | ライセンス |
|---|---|---|
| `src/` `tools/` `tests/` | 本体（TypeScript、Canvas 2D、Web Audio、PWA） | MIT（`LICENSE`） |
| `content/charts/` | 同梱曲の譜面（hexnote-chart/1）と権利表 `RIGHTS.md` `rights.json` | 曲ごと（PD・CC0・CC BY・自作） |
| `content/samples/salamander/` | ピアノ音源の間引き版（未同梱。M0-08 で置く） | CC BY 3.0（帰属は下） |
| `docs/` | 設計書・決定・参照の数値・試験の台帳・ADR。`docs/planning/` は手順書と下調べ | MIT |
| `spikes/` | 使い捨ての検証（M0-11 COEP×YouTube） | MIT |

## 開発

Node 24 以上。

```
npm ci
npm run dev          # 開発サーバー
npm run check        # ライセンス検査・権利表・型・単体試験・譜面検査
npm run build        # dist/ と .vite/manifest.json
npm run size         # 初回読込 ≤ 10 MB（decisions #10）
```

CI（`.github/workflows/ci.yml`）は同じ順で走る。ライセンス検査に通らない依存は入れない。

## ライセンスの線引き

- 本体に取り込めるのは MIT／Apache-2.0／MPL-2.0／BSD-2-Clause／BSD-3-Clause／ISC／CC0-1.0／Unlicense／0BSD（decisions #16）。GPL／AGPL／LGPL と不明は拒否。SPDX の式は項ごとに見る（AND は全項、OR は 1 項）。開発依存にだけ BlueOak-1.0.0 と CC BY のデータを許す（ADR 0002）。
- **仕様だけ参照**（数値と設計の参考に留め、コードは取り込まない）: Falling Nikochan、Bemuse、Specy、beatoraja、WebAudioFont。参照した数値と出どころは `docs/references.md` に書き、コードには書かない。
- PR には「参照元」欄があり、「AGPL／GPL の実装を開いて書いたか」を確認する。

## 帰属

- **Salamander Grand Piano V3** — Alexander Holm、[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。本プロジェクトは 30 音に間引き、Opus に変換した改変物を同梱する予定（M0-08）。改変内容と変換日は `content/samples/salamander/ATTRIBUTION.md`。
- フォントは system-ui（同梱しない）。
