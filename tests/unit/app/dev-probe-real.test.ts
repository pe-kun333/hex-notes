import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDevProbe, recordingPort, wrapRealPort } from '../../../src/app/dev/dummy-port.ts'
import type { VideoPort, VideoRequest, VideoSample, VideoState } from '../../../src/clock/types.ts'

// DEV の読み口に実物の口の要求と事象を残す（M4 の手順書 §7-13 (i)、decisions #128）。出どころ: m3-verification.md §16 の宿題
// （▶ の後の状態の列と pauseVideo → PAUSED の遅れを読めるように）、m3-verification §3 の S7c の行。

/** 読むたびに列の次の状態を返す偽の口（timeMs は呼ばれた順に 100 ms ずつ） */
function fakePort(states: readonly (VideoState | null)[]) {
  let i = 0
  const applied: VideoRequest[][] = []
  let disposed = 0
  const port: VideoPort = {
    sample: (): VideoSample | null => {
      const s = states[Math.min(i, states.length - 1)] ?? null
      i++
      return s === null ? null : ({ state: s, timeMs: i * 100, rate: 1 } as VideoSample)
    },
    apply: (_now, reqs) => {
      applied.push([...reqs])
    },
    dispose: () => {
      disposed++
    },
  }
  return { port, applied, disposed: () => disposed }
}

describe('recordingPort（中身は変えずに記録だけ流す）', () => {
  it('状態は変わり目だけ（null は流さない）。要求は 1 つずつ、apply は元へ。dispose は記録してから元へ', () => {
    const f = fakePort([null, 'unstarted', 'unstarted', 'buffering', 'playing', 'playing', 'paused'])
    const states: [number, VideoState][] = []
    const reqs: [number, VideoRequest['kind']][] = []
    let disposes = 0
    const p = recordingPort(f.port, {
      onState: (now, s) => states.push([now, s]),
      onRequest: (now, q) => reqs.push([now, q.kind]),
      onDispose: () => disposes++,
    })
    const read = [0, 10, 20, 30, 40, 50, 60].map((now) => p.sample(now)?.state ?? null)
    expect(read).toEqual([null, 'unstarted', 'unstarted', 'buffering', 'playing', 'playing', 'paused'])
    expect(states).toEqual([[10, 'unstarted'], [30, 'buffering'], [40, 'playing'], [60, 'paused']])
    const qs: VideoRequest[] = [{ kind: 'pauseVideo', why: 'stall' }, { kind: 'playVideo' }]
    p.apply(70, qs)
    expect(reqs).toEqual([[70, 'pauseVideo'], [70, 'playVideo']])
    expect(f.applied).toEqual([qs])
    p.dispose()
    expect([disposes, f.disposed()]).toEqual([1, 1])
  }) // prettier-ignore
})

describe('wrapRealPort と window.__hexnoteDev（実物の口）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('作るたびに列を空にし、videoId を写す。at は buffering か playing を最初に読んだ時から（その前は 0）。凍結の後も状態は実物のまま', () => {
    vi.stubGlobal('window', globalThis)
    installDevProbe()
    const dev = (globalThis as unknown as { __hexnoteDev: { state: { startAt: number | null; videoId: string | null; requests: unknown[]; events: unknown[]; disposes: number }; freeze(ms: number): boolean } }).__hexnoteDev
    const f = fakePort(['unstarted', 'buffering', 'playing', 'playing', 'paused'])
    const p = wrapRealPort(f.port, { videoId: 'M7lc1UVf-VE' })
    for (const now of [1000, 1200, 1500, 2000]) p.sample(now)
    p.apply(2100, [{ kind: 'pauseVideo', why: 'stall' }])
    p.sample(2600)
    const s = dev.state
    expect([s.videoId, s.startAt]).toEqual(['M7lc1UVf-VE', 1200])
    expect(s.events).toEqual([{ at: 0, state: 'unstarted' }, { at: 0, state: 'buffering' }, { at: 300, state: 'playing' }, { at: 1400, state: 'paused' }])
    expect(s.requests).toEqual([{ at: 900, kind: 'pauseVideo', why: 'stall' }])
    // pauseVideo（900）→ PAUSED（1,400）の遅れ ＝ 500 ms が読める
    p.dispose()
    p.dispose()
    expect(dev.state.disposes).toBe(1)
    // 次の口で列が空に戻る
    wrapRealPort(fakePort(['unstarted']).port, { videoId: 'x' })
    expect([dev.state.videoId, dev.state.events, dev.state.requests, dev.state.startAt]).toEqual(['x', [], [], null])
    expect(dev.freeze(1000)).toBe(true)
  }) // prettier-ignore
})
