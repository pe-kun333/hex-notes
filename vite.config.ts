import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// PWA の殻（docs/planning/m0-kickoff.md §1.4、ADR 0004）: 殻＋チュートリアル曲は precache、
// 同梱曲と音源は cache-first。YouTube の規則は親ページが読む iframe_api にだけ効く（iframe 内は SW の外）。
// COEP は足さない（M0-11 で可否を見る）。dev では SW を無効にする。
// content/ は public/ の外にあるので、ビルド時に dist/content/ へ写す（ADR 0003）。

/** content/charts/**\/*.json（rights.json を除く）と content/samples/** を dist/content/ に写す。 */
function copyContent(): Plugin {
  let outDir = 'dist'
  return {
    name: 'hexnote:copy-content',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const src = path.resolve('content')
      const dst = path.resolve(outDir, 'content')
      if (!existsSync(src)) return
      copyTree(src, dst, (rel) => {
        if (rel.startsWith('charts/'))
          return rel.endsWith('.json') && path.basename(rel) !== 'rights.json'
        if (rel.startsWith('samples/')) return true
        return false
      })
    },
  }
}

function copyTree(src: string, dst: string, keep: (rel: string) => boolean, base = src): void {
  for (const name of readdirSync(src)) {
    const p = path.join(src, name)
    const rel = path.relative(base, p).split(path.sep).join('/')
    if (statSync(p).isDirectory()) {
      copyTree(p, path.join(dst, name), keep, base)
    } else if (keep(rel)) {
      mkdirSync(dst, { recursive: true })
      cpSync(p, path.join(dst, name))
    }
  }
}

export default defineConfig({
  build: {
    target: 'es2022',
    manifest: true,
  },
  plugins: [
    copyContent(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'script-defer',
      manifest: false,
      includeAssets: ['icons/*.svg', 'icons/*.png', 'manifest.webmanifest'],
      devOptions: { enabled: false },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,svg,png,webmanifest}',
          // チュートリアル曲は precache（ADR 0003）。無いうちは glob の警告を避けるため足さない
          ...(existsSync('content/charts/tutorial') ? ['content/charts/tutorial/**/*.json'] : []),
        ],
        runtimeCaching: [
          {
            urlPattern: /\/content\/charts\/.*\.json$/,
            handler: 'CacheFirst',
            options: { cacheName: 'charts' },
          },
          {
            urlPattern: /\.(opus|mp3|ogg)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'samples' },
          },
          {
            // 親ページが読む iframe_api・www-widgetapi.js のみ。iframe の中の要求は親の SW を通らない。
            urlPattern: /^https:\/\/(www\.)?youtube(-nocookie)?\.com\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
