// S7a（動画を再生できない）の文と、埋め込み不可の印・embedError 行の手（M3 の手順 5、M3-05 前半、仮。m3-kickoff 手順 5・§7-26・
// §7-27・§7-38）。出どころ: m6 S7a L938・`evac-novideo` L976・S2 のカード L817–818、m3 `loadYT` L462–475、design §1.3 S7 L89・§4.6
// L202。受けるのは手順 1 の口の事象 PortEvent の error{code, group}・loadFail{code −1}・noResponse{code −2} そのまま（code は
// 割り当て直さない。−1・−2 は onError の値でなく errorGroupOf を通らない）。印（hexnote.noembed に videoId を足す）を残すのは
// 動画の側の理由の 100・101・150 だけ。embedError 行は自作の −1・−2 も書く（§7-38）。数でない値（NaN）は番号を出さず行も書かない。
// 文は仮（公式の一覧との照合は手順 10）。純関数（DOM は screens/play.ts・screens/import.ts）。

import { markNoEmbed } from '../storage/local.ts'
import { embedErrorRow } from '../telemetry/rows.ts'
import type { EmbedErrorTelemetry } from '../shared/types.ts'
import type { PortEvent } from '../youtube/port.ts'

/** 失敗の事象（読込の失敗・応答なし・onError） */
export type EmbedFailEvent = Extract<PortEvent, { kind: 'error' | 'loadFail' | 'noResponse' }>

export const isEmbedFail = (e: PortEvent): e is EmbedFailEvent =>
  e.kind === 'error' || e.kind === 'loadFail' || e.kind === 'noResponse'

export interface EmbedView {
  /** 見出し（末に「（コード n）」。数でない値は番号なし） */
  readonly title: string
  readonly body: string
  /** 埋め込み不可の印を残す（100・101・150） */
  readonly mark: boolean
  /** 行に書く code（数でない値は null） */
  readonly code: number | null
}

/** 組ごとの見出し（期待値 (1)、仮） */
export const EMBED_TITLES = {
  badId: '動画 ID を確かめてください',
  gone: '動画が見つかりません（削除か非公開）',
  noEmbed: 'この動画は埋め込みで再生できません',
  env: 'このブラウザでは動画を読めませんでした',
  load: '動画を読み込めませんでした',
} as const

const PIANO = 'ピアノ音で遊べます。'
const MARK_NOTE = 'この曲は「動画なし」を既定にします。'

export function embedView(e: EmbedFailEvent): EmbedView {
  const code = Number.isFinite(e.code) ? e.code : null
  const suffix = code === null ? '' : `（コード ${code}）`
  if (e.kind !== 'error')
    return { title: EMBED_TITLES.load + suffix, body: `通信か YouTube の読み込みに失敗しました。${PIANO}`, mark: false, code }
  switch (e.group) {
    case 'badId':
      return { title: EMBED_TITLES.badId + suffix, body: `曲の動画 ID が正しくないようです。${PIANO}`, mark: false, code }
    case 'gone':
      return { title: EMBED_TITLES.gone + suffix, body: `${MARK_NOTE}${PIANO}`, mark: true, code }
    case 'noEmbed':
      return { title: EMBED_TITLES.noEmbed + suffix, body: `動画の持ち主が埋め込みを許可していません。${MARK_NOTE}${PIANO}`, mark: true, code }
    case 'env':
      return {
        title: EMBED_TITLES.env + suffix,
        body: code === 153
          ? `ブラウザのリファラー（Referer）の設定や拡張機能が YouTube の読み込みを止めていることがあります。${PIANO}`
          : `このブラウザでは動画を再生できませんでした。${PIANO}`,
        mark: false,
        code,
      }
  }
} // prettier-ignore

export interface EmbedFailPlan {
  /** embedError 行（同じ iframe の 2 回目・数でない値は null） */
  readonly row: EmbedErrorTelemetry | null
  /** 新しい埋め込み不可の一覧（印を残さない組は同じ配列） */
  readonly list: readonly string[]
  readonly view: EmbedView
}

/**
 * 失敗の事象 1 つの手。written は同じ iframe で既に行を書いたか（iframe 1 つに 1 回）、at は行の時刻（ISO）
 */
export function embedFailPlan(
  e: EmbedFailEvent,
  videoId: string,
  list: readonly string[],
  written: boolean,
  at: string,
): EmbedFailPlan {
  const view = embedView(e)
  return {
    row: written || view.code === null ? null : embedErrorRow(view.code, at),
    list: view.mark ? markNoEmbed(list, videoId) : list,
    view,
  }
}

/** 段 4 の 1 行（見出し＋「動画なしで保存できます。」、期待値 (9)） */
export function syncFailText(v: EmbedView): string {
  return `${v.title}。動画なしで保存できます。`
}
