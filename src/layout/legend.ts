// 刻印（キーの文字。M0-07、手順 9）。出どころ: design.md §2.1「刻印: getLayoutMap（Chromium・HTTPS）→無ければ JIS／US の
// 選択（ja なら JIS 既定）。AZERTY・Dvorak は code が同じなので初版は QWERTY 刻印で表示し注記」・§1.3 S0a、
// m4 getLayoutMap L668–669（そのまま: 値を大文字にして、QWERTY の文字と違う鍵だけ差し替え、変えた数を数える）、
// m1' KEYS の label（QWERTY の文字）。判定は常に code（§2.8）で、刻印は表示だけ。
// 使う 40 鍵の刻印は JIS と US で同じ（§2.1「JIS／US で同じ 26 文字＋10 数字＋Comma／Period／Slash／Semicolon」）なので、
// JIS／US の選択は注記と、40 鍵の外（半角/全角など）の案内の言葉だけを変える（decisions #43、仮）。
// getLayoutMap の呼び出し（Promise・例外）は src/app/ がして、結果の Map か null を渡す。純関数だけ。

import type { KeyCode } from '../shared/types.ts'
import { KEY_CODES } from './presets.ts'

/** 刻印の表（40 鍵 → 表示する文字） */
export type Legend = ReadonlyMap<KeyCode, string>

/** JIS／US（getLayoutMap が無いときの選択） */
export type LegendKind = 'jis' | 'us'

/** 刻印の出どころ: layoutMap ＝ getLayoutMap を読めた、jis／us ＝ 読めず選択（QWERTY の文字） */
export type LegendSource = 'layoutMap' | LegendKind

const GLYPH: Readonly<Record<string, string>> = {
  Semicolon: ';',
  Comma: ',',
  Period: '.',
  Slash: '/',
}

/** QWERTY の刻印（m1' KEYS の label。KeyA → A、Digit1 → 1、Semicolon → ;） */
export function qwertyLabel(code: KeyCode): string {
  return GLYPH[code] ?? code.replace(/^(Key|Digit)/, '')
}

/** 40 鍵の QWERTY の刻印 */
export const QWERTY_LEGEND: Legend = new Map(KEY_CODES.map((c) => [c, qwertyLabel(c)]))

/** 言語から JIS／US の既定（ja・ja-JP なら JIS、他は US。§2.1） */
export function defaultLegendKind(lang: string): LegendKind {
  return /^ja(-|$)/i.test(lang.trim()) ? 'jis' : 'us'
}

/** 1 文字（書記素 1 つ）か。getLayoutMap の値は "a" のほか "Dead" などの名前が来ることがある */
function oneGlyph(s: string): boolean {
  return [...s].length === 1 && s.trim() !== ''
}

export type LegendResult = {
  readonly legend: Legend
  readonly source: LegendSource
  /** QWERTY の文字から変えた鍵の数（m4 L668 の changed） */
  readonly changed: number
}

/**
 * 刻印を作る。layoutMap（getLayoutMap の結果。読めなければ null）があれば値を大文字にして使い、1 文字でない値・無い鍵は
 * QWERTY の文字のまま。無ければ kind（JIS／US）で QWERTY の文字。
 */
export function legendOf(
  layoutMap: ReadonlyMap<string, string> | null,
  kind: LegendKind,
): LegendResult {
  if (layoutMap === null) return { legend: QWERTY_LEGEND, source: kind, changed: 0 }
  let changed = 0
  const legend = new Map<KeyCode, string>()
  for (const code of KEY_CODES) {
    const q = qwertyLabel(code)
    const v = layoutMap.get(code)
    const label = v !== undefined && oneGlyph(v) ? v.toUpperCase() : q
    if (label !== q) changed++
    legend.set(code, label)
  }
  return { legend, source: 'layoutMap', changed }
}
