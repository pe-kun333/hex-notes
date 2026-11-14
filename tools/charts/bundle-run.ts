// 同梱曲を content/charts/ に書く（M1-01、M1 の手順 6）。中身は bundle.ts と bundle-songs.ts。
// 使い方: node tools/charts/bundle-run.ts [outDir] [--check]
// 既定の outDir は content/charts。--check は書かずに今あるファイルと 1 バイトずつ比べる（違う・無い物があれば exit 1）。
// 引数の誤りは exit 2。権利表 rights.json は手で書く（ADR 0005。npm run charts:rights が照合する）。
// M4 の手順 3（decisions #122）: 製品の一覧 src/app/bundled-list.ts も書く（outDir を替えたときは outDir/bundled-list.ts）。
// --check は一覧のファイルも比べ、一覧・譜面・権利表が同じ曲を指すか（bundleIssues）も見る。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { BUNDLE_LIST_PATH, buildBundle, bundleIssues, bundleListText } from './bundle.ts'
import { BUNDLE_SONGS } from './bundle-songs.ts'
import { listCharts, readRights } from './rights.ts'

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

const listTarget =
  path.normalize(outDir) === path.normalize('content/charts')
    ? BUNDLE_LIST_PATH
    : path.join(outDir, 'bundled-list.ts')
const built = await buildBundle(BUNDLE_SONGS)
const files = [
  ...built.map((f) => ({
    path: f.path,
    target: path.join(outDir, ...f.path.split('/')),
    text: f.text,
  })),
  { path: listTarget.split(path.sep).join('/'), target: listTarget, text: bundleListText(built) },
]

let bad = 0
for (const f of files) {
  const target = f.target
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
// 一覧・譜面・権利表の突き合わせ（--check のときだけ。書いた直後の権利表の欠けは charts:rights も見る）
if (check) {
  const rights = (readRights(outDir)?.entries ?? []).flatMap((e) =>
    typeof e.file === 'string' ? [e.file] : [],
  )
  const issues = bundleIssues(
    BUNDLE_SONGS.map((s) => s.file),
    listCharts(outDir),
    rights,
  )
  for (const i of issues) console.error(`✗ ${i}`)
  if (issues.length === 0) console.log(`✓ 一覧・譜面・権利表が同じ ${BUNDLE_SONGS.length} 曲を指す`)
  bad += issues.length
}
process.exit(bad > 0 ? 1 : 0)
