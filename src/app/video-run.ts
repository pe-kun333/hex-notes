// 動画の回の門と、その回が動画で走るかの述語（M3 の手順 2、仮。m3-kickoff §2「製品の束の門」・§7-13、decisions #93・#94）。
// 門 VIDEO_FEATURE は開発時だけ真で、build（製品の束）では偽。門の内（S2 の動画の回、手順 4 の S5 段 4・S1 の印と切替、
// 手順 8 の S3 の注記、手順 9 の S6 の YouTube の行など）は各手順がこの門で閉じる。外すのは手順 12 の PR（条件 2 つは
// m3-kickoff §2・§7-13）。手順 2〜11 の確かめは DEV。

import type { Sync } from '../shared/types.ts'
import { videoIdOf } from '../youtube/video-id.ts'

/** 製品の束の門（開発時だけ真。build では偽） */
export const VIDEO_FEATURE: boolean = import.meta.env.DEV

/**
 * その回を動画で走らせるなら動画 ID、でなければ null。sources[0] が youtube で動画 ID が 11 文字そのもの（URL の形は
 * 受けない）、「動画を使う」が真、練習室（S4）でない、門が真の 4 つ。S4 は sync に依らず動画なしの回（decisions #94）。
 */
export function videoRunOf(
  sync: Pick<Sync, 'sources'> | undefined,
  use: boolean,
  room: boolean,
  feature: boolean = VIDEO_FEATURE,
): string | null {
  if (!feature || !use || room) return null
  const s = sync?.sources[0]
  if (s === undefined || s.kind !== 'youtube') return null
  const id = s.videoId
  return id !== undefined && videoIdOf(id) === id ? id : null
}
