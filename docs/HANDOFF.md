# 引き継ぎ（次のセッションが最初に読む）

2026-10-30、手順 3 の終わりに更新。読む順は docs/decisions.md → design.md → planning/m0-kickoff.md → tests-inventory.md → src/README.md。

- 済んだ手順: 1（M0-01）、2（M0-02 前半、PR #6）、3（M0-02 後半、ブランチ `m0-03-convert-m5`: src/chart/convert-m5.ts・variants.ts、tools/charts/from-mel.ts・m5-port.ts ほか、フィクスチャ 10 件、試験 183 件）。最初に手順 3 の PR が main に入ったかを確かめる。
- 次の手順: 4（M0-03a 六角幾何、kickoff 手順 4）。着手前に §7-7（R と v の式）を閉じる（強いモデルで相談するか「疑う」を任せる）。六角距離は src/render/hex/hex.ts に置く（§7-21 の指標はそれを使う）。
- 未決: kickoff §7 の 7〜11・13・16〜19・21〜24。decisions #20〜#23（間引きは原曲音高・同音の鍵は 60 以上が上の段・変換器の細部・同梱 4 版は octave）は仮で、利用者の確認待ち。
- 手元作業: U-01 段ずれ計測（数字–Q／Q–A／A–Z、ADR 0001）は手順 9（23 日目）まで、U-03 同梱曲 10 曲と権利表は M0 末まで。進み具合は利用者に確かめ、遅れたら kickoff §5 の代替で進める。
- 検査: `npm ci` → `npm run check` → `npm run build && npm run size`。フィクスチャを変えたら `npm run charts:fixtures` で作り直す（from-mel.test がバイトで照合する）。
