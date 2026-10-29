// 初回読込の大きさの検査（M0-01、decisions #10: ≤ 10 MB、仮）。
// 使い方: node tools/size/check-initial-load.ts dist
// 初回読込 ＝ index.html ＋ 入口チャンクとその静的 import ＋ css ＋ manifest.webmanifest ＋ icons
//          ＋ content/charts/tutorial/**/*.json（あれば。vite.config.ts の copyContent が dist/content/ に写す。ADR 0003）。
//          dynamicImports と音源（samples）は含めない。icons は svg と png（192・512）を数える。
// 数えるのは生のバイト数（gzip ではない。§7-10 の未決）。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const LIMIT = 10 * 1024 * 1024

type ManifestChunk = {
  file: string
  isEntry?: boolean
  imports?: string[]
  css?: string[]
  assets?: string[]
}

const dist = process.argv[2] ?? 'dist'
const manifestPath = path.join(dist, '.vite', 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error(`✗ ${manifestPath} が無い。先に npm run build（vite build --manifest）`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>

const files = new Set<string>()
addIfExists('index.html')
addIfExists('manifest.webmanifest')
for (const f of listUnder(path.join(dist, 'icons'))) files.add(rel(f))
for (const f of listUnder(path.join(dist, 'content', 'charts', 'tutorial'))) {
  if (f.endsWith('.json')) files.add(rel(f))
}

function rel(abs: string): string {
  return path.relative(dist, abs).split(path.sep).join('/')
}

const seen = new Set<string>()
for (const [key, chunk] of Object.entries(manifest)) {
  if (chunk.isEntry) walk(key)
}

function walk(key: string): void {
  if (seen.has(key)) return
  seen.add(key)
  const chunk = manifest[key]
  if (!chunk) return
  files.add(chunk.file)
  for (const c of chunk.css ?? []) files.add(c)
  for (const a of chunk.assets ?? []) files.add(a)
  for (const imp of chunk.imports ?? []) walk(imp)
}

let total = 0
const rows: Array<[string, number]> = []
for (const f of [...files].sort()) {
  const p = path.join(dist, f)
  if (!existsSync(p)) continue
  const size = statSync(p).size
  total += size
  rows.push([f, size])
}

for (const [f, size] of rows) console.log(`${String(size).padStart(10)}  ${f}`)
console.log(`${String(total).padStart(10)}  合計（上限 ${LIMIT}）`)
if (total > LIMIT) {
  console.error(`✗ 初回読込が上限を超えた: ${total} > ${LIMIT}`)
  process.exit(1)
}
console.log(`✓ 初回読込 ${(total / 1024 / 1024).toFixed(2)} MB ≤ 10 MB`)

function addIfExists(rel: string): void {
  if (existsSync(path.join(dist, rel))) files.add(rel)
}

function listUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listUnder(p))
    else out.push(p)
  }
  return out
}
