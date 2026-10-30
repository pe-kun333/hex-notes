// m1' の 6 曲と m5 EXAMPLES を /1 のフィクスチャに書く（M0-02 後半、手順 3）。中身は mel-fixtures.ts。
// 使い方: node tools/charts/from-mel.ts [outDir] [--check]
// 既定の outDir は tests/fixtures。charts/m1/*.hexnote.json（6）、charts/m5/*.hexnote.json（2）、
// m5-json/*.garage.octave.L2.json（m5 の JSON 出力、2）を書く。
// --check は書かずに、今あるファイルと 1 バイトずつ比べる（違う・無い物があれば exit 1）。引数の誤りは exit 2。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { buildMelFixtures } from './mel-fixtures.ts'

const USAGE = '使い方: node tools/charts/from-mel.ts [outDir] [--check]'
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
const outDir = positional[0] ?? 'tests/fixtures'

let bad = 0
for (const f of await buildMelFixtures()) {
  const target = path.join(outDir, ...f.path.split('/'))
  if (check) {
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null
    if (current === f.text) console.log(`✓ ${f.path}`)
    else {
      bad++
      const why = current === null ? '無い' : '中身が違う'
      console.error(`✗ ${f.path}: ${why}（node tools/charts/from-mel.ts で作り直す）`)
    }
    continue
  }
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, f.text)
  console.log(`書いた ${f.path}`)
}
process.exit(bad > 0 ? 1 : 0)
