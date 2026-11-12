import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { awardsFor, countsForAwards, isTargetPlay } from '../../../src/results/awards.ts'
import type { ResultRecord } from '../../../src/shared/types.ts'
import { EMBED_ATTRS, embedSrc } from '../../../src/youtube/embed.ts'
import { ERROR_GROUPS_CHECKED, errorGroupOf } from '../../../src/youtube/errors.ts'

// YouTube 規約の照合表（M3 の手順 10、design §6.1）の検査のうち、連携層と記録の分。出どころ: m3-kickoff 手順 10 の期待値
// (4)〜(7)・(12)、公式の文書（2026-11-12 に読み直した。IFrame Player API の onError の一覧、RMF の API Client Identity・
// 埋め込みの寸法・自動再生、Developer Policies III.D.7〔文書に無い API を使わない〕・III.F.3.c〔視聴への報酬なし〕・
// III.I.4・I.6〔プレイヤーを変えない〕）。URL と確認日は docs/planning/m3-compliance.md。

const root = fileURLToPath(new URL('../../../', import.meta.url))

describe('onError の一覧と組（期待値 (4)）', () => {
  it('公式の一覧の 6 つ（2・5・100・101・150・153）は 4 組、一覧に無い値 999 と NaN は 5・153 と同じ組。照合の印は真', () => {
    expect([2, 5, 100, 101, 150, 153].map(errorGroupOf)).toEqual(['badId', 'env', 'gone', 'noEmbed', 'noEmbed', 'env'])
    expect([999, Number.NaN].map(errorGroupOf)).toEqual(['env', 'env'])
    expect(ERROR_GROUPS_CHECKED).toBe(true)
  }) // prettier-ignore
})

describe('動画の回は称号の集計に入らない（期待値 (5)、III.F.3.c）', () => {
  const rec = (syncUsed: ResultRecord['syncUsed']): ResultRecord => ({
    id: 'r1',
    chartId: 'c1',
    variantId: 'ableton/2/octave',
    profile: 'beginner',
    clock: syncUsed.kind === 'youtube' ? 'video' : 'novideo',
    mode: 'fixed',
    rate: 1,
    keyset: 'all',
    at: '2026-11-12T00:00:00.000Z',
    acc: 1,
    rank: 'SS',
    counts: { perfect: 10, great: 0, good: 0, near: 0, miss: 0 },
    selfRate: { solo: 1, hinted: 0, near: 0, miss: 0 },
    syncUsed,
    offsetUsed: 0,
    skipped: 0,
  })
  it('youtube（offset・rate 付きも）・youtube＋fallbackAt 0・audio＋fallbackAt 0 は偽で称号なし、audio だけ真で「初クリア」「同梱 1 曲完走」', () => {
    const opts = { today: '2026-11-12', bundledIds: ['c1'], dayOf: (at: string) => at.slice(0, 10) }
    const off = [
      rec({ kind: 'youtube', videoId: 'M7lc1UVf-VE' }),
      rec({ kind: 'youtube', videoId: 'M7lc1UVf-VE', offset: 3, rate: 1 }),
      rec({ kind: 'youtube', videoId: 'M7lc1UVf-VE', offset: 3, rate: 1, fallbackAt: 0 }),
      rec({ kind: 'audio', fallbackAt: 0 }),
    ]
    for (const r of off) {
      expect([isTargetPlay(r), countsForAwards(r)]).toEqual([false, false])
      expect(awardsFor([], r, opts).titles).toEqual([])
    }
    const a = rec({ kind: 'audio' })
    expect([isTargetPlay(a), countsForAwards(a)]).toEqual([true, true])
    expect(awardsFor([], a, opts).titles).toEqual(['初クリア', '同梱 1 曲完走'])
  }) // prettier-ignore
})

describe('埋め込みの src と iframe の属性（期待値 (6)・(7)）', () => {
  it('src の引数の鍵は enablejsapi・playsinline・disablekb・origin の 4 つだけ、ホストは www.youtube.com（nocookie でない）', () => {
    const u = new URL(embedSrc('M7lc1UVf-VE', 'https://example.com'))
    expect([u.protocol, u.host, u.pathname]).toEqual(['https:', 'www.youtube.com', '/embed/M7lc1UVf-VE'])
    expect([...u.searchParams.keys()]).toEqual(['enablejsapi', 'playsinline', 'disablekb', 'origin'])
    expect(u.searchParams.get('origin')).toBe('https://example.com')
    for (const k of ['autoplay', 'mute', 'controls', 'rel', 'fs', 'start', 'loop', 'host']) expect(u.searchParams.has(k), k).toBe(false)
  }) // prettier-ignore

  it('属性は referrerpolicy（RMF が勧める strict-origin-when-cross-origin）・allow（autoplay; encrypted-media）・title の 3 つだけ（allowfullscreen なし）', () => {
    expect(EMBED_ATTRS).toEqual({ referrerpolicy: 'strict-origin-when-cross-origin', allow: 'autoplay; encrypted-media', title: EMBED_ATTRS.title })
    expect(EMBED_ATTRS.title.length).toBeGreaterThan(0)
    expect('allowfullscreen' in EMBED_ATTRS).toBe(false)
  }) // prettier-ignore
})

/** IFrame Player API の説明に載る関数（2026-11-12 に読んだ一覧と、取得・後始末の関数） */
const API_FUNCS = [
  'playVideo', 'pauseVideo', 'stopVideo', 'seekTo', 'mute', 'unMute', 'isMuted', 'setVolume', 'getVolume', 'setPlaybackRate',
  'getPlaybackRate', 'getAvailablePlaybackRates', 'setSize', 'loadVideoById', 'cueVideoById', 'loadVideoByUrl', 'cueVideoByUrl',
  'cuePlaylist', 'loadPlaylist', 'nextVideo', 'previousVideo', 'playVideoAt', 'setLoop', 'setShuffle', 'getVideoLoadedFraction',
  'getSphericalProperties', 'setSphericalProperties', 'getPlayerState', 'getCurrentTime', 'getDuration', 'getVideoUrl',
  'getVideoEmbedCode', 'getPlaylist', 'getPlaylistIndex', 'getIframe', 'destroy', 'getVideoData',
] // prettier-ignore

describe('連携層が呼ぶプレイヤーの関数（期待値 (12)、III.D.7・I.4・I.6、decisions #11・#95）', () => {
  it('src/youtube/ と src/app/youtube-player.ts が呼ぶのは 6 つだけ。seekTo・mute・setVolume・setPlaybackRate・loadVideoById・getVideoData・stopVideo は文字列も 0 件', () => {
    const dir = path.join(root, 'src', 'youtube')
    const files = [...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => path.join(dir, f)), path.join(root, 'src', 'app', 'youtube-player.ts')]
    expect(files.length).toBe(9)
    const called = new Set<string>()
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\.([A-Za-z]+)\(/g)) if (API_FUNCS.includes(m[1] ?? '')) called.add(m[1] ?? '')
      for (const w of ['seekTo', 'mute', 'setVolume', 'setPlaybackRate', 'loadVideoById', 'getVideoData', 'stopVideo']) expect(src.includes(w), `${path.basename(f)} ${w}`).toBe(false)
    }
    expect([...called].sort()).toEqual(['destroy', 'getCurrentTime', 'getPlaybackRate', 'getPlayerState', 'pauseVideo', 'playVideo'])
  }) // prettier-ignore
})
