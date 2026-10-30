// 鍵盤図の幾何と退避（M0-07、手順 9）。出どころ: decisions #2（画面は正六角格子のまま。合わない端末は「正六角のまま
// 文字だけで押す」退避。物理せん断の描画は設定の選択肢に残すが既定にしない）、design.md §1.3 S6（幾何: 正六角／物理せん断／
// 退避、段ずれの自己申告）・§6.3 M-1、R2 spec 草稿 L33（申告値で黒鍵の位相が「合わない」と出た端末は退避を案内）、
// m2 `updateFallbackNote` L466–468（物理との差を数字段から段ごとに）、kickoff 手順 9（設定 hexnote.settings.geometry）。
// 退避で変えるのは表示だけ（判定は常に code。NEAR・辺ヒントは正六角の隣のまま。decisions #45、仮）。純関数だけ。

import { ROW_OFF } from '../render/hex/hex.ts'
import type { LayoutPhase } from './phase.ts'
import { physOffFor, type Stagger } from './stagger.ts'

/** 鍵盤図の幾何（hexnote.settings.geometry）。regular ＝ 正六角（既定）、physical ＝ 物理せん断、fallback ＝ 退避 */
export type GeometryMode = 'regular' | 'physical' | 'fallback'

export const GEOMETRY_MODES: readonly GeometryMode[] = ['regular', 'physical', 'fallback']
export const DEFAULT_GEOMETRY: GeometryMode = 'regular'

/** 保存・UI から来た値を幾何にする（3 値以外は null） */
export function parseGeometry(x: unknown): GeometryMode | null {
  return typeof x === 'string' && (GEOMETRY_MODES as readonly string[]).includes(x)
    ? (x as GeometryMode)
    : null
}

/**
 * 位相の表から勧める幾何。効く段間に「合わない」（ng）があれば退避を勧め、他（mid を含む）は正六角のまま
 * （mid は注記だけ。m2 L460 は退避と物理座標を比べるよう促すが、既定は変えない）。
 */
export function recommendGeometry(p: LayoutPhase): GeometryMode {
  return p.worst === 'ng' ? 'fallback' : 'regular'
}

/** 正六角格子と物理の差（u、数字段の左端を基準に段ごと。[Q 段, A 段, Z 段]。m2 L467 の 0.01 丸め前） */
export function fallbackRowDiffs(v: Stagger): [number, number, number] {
  const off = physOffFor(v)
  return [1, 2, 3].map((r) => (ROW_OFF[r] ?? 0) - (off[r] ?? 0)) as [number, number, number]
}

type Labels = 'key' | 'note' | 'both' | 'none'

/**
 * 退避では文字で押すので、セルのキー文字を必ず出す（音名だけ → 両方、なし → キー）。他の幾何はそのまま。
 * 足場外し（ラベルの透明度）がキー文字を消すかは練習層（M2）で、退避の間はキー文字を消さない。
 */
export function labelsFor(mode: GeometryMode, labels: Labels): Labels {
  if (mode !== 'fallback') return labels
  return labels === 'note' ? 'both' : labels === 'none' ? 'key' : labels
}
