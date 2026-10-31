import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { listCharts } from '../../../tools/charts/rights.ts'
import { checkPrecache, precacheUrls } from '../../../tools/pwa/precache.ts'

// tools/pwa/（M1-09、M1 の手順 13）。出どころ: m1-kickoff 手順 13 の期待値（build の sw.js の precache に
// content/charts/**/*.json がある。今は U-03 の代替の 3 曲、§5）、decisions #64・#76、ADR 0004 の改訂（runtime は音源だけ）。
// sw.js の形は workbox の generateSW が書いた物（2026-11-01 の build の写しを縮めた）。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TOOL = path.join(root, 'tools', 'pwa', 'check-precache.ts')

const sw = (urls: string[], runtime = ''): string =>
  `define(["./workbox-62efef2c"],function(e){"use strict";e.precacheAndRoute([${urls
    .map((u) => `{url:"${u}",revision:"0"}`)
    .join(
      ',',
    )}],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html")))${runtime},e.registerRoute(/\\.(opus|mp3|ogg)$/,new e.CacheFirst({cacheName:"samples",plugins:[]}),"GET")});`

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
      writeFileSync(path.join(dist, 'sw.js'), sw(['index.html', 'content/charts/pd/a.json']))
      const ok = run()
      expect(ok.status).toBe(0)
      expect(ok.stdout).toContain('✓ precache 2 件（同梱曲 1 曲）')
      writeFileSync(path.join(dist, 'sw.js'), sw(['index.html']))
      const ng = run()
      expect(ng.status).toBe(1)
      expect(ng.stderr).toContain('✗ 同梱曲 content/charts/pd/a.json が無い')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
