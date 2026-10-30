# 参照した数値と出どころ

他の実装や資料から**数値と仕様だけ**を参照した一覧。コードには名前も数値も書かず、ここに置く（design.md §4.5）。AGPL／GPL の実装は仕様の参考に留め、コードは開かない。

出どころの詳細は `docs/planning/research/*.md`（R1 の下調べ。各ファイルに確認日と URL）。手順書は `docs/planning/m0-kickoff.md`。

| 項目 | 参照した数値・仕様 | 元 | 本プロジェクトでの扱い |
|---|---|---|---|
| 判定窓（入門者） | 24／100／180 ms | Bemuse の Lv1–2 相当の窓（AGPL。仕様のみ） | 既定値。遅れ側 ×1.3（design.md §2.3） |
| 判定窓（音ゲー向け） | 30／90／200 ms | beatoraja の KEYBOARD 判定（GPL。仕様のみ） | 既定値（§2.3） |
| 判定窓（モック既定） | 40／80／120 ms | m1 既定（m1' `WINDOWS` L241、m3 `WINDOWS` L253。出どころは本プロジェクトの試作） | 採らない（2 組だけ、§2.3）。m3 の Etterna J4×0.66 ＝ 29.7／59.4／118.8 も同じく外す |
| 判定窓（YouTube 音源の先行例） | good 40／ok 80／bad 遅 +150・早 −250 ms、playbackRate 倍にスケール | Falling Nikochan `gameConstant.ts`（AGPL。仕様のみ。research/midi-score-sources [S26]） | 数値は採らない。`offset` と `ytBegin` を分ける設計だけ参考（§3.2 SyncSource） |
| 連続スコア Wife3 | max_points 2、miss_weight −5.5、ridic 5·ts、zero 65·ts^0.75、dev 22.7·ts^0.75、max_boo 180·ts、ts_pow 0.75。|誤差| ≤ ridic で 2、≤ zero で 2·erf((zero−ms)/dev)、≤ 180·ts で線形に −5.5、以降 miss。m3 は ts＝1 で 2 点→100% に正規化、miss −275% | Etterna の Wife3（MIT。実装は参照のみ。research/judgment-ux [S6]、m3 `wife3` L259–260） | 初版は採用しない（§4 移植しない物）。将来の検討材料 |
| UR（Unstable Rate） | 判定ずれの標準偏差 ×10 | osu! の定義 | 計測の行（§4.6）と結果画面 |
| YouTube IFrame の時刻 | getCurrentTime の刻み約 15 ms、seek 後の凍結 210〜260 ms、後ろ向きの飛び ≤10 ms | 研究ノート research/youtube-iframe（自前計測と公開資料） | 時計層の補正（最小二乗 2 秒窓、量子化補正 +q̂/2、猶予 300 ms） |
| YouTube の規約 | プレイヤー前のオーバーレイ禁止、視聴への報酬禁止、最小 200×200、III.F.3.b・III.F.3.c | YouTube API Services Developer Policies | 帯と演出を矩形の外、報酬の切り分け（§4.4）、リスク L-1〜L-10 |
| キーボードの段ずれ | 数字→Q 1/2u、Q→A 1/4u、A→Z 1/2u、1u ≈ 19.05 mm | Deskthority wiki（ANSI の千鳥配列） | 六角格子としての扱い。順は ADR 0001 |
| 等方性配列の先行例 | 英数キーボードに Wicki-Hayden を載せる | Plamondon、US20090114078A1 | W–H は対照条件（decisions #4）。製品に載せるときだけクリアランス |
| 原神・Sky 型の鍵 | 原神 21 鍵（3 段×7、自然音のみ、MIDI 48〜83）、Sky 15 鍵（3×5） | Specy genshin-music の game.json・keybinds（AGPL。仕様のみ。research/qwerty-sheet-culture） | genshin 配列の鍵数と段の形だけ（§2.1）。MIDI 取り込みの「臨時記号 1 音下げ」「オクターブ折り畳み回数」は fold の設計の参考。数値はこれ以外に無い |
| ピアノ音源の先行例 | 数値なし（設計の参考のみ） | WebAudioFont（GPL-3.0。コードは開かない）、Tone.js の Salamander 30 音（mp3/ogg） | 「30 音を遅延読込」の形だけ。smplr（MIT）か自前 Sampler で実装（§4.5） |
| ピアノ音源 | Salamander Grand Piano V3、CC BY 3.0 | Alexander Holm | 30 音の間引き版を同梱（M0-08） |
| 膜式キーボードの同時押し | 同時 2 キーが安全圏。3〜4 は端末次第 | 下調べ（ロールオーバー・ゴースト） | 上限既定 2、診断 10 組で 3〜4（decisions #7） |
| 離し窓 | 離し窓 ×1.5 | Quaver（MPL-2.0。仕様のみ） | ホールドの離し窓 1.5×GOOD（§2.3、decisions の既定値） |
| ブラウザの時刻の刻み | Event.timeStamp・performance.now の丸め: Chromium 0.1 ms（隔離時 0.005）、Firefox 1 ms（隔離時 0.02、resistFingerprinting で 16.667 ms、以前は 100 ms）、Safari 1 ms。Chromium・Firefox の丸めは区間ごとの擬似乱数の閾。Windows の入力時刻（GetMessageTime）と不変 TSC の無い CPU の時計は 15.625 ms ごと | MDN Event.timeStamp、Chromium（BSD）time_clamper.h／.cc・performance.cc・ui/events/win/events_win_utils.cc・base/time/time_win.cc、Firefox（MPL）nsRFPService.cpp・Performance.cpp・Event.cpp・widget/windows/nsWindow.cpp、Mozilla bug 1692609・1431455・1202119、W3C Event Timing、research/judgment-ux.md L35・L196。2026-10-30 確認（相談 E、docs/planning/consult/E-tsperf.md） | tsPerf は timeStamp（decisions #25）。刻みの梯子 100／16.667／15.625／1／0.1／0.02／0.005（src/input/resolution.ts） |

追加するとき: 行を足し、research のファイル名を書く。数値をコードに書きたくなったら、定数名を `docs/` へのコメント付きで置き、この表の行番号を添える。
