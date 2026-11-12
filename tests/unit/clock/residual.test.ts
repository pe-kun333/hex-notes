import { describe, expect, it } from 'vitest'
import { clockTick, initialClock } from '../../../src/clock/clock-source.ts'
import { createDummyVideo, type DummyVideoOptions } from '../../../src/clock/dummy-video.ts'
import { residualOf, type ResidualFrame } from '../../../src/clock/residual.ts'

// src/clock/residual.ts（M3 の手順 2、仮）。出どころ: m3-kickoff 手順 2 の期待値 (10)（原型で検算した値。ダミー ＝ 15 ms
// 切り捨て・種 7・60 fps）・§7-5（対照の筋書き）、decisions #97、design §5.4 L270。tick の now は i × 1000 / 60（原型と同じ式。
// i × (1000/60) とは浮動小数の丸めで 3 桁目が動く）。

/** ダミーを時計に当ててフレームの列を作る（i ＝ first〜last。reportRate は標本の rate を書き換える〔対照の筋書き〕） */
function frames(
  o: { first?: number; last?: number; dummy?: DummyVideoOptions; reportRate?: number } = {},
): ResidualFrame[] {
  const d = createDummyVideo({ stepMs: 15, seed: 7, ...(o.dummy ?? {}) })
  let s = initialClock({ mode: 'video', t0: 0 })
  d.play(0)
  const out: ResidualFrame[] = []
  for (let i = o.first ?? 1; i <= (o.last ?? 1200); i++) {
    const now = (i * 1000) / 60
    const smp0 = d.sample(now)
    // 筋書きの側が標本を包む（dummyPort は変えない、§7-5）
    const smp = o.reportRate === undefined ? smp0 : { ...smp0, rate: o.reportRate }
    const r = clockTick(s, now, smp)
    s = r.state
    const rs = r.out.events.find((e) => e.kind === 'resync')
    out.push({
      now,
      raw: smp.timeMs,
      out: r.out.t,
      phase: r.out.phase,
      visible: smp.visible,
      resync: rs?.kind === 'resync' ? rs.reason : null,
      qHat: r.out.qHat,
    })
  }
  return out
}

describe('残差の道具（期待値 (10)）', () => {
  it('ダミー・16.7〜20,000 の 1,200 フレーム: n 1,020・直読み 4.28・補間後 0.08〜0.09・平均 ＋7.48（q̂ 14.99・偏り −0.02）・再アンカー 0・対照 0.05', () => {
    const r = residualOf(frames())
    if (r === null) throw new Error('数えたフレームが無い')
    expect(r.n).toBe(1020)
    expect(r.rawSd).toBeCloseTo(4.28, 2)
    expect(r.outSd).toBeGreaterThanOrEqual(0.08)
    expect(r.outSd).toBeLessThan(0.095)
    expect(r.outMean).toBeCloseTo(7.48, 2)
    expect(r.qHat).toBeCloseTo(14.99, 2)
    // 手順書の −0.02 は 2 桁に丸めた値
    expect(r.bias).toBeCloseTo(-0.015, 3)
    expect(r.resyncs).toBe(0)
    expect(r.ctlSd).toBeCloseTo(0.05, 2)
    // 補間後 ＜ 直読み（完了条件 (a)）。対照も直読みより小さい ＝ 大小だけでは良否を分けない
    expect(r.outSd).toBeLessThan(r.rawSd)
    expect(r.ctlSd).toBeLessThan(r.rawSd)
  })

  it('時刻の原点（0 から）で n が 1,021 に動く（3 桁目も動く）', () => {
    expect(residualOf(frames({ first: 0 }))?.n).toBe(1021)
  })

  it('対照の筋書き（動画は 1.001 倍で進み標本の rate は 1。40 秒 ＝ 2,400 フレーム）: 直読み 4.32・補間後 0.23・対照 10.70・傾き 1.00098', () => {
    const r = residualOf(frames({ last: 2400, dummy: { rate: 1.001 }, reportRate: 1 }))
    if (r === null) throw new Error('数えたフレームが無い')
    expect(r.rawSd).toBeCloseTo(4.32, 2)
    // 手順書の 0.23 は 2 桁に丸めた値
    expect(r.outSd).toBeCloseTo(0.226, 3)
    expect(r.ctlSd).toBeCloseTo(10.7, 1)
    expect(r.slope).toBeCloseTo(1.00098, 5)
    // 補間後 ＜ 1 ms かつ 対照 ＞ 直読み（§7-5）
    expect(r.outSd).toBeLessThan(1)
    expect(r.ctlSd).toBeGreaterThan(r.rawSd)
  })

  it('数えたフレームが 2 未満なら null（再アンカーから 3,000 ms の間・locked でない）', () => {
    expect(residualOf(frames({ last: 180 }))).toBe(null)
    expect(residualOf([])).toBe(null)
  })
})
