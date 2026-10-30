// 停止検知と pause 要求・広告中の副状態（M0-05、手順 7）。出どころ: design.md §2.6「可視・PLAYING で 2 秒凍結→
// pauseVideo() を呼び 500 ms 以内に PAUSED なら S7c、ならなければ広告中とみなし S7b のまま、復帰は手動のみ…非表示中は
// 停止検知しない」、§1.3 S7c、decisions #11（プログラムからの pause は停止検知の用途）、kickoff 手順 7 の手直し
// （m3 `frame` L599–610 の「2000 ms 不変」だけ → 要求と結果）、相談 C の案 C-2、decisions #34（仮）。
// 時計層は pauseVideo を呼ばず要求を返し、結果は次の tick の state 標本で受ける（呼び出し口は抽象）。

import type { VideoSample } from './types.ts'

/** 凍結とみなす長さ ms（§2.6）。最後に読みが変わってから 2,000 ms 以上 */
export const STALL_MS = 2000
/** pauseVideo の結果を待つ ms（§2.6）。要求から 500 ms 以内（境界を含む）の PAUSED なら動画なしへ */
export const PAUSE_WAIT_MS = 500
/** 広告中とみなした後、まだ凍結していれば pauseVideo を再び要求する周期 ms（相談 C、仮） */
export const REREQUEST_MS = 2500

/** 停止検知の条件: 可視・PLAYING で、最後の変化から 2,000 ms 以上（m3 L603 の「> 2000」を ≥ にした。decisions #34） */
export function isStalled(sample: VideoSample, lastChange: number, now: number): boolean {
  return sample.visible && sample.state === 'playing' && now - lastChange >= STALL_MS
}

/** 動画の読みが動いているか（最後の変化から 2,000 ms 未満）。「戻す」の条件で、停止検知と境界を分け合う */
export function isMoving(lastChange: number, now: number): boolean {
  return now - lastChange < STALL_MS
}

/**
 * pauseVideo の要求（reqAt）の結果。paused ＝ 500 ms 以内（境界を含む）に PAUSED が来た（動画なしへ）、
 * failed ＝ YouTube 層が呼べなかった（すぐ広告中へ）、timeout ＝ ＋500 ms の tick でも PAUSED でない（広告中へ）、
 * wait ＝ まだ待つ。＋500 ちょうどの tick は PAUSED なら paused、でなければ timeout。
 */
export function pauseOutcome(
  sample: VideoSample | null,
  reqAt: number,
  now: number,
): 'paused' | 'failed' | 'timeout' | 'wait' {
  const elapsed = now - reqAt
  if (sample !== null && sample.state === 'paused' && elapsed <= PAUSE_WAIT_MS) return 'paused'
  if (sample !== null && sample.pauseFailed === true) return 'failed'
  return elapsed >= PAUSE_WAIT_MS ? 'timeout' : 'wait'
}

/** 広告中に pauseVideo を再び要求するか（前の要求から 2.5 s、かつまだ可視・PLAYING で凍結） */
export function reRequestDue(
  sample: VideoSample,
  lastReqAt: number,
  lastChange: number,
  now: number,
): boolean {
  return now - lastReqAt >= REREQUEST_MS && isStalled(sample, lastChange, now)
}
