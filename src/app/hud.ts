// S2 の HUD（M1-03、M1 の手順 3）。出どころ: design.md §1.3 S2（入門者の HUD ＝ 曲名・進行・精度%）、m6 renderS2
// L821–822（曲名・進行の棒・精度の大きな数字）、m1' drawHUD L437–440、m1-kickoff §7-18（精度は小数 1 桁、判定した音が
// 無い間は「—」、仮）・§7-19（進行 ＝ t ／ 最終ノートの終わり。曲の前は 0、仮）。純関数（DOM は screens/play.ts）。
// M2 の手順 9（M2-05）: 音ゲー向けの項目（ランク・ゲージ・コンボ・ハイスピード・FAST／SLOW。m6 renderS2 L823–826）を
// gamerHudOf で。値は判定層の summarizeJudge（gamer・fastSlow）から（m6 の見本 → 本物）。

import type { JudgeSummary } from '../judge/judge.ts'
import { GAUGE_CLEAR } from '../judge/score.ts'
import type { Profile } from '../shared/types.ts'
import { hispeedText } from './profile.ts'

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

/** 音ゲー向けの HUD（§1.3 S2「＋ランク・ゲージ・コンボ・ハイスピード・FAST／SLOW」） */
export interface GamerHudView {
  /** 判定した音が無い間は「—」 */
  readonly rank: string
  /** ゲージ 0–100（棒の幅） */
  readonly gauge: number
  /** ゲージの数（整数に切り捨て） */
  readonly gaugeText: string
  /** クリアの線（70）以上か（棒の色） */
  readonly clear: boolean
  readonly combo: string
  /** 「×1.5（0.67 s）」 */
  readonly hispeed: string
  readonly fast: string
  readonly slow: string
}

/** 音ゲー向けの HUD。入門者の回（gamer が null）は null。combo は今のコンボ（判定層の score.combo） */
export function gamerHudOf(
  s: Pick<JudgeSummary, 'rank' | 'counts' | 'acc' | 'fastSlow' | 'gamer'>,
  combo: number,
  profile: Profile,
  hispeed: number,
): GamerHudView | null {
  const g = s.gamer
  if (g === null) return null
  return {
    rank: judgedCount(s) === 0 ? '—' : s.rank,
    gauge: g.gauge,
    gaugeText: String(Math.floor(g.gauge)),
    clear: g.gauge >= GAUGE_CLEAR,
    combo: String(combo),
    hispeed: hispeedText(profile, hispeed),
    fast: String(s.fastSlow.fast),
    slow: String(s.fastSlow.slow),
  }
}
