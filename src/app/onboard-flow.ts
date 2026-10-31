// 初回導線の段の進み（S0a〜S0d、M1-04、M1 の手順 9）。出どころ: design.md §1.3 S0（4 段とも「あとで」で既定値のまま先へ、
// 離脱として記録）、m6 ACT s0next・s0later L955–957（「あとで」は次の段へ、S0d の「あとで」は S3 を飛ばして S1）、
// §4.6 onboard 行（段ごとの到達・秒・離脱）、m1-kickoff 手順 9・§7-14（秒は各段の表示から次の段〔か「あとで」〕までの実時間、
// 5 分は S0a の表示から S0d の曲末まで、「あとで」とスキップは left 真）、decisions #61（S0d は固定テンポ）・#70（3 段階）。
// 純関数（DOM は screens/onboard.ts と screens/play.ts）。

import { TUTORIAL_KEYSETS, type KeysetId } from '../chart/keyset.ts'

/** 段の id（onboard 行の step） */
export const ONBOARD_IDS = ['S0a', 'S0b', 'S0c', 'S0d'] as const
export type OnboardId = (typeof ONBOARD_IDS)[number]

export interface OnboardState {
  /** 今の段（0〜3。4 は終わり） */
  readonly step: number
  /** 今の段を出した時刻（perf ms） */
  readonly enteredAt: number
}

/** onboard 行の中身（at は呼ぶ側が付ける） */
export interface OnboardLeave {
  readonly step: OnboardId
  readonly seconds: number
  readonly left: boolean
}

export function startOnboard(now: number): OnboardState {
  return { step: 0, enteredAt: now }
}

/** 秒（0.1 秒に丸める。負にしない） */
export function secondsSince(from: number, now: number): number {
  return Math.round(Math.max(0, now - from) / 100) / 10
}

/**
 * 今の段を閉じて次へ。left は「あとで」かスキップ（既定値のまま次へ）。S0d の後は step 4（終わり）
 */
export function leaveStep(s: OnboardState, now: number, left: boolean): { state: OnboardState; row: OnboardLeave } {
  const id = ONBOARD_IDS[Math.min(s.step, ONBOARD_IDS.length - 1)] ?? 'S0d'
  return {
    state: { step: s.step + 1, enteredAt: now },
    row: { step: id, seconds: secondsSince(s.enteredAt, now), left },
  }
} // prettier-ignore

/** S0d のチュートリアル曲の段階（S2 をまたいで殻が持つ） */
export interface TutorialRun {
  /** TUTORIAL_KEYSETS の位置（0 ＝ D だけ、1 ＝ ホームポジション、2 ＝ 全鍵） */
  readonly stage: number
  /** S0d を出した時刻（onboard 行の秒） */
  readonly enteredAt: number
}

export function tutorialKeyset(t: TutorialRun): KeysetId {
  return TUTORIAL_KEYSETS[t.stage] ?? 'all'
}

/** 次の段階（曲末で自動で次へ。最後の段階の後は null ＝ S3 へ） */
export function nextTutorial(t: TutorialRun): TutorialRun | null {
  return t.stage + 1 < TUTORIAL_KEYSETS.length ? { ...t, stage: t.stage + 1 } : null
}

/** 吹き出し 3 つ（m6 L289–291） */
export const TUTORIAL_TIPS: readonly string[] = [
  '鍵盤の明るい辺が、次に押すキーの方向を指します。',
  'セルが自分のキーの六角にはまった瞬間が押し時です。',
  'くっついた 2 つのセルは同時に押します（上限 2）。',
]
