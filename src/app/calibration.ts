// 校正の文言とプレイ後の提案（M1-05、M1 の手順 4）。出どころ: design.md §2.7（段 1 は SD < 30 のときだけ適用、段 2 は
// ヒット ≥8・|平均| ≥10・SD < 30 で提案、母集団は通常プレイだけ、音源種別ごとに保存）、m6 calibsim・calibbad L959–960
// （「平均 −18 ms、ばらつき 12 ms。適用します。」「ばらつきが大きい（SD 41 ms）ので適用しません。プレイ後に提案します。」）・
// S3 の提案帯 L381–384・S0c の「聞こえない」L278、m3 finishCal L454（打数不足）、decisions #40・#62（提案 ＝ 使った
// オフセット − 平均、文言「平均 −12 ms（少し早め）→ オフセットを ＋12 ms にしますか」）、m1-kickoff §7-18（ずれの言葉の
// 閾 ±5 ms、仮）。純関数（DOM は calibration-panel.ts・screens/result.ts）。

import {
  OFFSET_LIMIT_MS,
  TAP_COUNT,
  atLimit,
  proposeOffset,
  type OffsetVerdict,
} from '../judge/calibration-offset.ts'
import type { PlayResult } from './play-runner.ts'

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

/** 提案の見出し（#62）と内訳。used は今のオフセット（上限の注記に使う） */
export function proposalText(
  v: OffsetVerdict & { ok: true },
  n: number,
  used = 0,
): { title: string; detail: string } {
  return {
    title: `平均 ${signedMs(v.mean)}（${leanWord(v.mean)}）→ オフセットを ${signedMs(v.offset)} にしますか${limitNote(v.offset, used - v.mean)}`,
    detail: `ばらつき ${Math.round(v.sd)} ms、ヒット ${n}。自前音源のオフセットとして保存します。`,
  }
}
