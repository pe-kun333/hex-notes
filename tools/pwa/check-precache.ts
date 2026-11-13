// build の precache の検査（M1-09、M1 の手順 13。decisions #64）。同梱曲が 1 曲でも precache から落ちていれば fail。
// M3 の手順 10（YouTube 規約の照合表）: YouTube 系の URL を precache しない事、YouTube の NetworkOnly の規則がある事、
// 製品の束（dist/assets/*.js）に seekTo・setPlaybackRate・.mute( が 0 件の事も見る（門 VIDEO_FEATURE を外した
// build でも同じ検査が通る、m3-kickoff §7-13・decisions #114）。
// 使い方: node tools/pwa/check-precache.ts dist content/charts（npm run build の後。CI はビルドの後に走る）
// 中身は precache.ts。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { listCharts } from '../charts/rights.ts'
import { BANNED_CALLS, bannedCalls, checkPrecache, checkYoutubeRoute } from './precache.ts'

const dist = process.argv[2] ?? 'dist'
const chartsDir = process.argv[3] ?? 'content/charts'
const swPath = path.join(dist, 'sw.js')
if (!existsSync(swPath)) {
  console.error(`✗ ${swPath} が無い。先に npm run build`)
  process.exit(1)
}
const charts = listCharts(chartsDir)
const sw = readFileSync(swPath, 'utf8')
const r = checkPrecache(sw, charts)
const problems = [...r.problems, ...checkYoutubeRoute(sw)]
const assets = path.join(dist, 'assets')
const bundles = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')) : []
if (bundles.length === 0) problems.push(`束 ${assets}/*.js が無い`)
for (const f of bundles) {
  const n = bannedCalls(readFileSync(path.join(assets, f), 'utf8'))
  for (const w of BANNED_CALLS) if (n[w] > 0) problems.push(`束 assets/${f} に ${w} が ${n[w]} 件`)
}
for (const u of r.urls.filter((x) => x.startsWith('content/'))) console.log(`✓ ${u}`)
if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`)
  process.exit(1)
}
console.log(`✓ precache ${r.urls.length} 件（同梱曲 ${charts.length} 曲）`)
console.log(
  `✓ YouTube は NetworkOnly・precache 0 件、束 ${bundles.length} 個に ${BANNED_CALLS.join('・')} は 0 件`,
)
