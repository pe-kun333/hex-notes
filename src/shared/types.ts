// 共有の型（M0-02 前半）。出どころ: docs/design.md §3.2（譜面形式 hexnote-chart/1）、§4.3（保存）、§4.6（計測）、
// docs/decisions.md #1・#7・#12・#18。実行時の検査は src/chart/validate.ts、正規化は同 normalize。
// ここは型と定数だけ。DOM・Node のどちらにも触れない（tools/ からも import する）。

// ---------- 時刻 ----------

/**
 * 今の時刻（performance.timeOrigin 基準の ms）を返す関数。層は performance.now を直に呼ばず、これを受ける
 * （直呼びは src/clock/clock-source.ts と src/app/ だけ。m0-kickoff §2「時刻源は注入」、decisions #32）
 */
export type NowFn = () => number

// ---------- 譜面 hexnote-chart/1 ----------

export const CHART_FORMAT = 'hexnote-chart/1' as const
export type ChartFormat = typeof CHART_FORMAT

/** 既定の拍の分解能（1 拍を何等分するか）。beat はこの単位に丸める */
export const DEFAULT_RESOLUTION = 240
/** resolution の上限（§3.2、仮）。検査・変換器・譜面版の生成が共有する */
export const MAX_RESOLUTION = 9600

/** 配列プリセットの id（decisions #1・#4）。別名は LAYOUT_ALIASES */
export type LayoutId = 'ableton' | 'vmpk' | 'genshin' | 'wicki'
export const LAYOUT_IDS: readonly LayoutId[] = ['ableton', 'vmpk', 'genshin', 'wicki']
/** 旧名 → 正規名（モック m1'／m2／m5 の garage・fl）。プロトタイプ無し（'constructor' などで関数が返らないように） */
export const LAYOUT_ALIASES: Readonly<Record<string, LayoutId>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, LayoutId>, {
    garage: 'ableton',
    fl: 'vmpk',
  } satisfies Record<string, LayoutId>),
)

/** vel の既定（§3.2）。バリデータと変換器が共有する */
export const DEFAULT_VEL = 80

/** 折り畳み（音域外の音の扱い） */
export type FoldId = 'octave' | 'cut' | 'nearest'
export const FOLD_IDS: readonly FoldId[] = ['octave', 'cut', 'nearest']

/** 同時押し上限（decisions #7: 既定 2、診断通過で 3〜4） */
export type ChordLimit = 2 | 3 | 4
export const CHORD_LIMITS: readonly ChordLimit[] = [2, 3, 4]
/** 譜面版の上限の既定（decisions #7。端末の上限が 3〜4 でも選ぶのは 2、#15 の改訂まで） */
export const DEFAULT_CHORD_LIMIT: ChordLimit = 2

/** KeyboardEvent.code。使うのは src/layout/presets.ts の KEY_CODES（40 個） */
export type KeyCode = string

/** 音符。beat は拍（1/resolution に丸め）、dur は拍。vel は 0–127（既定 80）。track は accompaniment だけ */
export interface Note {
  midi: number
  beat: number
  dur: number
  vel?: number
  track?: string
}

export interface TempoPoint {
  /** この拍から bpm が変わる。先頭は beat 0 */
  beat: number
  bpm: number
}

export interface TimeSigPoint {
  beat: number
  num: number
  den: number
}

/** 拍パルス。時刻の真実はここだけ。読み込み時に ms 表（src/chart/mstable.ts）へ */
export interface Pulse {
  resolution: number
  tempo: TempoPoint[]
  timeSig?: TimeSigPoint[]
}

export type SyncKind = 'youtube' | 'audio'

/** 同期の出どころ。offset は拍 0 の動画時刻（秒）、rate は 動画 BPM ÷ 譜面 BPM。audio は「動画を使わない」の印 */
export interface SyncSource {
  kind: SyncKind
  videoId?: string
  offset: number
  rate: number
  begin?: number
  label?: string
  measured?: boolean
}

export interface Sync {
  /** 空なら動画なし専用。/1 は sources[0] だけ読む */
  sources: SyncSource[]
}

export interface Metrics {
  density?: number
  leap?: number
  leapMax?: number
  chord?: number
  rowCross?: number
  level?: number
}

/** 譜面版（配列 × 上限 × 折り畳み）。id は `${layout}/${limit}/${fold}`（decisions #12） */
export interface Variant {
  id: string
  layout: LayoutId
  limit: ChordLimit
  fold: FoldId
  /** notes と同じ長さ。落とした音は null */
  keys: (KeyCode | null)[]
  stats?: Record<string, number>
  metrics?: Metrics
}

export type Rights = 'pd' | 'own' | 'cc0' | 'cc-by' | 'private'
export const RIGHTS: readonly Rights[] = ['pd', 'own', 'cc0', 'cc-by', 'private']

export interface License {
  id: string
  holder: string
  url: string
}

/** 出どころと権利（decisions #18）。cc-by は license 必須 */
export interface Source {
  kind: 'bundled' | 'midi'
  rights: Rights
  license?: License
  title?: string
  composer?: string
  arranger?: string
  origin?: string
}

export interface Chart {
  format: ChartFormat
  /** "sha256:" + canonical JSON（format・notes・pulse.resolution・pulse.tempo）の SHA-256。src/chart/hash.ts */
  id: string
  name: string
  /** beat 昇順、同拍は midi 昇順。添字が番号で variants[].keys が参照する */
  notes: Note[]
  pulse: Pulse
  sync: Sync
  source: Source
  /** 写し（真実は pulse） */
  bpm?: number
  beats?: number
  /** 弾かない伴奏。無ければ旋律とメトロノームだけ */
  accompaniment?: Note[]
  /** 無ければ生成 */
  variants?: Variant[]
  metrics?: Metrics
  created?: string
  generator?: string
  /** /1 では無視する拡張（hand・finger・lyric・custom・zones など） */
  ext?: Record<string, unknown>
}

// ---------- ms 表 ----------

export interface MsSegment {
  beat: number
  bpm: number
  /** この区間の始まりの時刻（ms、拍 0 を 0 とする） */
  ms: number
}

// ---------- 結果（§4.3 results） ----------

export type Profile = 'beginner' | 'gamer'
export type ClockKind = 'video' | 'novideo'
export type PlayMode = 'fixed' | 'note' | 'phrase'
export type Rank = 'SS' | 'S' | 'A' | 'B' | 'C'
export type Judgment = 'perfect' | 'great' | 'good' | 'near' | 'miss'

export interface JudgeCounts {
  perfect: number
  great: number
  good: number
  near: number
  miss: number
}

/** 自力率の 4 区分（decisions #6） */
export interface SelfRate {
  solo: number
  hinted: number
  near: number
  miss: number
}

/** その回に使った音源（§4.4 の対象プレイ判定: kind audio かつ fallbackAt 無し） */
export interface SyncUsed {
  kind: SyncKind
  videoId?: string
  /** 途中で動画なしへ切り替わった時刻（曲の ms）。無ければ切替なし */
  fallbackAt?: number
}

export interface ResultRecord {
  id: string
  chartId: string
  variantId: string
  profile: Profile
  clock: ClockKind
  mode: PlayMode
  /** テンポ倍率。自己ベストは 1.0 の回だけ */
  rate: number
  /** 鍵数制限。'all' か制限の id */
  keyset: 'all' | string
  /** ISO 8601 */
  at: string
  /** 精度 0–1 */
  acc: number
  rank: Rank
  counts: JudgeCounts
  selfRate: SelfRate
  syncUsed: SyncUsed
  /** 適用した校正（ms） */
  offsetUsed: number
}

// ---------- 端末・設定の保存（§4.3 localStorage） ----------

export interface DeviceInfo {
  limit: ChordLimit
  at: string
  layoutMapOk: boolean
  /** Event.timeStamp の刻み（ms）。実際の keydown・keyup から推定（src/input/resolution.ts、decisions #25）。推定できない間は無い */
  tsResolution?: number
}

// ---------- 計測（§4.6 telemetry） ----------

export interface TelemetryBase {
  /** ISO 8601 */
  at: string
}

export interface PlayTelemetry extends TelemetryBase {
  kind: 'play'
  chartId: string
  variantId: string
  profile: Profile
  clock: ClockKind
  mode: PlayMode
  /** Unstable Rate（判定ずれの SD ×10）。正しい鍵で当てた音が 2 つ未満なら null（decisions #54） */
  ur: number | null
  /** 早遅ヒストグラム（ms の階級 → 件数） */
  hist: Record<string, number>
  acc: number
  nearRate: number
  resyncCount: number
  fallback: boolean
  /** 押下の now − timeStamp の中央値（ms）。標本が無ければ null（decisions #25） */
  inputLatencyMedian: number | null
  /** 演奏の押下の数と、そのうち入力遅延の標本にならなかった（timeStamp が使えない・古い）数（decisions #54） */
  pressCount: number
  pressNoLag: number
  /**
   * rAF のフレーム間隔の標本 SD（n − 1）と 95 パーセンタイル（最近接順位、1 ms の階級の上端で見た最大を超えない。M-7）。1,000 ms を超える間隔は
   * 途切れとして入れない。標本が足りなければ null（decisions #54）
   */
  frameIntervalSd: number | null
  frameIntervalP95: number | null
  /**
   * 時計の残差（locked の tick の dev の標本標準偏差、n − 1。ms）。動画なしで始めた回など標本が 2 つ未満なら null
   * （decisions #32 (f)）
   */
  clockResidualSd: number | null
  /**
   * 発音の予約の遅れの最大 ms（音の実時刻を過ぎてから予約した分。src/audio/scheduler.ts の lateMaxMs。主スレッドの停止で
   * 音が遅れた・抜けたのを見つける）。音を予約しない回（動画の音だけ）は null（decisions #47）
   */
  audioLateMaxMs: number | null
}

/** 校正の行（段 1 ＝ tap、段 2 ＝ propose。decisions #40・#54） */
export interface CalibTelemetry extends TelemetryBase {
  kind: 'calib'
  stage: 'tap' | 'propose'
  /** 標本の数（段 1 は打った数、段 2 は正しい鍵で当てた数） */
  n: number
  /** 標本 SD（2 つ未満なら null） */
  sd: number | null
  /** 適用した（段 1 は条件を満たして入れた、段 2 は利用者が提案を受けた） */
  applied: boolean
  /** 条件を満たしたときのオフセット（ms）。満たさなければ null */
  proposed: number | null
  /** 満たさなかった理由（src/judge/calibration-offset.ts の OffsetVerdict） */
  reason?: 'count' | 'sd' | 'small'
}

export interface OnboardTelemetry extends TelemetryBase {
  kind: 'onboard' | 'quit'
  /** S0a〜S0d などの段の id */
  step: string
  seconds: number
  left: boolean
  /** 止めた位置（画面 id か曲の ms） */
  where?: string
}

export interface DeviceTelemetry extends TelemetryBase {
  kind: 'device'
  ua: string
  screenPx: [number, number]
  dpr: number
  limit: ChordLimit
  layoutMapOk: boolean
  /** DeviceInfo.tsResolution と同じ。推定できない間は無い */
  tsResolution?: number
}

export interface StorageFailTelemetry extends TelemetryBase {
  kind: 'storageFail'
  where: string
  message: string
}

export interface EmbedErrorTelemetry extends TelemetryBase {
  kind: 'embedError'
  code: number
}

export type TelemetryRow =
  | PlayTelemetry
  | CalibTelemetry
  | OnboardTelemetry
  | DeviceTelemetry
  | StorageFailTelemetry
  | EmbedErrorTelemetry

/** telemetry リングの上限（§4.3） */
export const TELEMETRY_RING_SIZE = 1000
