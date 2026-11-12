import { describe, expect, it } from 'vitest'
import { stageOf } from '../../../src/app/stage.ts'
import { KIND_NAMES, rowBrief } from '../../../src/app/telemetry-view.ts'
import { LAYOUTS } from '../../../src/layout/presets.ts'
import { TRAVEL_MS } from '../../../src/render/hex/sizing.ts'
import { awardsFor, countsForAwards, isTargetPlay } from '../../../src/results/awards.ts'
import { bestOf, finishedSong } from '../../../src/results/best.ts'
import { isFinished } from '../../../src/results/record.ts'
import type { ResultRecord, SyncTelemetry, TelemetryRow } from '../../../src/shared/types.ts'
import {
  collectClock,
  initialCollect,
  playRow,
  type PlayMeta,
} from '../../../src/telemetry/collect.ts'
import { countByKind } from '../../../src/telemetry/export.ts'
import { embedErrorRow } from '../../../src/telemetry/rows.ts'

// 通し検証の値（M3 の手順 12、M3-10、仮）。出どころ: m3-kickoff 手順 12 の期待値 (2)〜(4)（(2)・(3) の区分・称号・streak・
// (4) の見本の 6 行は実物のモジュールで node で検算。(3) の手順 2・8 の後の値は原型で検算した値）、design §2.5・§3.3 L172・
// §4.4 L194・§4.6、decisions #5・#71 (b)・#108。通しの pane の値は docs/planning/m3-verification.md §14。

describe('3 視口の箱と矩形（期待値 (2)。S2 の動画あり形態）', () => {
  const VPS = [
    { w: 1366, h: 668 },
    { w: 1280, h: 620 },
    { w: 1093, h: 514 },
  ]
  it('箱 850×644・764×596・577×490、左上 (504, 12)、#player 480×270、limited null。入門者・音ゲー向けの R・v', () => {
    const at = (layout: 'ableton' | 'vmpk', travel: number): string[] =>
      VPS.map((vp) => {
        const s = stageOf(vp, LAYOUTS[layout].rowsUsed, travel)
        return `${s.box.left},${s.box.top} ${s.box.width}×${s.box.height} ${s.player.w}×${s.player.h} ${s.sizing.limited} R${s.sizing.R} v${Math.round(s.sizing.v * 10000) / 10000}`
      })
    expect(at('ableton', TRAVEL_MS.beginner)).toEqual(['504,12 850×644 480×270 null R28 v0.3587', '504,12 764×596 480×270 null R28 v0.3267', '504,12 577×490 480×270 null R28 v0.256'])
    expect(at('vmpk', TRAVEL_MS.beginner)).toEqual(['504,12 850×644 480×270 null R28 v0.3027', '504,12 764×596 480×270 null R28 v0.2707', '504,12 577×490 480×270 null R27 v0.2043'])
    expect(at('ableton', TRAVEL_MS.gamer).map((x) => x.split(' v')[1])).toEqual(['0.538', '0.49', '0.384'])
    expect(at('vmpk', TRAVEL_MS.gamer).map((x) => x.split(' v')[1])).toEqual(['0.454', '0.406', '0.3065'])
  }) // prettier-ignore
})

describe('通しで残る記録 4 種（期待値 (3)。記録の無い端末・同じ日・同じ譜面版でこの順）', () => {
  const DAY = '2026-11-12'
  let n = 0
  const rec = (over: Partial<ResultRecord>): ResultRecord => ({
    id: `r${++n}`,
    chartId: 'c1',
    variantId: 'ableton/2/octave',
    profile: 'beginner',
    clock: 'novideo',
    mode: 'fixed',
    rate: 1,
    keyset: 'all',
    at: `${DAY}T12:00:0${n}.000Z`,
    acc: 0.9,
    rank: 'A',
    counts: { perfect: 1, great: 0, good: 0, near: 0, miss: 0 },
    selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 },
    syncUsed: { kind: 'audio' },
    offsetUsed: 0,
    skipped: 0,
    ...over,
  })
  const SYNC = { kind: 'youtube', videoId: 'M7lc1UVf-VE', offset: 3.0082, rate: 1 } as const
  const video = rec({ clock: 'video', acc: 0.99, syncUsed: SYNC })
  const audio = rec({ acc: 0.942 })
  const switched = rec({ clock: 'video', acc: 0.995, syncUsed: { ...SYNC, fallbackAt: 9001 } })
  const s7a = rec({ acc: 0.95 })
  const all = [video, audio, switched, s7a]

  it('対象プレイ・称号の対象は 偽／真／偽／真、称号 0／「初クリア」／0／0、streak 0／1／1／1', () => {
    expect(all.map(isTargetPlay)).toEqual([false, true, false, true])
    expect(all.map(countsForAwards)).toEqual([false, true, false, true])
    const got = all.map((r, i) => awardsFor(all.slice(0, i), r, { today: DAY, bundledIds: [], dayOf: (iso) => iso.slice(0, 10) }))
    expect(got.map((a) => a.titles)).toEqual([[], ['初クリア'], [], []])
    expect(got.map((a) => a.streak)).toEqual([0, 1, 1, 1])
  }) // prettier-ignore

  it('完走は切替の回だけ偽、自己ベストは video 99.0%（動画の回）・novideo 95.0%、完走印は動画の回だけの曲・切替の回だけの曲とも偽', () => {
    expect(all.map((r) => isFinished(r))).toEqual([true, true, false, true])
    const key = { chartId: 'c1', variantId: 'ableton/2/octave', profile: 'beginner' } as const
    expect([bestOf(all, { ...key, clock: 'video' })?.acc, bestOf(all, { ...key, clock: 'novideo' })?.acc]).toEqual([0.99, 0.95])
    expect([finishedSong([video], 'c1', 'beginner'), finishedSong([switched], 'c1', 'beginner'), finishedSong(all, 'c1', 'beginner')]).toEqual([false, false, true])
  }) // prettier-ignore
})

describe('計測の行と計測盤の要約（期待値 (4)。見本の 6 行）', () => {
  const AT = '2026-11-12T00:00:00.000Z'
  const META: PlayMeta = {
    chartId: 'sha256:0123456789abcdef',
    variantId: 'ableton/2/octave',
    profile: 'beginner',
    clock: 'novideo',
    mode: 'fixed',
  }
  const J = { ur: 100, hist: {}, acc: 0.95, nearRate: 0 }
  const switched = collectClock(initialCollect(), {
    events: [{ kind: 'novideo', t: 9000 }],
    phase: 'locked',
    dev: null,
  })
  const rows: TelemetryRow[] = [
    {
      kind: 'sync',
      at: AT,
      chartId: META.chartId,
      residualSd: 5,
      elapsedS: 12,
      attempts: 1,
      offset: 3,
      rate: 1,
    } satisfies SyncTelemetry,
    playRow(initialCollect(), { ...META, clock: 'video' }, J, null, AT),
    playRow(switched, { ...META, clock: 'video' }, J, null, AT),
    playRow(initialCollect(), META, J, null, AT),
    playRow(initialCollect(), META, J, null, AT),
    embedErrorRow(150, AT),
  ]
  it('countByKind は play 4・embedError 1・sync 1、他の 5 種は 0。名前「動画の埋め込みの失敗」・要約「エラー 150」・video fixed・切替 あり・offset 3.000 s・rate 1.0000', () => {
    expect(countByKind(rows)).toEqual({ play: 4, calib: 0, onboard: 0, quit: 0, device: 0, storageFail: 0, embedError: 1, sync: 1 })
    expect(KIND_NAMES.embedError).toBe('動画の埋め込みの失敗')
    expect(rowBrief(rows[5] as TelemetryRow)).toBe('エラー 150')
    expect(Object.keys(rows[5] as object).sort()).toEqual(['at', 'code', 'kind'])
    expect(rowBrief(rows[1] as TelemetryRow)).toContain(' video fixed・')
    expect(rowBrief(rows[2] as TelemetryRow)).toContain('・切替 あり・')
    expect(rowBrief(rows[0] as TelemetryRow)).toContain('・offset 3.000 s・rate 1.0000・')
  }) // prettier-ignore
})
