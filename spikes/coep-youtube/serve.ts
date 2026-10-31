// COEP × YouTube の spike（M0-11、手順 14）の静的サーバ。出どころ: kickoff 手順 14、spikes/coep-youtube/README.md・
// headers.md、decisions #57（仮）。製品のビルド（vite.config.ts）には COEP を足さない（ADR 0004）。
// 使い方: node spikes/coep-youtube/serve.ts [--port 5180]（0 なら空いている番号。開いた URL を 1 行目に出す）
// index.html を返し、問い合わせ ?coep=none|require-corp|credentialless で応答のヘッダを変える（none 以外は
// Cross-Origin-Opener-Policy: same-origin も付ける。crossOriginIsolated には両方が要る）。他のパスは 404。
// localhost だけで待つ（http://localhost は安全な文脈なので crossOriginIsolated になれる）。
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const MODES = ['none', 'require-corp', 'credentialless']
const page = fileURLToPath(new URL('./index.html', import.meta.url))

/** 問い合わせの coep → 応答のヘッダ（知らない値は none） */
function headersFor(coep: string | null): Record<string, string> {
  const mode = MODES.includes(coep ?? '') ? (coep as string) : 'none'
  const base = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  if (mode === 'none') return base
  return {
    ...base,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': mode,
  }
}

const { values } = parseArgs({ options: { port: { type: 'string', default: '5180' } } })
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (req.method !== 'GET' || (url.pathname !== '/' && url.pathname !== '/index.html')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found')
    return
  }
  // 毎回読む（index.html を書き換えたら再読込だけで効く）
  res.writeHead(200, headersFor(url.searchParams.get('coep'))).end(readFileSync(page))
})
server.listen(Number(values.port), 'localhost', () => {
  const { port } = server.address() as AddressInfo
  console.log(`http://localhost:${port}/?coep=none|require-corp|credentialless`)
})
