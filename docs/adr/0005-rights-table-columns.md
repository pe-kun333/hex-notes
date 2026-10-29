# ADR 0005: 権利表の欄は U-03 の 6 欄＋file・owner

日付: 2026-10-30。状態: 採用（m0-kickoff.md §7-15 を閉じる。欄の定義は本 ADR、license と `source.rights` の語彙は decisions #18 で `rights` に cc0・cc-by を追加）。

## 文脈

design.md §5.6 U-03 は「曲・作曲者没年・編曲者没年・出どころ・ライセンス・確認日」の 6 欄。骨格の最初の RIGHTS.md は title・arranger・source・license・checkedOn・owner で、没年 2 欄が無く、§2.9「PD（作曲者・編曲者とも没後 70 年）」の確認が構造化されていなかった。U-01 と同じく利用者の記録用紙の形に直結するので、M0 初日に揃える。

## 決定

- 主の 6 欄は U-03 のまま: `title`・`composerDied`・`arrangerDied`・`source`・`license`・`checkedOn`。追加欄 `file`（譜面との対応キー）と `owner`（確かめた人）。
- 没年は西暦 4 桁。作者不詳の伝承曲は `anonymous`、該当なし（自作、編曲者なし）は `-`。
- `tools/charts/check-rights.ts` は 7 欄の非空、license の一覧、checkedOn の形、没年の形を見る。`PD` では西暦の没年について `checkedOn の年 − 没年 > 70` を要求する（仮。国ごとの保護期間の差は見ない）。
- `license` の値は `PD`／`CC0-1.0`／`CC-BY-4.0`／`CC-BY-3.0`／`own`（§2.9）。譜面の `source.rights`（§3.2: pd｜own｜cc0｜cc-by｜private、decisions #18）との対応は RIGHTS.md の表（PD→pd、own→own、CC0-1.0→cc0、CC-BY-4.0／3.0→cc-by）。

## 帰結

- U-03 の記録用紙はこの 8 欄。
- §7-15 の残りは decisions #18 で閉じた（§3.2 の rights に cc0／cc-by を追加）。RIGHTS.md の対応表と check-rights.ts の一覧は揃えてある。
