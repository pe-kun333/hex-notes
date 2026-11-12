// 校正の文言とプレイ後の提案（M1-05、M1 の手順 4）。出どころ: design.md §2.7（段 1 は SD < 30 のときだけ適用、段 2 は
// ヒット ≥8・|平均| ≥10・SD < 30 で提案、母集団は通常プレイだけ、音源種別ごとに保存）、m6 calibsim・calibbad L959–960
// （「平均 −18 ms、ばらつき 12 ms。適用します。」「ばらつきが大きい（SD 41 ms）ので適用しません。プレイ後に提案します。」）・
// S3 の提案帯 L381–384・S0c の「聞こえない」L278、m3 finishCal L454（打数不足）、decisions #40・#62（提案 ＝ 使った
// オフセット − 平均、文言「平均 −12 ms（少し早め）→ オフセットを ＋12 ms にしますか」）、m1-kickoff §7-18（ずれの言葉の
// 閾 ±5 ms、仮）。純関数（DOM は calibration-panel.ts・screens/result.ts）。
// M3 の手順 9（M3-08、m3-kickoff 手順 9・§7-34、仮）: 校正の種別 calibKindOf（動画の回でない → audio、段 4 のタップで合わせた
// sync〔measured 真〕の動画の回 → null ＝ 0 で判定して提案もしない、他の動画の回 → youtube）、母集団の門 calibEligibleOf（通常プレイ
// ＋ 種別が null でない ＋ 切り替わっていない）、ずれの傾き tempoDriftOf と注意の文、種別の言葉と適用後の文。

import {
  OFFSET_LIMIT_MS,
  TAP_COUNT,
  atLimit,
  proposeOffset,
  type OffsetVerdict,
} from '../judge/calibration-offset.ts'
import type { PlayResult } from './play-runner.ts'
import type { KeysetId } from '../chart/keyset.ts'
import type { PlayMode, SyncKind } from '../shared/types.ts'
import { offsetFor, type Calibration } from '../storage/local.ts'

/** ずれの言葉で「ちょうど」とする |平均| の上限 ms（m1-kickoff §7-18、仮） */
export const LEAN_EXACT_MS = 5

/** 符号付きの ms（＋12 ms・−12 ms・±0 ms。1 ms に丸める） */
export function signedMs(x: number): string {
  const r = Math.round(x)
  return `${r > 0 ? '＋' : r < 0 ? '−' : '±'}${Math.abs(r)} ms`
}

/** ずれの言葉（平均が負 ＝ 早め、正 ＝ 遅め、±5 ms 以内はちょうど） */
export function leanWord(meanMs: number): string {
  if (Math.abs(meanMs) <= LEAN_EXACT_MS) return 'ちょうど'
  return meanMs < 0 ? '少し早め' : '少し遅め'
}

/** 段 1 の結果の文（n は数えた打数） */
export function tapResultText(v: OffsetVerdict, n: number): string {
  if (v.ok)
    return `平均 ${signedMs(v.mean)}（${leanWord(v.mean)}）、ばらつき ${Math.round(v.sd)} ms。オフセットを ${signedMs(v.offset)} にしました${limitNote(v.offset, -v.mean)}。`
  if (v.reason === 'sd')
    return `ばらつきが大きい（SD ${Math.round(v.sd ?? 0)} ms）ので適用しません。プレイ後に提案します。`
  return `打数が足りません（${n}/${TAP_COUNT}）。適用しません。`
}

/**
 * 「聞こえない」を選んだとき（m6 L278）。校正は書き換えない: 未校正なら未校正のまま（S1 の上帯の印）、校正済み（S6 から
 * やり直そうとした）なら今のオフセットのまま
 */
export function silentText(calibrated: boolean): string {
  return calibrated
    ? '音が聞こえないので校正は行いません（今のオフセットのままにします）。'
    : '音が聞こえないので校正は行いません（未校正のままにします。あとで設定からやり直せます）。'
}

/**
 * プレイ後の提案（段 2）。母集団は通常プレイ（固定テンポ・1.0 倍・全鍵。PlayResult.calibEligible）だけで、外の回は null。
 * 条件を満たさなければ ok 偽の verdict（calib 行の reason に使う）
 */
export function proposalFor(r: PlayResult): OffsetVerdict | null {
  if (!r.calibEligible) return null
  return proposeOffset(r.samples, r.offsetUsed)
}

/** 上限で切ったときの注記（範囲 ±120、§2.7。M1 の手順 14、decisions #77） */
function limitNote(offset: number, unclamped: number): string {
  return atLimit(offset, unclamped)
    ? `（上限 ±${OFFSET_LIMIT_MS} ms。それより大きいずれは残ります）`
    : ''
}

/** 種別の言葉（文に差す形。「YouTube 」は末に半角空白、M3 の手順 9） */
export function calibKindWord(kind: SyncKind): string {
  return kind === 'youtube' ? 'YouTube ' : '自前音源'
}

/** 提案の見出し（#62）と内訳。used は今のオフセット（上限の注記に使う）、kind は保存先（M3 の手順 9） */
export function proposalText(
  v: OffsetVerdict & { ok: true },
  n: number,
  used = 0,
  kind: SyncKind = 'audio',
): { title: string; detail: string } {
  return {
    title: `平均 ${signedMs(v.mean)}（${leanWord(v.mean)}）→ オフセットを ${signedMs(v.offset)} にしますか${limitNote(v.offset, used - v.mean)}`,
    detail: `ばらつき ${Math.round(v.sd)} ms、ヒット ${n}。${calibKindWord(kind)}のオフセットとして保存します。`,
  }
}

/** 提案を適用した後の文（M3 の手順 9） */
export function appliedText(kind: SyncKind, offset: number): string {
  return `${calibKindWord(kind)}のオフセットを ${signedMs(offset)} にしました。`
}

/**
 * 校正の種別（M3 の手順 9、§7-34）。動画の回でなければ audio。動画の回で sync が段 4 のタップで合わせた物（measured 真）なら
 * null（タップに端末と人の遅れが入っているので youtube の値を掛けず 0 で判定し、提案もしない）、他は youtube。判定の読み
 * （screens/play.ts）と母集団の門（play-runner の runOutcome）が同じこの関数を通る
 */
export function calibKindOf(i: {
  readonly video: boolean
  readonly measured?: boolean
}): SyncKind | null {
  if (!i.video) return 'audio'
  return i.measured === true ? null : 'youtube'
}

/** 判定に使う校正の値（種別 null ＝ measured 真の動画の回は 0。未校正も 0。M3 の手順 9） */
export function calibOffset(c: Calibration, kind: SyncKind | null): number {
  return kind === null ? 0 : offsetFor(c, kind)
}

/**
 * 段 2 の母集団の門（M3 の手順 9、§7-34）: 通常プレイ（全鍵・固定テンポ・1.0 倍・ループ 0）で、種別が null でなく、切り替わって
 * いない（fallbackT が null。0 も切替。動画へ戻した回も残る）
 */
export function calibEligibleOf(i: {
  readonly keyset: KeysetId
  readonly mode: PlayMode
  readonly rate: number
  readonly loops: number
  readonly fallbackT: number | null
  readonly kind: SyncKind | null
}): boolean {
  return (
    i.keyset === 'all' &&
    i.mode === 'fixed' &&
    i.rate === 1 &&
    i.loops === 0 &&
    i.fallbackT === null &&
    i.kind !== null
  )
}

/** ずれの傾きの注意の門（x ＝ 傾き × 標本の時間幅 ≥ 20 ms〔提案の門 10 ms の 2 倍〕かつ 傾き ＞ 2 × 標準誤差。仮、§7-34） */
export const DRIFT_WARN_MS = 20
/** 傾きを見る標本の下限（提案の門と同じ 8） */
export const DRIFT_MIN_SAMPLES = 8

export interface TempoDrift {
  /** ずれの傾き（ms/秒。負 ＝ 曲の後ろほど早く押している ＝ 動画が速い） */
  readonly slope: number
  /** 傾きの標準誤差（ms/秒） */
  readonly se: number
  /** 傾きの絶対値 × 標本の時間幅（ms。曲の中でずれが動いた量） */
  readonly x: number
  /** 注意を出す（提案しない） */
  readonly warn: boolean
}

/**
 * ずれの傾き（M3 の手順 9、§7-34。手順 4 の曲末のずれと同じ形）。標本（dt）と着地の譜面 ms の対の最小二乗。8 個未満・時間幅 0 は
 * null
 */
export function tempoDriftOf(pairs: readonly { readonly landMs: number; readonly dtMs: number }[]): TempoDrift | null {
  const n = pairs.length
  if (n < DRIFT_MIN_SAMPLES) return null
  const xs = pairs.map((p) => p.landMs / 1000)
  const ys = pairs.map((p) => p.dtMs)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] as number) - mx
    sxx += dx * dx
    sxy += dx * ((ys[i] as number) - my)
  }
  if (!(sxx > 0)) return null
  const slope = sxy / sxx
  let sse = 0
  for (let i = 0; i < n; i++) {
    const e = (ys[i] as number) - (my + slope * ((xs[i] as number) - mx))
    sse += e * e
  }
  const se = Math.sqrt(sse / (n - 2) / sxx)
  const span = Math.max(...xs) - Math.min(...xs)
  const x = Math.abs(slope) * span
  return { slope, se, x, warn: x >= DRIFT_WARN_MS && Math.abs(slope) > 2 * se }
} // prettier-ignore

/** 傾いた回の注意の文（提案の帯の場所。釦も calib 行も無い） */
export function driftText(d: TempoDrift): string {
  return `ずれが曲の中で約 ${Math.round(d.x)} ms 動きました。動画のテンポが譜面と合っていないようです。`
}
