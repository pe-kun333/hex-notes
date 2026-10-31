// build の precache の検査（M1-09、M1 の手順 13。decisions #64）。同梱曲が 1 曲でも precache から落ちていれば fail。
// 使い方: node tools/pwa/check-precache.ts dist content/charts（npm run build の後。CI はビルドの後に走る）
// 中身は precache.ts。
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { listCharts } from '../charts/rights.ts'
import { checkPrecache } from './precache.ts'

const dist = process.argv[2] ?? 'dist'
const chartsDir = process.argv[3] ?? 'content/charts'
const swPath = path.join(dist, 'sw.js')
if (!existsSync(swPath)) {
  console.error(`✗ ${swPath} が無い。先に npm run build`)
  process.exit(1)
}
const charts = listCharts(chartsDir)
const r = checkPrecache(readFileSync(swPath, 'utf8'), charts)
for (const u of r.urls.filter((x) => x.startsWith('content/'))) console.log(`✓ ${u}`)
if (r.problems.length > 0) {
  for (const p of r.problems) console.error(`✗ ${p}`)
  process.exit(1)
}
console.log(`✓ precache ${r.urls.length} 件（同梱曲 ${charts.length} 曲）`)
