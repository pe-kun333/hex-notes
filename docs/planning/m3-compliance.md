# YouTube の規約の照合（M3 の手順 1 で下書きを起こし、手順 10 で原文に当てた。表は design §6.1 の「YouTube 規約の照合表」）

m3-kickoff §7-35（照合表の形）。状態は 済（実装で満たし、試験か m3-verification の行で見た）／運用（決めた運用で満たす。解釈は未解決）／未確認（既定は本書の形。手元の表へ）／公開前（公開先を決める時、U-08）。主担当は条文の解釈を決めない（解釈の要る行は「運用」か「未確認」で残す）。このファイルは読んだ原文の要旨と照合の件の記録で、照合表そのものは design §6.1 に移した（2026-11-12、decisions #110）。要旨は主担当の言い換えで、条の語をそのまま写していない。

## 公式の文書（2026-11-12 に読み直した）

問い合わせは公開の頁を読んだだけ（プロジェクトの名前は入れていない）。どの頁にも「最終更新」の表示は見当たらなかったので、日付は改訂履歴の最新の項で代える。

| 文書 | URL | 確認日 | 読んだ節・読めなかった物 |
|---|---|---|---|
| IFrame Player API の説明 | https://developers.google.com/youtube/iframe_api_reference | 2026-11-12 | 寸法の要件・onError の一覧・関数の一覧・origin。初めの読みでは頁の後ろ約 4 割を要約でしか読めず、onError の 6 つ（2・5・100・101・150・153）は「疑う」1 回で頁の HTML の原文に当て直した（この 6 つだけ） |
| プレイヤーの引数 | https://developers.google.com/youtube/player_parameters | 2026-11-12 | 全部（引数の表・寸法・非推奨） |
| IFrame API の改訂履歴 | https://developers.google.com/youtube/iframe_api_revision_history | 2026-11-12 | 全部。最新の項は 2025-07-09（onError に 153） |
| Required Minimum Functionality（RMF） | https://developers.google.com/youtube/terms/required-minimum-functionality | 2026-11-12 | 全部（埋め込みの節: API Client Identity and Credentials・WebView Type・Embedded YouTube Player size・Autoplay and scripted playbacks・YouTube Player attributes・Overlays and frames・Mouseovers） |
| Developer Policies | https://developers.google.com/youtube/terms/developer-policies | 2026-11-12 | 全部（3 回に分けて原文で） |
| Developer Policies の手引き | https://developers.google.com/youtube/terms/developer-policies-guide | 2026-11-12 | 全部 |
| API Services の利用規約 | https://developers.google.com/youtube/terms/api-services-terms-of-service | 2026-11-12 | 節の見出しと §2・§4・§6・§7・§9・§11 |
| 規約の改訂履歴 | https://developers.google.com/youtube/terms/revision-history | 2026-11-12 | 最新の 5 項。最新は 2026-06-01（派生の指標の保存）。2025-07-07 に RMF の埋め込みの節へ API Client Identity and Credentials が足された |

条の番号: 原文の III の下は A.1・A.2.c・C.2.b・E.1.a・E.4.i・F.3.b のように数字と字（頁の HTML の字の並びの list〔lower-alpha〕と印 `III-E-4-i`・`III-E-4-j`、頁の中の参照 III.A.2.e・III.E.4.b で確かめた）で、下調べ（2026-10-23）と手順書の番号のままでよい。I の下だけは I.1〜I.21 の数字。2026-11-12 の初めの読みは頁を文字に起こした写しで字が数字に化けていて一度 III.E.1.1 などと書いたが、「疑う」1 回で頁の原文の印に当てて戻した（decisions #110 (i)）。

## 条ごとの要旨（照合表の行に当てた分）

| 出どころ | 条・節 | 要旨（言い換え） |
|---|---|---|
| RMF | Embedded YouTube Player size | 埋め込みのビューポートは 200×200 px 以上。操作の帯を出すなら、それを縮めずに収める。16:9 は 480×270 px 以上を勧める |
| RMF | Overlays and frames・Mouseovers | プレイヤー（操作の帯も）の前に重ね物・枠・他の要素を置かない、それで隠さない。プレイヤーの上のマウスオーバー・タッチで利用者に代わって操作を起こさない |
| RMF | YouTube Player attributes | 文書に書かれていない変更をプレイヤーに加えない |
| RMF | Autoplay and scripted playbacks | 自動・スクリプトの再生は、プレイヤーが見えて半分超が画面にあるまで始めない。同時に自動再生するプレイヤーは 1 つまで |
| RMF | API Client Identity and Credentials | 埋め込みのクライアントは HTTP の Referer で名乗る。ブラウザでは Referrer-Policy で消さない（strict-origin-when-cross-origin を勧める）。守らないと埋め込みの機能が減りうる。153 の語はこの節に無い |
| IFrame API | onError | 2（引数の値が違う・ID の形）・5（HTML5 プレイヤーで再生できない）・100（見つからない・非公開）・101・150（埋め込み不可）・153（Referer か同じ名乗りが無い。2025-07-09 に追加） |
| IFrame API | 寸法・origin・自動再生 | 200×200 以上（2014-03-25 の改訂から）、480×270 を勧める。origin は任意の安全策。自動・スクリプトの再生が止められると onAutoplayBlocked（2023-11-20 に追加。原因にクロスオリジンの iframe の autoplay の許可が無い事を挙げる） |
| プレイヤーの引数 | controls・fs・rel・mute | controls の既定は 1（表示）、fs の既定は 1（全画面の釦）。rel で関連動画は消せない（2018-09-25 から同じチャンネルに絞るだけ）。mute は引数の表に無い |
| Developer Policies | III.A.1 | YouTube 利用規約（https://www.youtube.com/t/terms）へリンクし、利用者がそれに縛られる事を自分の規約に書く |
| Developer Policies | III.A.2 | 機能を使う前にプライバシーポリシーへ同意させる。目立つ場所に置き、YouTube API Services を使う事を書き、そのポリシーの中で Google のプライバシーポリシー（http://www.google.com/policies/privacy）へリンクする（a〜i。リンクは c） |
| Developer Policies | III.C.2 | YouTube の操作（動画の再生など）を起こす機能は、YouTube の操作と分かる印を付け（a）、自分の機能と分けて混ぜず（b）、利用者がはっきり起こした物にする（c） |
| Developer Policies | III.D.3 | 既定より多い割当を求めるときは Compliance Audit を受ける（IFrame だけの埋め込みは割当を使わない） |
| Developer Policies | III.D.7 | 文書に無い API を使わない（データは文書にある手段だけで）、逆行解析しない |
| Developer Policies | III.E.1.a〜c | 動画の写しを落とす・溜める・保存しない、オフライン再生しない、著作権の侵害を助けない |
| Developer Policies | III.E.4.d・e | 認められていない API のデータは 30 日までで、その後は消すか取り直す（「疑う」1 回で頁の原文から読んだ） |
| Developer Policies | III.E.4.i | 埋め込みは読込で基本のデータを YouTube へ送る。自動再生だと頁の読込で集まる（自動再生を切ると操作の前の送信が減る） |
| Developer Policies | III.E.4.j・III.J | 埋め込む動画が子ども向け（Made For Kids）かを確かめ、そうなら追跡を切る（COPPA・GDPR）。子ども向けのクライアントは届け出・書き込み不可 |
| Developer Policies | III.F.2.a・c | YouTube が出どころと分かるようにし、埋め込みのプレイヤーの中の帰属を隠さない（「疑う」1 回で頁の原文から読んだ） |
| Developer Policies | III.F.3.a〜c | 埋め込みの視聴に課金しない（a）。▶ の他の行動（登録・いいね等）を再生の条件にしない（b）。視聴・いいね・共有・登録・コメントに報酬を出さない（c） |
| Developer Policies | III.I.4・I.5・I.6 | YouTube の機能・データ・中身を変えない・邪魔しない（プレイヤーの中のリンクも）。広告を変えない・邪魔しない・差し替えない・止めない。プレイヤーの部分や機能を変えない・上に作らない・塞がない |
| Developer Policies | III.I.7・I.9・I.21 | 音と映像を分けない・差し替えない。見ていない頁・画面の背景のプレイヤーで再生しない。方針を逃れたり出どころを隠すために iframe の入れ子に入れない |
| 手引き | 標準の体験 | 同意や再生の操作（ミュート・全画面・再生・一時停止）の重ね物は、プレイヤーの UI とぶつからなければ可。設定の歯車や終わった後の関連動画など標準の機能を塞がない。視聴に報酬を出さない。広告を止めない・変えない。プレイヤーの作り直し・エラーの後の撤去・全画面・広告中の一時停止・再生速度には触れていない |
| API ToS | §6・§7・§9.1 | §6 は YouTube がクライアントを監視・監査できる事（Compliance Audit の語は ToS に無く、Developer Policies III.D.3 と規約の改訂履歴 2021-07-01 の、既定の 10,000 単位を超える割当の条件に出る）。§7 は自分のプライバシーポリシーを出して守る事。§9.1 (iii) は子ども向けのクライアント（III.J） |

## 埋め込みの形（手順 1 で作った物。照合の後）

| 項目 | 今の形 | 状態 |
|---|---|---|
| iframe の属性 | 自前の iframe に `referrerpolicy="strict-origin-when-cross-origin"`・`allow="autoplay; encrypted-media"`・`title`。寸法は箱が持つ（`src/youtube/embed.ts` の `EMBED_ATTRS`）。title は読込の後に YouTube の側が動画の題へ書き換える（2026-11-12、pane の DEV で見た） | referrerpolicy・title は可（referrerpolicy は RMF が勧める値）。allow は未確認（文書に allow の一覧は無い。autoplay の許可だけ IFrame API の onAutoplayBlocked の説明に出る。照合の件 (4)） |
| 全画面 | `allowfullscreen` を付けない（右列が隠れるので M3 では許さない。fs の既定 1 で釦は出る） | 未確認（公式に全画面の記述なし。照合の件 (4)） |
| playerVars | `enablejsapi=1`・`playsinline=1`・`disablekb=1`・`origin`（rel・controls・fs は書かない） | 済 |
| ホスト | `www.youtube.com`（nocookie は使わない） | 済 |
| Referer（API Client Identity。無いと onError 153） | referrerpolicy で origin を送る。公開先の応答ヘッダ（Referrer-Policy）は公開先を決める時 | 済（localhost の読込で 153 なし）・公開前（公開先） |
| onError | 6 コードを 4 組に分ける（2 ＝ ID の形、100 ＝ 見つからない・非公開、101・150 ＝ 埋め込み不可、5・153 と一覧に無い値 ＝ 環境。`src/youtube/errors.ts`） | 済（2026-11-12 に一覧と照合。6 つとも一覧にある） |
| 同意の門 | iframe_api の読込と iframe の前に必ず通す口（`embedGate`、今は常に通す。decisions #100） | 公開前（公開まで III.A.2 の「使う前の同意」は満たさない運用） |
| 規約のリンク | 段 4 と S6 の 1 行: YouTube 利用規約 https://www.youtube.com/t/terms（III.A.1 の URL のまま）、Google のプライバシーポリシー https://www.google.com/policies/privacy（III.A.2 に書かれた宛先を https で。開くと policies.google.com/privacy へ転送。2026-11-13、利用者の答え、decisions #114） | 済（同意と自分のポリシーの文は公開前） |
| 埋め込み不可の印 | `hexnote.noembed` v:2（動画 ID と付けた日）。付けてから 30 日で外す（`src/storage/local.ts`。2026-11-13、利用者の答え、decisions #114） | 済（III.E.4.d・e。API のデータに当たるかは決めず、当たっても触れない形） |

## 出す操作の一覧（プログラムからの動画の操作、decisions #11・#95）

| 操作 | 出し手 | 状態 |
|---|---|---|
| pauseVideo〔user〕 | 一時停止（Esc・blur・iframe への blur・非表示・IME）と、戻りを待つ間の一時停止（手順 7）。#11 の「Pause 再開」の用途。プレイの間に利用者がプレイヤーを操作した click も iframe への blur で一時停止になる（#35） | 運用 |
| playVideo | 一時停止からの再開（Space）。半分超が見えないときと、一時停止の間に終わった動画には呼ばない | 運用 |
| pauseVideo〔stall〕 | 停止検知（可視・PLAYING で 2 秒凍結）。広告中は 2.5 s ごとに出し直す | 運用（#11 による運用。III.C.2 の解釈は決めない） |
| seekTo | 製品の出し手 0（ループ頭出しは動画ありの練習室とともに M4 の後、#94）。型 `VideoRequest` には残す。束の 0 件は `npm run pwa:check` が見る | 済 |
| 作り直し（destroy） | 「最初から」、段 4 のやり直し・ID の変更・中止・8 拍の後、画面を離れる時、S7a | 運用（照合の件 (1)） |
| 開発ページだけの例外 | ミュートのスクリプト再生（mute → playVideo）と seekTo（`src/app/dev/youtube-dev.ts`。製品の束に出さない） | 運用（#95） |
| 釦「pauseVideo を今出す」（開発ページ） | 利用者の click で口へ 1 件（広告の間の効きを測る用）。例外に数えない | 運用 |

## 照合の件（2026-11-12 に原文へ当て直した閉じ方）

| 件 | 既定の形 | 閉じ方 |
|---|---|---|
| (1) 「最初から」と段 4 のやり直し（ID の変更・中止・8 拍の後も）の iframe の作り直し、プレロール広告の出直し、広告の間の作り直し・破棄 | 作り直し → 利用者の ▶ 待ち（#95） | 未確認。公式に記述なし（8 本とも。III.I.5・I.6 は広告とプレイヤーを変える事を禁じるが、作り直しには触れない）。既定は本書の形 |
| (2) S7a で iframe を外して YouTube のエラー表示を消す事 | 外してカード（m3-kickoff §7-26 の案 A、手順 5） | 未確認。公式に記述なし。既定は本書の形 |
| (3) 広告中の pauseVideo（停止検知の出し直しと、Esc・blur・非表示の user） | 今の形（#34）。手順 6 で模擬の 2 形を確かめた（#106） | 未確認。III.I.5 は広告を止める・変える事を禁じるが、pauseVideo が広告に効くかは書かれていない。U-06 の JSON で、広告の間に出した pauseVideo の後 500 ms 以内の PAUSED が来たかを見る |
| (4) iframe の属性（referrerpolicy・allow・title と全画面） | 上の「埋め込みの形」 | referrerpolicy・title は可。allow の一覧と全画面は未確認（公式に記述なし。既定は今の allow と allowfullscreen なし。全画面が否なら付けて fullscreenchange で一時停止、§7-10） |
| (5) 一時停止の間に終わった動画へ再開の playVideo を出さない事 | 出さない（手順 2、m3-kickoff §7-16） | 済（`tests/unit/app/play-runner-video.test.ts` の (13)） |

## 公開前の行（公開先を決める時、U-08）

同意の保存と読込前の 1 画面（III.A.2）、自分の規約とプライバシーポリシーの文（III.A.1 の後半・III.A.2・API ToS §7）、Made for Kids の扱い（III.E.4.j・III.J）、公開先の Referrer-Policy と origin（RMF の API Client Identity。meta は付けない）、Compliance Audit の要否（Developer Policies III.D.3 の割当を増やす時の物。IFrame だけの埋め込みは割当を使わない）。（`hexnote.noembed` の III.E.4.d・e は 2026-11-13 に 30 日で外す形にして閉じた、decisions #114。）
