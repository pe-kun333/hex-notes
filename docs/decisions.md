# 確定事項（R2 の前提）

確定 2026-10-30。report.md §7 の仮判断を利用者が「仮判断で進める」として採用した。以後の計画・設計はこれを前提にし、変えるときは本ファイルを改訂する。

## 判断

| # | 論点 | 決定 | 帰結 |
|---|---|---|---|
| 0 | 音符データの主経路と対象層 | 同梱曲（PD・CC・自作曲）＋ MIDI 持ち込みを主経路。YouTube は再生と導線だけ。既定の対象層はピアノ入門者、音ゲー層はプロファイル切替で受ける | 音声解析は製品に入れない。初日に遊べる曲を同梱する。「動画なし」でも全機能が動く |
| 0' | 六角は見た目か意味か | 混在。ピアノ型を既定にし、隣接の意味は「辺で次を指す」（方向）だけ。Wicki-Hayden は対照条件として残す | 六角クラスタ・隣接連鎖の実績は装飾に留め、ゲーム性の芯にしない |
| 1 | 既定の鍵割り当て | Ableton 型（A 段白鍵＋Q 段黒鍵）を入門者の既定。音域の広い曲は VMPK 型（2 段×2）。両方をプリセットに持つ | 譜面は「配列＋同時押し上限」ごとの譜面版を持つ |
| 2 | 六角格子と物理千鳥のずれ | 画面は正六角格子（1/2 ずれ）のまま。A–Q 間の 1/4 ずれは「オクターブの継ぎ目」として意味付ける。合わない端末は「正六角のまま文字だけで押す」退避 | 物理せん断の描画は設定の選択肢に残すが既定にしない |
| 3 | 着地線 | 段別着地（セルが自分の鍵にはまる）＋奥行きを既定。一本線は対照オプション | 同時性は和音の塊／殻で補う |
| 4 | Wicki-Hayden の位置づけ | 対照条件として固定プリセットに残す。相互変換層は後 | 等方性配列の特許クリアランスは製品に載せると決めたときだけ |
| 5 | YouTube 経路の継続設計 | YouTube 再生のプレイには XP・ストリーク・ランキングを付けない。継続設計は同梱曲と動画なしモードに寄せる | スコア表示自体は残すが、称号・デイリー・ランキングは自前音源のプレイだけが対象 |
| 6 | 隣接許容 NEAR と足場外し | 分ける。NEAR は難易度に固定（入門者 1、音ゲー向け 0）。足場外し（ラベルの透明度）は成績連動 | 自力率の分母: ラベル無しで当てた／ヒント付き／NEAR／外した の 4 区分 |
| 7 | 同時押し上限の既定 | 2。同時押しテストを通過した端末だけ 3〜4 | 譜面は上限ごとに間引いた版を持つ |
| 8 | スコア式とクリア条件 | 入門者は精度%とランクだけ。ゲージ／ライフ／フルコンボは音ゲー向けプロファイルだけ | 比較可能性は同じ譜面版の中だけ |
| 9 | 初回導線の同期タップ | 出さない。初回は同梱曲で終え、持ち込みは 2 回目以降 | 初回 5 分の導線: 配列選択→同時押しテスト→校正→チュートリアル曲 |

## 計画からそのまま引き継ぐ既定値

- 判定窓: 入門者 24/100/180 ms（Bemuse Lv1–2 風）＋遅れ側 1.3 倍。音ゲー向け 30/90/200 ms（beatoraja KEYBOARD）。ホールドは離し窓を広く（Quaver ×1.5 型）。
- 時計: performance.now で単調に進め、動画時刻（約 15 ms 刻み）で周期補正（最小二乗 2 秒窓を既定）。seek・一時停止・広告の後は 300 ms の猶予。時計が 2 秒止まったら動画なしモードへ自動切替。
- 校正: 二段（初回はメトロノーム 24 打→SD<30 ms のときだけ適用。以後はプレイ後に平均誤差を提案）。
- 譜面形式: hexnote-chart/1（音高譜・拍パルス・同期の三層）。位置譜 keys は配列ごとの譜面版が持つ。
- セル寸法: 1080p で size 28 px、最小 24 px。黒鍵は 30° 回した六角＋♯。色に頼らない（段の記号・明度）。閃光は 1 秒 3 回以下、全画面演出は節目だけ。
- 入力: KeyboardEvent.code、repeat 捨て、IME 中（keyCode 229）は無視、刻印は getLayoutMap か配列選択 UI。
- ライセンス: 本体は MIT／MPL／Apache の部品だけ参照し自前実装。AGPL／GPL のコードは取り込まない（Falling Nikochan・Bemuse・Specy・beatoraja は仕様の参考に留める）。
- 配布: Web（PWA）を先に、Tauri は後。

## 追加の確定（2026-10-30。design.md §8 の確認事項 6 件を、利用者が全て案 (a) で採用）

| # | 論点 | 決定 | 帰結 |
|---|---|---|---|
| 10 | 初回読込の上限 | 10 MB（仮。実測で見直す） | Salamander は間引き版を遅延読込。M0-08 の完了条件に入れる |
| 11 | 動画ありの練習室で「フレーズ待ち」を出すか | 出さない | 動画ありでは待ちモードを一切出さない。プログラムからの pause／seek／play は再開・ループ頭出し・停止検知の 3 用途だけ（リスク L-5） |
| 12 | 譜面版 id に折り畳み fold を含めるか | 含める | 譜面版＝配列×同時押し上限×fold。決定 #1 の「配列＋上限」を拡張する |
| 13 | 同梱曲への動画 ID 紐づけ | 初版は無し | 同梱曲は自前音源だけで遊ぶ。紐づけの受入基準は M3 で定義 |
| 14 | 同期タップ M2-02 の置き場 | M2 のまま。ダミー時計＋同梱音源で検証 | 実動画での検証は M3-07 で行う |
| 15 | 計測 M-3 で上限 3 以上の端末が 70% 超のとき | 「既定 2、通過端末は 3 を自動選択」への改訂提案を出す | 決定 #7 は計測結果で改訂しうる。改訂は本ファイルで行う |

## M0 着手手順からの確定（2026-10-30。m0-kickoff.md §7 の提案 1〜4 を主担当が採用）

| # | 論点 | 決定 | 帰結 |
|---|---|---|---|
| 16 | 取り込めるライセンスの範囲 | MIT／MPL-2.0／Apache-2.0 に加え、BSD-2-Clause／BSD-3-Clause／ISC／CC0-1.0／Unlicense／0BSD を許可。GPL／AGPL／LGPL／不明は拒否。CI の `--onlyAllow` はこの一覧 | 既定値「MIT／MPL／Apache のみ」の拡張。フォント（OFL）と音源（CC BY、帰属表示付き）は assets 側で別管理。開発依存にだけ BlueOak-1.0.0 と CC BY のデータ（caniuse-lite、spdx の一覧）を追加で許す（リポジトリの ADR 0002、2026-10-30） |
| 17 | M0 作業表の手直し | 配列の code→MIDI 表は M0-02 前半へ前倒し（M0-07 は段ずれ・刻印・位相・退避だけ）。一本線へ戻すときのやり直し最大 6 日は 31 日の外の予備。鍵数制限の実行時フィルタは M0 では型だけ、本体は M1-10 | design.md §5.1 に注記。手順は m0-kickoff.md の 14 手順・累積 31 日 |
| 18 | 同梱曲の権利の語彙（m0-kickoff.md §7-15） | 譜面の `source.rights` を `pd｜own｜cc0｜cc-by｜private` に広げる（§2.9 の「PD・CC0・CC BY・自作」に揃える）。CC BY は `source.license {id, holder, url}` が必須 | design.md §3.2 を改訂。権利表（content/charts/RIGHTS.md、ADR 0005）の license 列との対応: PD→pd、own→own、CC0-1.0→cc0、CC-BY-4.0／3.0→cc-by。M0-01 で確定（2026-10-30） |

次の段階: M0 整備に入る。着手手順は docs/planning/m0-kickoff.md（リポジトリの初期化コマンド列と 14 手順）。モックの部品を層ごとに移植する。

## M0 の実装中に確定（手順ごとに追記）

| # | 論点 | 決定 | 帰結 |
|---|---|---|---|
| 19 | 譜面 id の canonical JSON と ms 表（m0-kickoff.md §7-5・§7-6。手順 2、2026-10-30） | canonical JSON は `{format, notes[{midi,beat,dur}], pulse{resolution, tempo[{beat,bpm}]}}` の入れ子・キー順、空白なし、数値は `Math.round(x·10⁴)/10⁴`（四捨五入。m5 の r4）、notes は正規化後の順。ms 表は float のまま、区間の開始 ms を Δbeat×60000/bpm で累積 | design.md §3.3 に明記。実装 src/chart/hash.ts・mstable.ts、見本 id は tests/unit/chart/hash.test.ts に固定。§3.2 に検査の規則（notes 1 つ以上・同拍同音なし・vel 整数・tempo 先頭 beat 0・上限）を追記 |
| 20 | 間引きと重複の比べ方（design.md §2.4「低い音から落とし最上声を残す」。手順 3、2026-10-30。仮を外した: 2026-10-30、相談 D） | 原曲音高（notes[].midi）で比べる。同拍で同じ音高へ畳まれた音は原曲音高の高い方を残し、同拍の数が上限を超えたら原曲音高の低い方から落とす。同拍は 1/resolution の tick | m5・m1' は畳んだ後の音高で比べる（m5 は重複で低い方を残す）。canon の [54,57,61]・ableton・上限 2 で m5 は元の最上声 61 を落とすが、本規則は残す。落とす音が配列で変わりにくい。実装 src/chart/variants.ts、見本は tests/unit/chart/variants.test.ts。変換器は m5 の選択をそのまま写す（#22）。根拠（相談 D、docs/planning/consult/D-decisions-20-23.md）: canon・ableton・上限 2 の 17 和音で本規則は原曲の最上声を 17/17 残し、m5 の規則は 11/17。落とす音が ableton と vmpk で同じ（m5 は 12 和音で違う） |
| 21 | 同音の鍵の既定（design.md §2.1「VMPK 型の同音は keys が決める（既定 60 以上は Q 段側）」を全配列へ。手順 3。vmpk・ableton・genshin は確定（2026-10-30、相談 D）、wicki だけ M-10 まで仮） | 候補が複数なら 60 以上は上の段、60 未満は下の段（KEY_ROWS の段の順）。vmpk の 60〜64 は全て Q 段・数字段、wicki は 58 → KeyN、65 → Digit2 | m5・m1' の「前の音から六角距離が最小」は前後の音で鍵が変わるので採らない（同じ音はいつも同じ鍵）。W–H は対照・計測用（#4）なので跳躍が増えてもよい。M-10 で W–H の塊率を測るときに見直す。根拠（相談 D）: 6 曲×上限 2・3 の 12 件で「六角距離最小」が跳躍の合計・最大を減らした件は 0、悪化 4 件（canon 20→28／2→4、duet 22→26／5→8）。m5 では duet・scale で同じ音高に 2 つの鍵が付く。wicki は 6 曲で差が chroma の合計 84 vs 83 だけ（「跳躍が増えうる」は観測されず） |
| 22 | m5 変換器の細部（design.md §3.3 の変換器。手順 3。仮を外した: 2026-10-30、相談 D。変換器は M0 の照合専用で、製品の取り込み（M2-01）には使わない） | 入力は m5 内部表現（song と buildVariant の戻り）。notes は src の原曲音高（beat は 1/resolution に丸め、tick 昇順・同 tick は midi 昇順、同 tick 同音は最初の 1 つ）。vel は m5 の 0..1 → round(×127)（mel 0.8 → 102。parseMidi も m5 L308 で max(0.3, v/127) の 0..1）。keys は m5 が選んだ鍵のまま、落ちた音は null。同 tick で鍵が重なる・上限を超える入力（m5 の 1e-3 の塊と tick がずれる手作りの拍）は拒む。garage→ableton、fl→vmpk、harmonic は拒む。m5 の metrics・stats は生の値のまま variants[0] に写し（同 tick 同音をまとめた後の notes・keys とは合わないことがある）、warnings は外す。hand は ext.hand（折り畳み後の音高で 60 以上が R、落ちた音は null）。sync は動画 ID があれば youtube の 1 本、無ければ空。source の既定は {kind midi, rights private}。出力は validateChart を通した物だけ | kickoff 手順 3 と §3 移行表の「parseMidi 経路 0–127 → そのまま」「notes は out[].orig」は m5 の実装と食い違うので本行を正とする（元の速度を残すのは M2-01 の SMF パーサー、kickoff §7-22）。keys は m5 の規則（#20・#21 と違う）で選ぶので、同じ chartId・variantId でも src/chart/variants.ts の版と keys が違いうる（canon・ableton/2/octave で 24 か所、8 曲×4 配列×3 折り畳み×上限 2〜4 で 288 件中 113 件）。変換器の出力は M0 の照合用で、charts・results に保存しない。同梱曲と持ち込み曲（M2-01）の版は variants.ts で作る。変換器を製品の取り込みに使うと決めたときは keys を buildVariant で作り直し、m5 の鍵は ext へ移す。実装 src/chart/convert-m5.ts、照合は m5 の JSON 出力（tests/fixtures/m5-json）。根拠（相談 D）: 288 件中 113 件の不一致の内訳は #21 由来 99（wicki 63・vmpk 36）、#20 由来 14（全部 ableton の canon・duet）、m5 の先頭音 cands[floor(len/2)] 由来 0。未知の差は無い |
| 23 | 同梱曲の自動生成 4 版の fold（design.md §2.9 は配列と上限だけを書く。手順 3。仮を外した: 2026-10-30、相談 D） | octave（ableton/2・ableton/3・vmpk/2・vmpk/3 の全てを octave で作る） | m5 の既定 state（L370）と設計の例 ableton/2/octave に合わせた。#12 は fold を id に含めると決めただけで、§8-3 の (b)「octave に固定」は退けた案なので、持ち込み曲は S5 段 3 の選択に従う（§1.3）。実装 src/chart/variants.ts の BUNDLED_VARIANT_SPECS、フィクスチャ tests/fixtures/charts/m1/。M1-01 で cut・nearest の版が要る曲が出たら見直す。根拠（相談 D）: 6 曲とも vmpk では 3 fold の keys が完全に同一。ableton では octave が最も落とさない（canon null 17／cut 27／nearest 19、duet 1／9／4、scale 0／14／0）。3 fold を全部作ると同じ keys の版が別 id で並び記録が分かれる（#8） |
| 24 | R と v の式（design.md §2.5。m0-kickoff.md §7-7、手順 4、2026-10-30、仮。相談の記録 docs/planning/consult/A-sizing.md） | (a) 右列の箱（W_col ＝ 視口幅 − プレイヤー幅 − 36、H_col ＝ 視口高 − 24。視口は innerWidth × innerHeight の CSS px）で書く: R_w ＝ (W_col − 32)/(c_n·√3)、R_h ＝ (H_col − 8 − 1500·v_min)/k_n、D ＝ H_col − 8 − k_n·R、v ＝ D/T。c_n ＝ max(段ずれ) − min(段ずれ) + 10（2 段 10.5、4 段 11.5）、k_n ＝ 2 + 1.5·(段数 − 1) は配列の rowsUsed から導く。(b) R ＝ clamp(24, 28, ⌊min(R_w, R_h)⌋) の整数 px。(c) R は T0 ＝ 1500 ms で決め、プロファイル（T 1500／1000）で変えない。v だけが T で変わる。(d) 段別着地は全段同じ v・同じ時間写像 y ＝ 段の中心 − v·(着地 − 今) で、箱の上端でクリップする（spec 草稿 L44 の「上端を 1.5·R ずつ上げる」は採らない）。可視時間は上段 (D + R)/v 〜 最下段 (D + (k_n − 1)·R)/v で全段 ≥ T。(e) ⌊min⌋ < 24 のときだけ: R_w < 24 ならプレイヤーを 356×200 にして 1 回再計算（split では幅にしか効かない）。それでも R_w < 24 なら R 24 で溝を食う（limited width）。R_h < 24 なら R 24 のまま v ＝ max(D/T, v_min)、T′ ＝ D/v（limited height。v_min を割る T だけが縮み、T より長くはならない。1.0 s では D ≥ 200 なら縮まない。両方なら height）。箱の高さが R 24 の鍵盤図（8 + k_n·24。vmpk 164、ableton 92）以下で D ≤ 0 なら sizing は RangeError、幅が c_n·√3·24（vmpk 478、ableton 437）未満なら鍵盤図が箱からはみ出す（limited width）。どちらも呼ぶ側（M1-03／M3-02）が帯で知らせる（仮）。(f) 奥行き係数は描く径にだけ掛け、k_n・段の中心は変えない。limited の判定（R_h < 24）は T0 基準で、D ≥ 300（整数）と同値 | §2.5 の「舞台高 −32」は m0 の 2·PAD＋KB_BOTTOM で、箱の H_col − 8 と恒等（668−32 ＝ 644−8）。前提の 3 画面（内側 1366×668／1280×620／1093×514）では ableton が 3 視口とも R 28、vmpk は 28／28／27（1093 は R_w 27.36）。v（1.5 s）は ableton 0.3587／0.3267／0.2560、vmpk 0.3027／0.2707／0.2043。実装 src/render/hex/sizing.ts・landing.ts、期待値は tests-inventory 手順 4。動画なし形態（S2A）の左列の幅は決めない（sizing の入力は箱なので M1-03 で決める）。退けた案と理由は相談の記録。125% 端末（U-05）で R 27・v 0.2043 の可読性を測り、不満なら (b)(e) を見直す |
| 25 | 入力レコードの時刻 tsPerf の出所と刻み（m0-kickoff.md §7-9。手順 5、2026-10-30、仮。相談 E、docs/planning/consult/E-tsperf.md） | (a) tsPerf ＝ Event.timeStamp（performance.timeOrigin 基準）。非有限・0 以下・now より後なら now（src/app/ がハンドラの冒頭で 1 回読む performance.now を値で渡す）。now − ts ＞ 1000 ms（stale）でも ts を保つ。keyup・役割（Space の校正タップ）も同じ式。blur・非表示・iframe・コンテキストメニューの全離しは now、Meta の keyup による全離しはその keyup の tsPerf（どちらも採点しない）。(b) 量子化の補正（+q/2）はしない。(c) 刻み q は実際の keydown・keyup の timeStamp で推定する: 有限の値を昇順・重複除去し 20 値以上で、梯子 100／16.667／15.625（許し 2 ms）／1／0.1／0.02／0.005（許しは q/100）の大きい順に、左右どちらかの隣との差が q の倍数（k ≥ 1）である割合が 0.9 以上の最初の q。どれにも当たらなければ 0、不足は null（どちらも保存しない）。hexnote.device.tsResolution はこの q。(d) q ≥ 8 ms は「判定が粗い環境」の注記だけで、判定窓・tsPerf は変えない。(e) 入力遅延中央値（§4.6 play 行）＝ ok の押下の now − ts の中央値、標本が無ければ null | timeStamp は主スレッドの待ちを含まない（Chromium は Windows・Wayland でブラウザのプロセスが受け取った時刻、macOS・X11 で OS の時刻。Event Timing の input delay の定義）。ハンドラ内の performance.now は待ちを全部含み、24 ms の窓では遅れ側に乗る。Chromium・Firefox の丸めは区間ごとの乱数の閾（偏りなし）で、Firefox の resistFingerprinting は timeStamp も performance.now も同じ 16.667 ms に丸める（now に替えても良くならない）。「Chromium で 16.7 ms 刻み」は裏付けが無く、16.667 は Firefox の RFP。Firefox 既定の Windows は入力時刻が GetMessageTime 由来で約 15.6 ms 刻み（傍証。Windows 11 の実測は U-05・M-2）、不変 TSC の無い CPU の Chromium も 15.625。stale を now に寄せると長いタスクの後に古い押下が今のノートに当たるので保つ。限界: 2〜10 ms の格子は 1 と出る。tick の切り捨てが確かめられたら [ts, min(ts+q, now)] の中点を補正の候補にする（U-05・M-2、仮）。判定層（手順 8）への申し送り: 押下は tsPerf の順に消化する。MISS の確定に、まだ届いていない押下の余裕 G を置くか（候補: 仮 50 ms、または直近の入力遅延 p95 と 2 フレームの大きい方）と、全離し（forced）でのホールドの扱いは手順 8 で決める（kickoff §7-16）。reason（stale・future など）の件数を計測に残すかは手順 12。実装 src/input/timestamp.ts・resolution.ts、期待値は tests-inventory 手順 5。相談役（強いモデル）は利用枠の不足で呼べず、このセッションのモデルの 3 役（事実の確認・起草・批判）で検討した |
| 26 | 入力層の細部（design.md §2.8 が書かない所。手順 5、2026-10-30、仮） | keydown は次の順に見る: (1) Ctrl・Alt・Meta 付きは素通し（Shift は見ない）。(2) 禁止・修飾の code は素通し（半角/全角＝Backquote は IME より先に捨て、切替で帯を点けない）。(3) 229／isComposing なら入れずに検知 ime を毎回出し、帯を点ける（点いていなければ imeBand 1 件＝連打でも 1 件）。preventDefault しない（IME に渡す）。(4) その他（Tab・矢印・Minus など）は素通し。(5) IME でない演奏・役割の keydown で帯を消し（Shift・Tab などでは消さない）、repeat か押下集合にある code は捨てる。(6) 押下集合に足し、演奏なら press、役割なら role。役割の鍵も押下集合に入れる。keyup は修飾・IME を見ず、押下集合にある code だけ外す（役割でなければ release。押した後に演奏の鍵の組が変わっても出す）。Meta の keyup とコンテキストメニューで全離し（Pause 要求なし）。preventDefault は演奏・役割の鍵だけ（素通しの鍵は F5・Ctrl+R などブラウザの動作を残す）。NumpadEnter は役割にしない。文字の欄（input の文字型・textarea・contenteditable）では keydown を入力層に通さない（keyup は通す）。select は文字の欄にせず、焦点があるまま演奏・役割の鍵を押したら入力層へ通して焦点を外す。blur の後に activeElement が iframe なら Pause の理由を iframe にして焦点を戻す（戻す先は呼ぶ側が渡す tabindex 付きの要素、スクロールしない）。遅らせた blur の処理の時に焦点がページへ戻っていたら何もしない。表示に戻ったときは何もしない（再開は Space で S7b を通る）。演奏の鍵は既定で 40 個（配列で音の無い鍵も入力にする。鍵数制限は playCodes で差し替える）。呼ぶ側の扱い: 一時停止の契機は Escape（role の pause）と blur・非表示・iframe（pause イベント）の 2 つで、どちらも一時停止に入る。要求は冪等（タブの切替では hidden と blur の 2 件が来る）で、再生中だけ一時停止へ移し、待機・同期中・一時停止中では無視する（click-to-play の click は待機中の pause iframe になる。手順 7 の状態機械で固定）。S6 の「IME 検知時に曲を止める」と S0b の「229 なら組をやり直す」は ime を見る | m2 の修飾付き keydown 捨て（L411）は (1) で残し、keyup 捨て（L415）は外した（手直し）。m1'・m3・m4 の「ボタン等に焦点があるときの分岐」は文字の欄だけに絞り、select はモック（m1' L524・m3 L649・m4 L651）と同じく役割の鍵をゲームへ回す。Meta の keyup・コンテキストメニューで全離しは、押しっぱなしの鍵が残ると「既にある code」で以後の押下が捨てられるための備え（macOS は Meta を押している間に離した鍵の keyup を出さない、メニューが開いている間の keyup はページに届かない。どちらも推測、未計測。U-05 で確かめる）。帯を禁止・修飾の鍵で点けないのは半角/全角の切替で帯が点滅しないため。帯の表示（imeBand）と検知（ime）を分けたのは、帯が点いたままでも 229 の打鍵ごとに呼ぶ側が動けるため。実装 src/input/{keyboard,ime,focus,roles}.ts、src/app/dev/dom-input.ts |
