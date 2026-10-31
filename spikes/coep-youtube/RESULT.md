# 結果: COEP × YouTube iframe（M0-11）

2026-10-31、手順 14。ヘッダの組と付け方は `headers.md`、裁定は decisions #57（仮）。

## 測り方

- 動画 ID `M7lc1UVf-VE`（IFrame Player API の説明に使われる Google for Developers の公開動画。同梱曲は動画 ID を持たない。decisions #13）。
- `index.html` の「読み込む」で `iframe_api` を読み、ページが作った iframe（`/embed/<ID>?enablejsapi=1&playsinline=1&origin=…`）に `YT.Player` を付ける。iframe の型の違いは `credentialless` の属性だけ。
- 3 点
  - ① 読込: 10 秒以内に onReady が来る。
  - ② 再生: 「再生（ミュート）」（mute → playVideo）で PLAYING が来る。
  - ③ getCurrentTime: 最初の PLAYING から 10 秒、100 ms ごとに読む。傾きが 0.9〜1.1 で、進んだ量が経過の 9 割を超える。
- あわせて crossOriginIsolated、SharedArrayBuffer、performance.now と Event.timeStamp の刻みを記録した。刻みは µs に丸めた値の最大公約数で、timeStamp はキー 20 回から取った。
- 結果は、ページの JSON（`#out`）を読んで写した。

## Chromium（Claude アプリの browser pane、Chromium 152、Windows 11）

| COEP（COOP）                  | iframe         | 隔離 | SAB | now の刻み | timeStamp の刻み | ① 読込                                 | ② 再生 | ③ getCurrentTime（10 秒）                                     |
| ----------------------------- | -------------- | ---- | --- | ---------- | ---------------- | -------------------------------------- | ------ | ------------------------------------------------------------- |
| なし（なし）                  | 普通           | ✗    | ✗   | 100 µs     | 100 µs           | ✓ 869 ms                               | ✓      | ✓ 傾き 1.000、10,015 ms で 9,973 ms 進む、自分で止まった 0 回 |
| なし（なし）                  | credentialless | ✗    | ✗   | 100 µs     | 100 µs           | ✓ 444 ms                               | ✓      | ✓ 傾き 0.999、10,009 ms で 9,967 ms、0 回                     |
| require-corp（same-origin）   | 普通           | ✓    | ✓   | 5 µs       | 5 µs             | ✗ 10 秒で onReady なし（枠は白いまま） | —      | —                                                             |
| require-corp（same-origin）   | credentialless | ✓    | ✓   | 5 µs       | 5 µs             | ✓ 410 ms                               | ✓      | ✓ 傾き 1.000、10,101 ms で 10,102 ms、0 回                    |
| credentialless（same-origin） | 普通           | ✓    | ✓   | 5 µs       | 5 µs             | ✗ 10 秒で onReady なし                 | —      | —                                                             |
| credentialless（same-origin） | credentialless | ✓    | ✓   | 5 µs       | 5 µs             | ✓ 450 ms                               | ✓      | ✓ 傾き 0.999、10,080 ms で 10,039 ms、0 回                    |

`iframe_api` は 6 組とも読めた（CORP `cross-origin`）。読めないのは埋め込みの文書で、COEP を `report-only` でしか付けていないため（headers.md）。

**読み違えやすい点:** Claude アプリの窓が隠れていると、ページは `visibilityState: hidden` になる。その間は YouTube が PLAYING → PAUSED → BUFFERING を繰り返し（10 秒で 380 ms しか進まず、自分で 6 回止まる）、タイマーも間引かれ、クリックも届かない。最初の試しでは credentialless の組でこれが起き、credentialless のせいに見えた。窓を表に出して測り直すと、COEP なし・普通の iframe でも同じことが起きていた。表は全て `visible` の間に測った値で、③ の JSON に `hiddenDuringSample: false` が残っている。製品でも、非表示のタブでは動画が自分で止まることがある（§2.6 の「非表示中は停止検知しない」と合う）。

## Firefox（未測。U-05 で埋める）

MDN の browser-compat-data（headers.md）による見込み:

- Firefox は `<iframe credentialless>` を持たない。属性が無視されて普通の iframe になるので、COEP の 2 組では埋め込みが読めない見込み。
- COEP なしの 2 組は読める見込み。
- Safari は COEP credentialless も持たない。

埋め方:

1. `node spikes/coep-youtube/serve.ts` を起こす。
2. Firefox で `http://localhost:5180/` を開き、6 つの組を順に「読み込む」→「再生（ミュート）」で通す。窓は表に出したままにする。
3. JSON を写して、この節を表にする。

## 結論（tech-08 の箱、decisions #57）

- YouTube の埋め込みと cross-origin isolation（SharedArrayBuffer・5 µs の時刻）が両立するのは、Chromium 110 以後の `<iframe credentialless>` だけ。
  - この属性は実験的で、Firefox・Safari に無い。
  - cookie を持たない使い捨ての文脈になる。YouTube のログイン・Premium・履歴が効かず、ページを読み直すたびに文脈が新しくなる。
- 隔離で得る物はこのアプリでは小さい。
  - 時刻の刻み 100 µs → 5 µs は、判定の 1 ms と校正の数 ms より 2 桁細かい。
  - timeStamp の粗さの問題（T-6）は 1〜16 ms の刻みで、隔離では直らない。
- **tech-08（Worker 描画と入力分離）は見送りに確定する。**
  - 落とすのは、SharedArrayBuffer のリングで入力を Worker に渡し、Worker で判定する部分（COEP が要る）。
  - COEP の要らない OffscreenCanvas の Worker 描画（postMessage で渡す）は、M-7 のフレーム間隔の p95 で長いタスクが問題になったときに、新しい案として出し直す。
- pipeline-06（分離 → 採譜、demucs-web は COOP/COEP 必須）は decisions #0 のまま見送り。COEP の条件も、Chromium で credentialless の iframe にしたときだけ満たせる。
- 製品は COEP を足さない（ADR 0004 のまま）。
