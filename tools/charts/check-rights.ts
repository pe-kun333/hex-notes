// 権利表の検査（M0-01。計測 M-9）。同梱曲の譜面ごとに rights.json の行が要る。欠け 1 件で fail。
// 使い方: node tools/charts/check-rights.ts content/charts
// 中身は rights.ts（欄は content/charts/RIGHTS.md、ADR 0005）。
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { checkRights, listCharts, readRights } from './rights.ts'

const dir = process.argv[2] ?? 'content/charts'
if (!existsSync(dir)) {
  console.log(`rights: ${dir} が無い（検査なし）`)
  process.exit(0)
}
const charts = listCharts(dir)
if (charts.length === 0) {
  console.log('rights: 譜面 0 件（検査なし）')
  process.exit(0)
}
const rights = readRights(dir)
if (rights === null) {
  console.error(`✗ ${path.join(dir, 'rights.json')} が無い`)
  process.exit(1)
}

let bad = 0
for (const r of checkRights(charts, rights)) {
  if (r.problems.length === 0) {
    console.log(`✓ ${r.file}`)
    continue
  }
  bad++
  for (const p of r.problems) console.error(`✗ ${r.file}: ${p}`)
}
process.exit(bad > 0 ? 1 : 0)
