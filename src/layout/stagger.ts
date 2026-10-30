// 段ずれ（M0-07、手順 9）。出どころ: design.md §2.2（画面は正六角格子＝段ごと 1/2 ずれ）・§1.3 S6（段ずれの自己申告）、
// decisions #2（A–Q 間の 1/4 ずれはオクターブの継ぎ目）、ADR 0001（順は [数字–Q, Q–A, A–Z]）、
// m2 `STAG_BUILTIN` L198–203・`GAP_NAMES` L184・`physOffFor` L208（そのまま）・`redPairs` L264–265・`gapDevs` L266–267
// （作り直し: m2 の conv〔`hc` の tq 規約〕は無し、A の右上は W・左上は Q のまま）。
// 単位はキー幅 u。純関数だけ（DOM・Canvas に触れない。tools/ からも import する）。U-01 の実測が来たら
// その値を Stagger として渡すだけで、表の既定は ANSI のまま（kickoff §5 の代替）。

import type { KeyCode } from '../shared/types.ts'
import { KEY_ROWS } from './presets.ts'

/** 段ずれ [数字–Q, Q–A, A–Z]（u。上の段の左端から下の段の左端が右へ何 u ずれるか。ADR 0001） */
export type Stagger = readonly [number, number, number]

/** 段間の名前（ADR 0001 の順。m2 GAP_NAMES L184） */
export const GAP_NAMES: readonly [string, string, string] = ['数字–Q', 'Q–A', 'A–Z']

export type StaggerPreset = { readonly id: string; readonly name: string; readonly v: Stagger }

/** 段ずれの既定の表（m2 STAG_BUILTIN L198–203。先頭の ANSI が既定） */
export const STAGGER_PRESETS: readonly StaggerPreset[] = [
  { id: 'ansi', name: 'ANSI 標準（1/2・1/4・1/2）', v: [0.5, 0.25, 0.5] },
  { id: 'q4', name: '均等 1/4u（コンパクト機）', v: [0.25, 0.25, 0.25] },
  { id: 'h2', name: '均等 1/2u', v: [0.5, 0.5, 0.5] },
  { id: 'ortho', name: 'ortholinear（ずれ 0）', v: [0, 0, 0] },
]

export const DEFAULT_STAGGER: Stagger = [0.5, 0.25, 0.5]

/** 正六角格子の段ずれ（どの段間も 1/2 u。hex.ts の ROW_OFF の差） */
export const HEX_GAP_U = 0.5

/** 申告の刻み（u）と範囲（§1.3 S6 の自己申告は 1/4u 刻み。m2 の入力欄は 0〜1） */
export const STAGGER_STEP_U = 0.25
export const STAGGER_MAX_U = 1

/**
 * 外から来た値（保存・UI・U-01 の記録）を段ずれにする。3 つの有限の数で、どれも 0 以上 1 以下（u）でなければ null。
 * 1/4u 刻みでない値も受ける（U-01 の実測は 1u 単位の小数で来る。刻みは UI の入力だけ）。
 */
export function parseStagger(x: unknown): Stagger | null {
  if (!Array.isArray(x) || x.length !== 3) return null
  const v = x.map((e) => (typeof e === 'number' ? e : Number.NaN))
  if (!v.every((e) => Number.isFinite(e) && e >= 0 && e <= STAGGER_MAX_U)) return null
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0]
}

/** 段ごとの左端の物理 x（u、数字段を 0。m2 physOffFor L208） */
export function physOffFor(v: Stagger): [number, number, number, number] {
  return [0, v[0], v[0] + v[1], v[0] + v[1] + v[2]]
}

/** 鍵の物理座標の x（u、数字段の Digit1 の左端を 0。m2 GRIDS.phys の gx）。40 個の外なら null */
export function physX(code: KeyCode, v: Stagger): number | null {
  const off = physOffFor(v)
  for (let r = 0; r < KEY_ROWS.length; r++) {
    const c = KEY_ROWS[r]?.indexOf(code) ?? -1
    if (c >= 0) return (off[r] ?? 0) + c
  }
  return null
}

/** 段間ごとの「正六角格子の 1/2 ずれ」との差（u。正なら物理のずれが格子より小さい。m2 gapDevs L266–267） */
export function gapDevs(v: Stagger): [number, number, number] {
  return [HEX_GAP_U - v[0], HEX_GAP_U - v[1], HEX_GAP_U - v[2]]
}

/** 隣の物理のずれを赤くする線（u。m2 redPairs L265 の 0.2、仮） */
export const RED_DEV_U = 0.2

/** 段をまたぐか横の隣（右・左上・右上）と、格子で隣のはずの物理 x の差（m2 IDEAL_DX L239） */
const IDEAL: readonly { readonly dr: number; readonly dc: number; readonly dx: number }[] = [
  { dr: 0, dc: 1, dx: 1 },
  { dr: -1, dc: 0, dx: -0.5 },
  { dr: -1, dc: 1, dx: 0.5 },
]

export type RedPair = {
  readonly a: KeyCode
  readonly b: KeyCode
  /** 物理 x の差と格子の差のずれ（u） */
  readonly dev: number
  /** 段間の添字（上の段の添字 ＝ GAP_NAMES の添字） */
  readonly gap: number
}

/**
 * 正六角格子で隣（右・左上・右上）なのに、申告の段ずれでは物理 x が RED_DEV_U 以上ずれる組（m2 redPairs L264–265。
 * 40 個の鍵の全部を見る。配列で音の無い鍵も入る）。段をまたがない右の隣は常に 1 なので出ない。
 */
export function redPairs(v: Stagger): RedPair[] {
  const off = physOffFor(v)
  const out: RedPair[] = []
  KEY_ROWS.forEach((codes, r) =>
    codes.forEach((a, c) => {
      for (const d of IDEAL) {
        const b = KEY_ROWS[r + d.dr]?.[c + d.dc]
        if (b === undefined) continue
        const dx = (off[r + d.dr] ?? 0) + c + d.dc - ((off[r] ?? 0) + c)
        const dev = Math.abs(dx - d.dx)
        if (dev >= RED_DEV_U) out.push({ a, b, dev, gap: Math.min(r, r + d.dr) })
      }
    }),
  )
  return out
}
