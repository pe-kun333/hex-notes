// localStorage の記録（M0-09、手順 11）。出どころ: design.md §4.3（hexnote.settings v:1・hexnote.calibration 音源種別ごと・
// hexnote.device {limit, at, layoutMapOk, tsResolution}・hexnote.fade）・§1.3 S6（設定の中身）、decisions #25
// （tsResolution は推定できない間は書かない）・#40（校正は ±120・1 ms 丸め、音源種別ごと）・#41（足場外しの α）・
// #42（段ずれ parseStagger）・#45（hexnote.settings.geometry）・#52（仮）。
// モックの読み方（m0 L444–448 の項目ごとの範囲検査、m1' L269 の上限、m3 L665 の ±120）を、項目ごとに検査して悪い項目
// だけ既定値に戻す形に揃えた。上限の丸めは m1' の 2..6 → 2..4。壊れた JSON・版違いは既定値（storageFail にはしない。
// 置き場の例外ではないので）。読み書きは fallback.ts の KvStore を通す。

import { clampOffset } from '../judge/calibration-offset.ts'
import { initialFade, type FadeState, type LabelSides } from '../judge/self-rate.ts'
import { DEFAULT_GEOMETRY, parseGeometry, type GeometryMode } from '../layout/fallback.ts'
import type { LegendKind } from '../layout/legend.ts'
import { DEFAULT_STAGGER, parseStagger, type Stagger } from '../layout/stagger.ts'
import {
  CHORD_LIMITS,
  FOLD_IDS,
  LAYOUT_ALIASES,
  LAYOUT_IDS,
  type ChordLimit,
  type DeviceInfo,
  type FoldId,
  type LayoutId,
  type Profile,
  type SyncKind,
} from '../shared/types.ts'
import type { KvStore } from './fallback.ts'

export const LOCAL_KEYS = {
  settings: 'hexnote.settings',
  calibration: 'hexnote.calibration',
  device: 'hexnote.device',
  fade: 'hexnote.fade',
} as const

// ---------- 共通 ----------

type Rec = Record<string, unknown>
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const oneOf = <T extends string>(list: readonly T[], x: unknown): T | null =>
  typeof x === 'string' && (list as readonly string[]).includes(x) ? (x as T) : null
const isIsoTime = (x: unknown): x is string =>
  typeof x === 'string' && Number.isFinite(Date.parse(x))

/** 鍵の JSON を読む。無い・壊れていれば undefined */
export function readJson(kv: KvStore, key: string): unknown {
  const s = kv.get(key)
  if (s === null) return undefined
  try {
    return JSON.parse(s) as unknown
  } catch {
    return undefined
  }
}

/** JSON で書く。本物に書けたら true（失敗ならメモリに置いて false。fallback.ts） */
export function writeJson(kv: KvStore, key: string, value: unknown): boolean {
  return kv.set(key, JSON.stringify(value))
}

// ---------- hexnote.settings（v:1） ----------

export type LegendChoice = 'auto' | LegendKind
export const LEGEND_CHOICES: readonly LegendChoice[] = ['auto', 'jis', 'us']
export type LabelMode = LabelSides['kb']
export const LABEL_MODES: readonly LabelMode[] = ['key', 'note', 'both', 'none']
export const PROFILES: readonly Profile[] = ['beginner', 'gamer']

/** 利用者が名前を付けて残した段ずれ（m2 の savedStags） */
export interface NamedStagger {
  readonly name: string
  readonly v: Stagger
}

/**
 * 設定 v:1。項目は §1.3 S6 のうち M0 の層が使う物だけ（音・演出・低負荷などは M1-07 で足す。足した項目は
 * 無ければ既定値なので版は上げない）。
 */
export interface Settings {
  readonly v: 1
  readonly profile: Profile
  readonly layout: LayoutId
  readonly fold: FoldId
  /** 刻印。auto は getLayoutMap、無ければ言語から JIS／US（src/layout/legend.ts） */
  readonly legend: LegendChoice
  readonly geometry: GeometryMode
  /** 自己申告の段ずれ（decisions #42） */
  readonly stagger: Stagger
  readonly staggers: readonly NamedStagger[]
  /** ラベル 9 マス（鍵盤側・ノート側） */
  readonly labels: LabelSides
}

/** 既定値。profile は m6 L548、layout・fold は m5 L371（garage → ableton）、labels は m4 L298 */
export function defaultSettings(): Settings {
  return {
    v: 1,
    profile: 'beginner',
    layout: 'ableton',
    fold: 'octave',
    legend: 'auto',
    geometry: DEFAULT_GEOMETRY,
    stagger: DEFAULT_STAGGER,
    staggers: [],
    labels: { kb: 'key', note: 'key' },
  }
}

/** 配列の id か別名（garage・fl）を正規名に。他は null */
export function parseLayout(x: unknown): LayoutId | null {
  if (typeof x !== 'string') return null
  return oneOf(LAYOUT_IDS, x) ?? LAYOUT_ALIASES[x] ?? null
}

export function parseNamedStaggers(x: unknown): NamedStagger[] {
  if (!Array.isArray(x)) return []
  const out: NamedStagger[] = []
  for (const s of x) {
    if (!isRec(s) || typeof s['name'] !== 'string' || s['name'].trim() === '') continue
    const v = parseStagger(s['v'])
    if (v !== null) out.push({ name: s['name'], v })
  }
  return out
}

export function parseLabels(x: unknown, base: LabelSides): LabelSides {
  if (!isRec(x)) return base
  return {
    kb: oneOf(LABEL_MODES, x['kb']) ?? base.kb,
    note: oneOf(LABEL_MODES, x['note']) ?? base.note,
  }
}

/** 外から来た値を設定に。v が 1 でなければ全て既定値、項目ごとに悪い物だけ既定値。知らない項目は捨てる */
export function parseSettings(raw: unknown): Settings {
  const d = defaultSettings()
  if (!isRec(raw) || raw['v'] !== 1) return d
  return {
    v: 1,
    profile: oneOf(PROFILES, raw['profile']) ?? d.profile,
    layout: parseLayout(raw['layout']) ?? d.layout,
    fold: oneOf(FOLD_IDS, raw['fold']) ?? d.fold,
    legend: oneOf(LEGEND_CHOICES, raw['legend']) ?? d.legend,
    geometry: parseGeometry(raw['geometry']) ?? d.geometry,
    stagger: parseStagger(raw['stagger']) ?? d.stagger,
    staggers: raw['staggers'] === undefined ? d.staggers : parseNamedStaggers(raw['staggers']),
    labels: parseLabels(raw['labels'], d.labels),
  }
}

export function loadSettings(kv: KvStore): Settings {
  return parseSettings(readJson(kv, LOCAL_KEYS.settings))
}

export function saveSettings(kv: KvStore, s: Settings): boolean {
  return writeJson(kv, LOCAL_KEYS.settings, parseSettings(s))
}

// ---------- hexnote.calibration（音源種別ごと） ----------

export const CALIB_KINDS: readonly SyncKind[] = ['audio', 'youtube']
/** どこで決めた値か（tap ＝ 段 1、propose ＝ 段 2 の提案を受けた、manual ＝ 手で、migrated ＝ モックの鍵から） */
export type CalibVia = 'tap' | 'propose' | 'manual' | 'migrated'
export const CALIB_VIAS: readonly CalibVia[] = ['tap', 'propose', 'manual', 'migrated']

export interface CalibEntry {
  /** ms。整数、±120（decisions #40） */
  readonly offsetMs: number
  readonly at: string
  readonly via: CalibVia
}

/** 音源種別（SyncUsed.kind と同じ: audio ＝ 自前の音、youtube ＝ 動画の音）ごとの校正。無い種別は未校正 */
export interface Calibration {
  readonly v: 1
  readonly audio?: CalibEntry
  readonly youtube?: CalibEntry
}

export function parseCalibEntry(x: unknown): CalibEntry | null {
  if (!isRec(x)) return null
  const o = x['offsetMs']
  if (typeof o !== 'number' || !Number.isFinite(o) || !isIsoTime(x['at'])) return null
  return { offsetMs: clampOffset(o), at: x['at'], via: oneOf(CALIB_VIAS, x['via']) ?? 'manual' }
}

export function parseCalibration(raw: unknown): Calibration {
  if (!isRec(raw) || raw['v'] !== 1) return { v: 1 }
  const out: { v: 1; audio?: CalibEntry; youtube?: CalibEntry } = { v: 1 }
  for (const k of CALIB_KINDS) {
    const e = parseCalibEntry(raw[k])
    if (e !== null) out[k] = e
  }
  return out
}

export function loadCalibration(kv: KvStore): Calibration {
  return parseCalibration(readJson(kv, LOCAL_KEYS.calibration))
}

/** その音源種別のオフセット（未校正は 0） */
export function offsetFor(c: Calibration, kind: SyncKind): number {
  return c[kind]?.offsetMs ?? 0
}

/** 1 つの音源種別だけ書き換える（他の種別は残す） */
export function saveCalibration(kv: KvStore, kind: SyncKind, entry: CalibEntry): boolean {
  const cur = loadCalibration(kv)
  const e = parseCalibEntry(entry)
  if (e === null) return false
  return writeJson(kv, LOCAL_KEYS.calibration, { ...cur, [kind]: e })
}

// ---------- hexnote.device ----------

/**
 * 同時押し上限を外から読む（m1' L269 の `Math.max(2, Math.min(6, +v))` を 2..4 に直す。決定 #7）。数か数の文字列を
 * 四捨五入して 2..4 に収める（'7' → 4）。空・数でない物は null。
 */
export function parseLimit(x: unknown): ChordLimit | null {
  const n =
    typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : Number.NaN
  if (!Number.isFinite(n)) return null
  return Math.max(
    CHORD_LIMITS[0] ?? 2,
    Math.min(CHORD_LIMITS.at(-1) ?? 4, Math.round(n)),
  ) as ChordLimit
}

/** 端末プロファイル。limit と at が読めなければ null（端末の診断をやり直す） */
export function parseDevice(raw: unknown): DeviceInfo | null {
  if (!isRec(raw)) return null
  const limit = parseLimit(raw['limit'])
  if (limit === null || !isIsoTime(raw['at'])) return null
  const q = raw['tsResolution']
  return {
    limit,
    at: raw['at'],
    layoutMapOk: raw['layoutMapOk'] === true,
    ...(typeof q === 'number' && Number.isFinite(q) && q > 0 ? { tsResolution: q } : {}),
  }
}

export function loadDevice(kv: KvStore): DeviceInfo | null {
  return parseDevice(readJson(kv, LOCAL_KEYS.device))
}

/** 書く。tsResolution は推定できた（正の数）ときだけ（decisions #25: 0 と null は書かない） */
export function saveDevice(kv: KvStore, d: DeviceInfo): boolean {
  const p = parseDevice(d)
  if (p === null) return false
  return writeJson(kv, LOCAL_KEYS.device, p)
}

// ---------- hexnote.fade ----------

const round3 = (x: number): number => Math.round(x * 1000) / 1000
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))

/**
 * 足場外しの状態（decisions #41）。α の鍵は MIDI 0..127 の整数、値は 0..1・小数 3 桁。悪い音は捨てる。保存の形は
 * FadeState に v:1 を足した物（v が有って 1 でなければ既定値。FadeState そのものも受ける）
 */
export function parseFade(raw: unknown): FadeState {
  const d = initialFade()
  if (!isRec(raw) || (raw['v'] !== undefined && raw['v'] !== 1)) return d
  const alpha: Record<number, number> = {}
  const a = raw['alpha']
  if (isRec(a))
    for (const [k, v] of Object.entries(a)) {
      const m = Number(k)
      if (!/^\d{1,3}$/.test(k) || m > 127) continue
      if (typeof v === 'number' && Number.isFinite(v)) alpha[m] = round3(clamp01(v))
    }
  const manual = raw['manual']
  return {
    mode: oneOf(['linked', 'manual'] as const, raw['mode']) ?? d.mode,
    manual:
      typeof manual === 'number' && Number.isFinite(manual) ? round3(clamp01(manual)) : d.manual,
    alpha,
  }
}

export function loadFade(kv: KvStore): FadeState {
  return parseFade(readJson(kv, LOCAL_KEYS.fade))
}

export function saveFade(kv: KvStore, f: FadeState): boolean {
  return writeJson(kv, LOCAL_KEYS.fade, { v: 1, ...parseFade(f) })
}
