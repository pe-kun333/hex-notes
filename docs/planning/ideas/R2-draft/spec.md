# 既定の仕様値（R2 draft／spec）

作成 2026-10-30、起草役。前提は ideas/R2/decisions.md。各値に出どころ（map.md の節、plan.md、catalog の id、モック m0〜m5・m1'＝m1-geometry）を付ける。「仮」は推測、「測る」は実測待ち。画面の細部は screens、形式は format、順序は worktable、危険は risks に譲る。

## 1. 配列プリセット（KeyboardEvent.code → MIDI）

decisions 1・4。判定は常に code。段は上から 数字／Q／A／Z。空欄は空六角で描く。

| プリセット | 段 | code と MIDI |
|---|---|---|
| Ableton 型（入門者の既定） | A 段 白鍵 | KeyA 60, KeyS 62, KeyD 64, KeyF 65, KeyG 67, KeyH 69, KeyJ 71, KeyK 72, KeyL 74, Semicolon 76 |
| 〃 | Q 段 黒鍵 | KeyW 61, KeyE 63, KeyT 66, KeyY 68, KeyU 70, KeyO 73, KeyP 75（KeyQ・KeyR・KeyI は空） |
| VMPK 型（音域の広い曲） | Z 段 白鍵 | KeyZ 48, KeyX 50, KeyC 52, KeyV 53, KeyB 55, KeyN 57, KeyM 59, Comma 60, Period 62, Slash 64 |
| 〃 | A 段 黒鍵 | KeyS 49, KeyD 51, KeyG 54, KeyH 56, KeyJ 58, KeyL 61, Semicolon 63（KeyA・KeyF・KeyK は空） |
| 〃 | Q 段 白鍵 | KeyQ 60, KeyW 62, KeyE 64, KeyR 65, KeyT 67, KeyY 69, KeyU 71, KeyI 72, KeyO 74, KeyP 76 |
| 〃 | 数字段 黒鍵 | Digit2 61, Digit3 63, Digit5 66, Digit6 68, Digit7 70, Digit9 73, Digit0 75（Digit1・4・8 は空） |
| 原神・Sky 型 3×7 | Q／A／Z 段 | KeyQ〜KeyU ＝ 72 74 76 77 79 81 83、KeyA〜KeyJ ＝ 60 62 64 65 67 69 71、KeyZ〜KeyM ＝ 48 50 52 53 55 57 59（自然音のみ） |
| Wicki–Hayden（対照） | 全 4 段 | MIDI ＝ 48 ＋ 2·col ＋ 5·(3 − row)（row: 数字 0…Z 3、col: 左端 0）。右 +2、右上 +7、左上 +5。例 KeyZ 48, KeyA 53, KeyQ 58, Digit1 63 |

- 根拠: Ableton Live 12 の中段白鍵・上段黒鍵（map §2E、core-01）。VMPK は g_DefaultKeyMap（Z＝12）を C3＝48 に移し、1/2 ずれの段対（Z–A、Q–数字）だけを白黒の対にする（critic-01、m1' PRESETS）。原神型は Specy の MIDI 48〜83 自然音（map §2B）。W–H は Musix Pro の 3 音程（map §2D）。
- 既定のキーは JIS/US で位置も刻印も同じ 26 文字＋10 数字＋Comma/Period/Slash＋Semicolon に限る（input-08）。
- VMPK 型は Comma/Period/Slash と KeyQ/KeyW/KeyE が同音。譜面版の `keys` が位置を決め、既定は「60 以上は Q 段側」（仮。input-03 同音許容は「後」）。

## 2. 幾何

| 項目 | 既定値 | 根拠 |
|---|---|---|
| 格子 | pointy-top 正六角、段ごとに右へ 1/2 セル（ROW_OFF 0／0.5／1.0／1.5）、縦間隔 1.5·R、幅 w ＝ √3·R | Red Blob（map §4）、decisions 2、m0〜m2 共通 |
| 中心 | x ＝ left ＋ w·(gx ＋ 0.5)、y ＝ top ＋ R ＋ 1.5·R·row。鍵盤図の幅は 11.5 セル分 | 同上 |
| A–Q の継ぎ目 | VMPK 型では A 段と Q 段の間に 2 px の継ぎ線を引き「オクターブの境」と書く。Ableton 型では引かない（白黒の対が跨ぐ） | critic-01／core-02、decisions 2 |
| 物理せん断 | 設定の選択肢（1/2・1/4・1/2 ずれ、行間 1.0u）。既定にしない | decisions 2、m1' geom |
| 段ずれの自己申告 | Q–A／A–Z／数字–Q を 1/4u 刻みで入力。既定 ANSI 1/2・1/4・1/2 | tech-02、m2。ノート PC の分布は未取得（map §3） |
| 退避 | 申告値で黒鍵の位相が「合わない」と出た端末は「正六角のまま文字だけで押す」を案内 | decisions 2、m2 fallback |

- 測る: 継ぎ線 2 px が 24 px セルで読めるか（m2、実機）。

## 3. 着地（段別＋奥行き）

| 項目 | 既定値 | 根拠 |
|---|---|---|
| 着地 | 段別。セルが自分の鍵の六角に重なった瞬間が判定時刻。一本線は対照 | decisions 3、critic-02、m1' |
| 奥行き | 使う段の最下段を 1.0、1 段上がるごとに ×0.96。VMPK 型は Z 1.00／A 0.96／Q 0.92／数字 0.88、Ableton 型は A 1.00／Q 0.96 | m1' DEPTH_SCALE、plan「Z 26 → 数字 24 px で止める」 |
| 段ごとの径 | 1080p 基準 R＝28 px → 28／26.9／25.8／24.6 px。24 px を割る段が出たら R を上げるか配置を変える | feel-05、WCAG 24 px（map §2D）、m0 MIN_CELL |
| 流れる時間 | 入門者 1.5 s、音ゲー向け 1.0 s（ハイスピードで可変）。落下域の上端を段ごとに 1.5·R ずつ上げ可視時間を揃える | m1' travel、critic-02。m0 成立条件「有効 1.5 s 以上」 |
| 重なり | 手前（下）の段が上。落下セルの径は鍵盤図の 0.97 倍 | m1' drawNotes |

- 測る: 1366×768・プレイヤー 480×270 で成立する配置（m0 で左右分割＋落下は「有効 1.07 s → 不成立」。既定の配置は screens で決める）。

## 4. 辺ヒント

| 規則 | 値 | 根拠 |
|---|---|---|
| 場所と時機 | 鍵盤図の「今の目標」のセルに、着地まで ≤ 1.5 s のとき。入門者プロファイルだけ ON。落下セルには描かない | core-06、decisions 6、m1' hintFrom |
| どの辺 | 目標中心→次の目標中心の角度に最も近い辺（黒鍵は 30° 回した辺で計算） | m1' edgeToward |
| 距離 | 六角距離 d ＝ (|Δq|＋|Δr|＋|Δq＋Δr|)/2。d ≥ 2 なら辺の外に数字 d | core-06、m1' hexDist |
| 和音 | 次が和音なら構成音ごとに辺（最大 2 辺、3 音以上は数字なし）。同鍵連打は辺を出さず中央に点 | 仮（core-06 の難所） |
| 太さ | 3 px、明度で表す。足場外しの α（§12）で一緒に薄める | feel-12、critic-04。可読性は未検証 |

- 測る: 辺 3 px と数字の可読性（m1'、24 px セル）。

## 5. 和音の塊／殻

| 規則 | 値 | 根拠 |
|---|---|---|
| 同時の定義 | 譜面の拍位置が同一。時刻窓では束ねない | tech-04 の難所。同梱・MIDI 経路は拍で揃う |
| 塊 | 構成セルが六角距離 1 で全連結なら共有辺を消し一つの輪郭 | m1' isConnected |
| 殻 | 連結でなければ頂点の凸包を 1.5 px・不透明度 35%、内側 8%。段違いは奥行き順のまま殻だけ段を跨ぐ | m1' drawNotes、core-12 |
| 判定 | 構成音ごとに別判定（駒単位は採らない） | tech-04 の反論 |
| 統計 | 塊／殻／段またぎの割合を結果に出す（設定で表示） | m1' chordStats |

## 6. 黒鍵

30° 回した六角（flat-top）＋右上に ♯（0.4·R px、位置 (+0.55R, −0.5R)）。塗りは白鍵より暗い明度（m1' の #8a94ad 対 #efe9d8 相当）、色相に頼らない。鍵盤図でも落下セルでも同じで、敷き詰めが黒鍵で崩れるのは受け入れる（m1' で確認）。グレースケール確認モードを残す。根拠: critic-03／feel-12、decisions。

## 7. 判定窓

| 項目 | 入門者（既定） | 音ゲー向け | 根拠 |
|---|---|---|---|
| PERFECT／GREAT／GOOD（早い側、片側 ms） | 24／100／180 | 30／90／200 | decisions 引継ぎ。Bemuse Lv1–2、beatoraja KEYBOARD（map §4） |
| 遅れ側倍率 | ×1.3（31／130／234） | ×1.0 | feel-07、m1' lateWide。入力遅延 15〜60 ms は遅れ側に出る |
| 窓の外 | 押下は無視（空打ち発音のみ）。GOOD 遅れ側を過ぎたら MISS。BAD 段は持たない | 同 | m1' onKey |
| NEAR | 六角距離 1 の隣キーを GOOD 窓内で押したら NEAR、セルは押したキーへ半分滑る | なし | decisions 6、input-13、m1' near |
| ホールドの成立 | 音価 ≥ 500 ms（実時間） | 同 | m1' HOLD_MIN（仮） |
| 離し窓 | 終点の 1.5×GOOD ＝ 270 ms 前から離してよい | 300 ms | Quaver ×1.5（map §2F）、decisions |
| 早離し／遅離し | 「はやい」表示・尾の加点なし・コンボ維持／評価しない | 同 | m1' releaseHold、map 問い 9（仮） |

- 測る: 遅れ側 1.3 倍で UR と平均ずれの動き（m3、人工ジッタ SD 5／10 ms）。

## 8. スコア式

| 項目 | 入門者 | 音ゲー向け | 根拠 |
|---|---|---|---|
| 重み | PERFECT 1.0／GREAT 0.7／GOOD 0.4／NEAR 0.4／MISS 0 | 同（NEAR なし） | m1' GRADE_W（仮） |
| 精度% | 重みの平均 ×100。分母は判定したノート（猶予で skipped は除く） | 同 | a-02、m1' accuracy |
| ランク | SS ≥ 98、S ≥ 95、A ≥ 90、B ≥ 80、C | 同 | m1' rankOf（仮） |
| 点 | 出さない | PERFECT 1000／GREAT 700／GOOD 400 × (1 ＋ min(コンボ, 50)/100)、ホールド尾 +300 | decisions 8、m1' judge |
| ゲージ | なし | 開始 50、PERFECT/GREAT +1.5、GOOD +0.5、MISS −6、0〜100。途中終了なし | m1' life（仮） |
| クリア | 最後まで弾けば結果（合否なし） | 終了時ゲージ ≥ 70 | m1' の 70% 線（仮） |
| フルコンボ | 出さない | MISS 0（早離しは数えない） | decisions 8 |
| 比較 | 同じ譜面版（配列＋上限）の中だけ。動画あり／なしは別集計 | 同 | a-02、critic-09 |

- 測る: GOOD 0.4 で入門曲の精度%がどの帯に落ちるか（同梱曲、実機）。

## 9. 同時押し上限

| 項目 | 値 | 根拠 |
|---|---|---|
| 既定 | 2 | decisions 7、膜式の矩形 3 隅ゴースト（map §2E） |
| 診断の組 | ① Z X C ② A S D ③ Q W E ④ Q W A S ⑤ A S D F。各組を全部押したまま 1 秒 | m1' DIAG、input-05 |
| 判定 | 押下集合に全キーが同時に入れば合格。①②③ で 3、④⑤ も通れば 4。1 つでも落ちれば 2 | 推測（マトリクス配線は物理配置と一致しない） |
| 保存 | localStorage の端末プロファイル {limit, 測定日}。設定から再診断（交換は検出不能） | input-05 |
| 間引き | 同一拍の音が上限を超えたら MIDI の低い音から落とし最上声を残す | m5 buildVariant、decisions 7 |
| 譜面版 | 配列 × 上限 {2, 3}（診断 4 の端末は 4 も） | m5 variants |
| 難度指標 | 密度（音/秒）、跳躍（六角距離 平均・最大）、同時押し率、段またぎ率。注意の目安: 密度 > 3.5、最大跳躍 ≥ 6 | a-05、m5 metrics |

- 測る: 診断の組が本番の和音（C–E–G ＝ A D G）を代表するか（実機 2 台、膜式ノート PC を含む）。

## 10. 時計と同期（YouTube 経路）

| 項目 | 値 | 根拠 |
|---|---|---|
| 主時計 | performance.now()。getCurrentTime() は毎フレーム読み、値が変わったときだけ標本に | tech-01、map §2A 実測（約 15 ms 刻み） |
| 補間 | 標本 (now, raw) の最小二乗直線、窓 2 秒。span < 300 ms は直前値＋経過×rate で代用 | decisions、m3 lsq（傾き 1.00 を確認） |
| 量子化補正 | 残差 SD から q̂ ＝ √12·SD、出力に ＋q̂/2（15 ms 刻みなら ≈ +7.5 ms） | m3 の注記。floor 量子化は平均 −刻み/2 |
| 逆行・飛び | 増分が負の標本は捨てる。期待値との差 > 250 ms は seek とみなし再初期化 | tech-01、m3 jumpMs（tech-01 の 100 ms より緩い。測る） |
| 猶予 | seek・一時停止・BUFFERING・飛び・レート変更の後 300 ms は判定保留＋「同期中」帯。GOOD 窓が猶予内に終わるノートは skipped | decisions、m3 syncUntil |
| 停止検知 | 再生中なのに値が 2 秒変わらなければ動画なしモード（performance.now 単独、rate 維持）。動き出したら戻すボタン | decisions、m3 enterNoVideo |
| レート変更 | onPlaybackRateChange で再同期（猶予 300 ms）。判定窓は実時間で固定（曲時間では ×rate） | learning-03、m4 dtReal、setPlaybackRate 非保証（map §2A） |
| 背景タブ | visibilitychange で一時停止 | map §2F |
| 目標 | 補間後の残差 SD < 5 ms | tech-01 |
| 自前音源 | 同じ ClockSource の裏を AudioContext.currentTime に替え、補間なし | decisions 0 |

- 測る: 実 IFrame で Chromium・Firefox の残差 SD と UR（m3、限定公開クリック動画）。広告中断時の値の動き（製品の動画、a-01）。

## 11. 校正（二段）

| 段 | 値 | 根拠 |
|---|---|---|
| 初回 | メトロノーム 100 BPM・予備 4 拍・24 打。SD < 30 ms のときだけ平均を適用、以上なら拒否して参考値。打数不足も不適用 | StepMania AutoSync（map §2F）、m3 finishCal |
| プレイ後 | ヒット ≥ 8 で平均ずれを 1 ms に丸めて提案。|平均| < 10 ms は出さない | lazer 型（map §2F）、m3 onEnd。10 ms は仮 |
| 範囲・保存 | −120〜+120 ms、1 ms 刻み。音源種別（youtube／local）ごとに別保存 | m3 clamp、feel-08（出力装置は取れない） |
| 計測盤 | 入力遅延・フレーム間隔 SD・時計残差 SD・UR を設定の「計測」に出す | tech-14、m3 |

## 12. 足場外し

| 項目 | 値 | 根拠 |
|---|---|---|
| 単位 | 音高ごとの透明度 α ∈ [0, 1]、初期 1。配列プリセットごとに別の表（仮） | learning-05、m4 fade |
| 更新 | 自力かヒント付きで当てた: α −0.12。外した: α +0.30。NEAR は変えない | m4 classify |
| 閾 | α < 0.2 で「ラベル無し」扱い | m4 labelVisible |
| スイッチ | 鍵盤側／ノート側を別々に 常時／成績連動／無し | Synthesia 型（map §2D） |
| 自力率 | 自力 ÷ 判定数。自力＝両ラベルが無し（α < 0.2）で正しいキー／ヒント付き＝どちらかが見えていた／NEAR＝隣キーで GOOD／外した＝窓を逃した、または待ち中に違うキー（その後当てても自力にしない） | decisions 6、m4 |
| 保存 | localStorage（プリセット → MIDI → α）、セッションをまたぐ | m4 save |

- 測る: −0.12／+0.30 の振動（m4、3 曲連続）。

## 13. 待ちモード（3 種）

| モード | 挙動 | 根拠 |
|---|---|---|
| 音待ち | どのノートでも着地で止まり、正しいキーで進む。YouTube 経路ではフレーズ（2 小節）の間 pauseVideo したまま自前音で弾き、終わったらその区間を動画で 1 回流す（1 音ごとの pause/play はしない） | learning-01、m4。seek 後 210〜260 ms（map §2A） |
| フレーズ待ち（既定） | 2 小節の頭で最初の音が未処理なら止まり、正しい最初の音で再開。0.3 s 巻き戻し＋250 ms の空白。YouTube 経路は猶予 300 ms | m4 REWIND／GAP_MS |
| 固定テンポ | 止まらない。窓を逃せば MISS | m4 |
| 共通 | 待ち中の誤打は「外した」に分類。待ちモード中は精度%のみ（ランク・ゲージ・フルコンボは固定テンポ 1.0 倍だけ） | m4 tainted、learning-03 |

## 14. ループとテンポ段

| 項目 | 値 | 根拠 |
|---|---|---|
| 自動ループ | 2 小節のフレーズで MISS 3 回 → その区間をループ。1 小節前からカウントイン。ノーミス 2 周で解除 | learning-02、m4 autoLoop（解除は仮） |
| 頭出し | 区間の頭 − 流れる時間 − 0.1 s へ seek | m4 seekToBar |
| テンポ段 | YouTube 0.5／0.75／1.0／1.25。動画なし 0.5／0.6／0.75／0.9／1.0／1.1／1.25 | map §4（0.25 刻み）、m4 TEMPO_STEPS |
| 自動昇降 | 2 小節ごとの正答率（判定 ≥ 4 音）: > 90% で上げ、< 70% で下げ。上限 1.25 | learning-03、m4 evalPhrase |
| 切替時 | 跳んだ位置を 0.8 s 白点線で残す。YouTube 経路は再同期の猶予 300 ms | m4 jumpGhosts |
| 記録 | 1.0 倍・固定テンポだけを成績に記録 | learning-03 |

## 15. セル寸法と文字

| 項目 | 値 | 根拠 |
|---|---|---|
| 径 | 1080p で R ＝ 28 px（幅 48.5、高さ 56）。最小 24。R ＝ min(28, (舞台幅 − 32)/(11.5·√3)) | feel-05、WCAG、m0／m4 layout |
| 文字 | キー文字 太字 0.95·R px 中央、音名 0.62·R px（両方なら上下）、♯ 0.4·R px 右上 | m1'／m4 drawLabel |
| 角の補助 | 上＝段の印（数字 ○／Q ◐／A ●／Z ◆、仮）、左下＝手 L／R、右下＝指番号（後）。R < 26 で消す | feel-05 |
| 色 | 段は辺の模様・明度、手は塗りの明度、色相は Okabe–Ito から 3 つ以内 | feel-12、色覚 8〜10%（map §2D） |

- 測る: 流れる文字の可読性の下限 24／26／28 px（m0、実機 1366×768）。

## 16. 演出予算

閃光 1 秒 3 回以下、同時に光る面積は画面の 25% 以下（合算）。ヒットの光はセル内のみ、縁 2 → 6 px を 120 ms。100 ms 以内のヒットは 1 回に束ねる。全画面演出はコンボ 50 の倍数とクリア時だけ、10 秒に 1 回まで。判定文字は鍵盤図の上に 600 ms で消える小さな文字（中央ポップアップなし）。根拠: feel-11、feel-12、WCAG 2.3.1、m3。

## 17. 入力

| 項目 | 値 | 根拠 |
|---|---|---|
| 判定の鍵 | KeyboardEvent.code。押下集合で keyup と対応付け | input-08 |
| リピート | e.repeat または押下集合に既にある code は捨てる | input-09（Chrome ≤136 の repeat 誤 false の保険） |
| IME | keyCode 229／isComposing／key "Process" で一時停止し、半角/全角キーを案内 | input-09、map §2E |
| 禁止の code | Backquote, KanaMode, Convert, NonConvert, CapsLock, Lang1/2, Meta, F1〜F12, Escape（一時停止専用） | input-09 |
| フォーカス | iframe に焦点が移ったら戻す。blur／visibilitychange で一時停止＋押下集合を空に。disablekb=1 | input-09、m1' blur |
| 刻印 | getLayoutMap（Chromium・HTTPS）→ 無ければ配列選択 UI（JIS／US）。code が空の端末はタッチ鍵盤「後」 | input-08、map §2E |
| 修飾キー | 使わない（Shift 黒鍵は「後」） | plan 箱分け |

## 18. YouTube の使い方

埋め込みの条件（decisions 0・5、map §2A）:

| 条件 | 値 |
|---|---|
| プレイヤー | IFrame Player API、click-to-play、playsinline=1、disablekb=1、controls は既定（controls=0 と標準機能の非表示禁止の関係は未解決） |
| 寸法 | 既定 480×270、最小 356×200（16:9）。200×200 を割らない |
| 重ね | 矩形の前に何も置かない（一時停止・結果・同期中の帯も外）。半分超が可視になるまで再生しない |
| 音 | 動画の音だけ。「ピアノ音を重ねる」トグルは動画ありでは出さない。打鍵音は誤打のみ −18 dB・300 ms（仮、tech-10） |
| 失敗 | onError／埋め込み不可／時計 2 秒停止 → 動画なしモードへ自動で落ちる |

報酬の切り離し（source ＝ youtube のプレイ。business-07、III.F.3.c）:

| 画面 | 出す | 出さない |
|---|---|---|
| 結果 | 精度%・ランク・判定内訳・UR・平均ずれ・自力率 | XP、ストリーク更新、称号・実績、ランキング送信、デイリー達成 |
| 選曲 | 曲名・難度指標・自分の過去の精度% | ランキングのタブ、デイリーの印 |
| ホーム | local／licensed のストリークとデイリー | YouTube プレイを含めた集計 |
| 設定 | 動画 ID の紐づけ・解除 | 「YouTube プレイにも XP」の類のフラグ（持たない） |

保存は IndexedDB のローカルのみ。

## 19. 同梱曲

| 項目 | 値 | 根拠 |
|---|---|---|
| 権利 | PD（作曲者没後 70 年、校訂版を使わない）、CC0、CC BY、自作曲。NC・ND・SA は入れない | map §2A・§2B（Mutopia、IMSLP の校訂版は別権利） |
| 本数 | 初版 12 曲（チュートリアル 3＋入門 9）、目標 30 | critic-08（30）、report §8（まず 10 曲ほど）。12 は仮 |
| 譜面版 | 曲ごとに Ableton×{2, 3}、VMPK×{2, 3} の 4 版。チュートリアル 3 曲は原神型と W–H も | §9、decisions 1・4 |
| 音源 | 自前（Web Audio 合成、または CC BY 3.0 の Salamander 30 音）。動画 ID は任意で紐づけ、無くても全機能 | map §4、critic-09、decisions 0 |
| 初回導線 | 配列選択→同時押しテスト→校正→チュートリアル曲（鍵数 5）。同期タップは出さない | decisions 9、a-03 |

## 20. 確定事項との衝突

今回の値に decisions と反するものは無い。判断を仰ぎたい境界（VMPK 型の同音の既定、足場外しの表をプリセット別に持つか、YouTube 経路の打鍵音、同梱 12 曲、飛び閾 250 ms）は open_points に書いた。
