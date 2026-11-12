// 同期中（S7b）の案内の行の文と帯（M3 の手順 6、M3-04、m3-kickoff 手順 6・§7-28・§7-41、仮）。訳（src/play/sync-cause.ts）×
// now → 案内の行の文・帯 sync・自動再生ブロックの帯の純関数。案内の行は手順 3 の 1 行（screens/play.ts の status。行は足さない）
// で、文は「同期中（…）」の形・全角 24 字以内（半角は 0.5 字）。帯は長引くときだけ（広告とみなした時はその場、BUFFERING は
// 2,000 ms から）で、開始・再開の 300 ms の猶予では出さない（m6 は開始・再開のたびに帯 L623・L970 → 案内の行だけ）。
// 自動再生ブロックの帯は再開の playVideo から PLAYING までの間だけ（1,000 ms 来ない・autoplayBlocked・notVisible）。
// 出どころ: m6 bandsHtml L792（同期中の帯）・L801（自動再生ブロックの文）・S7b L939。
// M3 の手順 7（M3-05 後半、§7-4 の案 A ＝ #96・§7-15・§7-22、仮）: 戻りを待つ訳 returnWait（文は再生待ち、2,000 ms 動かなければ
// 広告の文と帯 sync）、S7c の帯 videoFallback の 3 つの形（fallbackBand）、案内の行の S7c の 3 文（S7C_TEXT）。

import type { SyncCause, SyncCauseKind } from '../play/sync-cause.ts'
import type { BandEvent } from './bands.ts'

/** 案内の行の文（grace は手順 2 の PHASE_TEXT.syncing と同じ文） */
export const SYNC_TEXT: Readonly<Record<SyncCauseKind, string>> = {
  grace: '同期中（300 ms は判定を猶予します）',
  jump: '同期中（動画の時刻が飛びました）',
  buffering: '同期中（動画の読み込み待ち）',
  ad: '同期中（動画が進みません。Esc で一時停止）',
  resumeWait: '同期中（動画の再生待ち）',
  returnWait: '同期中（動画の再生待ち）',
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
  // 戻りを待つ間に 2,000 ms 動かなければ広告とみなした時と同じ文（出口は Esc → Pause）
  const text = c.kind === 'returnWait' && band ? SYNC_TEXT.ad : SYNC_TEXT[c.kind]
  return { text, band, autoplay }
}

/** S7c の案内の行の文（再生 × 動画なしで切替の後、音の出ない間、戻りの後。全角換算 11・19.5・21.5〜22.5 字） */
export const S7C_TEXT = {
  piano: 'ピアノ音で続けています',
  silent: '音が出ないときは鍵を 1 つ押してください',
  countdown: (ms: number): string =>
    `動画に戻しました。あと ${Math.ceil(ms / 1000)} 秒で続きが流れます`,
} as const

/** S7c の帯の 2 つの題（m6 L797 の既定は bands.ts の VIDEO_FALLBACK_TITLE） */
export const FALLBACK_GUIDE_TITLE = 'プレイヤーの ▶ を押してください'
export const FALLBACK_FAILED_TITLE = '動画に戻せません。ピアノ音で続けます'

export interface FallbackBandInput {
  /** 動画なしへ切り替えた回で、今の源が novideo（S7c の後） */
  readonly switched: boolean
  /** 待機・終了では出さない */
  readonly running: boolean
  /** 戻りを待つ間（returnWait。帯は sync だけ） */
  readonly waiting: boolean
  /** 「戻す」を押した（▶ の案内） */
  readonly guide: boolean
  /** 切替の後に口が失敗を知らせた（戻せない） */
  readonly failed: boolean
}

/**
 * S7c の帯 videoFallback（手順 3 の事象）。形は 3 つ: 切替 ＝ 題は既定・釦「戻す」有効、案内 ＝ 釦の後「プレイヤーの ▶ を
 * 押してください」・無効、失敗の後 ＝「動画に戻せません。ピアノ音で続けます」・無効。戻りを待つ間・戻り・待機・終了は下ろす
 */
export function fallbackBand(i: FallbackBandInput): Extract<BandEvent, { kind: 'videoFallback' }> {
  if (!i.switched || !i.running || i.waiting) return { kind: 'videoFallback', on: false }
  if (i.failed)
    return { kind: 'videoFallback', on: true, title: FALLBACK_FAILED_TITLE, enabled: false }
  if (i.guide)
    return { kind: 'videoFallback', on: true, title: FALLBACK_GUIDE_TITLE, enabled: false }
  return { kind: 'videoFallback', on: true, enabled: true }
}

/** 全角換算の字数（半角〔ASCII〕は 0.5 字。案内の行は全角 24 字の幅、手順 3） */
export function zenkakuLength(s: string): number {
  let n = 0
  for (const ch of s) n += /[\x20-\x7e]/.test(ch) ? 0.5 : 1
  return n
}
