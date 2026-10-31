// 計測の書き出し（M0-12、手順 12）。出どころ: design.md §4.6（初版は送信しない。S6 の計測盤で見て JSON で書き出す。動画 ID と
// 視聴時間は送らない）・§5 M1-12（計測盤）、decisions #54（仮）。
// 形は format hexnote-telemetry/1 の 1 つの JSON（行は 1 行に 1 つ。目で追えるように）。*.hexnote.json（保存層の取り込み）とは
// 別の物で、取り込まない。純関数（ダウンロードは src/app/file-io.ts）。

import { TELEMETRY_RING_SIZE, type TelemetryRow } from '../shared/types.ts'

export const TELEMETRY_FORMAT = 'hexnote-telemetry/1' as const

export interface TelemetryExport {
  readonly format: typeof TELEMETRY_FORMAT
  readonly exportedAt: string
  /** 古い順。リングの上限まで */
  readonly rows: readonly TelemetryRow[]
}

export function telemetryExport(
  rows: readonly TelemetryRow[],
  exportedAt: string,
): TelemetryExport {
  return { format: TELEMETRY_FORMAT, exportedAt, rows: rows.slice(-TELEMETRY_RING_SIZE) }
}

/** 書き出す文字列（JSON として読める。行は 1 行に 1 つ） */
export function telemetryFileText(x: TelemetryExport): string {
  const head = `{"format":${JSON.stringify(x.format)},"exportedAt":${JSON.stringify(x.exportedAt)},"rows":[`
  return `${head}\n${x.rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`
}

/** hexnote-telemetry-2026-10-31.json */
export function telemetryFileName(exportedAt: string): string {
  return `hexnote-telemetry-${exportedAt.slice(0, 10)}.json`
}

/** 種類ごとの行の数（計測盤の見出し。無い種類は 0） */
export function countByKind(rows: readonly TelemetryRow[]): Record<TelemetryRow['kind'], number> {
  const c: Record<TelemetryRow['kind'], number> = {
    play: 0,
    calib: 0,
    onboard: 0,
    quit: 0,
    device: 0,
    storageFail: 0,
    embedError: 0,
  }
  for (const r of rows) c[r.kind]++
  return c
}
