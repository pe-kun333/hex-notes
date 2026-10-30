# 相談 B: 手順 6 の描画コマンド列と「段別着地が位置で読めるか」の確認点

日付: 2026-10-30。相談役: 強いモデル（読むだけ。6 曲×2 配列の段またぎ・逆転ペアを node で数えた）。裁定: 手順 6 の着手時（2026-10-30）に主担当が裁定した（末尾の「主担当の裁定」）。

## 渡した包み

- 問い: 描画層（src/render/canvas/）を「描画コマンド列を返す純関数」と「Canvas へ流す薄い関数」に分ける設計。手順 6 の 1 日目に主担当が行う「位置で読めるか」の見方。
- 事実: 作るファイル 8 本（commands・flush・cells・hints・chords・feedback・budget・lowload）。試験はコマンド列に対して（画素差分・jsdom・ブラウザ runner は使わない）。期待値は「全図形が落下域＋鍵盤図の矩形内」「6 曲×2 配列の初期フレームのスナップショット一致」（譜面は tests/fixtures/charts/m1/）。描く物の数値（閃光 1 秒 3 回・面積 25%、低負荷 3 段、黒鍵 30°＋♯ 0.4R、塊／殻、辺ヒント 3 px・距離 2 で数字、NEAR 160 ms、判定文字 600 ms、縁 2→6 px・120 ms、色に頼らない、継ぎ目 2 px、文字 0.95R／0.62R、R<26 で角の補助なし）。読めなければ一本線を既定に戻す提案を ADR に（やり直し最大 6 日）。
- 読む物: kickoff 手順 6・§1.2・§7-23、design.md §1.3 S2・§2.2・§2.5・§2.8・§4.1・§5.1 注記、m1-geometry L379–436、m2 L327–331・L353–362、m4 L547、decisions #3・#6。

## 答えの要約

### 案

- A: 意味コマンド（cell／note／hull…）。flush が幾何を持つ → 「薄い関数」でなくなり、領域の試験が本体を検査しない。
- B: 図形プリミティブ（poly／line／rect／text、CSS px 絶対座標）。bbox・面積が座標から出る。意味の断定が読めない。
- **C（推す）**: B ＋ 印 3 つ（layer＝描く順、region＝許される領域、tag＝意味）。flush は region だけをクリップに使う。試験は tag で意味を数え、座標で領域を検査する。

### 型の骨子（commands.ts。enum なし）

- `Pt ＝ [x, y]`（CSS px、右列の箱の左上が原点。DPR は flush の setTransform）。
- `Layer ＝ 'bg'|'keys'|'hints'|'notes'|'fx'`、`Region ＝ 'fall'|'keys'|'stage'`（stage ＝ fall ∪ keys）、`Tag`（cell・label・noteName・sharp・seam・cornerAid・landingLine・hint・hintDigit・note・tail・hull・slide・edgeReturn・judgeText・flash）、`Paint`（ink・inkDim・paper・cellWhite・cellBlack・cellEmpty・pressed・hint・hull・judge:<Judgment>。実色は flush のパレット）。
- `DrawCommand ＝ Meta & ({kind:'poly'; pts; fill?; stroke?; width?; edges?: boolean[]} | {kind:'line'; a; b; stroke; width; cap?} | {kind:'rect'; x; y; w; h; r?; …} | {kind:'text'; x; y; text; px; weight; paint; align?})`。`edges[i] ＝ false` で共有辺を消す。
- 時刻は `t: {song, real}`（ms）を引数で受ける。描画層は NowFn を受け取らない。
- `buildFrame(input): {commands, budget}`、`bboxOf`、`areaOf`（poly は靴紐公式）、`canonicalFrame`（スナップショット用）。

### 描く順

bg（seam → landingLine）→ keys（段 asc → 列 asc、poly → 全鍵の後に label → noteName → sharp → cornerAid）→ hints（目標 1→2、line → hintDigit）→ notes（pass 順 tail → hull → note poly → label/sharp。各 pass 内は tLandMs desc → 段 asc → 列 asc）→ fx（atMs asc、slide → edgeReturn → flash → judgeText）。

### スナップショット（仮）

1 コマンド 1 行の JSON、キー順固定、数値は 0.01 px 丸め（−0 → 0）。置き場 `tests/fixtures/render/frames/<曲>.<layout>-<limit>-<fold>.t0.json`（12 本、toMatchFileSnapshot）。固定する入力: 箱 850×644（1366×668 相当。相談 A の裁定後の値。相談役は 800×668 と書いたが A の裁定で箱に統一する）、`ableton/2/octave`・`vmpk/2/octave`、t ＝ {0, 0}、pressed ∅、effects []、beginner、labels both。試験は最初に R ＝ 28、v ＝ 0.3587／0.3027 を断定してから照合する。

### 領域と予算の強制

型で region 必須（keys・hints・edgeReturn・slide ＝ keys、judgeText ＝ fall、notes/tail/hull ＝ stage）。flush は region が変わるたび clip。builder は tail を上端で clamp、音は tLand − t.song ≤ travel のときだけ出す。budget.ts: `admit(intents, state, nowMs, stageArea)` で直近 1,000 ms の flash ≤ 3 件、同時面積 ≤ 25%、超過は「縁 2 px 固定」に格下げ（捨てない）。縁の返しと判定文字は閃光に数えない（仮）。

### ファイルの責務と試験

8 ファイルの責務と、試験 22 行（commands／frames／cells／hints／chords／feedback／budget／lowload／flush）の入力・期待値の表は相談役の答えに有る。代表: 六角 poly の面積 3√3/2·R² ＝ 2037.08（R 28）、isConnected [A,S,D] true・[A,D] false・[A,W] true、縁 real 0／60／120／121 → width 2／4／6／なし、flash 5 件 → accepted 3・degraded 2、lowload 25 ms × 10 s → level 1。

### 「位置で読めるか」の見方

計算で分かった事: 1 段ぶんの着地 y 差 1.5R ＝ 42 px を v で割った「逆転の窓」は 668 で 140 ms、620 で 156 ms、514 で 210 ms。6 曲×2 配列では逆転ペアは scale×vmpk の 1 件だけで、最短間隔 250〜1,579 ms。試されるのは (a) 段またぎ和音の同時性（canon 13〜17/17、duet×vmpk 7）、(b) 半音階の Q↔A 交互（300 ms）。

提案（仮）: 1 日目の範囲を 2 点広げる（殻 hull の最小版、縁の返しの代役）＋ dev 専用の負荷譜面（Q↔A 交互・3.5 音/秒・20 秒）。play-dev が keydown を ±300 ms で音に対応付け dt と段を JSON で書き出す。12 本を 668 で段別→一本線、半音階・スケール・負荷譜面は 514 でも。

| 観点 | 指標 | 一本線へ戻す目安（仮） |
|---|---|---|
| 鍵の同定 | 外し率（±300 ms 内に keydown が無い／鍵違い） | 段別が一本線より 5 ポイント超悪い |
| 時刻の同定 | dt の SD（全体・段ごと） | 段別 SD が一本線 +20 ms 超、または上段 SD が最下段 +30 ms 超 |
| 順序 | 入れ違い回数 | 段別が一本線より多い（負荷譜面） |
| 同時性 | 和音の keydown 時刻差の中央値 | 段別が一本線 +30 ms 超 |
| 主観 | 読めない本数（12 本中） | 3 本以上 |

2 つ以上を満たしたら「読めない」とし ADR に数値を付けて一本線を既定に戻す提案（landing.ts の既定を line に）。1 人・1 回なので主観を優先してよい。

### 設計書への改訂案（手順 6 で裁定）

§4.1 描画層の文（layer・region・tag 付きプリミティブ、t を引数）、§2.8（閃光の定義: セル面積超の発光、縁と判定文字は数えない、超過は格下げ。仮）、§2.2（継ぎ目の形＝共有辺に沿う折れ線 2 本、段の記号は未決、R 24 で奥行きが消える帰結）、§2.5（角の補助の中身は未定義）、新 ADR「段別着地の確認方法」、kickoff 手順 6 の 1 日目の範囲、src/README.md（flush.ts だけが Canvas に触る）。

## 主担当のメモ（裁定は手順 6）

- 相談 A の裁定（R 整数化、箱 850×644、R 24 で奥行きが消える）と整合する。スナップショットの箱は 800×668 でなく A の箱にする。
- 手順 4 で入れた hex.ts には hexVerts を置いていない（kickoff の手順 6 の元）。手順 6 で hex.ts に足すか canvas/ に置くかを決める。
- 「段の記号」「角の補助」の中身は設計書に無い未決として kickoff §7 に足す候補。

## 主担当の裁定（2026-10-30、手順 6 の着手時）

新たな相談はしなかった（論点は案 C の枠の中の細部で、主担当が実装で確かめられた）。

- 採った: 案 C（プリミティブ＋layer・region・tag、Paint は名前で実色は flush）→ decisions #27。描く順はそのまま。スナップショットの入力・丸め・置き場・12 本・R と v の断定 → #28（1 行 1 コマンドを JSON の配列で包んだ）。予算の勘定（1,000 ms に 3 件、面積 25%、超過は縁 2 px、縁の返しと判定文字は数えない）→ #29。「位置で読めるか」の 5 観点と目安、負荷譜面、±300 ms の対応付けと JSON の書き出し → ADR 0006。
- 改めた: (1) 閃光の受け入れはフレームごとでなく演出を出すときに 1 回（buildFrame は {commands} だけ返す）。(2) 落ちるセルと殻は上端で多角形を切り、切り口を線の幅の半分だけ下に置く（region を builder が守る）。(3) pending の音は判定まで着地に留める。(4) 一本線のはみ出しは箱の幅まで。(5) 低負荷は 1,000 ms 超の間隔を途切れとして数え直す（相談 B に無い。browser pane で rAF が間引かれ段が落ちたのを見て足した）。
- 退けた: 案 A・B 単独（理由は答えの要約のとおり）。1 日目に「殻の最小版と縁の返しの代役」を足す案は、代役でなく本体（chords.ts・feedback.ts）を先に作ったので不要になった。
- 相談で決まっていなかった物: hexVertices は hex.ts に置く、段の記号はキー文字が兼ねる、角の補助は ♯ → decisions #30。和音の辺ヒント 2 辺の選び方・塊の黒鍵の扱い・判定文字の言葉 → #31。
- 誤り: 代表値「六角 poly の面積 3√3/2·R² ＝ 2037.08（R 28）」は計算違い。2.5980762 × 784 ＝ 2036.89 で試験を固定した。
