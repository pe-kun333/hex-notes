// 鍵数制限の実行時フィルタ（M1-10、M1 の手順 7）。出どころ: design.md §3.2（鍵数制限は variant を増やさず実行時フィルタ、
// results.keyset）・§1.3 S0d（3 段階: 1 音 → ホームポジション → 全鍵）・§2.3（成績の対象は全鍵だけ）、m6 S0d L283–294・
// renderS0 L734（keyset の Set で落ちるセルを間引く）、m1-kickoff 手順 7（id は d・dfjk・8・all）、decisions #17。
// 鍵は code（Ableton 型の刻印で D ＝ KeyD）。譜面版の keys が集合に無い音を外す純関数で、外した音は判定にも描画にも
// 出ない（miss にならない）。音（ガイド音・伴奏）は外さない（旋律は先読みで鳴る、decisions #48）。

import type { KeyCode } from '../shared/types.ts'

export type KeysetId = 'd' | 'dfjk' | '8' | 'all'
export const KEYSET_IDS: readonly KeysetId[] = ['d', 'dfjk', '8', 'all']

const SETS: Readonly<Record<Exclude<KeysetId, 'all'>, ReadonlySet<KeyCode>>> = {
  d: new Set(['KeyD']),
  dfjk: new Set(['KeyD', 'KeyF', 'KeyJ', 'KeyK']),
  '8': new Set(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon']),
}

/** 画面の言葉（m6 L286 の段階の名前） */
export const KEYSET_NAMES: Readonly<Record<KeysetId, string>> = {
  d: '1 音（D だけ）',
  dfjk: 'ホームポジション（D F J K）',
  '8': '8 鍵（A S D F J K L ;）',
  all: '全鍵',
}

/** チュートリアル（S0d）の 3 段階の順（§1.3 S0d） */
export const TUTORIAL_KEYSETS: readonly KeysetId[] = ['d', 'dfjk', 'all']

/** 鍵の集合（all は null ＝ 制限なし） */
export function keysetCodes(id: KeysetId): ReadonlySet<KeyCode> | null {
  return id === 'all' ? null : SETS[id]
}

/** 集合に無い鍵の音を外す（順は保つ。all はそのまま同じ配列を返す） */
export function filterKeyset<T extends { readonly code: KeyCode }>(notes: readonly T[], id: KeysetId): readonly T[] {
  const set = keysetCodes(id)
  return set === null ? notes : notes.filter((n) => set.has(n.code))
} // prettier-ignore
