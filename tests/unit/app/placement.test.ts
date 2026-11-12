import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bandOutside, type Box } from '../../../src/app/bands.ts'
import {
  BAND_GAP,
  COLUMN_GAP,
  SIZE_NOTE_CUT,
  SIZE_NOTE_SLOW,
  bandsFit,
  columnRows,
  placementOf,
  playerPoints,
  sizeNote,
} from '../../../src/app/placement.ts'
import { stageOf, type Stage } from '../../../src/app/stage.ts'
import { LAYOUTS } from '../../../src/layout/presets.ts'
import { regionsOf } from '../../../src/render/canvas/primitives.ts'
import {
  HISPEEDS,
  PAD,
  PLAYER_DEFAULT,
  TRAVEL_MS,
  columnBox,
  computeSizing,
  travelWithHispeed,
} from '../../../src/render/hex/sizing.ts'
import type { LayoutId } from '../../../src/shared/types.ts'
import { moreThanHalfVisible } from '../../../src/youtube/visible.ts'

// src/app/placement.ts（M3 の手順 3、M3-01 後半＋M3-02、仮）。出どころ: m3-kickoff 手順 3 の期待値 (1)〜(7)・(10)・(11)
// （2026-11-11・12 に実物の stageOf と原型で検算した値）・§7-20・§7-21、design §1.3 S2 L79・§2.5 L129–130・§2.9 L149・§5.4
// L268–269、decisions #24 (e)・#27 (b)(d)・#65 (b)。描画 ⊂ canvas ⊂ 矩形の外を、式（(2)(3)）と、式と CSS の結び目（(11)）で見る。
// 左列の行の高さは styles.css の値から組む（行高の定数は持たない）。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const css = readFileSync(path.join(root, 'src', 'app', 'styles.css'), 'utf8')

/** styles.css の 1 つの規則の宣言（セレクタは完全一致。コメントは除く） */
function rule(selector: string): Record<string, string> {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = new RegExp(
    `(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
  )
  const m = re.exec(text)
  if (m === null) throw new Error(`styles.css に ${selector} が無い`)
  const out: Record<string, string> = {}
  for (const d of (m[2] ?? '').split(';')) {
    const i = d.indexOf(':')
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim()
  }
  return out
}
const px = (v: string | undefined): number => {
  const m = /^(-?[\d.]+)px$/.exec(v ?? '')
  if (m === null) throw new Error(`px でない: ${v}`)
  return Number(m[1])
}

const VIEWPORTS = [
  { w: 1366, h: 668 },
  { w: 1280, h: 620 },
  { w: 1093, h: 514 },
] as const
const box = (left: number, top: number, right: number, bottom: number): Box => ({
  left,
  top,
  right,
  bottom,
})
const at = (
  vp: { w: number; h: number },
  id: LayoutId = 'ableton',
  T: number = TRAVEL_MS.beginner,
): Stage => stageOf(vp, LAYOUTS[id].rowsUsed, T)

describe('配置モデル placementOf（期待値 (1)）', () => {
  it('3 視口: 矩形 {12, 12, 492, 282}・左列 {12, 12, 492, 視口高 − 12}・canvas ＝ 右列の箱、矩形と canvas の隙間 12', () => {
    const got = VIEWPORTS.map((vp) => placementOf(vp, at(vp)))
    expect(got[0]).toEqual({ player: box(12, 12, 492, 282), left: box(12, 12, 492, 656), canvas: box(504, 12, 1354, 656) })
    expect(got[1]?.canvas).toEqual(box(504, 12, 1268, 608))
    expect(got[1]?.left.bottom).toBe(608)
    expect(got[2]?.left.bottom).toBe(502)
    expect(got[2]?.canvas).toEqual(box(504, 12, 1081, 502))
    for (const p of got) expect(p.canvas.left - p.player.right).toBe(12)
  }) // prettier-ignore
})

describe('機械検査（期待値 (2)・(3)・(7)。4 配列 × 幅 300〜2000 × 高さ 100〜1200〔7 px 刻み〕）', () => {
  it('1,075,032 通り: RangeError 62,937、残りで canvas ∩ 矩形 0・canvas ∩ 左列 0・隙間は全部 12。領域 ⊂ canvas は kbW ≤ 箱の幅の 682,010 で外 0、超える 330,085 は全部外。356×200 は全部 R_w ＜ 24 で、高さだけ足りない 170,237 は縮めない', { timeout: 60_000 }, () => {
    const c = { n: 0, err: 0, hitPlayer: 0, hitLeft: 0, gap: 0, fitN: 0, fitOut: 0, wideN: 0, wideOut: 0, shrunk: 0, shrunkNotW: 0, hOnly: 0, hOnlyShrunk: 0 }
    for (const id of Object.keys(LAYOUTS) as LayoutId[]) {
      const rows = LAYOUTS[id].rowsUsed
      for (let w = 300; w <= 2000; w++)
        for (let h = 100; h <= 1200; h += 7) {
          c.n++
          let st: Stage
          try {
            st = stageOf({ w, h }, rows, TRAVEL_MS.beginner)
          } catch (e) {
            if (!(e instanceof RangeError)) throw e
            c.err++
            continue
          }
          const pl = placementOf({ w, h }, st)
          if (!bandOutside(pl.canvas, pl.player)) c.hitPlayer++
          if (!bandOutside(pl.canvas, pl.left)) c.hitLeft++
          if (pl.canvas.left - pl.player.right !== PAD) c.gap++
          // 領域（箱の座標）が canvas の箱の中か
          const b = st.box
          const r = regionsOf(st.sizing)
          const inBox = [r.fall, r.keys].every((q) => q.x >= 0 && q.y >= 0 && q.x + q.w <= b.width && q.y + q.h <= b.height)
          if (st.sizing.kbW <= b.width) {
            c.fitN++
            if (!inBox) c.fitOut++
          } else {
            c.wideN++
            if (!inBox) c.wideOut++
          }
          // 480×270 の箱で組んだ R_w・R_h（縮める前）
          const s0 = computeSizing(columnBox({ w, h }, PLAYER_DEFAULT), rows, TRAVEL_MS.beginner)
          if (st.player.w !== PLAYER_DEFAULT.w) {
            c.shrunk++
            if (!(s0.rW < 24)) c.shrunkNotW++
          }
          if (s0.rW >= 24 && Math.floor(s0.rH) < 24) {
            c.hOnly++
            if (st.player.w !== PLAYER_DEFAULT.w) c.hOnlyShrunk++
          }
        }
    }
    expect(c).toEqual({ n: 1_075_032, err: 62_937, hitPlayer: 0, hitLeft: 0, gap: 0, fitN: 682_010, fitOut: 0, wideN: 330_085, wideOut: 330_085, shrunk: 422_905, shrunkNotW: 0, hOnly: 170_237, hOnlyShrunk: 0 })
  }) // prettier-ignore

  it('(3) 反例 vmpk・800×380: keys の視口座標の左上 (344.98, 204) は矩形 {12, 12, 368, 212} の中、canvas の左端 380 は交差しない', () => {
    const st = at({ w: 800, h: 380 }, 'vmpk')
    const pl = placementOf({ w: 800, h: 380 }, st)
    expect(pl.player).toEqual(box(12, 12, 368, 212))
    expect(pl.canvas.left).toBe(380)
    expect(bandOutside(pl.canvas, pl.player)).toBe(true)
    const k = regionsOf(st.sizing).keys
    const keys = box(
      k.x + st.box.left,
      k.y + st.box.top,
      k.x + k.w + st.box.left,
      k.y + k.h + st.box.top,
    )
    expect(keys.left).toBeCloseTo(344.98, 2)
    expect(keys.top).toBe(204)
    expect(bandOutside(keys, pl.player)).toBe(false)
  })

  it('(7) vmpk・1366×380 は limited height で 480×270 のまま（R 24・v 0.2000・流れる時間 960）', () => {
    const st = at({ w: 1366, h: 380 }, 'vmpk')
    expect(st.player).toEqual(PLAYER_DEFAULT)
    expect(st.sizing.limited).toBe('height')
    expect(st.sizing.R).toBe(24)
    expect(st.sizing.v).toBeCloseTo(0.2, 9)
    expect(st.sizing.travelMs).toBeCloseTo(960, 9)
  })
})

describe('縮小の境と寸法の注記（期待値 (4)）', () => {
  it('vmpk・高さ 668: 幅 1027 → 480×270・canvas の左 504・R 24、1026 → 356×200・380・R 28、902 → limited width（kbW 478.05 ≤ 箱の幅 510 で注記なし）', () => {
    const p1027 = at({ w: 1027, h: 668 }, 'vmpk')
    expect(placementOf({ w: 1027, h: 668 }, p1027).player).toEqual(box(12, 12, 492, 282))
    expect(p1027.box.left).toBe(504)
    expect(p1027.sizing.R).toBe(24)
    const p1026 = at({ w: 1026, h: 668 }, 'vmpk')
    expect(placementOf({ w: 1026, h: 668 }, p1026).player).toEqual(box(12, 12, 368, 212))
    expect(p1026.box.left).toBe(380)
    expect(p1026.sizing.R).toBe(28)
    const p902 = at({ w: 902, h: 668 }, 'vmpk')
    expect(p902.sizing.limited).toBe('width')
    expect(p902.sizing.kbW).toBeCloseTo(478.05, 2)
    expect(p902.box.width).toBe(510)
    expect(sizeNote(p902.sizing, TRAVEL_MS.beginner)).toBe(null)
  })

  it('sizeNote（T 1,500）: 869×668・800×380 は切れの文、1366×380（流れる時間 960）は流れる時間の文、3 視口は null', () => {
    const T = TRAVEL_MS.beginner
    expect(at({ w: 869, h: 668 }, 'vmpk').box.width).toBe(477)
    expect(sizeNote(at({ w: 869, h: 668 }, 'vmpk').sizing, T)).toBe(SIZE_NOTE_CUT)
    expect(sizeNote(at({ w: 800, h: 380 }, 'vmpk').sizing, T)).toBe(SIZE_NOTE_CUT)
    expect(sizeNote(at({ w: 1366, h: 380 }, 'vmpk').sizing, T)).toBe(SIZE_NOTE_SLOW)
    for (const vp of VIEWPORTS) for (const id of ['ableton', 'vmpk'] as const) expect(sizeNote(at(vp, id).sizing, T)).toBe(null)
    expect([SIZE_NOTE_CUT, SIZE_NOTE_SLOW]).toEqual(['鍵盤図の端が切れています', '流れる時間を短くしています'])
  }) // prettier-ignore
})

describe('M3-02 の完了条件の読み替え（期待値 (5)）', () => {
  it('3 視口 × 4 配列 × 2 プロファイル × ハイスピード 4 段の 96 通りで limited null・480×270・流れる時間 ＝ T。v の最小 0.2043、R の最小 27', () => {
    let n = 0
    let vMin = Infinity
    let rMin = Infinity
    for (const vp of VIEWPORTS)
      for (const id of Object.keys(LAYOUTS) as LayoutId[])
        for (const profile of ['beginner', 'gamer'] as const)
          for (const hs of HISPEEDS) {
            const T = travelWithHispeed(TRAVEL_MS[profile], hs)
            const st = at(vp, id, T)
            n++
            expect(st.sizing.limited).toBe(null)
            expect(st.player).toEqual(PLAYER_DEFAULT)
            expect(st.sizing.travelMs).toBe(T)
            vMin = Math.min(vMin, st.sizing.v)
            rMin = Math.min(rMin, st.sizing.R)
          }
    expect(n).toBe(96)
    expect(Math.round(vMin * 10000) / 10000).toBe(0.2043)
    expect(rMin).toBe(27)
  })
})

describe('左列の縦の予算（期待値 (6)。行の高さは styles.css の値から組む）', () => {
  // 行の高さ（px）: 本文 16 px／1.6、HUD 13 px／1.6、精度の行 28 px／1.1、HUD の行の間 2、案内の行 ＝ 小さい釦の高さ
  const body = 16 * 1.6
  const hudFont = px(rule('.play .hud')['font-size'])
  const hudGap = px((rule('.play .hud')['gap'] ?? '').split(' ')[0])
  const big =
    px(rule('.play .hud dd.big')['font-size']) * Number(rule('.play .hud dd.big')['line-height'])
  const line = hudFont * 1.6
  const HUD = { beginner: 2 * line + big + 2 * hudGap, gamer: 4 * line + big + 4 * hudGap }
  const small = rule('button.small')
  const smallPad = px((small['padding'] ?? '').split(' ')[0])
  const button = px(small['font-size']) * 1.6 + 2 * smallPad + 2
  const statusRow = px(rule('.play .statusrow')['min-height'])
  const bandPad = px((rule('.band')['padding'] ?? '').split(' ')[0])
  const BAND = { button: Math.max(body, button) + 2 * bandPad + 2, ime: body + 2 * bandPad + 2 }
  const col = (vp: { h: number }): Box => box(12, 12, 492, vp.h - 12)
  const rest = (vp: { h: number }, profile: 'beginner' | 'gamer'): number =>
    columnRows(col(vp), [270, HUD[profile], statusRow]).rest
  const r1 = (x: number): number => Math.round(x * 10) / 10

  it('styles.css から組んだ行の高さ: HUD 入門者 76.4・音ゲー向け 122.0、案内の行 28.4、帯 42.4（釦の無い ime は 39.6）', () => {
    expect([hudFont, hudGap, big].map(r1)).toEqual([13, 2, 30.8])
    expect([r1(HUD.beginner), r1(HUD.gamer), statusRow, r1(button)]).toEqual([
      76.4, 122, 28.4, 28.4,
    ])
    expect([r1(BAND.button), r1(BAND.ime)]).toEqual([42.4, 39.6])
  })

  it('1093×514: 音ゲー向け 45.6（帯 1 本 42.4・残り 3.2）、入門者 91.2（2 本 90.8）。詰める前は音ゲー向けの待機 −7.2・演奏中 21.2、入門者 48.0・76.4', () => {
    const vp = { h: 514 }
    expect(r1(rest(vp, 'gamer'))).toBe(45.6)
    expect(r1(rest(vp, 'beginner'))).toBe(91.2)
    expect(bandsFit(rest(vp, 'gamer'), [BAND.button, BAND.button])).toBe(1)
    expect(r1(rest(vp, 'gamer') - BAND.button)).toBe(3.2)
    expect(bandsFit(rest(vp, 'beginner'), [BAND.button, BAND.button, BAND.button])).toBe(2)
    expect(r1(2 * BAND.button + BAND_GAP)).toBe(90.8)
    // 詰める前（HUD 16 px で 86.0・141.2、案内 25.6、「ホームへ」の行 28.4。待機の外も空の行が gap を取る）
    const before = (h: number, hud: number): number => r1(columnRows(col({ h }), [270, hud, 25.6, 28.4]).rest)
    expect([before(514, 141.2), before(514, 86.0)]).toEqual([-7.2, 48.0])
    expect(r1(columnRows(col(vp), [270, 141.2, 25.6, 0]).rest)).toBe(21.2)
    expect(r1(columnRows(col(vp), [270, 86.0, 25.6, 0]).rest)).toBe(76.4)
  }) // prettier-ignore

  it('1093×514 音ゲー向けの y: HUD 290〜412、案内の行 420〜448.4、帯 1 本 456.4〜498.8 ≤ 左列の下端 502', () => {
    const c = columnRows(col({ h: 514 }), [270, HUD.gamer, statusRow])
    expect(c.rows.map((b) => [b.top, r1(b.bottom)])).toEqual([[12, 282], [290, 412], [420, 448.4]])
    expect(r1(c.bands.top)).toBe(456.4)
    expect(r1(c.bands.top + BAND.button)).toBe(498.8)
    expect(c.bands.top + BAND.button).toBeLessThanOrEqual(502)
    expect(c.overflow).toBe(false)
  }) // prettier-ignore

  it('他の視口と境: 1280×620 は 151.6・197.2、1366×668 は 199.6・245.2。曲名 2 行なら 24.8。帯 1 本が入る視口高は音ゲー向け 510.8・入門者 465.2 以上。ime ＋ S7c の 2 本（88.0）は 45.6 に入らない', () => {
    expect([rest({ h: 620 }, 'gamer'), rest({ h: 620 }, 'beginner')].map(r1)).toEqual([151.6, 197.2])
    expect([rest({ h: 668 }, 'gamer'), rest({ h: 668 }, 'beginner')].map(r1)).toEqual([199.6, 245.2])
    expect(r1(columnRows(col({ h: 514 }), [270, HUD.gamer + line, statusRow]).rest)).toBe(24.8)
    const need = (profile: 'beginner' | 'gamer'): number => r1(514 - rest({ h: 514 }, profile) + BAND.button)
    expect([need('gamer'), need('beginner')]).toEqual([510.8, 465.2])
    expect(r1(BAND.ime + BAND_GAP + BAND.button)).toBe(88)
    expect(bandsFit(rest({ h: 514 }, 'gamer'), [BAND.ime, BAND.button])).toBe(1)
    expect(columnRows(col({ h: 400 }), [270, HUD.gamer, statusRow]).overflow).toBe(true)
  }) // prettier-ignore

  it('S0d（チュートリアル曲の箱 13 px の 6 行と余白 ＝ 132.8）は詰めた後も 1093×514 で溢れる（入門者 531.6／490・音ゲー向け 577.2／490。pane の実測も 532・577）', () => {
    const tutorial = 6 * line + 2 * 4
    expect(r1(tutorial)).toBe(132.8)
    const used = (profile: 'beginner' | 'gamer'): number => r1(490 - columnRows(col({ h: 514 }), [270, HUD[profile], statusRow, tutorial]).rest - COLUMN_GAP)
    expect([used('beginner'), used('gamer')]).toEqual([531.6, 577.2])
  }) // prettier-ignore

  it('S0d の案 A（m3-kickoff §7-21、2026-11-12 に利用者が採用）: 段階の並びを 1 行・吹き出しは待機中だけ・音ゲー向けも入門者の HUD → 1093×514 の待機は左列ちょうど 490.0（帯は入らない）、演奏中は余り 58.4 で帯 1 本（pane の実測も 490／490 と帯の下端 486.0）', () => {
    const idleBox = line + 4 + 3 * line + 4
    const playBox = line + 4
    expect([r1(idleBox), r1(playBox)]).toEqual([91.2, 24.8])
    const c = (box: number): number => r1(490 - columnRows(col({ h: 514 }), [270, HUD.beginner, statusRow, box]).rest - COLUMN_GAP)
    expect(c(idleBox)).toBe(490)
    const rest = columnRows(col({ h: 514 }), [270, HUD.beginner, statusRow, playBox]).rest
    expect(r1(rest)).toBe(58.4)
    expect(bandsFit(rest, [BAND.button, BAND.button])).toBe(1)
    expect(r1(columnRows(col({ h: 514 }), [270, HUD.beginner, statusRow, playBox]).bands.top + BAND.button)).toBe(486)
  }) // prettier-ignore
})

describe('半分超が可視と、矩形の 5 点（期待値 (10)）', () => {
  const rectOf = (b: Box): { left: number; top: number; width: number; height: number } => ({
    left: b.left,
    top: b.top,
    width: b.right - b.left,
    height: b.bottom - b.top,
  })
  const vis = (vp: { w: number; h: number }, id: LayoutId): boolean =>
    moreThanHalfVisible(
      rectOf(placementOf(vp, at(vp, id)).player),
      { width: vp.w, height: vp.h },
      true,
    )

  it('ableton・1366×147 → 偽（ちょうど半分）、1366×148 → 真、vmpk・1366×189 → 真、3 視口 → 真', () => {
    expect(vis({ w: 1366, h: 147 }, 'ableton')).toBe(false)
    expect(vis({ w: 1366, h: 148 }, 'ableton')).toBe(true)
    expect(vis({ w: 1366, h: 189 }, 'vmpk')).toBe(true)
    for (const vp of VIEWPORTS) expect(vis(vp, 'ableton')).toBe(true)
  })

  it('視口の中の点は 3 視口で 5 点、1366×147 で上の 2 隅 (13, 13)・(491, 13) だけ', () => {
    for (const vp of VIEWPORTS)
      expect(playerPoints(placementOf(vp, at(vp)).player, vp)).toHaveLength(5)
    const vp = { w: 1366, h: 147 }
    expect(playerPoints(placementOf(vp, at(vp)).player, vp)).toEqual([
      { x: 13, y: 13 },
      { x: 491, y: 13 },
    ])
  })

  it('角の丸い矩形（動画なしのカード、角丸 8 px）は隅の点を半径ぶん内へ寄せる（当たりの判定が丸みを除くため。pane で見つけた）', () => {
    const vp = VIEWPORTS[0]
    const p = placementOf(vp, at(vp)).player
    expect(playerPoints(p, vp, 8).slice(0, 4)).toEqual([
      { x: 20, y: 20 },
      { x: 484, y: 20 },
      { x: 20, y: 274 },
      { x: 484, y: 274 },
    ])
    expect(playerPoints(p, vp, 0)).toEqual(playerPoints(p, vp))
  })
})

describe('styles.css と式の突き合わせ（期待値 (11)）', () => {
  it('--pad ＝ 12px ＝ PAD、.play .left の left・top・bottom ＝ var(--pad)・gap ＝ 8px ＝ COLUMN_GAP、.bands の gap 6px ＝ BAND_GAP、.play .bands の overflow ＝ auto', () => {
    expect(px(rule(':root')['--pad'])).toBe(PAD)
    const left = rule('.play .left')
    expect([left['left'], left['top'], left['bottom']]).toEqual(['var(--pad)', 'var(--pad)', 'var(--pad)'])
    expect(px(left['gap'])).toBe(COLUMN_GAP)
    expect(px(rule('.bands')['gap'])).toBe(BAND_GAP)
    expect(rule('.play .bands')['overflow']).toBe('auto')
  }) // prettier-ignore
})
