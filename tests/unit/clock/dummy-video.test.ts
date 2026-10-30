import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createDummyVideo } from '../../../src/clock/dummy-video.ts'
import { gauss, mulberry32 } from '../../../src/shared/random.ts'

// src/clock/dummy-video.ts・src/shared/random.ts。出どころ: m3 `mulberry32` L244・`gauss` L245（元のコードを行番号で
// 切り出して評価し、同じ列か照合する）、m3 `dummy` L278–302 を ms に直した物（decisions #36、仮）。

const M3_LINES = readFileSync(
  fileURLToPath(new URL('../../../docs/planning/mocks/m3-clock-judge.html', import.meta.url)),
  'utf8',
).split('\n')

function m3Line(n: number, head: string): string {
  const line = M3_LINES[n - 1] ?? ''
  if (!line.startsWith(head)) throw new Error(`モックの行がずれた: L${n} ${line.slice(0, 40)}`)
  return line
}

describe('種付きの乱数（m3 L244–245 と同じ列）', () => {
  const m3 = new Function(
    `${m3Line(244, 'function mulberry32')}\n${m3Line(245, 'function gauss')}\nreturn { mulberry32, gauss }`,
  )() as { mulberry32: (s: number) => () => number; gauss: (r: () => number) => number }

  it('種 7・20261024 の先頭 50 個と gauss 20 個が元のコードと一致する', () => {
    for (const seed of [7, 20261024]) {
      const a = mulberry32(seed)
      const b = m3.mulberry32(seed)
      for (let i = 0; i < 50; i++) expect(a()).toBe(b())
      for (let i = 0; i < 20; i++) expect(gauss(a)).toBe(m3.gauss(b))
    }
  })

  it('値は 0 以上 1 未満', () => {
    const r = mulberry32(1)
    for (let i = 0; i < 1000; i++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('ダミー動画の読み', () => {
  it('15 ms の切り捨て／四捨五入（真の時刻 1012・1013 → floor 1005・1005／round 1005・1020）', () => {
    const f = createDummyVideo()
    const r = createDummyVideo({ quant: 'round' })
    f.play(0)
    r.play(0)
    expect(f.sample(1012).timeMs).toBe(1005)
    expect(f.sample(1013).timeMs).toBe(1005)
    expect(r.sample(1012).timeMs).toBe(1005)
    expect(r.sample(1013).timeMs).toBe(1020)
    expect(f.trueTime(1013)).toBe(1013)
  })

  it('始める前は unstarted・0、play で PLAYING。レート 0.5 では真の時刻が半分で進む', () => {
    const d = createDummyVideo({ rate: 0.5 })
    expect(d.sample(100)).toEqual({ state: 'unstarted', timeMs: 0, rate: 0.5, visible: true })
    d.play(100)
    expect(d.trueTime(1100)).toBe(500)
    expect(d.sample(1100)).toMatchObject({ state: 'playing', timeMs: 495 })
  })

  it('setRate は今の真の時刻から新しいレートで進める', () => {
    const d = createDummyVideo()
    d.play(0)
    d.setRate(2, 1000)
    expect(d.trueTime(1500)).toBe(2000)
  })

  it('同じ種なら逆行の列まで同じ。種が違えば違う', () => {
    const run = (seed: number): number[] => {
      const d = createDummyVideo({ backPerSec: 0.6, seed })
      d.play(0)
      return Array.from({ length: 1200 }, (_, i) => d.sample((i * 1000) / 60).timeMs)
    }
    expect(run(7)).toEqual(run(7))
    expect(run(7)).not.toEqual(run(8))
  })

  it('逆行は直前の読みから 0〜10 ms だけ戻る（backMaxMs 10）。20 秒で 1 回以上', () => {
    const d = createDummyVideo({ backPerSec: 0.6 })
    d.play(0)
    let prev = d.sample(0).timeMs
    let backs = 0
    for (let i = 1; i <= 1200; i++) {
      const v = d.sample((i * 1000) / 60).timeMs
      if (v < prev) {
        backs++
        expect(prev - v).toBeLessThanOrEqual(10)
      }
      prev = v
    }
    expect(backs).toBeGreaterThan(0)
  })

  it('seek は 240 ms 凍結し、凍結の値も刻みに乗る（10000 → 9990）。freezeHold で真の時刻も止まる', () => {
    const d = createDummyVideo()
    d.play(0)
    d.seek(10000, 1500)
    expect(d.sample(1500).timeMs).toBe(9990)
    expect(d.sample(1739).timeMs).toBe(9990)
    expect(d.sample(1740).timeMs).toBe(10230)
    const h = createDummyVideo({ freezeHold: true })
    h.play(0)
    h.seek(10000, 1500)
    expect(h.trueTime(1739)).toBe(10000)
    expect(h.sample(1740).timeMs).toBe(9990)
    expect(h.sample(1760).timeMs).toBe(10020)
  })

  it('pauseVideo は pauseLatencyMs の後に PAUSED（読みは止めた時刻を刻みに乗せた値）', () => {
    const d = createDummyVideo({ pauseLatencyMs: 100 })
    d.play(0)
    d.pauseVideo(1000)
    expect(d.sample(1099).state).toBe('playing')
    const s = d.sample(1100)
    expect(s.state).toBe('paused')
    expect(s.timeMs).toBe(1095)
    expect(d.sample(5000).timeMs).toBe(1095)
  })

  it('pauseLatencyMs never は効かない（広告の模擬）', () => {
    const d = createDummyVideo({ pauseLatencyMs: 'never' })
    d.play(0)
    d.pauseVideo(1000)
    expect(d.sample(9000).state).toBe('playing')
  })

  it('stuck の間は読みが止まり、真の時刻は進む。明けると追いつく', () => {
    const d = createDummyVideo()
    d.play(0)
    expect(d.sample(1000).timeMs).toBe(990)
    d.stuck(3000, 1000)
    expect(d.sample(3999).timeMs).toBe(990)
    expect(d.sample(3999).state).toBe('playing')
    expect(d.sample(4000).timeMs).toBe(3990)
  })

  it('setState: BUFFERING の間は真の時刻が止まり、PLAYING で続きから進む。visible は標本に出る', () => {
    const d = createDummyVideo()
    d.play(0)
    d.setState('buffering', 1000)
    expect(d.sample(2000)).toMatchObject({ state: 'buffering' })
    d.setState('playing', 2000)
    expect(d.trueTime(2500)).toBe(1500)
    d.setVisible(false)
    expect(d.sample(2500).visible).toBe(false)
  })

  it('長さに届いたら ENDED で長さを返す', () => {
    const d = createDummyVideo({ durationMs: 1000 })
    d.play(0)
    expect(d.sample(1200)).toMatchObject({ state: 'ended', timeMs: 1000 })
  })
})
