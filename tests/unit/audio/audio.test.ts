import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  KEYCLICK_GAIN,
  KEYCLICK_MS,
  keyclickFor,
  keyclickPeak,
} from '../../../src/audio/keyclick.ts'
import { beatClicks } from '../../../src/audio/metronome.ts'
import { SAMPLE_RELEASE_S, nearestSample, parseManifest } from '../../../src/audio/sampler.ts'
import {
  LATE_BAND_MS,
  LATE_DROP_MS,
  LOOKAHEAD_MS,
  PUMP_MS,
  initialScheduler,
  lateBand,
  pumpSchedule,
  seekSchedule,
  soundItems,
  type SoundItem,
} from '../../../src/audio/scheduler.ts'
import {
  SYNTH_PARTIALS,
  brightness,
  midiToHz,
  noiseSamples,
  synthPlan,
  vel01,
} from '../../../src/audio/synth.ts'
import type { AudioBridge } from '../../../src/clock/audio-bridge.ts'
import type { Chart, Pulse } from '../../../src/shared/types.ts'

// src/audio/。出どころ: m5 `playNoteAt` L443–447・`clickAt` L448・`tapTick` L449・`pump` L461–464（行番号で切り出して照合）、
// design.md §2.9・§4.1、kickoff 手順 10 の期待値（midi 69 → 440 Hz）、decisions #46〜#48（仮）。AudioContext は作らない。

const M5 = readFileSync(
  fileURLToPath(new URL('../../../docs/planning/mocks/m5-song-import.html', import.meta.url)),
  'utf8',
).split('\n')

function m5Line(n: number, head: string): string {
  const s = M5[n - 1] ?? ''
  if (!s.trimStart().startsWith(head)) throw new Error(`モックの行がずれた: m5 L${n}`)
  return s
}

describe('合成音 synth', () => {
  it('midi 69 → 440 Hz（m5 L443）、60 → 261.63、81 → 880', () => {
    expect(midiToHz(69)).toBe(440)
    expect(midiToHz(60)).toBeCloseTo(261.6256, 4)
    expect(midiToHz(81)).toBeCloseTo(880, 9)
  })

  it('倍音・明るさ・減衰・振幅は m5 L444–446 の式と同じ（midi 21〜108、vel 0.3〜1、長さ 0.2〜2.5 s）', () => {
    const l444 = m5Line(444, 'const bright =')
    const l445 = m5Line(445, 'for (const [h, a] of partials)')
    const decay = /const decay = ([^;]+);/.exec(l445)?.[1] ?? ''
    const peak =
      /linearRampToValueAtTime\(([^,]+),/.exec(m5Line(446, 'g.gain.setValueAtTime(0, t);'))?.[1] ??
      ''
    const ref = new Function(
      'midi',
      'vel',
      'dur',
      `${l444}\nreturn { bright, parts: partials.map(([h, a]) => ({ decay: ${decay}, peak: ${peak} })), partials }`,
    ) as (
      m: number,
      v: number,
      d: number,
    ) => {
      bright: number
      parts: { decay: number; peak: number }[]
      partials: number[][]
    }
    expect(SYNTH_PARTIALS.map((p) => [...p])).toEqual(ref(60, 1, 1).partials)
    for (const midi of [21, 48, 60, 69, 84, 108])
      for (const v of [0.3, 0.63, 1])
        for (const d of [0.2, 1, 2.5]) {
          const r = ref(midi, v, d)
          const p = synthPlan(midi, v, d)
          expect(brightness(midi)).toBeCloseTo(r.bright, 12)
          p.partials.forEach((q, i) => {
            expect(q.decayS).toBeCloseTo(r.parts[i]?.decay ?? NaN, 12)
            expect(q.peak).toBeCloseTo(r.parts[i]?.peak ?? NaN, 12)
          })
          expect(p.stopS).toBeCloseTo(Math.max(...r.parts.map((x) => x.decay)) + 0.05, 12)
        }
  })

  it('雑音: 帯域 2·f（上限 12 kHz）・振幅 vel·0.08、標本は種で決まり指数で減る', () => {
    expect(synthPlan(60, 1, 1).noise).toEqual({ gain: 0.08, bandHz: midiToHz(60) * 2 })
    expect(synthPlan(108, 0.5, 1).noise.bandHz).toBeCloseTo(midiToHz(108) * 2, 9)
    expect(synthPlan(120, 0.5, 1).noise.bandHz).toBe(12000)
    const a = noiseSamples()
    expect(a.length).toBe(2205)
    expect([...a]).toEqual([...noiseSamples()])
    const head = Math.max(...[...a.slice(0, 100)].map(Math.abs))
    const tail = Math.max(...[...a.slice(2000)].map(Math.abs))
    expect(tail).toBeLessThan(head * 0.01)
  })

  it('長さは 2.5 s で切る（m5 pump の min(2.5, dur＋0.3)）。vel 0–127 → 0..1', () => {
    expect(synthPlan(60, 1, 10).partials[0]?.decayS).toBeCloseTo(
      synthPlan(60, 1, 2.5).partials[0]?.decayS ?? 0,
      12,
    )
    expect([0, 80, 127, 200, -5].map(vel01)).toEqual([0, 80 / 127, 1, 1, 0])
  })
})

describe('メトロノーム beatClicks', () => {
  const pulse = (bpm: number, timeSig?: Pulse['timeSig']): Pulse => ({
    resolution: 240,
    tempo: [{ beat: 0, bpm }],
    ...(timeSig ? { timeSig } : {}),
  })

  it('120 BPM・拍子なし（4/4）: 0・500・…、4 拍ごとに強拍。終わりは含まない', () => {
    const c = beatClicks(pulse(120), 0, 4000)
    expect(c.map((x) => x.tMs)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500])
    expect(c.map((x) => x.accent)).toEqual([true, false, false, false, true, false, false, false])
  })

  it('3/4 は 3 拍ごと、6/8 は 3 拍（4 分音符）ごと、5/8 は小節の頭が整数拍に来たときだけ', () => {
    expect(beatClicks(pulse(60, [{ beat: 0, num: 3, den: 4 }]), 0, 7000).map((x) => x.accent)).toEqual([
      true, false, false, true, false, false, true,
    ]) // prettier-ignore
    expect(beatClicks(pulse(60, [{ beat: 0, num: 6, den: 8 }]), 0, 4000).map((x) => x.accent)).toEqual([
      true, false, false, true,
    ]) // prettier-ignore
    expect(beatClicks(pulse(60, [{ beat: 0, num: 5, den: 8 }]), 0, 6000).map((x) => x.accent)).toEqual([
      true, false, false, false, false, true,
    ]) // prettier-ignore
  })

  it('範囲が有限でなければ止める（無限に数えない）', () => {
    expect(() => beatClicks(pulse(120), 0, Infinity)).toThrow(RangeError)
    expect(() => beatClicks(pulse(120), Number.NaN, 1000)).toThrow(RangeError)
  })

  it('拍子の変わり目（拍 4 から 3/4）とテンポの変わり目、途中から（fromMs）', () => {
    const p: Pulse = {
      resolution: 240,
      tempo: [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60 },
      ],
      timeSig: [
        { beat: 0, num: 4, den: 4 },
        { beat: 4, num: 3, den: 4 },
      ],
    }
    const c = beatClicks(p, 1500, 7100)
    expect(c.map((x) => [x.beat, x.tMs, x.accent])).toEqual([
      [3, 1500, false],
      [4, 2000, true],
      [5, 3000, false],
      [6, 4000, false],
      [7, 5000, true],
      [8, 6000, false],
      [9, 7000, false],
    ])
  })
})

describe('打鍵音 keyclick', () => {
  const midiOf = (c: string): number | null => (c === 'KeyA' ? 60 : null)

  it('−18 dB ＝ 振幅 0.1259、300 ms。誤打（stray window）だけ鳴らす', () => {
    expect(KEYCLICK_GAIN).toBeCloseTo(0.125893, 6)
    expect(KEYCLICK_MS).toBe(300)
    expect(keyclickPeak()).toBeCloseTo(0.28 * 0.125893, 6)
    expect(
      keyclickFor({ kind: 'stray', code: 'KeyA', tsPerf: 0, reason: 'window' }, midiOf),
    ).toEqual({
      kind: 'note',
      midi: 60,
      v: KEYCLICK_GAIN,
      holdS: 0.3,
    })
    expect(
      keyclickFor({ kind: 'stray', code: 'KeyQ', tsPerf: 0, reason: 'window' }, midiOf),
    ).toEqual({
      kind: 'tick',
      gain: KEYCLICK_GAIN,
    })
    expect(
      keyclickFor({ kind: 'stray', code: 'KeyA', tsPerf: 0, reason: 'stopped' }, midiOf),
    ).toBeNull()
    expect(
      keyclickFor(
        {
          kind: 'hit',
          index: 0,
          grade: 'perfect',
          dtMs: 0,
          code: 'KeyA',
          noteCode: 'KeyA',
          self: 'hinted',
        },
        midiOf,
      ),
    ).toBeNull()
    expect(keyclickFor({ kind: 'miss', index: 0, noteCode: 'KeyA' }, midiOf)).toBeNull()
  })
})

describe('予約 scheduler', () => {
  it('周期 25 ms・先読み 100 ms（§4.1。m5 の 40・250 を直した）、帯 20 ms、鳴らさない 100 ms', () => {
    expect([PUMP_MS, LOOKAHEAD_MS, LATE_BAND_MS, LATE_DROP_MS]).toEqual([25, 100, 20, 100])
    expect(m5Line(461, 'function pump()')).toContain('AC.currentTime - player.base')
    expect(m5Line(462, 'while (player.idx')).toContain('rel + 0.25')
    expect(m5Line(460, 'const end =')).toContain('setInterval(pump, 40)')
  })

  const items = (ts: number[]): SoundItem[] =>
    ts.map((tMs, id) => ({ id, part: 'melody', tMs, durMs: 200, midi: 60, vel: 80, accent: false }))
  // 時計: t ＝ perf − 1000（曲の 0 ms ＝ 実時刻 1000）。bridge: context 10 s ＝ perf 1000
  const clock = (now: number, a = 1) => ({ map: { a, b: -1000 * a }, now })
  const bridge: AudioBridge = { ctxSec: 10, perfMs: 1000, via: 'outputTimestamp' }

  it('now ＋ 100 より前の音を予約し、context の秒にする（perfAt → contextOfPerf）', () => {
    const its = items([0, 50, 99.9, 100, 120, 200])
    const a = pumpSchedule(initialScheduler(), its, clock(1000), bridge)
    expect(a.play.map((p) => [p.item.tMs, p.ctxSec, p.holdS, p.lateMs])).toEqual([
      [0, 10, 0.2, 0],
      [50, 10.05, 0.2, 0],
      [99.9, expect.closeTo(10.0999, 9), 0.2, 0],
    ])
    expect(a.state.next).toBe(3)
    const b = pumpSchedule(a.state, its, clock(1025), bridge)
    expect(b.play.map((p) => p.item.tMs)).toEqual([100, 120])
    expect(b.state).toMatchObject({ next: 5, scheduled: 5, gapMaxMs: 25, lateMaxMs: 0 })
  })

  it('遅れた音は今の時刻で鳴らし（遅れ 50）、100 ms を超えた音は鳴らさない（遅れ 150）。帯は 20 ms 超', () => {
    const its = items([200, 300])
    const s = pumpSchedule(initialScheduler(), its, clock(1250), bridge)
    expect(s.play.map((p) => [p.item.tMs, p.ctxSec, p.lateMs])).toEqual([
      [200, 10.25, 50],
      [300, 10.3, 0],
    ])
    expect(lateBand(s.state)).toBe(true)
    // now 1350: 200 は 150 遅れで鳴らさない、300 は 50 遅れで今鳴らす
    const d = pumpSchedule(initialScheduler(), its, clock(1350), bridge)
    expect(d.play.map((p) => [p.item.tMs, p.ctxSec, p.lateMs])).toEqual([[300, 10.35, 50]])
    expect(d.state).toMatchObject({ dropped: 1, scheduled: 1, lateMaxMs: 150, next: 2 })
    const ok = pumpSchedule(initialScheduler(), items([250]), clock(1240), bridge)
    expect(ok.state.lateMaxMs).toBe(0)
    expect(
      lateBand(pumpSchedule(initialScheduler(), items([200]), clock(1220), bridge).state),
    ).toBe(false)
  })

  it('時計が止まっている（a 0）間は何も予約せず、間隔も数えない。再生レート 0.5 で長さと実時刻が 2 倍', () => {
    const its = items([0, 50])
    const stopped = pumpSchedule(
      initialScheduler(),
      its,
      { map: { a: 0, b: 0 }, now: 1000 },
      bridge,
    )
    expect(stopped.play).toEqual([])
    expect(stopped.state.lastPumpAt).toBeNull()
    const half = pumpSchedule(initialScheduler(), its, clock(1000, 0.5), bridge)
    // 曲の 50 ms は実時刻 1100（＝ now ＋ 先読みちょうど、入らない）
    expect(half.play.map((p) => [p.item.tMs, p.ctxSec, p.holdS])).toEqual([[0, 10, 0.4]])
    const wide = pumpSchedule(initialScheduler(), its, clock(1000, 0.5), bridge, 100.1)
    expect(wide.play.map((p) => [p.item.tMs, p.ctxSec])).toEqual([
      [0, 10],
      [50, 10.1],
    ])
  })

  it('鳴らさない線は 100 ms を超えたとき（ちょうど 100 は鳴らす）', () => {
    const at100 = pumpSchedule(initialScheduler(), items([200]), clock(1300), bridge)
    expect(at100.play.map((p) => p.lateMs)).toEqual([100])
    const over = pumpSchedule(initialScheduler(), items([200]), clock(1300.5), bridge)
    expect(over.play).toEqual([])
    expect(over.state.dropped).toBe(1)
  })

  it('一時停止の間は pump の間隔に数えない（止まった後の最初の pump は間隔 0）', () => {
    const its = items([0, 5000])
    let s = pumpSchedule(initialScheduler(), its, clock(1000), bridge).state
    s = pumpSchedule(s, its, { map: { a: 0, b: 0 }, now: 1025 }, bridge).state
    s = pumpSchedule(s, its, clock(5000), bridge).state
    expect(s.gapMaxMs).toBe(0)
    s = pumpSchedule(s, its, clock(5040), bridge).state
    expect(s.gapMaxMs).toBe(40)
  })

  it('seekSchedule: その時刻以後の最初の音から数え直す（同じ時刻は含む）', () => {
    const its = items([0, 100, 100, 250, 400])
    expect(seekSchedule(initialScheduler(), its, 100).next).toBe(1)
    expect(seekSchedule(initialScheduler(), its, 101).next).toBe(3)
    expect(seekSchedule(initialScheduler(), its, -50).next).toBe(0)
    expect(seekSchedule(initialScheduler(), its, 9999).next).toBe(5)
  })

  it('soundItems: canon（m5、ableton/2/octave）は旋律 34・クリック 36、伴奏の音高は原曲、同じ時刻は click → accomp → melody', () => {
    const chart = JSON.parse(
      readFileSync(new URL('../../fixtures/charts/m5/canon.hexnote.json', import.meta.url), 'utf8'),
    ) as Chart
    const v = chart.variants?.[0] ?? null
    const withBass: Chart = { ...chart, accompaniment: [{ midi: 38, beat: 0, dur: 2, vel: 70 }] }
    const its = soundItems(withBass, v, { melody: true, accomp: true, click: true })
    expect(its.filter((x) => x.part === 'melody').length).toBe(34)
    expect(its.filter((x) => x.part === 'click').length).toBe(36)
    expect(its.filter((x) => x.part === 'accomp').map((x) => [x.midi, x.tMs, x.vel])).toEqual([
      [38, 0, 70],
    ])
    expect(its.slice(0, 3).map((x) => x.part)).toEqual(['click', 'accomp', 'melody'])
    expect(its.map((x) => x.id)).toEqual(its.map((_, i) => i))
    for (let i = 1; i < its.length; i++)
      expect(its[i]?.tMs).toBeGreaterThanOrEqual(its[i - 1]?.tMs ?? 0)
    // 旋律は鍵の音高（畳んだ後）。譜面版が無ければ原曲音高で全部
    const raw = soundItems(chart, null, { melody: true, accomp: false, click: false })
    expect(raw.length).toBe(chart.notes.length)
    expect(raw.map((x) => x.midi)).toEqual(chart.notes.map((n) => n.midi))
    expect(soundItems(chart, v, { melody: false, accomp: false, click: false })).toEqual([])
  })
})

describe('ピアノ音源 sampler', () => {
  const SALAMANDER = Array.from({ length: 30 }, (_, k) => 21 + 3 * k)

  it('最も近い録音とピッチ比（短三度ごとの 30 音なら ±1 半音）、端は外へ伸ばす、同じ近さは低い方', () => {
    expect(nearestSample(60, SALAMANDER)).toEqual({ midi: 60, rate: 1 })
    expect(nearestSample(61, SALAMANDER)).toEqual({ midi: 60, rate: 2 ** (1 / 12) })
    expect(nearestSample(62, SALAMANDER)).toEqual({ midi: 63, rate: 2 ** (-1 / 12) })
    expect(nearestSample(20, SALAMANDER)).toEqual({ midi: 21, rate: 2 ** (-1 / 12) })
    expect(nearestSample(110, SALAMANDER)).toEqual({ midi: 108, rate: 2 ** (2 / 12) })
    expect(nearestSample(61, [60, 62])?.midi).toBe(60)
    expect(nearestSample(60, [])).toBeNull()
    for (let m = 21; m <= 108; m++)
      expect(Math.abs((nearestSample(m, SALAMANDER)?.midi ?? 0) - m)).toBeLessThanOrEqual(1)
    expect(SAMPLE_RELEASE_S).toBe(0.25)
  })

  it('manifest: 形を確かめる（files は空でよい、.. と / で始まるパスは拒む）', () => {
    const ok = { source: 'S', license: 'CC-BY-3.0', format: 'opus', files: [{ midi: 21, file: 'A0.opus', vel: 8, source: 'A0v8.flac' }] }
    expect(parseManifest(ok)?.files).toEqual(ok.files)
    expect(parseManifest({ ...ok, files: [] })?.files).toEqual([])
    const current = JSON.parse(
      readFileSync(new URL('../../../content/samples/salamander/manifest.json', import.meta.url), 'utf8'),
    ) as unknown
    expect(parseManifest(current)).not.toBeNull()
    for (const bad of [
      null,
      { ...ok, files: 'x' },
      { ...ok, license: 1 },
      { ...ok, files: [{ midi: 21.5, file: 'a.opus', vel: 8 }] },
      { ...ok, files: [{ midi: 21, file: '../a.opus', vel: 8 }] },
      { ...ok, files: [{ midi: 21, file: '/a.opus', vel: 8 }] },
      { ...ok, files: [{ midi: 21, file: '', vel: 8 }] },
    ])
      expect(parseManifest(bad), JSON.stringify(bad)).toBeNull()
  }) // prettier-ignore
})
