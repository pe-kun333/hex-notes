# spike: COEP × YouTube iframe（M0-11）

目的: `Cross-Origin-Embedder-Policy: require-corp` または `credentialless` を付けたページで YouTube の IFrame Player が動くかを確かめ、音源分離の経路（SharedArrayBuffer が要る処理）を残すかどうかの箱を決める（tech-08）。

手順（手順 14、1 日）:

1. このディレクトリに静的な HTML を 3 枚置く: COEP なし／`require-corp`／`credentialless`（`Cross-Origin-Opener-Policy: same-origin` と組み合わせる）。
2. ヘッダは小さな静的サーバー（`node serve.ts`）で付ける。
3. Chromium と Firefox で、プレイヤーの読込・再生・`getCurrentTime` の 3 点を見る。
4. 結果を `RESULT.md` に表（ブラウザ × ヘッダ × 3 点）で書く。design.md §5.1 M0-11 の完了条件は「tech-08 の箱だけ決める」。

製品のビルドには COEP を足さない（vite.config.ts）。
