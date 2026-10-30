// 標本の受け入れ・逆行・飛び（M0-05、手順 7）。出どころ: design.md §2.6「逆行・飛び: 負の増分は捨て、期待値との差
// >250 ms は seek とみなし再初期化」、m3 `clk.feed` L324–350、相談 C、decisions #33（仮）。
// 1 回の読みを値で受けて判定を返す純関数（状態は clock-source.ts が持つ）。

import type { ClockMap } from './types.ts'

/** 飛びの閾 ms（§2.6。厳密に超えたら飛び。250 ちょうどは飛びでない） */
export const JUMP_MS = 250

/**
 * 読みの判定。
 * same ＝ 直前の読みと同じ（標本にしない）。base ＝ 再アンカーの後で読みがまだ分からなかった（seek の命令の後）最初の
 * 読み（保持する値にする。標本にしない）。first ＝ 再アンカー後の最初の変化（当てはめの線は無いので、窓をこの標本から
 * 始め直す。seek の凍結明けに飛びを出さないよう、下は保持の値 − 250、上は名目の進み ＋ 250 までを受け入れる）。
 * jump ＝ 当てはめの線との差 |dev| ＞ 250 か、first の範囲の外（再アンカー）。back ＝ 最後に受け入れた標本からの増分が
 * 0 以下（逆行。捨てる）。accept ＝ 受け入れる。
 */
export type SampleVerdict =
  | { kind: 'same' }
  | { kind: 'base' }
  | { kind: 'first' }
  | { kind: 'jump'; dev: number }
  | { kind: 'back'; dev: number }
  | { kind: 'accept'; dev: number }

export interface SampleContext {
  /** 直前の読み（受け入れなかった読みも含む）。再アンカーの後でまだ分からなければ null */
  readonly lastRead: number | null
  /** 再アンカーの後、読みがまだ変わっていない */
  readonly fresh: boolean
  /** 窓の最後の標本の読み（無ければ null） */
  readonly lastAccepted: number | null
  /** この読みの前の当てはめの線（β·q̂ と単調の床を含まない） */
  readonly line: ClockMap | null
  /** 再アンカーの点（fresh の間の保持の値と、その now） */
  readonly anchor: { readonly now: number; readonly t: number }
  /** 再生レート（first の上の範囲 ＝ 保持の値 ＋ rate·経過 ＋ 250） */
  readonly rate: number
}

/** 当てはめの線との差 dev ＝ raw − (a·now ＋ b) */
export function devOf(raw: number, now: number, line: ClockMap): number {
  return raw - (line.a * now + line.b)
}

export function classifySample(raw: number, now: number, ctx: SampleContext): SampleVerdict {
  if (ctx.lastRead !== null && raw === ctx.lastRead) return { kind: 'same' }
  if (ctx.fresh) {
    if (ctx.lastRead === null) return { kind: 'base' }
    // 保持の値より 250 ms を超えて後ろ（seek の後の古い読み・凍結中の 2 度目の後ろ向きの seek）か、名目の進みより
    // 250 ms を超えて先なら飛び。下を名目で比べないのは、真の時刻も止まる凍結（T-1 の 260 ms）の明けを飛びにしないため
    const nominal = ctx.anchor.t + ctx.rate * (now - ctx.anchor.now)
    if (raw < ctx.anchor.t - JUMP_MS || raw > nominal + JUMP_MS)
      return { kind: 'jump', dev: raw - nominal }
    return { kind: 'first' }
  }
  if (ctx.line === null) return { kind: 'first' }
  const dev = devOf(raw, now, ctx.line)
  if (Math.abs(dev) > JUMP_MS) return { kind: 'jump', dev }
  if (ctx.lastAccepted !== null && raw <= ctx.lastAccepted) return { kind: 'back', dev }
  return { kind: 'accept', dev }
}
