// 権利表の検査（M0-01。計測 M-9）。同梱曲の譜面ごとに rights.json の行が要る。欠け 1 件で fail。
// 使い方: node tools/charts/check-rights.ts content/charts
// 欄は content/charts/RIGHTS.md（ADR 0005）: 主の 6 欄 title・composerDied・arrangerDied・source・license・checkedOn
// （design.md §5.6 U-03）＋追加欄 file・owner。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const FIELDS = [
  'title',
  'composerDied',
  'arrangerDied',
  'source',
  'license',
  'checkedOn',
  'owner',
] as const
const ALLOWED_LICENSES = ['PD', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'own']
const YEAR = /^\d{4}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const PD_YEARS = 70 // 没後 70 年（design.md §2.9。仮）

const dir = process.argv[2] ?? 'content/charts'
const rightsPath = path.join(dir, 'rights.json')
if (!existsSync(dir)) {
  console.log(`rights: ${dir} が無い（検査なし）`)
  process.exit(0)
}

const charts = listJson(dir).filter((f) => path.basename(f) !== 'rights.json')
if (charts.length === 0) {
  console.log('rights: 譜面 0 件（検査なし）')
  process.exit(0)
}
if (!existsSync(rightsPath)) {
  console.error(`✗ ${rightsPath} が無い`)
  process.exit(1)
}

const rights = JSON.parse(readFileSync(rightsPath, 'utf8')) as {
  entries?: Array<Record<string, unknown> & { file?: string }>
}
const byFile = new Map<string, Record<string, unknown>>()
for (const e of rights.entries ?? []) if (typeof e.file === 'string') byFile.set(e.file, e)

let bad = 0
for (const f of charts) {
  const rel = path.relative(dir, f).split(path.sep).join('/')
  const e = byFile.get(rel)
  if (!e) {
    bad++
    console.error(`✗ 権利表に無い: ${rel}`)
    continue
  }
  const problems = checkEntry(e)
  if (problems.length > 0) {
    bad++
    for (const p of problems) console.error(`✗ ${rel}: ${p}`)
    continue
  }
  console.log(`✓ ${rel}`)
}
process.exit(bad > 0 ? 1 : 0)

function str(e: Record<string, unknown>, k: string): string {
  const v = e[k]
  return typeof v === 'string' ? v.trim() : ''
}

function checkEntry(e: Record<string, unknown>): string[] {
  const out: string[] = []
  const missing = FIELDS.filter((k) => str(e, k) === '')
  if (missing.length > 0) {
    out.push(`欄が空 ${missing.join(', ')}`)
    return out
  }
  const license = str(e, 'license')
  if (!ALLOWED_LICENSES.includes(license)) {
    out.push(`license が一覧に無い: ${license}（${ALLOWED_LICENSES.join('／')}）`)
  }
  const checkedOn = str(e, 'checkedOn')
  if (!DATE.test(checkedOn)) out.push(`checkedOn が YYYY-MM-DD でない: ${checkedOn}`)
  const checkedYear = Number(checkedOn.slice(0, 4))

  for (const k of ['composerDied', 'arrangerDied'] as const) {
    const v = str(e, k)
    if (v === '-' || v === 'anonymous' || YEAR.test(v)) continue
    out.push(`${k} は西暦 4 桁か anonymous か -: ${v}`)
  }
  if (license === 'PD') {
    for (const k of ['composerDied', 'arrangerDied'] as const) {
      const v = str(e, k)
      if (YEAR.test(v) && checkedYear - Number(v) <= PD_YEARS) {
        out.push(`${k} ${v} は没後 ${PD_YEARS} 年を過ぎていない（確認日 ${checkedOn}）`)
      }
    }
    if (str(e, 'composerDied') === '-')
      out.push('PD なのに composerDied が -（自作なら license を own に）')
  }
  if (license === 'own' && str(e, 'composerDied') !== '-' && !YEAR.test(str(e, 'composerDied'))) {
    out.push('own の composerDied は - か西暦')
  }
  return out
}

function listJson(d: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(d)) {
    const p = path.join(d, name)
    if (statSync(p).isDirectory()) out.push(...listJson(p))
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}
