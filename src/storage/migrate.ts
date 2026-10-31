// モックの鍵名からの移行（M0-09、手順 11）。出どころ: kickoff 手順 11「鍵名 hexnote-m0／hexnote.limit／hexnote-m2-staggers／
// hexnote-m3-offset／hexnote-m4-practice／hexnote-m5 → hexnote.settings（v:1）、hexnote.calibration、hexnote.device、
// hexnote.fade」、モックの保存の形（m1' L269・L470、m2 L204–207、m3 L665–666、m4 L320–322、m5 L371–372、m6 L558–559）、
// decisions #52（仮）。
// 運ぶ物: hexnote.limit → device.limit（2..4 に丸め直す）、m2 の段ずれの名前付きの一覧 → settings.staggers、m3 の
// オフセット → calibration.audio、m4 の α・成績連動／手動・ラベル 9 マス → fade と settings.labels、m5 の配列・折り畳み →
// settings.layout・fold、m6 のプロファイル → settings.profile。
// 運ばない物: m0（画面の寸法・行数・セル径などの見本の値。設計書で固定した）、m5 の limit（譜面版の選択で端末の上限ではない）・
// videoId（曲ごと）、m6 の first・source・theme。新しい鍵が既にあればその鍵へは運ばない（新しい方が正）。
// 旧鍵は、運んだ先の新しい鍵が全て本物に有る（いま書けたか、前から有った）ときだけ消す。書けずにメモリに置いた
// （storageFail）ときは残し、次に読み直したときにもう一度運ぶ。

import type { FadeState, LabelSides } from '../judge/self-rate.ts'
import { FOLD_IDS, type DeviceInfo, type FoldId, type Profile } from '../shared/types.ts'
import type { KvStore } from './fallback.ts'
import {
  LOCAL_KEYS,
  PROFILES,
  defaultSettings,
  parseCalibration,
  parseFade,
  parseLabels,
  parseLayout,
  parseLimit,
  parseNamedStaggers,
  parseSettings,
  saveCalibration,
  saveDevice,
  saveFade,
  saveSettings,
  type Calibration,
  type NamedStagger,
  type Settings,
} from './local.ts'

export const LEGACY_KEYS = {
  m0: 'hexnote-m0',
  limit: 'hexnote.limit',
  m2: 'hexnote-m2-staggers',
  m3: 'hexnote-m3-offset',
  m4: 'hexnote-m4-practice',
  m5: 'hexnote-m5',
  m6: 'hexnote.m6',
} as const

export type MigrationTarget = keyof typeof LOCAL_KEYS

export interface MigrationPlan {
  /** 運ぶ物が無い新しい鍵は null */
  readonly settings: Settings | null
  readonly calibration: Calibration | null
  readonly device: DeviceInfo | null
  readonly fade: FadeState | null
  /** 有った旧鍵と、運んだ先（何も読めなかった旧鍵は空） */
  readonly sources: readonly { readonly key: string; readonly to: readonly MigrationTarget[] }[]
}

type Rec = Record<string, unknown>
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
function parseJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown
  } catch {
    return undefined
  }
}

/** 旧鍵を読んで運ぶ物を決める（純関数。read は鍵 → 値、at は移行した時刻 ISO） */
export function planMigration(read: (key: string) => string | null, at: string): MigrationPlan {
  const sources: { key: string; to: MigrationTarget[] }[] = []
  const seen = (key: string): string | null => {
    const s = read(key)
    if (s !== null) sources.push({ key, to: [] })
    return s
  }
  const carried = (key: string, to: MigrationTarget): void => {
    const s = sources.find((x) => x.key === key)
    if (s !== undefined && !s.to.includes(to)) s.to.push(to)
  }

  // 端末の上限（m1' L269: 空でなければ数に。L470 は 2..4 を書く）
  let device: DeviceInfo | null = null
  const limitRaw = seen(LEGACY_KEYS.limit)
  const limit = limitRaw === null ? null : parseLimit(limitRaw)
  if (limit !== null) {
    device = { limit, at, layoutMapOk: false }
    carried(LEGACY_KEYS.limit, 'device')
  }

  // 校正（m3 L665: null でなく isFinite(+saved)。±120 に収める。種別は自前の音 audio）
  let calibration: Calibration | null = null
  const offRaw = seen(LEGACY_KEYS.m3)
  if (offRaw !== null && Number.isFinite(+offRaw)) {
    calibration = parseCalibration({ v: 1, audio: { offsetMs: +offRaw, at, via: 'migrated' } })
    carried(LEGACY_KEYS.m3, 'calibration')
  }

  // 設定（m5 の配列・折り畳み、m4 のラベル、m2 の段ずれの一覧、m6 のプロファイル）
  const patch: {
    profile?: Profile
    layout?: Settings['layout']
    fold?: Settings['fold']
    staggers?: NamedStagger[]
    labels?: LabelSides
  } = {}
  const d = defaultSettings()
  const m5Raw = seen(LEGACY_KEYS.m5)
  const m5 = m5Raw === null ? undefined : parseJson(m5Raw)
  if (isRec(m5)) {
    const layout = parseLayout(m5['layout'])
    if (layout !== null) patch.layout = layout
    if (FOLD_IDS.includes(m5['fold'] as FoldId)) patch.fold = m5['fold'] as FoldId
    if (patch.layout !== undefined || patch.fold !== undefined) carried(LEGACY_KEYS.m5, 'settings')
  }

  let fade: FadeState | null = null
  const m4Raw = seen(LEGACY_KEYS.m4)
  const m4 = m4Raw === null ? undefined : parseJson(m4Raw)
  if (isRec(m4)) {
    // m4 L321: { fade: {midi: α}, kb, note, fadeMode }。m4 に 'both' は無いが受ける
    const labels = parseLabels({ kb: m4['kb'], note: m4['note'] }, d.labels)
    if (labels.kb === m4['kb'] || labels.note === m4['note']) {
      patch.labels = labels
      carried(LEGACY_KEYS.m4, 'settings')
    }
    if (isRec(m4['fade']) || m4['fadeMode'] === 'linked' || m4['fadeMode'] === 'manual') {
      fade = parseFade({ mode: m4['fadeMode'], alpha: m4['fade'] })
      carried(LEGACY_KEYS.m4, 'fade')
    }
  }

  const m2Raw = seen(LEGACY_KEYS.m2)
  const m2 = m2Raw === null ? undefined : parseJson(m2Raw)
  const staggers = parseNamedStaggers(m2)
  if (staggers.length > 0) {
    patch.staggers = staggers
    carried(LEGACY_KEYS.m2, 'settings')
  }

  const m6Raw = seen(LEGACY_KEYS.m6)
  const m6 = m6Raw === null ? undefined : parseJson(m6Raw)
  if (isRec(m6) && PROFILES.includes(m6['profile'] as Profile)) {
    patch.profile = m6['profile'] as Profile
    carried(LEGACY_KEYS.m6, 'settings')
  }

  const settings = Object.keys(patch).length > 0 ? parseSettings({ ...d, ...patch }) : null
  return { settings, calibration, device, fade, sources }
}

export interface MigrationReport {
  /** 本物に書いた新しい鍵 */
  readonly wrote: readonly MigrationTarget[]
  /** 前から有ったので運ばなかった新しい鍵 */
  readonly skipped: readonly MigrationTarget[]
  /** 書けずにメモリに置いた新しい鍵（storageFail は KvStore が出す） */
  readonly inMemory: readonly MigrationTarget[]
  readonly removed: readonly string[]
  readonly kept: readonly string[]
}

/** 起動時に 1 回。旧鍵から新しい鍵へ運び、運び終えた旧鍵を消す */
export function migrateLegacy(kv: KvStore, at: string): MigrationReport {
  const plan = planMigration((k) => kv.get(k), at)
  const wrote: MigrationTarget[] = []
  const skipped: MigrationTarget[] = []
  const inMemory: MigrationTarget[] = []
  const write = (t: MigrationTarget, f: () => boolean): void => {
    if (kv.get(LOCAL_KEYS[t]) !== null) skipped.push(t)
    else (f() ? wrote : inMemory).push(t)
  }
  const { settings, calibration, device, fade } = plan
  if (settings !== null) write('settings', () => saveSettings(kv, settings))
  if (device !== null) write('device', () => saveDevice(kv, device))
  if (fade !== null) write('fade', () => saveFade(kv, fade))
  if (calibration?.audio !== undefined) {
    const audio = calibration.audio
    write('calibration', () => saveCalibration(kv, 'audio', audio))
  }

  const removed: string[] = []
  const kept: string[] = []
  for (const s of plan.sources) {
    if (s.to.some((t) => inMemory.includes(t))) {
      kept.push(s.key)
      continue
    }
    kv.remove(s.key)
    removed.push(s.key)
  }
  return { wrote, skipped, inMemory, removed, kept }
}
