// S6 の計測盤の文言（M1-12、M1 の手順 12）。出どころ: design.md §1.3 S6（計測盤）・§4.6（初版は送信しない。S6 の計測盤で
// 見て JSON で書き出す）、m6 renderS6 の計測盤 L926（「貯まった行 n 行（リング 1,000 行。初版は送信しません）」「JSON で
// 書き出す」）、decisions #54・#55 (d)、m1-kickoff 手順 12（countByKind の表・最近の行 20 件・telemetryFileName で書き出し）。
// 行の要約は開発ページ telemetry-dev.ts の brief をここへ移した（開発ページもこれを使う）。純関数（DOM は telemetry-panel.ts）。

import { TELEMETRY_RING_SIZE, type TelemetryRow } from '../shared/types.ts'
import {
  countByKind,
  telemetryExport,
  telemetryFileName,
  telemetryFileText,
} from '../telemetry/export.ts'
import { signedMs } from './calibration.ts'

/** 計測盤に出す最近の行の数（m1-kickoff 手順 12） */
export const RECENT_ROWS = 20

type Kind = TelemetryRow['kind']

/** 種類の名前（表の順。countByKind の鍵と同じ） */
export const KIND_NAMES: Readonly<Record<Kind, string>> = {
  play: 'プレイ',
  calib: '校正',
  onboard: '初回導線',
  quit: '離脱',
  device: '端末',
  storageFail: '保存の失敗',
  embedError: '動画の埋め込みの失敗',
  sync: '同期タップ',
}

export interface KindCount {
  readonly kind: Kind
  readonly label: string
  readonly n: number
}

export interface RecentRow {
  /** 端末のローカル時刻（YYYY-MM-DD HH:MM:SS。読めない at はそのまま） */
  readonly at: string
  readonly kind: string
  readonly text: string
}

export interface TelemetryPanelView {
  /** 「貯まった行 n 行（リング 1,000 行。初版は送信しません）」 */
  readonly total: string
  /** 種類ごとの数（KIND_NAMES の順。0 の種類も出す） */
  readonly counts: readonly KindCount[]
  /** 新しい順に RECENT_ROWS 行まで */
  readonly recent: readonly RecentRow[]
}

const num = (n: number): string => n.toLocaleString('en-US')
const fix = (x: number | null, d = 1): string => (x === null ? '—' : x.toFixed(d))
const pad = (n: number): string => String(n).padStart(2, '0')

/** ISO 8601 → 端末のローカル時刻 */
export function localStamp(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** 行の要約（1 行。全部の欄は書き出しの JSON で見る） */
export function rowBrief(r: TelemetryRow): string {
  switch (r.kind) {
    case 'play':
      return (
        `${r.chartId.replace(/^sha256:/, '').slice(0, 8)}… ${r.variantId} ${r.profile} ${r.clock} ${r.mode}・` +
        `精度 ${fix(r.acc * 100)}%・UR ${fix(r.ur)}・NEAR ${fix(r.nearRate * 100)}%・再同期 ${r.resyncCount}・` +
        `切替 ${r.fallback ? 'あり' : 'なし'}・入力遅延 ${fix(r.inputLatencyMedian, 2)} ms（押下 ${r.pressCount}、` +
        `標本なし ${r.pressNoLag}）・フレーム SD ${fix(r.frameIntervalSd, 2)} p95 ${fix(r.frameIntervalP95)} ms・` +
        `時計残差 ${fix(r.clockResidualSd, 2)}・予約の遅れ ${fix(r.audioLateMaxMs)}`
      )
    case 'calib':
      return (
        `段 ${r.stage === 'tap' ? '1（タップ）' : '2（提案）'}・標本 ${r.n}・SD ${r.sd === null ? '—' : `${fix(r.sd)} ms`}・` +
        (r.proposed === null
          ? `満たさず（${r.reason ?? '—'}）`
          : `${signedMs(r.proposed)}・${r.applied ? '適用' : '見送り'}`)
      )
    case 'onboard':
    case 'quit':
      return `${r.step}・${fix(r.seconds)} 秒${r.left ? '・離脱' : ''}${r.where === undefined ? '' : `（${r.where}）`}`
    case 'device':
      return (
        `${r.ua}・${r.screenPx[0]}×${r.screenPx[1]}・拡大 ${r.dpr}・上限 ${r.limit}・getLayoutMap ` +
        `${r.layoutMapOk ? '可' : '不可'}・刻み ${r.tsResolution === undefined ? '—' : `${r.tsResolution} ms`}`
      )
    case 'storageFail':
      return `${r.where}: ${r.message}`
    case 'embedError':
      return `エラー ${r.code}`
    case 'sync':
      return (
        `${r.chartId.replace(/^sha256:/, '').slice(0, 8)}…・残差 SD ${fix(r.residualSd)} ms・offset ${r.offset.toFixed(3)} s・` +
        `rate ${r.rate.toFixed(4)}・${fix(r.elapsedS)} 秒・${r.attempts} 回目`
      )
  }
}

/** 計測盤の中身（rows は古い順。保存層の listTelemetry のまま） */
export function telemetryPanelView(rows: readonly TelemetryRow[]): TelemetryPanelView {
  const c = countByKind(rows)
  return {
    total: `貯まった行 ${num(rows.length)} 行（リング ${num(TELEMETRY_RING_SIZE)} 行。初版は送信しません）`,
    counts: (Object.keys(KIND_NAMES) as Kind[]).map((kind) => ({
      kind,
      label: KIND_NAMES[kind],
      n: c[kind],
    })),
    recent: rows
      .slice(-RECENT_ROWS)
      .reverse()
      .map((r) => ({ at: localStamp(r.at), kind: KIND_NAMES[r.kind], text: rowBrief(r) })),
  }
}

/** 書き出すファイルの名前と中身（hexnote-telemetry/1、decisions #55 (d)） */
export function telemetryDownload(
  rows: readonly TelemetryRow[],
  exportedAt: string,
): { readonly name: string; readonly text: string } {
  return {
    name: telemetryFileName(exportedAt),
    text: telemetryFileText(telemetryExport(rows, exportedAt)),
  }
}
