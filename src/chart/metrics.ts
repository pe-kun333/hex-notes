// 難度 4 軸（M1-01、M1 の手順 6 で作り、手順 8 の S1 が出す）。出どころ: design.md §2.4（密度・跳躍・同時押し率・段またぎ率、
// 注意の目安は密度 > 3.5・最大跳躍 ≥ 6）、m1-kickoff §7-9（定義、仮）・手順 8 の期待値（フィクスチャ 6 曲の密度）。
// 譜面版ごとに計算する純関数（Variant.metrics に書く。小数 3 桁に丸める）。
// 定義（仮）: 密度 ＝ 譜面版で鍵のある音の数 ／ 曲の長さの秒（譜面の最終ノートの終わりまで、落ちた音も含む）。跳躍 ＝ 鍵の
// ある音を tick ごとに束ね、隣り合う tick の最上声（音高の最も高い鍵）どうしの六角距離の平均（leap）と最大（leapMax）。
// 同時押し率 ＝ 2 音以上の tick ／ 鍵のある tick。段またぎ率 ＝ 隣り合う tick の最上声の段が違う組 ／ 組。
// 和音どうしの跳躍を最上声で見るのは、上限を超えた和音でも最上声を残す（§2.4）のと揃えたため（m1-kickoff §7-9 の
// 「同 tick は次の tick との組」の読み）。

import { buildMsTable } from './mstable.ts'
import { keyPosition, midiOf } from '../layout/presets.ts'
import { hexDist } from '../render/hex/hex.ts'
import type { Chart, KeyCode, Metrics, Variant } from '../shared/types.ts'

/** 注意の目安（§2.4、仮）。S1 のカード（app/home-view.ts）と S5 の注意（chart/import.ts の cautions）が共有する */
export const DENSITY_CAUTION = 3.5
export const LEAP_CAUTION = 6

const round3 = (x: number): number => Math.round(x * 1000) / 1000

/** 鍵のある tick の最上声（tick の昇順） */
function topVoices(chart: Pick<Chart, 'notes' | 'pulse'>, v: Variant): { tick: number; code: KeyCode; size: number }[] {
  const byTick = new Map<number, { code: KeyCode; midi: number; size: number }>()
  chart.notes.forEach((n, i) => {
    const code = v.keys[i]
    if (code === null || code === undefined) return
    const tick = Math.round(n.beat * chart.pulse.resolution)
    const midi = midiOf(v.layout, code) ?? n.midi
    const cur = byTick.get(tick)
    if (cur === undefined) byTick.set(tick, { code, midi, size: 1 })
    else byTick.set(tick, midi > cur.midi ? { code, midi, size: cur.size + 1 } : { ...cur, size: cur.size + 1 })
  })
  return [...byTick.entries()].sort((a, b) => a[0] - b[0]).map(([tick, x]) => ({ tick, code: x.code, size: x.size }))
} // prettier-ignore

export function variantMetrics(chart: Pick<Chart, 'notes' | 'pulse'>, v: Variant): Metrics {
  const ms = buildMsTable(chart.pulse)
  const endMs = chart.notes.reduce((m, n) => Math.max(m, ms.beatToMs(n.beat + n.dur)), 0)
  const keyed = v.keys.filter((k) => k !== null && k !== undefined).length
  const tops = topVoices(chart, v)
  let leapSum = 0
  let leapMax = 0
  let cross = 0
  let pairs = 0
  for (let i = 1; i < tops.length; i++) {
    const a = keyPosition(tops[i - 1]?.code ?? '')
    const b = keyPosition(tops[i]?.code ?? '')
    if (a === null || b === null) continue
    const d = hexDist(a, b)
    leapSum += d
    leapMax = Math.max(leapMax, d)
    if (a.row !== b.row) cross++
    pairs++
  }
  return {
    density: endMs > 0 ? round3(keyed / (endMs / 1000)) : 0,
    leap: pairs > 0 ? round3(leapSum / pairs) : 0,
    leapMax,
    chord: tops.length > 0 ? round3(tops.filter((t) => t.size >= 2).length / tops.length) : 0,
    rowCross: pairs > 0 ? round3(cross / pairs) : 0,
  }
}
