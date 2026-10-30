# src/ — 本体（MIT）

層は design.md §4.1。ディレクトリは手順が進むごとに増える（docs/planning/m0-kickoff.md §2）。git は空ディレクトリを持てないので、まだ無いディレクトリはこの表が代わり。

| ディレクトリ     | 層                                                                   | M0 の手順 |
| ---------------- | -------------------------------------------------------------------- | --------- |
| `shared/`        | 型（chart・results・telemetry・NowFn）、種付きの乱数                 | 手順 2・7 |
| `chart/`         | 譜面層（バリデータ・ハッシュ・ms 表・変換器・variants）              | 手順 2・3 |
| `layout/`        | 配列プリセット（code→MIDI、段ずれ、位相、刻印、同音、退避）          | 手順 2・9 |
| `render/hex/`    | 六角幾何（格子・段別着地・R と v）                                   | 手順 4    |
| `input/`         | 入力層（code、repeat、IME、役割キー）                                | 手順 5    |
| `render/canvas/` | 描画層（描画コマンド列 → Canvas。Canvas に触れるのは flush.ts だけ） | 手順 6    |
| `clock/`         | 時計層（ClockSource、写像、停止検知、audio-bridge、ダミー動画）      | 手順 7    |
| `play/`          | プレイの状態機械（design.md §4.2）と時計をつなぐ session             | 手順 7    |
| `judge/`         | 判定・採点層（窓・NEAR・ホールド・精度・自力率・校正のオフセット）   | 手順 8    |
| `audio/`         | 音源層（予約、合成音、メトロノーム、打鍵音、Salamander の遅延読込）  | 手順 10   |
| `storage/`       | 保存層                                                               | 手順 11   |
| `telemetry/`     | 計測層                                                               | 手順 12   |
| `sw/`            | Service Worker（vite-plugin-pwa が生成。自前にするときはここ）       | 手順 1    |
| `app/dev/`       | 開発ページ（手順ごとの確認用。製品画面ではない）                     | 手順 5〜  |

決まり:

- グローバル状態を持たない。DOM と Canvas は層の外。時刻は ms。`performance.now` の直呼びは `clock/clock-source.ts`（`perfNow`）と `app/` だけ（他は `NowFn` か now の値を受け取る。kickoff §2・decisions #32。入力層は `app/` がハンドラの冒頭で 1 回読んだ now を値で受ける。decisions #25）。
- 相対 import は必ず `.ts` 拡張子を付ける（`tools/` は Node が型剥がしで直接実行し、拡張子なし・パス別名は解決しない）。`tools/` から import する `src/` の部品は DOM と `vite/client` に触れない。
- tsconfig は 1 つで `DOM` と `node` の両方の型を見る。`setTimeout` の戻りは `ReturnType<typeof setTimeout>` で受ける（`number` に入れない）。
