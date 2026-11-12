// 同期中（S7b）の案内の行の文と帯（M3 の手順 6、M3-04、m3-kickoff 手順 6・§7-28・§7-41、仮）。訳（src/play/sync-cause.ts）×
// now → 案内の行の文・帯 sync・自動再生ブロックの帯の純関数。案内の行は手順 3 の 1 行（screens/play.ts の status。行は足さない）
// で、文は「同期中（…）」の形・全角 24 字以内（半角は 0.5 字）。帯は長引くときだけ（広告とみなした時はその場、BUFFERING は
// 2,000 ms から）で、開始・再開の 300 ms の猶予では出さない（m6 は開始・再開のたびに帯 L623・L970 → 案内の行だけ）。
// 自動再生ブロックの帯は再開の playVideo から PLAYING までの間だけ（1,000 ms 来ない・autoplayBlocked・notVisible）。
// 出どころ: m6 bandsHtml L792（同期中の帯）・L801（自動再生ブロックの文）・S7b L939。

import type { SyncCause, SyncCauseKind } from '../play/sync-cause.ts'

/** 案内の行の文（grace は手順 2 の PHASE_TEXT.syncing と同じ文） */
export const SYNC_TEXT: Readonly<Record<SyncCauseKind, string>> = {
  grace: '同期中（300 ms は判定を猶予します）',
  jump: '同期中（動画の時刻が飛びました）',
  buffering: '同期中（動画の読み込み待ち）',
  ad: '同期中（動画が進みません。Esc で一時停止）',
  resumeWait: '同期中（動画の再生待ち）',
}

/** 再開の playVideo から PLAYING が来ないまま、自動再生ブロックとみなす ms（自作値、§7-41） */
export const AUTOPLAY_WAIT_MS = 1000

/** 自動再生ブロックの帯の 2 つ目の文（notVisible ＝ 半分超が見えず、口が playVideo を呼ばなかった） */
export const NOT_VISIBLE_TITLE = 'プレイヤーが隠れています'
export const NOT_VISIBLE_DETAIL = '半分以上が見える位置に戻し、プレイヤーの ▶ を押してください。'

export interface SyncNotice {
  /** 案内の行の文（訳が無ければ null ＝ 相の文のまま） */
  readonly text: string | null
  /** 帯 sync を出すか */
  readonly band: boolean
  /** 自動再生ブロックの帯（null は出さない。blocked ＝ 今の文、notVisible ＝ 2 つ目の文） */
  readonly autoplay: 'blocked' | 'notVisible' | null
}

const NONE: SyncNotice = { text: null, band: false, autoplay: null }

export function syncNotice(c: SyncCause | null, now: number): SyncNotice {
  if (c === null) return NONE
  const band = c.bandFrom !== null && now >= c.bandFrom
  let autoplay: SyncNotice['autoplay'] = null
  if (c.kind === 'resumeWait') {
    if (c.blocked === 'notVisible') autoplay = 'notVisible'
    else if (c.blocked === 'autoplayBlocked' || now - c.since >= AUTOPLAY_WAIT_MS)
      autoplay = 'blocked'
  }
  return { text: SYNC_TEXT[c.kind], band, autoplay }
}

/** 全角換算の字数（半角〔ASCII〕は 0.5 字。案内の行は全角 24 字の幅、手順 3） */
export function zenkakuLength(s: string): number {
  let n = 0
  for (const ch of s) n += /[\x20-\x7e]/.test(ch) ? 0.5 : 1
  return n
}
