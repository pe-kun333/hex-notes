// 回帰ハーネス（M0-10、手順 13）を回す。出どころ: kickoff 手順 13・§1.3 の 5（CI は差分表を upload-artifact で残す）、
// decisions #56（仮）。表の作り方は table.ts、差分は diff.ts。
// 使い方: node tools/harness/run.ts [--check] [--expected <file>] [--out <dir>]
// 既定は 6 曲（tests/fixtures/charts/m1/）の表を作り、期待の表（tests/harness/expected/m0-10.json）に書く。
// --check は書かずに期待の表と比べ、今の表（table.json）と差分表（diff.md）を --out（既定 tests/harness/out/）に書く。
// 差分が 1 つでもあれば exit 1。引数の誤りは exit 2。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import type { Chart } from '../../src/shared/types.ts'
import { diffTables, diffText } from './diff.ts'
import { JITTER_SDS } from './jitter.ts'
import { HARNESS_SONGS, buildTable, parseTable, tableText, type HarnessRow } from './table.ts'

const USAGE = '使い方: node tools/harness/run.ts [--check] [--expected <file>] [--out <dir>]'
const root = fileURLToPath(new URL('../../', import.meta.url))

let args
try {
  args = parseArgs({
    options: {
      check: { type: 'boolean', default: false },
      expected: { type: 'string', default: path.join(root, 'tests', 'harness', 'expected', 'm0-10.json') },
      out: { type: 'string', default: path.join(root, 'tests', 'harness', 'out') },
    },
    allowPositionals: false,
    strict: true,
  }).values
} catch (e) {
  console.error(`${USAGE}（${e instanceof Error ? e.message : String(e)}）`)
  process.exit(2)
} // prettier-ignore

const songs = HARNESS_SONGS.map((song) => {
  const file = path.join(root, 'tests', 'fixtures', 'charts', 'm1', `${song}.hexnote.json`)
  return { song, chart: JSON.parse(readFileSync(file, 'utf8')) as Chart }
})
const rows = buildTable(songs)
const text = tableText(rows)

/** SD ごとの精度の平均（目で見る用） */
function summary(rs: readonly HarnessRow[]): string {
  return JITTER_SDS.map((sd) => {
    const xs = rs.filter((r) => r.jitterSd === sd).map((r) => r.precision)
    const avg = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
    return `SD ${sd} ms: 精度の平均 ${(avg * 100).toFixed(3)}%（${xs.length} 行）`
  }).join('\n')
}

if (!args.check) {
  mkdirSync(path.dirname(args.expected), { recursive: true })
  writeFileSync(args.expected, text)
  console.log(`書いた ${path.relative(root, args.expected)}（${rows.length} 行）\n${summary(rows)}`)
  process.exit(0)
}

const expected = existsSync(args.expected) ? parseTable(readFileSync(args.expected, 'utf8')) : null
const diffs = diffTables(expected ?? [], rows)
const report = diffText(diffs, rows.length)
mkdirSync(args.out, { recursive: true })
writeFileSync(path.join(args.out, 'table.json'), text)
writeFileSync(path.join(args.out, 'diff.md'), report)
if (expected === null)
  console.error(`✗ 期待の表 ${args.expected} が無い（node tools/harness/run.ts で作る）`)
if (diffs.length > 0) {
  console.error(report)
  console.error(
    `✗ 回帰ハーネスに差分がある（意図した変化なら node tools/harness/run.ts で期待の表を作り直す）`,
  )
  process.exit(1)
}
console.log(`✓ 回帰ハーネス: 差分なし（${rows.length} 行）\n${summary(rows)}`)
