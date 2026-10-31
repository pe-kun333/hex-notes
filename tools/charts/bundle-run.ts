// 同梱曲を content/charts/ に書く（M1-01、M1 の手順 6）。中身は bundle.ts と bundle-songs.ts。
// 使い方: node tools/charts/bundle-run.ts [outDir] [--check]
// 既定の outDir は content/charts。--check は書かずに今あるファイルと 1 バイトずつ比べる（違う・無い物があれば exit 1）。
// 引数の誤りは exit 2。権利表 rights.json は手で書く（ADR 0005。npm run charts:rights が照合する）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { buildBundle } from './bundle.ts'
import { BUNDLE_SONGS } from './bundle-songs.ts'

const USAGE = '使い方: node tools/charts/bundle-run.ts [outDir] [--check]'
const FLAGS = ['--check']

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('-'))
const positional = args.filter((a) => !a.startsWith('-'))
const unknown = [...flags.filter((f) => !FLAGS.includes(f)), ...positional.slice(1)]
if (unknown.length > 0) {
  console.error(`${USAGE}（不明な引数: ${unknown.join(' ')}）`)
  process.exit(2)
}
const check = flags.includes('--check')
const outDir = positional[0] ?? 'content/charts'

let bad = 0
for (const f of await buildBundle(BUNDLE_SONGS)) {
  const target = path.join(outDir, ...f.path.split('/'))
  if (check) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null
    if (current === f.text) console.log(`✓ ${f.path}`)
    else {
      bad++
      const why = current === null ? '無い' : '中身が違う'
      console.error(`✗ ${f.path}: ${why}（npm run charts:bundle で作り直す）`)
    }
    continue
  }
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, f.text)
  console.log(`書いた ${f.path}`)
}
process.exit(bad > 0 ? 1 : 0)
