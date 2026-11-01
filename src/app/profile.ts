// 入門者プロファイル（M1-02、M1 の手順 1）。出どころ: design.md §2.3（窓 2 組。値は src/judge/windows.ts の PROFILES）、
// §2.2（辺ヒントは入門者のみ、流れる時間 1.5 s／1.0 s ＝ src/render/hex/sizing.ts の TRAVEL_MS）、§2.5 L131（入門者の
// both）、§1.3 S2（HUD: 入門者＝曲名・進行・精度%、音ゲー向け＝＋ランク・ゲージ・コンボ・ハイスピード・FAST／SLOW）、
// decisions #1（既定配列は ableton）・#3（段別着地が既定）・#6（NEAR）・#7（上限の既定 2）・#8（点・ゲージは音ゲー向け）・
// #60（ラベルの既定は 鍵盤側 key・ノート側 both）、m6 L919（S6「着地と判定」）・L821–826（HUD の見本）。
// 値は各層の定数から引き、ここに数値を書かない。純関数（DOM 無し）。音ゲー向けのラベル（鍵盤側 key・ノート側 key）は
// R2 の screens 草稿「セル: キー文字のみ。鍵盤図: 文字のみ」の写し（M2-05 で採った、m2-kickoff §7-16、仮）。
// M2 の手順 9（M2-05）: 切替（S1 の上帯・S6）は applyProfileDefaults、ハイスピードは settings.hispeed を流れる時間に掛ける
// （travelOf。v に掛け、R は変えない、§2.5・decisions #24 (c)）。

import type { LabelSides } from '../judge/self-rate.ts'
import { PROFILES, type ProfileRules } from '../judge/windows.ts'
import { DEFAULT_LANDING, type LandingMode } from '../render/hex/landing.ts'
import { TRAVEL_MS, travelWithHispeed } from '../render/hex/sizing.ts'
import { DEFAULT_CHORD_LIMIT, type ChordLimit, type Profile } from '../shared/types.ts'
import type { Settings } from '../storage/local.ts'

/** HUD の項目（§1.3 S2）。入門者は title・progress・accuracy だけ */
export type HudItem =
  'title' | 'progress' | 'accuracy' | 'rank' | 'gauge' | 'combo' | 'hispeed' | 'fastSlow'

const HUD_BEGINNER: readonly HudItem[] = ['title', 'progress', 'accuracy']
const HUD_GAMER: readonly HudItem[] = [
  ...HUD_BEGINNER,
  'rank',
  'gauge',
  'combo',
  'hispeed',
  'fastSlow',
]

/** ラベルの既定（入門者は #60、音ゲー向けは m2-kickoff §7-16、仮） */
const LABELS: Readonly<Record<Profile, LabelSides>> = {
  beginner: { kb: 'key', note: 'both' },
  gamer: { kb: 'key', note: 'key' },
}

export interface ProfileDefaults {
  readonly profile: Profile
  /** 判定の規則（窓・NEAR・ゲージ。src/judge/windows.ts） */
  readonly rules: ProfileRules
  /** 流れる時間 ms（§2.2。sizing の T） */
  readonly travelMs: number
  /** 辺ヒント（§2.2「入門者のみ」） */
  readonly hints: boolean
  /** 着地の方式（decisions #3） */
  readonly landing: LandingMode
  /** 譜面版の上限の既定（decisions #7。端末の上限が高くても 2） */
  readonly limit: ChordLimit
  readonly labels: LabelSides
  /** HUD に出す項目（§1.3 S2） */
  readonly hud: readonly HudItem[]
  /** ゲージ 0 で途中終了するか（§2.3「失敗は入門者なし」。rules.gauge と同じ） */
  readonly failOnGauge: boolean
}

/** プロファイルの既定値を層の定数から束ねる */
export function profileOf(profile: Profile): ProfileDefaults {
  const rules = PROFILES[profile]
  return {
    profile,
    rules,
    travelMs: TRAVEL_MS[profile],
    hints: profile === 'beginner',
    landing: DEFAULT_LANDING,
    limit: DEFAULT_CHORD_LIMIT,
    labels: LABELS[profile],
    hud: profile === 'beginner' ? HUD_BEGINNER : HUD_GAMER,
    failOnGauge: rules.gauge,
  }
}

/**
 * 設定にプロファイルの既定を一括で入れる（§1.3 S6「切替で既定値を一括」。S1 の上帯と S6 の切替、S6 の「既定へ戻す」の
 * 部品）。プロファイルで変わる項目（profile・labels・hints）だけを書き換え、着地（decisions #3 の対照オプション。両
 * プロファイルで cell）・幾何・音・ハイスピードなど他の項目は利用者の選択を保つ（m2-kickoff §7-16）。
 */
export function applyProfileDefaults(s: Settings, profile: Profile): Settings {
  const p = profileOf(profile)
  return { ...s, profile, labels: p.labels, hints: p.hints }
}

export const PROFILE_NAMES: Readonly<Record<Profile, string>> = {
  beginner: '入門者',
  gamer: '音ゲー向け',
}

/** もう一方のプロファイル（S1 の上帯の「切替」） */
export function otherProfile(p: Profile): Profile {
  return p === 'beginner' ? 'gamer' : 'beginner'
}

/** S2 の流れる時間 ms（プロファイルの T をハイスピードで割る。§2.5） */
export function travelOf(profile: Profile, hispeed: number): number {
  return travelWithHispeed(TRAVEL_MS[profile], hispeed)
}

/** ハイスピードの倍率（「×1.0」「×1.25」） */
export function hispeedLabel(hispeed: number): string {
  return `×${Number.isInteger(hispeed) ? hispeed.toFixed(1) : String(hispeed)}`
}

/** ハイスピードの表示（倍率と流れる時間。「×1.5（0.67 s）」。m6 L826 の「1.0 s」を倍率に、m2-kickoff 手順 9 の手直し） */
export function hispeedText(profile: Profile, hispeed: number): string {
  const sec = travelOf(profile, hispeed) / 1000
  return `${hispeedLabel(hispeed)}（${sec.toFixed(2).replace(/0$/, '')} s）`
}
