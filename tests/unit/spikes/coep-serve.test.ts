import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// spikes/coep-youtube/serve.ts（M0-11 の spike のサーバ）を子プロセスで動かし、?coep= ごとの応答のヘッダを確かめる。
// 出どころ: kickoff 手順 14（require-corp／credentialless）、spikes/coep-youtube/headers.md、decisions #57（仮）。
// RESULT.md の表は、このヘッダで browser pane が返した結果。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const SERVE = path.join(root, 'spikes', 'coep-youtube', 'serve.ts')
const PAGE = path.join(root, 'spikes', 'coep-youtube', 'index.html')

let child: ChildProcess | null = null
let base = ''

beforeAll(async () => {
  const c = spawn(process.execPath, [SERVE, '--port', '0'], { cwd: root })
  child = c
  base = await new Promise<string>((resolve, reject) => {
    let buf = ''
    c.stdout?.on('data', (d: Buffer) => {
      buf += d.toString()
      const m = /http:\/\/localhost:(\d+)\//.exec(buf)
      if (m) resolve(`http://localhost:${m[1]}`)
    })
    c.on('exit', (code) => reject(new Error(`serve.ts が終わった（${code}）`)))
    setTimeout(() => reject(new Error('serve.ts が 10 秒で開かない')), 10_000)
  })
}, 15_000)

afterAll(() => {
  child?.kill()
})

describe('spike のサーバ serve.ts', () => {
  it('?coep=none（と知らない値）は COOP・COEP を付けない', async () => {
    for (const q of ['none', 'bogus', '']) {
      const r = await fetch(`${base}/?coep=${q}`)
      expect(r.status).toBe(200)
      expect(r.headers.get('cross-origin-opener-policy')).toBeNull()
      expect(r.headers.get('cross-origin-embedder-policy')).toBeNull()
      expect(r.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('require-corp・credentialless は COOP same-origin と COEP をその値で付け、index.html を返す', async () => {
    const page = readFileSync(PAGE, 'utf8')
    for (const mode of ['require-corp', 'credentialless']) {
      const r = await fetch(`${base}/index.html?coep=${mode}&iframe=credentialless`)
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(r.headers.get('cross-origin-opener-policy')).toBe('same-origin')
      expect(r.headers.get('cross-origin-embedder-policy')).toBe(mode)
      expect(await r.text()).toBe(page)
    }
  })

  it('他のパスと GET 以外は 404', async () => {
    expect((await fetch(`${base}/serve.ts`)).status).toBe(404)
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(404)
  })
})
