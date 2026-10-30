// 鍵盤図の格子（M0-03a、手順 4）。出どころ: docs/design.md §2.2（格子: pointy-top 正六角、段ごと右へ 1/2 セル、
// 縦間隔 1.5·R、幅 √3·R）、m0-layout computeGeom L214–250（kbW・kbH・cells の cx/cy）。
// 配列プリセット（src/layout/presets.ts）の rowsUsed から、鍵盤図の幅・高さと各鍵のセル中心を出す。
// グローバル状態を持たない。DOM・Canvas に触れない。単位は CSS px。

import { QWERTY_LEGEND, type Legend } from '../../layout/legend.ts'
import { KEY_ROWS, LAYOUTS, midiOf } from '../../layout/presets.ts'
import type { KeyCode, LayoutId } from '../../shared/types.ts'
import { ROW_OFF, SQ3, gridX } from './hex.ts'

/** 鍵盤図の 1 セル */
export type GridCell = {
  readonly code: KeyCode
  /** KEY_ROWS の添字（0 が数字段） */
  readonly row: number
  /** 段の中の左からの位置 */
  readonly col: number
  /** 格子上の x（セル幅単位。ROW_OFF[row] + col） */
  readonly gx: number
  /** 使う段の中での上からの順（0 が最上段） */
  readonly rowIndex: number
  /** 最下段からの段数（0 が最下段。奥行き係数の指数） */
  readonly stepsAboveBottom: number
  /** その配列での MIDI。空のキーは null */
  readonly midi: number | null
  /** 刻印（セルに出すキー文字。既定は QWERTY、getLayoutMap があればその文字。src/layout/legend.ts） */
  readonly label: string
  /** セル中心（CSS px） */
  readonly cx: number
  readonly cy: number
}

export type KeyboardGrid = {
  readonly layout: LayoutId
  /** セル径（外接円の半径、CSS px） */
  readonly R: number
  /** セル幅 √3·R */
  readonly hexW: number
  readonly rowsUsed: readonly number[]
  /** 幅の係数（セル幅単位。4 段 11.5、2 段 10.5） */
  readonly widthUnits: number
  /** 高さの係数（R 単位。4 段 6.5、2 段 3.5。§2.5 の k_n） */
  readonly heightUnits: number
  /** 鍵盤図の矩形（CSS px） */
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly cells: readonly GridCell[]
  readonly byCode: ReadonlyMap<KeyCode, GridCell>
}

/** 幅の係数（セル幅単位）: 使う段の gx の最大 − 最小 + 1（m0 kbW L220） */
export function widthUnits(rowsUsed: readonly number[]): number {
  if (rowsUsed.length === 0) throw new RangeError('grid: 使う段が無い')
  const cols = KEY_ROWS[0]?.length ?? 10
  let minGx = Number.POSITIVE_INFINITY
  let maxGx = Number.NEGATIVE_INFINITY
  for (const r of rowsUsed) {
    const off = ROW_OFF[r]
    if (off === undefined) throw new RangeError(`grid: 段 ${r} は 0〜3 の外`)
    if (off < minGx) minGx = off
    if (off + cols - 1 > maxGx) maxGx = off + cols - 1
  }
  return maxGx - minGx + 1
}

/** 高さの係数（R 単位）: 2 + 1.5·(段数 − 1)（m0 kbH L220。§2.5 の k_n） */
export function heightUnits(rowsUsed: readonly number[]): number {
  if (rowsUsed.length === 0) throw new RangeError('grid: 使う段が無い')
  return 2 + 1.5 * (rowsUsed.length - 1)
}

/**
 * 鍵盤図を組む。left・top は鍵盤図の矩形の左上（CSS px）。
 * セル中心: cx ＝ left + hexW·(gx − minGx + 0.5)、cy ＝ top + R + 1.5·R·rowIndex（m0 L236）。
 * rowsUsed は上の段が先の順に並べ直す（プリセットの rowsUsed は既にその順）。
 */
export function buildKeyboardGrid(
  layout: LayoutId,
  R: number,
  origin: { readonly left: number; readonly top: number },
  legend: Legend = QWERTY_LEGEND,
): KeyboardGrid {
  if (!(R > 0)) throw new RangeError(`grid: R ${R} は正の数でない`)
  const preset = LAYOUTS[layout]
  const rowsUsed = [...preset.rowsUsed].sort((a, b) => a - b)
  const hexW = SQ3 * R
  const wU = widthUnits(rowsUsed)
  const hU = heightUnits(rowsUsed)
  const minGx = Math.min(...rowsUsed.map((r) => gridX({ row: r, col: 0 })))
  const cells: GridCell[] = []
  rowsUsed.forEach((row, rowIndex) => {
    const codes = KEY_ROWS[row] ?? []
    codes.forEach((code, col) => {
      const gx = gridX({ row, col })
      cells.push({
        code,
        row,
        col,
        gx,
        rowIndex,
        stepsAboveBottom: rowsUsed.length - 1 - rowIndex,
        midi: midiOf(layout, code),
        label: legend.get(code) ?? QWERTY_LEGEND.get(code) ?? code,
        cx: origin.left + hexW * (gx - minGx + 0.5),
        cy: origin.top + R + 1.5 * R * rowIndex,
      })
    })
  })
  return {
    layout,
    R,
    hexW,
    rowsUsed,
    widthUnits: wU,
    heightUnits: hU,
    left: origin.left,
    top: origin.top,
    width: wU * hexW,
    height: hU * R,
    cells,
    byCode: new Map(cells.map((c) => [c.code, c])),
  }
}
