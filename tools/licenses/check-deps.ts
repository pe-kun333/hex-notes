// 依存のライセンス検査（M0-01）。許可一覧は docs/decisions.md #16、開発依存の拡張は docs/adr/0002。
// 使い方: node tools/licenses/check-deps.ts
//   1. 配布物（--production）: 厳しい一覧だけ
//   2. 開発依存を含む全体: 厳しい一覧 ＋ 開発にだけ許す一覧（BlueOak、CC BY のデータ）
// SPDX の式は項ごとに評価する（AND は全項、OR は 1 項。末尾 * は外す。tools/licenses/spdx-allow.ts）。
// GPL／AGPL／LGPL と不明は一覧に無いので、単独でも AND の一項でも止まる。
// license-checker-rseidelsohn（BSD-3-Clause）を子プロセスで呼び、--json の出力をここで判定する。
// --onlyAllow は式の部分一致（許可名を 1 つ含めば通す）なので使わない。
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { ALLOW_DEV_ONLY, ALLOW_DIST } from './allow-lists.ts'
import { findDisallowed } from './spdx-allow.ts'

const require = createRequire(import.meta.url)
const pkg = require('license-checker-rseidelsohn/package.json') as {
  bin: string | Record<string, string>
}
const binRel = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0]
if (!binRel) {
  console.error('license-checker-rseidelsohn の bin が見つからない')
  process.exit(2)
}
const pkgDir = path.dirname(require.resolve('license-checker-rseidelsohn/package.json'))
const bin = path.join(pkgDir, binRel)

type CheckerJson = Record<string, { licenses?: unknown }>

function collect(extra: string[]): CheckerJson | null {
  const args = [bin, '--excludePrivatePackages', '--json', ...extra]
  const r = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) {
    console.error(r.error.message)
    return null
  }
  if (r.status !== 0) {
    console.error(r.stderr)
    console.error(`license-checker が exit ${String(r.status)} で止まった`)
    return null
  }
  try {
    return JSON.parse(r.stdout) as CheckerJson
  } catch {
    console.error('license-checker の --json 出力が読めない')
    return null
  }
}

function run(label: string, allow: string[], extra: string[]): boolean {
  console.log(`— ${label}`)
  const json = collect(extra)
  if (!json) return false
  const counts = new Map<string, number>()
  for (const info of Object.values(json)) {
    const key = Array.isArray(info.licenses) ? info.licenses.join(' , ') : String(info.licenses)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [k, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${k}`)
  }
  console.log(`  ${String(Object.keys(json).length).padStart(4)}  （合計）`)
  const bad = findDisallowed(json, allow)
  for (const b of bad) console.error(`✗ ${b.name}: ${b.licenses}`)
  return bad.length === 0
}

const distOk = run('配布物（production）', ALLOW_DIST, ['--production'])
const devOk = run('開発依存を含む全体', [...ALLOW_DIST, ...ALLOW_DEV_ONLY], [])

if (!distOk || !devOk) {
  console.error('✗ ライセンス検査に通らない依存がある')
  process.exit(1)
}
console.log('✓ 依存のライセンスは許可一覧の中')
