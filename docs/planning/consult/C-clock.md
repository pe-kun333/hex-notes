# 相談 C: 手順 7 の時計層の条件（§7-8・§7-18）

日付: 2026-10-30。相談役: 強いモデル（読むだけ。傾きと提案規則の素描をダミー動画で回して検算した）。裁定: **記録だけ**。手順 7 の着手時に主担当が裁定する（kickoff §7-8・§7-18 に「相談済みの提案」と注記）。

## 渡した包み

- 問い: 時計層（src/clock/）の補間・量子化補正・飛び・猶予・停止検知の条件を §2.6 と決定 #11 に合わせた最終形にする。
- 事実: m3 の lsq（2 秒窓）、clk.feed（変化時だけ標本、期待値との差 >250 ms で飛び、span ≥ 1000 で q̂ ＝ min(50, √12·SD) を +q̂/2）、timeAt（span ≥ 300 で外挿、短ければ直前値＋経過×rate、逆行なし）、resync（300 ms 猶予、t < T+0.3 を skipped）、frame（2 秒不変で動画なし）。§2.6 の手直し（pauseVideo 要求→500 ms 以内に PAUSED で S7c、でなければ広告中、非表示中は検知しない、窓は実時間、skipped は「猶予内に窓が終わる」）。未決 §7-8（pauseVideo を呼ぶ層）、§7-18（q̂ の条件、傾き 0.99986 未検算）。手順 7 の期待値（jump +300／+200、stuck 3 s → 2,000 ms、never、visible false）。
- 読む物: design.md §2.6・§4.2・§1.3 S7・§4.1、decisions #11、kickoff 手順 7・§7-8・§7-18、m3 L278–302・L321–384・L443–445・L599–610、tests-inventory 手順 7、references.md。

## 答えの要約

### 案と推し

- API: A-1 コールバック ／ **A-2（推す）tick の戻り値**: `tick(sample: VideoSample | null): ClockOutput`（t・phase・events・requests・canReturn）。now は注入した NowFn で 1 tick に 1 回。要求は値で、結果は次の tick の `sample.state` で戻る。
- 補間と q̂: B-1 モックのまま（再アンカー 1 秒後に +7.5 ms 跳ぶ、ジッタで膨れる） ／ B-2 固定 15 ms ／ B-3 足さない（譜面の sync.offset に作者環境の −q/2 が混じる） ／ **B-4（推す）推定＋格子ゲート＋持ち越し＋係数 β**。
- 停止検知の層: C-1 時計層が pause() を直接呼ぶ ／ **C-2（推す）要求を返し、結果は state 標本**（YouTube 層が pauseVideo を呼ぶ。呼べなかったときだけ controlResult ok:false） ／ C-3 app 層が検知（§4.1 と食い違う）。

### 規則の最終形（ms）

- 標本の受け入れ（jump.ts）: 読みが同じ → 標本にしない。逆行 0 < d_back ≤ 250 → 捨てる。fresh（再アンカー後まだ読みが変わっていない）なら dev を見ずに受け入れる。|dev| > 250 → 飛び（jump イベント、raw で再アンカー。猶予中なら再始動）。境界 250 は飛びでない（厳密 >）。
- 当てはめ（fit.ts）: 窓 2000 ms（2 点は残す）。最小二乗で (a, b)。span ≥ 300 かつ n ≥ 2 で採用、でなければ a ＝ rate、b ＝ raw_last − rate·now_last。fresh の間は t ＝ raw_anchor を保持（外挿しない。モック holdFresh を固定仕様に）。出力 t ＝ a·now ＋ b ＋ β·q̂、PLAYING 中は逆行させない、PAUSED／BUFFERING／held では保持。novideo は (a, b) 凍結。
- q̂: span ≥ 1000 で q̂_sd ＝ min(50, √12·SD)。格子率 L（正の増分が q̂_sd の整数倍 ±1 ms に乗る割合）≥ 0.8 なら q̂ ＝ q̂_sd、未満なら 0。再アンカーで 0 に戻さない（持ち越し）。β 既定 0.5（切り捨て仮定。四捨五入なら 0。読みだけからは判別できないので M3-07 で外部基準と比べて決める）。ジッタ σ で q̂_sd ≈ √(q²＋12σ²)（σ 3 ms で 18.1）。
- 状態機械: init → grace（300 ms、再アンカー毎に再始動）→ locked（visible・PLAYING・凍結 ≥ 2000 → pauseReq）→ pauseReq（500 ms 以内に PAUSED → novideo、満了 → ad、controlResult ok:false → 即 ad）→ ad（読みが動く → grace、さらに 2000 ms 凍結 → 再要求（周期 2.5 s、仮）、遅れて PAUSED → held（仮））。held（PAUSED／BUFFERING／ENDED。停止検知しない）→ PLAYING で grace。novideo → return 命令（手動）かつ canReturn（now − lastChange ≤ 2000）で grace。可視 false→true で lastChange ＝ now。
- skipped: `nowAt(t_n) ＋ W_late ≤ graceUntil` なら skipped（W_late は実時間の遅れ側窓、入門者 234 ms）。判定窓は `nowAt(t_n) − tsPerf` を実時間で比べる。
- audio-bridge.ts: getOutputTimestamp の (contextTime, performanceTime) で perf↔context を換算。無い環境は (currentTime, now ＋ outputLatency·1000)。AudioContext は注入せず数値だけ受ける。
- ダミー動画: `DummyVideoOptions {stepMs 15, quant 'floor'|'round', rate, durationMs, pauseLatencyMs | 'never', seekFreezeMs 240, freezeHold, visible, backMeanMs, backMaxMs 10, seed}`。`read(now)`、`play`、`pauseVideo`、`seek`、`jump`、`stuck`、`setRate`、`setVisible`、`setState`、`trueTime`。生成式は答えの §3.8。

### 期待値（node で検算）

| 項目 | 条件 | 期待値 |
|---|---|---|
| lsq の傾き | x_i ＝ i·2000/120（i ＝ 0..120、位相 0）、y_i ＝ floor(x_i/15)·15 | **0.99986452（toBeCloseTo(0.99986, 5)。保つ）**。切片 −6.393、残差 SD 4.309、q̂ 14.93、格子率 1.0。位相を変えると 0.999865〜1.000102。四捨五入なら 1.000023 |
| 飛び | 60 fps、1500 ms 後に jump(+300) | jump イベント、grace 再始動、+300 で locked |
| 飛びでない | jump(+200) | イベント無し |
| 境界 | dev 250／251 | 飛びでない／飛び |
| 逆行 | backMeanMs 600、backMaxMs 10 | 標本に入らない。出力−真 平均 +0.71・SD 0.19 |
| 停止検知 | stuck(3000) | 最後の変化 L から 2000 ms の最初の tick で pause 要求 |
| 切替 | pauseLatencyMs 100 | 要求 +100 の tick で PAUSED → novideo |
| 広告模擬 | 'never' | +500 で adSuspected、以後 novideo に入らない |
| 非表示 | visible false | 要求もイベントも無し |
| 遅い PAUSED | pauseLatencyMs 700 | +500 で ad、+700 で held（仮） |
| seek 凍結 | seek(10000) at 1500、freeze 240 | 1740 まで 9990 を保持、凍結明けに jump を出さない（freezeHold true／false とも） |
| q̂ の係合 | 15 ms 切り捨て、60 fps、3 s | span<1000 で q̂ 0、以後 15.0±0.3。出力−真 平均 +0.70・SD 0.21（生の読みは −6.75） |
| 四捨五入 | quant round、β 0.5／0 | 出力−真 +7.5／≈0 |
| 格子率 | 切り捨て／連続＋ガウス 3 ms | 1.0／≈0.13 |
| skipped | W_late 234、再アンカー R | nowAt(t) ＝ R＋50 → skipped、R＋70 → pending |

### 改訂先（手順 7 で裁定）

design.md §2.6（fresh 保持、|負の増分| ≤ 250 は捨て >250 は飛び、+β·q̂ と格子率・上限・持ち越し、凍結の計時と可視復帰、再要求周期、猶予中の飛びはタイマー再始動）、§4.1・§4.2（pause 要求と state の結果、「広告中とみなす」副状態）、decisions 新行（tick 戻り値型、要求→state、q̂ B-4。確定扱い: 250・300・2000・500。仮: β 0.5、上限 50、格子率 0.8、再要求 2.5 s、遅い PAUSED、refresh 周期）、tests-inventory 手順 7（傾きの生成式と 0.99986452）、kickoff §7-18（傾きを自作値から外す）、references.md（research/youtube-iframe の所在、切り捨てか四捨五入かは未計測）。

推測: getCurrentTime が切り捨てであること、seek 凍結中に真の時刻が止まること、広告中は PLAYING のまま pauseVideo が効かないこと、格子率 0.8・上限 50・再要求 2.5 s は自作値。research/youtube-iframe はリポジトリに無い。

## 主担当のメモ（裁定は手順 7）

- 「傾き 0.99986」は検算で保てる（生成式を台帳に書く）。kickoff §7-18 の自作値一覧から外せる。
- 相談役が書いた「decisions #24」は番号の提案で、手順 4 で #24 は R と v の式に使った。手順 7 の行は #25 以降。→ 2026-10-30 手順 5 で #25（tsPerf、相談 E）・#26（入力層の細部）を使ったので、手順 7 の行は #27 以降。
- docs/planning/research/ に youtube-iframe.md は無い（2026-10-30 に確認。13 話題の中に無い）。references.md の「YouTube IFrame の時刻」の出どころを手順 7 で直す（所在か「自前計測、切り捨てか四捨五入かは未計測」）。
