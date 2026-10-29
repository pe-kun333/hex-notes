// 配列プリセット（M0-02）。出どころ: docs/design.md §2.1、spec 草稿 §1、
// m1-geometry ROWS／PRESETS、m2-layout-explorer LAYOUTS。判定は常に KeyboardEvent.code。
// ここは表と純関数だけ。DOM・Canvas に触れない（tools/ からも import する）。

import type { KeyCode, LayoutId } from '../shared/types.ts'
import { LAYOUT_ALIASES, LAYOUT_IDS } from '../shared/types.ts'

// ---------- 鍵の並び ----------

/** 4 段 × 10 個。row 0 が数字段、col 0 が左端（m1 ROWS） */
export const KEY_ROWS: readonly (readonly KeyCode[])[] = [
  [
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
  ],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
]

/** 40 個、段の順（上の段が先、段の中は左から） */
export const KEY_CODES: readonly KeyCode[] = KEY_ROWS.flat()

/** code → 段と列（m1 KEYS の byCode） */
const POSITION: ReadonlyMap<KeyCode, { row: number; col: number }> = new Map(
  KEY_ROWS.flatMap((codes, r) => codes.map((code, c) => [code, { row: r, col: c }] as const)),
)

/** 鍵の位置。40 個の外なら null */
export function keyPosition(code: KeyCode): { row: number; col: number } | null {
  return POSITION.get(code) ?? null
}

// ---------- 配列プリセット ----------

export type LayoutPreset = {
  id: LayoutId
  name: string
  /** 使う段（KEY_ROWS の添字） */
  rowsUsed: readonly number[]
  /** code → MIDI。無いキーは入れない */
  map: Readonly<Record<KeyCode, number>>
}

/** 1 段 10 個に MIDI を左から当てる。null は空のキー */
function row(r: number, midis: readonly (number | null)[]): Record<KeyCode, number> {
  const m: Record<KeyCode, number> = {}
  const codes = KEY_ROWS[r] ?? []
  midis.forEach((midi, c) => {
    const code = codes[c]
    if (midi !== null && code !== undefined) m[code] = midi
  })
  return m
}

/** Wicki–Hayden: 48 ＋ 2·col ＋ 5·(3 − row)（design.md §2.1、m2 LAYOUTS.wicki.map） */
function wickiMap(): Record<KeyCode, number> {
  const m: Record<KeyCode, number> = {}
  KEY_ROWS.forEach((codes, r) => codes.forEach((code, c) => (m[code] = 48 + 2 * c + 5 * (3 - r))))
  return m
}

/** 表の中の空のキー */
const _ = null

/** 配列の表。数値は spec 草稿 §1 のとおり直接書く（wicki だけ式） */
export const LAYOUTS: Readonly<Record<LayoutId, LayoutPreset>> = {
  // Ableton 型（入門者の既定）: A 段白鍵 C4〜E5、Q 段黒鍵（m1 PRESETS.garage）
  ableton: {
    id: 'ableton',
    name: 'Ableton 型',
    rowsUsed: [1, 2],
    map: {
      ...row(1, [_, 61, 63, _, 66, 68, 70, _, 73, 75]),
      ...row(2, [60, 62, 64, 65, 67, 69, 71, 72, 74, 76]),
    },
  },
  // VMPK 型: Z 段白鍵 C3〜E4・A 段黒鍵、Q 段白鍵 C4〜E5・数字段黒鍵（m1 PRESETS.fl）
  vmpk: {
    id: 'vmpk',
    name: 'VMPK 型',
    rowsUsed: [0, 1, 2, 3],
    map: {
      ...row(0, [_, 61, 63, _, 66, 68, 70, _, 73, 75]),
      ...row(1, [60, 62, 64, 65, 67, 69, 71, 72, 74, 76]),
      ...row(2, [_, 49, 51, _, 54, 56, 58, _, 61, 63]),
      ...row(3, [48, 50, 52, 53, 55, 57, 59, 60, 62, 64]),
    },
  },
  // 原神・Sky 型: Q／A／Z 段の左 7 キーが高・中・低の自然音（m1 PRESETS.genshin）
  genshin: {
    id: 'genshin',
    name: '原神・Sky 型',
    rowsUsed: [1, 2, 3],
    map: {
      ...row(1, [72, 74, 76, 77, 79, 81, 83, _, _, _]),
      ...row(2, [60, 62, 64, 65, 67, 69, 71, _, _, _]),
      ...row(3, [48, 50, 52, 53, 55, 57, 59, _, _, _]),
    },
  },
  // Wicki–Hayden（対照）: 右 +2、右上 +7、左上 +5（m2 LAYOUTS.wicki）
  wicki: {
    id: 'wicki',
    name: 'Wicki–Hayden',
    rowsUsed: [0, 1, 2, 3],
    map: wickiMap(),
  },
}

// ---------- 引き ----------

/**
 * 別名（garage・fl）と大小文字・前後の空白の揺れを吸収。4 値以外は null。
 * 揺れの吸収は UI の入力向け（ここだけ）。validate.ts の normalizeChart は §3.2 どおり小文字の完全一致。
 * プロトタイプのキー（constructor・__proto__ など）は引かない
 */
export function resolveLayoutId(idOrAlias: string): LayoutId | null {
  const key = idOrAlias.trim().toLowerCase()
  const found = LAYOUT_IDS.find((id) => id === key)
  if (found !== undefined) return found
  return Object.hasOwn(LAYOUT_ALIASES, key) ? (LAYOUT_ALIASES[key] ?? null) : null
}

/** code → MIDI。その配列に無いキーは null（map は素のオブジェクトなので hasOwn で引く） */
export function midiOf(layout: LayoutId, code: KeyCode): number | null {
  const map = LAYOUTS[layout].map
  return Object.hasOwn(map, code) ? (map[code] ?? null) : null
}

/** MIDI → code[]（逆引き）。同音は段の順＝上の段が先（vmpk の 60 は KeyQ、Comma の順） */
export function codesOf(layout: LayoutId, midi: number): KeyCode[] {
  const map = LAYOUTS[layout].map
  return KEY_CODES.filter((code) => map[code] === midi)
}

/** 配列の音域（MIDI の最小と最大） */
export function midiRange(layout: LayoutId): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const midi of Object.values(LAYOUTS[layout].map)) {
    if (midi < min) min = midi
    if (midi > max) max = midi
  }
  return { min, max }
}
