// その回が動画で走るかの述語（M3 の手順 2、仮。m3-kickoff §2「製品の束の門」・§7-13、decisions #93・#94）。
// M3 の手順 2〜12 の間は、製品の束の門 VIDEO_FEATURE（開発時だけ真）で動画の物（S2 の動画の回、S5 段 4・S1 の印と切替、
// S3 の注記、S6 の YouTube の行など）を閉じていた。条件 2 つ（照合の件が閉じる・実 IFrame で ▶ から S3 まで 1 回）が揃い、
// 門を外す PR（2026-11-13、decisions #114）で門ごと外した。

import type { Sync } from '../shared/types.ts'
import { videoIdOf } from '../youtube/video-id.ts'

/**
 * その回を動画で走らせるなら動画 ID、でなければ null。sources[0] が youtube で動画 ID が 11 文字そのもの（URL の形は
 * 受けない）、「動画を使う」が真、練習室（S4）でないの 3 つ。S4 は sync に依らず動画なしの回（decisions #94）。
 */
export function videoRunOf(
  sync: Pick<Sync, 'sources'> | undefined,
  use: boolean,
  room: boolean,
): string | null {
  if (!use || room) return null
  const s = sync?.sources[0]
  if (s === undefined || s.kind !== 'youtube') return null
  const id = s.videoId
  return id !== undefined && videoIdOf(id) === id ? id : null
}
