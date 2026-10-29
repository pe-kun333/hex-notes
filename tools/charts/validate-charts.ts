// 同梱曲の譜面検査（M0-01 は空実装。本体は手順 2 の src/chart/validate.ts を呼ぶ形に置き換える）。
// 使い方: node tools/charts/validate-charts.ts content/charts
// 曲が無ければ exit 0。あれば最低限（format と notes の有無）だけ見る。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const dir = process.argv[2] ?? 'content/charts'
if (!existsSync(dir)) {
  console.log(`charts: ${dir} が無い（検査なし）`)
  process.exit(0)
}

const files = listJson(dir).filter((f) => path.basename(f) !== 'rights.json')
if (files.length === 0) {
  console.log('charts: 0 件（検査なし）')
  process.exit(0)
}

let bad = 0
for (const f of files) {
  try {
    const chart = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
    if (chart['format'] !== 'hexnote-chart/1') throw new Error(`format が hexnote-chart/1 でない: ${String(chart['format'])}`)
    if (typeof chart['id'] !== 'string') throw new Error('id が無い')
    if (!Array.isArray(chart['notes'])) throw new Error('notes が配列でない')
    console.log(`✓ ${path.relative(process.cwd(), f)}`)
  } catch (e) {
    bad++
    console.error(`✗ ${path.relative(process.cwd(), f)}: ${(e as Error).message}`)
  }
}
process.exit(bad > 0 ? 1 : 0)

function listJson(d: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(d)) {
    const p = path.join(d, name)
    if (statSync(p).isDirectory()) out.push(...listJson(p))
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}
