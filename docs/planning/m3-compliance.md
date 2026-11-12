# YouTube の規約の照合表（下書き。M3 の手順 1 で起こし、手順 10 で原文に当てて design §6.1 へ移す）

m3-kickoff §7-35（照合表の形）。状態は 済（実装で満たした）／運用（決めた運用で満たす）／未確認（原文に当てる前・測る前）／公開前（公開先を決める時、U-08）。条文の要旨は 2026-11-11 の読み直しの物で、原文の当て直しは手順 10。主担当は条文の解釈を決めない（解釈の要る行は「運用」か「未確認」で残す）。

## 公式の文書（確認日は手順 10 で埋める）

| 文書 | URL | 確認日 |
|---|---|---|
| IFrame Player API の説明 | https://developers.google.com/youtube/iframe_api_reference | 未 |
| プレイヤーの引数 | https://developers.google.com/youtube/player_parameters | 未 |
| IFrame API の改訂履歴 | https://developers.google.com/youtube/iframe_api_revision_history | 未 |
| Required Minimum Functionality（RMF） | https://developers.google.com/youtube/terms/required-minimum-functionality | 未 |
| Developer Policies | https://developers.google.com/youtube/terms/developer-policies | 未 |
| Developer Policies の手引き | https://developers.google.com/youtube/terms/developer-policies-guide | 未 |
| API Services の利用規約 | https://developers.google.com/youtube/terms/api-services-terms-of-service | 未 |
| 規約の改訂履歴 | https://developers.google.com/youtube/terms/revision-history | 未 |

## 埋め込みの形（手順 1 で作った物）

| 項目 | 今の形 | 状態 |
|---|---|---|
| iframe の属性 | 自前の iframe に `referrerpolicy="strict-origin-when-cross-origin"`・`allow="autoplay; encrypted-media"`・`title`。寸法は箱が持つ（`src/youtube/embed.ts` の `EMBED_ATTRS`） | 未確認（照合の件 (4)） |
| 全画面 | `allowfullscreen` を付けない（右列が隠れるので M3 では許さない。否なら付けて fullscreenchange で一時停止） | 未確認（照合の件 (4)） |
| playerVars | `enablejsapi=1`・`playsinline=1`・`disablekb=1`・`origin`（rel・controls は書かない。controls は既定、`embedSrc`） | 未確認 |
| ホスト | `www.youtube.com`（nocookie は使わない） | 未確認 |
| Referer（API Client Identity。無いと onError 153） | referrerpolicy で origin を送る。公開先の応答ヘッダ（Referrer-Policy）は公開先を決める時 | 公開前 |
| onError | 6 コードを 4 組に分ける（2 ＝ ID の形、100 ＝ 見つからない・非公開、101・150 ＝ 埋め込み不可、5・153 と一覧に無い値 ＝ 環境。`src/youtube/errors.ts`、組分けは「未照合」） | 未確認 |
| 同意の門 | iframe_api の読込と iframe の前に必ず通す口（`embedGate`、今は常に通す。decisions #100） | 運用（公開まで A.2 の「使う前の同意」は満たさない運用） |

## 出す操作の一覧（プログラムからの動画の操作、decisions #11・#95）

| 操作 | 出し手 | 状態 |
|---|---|---|
| pauseVideo〔user〕 | 一時停止（Esc・blur・非表示）。#11 の「Pause 再開」の用途 | 運用 |
| playVideo | 一時停止からの再開（Space）。半分超が見えないときは呼ばない | 運用 |
| pauseVideo〔stall〕 | 停止検知（可視・PLAYING で 2 秒凍結）。広告中は 2.5 s ごとに出し直す | 運用（#11 による運用。III.C.2 の解釈は決めない） |
| seekTo | 製品の出し手 0（ループ頭出しは動画ありの練習室とともに M4 の後、#94）。束に文字列が無い事を試験で見る（手順 10） | 済（手順 1 で dist 0 件を grep で確かめた） |
| 開発ページだけの例外 | ミュートのスクリプト再生（mute → playVideo）と seekTo（`src/app/dev/youtube-dev.ts`。製品の束に出さない） | 運用（#95） |
| 釦「pauseVideo を今出す」（開発ページ） | 利用者の click で口へ 1 件（広告の間の効きを測る用）。例外に数えない | 運用 |

## 照合の件（手順 10 で原文に当て直す）

| 件 | 既定の形 | 状態 |
|---|---|---|
| (1) 「最初から」と段 4 のやり直しの iframe の作り直し、プレロール広告の出直し、広告の間の作り直し・破棄 | 作り直し → 利用者の ▶ 待ち（#95） | 公式に記述なし（2026-11-11）。既定は本書の形 |
| (2) S7a で iframe を外して YouTube のエラー表示を消す事 | 外してカード（m3-kickoff §7-26 の案 A、手順 5） | 公式に記述なし（2026-11-11）。既定は本書の形 |
| (3) 広告中の pauseVideo（停止検知の出し直しと、Esc・blur・非表示の user） | 今の形（#34）。出し方は 2 つ: 広告中の停止検知の出し直し（2.5 s ごと、stall）と、広告中の Esc の pauseVideo（user）。手順 6 で模擬の 2 形を確かめた（#106）。U-06 の JSON で、広告の間に出した pauseVideo の後 500 ms 以内の PAUSED が来たかを見る | 公式に記述なし（2026-11-11）。既定は本書の形 |
| (4) iframe の属性（referrerpolicy・allow・title と全画面） | 上の「埋め込みの形」 | 未確認（下書きを起こす時に文書を引いて分ける。手順 10） |
| (5) 一時停止の間に終わった動画へ再開の playVideo を出さない事 | 出さない（手順 2、m3-kickoff §7-16） | 未確認（同上） |

## 公開前の行（公開先を決める時、U-08）

同意の保存と読込前の 1 画面、Made for Kids の扱い（III.E.4.j）、自分の規約の文（III.A.1 の後半）、Referrer-Policy（meta は付けない）、公開先の origin、Compliance Audit の要否。
