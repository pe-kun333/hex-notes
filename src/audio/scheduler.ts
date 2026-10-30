// 発音の予約（M0-08、手順 10）。出どころ: design.md §4.1「音源層（ガイド音＋accompaniment を 25 ms 周期・100 ms 先読みで
// 予約）」・§2.6（AudioContext.currentTime は発音予約だけ）、m5 `playItems／pump` L457–464（手直し: 40 ms・250 ms → 25 ms・
// 100 ms、基準時刻は AudioContext の currentTime からの相対でなく時計の写像と audio-bridge）、kickoff 手順 10（予約の遅れの
// 最大値を計測に残す。主スレッドが 75 ms 止まると音が抜けるのを見つける）、decisions #32・#37・#47（仮）。
// 純関数（状態は値）。曲の ms → 時計の写像 perfAt → audio-bridge の contextOfPerf で context の秒にする。
// 呼ぶ側は PUMP_MS ごとに pumpSchedule を呼び、時計の再アンカー（resync）と一時停止では先の音を止めて seekSchedule で
// 今の t から数え直す（止めるのは context.ts の cancelFrom）。

import { buildMsTable } from '../chart/mstable.ts'
import { contextOfPerf, type AudioBridge } from '../clock/audio-bridge.ts'
import { IDENTITY_AXIS, perfAt, toChartMap, type SyncAxis } from '../clock/map.ts'
import type { ClockMap } from '../clock/types.ts'
import { midiOf } from '../layout/presets.ts'
import { DEFAULT_VEL, type Chart, type Variant } from '../shared/types.ts'
import { beatClicks } from './metronome.ts'

/** 予約の周期と先読み（ms、§4.1） */
export const PUMP_MS = 25
export const LOOKAHEAD_MS = 100
/** 予約の遅れがこれを超えたら帯で知らせる（M-7 の 20 ms。仮） */
export const LATE_BAND_MS = 20
/** これより遅れた音は鳴らさない（長い停止の後にまとめて鳴るのを避ける。仮） */
export const LATE_DROP_MS = 100

export type SoundPart = 'melody' | 'accomp' | 'click'

export interface SoundItem {
  /** soundItems が振る通し番号（並べた順） */
  readonly id: number
  readonly part: SoundPart
  /** 譜面の ms */
  readonly tMs: number
  /** 譜面の ms の長さ（click は 0） */
  readonly durMs: number
  /** 鳴らす音高（click は null） */
  readonly midi: number | null
  /** 0–127 */
  readonly vel: number
  /** click の強拍 */
  readonly accent: boolean
}

export interface SoundOptions {
  /** 旋律（ガイド音。譜面版があれば鍵の音高＝畳んだ後、無ければ原曲音高） */
  readonly melody: boolean
  /** 伴奏（accompaniment。原曲音高） */
  readonly accomp: boolean
  /** メトロノーム（整数拍、小節の頭が強拍） */
  readonly click: boolean
}

const PART_ORDER: Readonly<Record<SoundPart, number>> = { click: 0, accomp: 1, melody: 2 }

/** 譜面から鳴らす音の列（tMs 昇順、同じ時刻は click → accomp → melody の順） */
export function soundItems(
  chart: Pick<Chart, 'notes' | 'pulse' | 'accompaniment'>,
  variant: Pick<Variant, 'layout' | 'keys'> | null,
  opts: SoundOptions,
): SoundItem[] {
  const ms = buildMsTable(chart.pulse)
  const raw: Omit<SoundItem, 'id'>[] = []
  const note = (part: SoundPart, midi: number, beat: number, dur: number, vel?: number): void => {
    const tMs = ms.beatToMs(beat)
    raw.push({
      part,
      tMs,
      durMs: ms.beatToMs(beat + dur) - tMs,
      midi,
      vel: vel ?? DEFAULT_VEL,
      accent: false,
    })
  }
  let endMs = 0
  chart.notes.forEach((n, i) => {
    endMs = Math.max(endMs, ms.beatToMs(n.beat + n.dur))
    if (!opts.melody) return
    if (variant === null) return note('melody', n.midi, n.beat, n.dur, n.vel)
    const key = variant.keys[i]
    const midi = key === null || key === undefined ? null : midiOf(variant.layout, key)
    if (midi !== null) note('melody', midi, n.beat, n.dur, n.vel)
  })
  for (const n of chart.accompaniment ?? []) {
    endMs = Math.max(endMs, ms.beatToMs(n.beat + n.dur))
    if (opts.accomp) note('accomp', n.midi, n.beat, n.dur, n.vel)
  }
  if (opts.click)
    for (const c of beatClicks(chart.pulse, 0, endMs))
      raw.push({ part: 'click', tMs: c.tMs, durMs: 0, midi: null, vel: 127, accent: c.accent })
  return raw
    .map((r, k) => ({ r, k }))
    .sort((x, y) => x.r.tMs - y.r.tMs || PART_ORDER[x.r.part] - PART_ORDER[y.r.part] || x.k - y.k)
    .map(({ r }, id) => ({ ...r, id }))
}

export interface SchedulerState {
  /** 次に見る音の位置 */
  readonly next: number
  /** 前の pump の now（時計が止まっている間は null。止まっている間の間隔は数えない） */
  readonly lastPumpAt: number | null
  /** 予約の遅れの最大 ms（その音の実時刻を過ぎてから予約した分。鳴らさなかった音も入れる） */
  readonly lateMaxMs: number
  /** pump の間隔の最大 ms（時計が走っている間だけ。主スレッドの停止の目安） */
  readonly gapMaxMs: number
  readonly scheduled: number
  /** LATE_DROP_MS より遅れて鳴らさなかった音 */
  readonly dropped: number
}

export function initialScheduler(): SchedulerState {
  return { next: 0, lastPumpAt: null, lateMaxMs: 0, gapMaxMs: 0, scheduled: 0, dropped: 0 }
}

export interface ScheduledSound {
  readonly item: SoundItem
  /** 予約する context の秒（遅れた音は今の時刻） */
  readonly ctxSec: number
  /** 鳴らす長さ（実時間の s。再生レートで伸び縮みする） */
  readonly holdS: number
  /** 予約の遅れ ms（0 ならちょうど間に合った） */
  readonly lateMs: number
}

export interface SchedulerClock {
  /** 時計の出力の写像（動画の軸のまま） */
  readonly map: ClockMap
  readonly now: number
  /** 時計の軸 → 譜面の軸（既定は恒等） */
  readonly axis?: SyncAxis
}

/**
 * 1 回の pump。次の音から、実時刻が now ＋ 先読みより前の音を予約する。実時刻を過ぎた音は今の時刻で鳴らし、
 * LATE_DROP_MS より遅れた音は鳴らさない。時計が止まっている（a ≤ 0）間は何も予約しない。
 */
export function pumpSchedule(
  s: SchedulerState,
  items: readonly SoundItem[],
  clock: SchedulerClock,
  bridge: AudioBridge,
  lookaheadMs = LOOKAHEAD_MS,
): { state: SchedulerState; play: ScheduledSound[] } {
  const m = toChartMap(clock.map, clock.axis ?? IDENTITY_AXIS)
  const now = clock.now
  if (!(m.a > 0)) return { state: { ...s, lastPumpAt: null }, play: [] }
  const gap = s.lastPumpAt === null ? 0 : now - s.lastPumpAt
  let { next, lateMaxMs, scheduled, dropped } = s
  const play: ScheduledSound[] = []
  for (; next < items.length; next++) {
    const it = items[next]
    if (it === undefined) break
    const perf = perfAt(m, it.tMs)
    if (perf >= now + lookaheadMs) break
    const lateMs = Math.max(0, now - perf)
    lateMaxMs = Math.max(lateMaxMs, lateMs)
    if (lateMs > LATE_DROP_MS) {
      dropped++
      continue
    }
    scheduled++
    play.push({
      item: it,
      ctxSec: contextOfPerf(bridge, Math.max(perf, now)),
      holdS: it.durMs / m.a / 1000,
      lateMs,
    })
  }
  return {
    state: {
      next,
      lastPumpAt: now,
      lateMaxMs,
      gapMaxMs: Math.max(s.gapMaxMs, gap),
      scheduled,
      dropped,
    },
    play,
  }
}

/** 譜面の ms tChartMs から数え直す（その時刻以後の最初の音へ）。再アンカー・一時停止からの再開で呼ぶ */
export function seekSchedule(
  s: SchedulerState,
  items: readonly SoundItem[],
  tChartMs: number,
): SchedulerState {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((items[mid]?.tMs ?? Infinity) < tChartMs) lo = mid + 1
    else hi = mid
  }
  return { ...s, next: lo, lastPumpAt: null }
}

/** 遅れの帯を出すか（予約の遅れの最大が 20 ms を超えた） */
export function lateBand(s: SchedulerState): boolean {
  return s.lateMaxMs > LATE_BAND_MS
}
