# 同梱曲の権利表

同梱曲（`content/charts/**/*.json`）には 1 曲 1 行の権利情報が要る。`rights.json` に書き、CI の `npm run charts:rights` が欠け 1 件で止める（計測 M-9、作業 U-03）。欄の定義は ADR 0005。

## 欄

主の 6 欄は design.md §5.6 U-03「曲・作曲者没年・編曲者没年・出どころ・ライセンス・確認日」。`file` と `owner` は追加欄。

| 欄 | U-03 | 中身 |
|---|---|---|
| `title` | 曲 | 曲名 |
| `composerDied` | 作曲者没年 | 西暦 4 桁。作者不詳の伝承曲は `anonymous`。自作（`own`）は `-` |
| `arrangerDied` | 編曲者没年 | 西暦 4 桁。編曲者がいない（原曲のまま採譜）なら `-`。自分で編曲したなら `-` にして license を `own` |
| `source` | 出どころ | URL か書誌（PD なら版と成立年も。校訂版は不可） |
| `license` | ライセンス | `PD`／`CC0-1.0`／`CC-BY-4.0`／`CC-BY-3.0`／`own` のいずれか（§2.9） |
| `checkedOn` | 確認日 | 権利を確かめた日（YYYY-MM-DD） |
| `file` | （追加） | 譜面ファイルの相対パス（`content/charts/` から。例 `pd/twinkle.json`） |
| `owner` | （追加） | 確かめた人 |

`PD` は作曲者・編曲者とも没後 70 年（§2.9 L147）。検査は `composerDied`・`arrangerDied` が西暦なら `checkedOn` の年 − 没年 > 70 を要求する（仮。国ごとの保護期間の差は見ない）。

## license と譜面の `source.rights` の対応

| `license`（この表） | 譜面 `source.rights`（design.md §3.2） | `source.license` |
|---|---|---|
| `PD` | `pd` | 不要 |
| `own` | `own` | 不要（自作） |
| `CC0-1.0` | `cc0`（decisions #18 で §3.2 に追加） | 任意（出どころは `source.url` に残す） |
| `CC-BY-4.0`／`CC-BY-3.0` | `cc-by`（decisions #18 で §3.2 に追加） | `{id, holder, url}` 必須 |

CC BY の曲は譜面の `source.license`（id・holder・url）に帰属を書き、設定画面のクレジット（S6）に出す。足りない項目は `ext` に置く。

## rights.json の形

```json
{
  "entries": [
    {
      "file": "pd/twinkle.json",
      "title": "きらきら星",
      "composerDied": "anonymous",
      "arrangerDied": "-",
      "source": "フランス民謡（18 世紀）。旋律は公有。採譜は原曲のまま",
      "license": "PD",
      "checkedOn": "2026-11-01",
      "owner": "（自分の名）"
    }
  ]
}
```
