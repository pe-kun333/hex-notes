import { describe, expect, it } from 'vitest'
import { EMBED_ATTRS, embedSrc } from '../../../src/youtube/embed.ts'
import { errorGroupOf } from '../../../src/youtube/errors.ts'
import { embedGate } from '../../../src/youtube/gate.ts'
import {
  initialLoad,
  loadStep,
  NO_RESPONSE_CODE,
  LOAD_FAIL_CODE,
  type LoadState,
} from '../../../src/youtube/load.ts'
import { playerCall, sampleOf, videoStateOf } from '../../../src/youtube/player-state.ts'
import { videoIdOf } from '../../../src/youtube/video-id.ts'
import { moreThanHalfVisible } from '../../../src/youtube/visible.ts'

// YouTube 連携層の純関数（M3 の手順 1。期待値は m3-kickoff 手順 1 の (1)〜(6)・(10)、tests-inventory「M3 手順 1」）。

const ID = 'M7lc1UVf-VE'

describe('videoStateOf（期待値 (1)）', () => {
  it('PlayerState の 6 つを名前に、他は null', () => {
    expect([-1, 0, 1, 2, 3, 5].map(videoStateOf)).toEqual([
      'unstarted',
      'ended',
      'playing',
      'paused',
      'buffering',
      'cued',
    ])
    for (const n of [4, 6, NaN, undefined, '1', null]) expect(videoStateOf(n)).toBeNull()
  })
})

describe('videoIdOf（期待値 (2)）', () => {
  it('ID と受ける URL', () => {
    for (const s of [
      ID,
      `  ${ID}\n`,
      `https://www.youtube.com/watch?v=${ID}&t=42s`,
      `https://youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `http://www.youtube.com/watch?v=${ID}`,
      `youtu.be/${ID}`,
    ])
      expect(videoIdOf(s), s).toBe(ID)
  })
  it('受けない物は null', () => {
    for (const s of [
      'M7lc1UVf-V',
      'M7lc1UVf-VEx',
      'M7lc1UV!-VE',
      '',
      '   ',
      `https://www.youtube.com/watch?v=${ID}xx`,
      'https://www.youtube.com/playlist?list=PL0123456789',
      `https://example.com/watch?v=${ID}`,
      `https://youtube.com.example.org/watch?v=${ID}`,
      `ftp://www.youtube.com/watch?v=${ID}`,
      'javascript:alert(1)',
    ])
      expect(videoIdOf(s), s).toBeNull()
  })
})

describe('embedSrc と EMBED_ATTRS（期待値 (3)）', () => {
  it('playerVars は 4 つだけ（rel・controls なし）', () => {
    const src = embedSrc(ID, 'http://localhost:5173')
    expect(src).toBe(
      `https://www.youtube.com/embed/${ID}?enablejsapi=1&playsinline=1&disablekb=1&origin=http%3A%2F%2Flocalhost%3A5173`,
    )
    expect(src).not.toContain('rel=')
    expect(src).not.toContain('controls=')
  })
  it('属性は referrerpolicy・allow・title の 3 つだけ（全画面・寸法なし）', () => {
    expect(Object.keys(EMBED_ATTRS).sort()).toEqual(['allow', 'referrerpolicy', 'title'])
    expect(EMBED_ATTRS.referrerpolicy).toBe('strict-origin-when-cross-origin')
    expect(EMBED_ATTRS.allow).toBe('autoplay; encrypted-media')
    expect(EMBED_ATTRS.title.length).toBeGreaterThan(0)
  })
})

describe('errorGroupOf（期待値 (4)）', () => {
  it('4 組', () => {
    expect(errorGroupOf(2)).toBe('badId')
    expect(errorGroupOf(100)).toBe('gone')
    expect(errorGroupOf(101)).toBe('noEmbed')
    expect(errorGroupOf(150)).toBe('noEmbed')
    for (const c of [5, 153, 999, NaN]) expect(errorGroupOf(c), String(c)).toBe('env')
  })
})

describe('moreThanHalfVisible（期待値 (5)）', () => {
  const vp = { width: 1366, height: 668 }
  it('480×270 の半分ちょうど（高さ 135 px）は偽、136 px は真', () => {
    expect(
      moreThanHalfVisible({ left: 0, top: 668 - 135, width: 480, height: 270 }, vp, true),
    ).toBe(false)
    expect(
      moreThanHalfVisible({ left: 0, top: 668 - 136, width: 480, height: 270 }, vp, true),
    ).toBe(true)
  })
  it('全部見えていても文書が hidden なら偽、大きさ 0 も偽', () => {
    const r = { left: 10, top: 10, width: 480, height: 270 }
    expect(moreThanHalfVisible(r, vp, true)).toBe(true)
    expect(moreThanHalfVisible(r, vp, false)).toBe(false)
    expect(moreThanHalfVisible({ ...r, width: 0 }, vp, true)).toBe(false)
  })
})

describe('sampleOf と playerCall（期待値 (6)）', () => {
  it('読めた読みは標本、どれかが読めなければ null（rate は 1 に倒さない）', () => {
    expect(sampleOf({ state: 1, timeS: 12.5, rate: 1, visible: true })).toEqual({
      state: 'playing',
      timeMs: 12500,
      rate: 1,
      visible: true,
    })
    const base = { state: 1, timeS: 12.5, rate: 1, visible: true }
    for (const r of [
      { ...base, timeS: undefined },
      { ...base, timeS: NaN },
      { ...base, state: 4 },
      { ...base, rate: 0 },
      { ...base, rate: undefined },
    ])
      expect(sampleOf(r)).toBeNull()
    expect(sampleOf({ ...base, pauseFailed: true })?.pauseFailed).toBe(true)
  })
  it('pauseVideo・playVideo だけ呼び、seek の要求は呼ばない', () => {
    expect(playerCall({ kind: 'pauseVideo', why: 'user' })).toBe('pauseVideo')
    expect(playerCall({ kind: 'pauseVideo', why: 'stall' })).toBe('pauseVideo')
    expect(playerCall({ kind: 'playVideo' })).toBe('playVideo')
    expect(playerCall({ kind: 'seekTo', t: 11500 })).toBeNull()
  })
})

describe('loadStep（期待値 (10)）', () => {
  const mount = (s: LoadState, now: number, api: 'ready' | 'absent' | 'failed', gate = true) =>
    loadStep(s, { kind: 'mount', now, gate, api })

  it('同意の門が閉じていれば何も作らない（今の門は常に開く）', () => {
    expect(embedGate()).toBe(true)
    const r = mount(initialLoad, 0, 'absent', false)
    expect(r.effects).toEqual([])
    expect(r.notices).toEqual([])
    expect(r.state).toBe(initialLoad)
  })

  it('iframe_api → iframe と YT.Player、onReady で ready（事象にしない）', () => {
    const a = mount(initialLoad, 100, 'absent')
    expect(a.effects).toEqual([{ kind: 'loadApi', recreate: false }])
    const b = loadStep(a.state, { kind: 'apiLoaded', gen: a.state.gen })
    expect(b.effects).toEqual([{ kind: 'createPlayer', gen: 1 }])
    const c = loadStep(b.state, { kind: 'ready', gen: 1 })
    expect(c.state.phase).toBe('ready')
    expect(c.notices).toEqual([])
    // 読めた後の mount は script を作らない
    expect(mount(c.state, 200, 'ready').effects).toEqual([{ kind: 'createPlayer', gen: 2 }])
  })

  it('script の onerror は読込の失敗 −1、次の mount は script を作り直す', () => {
    const a = mount(initialLoad, 0, 'absent')
    const b = loadStep(a.state, { kind: 'apiFailed', gen: 1 })
    expect(b.notices).toEqual([{ kind: 'loadFail', code: LOAD_FAIL_CODE }])
    expect(LOAD_FAIL_CODE).toBe(-1)
    const c = mount(b.state, 50, 'failed')
    expect(c.effects).toEqual([{ kind: 'loadApi', recreate: true }])
  })

  it('onReady 無しで 9,999 ms は読込中、10,000 ms で応答なし −2・iframe を外す、後の onReady は捨てる', () => {
    const a = mount(initialLoad, 1000, 'ready')
    const b = loadStep(a.state, { kind: 'tick', now: 10_999 })
    expect(b.state.phase).toBe('waitingReady')
    expect(b.notices).toEqual([])
    const c = loadStep(b.state, { kind: 'tick', now: 11_000 })
    expect(c.notices).toEqual([{ kind: 'noResponse', code: NO_RESPONSE_CODE }])
    expect(NO_RESPONSE_CODE).toBe(-2)
    expect(c.effects).toEqual([{ kind: 'removeIframe' }])
    const d = loadStep(c.state, { kind: 'ready', gen: 1 })
    expect(d.state.phase).toBe('failed')
  })

  it('onError 150 は error・組 noEmbed。古い世代の事象は捨てる', () => {
    const a = mount(initialLoad, 0, 'ready')
    const b = loadStep(a.state, { kind: 'ready', gen: 1 })
    const c = loadStep(b.state, { kind: 'error', gen: 1, code: 150 })
    expect(c.notices).toEqual([{ kind: 'error', code: 150, group: 'noEmbed' }])
    const d = loadStep(b.state, { kind: 'dispose' })
    expect(d.effects).toEqual([{ kind: 'destroy' }])
    expect(loadStep(d.state, { kind: 'error', gen: 1, code: 2 }).notices).toEqual([])
    expect(loadStep(d.state, { kind: 'ready', gen: 1 }).state.phase).toBe('disposed')
  })
})
