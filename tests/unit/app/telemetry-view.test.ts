import { describe, expect, it } from 'vitest'
import {
  KIND_NAMES,
  RECENT_ROWS,
  localStamp,
  rowBrief,
  telemetryDownload,
  telemetryPanelView,
} from '../../../src/app/telemetry-view.ts'
import type { PlayTelemetry, TelemetryRow } from '../../../src/shared/types.ts'
import { memoryDb } from '../../../src/storage/fallback.ts'
import { TELEMETRY_FORMAT } from '../../../src/telemetry/export.ts'
import { embedErrorRow, onboardRow, quitRow } from '../../../src/telemetry/rows.ts'

// src/app/telemetry-view.ts・S6 の計測盤（M1-12、M1 の手順 12）。出どころ: m1-kickoff 手順 12 の期待値（1,001 行目で先頭が消える、
// 書き出しは hexnote-telemetry/1 の {format, exportedAt, rows}）・完了条件「自分の行が見え書き出せる」（§5.2 L243）、m6 renderS6
// の計測盤 L926（「貯まった行 n 行（リング 1,000 行。初版は送信しません）」）、decisions #55 (d)、tests-inventory「M1 手順 12」。

const AT = '2026-10-31T00:00:00.000Z'

const PLAY: PlayTelemetry = {
  kind: 'play',
  at: AT,
  chartId: 'sha256:8ee244ea59ab605ee5b43e71fa422c83ae9946023ea9233f50127a1f28f866ae',
  variantId: 'ableton/2/octave',
  profile: 'beginner',
  clock: 'novideo',
  mode: 'fixed',
  ur: 123.4,
  hist: { '0': 5 },
  acc: 0.9421,
  nearRate: 0.05,
  resyncCount: 0,
  fallback: false,
  inputLatencyMedian: 1.9,
  pressCount: 120,
  pressNoLag: 2,
  frameIntervalSd: 1.3,
  frameIntervalP95: 17,
  clockResidualSd: null,
  audioLateMaxMs: 0,
}

describe('行の要約 rowBrief', () => {
  it('種類ごとの 1 行（null は —、ms は符号付き）', () => {
    expect(rowBrief(PLAY)).toBe(
      '8ee244ea… ableton/2/octave beginner novideo fixed・精度 94.2%・UR 123.4・NEAR 5.0%・再同期 0・切替 なし・' +
        '入力遅延 1.90 ms（押下 120、標本なし 2）・フレーム SD 1.30 p95 17.0 ms・時計残差 —・予約の遅れ 0.0',
    )
    expect(rowBrief({ kind: 'calib', at: AT, stage: 'tap', n: 24, sd: 12.34, applied: true, proposed: -18 })).toBe(
      '段 1（タップ）・標本 24・SD 12.3 ms・−18 ms・適用',
    )
    expect(rowBrief({ kind: 'calib', at: AT, stage: 'propose', n: 9, sd: 11, applied: false, proposed: 12 })).toBe(
      '段 2（提案）・標本 9・SD 11.0 ms・＋12 ms・見送り',
    )
    expect(rowBrief({ kind: 'calib', at: AT, stage: 'propose', n: 1, sd: null, applied: false, proposed: null, reason: 'count' })).toBe(
      '段 2（提案）・標本 1・SD —・満たさず（count）',
    )
    expect(rowBrief(onboardRow('S0b', 12.34, false, AT))).toBe('S0b・12.3 秒')
    expect(rowBrief(quitRow('S0d', 40, 'S2', AT))).toBe('S0d・40.0 秒・離脱（S2）')
    expect(rowBrief({ kind: 'device', at: AT, ua: 'chrome/windows', screenPx: [1920, 1080], dpr: 1.25, limit: 3, layoutMapOk: true, tsResolution: 0.1 })).toBe(
      'chrome/windows・1920×1080・拡大 1.25・上限 3・getLayoutMap 可・刻み 0.1 ms',
    )
    expect(rowBrief({ kind: 'device', at: AT, ua: 'firefox/linux', screenPx: [0, 0], dpr: 1, limit: 2, layoutMapOk: false })).toBe(
      'firefox/linux・0×0・拡大 1・上限 2・getLayoutMap 不可・刻み —',
    )
    expect(rowBrief({ kind: 'storageFail', at: AT, where: 'idb', message: 'QuotaExceededError' })).toBe('idb: QuotaExceededError')
    expect(rowBrief(embedErrorRow(101, AT))).toBe('エラー 101')
  }) // prettier-ignore

  it('時刻は端末のローカル（読めない at はそのまま）', () => {
    expect(localStamp(new Date(2026, 9, 31, 9, 5, 7).toISOString())).toBe('2026-10-31 09:05:07')
    expect(localStamp('bad')).toBe('bad')
  })
})

describe('計測盤 telemetryPanelView', () => {
  it('行が無い: 0 行、全種類が 0、最近の行は空（m6 L926 の文言）', () => {
    const v = telemetryPanelView([])
    expect(v.total).toBe('貯まった行 0 行（リング 1,000 行。初版は送信しません）')
    expect(v.counts.map((c) => [c.label, c.n])).toEqual(
      Object.values(KIND_NAMES).map((label) => [label, 0]),
    )
    expect(v.recent).toEqual([])
  })

  it('種類ごとの数と、新しい順の最近の行（種類の名前と要約）', () => {
    const rows: TelemetryRow[] = [PLAY, onboardRow('S0a', 3, false, AT), PLAY, embedErrorRow(5, AT)]
    const v = telemetryPanelView(rows)
    expect(v.total).toBe('貯まった行 4 行（リング 1,000 行。初版は送信しません）')
    expect(Object.fromEntries(v.counts.map((c) => [c.kind, c.n]))).toEqual({
      play: 2,
      calib: 0,
      onboard: 1,
      quit: 0,
      device: 0,
      storageFail: 0,
      embedError: 1,
      sync: 0,
    })
    expect(v.recent.map((r) => [r.kind, r.text])).toEqual([
      ['動画の埋め込みの失敗', 'エラー 5'],
      ['プレイ', rowBrief(PLAY)],
      ['初回導線', 'S0a・3.0 秒'],
      ['プレイ', rowBrief(PLAY)],
    ])
  })

  it('保存層に 1,001 行: 先頭が消えて 1,000 行、最近の行は新しい 20 行、書き出しは hexnote-telemetry/1', async () => {
    const db = memoryDb()
    for (let i = 0; i < 1001; i++) await db.appendTelemetry(embedErrorRow(i, AT))
    const rows = await db.listTelemetry()
    const v = telemetryPanelView(rows)
    expect(v.total).toBe('貯まった行 1,000 行（リング 1,000 行。初版は送信しません）')
    expect(v.recent).toHaveLength(RECENT_ROWS)
    expect(RECENT_ROWS).toBe(20)
    expect(v.recent[0]?.text).toBe('エラー 1000')
    expect(v.recent[19]?.text).toBe('エラー 981')

    const f = telemetryDownload(rows, '2026-11-01T12:34:56.000Z')
    expect(f.name).toBe('hexnote-telemetry-2026-11-01.json')
    const x = JSON.parse(f.text) as { format: string; exportedAt: string; rows: TelemetryRow[] }
    expect(Object.keys(x)).toEqual(['format', 'exportedAt', 'rows'])
    expect(x.format).toBe(TELEMETRY_FORMAT)
    expect(x.format).toBe('hexnote-telemetry/1')
    expect(x.exportedAt).toBe('2026-11-01T12:34:56.000Z')
    expect(x.rows).toHaveLength(1000)
    expect(x.rows[0]).toEqual(embedErrorRow(1, AT))
    expect(x.rows[999]).toEqual(embedErrorRow(1000, AT))
  })
})
