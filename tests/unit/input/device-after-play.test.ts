import { describe, expect, it } from 'vitest'
import { deviceAfterPlay, estimateTsResolution, isCoarse } from '../../../src/input/resolution.ts'
import type { DeviceInfo } from '../../../src/shared/types.ts'
import { deviceRow } from '../../../src/telemetry/rows.ts'

// 回の終わりの刻みの更新 deviceAfterPlay（M3 の手順 11、m3-kickoff 手順 11 の期待値 (5)・§7-38、仮）。出どころ: decisions #25 (c)・
// #55 (b)、design §4.3（hexnote.device.tsResolution）・§4.6（device 行）。系列は台帳の式（隣の差で格子を見るので式で固定する）。

const seq = (n: number, f: (i: number) => number): number[] =>
  Array.from({ length: n }, (_, i) => f(i))
/** 0.1 ms 格子 */
const g01 = (i: number): number =>
  Math.round((5000.03 + 83.37 * i + ((31 * i) % 7) * 0.9) * 10) / 10
/** Windows の入力時刻の tick（15.625 ms） */
const tick = (i: number): number =>
  Math.floor(Math.floor((10000 + 137.31 * i + ((7919 * i) % 1000) / 37) / 15.625) * 15.625)
/** 丸めなし */
const raw = (i: number): number => 5000.0073 + 83.3711 * i + 0.37 * Math.sin(i)
/** 16.667 ms 格子 */
const g16 = (i: number): number =>
  Math.floor((9000 + 91.7 * i + ((13 * i) % 5) * 7.1) / 16.667) * 16.667
/** 1 ms 格子 */
const g1 = (i: number): number => Math.round(7000.4 + 77.7 * i + ((17 * i) % 9) * 1.3)

const A = '2026-11-01T00:00:00.000Z'
const DIAG: DeviceInfo = { limit: 4, at: A, layoutMapOk: true }
const SKIP: DeviceInfo = { limit: 2, at: A, layoutMapOk: true, diagnosed: false }
const UA_C =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const UA_F = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0'
const NOW = '2026-11-12T00:00:00.000Z'

describe('回の終わりの刻みの更新 deviceAfterPlay（期待値 (5)）', () => {
  it('未診断（device 無し・同時押しテストを飛ばした）・q null（19 値）・同じ値・q 0（丸めなし）は書かない', () => {
    expect(deviceAfterPlay(null, seq(20, g01))).toBeNull()
    expect(deviceAfterPlay(SKIP, seq(20, g01))).toBeNull()
    expect(deviceAfterPlay(DIAG, seq(19, g01))).toBeNull()
    expect(deviceAfterPlay({ ...DIAG, tsResolution: 0.1 }, seq(20, g01))).toBeNull()
    expect(deviceAfterPlay({ ...DIAG, tsResolution: 0.1 }, seq(40, raw))).toBeNull()
    expect(deviceAfterPlay({ ...DIAG, tsResolution: 15.625 }, seq(19, g01))).toBeNull()
  }) // prettier-ignore

  it('刻みが決まった・変わった回は tsResolution だけ替え、at（診断の時刻）はそのまま。device 行の ua は大分類、行の at は今の時刻', () => {
    const a = deviceAfterPlay(DIAG, seq(20, g01))
    expect(a).toEqual({ ...DIAG, tsResolution: 0.1 })
    expect(deviceRow({ ua: UA_C, screenPx: [1366, 768], dpr: 1, device: a as DeviceInfo }, NOW)).toEqual({ kind: 'device', at: NOW, ua: 'chrome/windows', screenPx: [1366, 768], dpr: 1, limit: 4, layoutMapOk: true, tsResolution: 0.1 })
    const b = deviceAfterPlay({ ...DIAG, tsResolution: 0.1 }, seq(30, tick))
    expect([b?.tsResolution, b?.at, isCoarse(b?.tsResolution ?? null)]).toEqual([15.625, A, true])
    expect(deviceRow({ ua: UA_F, screenPx: [1366, 768], dpr: 1, device: b as DeviceInfo }, NOW).ua).toBe('firefox/windows')
    expect([deviceAfterPlay(DIAG, seq(30, g16))?.tsResolution, deviceAfterPlay(DIAG, seq(30, g1))?.tsResolution]).toEqual([16.667, 1])
  }) // prettier-ignore

  it('別の作りの系列は別の格子に読まれる（試験の系列は式で固定する理由）', () => {
    expect(estimateTsResolution(seq(30, (i) => Math.round((10000 + 137.31 * i + ((7919 * i) % 97)) / 16.667) * 16.667)).q).toBe(100)
    expect(estimateTsResolution(seq(30, (i) => Math.round(9000 + 91.7 * i + ((13 * i) % 5) * 7.1))).q).toBe(15.625)
  }) // prettier-ignore
})
