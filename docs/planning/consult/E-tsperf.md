# 相談 E: 入力レコードの時刻 tsPerf の出所（kickoff §7-9）

日付: 2026-10-30。相談役: 依頼文の指定は強いモデル（fable）だったが、呼び出しが利用枠の不足（HTTP 429「usage credits が要る」）で始まらなかった。依頼文の「相談を省いて decisions に仮で書いてよい」に従い、このセッションのモデル（Opus 5.5）で 3 役（ブラウザの事実の確認役〔Web〕・規則と試験の起草役・批判役）のワークフローを回し、主担当が裁定した。強いモデルに後で問い直すなら、下の包みをそのまま渡せる。

## 渡した包み

- 問い: 入力レコード `{code, tsPerf}` の時刻を (A) `Event.timeStamp`（performance.timeOrigin 基準）から取るか、(B) ハンドラ内で `performance.now()` を読むか。判定層（手順 8）は実時間で窓を比べる（相談 C: `nowAt(t_n) − tsPerf`）ので、tsPerf の刻みと遅れが判定の精度に直接効く。
- 事実: design.md §2.8 L143（入力の規則）・§4.1 L176（{code, tsPerf}）・§4.3 L186（hexnote.device の tsResolution）・§4.6 L198（device 行「timeStamp の刻み」、play 行「入力遅延中央値」）・§6.1 L305（T-4〜8「timeStamp 16.7 ms」）・§6.3 L322（M-2）。src/shared/types.ts の DeviceInfo.tsResolution・PlayTelemetry.inputLatencyMedian。m3 L647–655 は keydown で now − e.timeStamp を入力遅延として貯め、timeStamp を判定に使う。研究（judgment-ux.md L35・L196）: timeStamp の丸めは Chrome 0.1 ms、Safari 1 ms、Firefox 1 ms（resistFingerprinting で 16.667 ms）。依頼文は「Chromium では 16.7 ms 刻みのことがある」と書くが、研究では 16.667 は Firefox の RFP（確かめる対象にした）。相談 C の q̂・β（動画時刻の量子化の補正）。
- 読む物: design.md §1.3・§2.3・§2.7・§2.8・§4.1・§4.3・§4.6・§6.1・§6.3、decisions.md、m0-kickoff.md 手順 5・§2・L49・§7-9、consult/C-clock.md、research/judgment-ux.md・map.md、m3 L640–660、m1' L520–535、types.ts L215–280、tests-inventory 手順 5。
- 制約: グローバル状態なし、入力層の純粋な部分は src/input/ に DOM 無し、performance.now の直呼びは src/clock/ と src/app/ だけ（他は NowFn）、時刻は ms、vitest で期待値を固定（jsdom なし）、他実装の名前・数値はコードに書かない、決定 #0〜#24 が前提で新規は #25（仮）。
- 答えの形: 事実の確認（ブラウザ別の基準・刻み・由来、出どころ付き）、案 2 つ以上と長短、推す案と規則の最終形（tsPerf の式・妥当性の閾値、粗い刻みの見分け方と切替、量子化の補正、tsResolution の測り方、入力遅延の定義、keyup と全離しの時刻）、試験用のイベントの模型（TypeScript の型）、期待値の表（node で検算）、改訂先、事実と推測の区別、主担当が決めること。

## 答えの要約

### 事実の確認（確認役。Web、出どころは decisions #25 と docs/references.md）

| 項目 | 事実 | 状態 |
|---|---|---|
| Chromium の基準と丸め | timeOrigin 基準。timeStamp も performance.now も同じ丸め（100 µs、隔離時 5 µs）で、区間ごとの擬似乱数の閾で上下に丸める（偏りなし） | 丸めの関数は確認、timeStamp が同じ関数を通る点はコードレビューの説明と MDN から |
| Chromium の時刻の由来 | Windows は GetMessageTime を使わず、ブラウザのプロセスの UI スレッドが受け取った時刻（高分解能）。Wayland も受け取った時刻。macOS は NSEvent の時刻、X11 は X サーバーの時刻（未来と 60 秒より古い値は今に置き換え） | 確認（Chromium の BSD のファイル） |
| 「Chromium で 16.7 ms 刻み」 | 裏付けなし。粗くなりうるのは不変 TSC の無い CPU の Windows（15.625 ms、performance.now も同じ）だけ | 反証寄り |
| Firefox | 既定 1 ms、隔離時 20 µs、resistFingerprinting で max(16.667 ms, pref)（以前は 100 ms）。丸めは floor の後に種付き乱数の中点で一段上げる。performance.now も timeStamp も同じ関数・同じ種 | 確認（MPL のソース） |
| Firefox／Windows の入力時刻 | GetMessageTime 由来（ms、約 15.6 ms ごとに進む傍証あり） | コードは確認、Windows 11 の実測は未確認 |
| Safari | 2017 年に timeOrigin 基準へ（それ以前はエポック ms）。1 ms。performance.now より未来の値・長時間でのずれの報告あり | 報告として確認 |
| 合成イベント | new Event().timeStamp は performance.now と同じ軸・同じ粗さ。OS の入力時刻の刻みは出ない | 仕様と Firefox は確認 |
| 長いタスク | timeStamp は待ちを含まない（Event Timing の input delay ＝ processingStart − timeStamp）。ハンドラ内の performance.now は待ちを全部含む | 確認 |

確認役は LGPL の Blink（event.cc・keyboard_event.cc）と WebKit の Event.cpp を開いていない。起草役の答えは出どころに Blink の keyboard_event.cc・event.cc を挙げていた（開いたかは確かめていない）。裁定と実装はそれらに拠らず、出どころからも外した。

### 起草役の案（node で検算）

- 案: (A) timeStamp 単独、(B) performance.now 単独、**(C) timeStamp を既定にし妥当でない値だけ now（推す）**、(D) C に +q/2、(E) C に「ts が粗く now が細かければ now へ切替」。
- C の式: 非有限・0 以下 → now。now < ts ≤ now+20 → now（lag 0）、now+20 超 → now。now − ts ＞ 1000 → now（stale）。他は ts、lag ＝ now − ts。
- 刻み: 梯子 {100, 16.667, 1, 0.1, 0.02, 0.005} への近傍一致率 ≥0.9（重複除去後 20 値以上）。起動時の合成イベントで測り、実 keydown で上書き。8 ms 以上は注記だけ。補正はしない。
- 精度の模型（σ15 ms、早 24／遅 31.2）: B は描画 8 ms で SD 2.56、50 ms のタスク 5% で SD 6.86・最大 58 ms。

### 批判役の反論（high 2、mid 5、low 5。数値は全て別実装で一致）

- **H1（high）** Firefox 既定の Windows と不変 TSC の無い Chromium の 15.625 ms（tick）が梯子で 1 と出て、粗さを見落とす → 梯子に 15.625（許し 2 ms）を足す（既存の系列の期待値は不変）。
- **H2（high）** stale を now に寄せると、長いタスクの後に古い押下が今のノートに当たる（幻のヒット）→ stale でも ts を保ち、lag から外す。
- M1 確率的丸めの誤差は ±q の三角分布で SD ＝ q/√6（16.667 で 6.8 ms、PERFECT 89.8%）。案の 4.8 ms は一様誤差の値。
- M2 +q/2 を誤った向きに入れたときの害は非対称。tick だけ「[ts, min(ts+q, now)] の中点」を候補にし、切り捨てと確かめてから。
- M3 MISS の確定が届いていない押下に先回りする → `nowAt(t_n) + W_late < now − G`（G 仮 50 ms）を手順 8 へ。
- M4 既存の型（role、iframe、forced、Meta の全離し）を巻き戻す型の案 → 既存の型への差分にする。番号は #25 本規則、#26 入力層の細部、相談 C は #27 以降。
- M5 起動時の合成イベントは performance.now と同じ物しか測れず、実 keydown との値が行き来する → 実 keydown で測る。
- L1 now < ts ≤ now+20 の許しは tsPerf に効かず、lag 0 で中央値を隠す → ts > now は一律 now・lag null。
- L2 入力遅延中央値の中身は OS で違う（Windows の Chromium は UI スレッドから、macOS・X11 は OS から）。
- L3 推定器の限界（2〜10 ms 格子は 1、端の外れ値 2 個で 0.1、q＝0 は保存しない）。
- L4 出どころから LGPL のファイルを外す。L5 行番号の誤り（§2.8 L141 → L143、§6.1 L299 → L305）と NowFn の文言。

## 主担当の裁定（2026-10-30、decisions #25、仮）

- **採る**: 案 C ＋ 批判役の H1・H2・M1・M4・M5・L1〜L5（M3 は申し送りとして後に回す）。tsPerf ＝ timeStamp、非有限・0 以下・now より後だけ now、stale は ts を保つ。補正なし。刻みは実際の keydown・keyup の timeStamp で、梯子 {100, 16.667, 15.625（許し 2）, 1, 0.1, 0.02, 0.005}。8 ms 以上は注記だけ。入力遅延中央値は ok の lag の中央値（無ければ null、型も `number | null`）。tsResolution は推定できない間は書かない（型は省略可）。全離しは now。
- **退ける**: (A) は検査が無いと 0・エポック値・未来の値で壊れる。(B) は待ちが判定に入り、resistFingerprinting では刻みも良くならない。(D) は丸めに偏りが無く、誤った向きの害が大きい。(E) は切り替える先（now）も同じく粗い環境しか確かめられていない。起動時の合成イベントの標本取りは情報が増えないので作らない（開発ページは実 keydown で見る）。
- **後に回す**: tick の補正の候補（M2）は U-05・M-2 で切り捨てと確かめてから。MISS の確定の余裕 G（M3）は手順 8（kickoff §7-16 に申し送り）。理由ごとの件数（stale・future など）を計測に残すかは手順 12。注記の出し先（S6 の計測盤・結果画面）は M1-07・M1-12。
- **試験の系列**: tests/unit/input/timestamp.test.ts（T_i の式、S5 の確率的丸め、tick、密な 1000 点）。起草役・批判役の検算と一致した値をそのまま固定した。
- 強いモデルに問い直すなら、上の「渡した包み」に、この裁定と批判役の H1・H2 を添える。
