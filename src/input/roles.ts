// 役割キーと code の分類（M0-04、手順 5）。出どころ: design.md §2.8「役割キー: Space＝開始・再開・校正タップ・
// 見本切替、Enter＝ボタン決定、Escape＝一時停止。禁止 code: Backquote, KanaMode, Convert, NonConvert, CapsLock,
// Lang1/2, Meta, F1〜F12。修飾キーは使わない」、kickoff 手順 5 の手直し（m1' の Enter＝やり直し → ボタン決定、
// m2 の Escape＝和音消去 → 一時停止）。演奏に使う code は src/layout/presets.ts の KEY_CODES（40 個）。
// DOM に触れない。

import type { KeyCode } from '../shared/types.ts'
import { KEY_CODES } from '../layout/presets.ts'

/**
 * 役割。primary ＝ Space（開始・再開・校正タップ・見本切替。どれになるかは画面が決める）、
 * confirm ＝ Enter（ボタン決定）、pause ＝ Escape（一時停止）
 */
export type Role = 'primary' | 'confirm' | 'pause'

/** code → 役割。NumpadEnter は設計に無いので入れない */
export const ROLE_KEYS: Readonly<Record<string, Role>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, Role>, {
    Space: 'primary',
    Enter: 'confirm',
    Escape: 'pause',
  } satisfies Record<string, Role>),
)

/**
 * 割り当てを禁じる code（§2.8）。押されても入力にも役割にもせず、既定の動作（F5 の再読込など）も止めない。
 * Meta は Chromium・Safari の MetaLeft／MetaRight と、古い Firefox の OSLeft／OSRight。
 * 半角/全角（JIS）は code が Backquote なので、IME の切替で帯が点かないよう IME の判定より先に見る（keyboard.ts）。
 */
export const FORBIDDEN_CODES: ReadonlySet<KeyCode> = new Set([
  'Backquote',
  'KanaMode',
  'Convert',
  'NonConvert',
  'CapsLock',
  'Lang1',
  'Lang2',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
])

/** Meta の code（keyboard.ts が keyup で全離しに使う。macOS は Meta を押している間に離した鍵の keyup を出さない） */
export const META_CODES: ReadonlySet<KeyCode> = new Set([
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
])

/** 修飾キーの code（§2.8「修飾キーは使わない」。演奏にも役割にも使わない） */
export const MODIFIER_CODES: ReadonlySet<KeyCode> = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
])

/** 演奏に使う code の既定（40 個）。配列で音の無い鍵も入力にはする（NEAR・空打ちは判定層が決める） */
export const PLAY_CODES: ReadonlySet<KeyCode> = new Set(KEY_CODES)

/** code の分類。play ＝ 演奏、role ＝ 役割、forbidden ＝ 禁止、modifier ＝ 修飾、other ＝ どれでもない（Tab など） */
export type CodeClass =
  | { kind: 'play' }
  | { kind: 'role'; role: Role }
  | { kind: 'forbidden' }
  | { kind: 'modifier' }
  | { kind: 'other' }

export function classifyCode(
  code: KeyCode,
  playCodes: ReadonlySet<KeyCode> = PLAY_CODES,
): CodeClass {
  if (FORBIDDEN_CODES.has(code)) return { kind: 'forbidden' }
  if (MODIFIER_CODES.has(code)) return { kind: 'modifier' }
  const role = ROLE_KEYS[code]
  if (role !== undefined) return { kind: 'role', role }
  if (playCodes.has(code)) return { kind: 'play' }
  return { kind: 'other' }
}

/**
 * 演奏の鍵に割り当ててよいか（将来の独自配列 ext.custom の検査用）。禁止・修飾・役割の code は不可。
 * 演奏の 40 個に入っているかは問わない（配列表の検査は src/layout/ がする）。
 */
export function isAssignable(code: KeyCode): boolean {
  return !FORBIDDEN_CODES.has(code) && !MODIFIER_CODES.has(code) && ROLE_KEYS[code] === undefined
}
