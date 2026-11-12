import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { listCharts } from '../../../tools/charts/rights.ts'
import {
  bannedCalls,
  checkPrecache,
  checkYoutubeRoute,
  networkOnlyRoutes,
  precacheUrls,
} from '../../../tools/pwa/precache.ts'

// tools/pwa/（M1-09、M1 の手順 13）。出どころ: m1-kickoff 手順 13 の期待値（build の sw.js の precache に
// content/charts/**/*.json がある。今は U-03 の代替の 3 曲、§5）、decisions #64・#76、ADR 0004 の改訂（runtime は音源だけ）。
// sw.js の形は workbox の generateSW が書いた物（2026-11-01 の build の写しを縮めた）。
// M3 の手順 10（YouTube 規約の照合表、III.E.1）: m3-kickoff 手順 10 の期待値 (8)・(10)。YT は vite.config.ts の NetworkOnly の
// 規則を build が書いた形（2026-11-12 の dist/sw.js の写し）。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TOOL = path.join(root, 'tools', 'pwa', 'check-precache.ts')

const sw = (urls: string[], runtime = ''): string =>
  `define(["./workbox-62efef2c"],function(e){"use strict";e.precacheAndRoute([${urls
    .map((u) => `{url:"${u}",revision:"0"}`)
    .join(
      ',',
    )}],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))${runtime},e.registerRoute(/\\.(opus|mp3|ogg)$/,new e.CacheFirst({cacheName:"samples",plugins:[]}),"GET")});`

const YT = String.raw`,e.registerRoute(/^https:\/\/(www\.)?youtube(-nocookie)?\.com\//,new e.NetworkOnly,"GET")`
const CHARTS = listCharts(path.join(root, 'content', 'charts'))
const SHELL = ['index.html', 'manifest.webmanifest', 'assets/index-x.js', 'icons/icon.svg']

describe('precache の検査', () => {
  it('今の同梱曲は 3 曲（U-03 の代替）。全部と殻があれば合格、url は重ならないように並べる', () => {
    expect(CHARTS).toEqual(['pd/ode.json', 'pd/twinkle.json', 'tutorial/hajime.json'])
    const all = [...SHELL, ...CHARTS.map((c) => `content/charts/${c}`)]
    const r = checkPrecache(sw([...all, 'manifest.webmanifest']), CHARTS)
    expect(r.problems).toEqual([])
    expect(r.urls).toEqual([...all].sort())
  })

  it('チュートリアル曲だけ（手順 12 までの形）・譜面の runtime 規則・権利表・音源・殻なしは落ちる', () => {
    const old = sw([...SHELL, 'content/charts/tutorial/hajime.json'], ',e.registerRoute(/\\/content\\/charts\\/.*\\.json$/,new e.CacheFirst({cacheName:"charts",plugins:[]}),"GET")')
    expect(checkPrecache(old, CHARTS).problems).toEqual([
      '同梱曲 content/charts/pd/ode.json が無い',
      '同梱曲 content/charts/pd/twinkle.json が無い',
      '譜面の runtime の規則（cacheName charts）が残っている',
    ])
    const extra = sw(['assets/a.js', ...CHARTS.map((c) => `content/charts/${c}`), 'content/charts/rights.json', 'content/samples/salamander/A4.opus'])
    expect(checkPrecache(extra, CHARTS).problems).toEqual([
      '殻の index.html が無い',
      '権利表 content/charts/rights.json は配らない',
      '音源 content/samples/salamander/A4.opus は runtime の cache-first（precache しない）',
    ])
    expect(precacheUrls('self.skipWaiting()')).toBe(null)
    // 配列の外の url は数えない（precache の配列の終わりまで）
    expect(precacheUrls(`${sw(['assets/a.js'])}e.x([{url:"index.html"}])`)).toEqual(['assets/a.js'])
    expect(checkPrecache('', CHARTS).problems).toEqual(['precacheAndRoute が無い'])
  }) // prettier-ignore

  it('道具: 合格で exit 0、同梱曲が落ちていれば exit 1、sw.js が無ければ exit 1', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'hexnote-pwa-'))
    try {
      const charts = path.join(dir, 'charts')
      mkdirSync(path.join(charts, 'pd'), { recursive: true })
      writeFileSync(path.join(charts, 'pd', 'a.json'), '{}')
      writeFileSync(path.join(charts, 'rights.json'), '[]')
      const dist = path.join(dir, 'dist')
      mkdirSync(dist)
      const run = (): ReturnType<typeof spawnSync> =>
        spawnSync(process.execPath, [TOOL, dist, charts], { encoding: 'utf8', timeout: 30_000 })
      expect(run().status).toBe(1)
      writeFileSync(path.join(dist, 'sw.js'), sw(['index.html', 'content/charts/pd/a.json'], YT))
      // 束が無ければ落ちる（M3 の手順 10）
      expect(run().stderr).toContain('✗ 束 ')
      mkdirSync(path.join(dist, 'assets'))
      writeFileSync(
        path.join(dist, 'assets', 'index-x.js'),
        'p.pauseVideo();p.playVideo();p.getPlaybackRate()',
      )
      const ok = run()
      expect(ok.status).toBe(0)
      expect(ok.stdout).toContain('✓ precache 2 件（同梱曲 1 曲）')
      expect(ok.stdout).toContain(
        '✓ YouTube は NetworkOnly・precache 0 件、束 1 個に seekTo・setPlaybackRate・.mute( は 0 件',
      )
      writeFileSync(path.join(dist, 'assets', 'index-y.js'), 'p.seekTo(1,!0)')
      const call = run()
      expect([
        call.status,
        call.stderr.includes('✗ 束 assets/index-y.js に seekTo が 1 件'),
      ]).toEqual([1, true])
      rmSync(path.join(dist, 'assets', 'index-y.js'))
      writeFileSync(path.join(dist, 'sw.js'), sw(['index.html', 'content/charts/pd/a.json']))
      const noRule = run()
      expect([
        noRule.status,
        noRule.stderr.includes('✗ YouTube の NetworkOnly の規則が無い'),
      ]).toEqual([1, true])
      writeFileSync(path.join(dist, 'sw.js'), sw(['index.html'], YT))
      const ng = run()
      expect(ng.status).toBe(1)
      expect(ng.stderr).toContain('✗ 同梱曲 content/charts/pd/a.json が無い')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('YouTube を溜めない（M3 の手順 10、期待値 (8)・(10)）', () => {
  const IN = [
    'https://www.youtube.com/iframe_api',
    'https://youtube.com/embed/M7lc1UVf-VE',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
  ]
  const OUT = [
    'http://www.youtube.com/iframe_api',
    'https://m.youtube.com/watch?v=M7lc1UVf-VE',
    'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg',
    'https://rr1---sn-abc.googlevideo.com/videoplayback?id=1',
    'https://example.com/https://www.youtube.com/',
  ]
  it('(8a) sw.js の NetworkOnly の式は 1 本で vite.config.ts と同じ。https の youtube・nocookie に当たり、http・m.・ytimg・googlevideo・他のホストには当たらない。規則の無い sw.js は 0 本', () => {
    const routes = networkOnlyRoutes(sw(['index.html'], YT))
    expect(routes.length).toBe(1)
    const config = readFileSync(path.join(root, 'vite.config.ts'), 'utf8').match(/urlPattern: \/(.+)\/,\s*handler: 'NetworkOnly'/)?.[1]
    expect(routes[0]?.source).toBe(config)
    expect([...IN, ...OUT].map((u) => routes[0]?.test(u))).toEqual([true, true, true, false, false, false, false, false])
    expect(networkOnlyRoutes(sw(['index.html']))).toEqual([])
    expect([checkYoutubeRoute(sw(['index.html'], YT)), checkYoutubeRoute(sw(['index.html'])).length]).toEqual([[], 1])
  }) // prettier-ignore

  it('(8c) precache に YouTube 系の URL を混ぜると URL ごとに 1 件落ちる（他の同梱曲・殻は合格のまま）', () => {
    const all = [...SHELL, ...CHARTS.map((c) => `content/charts/${c}`)]
    expect(checkPrecache(sw([...all, 'https://www.youtube.com/iframe_api', 'https://i.ytimg.com/vi/x/hq.jpg'], YT), CHARTS).problems).toEqual([
      'YouTube 系の URL は precache しない: https://i.ytimg.com/vi/x/hq.jpg',
      'YouTube 系の URL は precache しない: https://www.youtube.com/iframe_api',
    ])
    expect(checkPrecache(sw([...all, 'content/charts/youtube.json'], YT), [...CHARTS, 'youtube.json']).problems).toEqual([])
  }) // prettier-ignore

  it('(10b) 束の seekTo・setPlaybackRate・.mute( を数える（合成の文字列で 1・1・1 と 0・0・0）', () => {
    expect(bannedCalls('p.seekTo(1,!0);p.mute();p.pauseVideo();p.setPlaybackRate(.75)')).toEqual({ seekTo: 1, setPlaybackRate: 1, '.mute(': 1 })
    expect(bannedCalls('p.pauseVideo();p.playVideo();p.getPlaybackRate()')).toEqual({ seekTo: 0, setPlaybackRate: 0, '.mute(': 0 })
  }) // prettier-ignore
})
