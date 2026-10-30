import { describe, expect, it } from 'vitest'
import {
  GAP,
  GUTTER_X,
  KB_BOTTOM,
  PAD,
  PLAYER_DEFAULT,
  PLAYER_MIN,
  R_MAX,
  R_MIN,
  T0_MS,
  TRAVEL_MS,
  V_MIN,
  columnBox,
  computeSizing,
  sizeForViewport,
  visibleMs,
} from '../../../../src/render/hex/sizing.ts'
import { SQ3 } from '../../../../src/render/hex/hex.ts'
import { LAYOUTS } from '../../../../src/layout/presets.ts'
import type { Sizing } from '../../../../src/render/hex/sizing.ts'

// src/render/hex/sizing.ts。出どころ: design.md §2.5（2026-10-30 改訂）、decisions #24（仮）、
// docs/planning/consult/A-sizing.md、docs/tests-inventory.md 手順 4 の行。
// 視口は innerWidth × innerHeight（CSS px）。前提の 3 画面 1366×768／1280×720／1093×614@125% の内側は
// 高さ −100（m0 CHROME L193）で 1366×668／1280×620／1093×514。右列の箱は 850×644／764×596／577×490。
// 期待値は相談 A の表を主担当が node で別計算して固定した（丸め: v は 4 桁、kbW は 1 桁、可視時間は ms 整数）。

const ABLETON = LAYOUTS.ableton.rowsUsed
const VMPK = LAYOUTS.vmpk.rowsUsed
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4
const r1 = (x: number): number => Math.round(x * 10) / 10

type Row = {
  vp: [number, number]
  layout: 'ableton' | 'vmpk'
  R: number
  kbW: number
  kbH: number
  D: number
  v1500: number
  v1000: number
  top1500: number
  bot1500: number
  top1000: number
  bot1000: number
}

/** 3 視口 × 2 配列（相談 A §4 の表） */
const TABLE: Row[] = [
  // prettier-ignore
  { vp: [1366, 668], layout: 'ableton', R: 28, kbW: 509.2, kbH: 98, D: 538, v1500: 0.3587, v1000: 0.538, top1500: 1578, bot1500: 1695, top1000: 1052, bot1000: 1130 },
  // prettier-ignore
  { vp: [1366, 668], layout: 'vmpk', R: 28, kbW: 557.7, kbH: 182, D: 454, v1500: 0.3027, v1000: 0.454, top1500: 1593, bot1500: 2009, top1000: 1062, bot1000: 1339 },
  // prettier-ignore
  { vp: [1280, 620], layout: 'ableton', R: 28, kbW: 509.2, kbH: 98, D: 490, v1500: 0.3267, v1000: 0.49, top1500: 1586, bot1500: 1714, top1000: 1057, bot1000: 1143 },
  // prettier-ignore
  { vp: [1280, 620], layout: 'vmpk', R: 28, kbW: 557.7, kbH: 182, D: 406, v1500: 0.2707, v1000: 0.406, top1500: 1603, bot1500: 2069, top1000: 1069, bot1000: 1379 },
  // prettier-ignore
  { vp: [1093, 514], layout: 'ableton', R: 28, kbW: 509.2, kbH: 98, D: 384, v1500: 0.256, v1000: 0.384, top1500: 1609, bot1500: 1773, top1000: 1073, bot1000: 1182 },
  // prettier-ignore
  { vp: [1093, 514], layout: 'vmpk', R: 27, kbW: 537.8, kbH: 175.5, D: 306.5, v1500: 0.2043, v1000: 0.3065, top1500: 1632, bot1500: 2227, top1000: 1088, bot1000: 1485 },
]

function size(vp: [number, number], layout: 'ableton' | 'vmpk', T: number): Sizing {
  return sizeForViewport({ w: vp[0], h: vp[1] }, LAYOUTS[layout].rowsUsed, T)
}

describe('定数（m0 L195–197、m1’ L372、decisions 既定値、§2.2）', () => {
  it('PAD 12・GAP 12・溝 16・鍵盤図の下 8・R 24〜28・v_min 0.2・T0 1500・T 1500／1000', () => {
    expect([PAD, GAP, GUTTER_X, KB_BOTTOM]).toEqual([12, 12, 16, 8])
    expect([R_MIN, R_MAX]).toEqual([24, 28])
    expect(V_MIN).toBe(0.2)
    expect(T0_MS).toBe(1500)
    expect(TRAVEL_MS).toEqual({ beginner: 1500, gamer: 1000 })
    expect(PLAYER_DEFAULT).toEqual({ w: 480, h: 270 })
    expect(PLAYER_MIN).toEqual({ w: 356, h: 200 })
  })
})

describe('右列の箱 columnBox（m0 split L224）', () => {
  it('1366×668 → left 504・top 12・850×644。1280×620 → 764×596。1093×514 → 577×490', () => {
    expect(columnBox({ w: 1366, h: 668 })).toEqual({ left: 504, top: 12, width: 850, height: 644 })
    expect(columnBox({ w: 1280, h: 620 })).toEqual({ left: 504, top: 12, width: 764, height: 596 })
    expect(columnBox({ w: 1093, h: 514 })).toEqual({ left: 504, top: 12, width: 577, height: 490 })
  })

  it('プレイヤー 356×200 では幅が +124、高さは変わらない。小数は floor', () => {
    expect(columnBox({ w: 1366, h: 668 }, PLAYER_MIN)).toEqual({
      left: 380,
      top: 12,
      width: 974,
      height: 644,
    })
    expect(columnBox({ w: 1366.7, h: 668.9 })).toEqual({
      left: 504,
      top: 12,
      width: 850,
      height: 644,
    })
  })
})

describe('3 視口 × 2 配列 × 2 プロファイル（§2.5 の表。1093×vmpk だけ R 27）', () => {
  for (const row of TABLE) {
    const name = `${row.vp[0]}×${row.vp[1]} ${row.layout}`
    it(`${name}: R ${row.R}、kbH ${row.kbH}、D ${row.D}、v ${row.v1500}／${row.v1000}`, () => {
      const s15 = size(row.vp, row.layout, 1500)
      const s10 = size(row.vp, row.layout, 1000)
      expect(s15.R).toBe(row.R)
      expect(s10.R).toBe(row.R) // R はプロファイルで変わらない
      expect(s15.kbH).toBe(row.kbH)
      expect(r1(s15.kbW)).toBe(row.kbW)
      expect(s15.D).toBe(row.D)
      expect(s10.D).toBe(row.D)
      expect(r4(s15.v)).toBe(row.v1500)
      expect(r4(s10.v)).toBe(row.v1000)
      expect(s15.v).toBe(row.D / 1500)
      expect(s10.v).toBe(row.D / 1000)
      expect(s15.travelMs).toBe(1500)
      expect(s10.travelMs).toBe(1000)
      expect(s15.limited).toBeNull()
      expect(s10.limited).toBeNull()
      expect(s15.player).toEqual(PLAYER_DEFAULT)
      // 鍵盤図は箱の下端から 8 px 上、落下域の上端は箱の上端
      expect(s15.kbTop).toBe(s15.box.top + s15.box.height - 8 - row.kbH)
      expect(s15.fallTop).toBe(12)
      expect(s15.kbTop - s15.fallTop).toBe(row.D)
      // 左右対称に置く
      expect(s15.kbLeft - s15.box.left).toBeCloseTo(
        s15.box.left + s15.box.width - (s15.kbLeft + s15.kbW),
        9,
      )
    })

    it(`${name}: 可視時間 上段／最下段 ${row.top1500}／${row.bot1500} ms（1.5 s）、${row.top1000}／${row.bot1000}（1.0 s）。全段 ≥ T`, () => {
      const n = LAYOUTS[row.layout].rowsUsed.length
      const s15 = size(row.vp, row.layout, 1500)
      const s10 = size(row.vp, row.layout, 1000)
      expect(Math.round(visibleMs(s15, 0))).toBe(row.top1500)
      expect(Math.round(visibleMs(s15, n - 1))).toBe(row.bot1500)
      expect(Math.round(visibleMs(s10, 0))).toBe(row.top1000)
      expect(Math.round(visibleMs(s10, n - 1))).toBe(row.bot1000)
      for (let i = 0; i < n; i++) {
        expect(visibleMs(s15, i)).toBeGreaterThanOrEqual(1500)
        expect(visibleMs(s10, i)).toBeGreaterThanOrEqual(1000)
      }
    })
  }

  it('係数は 2 段 10.5／3.5、4 段 11.5／6.5。R_w・R_h の参考値（2 桁）', () => {
    const a = size([1366, 668], 'ableton', 1500)
    const v = size([1093, 514], 'vmpk', 1500)
    expect([a.widthUnits, a.heightUnits]).toEqual([10.5, 3.5])
    expect([v.widthUnits, v.heightUnits]).toEqual([11.5, 6.5])
    expect(Math.round(a.rW * 100) / 100).toBe(44.98)
    expect(a.rH).toBe(96)
    expect(Math.round(v.rW * 100) / 100).toBe(27.36)
    expect(v.rH).toBe(28)
  })
})

describe('境界（vmpk・1.5 s。R_h の整数商は正確、D は 0.5 刻み）', () => {
  const vmpk = (w: number, h: number, T = 1500): Sizing => sizeForViewport({ w, h }, VMPK, T)

  it('内側の高さ 514 → R_h 28 ちょうど・D 300・v 0.2（R 28、1366 幅）。513 → R_h 27.85 → R 27・D 305.5', () => {
    const s = vmpk(1366, 514)
    expect(s.rH).toBe(28)
    expect(s.R).toBe(28)
    expect(s.D).toBe(300)
    expect(s.v).toBe(0.2)
    expect(s.limited).toBeNull()
    const t = vmpk(1366, 513)
    expect(Math.round(t.rH * 100) / 100).toBe(27.85)
    expect(t.R).toBe(27)
    expect(t.D).toBe(305.5)
    expect(r4(t.v)).toBe(0.2037)
  })

  it('488 → R_h 24・R 24・D 300・v 0.2・limited なし。487 → R 24・D 299・limited height・v 0.2・T 1495・可視 上段 1615。プレイヤーは 480×270 のまま', () => {
    const s = vmpk(1366, 488)
    expect(s.rH).toBe(24)
    expect(s.R).toBe(24)
    expect(s.D).toBe(300)
    expect(s.v).toBe(0.2)
    expect(s.travelMs).toBe(1500)
    expect(s.limited).toBeNull()
    expect(s.player).toEqual(PLAYER_DEFAULT)
    const t = vmpk(1366, 487)
    expect(t.R).toBe(24)
    expect(t.D).toBe(299)
    expect(t.limited).toBe('height')
    expect(t.v).toBe(0.2)
    expect(t.travelMs).toBe(1495)
    // 高さだけの不足ではプレイヤーを縮めない（縮めても高さは変わらない）
    expect(t.player).toEqual(PLAYER_DEFAULT)
    expect(t.box.width).toBe(850)
    expect(visibleMs(t, 0)).toBe(1615)
    expect(visibleMs(t, 0)).toBeGreaterThanOrEqual(t.travelMs)
  })

  it('470 → D 282。1.5 s は v 0.2・T 1410（可視 1530／2070）、1.0 s は D/T 0.282 ≥ v_min なので v 0.282・T 1000（limited height のまま）', () => {
    const s = vmpk(1366, 470)
    expect(s.R).toBe(24)
    expect(s.D).toBe(282)
    expect(s.limited).toBe('height')
    expect(s.v).toBe(0.2)
    expect(s.travelMs).toBe(1410)
    expect(s.player).toEqual(PLAYER_DEFAULT)
    expect(s.box.width).toBe(850)
    expect(visibleMs(s, 0)).toBe(1530)
    expect(visibleMs(s, 3)).toBe(2070)
    // 1.0 s: v ＝ max(D/T, v_min) ＝ 0.282 なので T は縮まない（T より長くはならない）
    const g = vmpk(1366, 470, 1000)
    expect(g.limited).toBe('height')
    expect(g.v).toBe(0.282)
    expect(g.travelMs).toBe(1000)
  })

  it('箱の高さが R 24 の鍵盤図（8 + 6.5·24 ＝ 164）以下なら RangeError。165 → D 1・v 0.2・T 5', () => {
    expect(() => vmpk(1366, 164 + 24)).toThrow(RangeError)
    const s = vmpk(1366, 165 + 24)
    expect(s.box.height).toBe(165)
    expect(s.R).toBe(24)
    expect(s.D).toBe(1)
    expect(s.limited).toBe('height')
    expect(s.v).toBe(0.2)
    expect(s.travelMs).toBe(5)
  })

  it('幅 1000 → R_w 22.69 でプレイヤー 356×200 に縮小 → 箱 608・R_w 28.92・R 28。幅 900 → 縮小後 R_w 23.90・R 24・limited width', () => {
    const s = vmpk(1000, 668)
    expect(s.player).toEqual(PLAYER_MIN)
    expect(s.box.width).toBe(608)
    expect(Math.round(s.rW * 100) / 100).toBe(28.92)
    expect(s.R).toBe(28)
    expect(s.limited).toBeNull()
    expect(s.D).toBe(454)
    const t = vmpk(900, 668)
    expect(t.player).toEqual(PLAYER_MIN)
    expect(t.box.width).toBe(508)
    expect(Math.round(t.rW * 100) / 100).toBe(23.9)
    expect(t.R).toBe(24)
    expect(t.limited).toBe('width')
    expect(t.D).toBe(480)
    expect(t.v).toBe(0.32)
    expect(t.travelMs).toBe(1500)
    // 溝（16 px）を食う
    expect(t.kbLeft - t.box.left).toBeLessThan(GUTTER_X)
  })

  it('最初から 356×200 より小さいプレイヤー（300×150、幅 900）を渡しても拡大せず素通し: 箱 564・R 26', () => {
    const s = sizeForViewport({ w: 900, h: 668 }, VMPK, 1500, { w: 300, h: 150 })
    expect(s.player).toEqual({ w: 300, h: 150 })
    expect(s.box.width).toBe(564)
    expect(s.R).toBe(26)
    expect(s.limited).toBeNull()
  })

  it('幅 900・ableton → 縮小後 R_w 26.17・R 26（28 を割っただけでは何もしない）', () => {
    const s = sizeForViewport({ w: 900, h: 668 }, ABLETON, 1500)
    expect(s.player).toEqual(PLAYER_MIN)
    expect(Math.round(s.rW * 100) / 100).toBe(26.17)
    expect(s.R).toBe(26)
    expect(s.limited).toBeNull()
    expect(s.D).toBe(545)
  })

  it('幅と高さの両方が足りないときは limited height。幅側（箱 508・溝を食う）と高さ側（D 282・v 0.2・T 1410）の帰結は両方出る', () => {
    const s = vmpk(900, 470)
    expect(s.R).toBe(24)
    expect(s.limited).toBe('height')
    expect(s.player).toEqual(PLAYER_MIN)
    expect(s.box.width).toBe(508)
    expect(s.kbLeft - s.box.left).toBeLessThan(GUTTER_X)
    expect(s.D).toBe(282)
    expect(s.v).toBe(0.2)
    expect(s.travelMs).toBe(1410)
  })

  it('大きな画面（1920×980）でも R は 28 で止まる', () => {
    const s = vmpk(1920, 980)
    expect(s.R).toBe(28)
    expect(s.D).toBe(956 - 8 - 182)
    expect(s.limited).toBeNull()
  })
})

describe('computeSizing（箱を直接渡す）', () => {
  it('850×644・vmpk・T 1500 は sizeForViewport(1366×668) と同じ', () => {
    const box = { left: 504, top: 12, width: 850, height: 644 }
    expect(computeSizing(box, VMPK, 1500)).toEqual(size([1366, 668], 'vmpk', 1500))
  })

  it('箱が小さくてもプレイヤーは縮めない（その判断は sizeForViewport）', () => {
    const s = computeSizing({ left: 0, top: 0, width: 484, height: 644 }, VMPK, 1500)
    expect(s.player).toEqual(PLAYER_DEFAULT)
    expect(s.R).toBe(24)
    expect(s.limited).toBe('width')
    expect(s.kbW).toBeCloseTo(11.5 * SQ3 * 24, 9)
  })

  it('T が 0 以下なら RangeError', () => {
    const box = { left: 0, top: 0, width: 850, height: 644 }
    expect(() => computeSizing(box, VMPK, 0)).toThrow(RangeError)
  })
})
