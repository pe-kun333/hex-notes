// プレイヤーの読みを時計の標本にする・時計の要求をプレイヤーの呼び出しにする（M3 の手順 1、仮）。DOM に触れない。
// 標本の決まり（m3-kickoff 手順 1）: 読めない・準備前は null。rate は 1 に倒さない（m3 L307 の `|| 1` はしない）。
// プログラムから呼ぶのは pauseVideo・playVideo だけ（decisions #11・#95。ループ頭出しの seek は M4 の後、#94）。

import type { VideoRequest, VideoSample, VideoState } from '../clock/types.ts'

/** IFrame の PlayerState（−1・0・1・2・3・5） */
const STATES: ReadonlyMap<number, VideoState> = new Map([
  [-1, 'unstarted'],
  [0, 'ended'],
  [1, 'playing'],
  [2, 'paused'],
  [3, 'buffering'],
  [5, 'cued'],
])

/** PlayerState の数を状態にする（一覧に無い値・数でない値は null） */
export function videoStateOf(n: unknown): VideoState | null {
  return typeof n === 'number' ? (STATES.get(n) ?? null) : null
}

/** プレイヤーの 1 回の読み（getPlayerState・getCurrentTime〔秒〕・getPlaybackRate の戻りそのまま） */
export interface PlayerRead {
  state: unknown
  timeS: unknown
  rate: unknown
  /** 文書が表示中か */
  visible: boolean
  /** pauseVideo を呼べなかった後の最初の標本 */
  pauseFailed?: boolean
}

/** 読みを標本にする。状態・時刻・レートのどれかが読めなければ null（読みの無い tick と同じ） */
export function sampleOf(r: PlayerRead): VideoSample | null {
  const state = videoStateOf(r.state)
  if (state === null) return null
  if (typeof r.timeS !== 'number' || !Number.isFinite(r.timeS)) return null
  if (typeof r.rate !== 'number' || !Number.isFinite(r.rate) || r.rate <= 0) return null
  const s: VideoSample = { state, timeMs: r.timeS * 1000, rate: r.rate, visible: r.visible }
  return r.pauseFailed === true ? { ...s, pauseFailed: true } : s
}

/** プレイヤーで呼ぶ関数の名（pauseVideo・playVideo だけ。他の要求は呼ばない ＝ null） */
export type PlayerCall = 'pauseVideo' | 'playVideo'

export function playerCall(q: VideoRequest): PlayerCall | null {
  switch (q.kind) {
    case 'pauseVideo':
      return 'pauseVideo'
    case 'playVideo':
      return 'playVideo'
    default:
      return null
  }
}
