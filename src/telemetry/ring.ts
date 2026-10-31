// 計測の行のリング（M0-12、手順 12）。出どころ: design.md §4.3（telemetry はリング 1,000 行）、m3 `logEvent` L385–386（手直し:
// 文字ラベル 40 件 → §4.6 の行 1,000 行）、kickoff 手順 12 の期待値（1,001 行目で先頭が消える）、decisions #54（仮）。
// 保存する側の刈り込みは保存層（IndexedDB は src/storage/idb.ts の appendTelemetry、メモリは fallback.ts の memoryDb。
// decisions #51）。ここはこのページの間の行（計測盤が DB の読みを待たずに出す・開発ページの表）を同じ規則で持つ。

import { TELEMETRY_RING_SIZE } from '../shared/types.ts'

/** 末尾に足し、size を超えたら古い順（先頭）から捨てる。元の配列は変えない */
export function pushRing<T>(rows: readonly T[], row: T, size = TELEMETRY_RING_SIZE): T[] {
  if (!(size >= 1)) throw new RangeError('pushRing: size は 1 以上')
  const out = rows.length >= size ? rows.slice(rows.length - size + 1) : [...rows]
  out.push(row)
  return out
}
