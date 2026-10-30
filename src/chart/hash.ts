// 譜面 id の canonical JSON と SHA-256（M0-02 前半、手順 2）。出どころ: docs/design.md §3.3、m0-kickoff.md §2 手順 2。
// 対象は {format, notes[midi,beat,dur], pulse.resolution, pulse.tempo} だけ。キー順固定・空白なし・小数 4 桁。
// 丸めは JS の Math.round(x * 1e4) / 1e4（m5 r4 L416 と同じ式。kickoff §7-6「四捨五入か切り捨てか」を手順 2 で
// 四捨五入に決めた。decisions.md への記載は未済）。2 進浮動小数なので 10 進の四捨五入とは端で違う
// （1.00005 → 1.0001、0.00015 → 0.0001）。他言語で id を再計算するときも同じ式を使う。
// SHA-256 は globalThis.crypto.subtle（Node 24・ブラウザ共通。http の LAN では無いので localhost か HTTPS で開く）。
// グローバル状態なし。DOM・Node のどちらにも触れない（tools/ からも import する）。

import type { Chart } from '../shared/types.ts'

/** id の計算に要る部分だけ（Chart 全体でなくてもよい） */
export type ChartIdInput = Pick<Chart, 'format' | 'notes' | 'pulse'>

/** 小数 4 桁に四捨五入（design.md §3.3「小数 4 桁」）。-0 は 0 にする */
export function round4(x: number): number {
  const r = Math.round(x * 1e4) / 1e4
  return r === 0 ? 0 : r
}

/** canonical JSON に書く数値。有限でなければ JSON が null になり id が無意味なので止める */
function num(x: number, where: string): number {
  if (!Number.isFinite(x)) throw new RangeError(`canonicalJson: ${where} が有限の数でない: ${x}`)
  return round4(x)
}

/**
 * canonical JSON。順は format → notes（midi → beat → dur）→ pulse（resolution → tempo（beat → bpm））。
 * notes は入力の順のまま（正規化で並べ替えた後に掛ける前提）。vel・track・timeSig などは含めない。
 */
export function canonicalJson(input: ChartIdInput): string {
  const notes = input.notes.map((n, i) => ({
    midi: num(n.midi, `notes[${i}].midi`),
    beat: num(n.beat, `notes[${i}].beat`),
    dur: num(n.dur, `notes[${i}].dur`),
  }))
  const tempo = input.pulse.tempo.map((t, i) => ({
    beat: num(t.beat, `pulse.tempo[${i}].beat`),
    bpm: num(t.bpm, `pulse.tempo[${i}].bpm`),
  }))
  return JSON.stringify({
    format: input.format,
    notes,
    pulse: { resolution: num(input.pulse.resolution, 'pulse.resolution'), tempo },
  })
}

/** 文字列を UTF-8 にして SHA-256。小文字 16 進 64 桁。crypto.subtle が無い（安全でない文脈）なら Error */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('crypto.subtle が無い（HTTPS か localhost で開く）')
  const bytes = new TextEncoder().encode(text)
  const digest = await subtle.digest('SHA-256', bytes)
  let hex = ''
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0')
  return hex
}

/** "sha256:" + canonical JSON の SHA-256（design.md §3.3） */
export async function computeChartId(input: ChartIdInput): Promise<string> {
  return 'sha256:' + (await sha256Hex(canonicalJson(input)))
}

/** chart.id が中身と合うか */
export async function verifyChartId(chart: ChartIdInput & { id: string }): Promise<boolean> {
  return (await computeChartId(chart)) === chart.id
}
