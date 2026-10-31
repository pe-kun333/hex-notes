// S2 の HUD（M1-03、M1 の手順 3）。出どころ: design.md §1.3 S2（入門者の HUD ＝ 曲名・進行・精度%）、m6 renderS2
// L821–822（曲名・進行の棒・精度の大きな数字）、m1' drawHUD L437–440、m1-kickoff §7-18（精度は小数 1 桁、判定した音が
// 無い間は「—」、仮）・§7-19（進行 ＝ t ／ 最終ノートの終わり。曲の前は 0、仮）。音ゲー向けの項目（ランク・ゲージ・
// コンボ・ハイスピード・FAST／SLOW）は M2-05。純関数（DOM は screens/play.ts）。

import type { JudgeSummary } from '../judge/judge.ts'

export interface HudView {
  readonly title: string
  /** 進行 0–1（棒の幅） */
  readonly progress: number
  /** 進行の文字（整数の %、切り捨て） */
  readonly progressText: string
  readonly accuracy: string
}

/** 進行 ＝ t ／ 最終ノートの終わり（0–1 に収める。曲の前〔t < 0〕は 0、終わりの後の 1.2 秒は 1） */
export function progressOf(t: number, lastEndMs: number): number {
  if (!(lastEndMs > 0)) return t > 0 ? 1 : 0
  return Math.min(1, Math.max(0, t / lastEndMs))
}

/** 判定した音の数（skipped は入れない。精度の分母） */
function judgedCount(s: Pick<JudgeSummary, 'counts'>): number {
  const c = s.counts
  return c.perfect + c.great + c.good + c.near + c.miss
}

/** 精度の文字（小数 1 桁の %。判定した音が無い間は「—」） */
export function accuracyText(s: Pick<JudgeSummary, 'acc' | 'counts'>): string {
  return judgedCount(s) === 0 ? '—' : `${(s.acc * 100).toFixed(1)}%`
}

export function hudOf(
  title: string,
  t: number,
  lastEndMs: number,
  s: Pick<JudgeSummary, 'acc' | 'counts'>,
): HudView {
  const progress = progressOf(t, lastEndMs)
  return {
    title,
    progress,
    progressText: `${Math.floor(progress * 100)}%`,
    accuracy: accuracyText(s),
  }
}
