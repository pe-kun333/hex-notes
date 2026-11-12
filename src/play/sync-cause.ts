// 同期中（S7b）の訳（M3 の手順 6、M3-04、m3-kickoff 手順 6・§7-28、仮）。時計の事象と動画への要求 → 同期中の訳と入った now の
// 純関数。src/youtube/ を import せず、口の事象（自動再生ブロック・プレイヤーが隠れている）は種類の文字列だけ受ける。
// 訳を持つのは源 video の同期中と、源 novideo の間に PLAYING を見て戻りを待つ同期中（returnWait。M3 の手順 7）だけ（一時停止・
// 終了・それ以外の源 novideo で消える）。出どころ: m6 S7b L939・帯 L792、m3 resync L376–382、design §1.3 S2 L79・S7 L89、decisions #33〜#35。
// 案内の行の文と帯は src/app/sync-notice.ts。

import type { ClockEvent, ClockMode, VideoRequest } from '../clock/types.ts'
import type { PlayPhase } from './state.ts'

/**
 * 同期中の訳。grace ＝ 飛び以外の再アンカーの猶予（開始・再開・広告明け…）、jump ＝ 動画の時刻の飛び、buffering ＝ 動画が
 * PLAYING でない（PAUSED・ENDED 以外。BUFFERING・CUED・UNSTARTED）、ad ＝ 停止検知の要求が効かず広告中とみなした、
 * resumeWait ＝ 再開の playVideo から PLAYING まで、returnWait ＝ 動画なしへ切り替えた後に PLAYING を見てから読みが動くまで
 * （M3 の手順 7。2,000 ms 動かなければ広告の文と帯）
 */
export type SyncCauseKind = 'grace' | 'jump' | 'buffering' | 'ad' | 'resumeWait' | 'returnWait'

/** 再開の待ちの間に口が知らせた事（最初の 1 つだけ控える） */
export type ResumeBlock = 'autoplayBlocked' | 'notVisible'

export interface SyncCause {
  readonly kind: SyncCauseKind
  /** 訳に入った now */
  readonly since: number
  /**
   * 帯 sync を出し始める now（null は出さない）。ad はその場、buffering は 2,000 ms 後。広告の後の buffering は広告の時刻を
   * 引き継ぐ（帯を一度下ろして出し直さない）
   */
  readonly bandFrom: number | null
  /** resumeWait の間に来た口の事象（最初の 1 つ） */
  readonly blocked?: ResumeBlock
}

/** buffering が長引いたとみなして帯 sync を出すまでの ms（自作値、§7-41） */
export const SYNC_BAND_MS = 2000

/** 1 歩の入力（状態機械と時計の 1 歩の後の相と源、その歩の事象と動画への要求） */
export interface SyncCauseInput {
  readonly phase: PlayPhase
  readonly source: ClockMode
  readonly events: readonly ClockEvent[]
  readonly video: readonly VideoRequest[]
  readonly now: number
}

const isBuffering = (e: ClockEvent): boolean =>
  e.kind === 'held' && e.state !== 'paused' && e.state !== 'ended'

/**
 * 1 歩の後の訳。源 video の同期中でなければ null。事象を出た順に見て、最後に要求の playVideo（再開）を見る。事象も要求も
 * 無い歩は前の訳のまま（前が無ければ grace）
 */
export function syncCauseStep(prev: SyncCause | null, i: SyncCauseInput): SyncCause | null {
  if (i.phase !== 'syncing') return null
  if (i.source === 'novideo') return returnWaitStep(prev, i)
  let c = prev
  for (const e of i.events) {
    if (e.kind === 'resync')
      c = { kind: e.reason === 'jump' ? 'jump' : 'grace', since: i.now, bandFrom: null }
    else if (e.kind === 'adSuspected') c = { kind: 'ad', since: i.now, bandFrom: i.now }
    else if (isBuffering(e)) {
      // 同じ訳の held（BUFFERING → CUED）は入った now を保つ。再開の待ちの間の BUFFERING は待ちを数え直さない
      if (c?.kind === 'buffering') continue
      c = {
        kind: 'buffering',
        since: i.now,
        bandFrom: c?.kind === 'ad' ? c.bandFrom : i.now + SYNC_BAND_MS,
      }
    }
  }
  if (i.video.some((q) => q.kind === 'playVideo'))
    c = { kind: 'resumeWait', since: i.now, bandFrom: null }
  return c ?? { kind: 'grace', since: i.now, bandFrom: null }
}

/**
 * 源 novideo の同期中: PLAYING（時計の held state playing）を見てから再アンカーまでが returnWait。再アンカー（resume・fallback の
 * 猶予）の後は訳なし
 */
function returnWaitStep(prev: SyncCause | null, i: SyncCauseInput): SyncCause | null {
  let c = prev?.kind === 'returnWait' ? prev : null
  for (const e of i.events) {
    if (e.kind === 'resync') c = null
    else if (e.kind === 'held' && e.state === 'playing' && c === null)
      c = { kind: 'returnWait', since: i.now, bandFrom: i.now + SYNC_BAND_MS }
  }
  return c
}

/**
 * 口の事象（自動再生ブロック・プレイヤーが隠れていて playVideo を呼ばなかった）。再開の待ちの間の最初の 1 つだけ控え、
 * 他の訳・訳なしでは何もしない（渡した物をそのまま返す）
 */
export function syncCauseBlock(c: SyncCause | null, block: ResumeBlock): SyncCause | null {
  if (c === null || c.kind !== 'resumeWait' || c.blocked !== undefined) return c
  return { ...c, blocked: block }
}
