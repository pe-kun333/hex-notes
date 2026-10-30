// 足場外しと自力率（M0-06、手順 8）。出どころ: design.md §2.7（音高ごとの α〔初期 1〕、当てた −0.12、外した +0.30、
// NEAR 不変、α<0.2 で「ラベル無し」、鍵盤側／ノート側を別スイッチ。自力＝両ラベル無しで正解／ヒント付き／NEAR／外した
// 〔窓を逃した、または待ち中の誤打〕）、decisions #6（NEAR と足場外しを分ける、自力率の 4 区分）、
// m4 `fadeOf` L314・`labelVisible` L315（そのまま）・`classify` L420–422（作り直し: 区間・ループの集計は練習層、
// tainted は「外した」）。状態は値で持つ。保存（hexnote.fade）は保存層（手順 11）。

import type { SelfRate } from '../shared/types.ts'

/** α を下げる・上げる幅と、ラベルを消す線（§2.7） */
export const FADE_HIT = 0.12
export const FADE_MISS = 0.3
export const FADE_HIDE_BELOW = 0.2

/** 足場外しの状態。linked ＝ 成績連動（音高ごとの α）、manual ＝ 全音一律（manual の値） */
export interface FadeState {
  readonly mode: 'linked' | 'manual'
  readonly manual: number
  /** 音高（鍵の MIDI）→ α。無い音は 1 */
  readonly alpha: Readonly<Record<number, number>>
}

export function initialFade(): FadeState {
  return { mode: 'linked', manual: 1, alpha: {} }
}

/** ラベルの出し方（鍵盤側・ノート側を別に。'none' はその側のラベルを出さない） */
export interface LabelSides {
  readonly kb: 'key' | 'note' | 'both' | 'none'
  readonly note: 'key' | 'note' | 'both' | 'none'
}

/** 自力率の区分（SelfRate のキー） */
export type SelfCategory = keyof SelfRate

/** その音高の α（m4 fadeOf L314） */
export function fadeOf(f: FadeState, midi: number): number {
  return f.mode === 'manual' ? f.manual : (f.alpha[midi] ?? 1)
}

/** ラベルが見えているか（m4 labelVisible L315: どちらかの側が出していて α ≥ 0.2） */
export function labelVisible(f: FadeState, midi: number, sides: LabelSides): boolean {
  const a = fadeOf(f, midi)
  return (
    (sides.kb !== 'none' && a >= FADE_HIDE_BELOW) || (sides.note !== 'none' && a >= FADE_HIDE_BELOW)
  )
}

/**
 * 1 音の区分。miss（窓を逃した）と tainted（待ち中の誤打。練習層 M2-03 が付ける）は miss、NEAR は near、
 * 当てた音はラベルが見えていれば hinted、見えていなければ solo（m4 classify L430 の順）。
 */
export function classify(
  hit: 'hit' | 'near' | 'miss',
  visible: boolean,
  tainted = false,
): SelfCategory {
  if (tainted || hit === 'miss') return 'miss'
  if (hit === 'near') return 'near'
  return visible ? 'hinted' : 'solo'
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000

/** 区分の後の α（成績連動だけ。当てた −0.12、外した +0.30、NEAR 不変。0..1、小数 3 桁。m4 classify L421） */
export function fadeAfter(f: FadeState, midi: number, cat: SelfCategory): FadeState {
  if (f.mode !== 'linked' || cat === 'near') return f
  const a = fadeOf(f, midi)
  const next =
    cat === 'miss' ? Math.min(1, round3(a + FADE_MISS)) : Math.max(0, round3(a - FADE_HIT))
  return { ...f, alpha: { ...f.alpha, [midi]: next } }
}

export function emptySelfRate(): SelfRate {
  return { solo: 0, hinted: 0, near: 0, miss: 0 }
}

/** 自力率 ＝ solo / 4 区分の和（S4「62%（ラベル無しで当てた 31／50）」）。区分が無ければ null */
export function selfRatio(s: SelfRate): number | null {
  const n = s.solo + s.hinted + s.near + s.miss
  return n > 0 ? s.solo / n : null
}
