// 実物のプレイヤーの口の芯（M3 の手順 1、仮）。YT.Player（の使う口だけ）を VideoPort にする。毎フレーム state・時刻・
// rate をプレイヤーから読み（事象の控えも直前の読みも使わない）、時計と状態機械の要求を pauseVideo・playVideo の呼び出しに
// する。playVideo は矩形が半分を超えて見えないときは呼ばずに notVisible（design §2.9 L149）。pauseVideo を呼べなかった
// （例外・プレイヤーが無い）ときは、次の null でない標本に 1 回だけ pauseFailed を付ける（停止検知が広告中とみなす）。
// 事象の型 PortEvent は手順 5〜7 と DEV の筋書きが引く形。app 層（app/youtube-player.ts）が DOM と YT を渡す。

import type { VideoPort, VideoRequest, VideoSample, VideoState } from '../clock/types.ts'
import type { ErrorGroup } from './errors.ts'
import { playerCall, sampleOf } from './player-state.ts'

/** YT.Player の、口が使う所だけ */
export interface PlayerLike {
  getPlayerState(): unknown
  getCurrentTime(): unknown
  getPlaybackRate(): unknown
  pauseVideo(): void
  playVideo(): void
}

/** 口の事象（どれもハンドラの performance.now の at 付き。読込済みは事象にせず、sample() が null でなくなる事で読む） */
export type PortEvent =
  | { kind: 'loadFail'; code: number; at: number }
  | { kind: 'noResponse'; code: number; at: number }
  | { kind: 'error'; code: number; group: ErrorGroup; at: number }
  | { kind: 'state'; state: VideoState; at: number }
  | { kind: 'rate'; rate: number; at: number }
  | { kind: 'autoplayBlocked'; at: number }
  | { kind: 'notVisible'; at: number }

export interface PlayerPortOptions {
  /** 準備のできたプレイヤー（onReady の前と作り直しの間は null） */
  player: () => PlayerLike | null
  /** 文書が表示中か */
  visible: () => boolean
  /** 矩形が半分を超えて見えているか（visible.ts の moreThanHalfVisible） */
  halfVisible: () => boolean
  onEvent: (e: PortEvent) => void
}

/** 読みの関数が投げたら undefined（準備前のプレイヤーは getCurrentTime などで投げることがある） */
function read(f: () => unknown): unknown {
  try {
    return f()
  } catch {
    return undefined
  }
}

export function playerPort(opts: PlayerPortOptions): VideoPort {
  let pauseFailed = false
  let disposed = false

  return {
    sample(): VideoSample | null {
      if (disposed) return null
      const p = opts.player()
      if (p === null) return null
      const s = sampleOf({
        state: read(() => p.getPlayerState()),
        timeS: read(() => p.getCurrentTime()),
        rate: read(() => p.getPlaybackRate()),
        visible: opts.visible(),
        pauseFailed,
      })
      if (s !== null) pauseFailed = false
      return s
    },
    apply(now: number, requests: readonly VideoRequest[]): void {
      if (disposed) return
      for (const q of requests) {
        const call = playerCall(q)
        if (call === null) continue
        if (call === 'playVideo' && !opts.halfVisible()) {
          opts.onEvent({ kind: 'notVisible', at: now })
          continue
        }
        const p = opts.player()
        try {
          if (p === null) throw new Error('プレイヤーが無い')
          if (call === 'pauseVideo') p.pauseVideo()
          else p.playVideo()
        } catch {
          if (call === 'pauseVideo') pauseFailed = true
        }
      }
    },
    dispose(): void {
      disposed = true
    },
  }
}
