// 同梱曲の譜面検査（M0-02、手順 2）。出どころ: docs/design.md §3.2・§3.3、m0-kickoff.md §2 手順 2。
// 使い方: node tools/charts/validate-charts.ts [content/charts] [--no-verify-id] [--lenient]
// <dir>/**/*.json（rights.json を除く）を検査する。既定（strict）はファイルそのものが /1 どおりであること:
// validateChart(raw) を通り、normalizeChart で notes・accompaniment（順序・beat の丸め）と layout の別名が
// 変わらないこと（手順 3 の生成物は「正規化済みで書く」。vel 省略は §3.2 の既定なので差に数えない）。
// --lenient は normalizeChart → validateChart だけ（持ち込み譜面の下見用）。
// 通った譜面は verifyChartId で id の一致（--no-verify-id で飛ばす）と、variants[].keys がその配列表
// （src/layout/presets.ts）にある鍵であることを見る。
// 問題は "✗ <相対パス>: <path> <message>" で全部列挙して exit 1。曲が無ければ exit 0。引数の誤りは exit 2。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { computeChartId, verifyChartId } from '../../src/chart/hash.ts'
import { normalizeChart, validateChart } from '../../src/chart/validate.ts'
import type { ChartIssue } from '../../src/chart/validate.ts'
import { midiOf } from '../../src/layout/presets.ts'
import type { Chart, Note } from '../../src/shared/types.ts'

const USAGE = '使い方: node tools/charts/validate-charts.ts [dir] [--no-verify-id] [--lenient]'
const FLAGS = ['--no-verify-id', '--lenient']

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('-'))
const positional = args.filter((a) => !a.startsWith('-'))
const unknown = [...flags.filter((f) => !FLAGS.includes(f)), ...positional.slice(1)]
if (unknown.length > 0) {
  console.error(`${USAGE}（不明な引数: ${unknown.join(' ')}）`)
  process.exit(2)
}
const verifyId = !flags.includes('--no-verify-id')
const strict = !flags.includes('--lenient')
const dir = positional[0] ?? 'content/charts'

if (!existsSync(dir)) {
  console.log(`charts: ${dir} が無い（検査なし）`)
  process.exit(0)
}
if (!statSync(dir).isDirectory()) {
  console.error(`${USAGE}（${dir} はディレクトリでない）`)
  process.exit(2)
}

const files = listJson(dir).filter((f) => path.basename(f) !== 'rights.json')
if (files.length === 0) {
  console.log('charts: 0 件（検査なし）')
  process.exit(0)
}

let bad = 0
for (const f of files) {
  const rel = showPath(f)
  const issues = await checkFile(f)
  if (issues.length === 0) {
    console.log(`✓ ${rel}`)
    continue
  }
  bad++
  for (const i of issues)
    console.error(`✗ ${rel}: ${i.path === '' ? '' : `${i.path} `}${i.message}`)
}
process.exit(bad > 0 ? 1 : 0)

/**
 * 1 ファイルの問題。JSON として読めない → 構造（strict は raw、lenient は正規化後）→ 正規化で変わらない
 * （strict）→ id の照合（hash）と keys の鍵 の順で、先に落ちた段で止める
 */
async function checkFile(f: string): Promise<ChartIssue[]> {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(f, 'utf8'))
  } catch (e) {
    return [{ path: '', code: 'json', message: `JSON として読めない（${(e as Error).message}）` }]
  }
  const normalized = normalizeChart(raw)
  const r = validateChart(strict ? raw : normalized)
  if (!r.ok) return r.issues
  const chart = r.chart
  if (strict) {
    const diff = normalizedDiff(chart, normalized as Chart)
    if (diff.length > 0) return diff
  }
  const issues: ChartIssue[] = []
  if (verifyId && !(await verifyChartId(chart))) {
    const expected = await computeChartId(chart)
    issues.push({
      path: 'id',
      code: 'mismatch',
      message: `id が中身と合わない（計算値 ${expected}）`,
    })
  }
  issues.push(...checkKeys(chart))
  return issues
}

/** strict: 正規化前後で notes・accompaniment の (midi, beat, dur) の並びと layout の別名が変わらないこと */
function normalizedDiff(raw: Chart, norm: Chart): ChartIssue[] {
  const issues: ChartIssue[] = []
  const shape = (list: readonly Note[] | undefined): string =>
    JSON.stringify((list ?? []).map((n) => [n.midi, n.beat, n.dur]))
  if (shape(raw.notes) !== shape(norm.notes))
    issues.push({
      path: 'notes',
      code: 'not_normalized',
      message:
        '正規化で順序か beat の丸めが変わる（beat 昇順・同拍 midi 昇順・1/resolution で書く）',
    })
  if (shape(raw.accompaniment) !== shape(norm.accompaniment))
    issues.push({
      path: 'accompaniment',
      code: 'not_normalized',
      message:
        '正規化で順序か beat の丸めが変わる（beat 昇順・同拍 midi 昇順・1/resolution で書く）',
    })
  const layouts = (c: Chart): string =>
    JSON.stringify([
      (c as unknown as Record<string, unknown>)['layout'],
      ...(c.variants ?? []).map((v) => [v.layout, v.id]),
    ])
  if (layouts(raw) !== layouts(norm))
    issues.push({
      path: 'variants',
      code: 'not_normalized',
      message: 'layout は別名（garage・fl）でなく正規名で書く',
    })
  return issues
}

/** variants[].keys の code がその配列表にある鍵か（format-architecture §1.6: 鳴る音高は map[code] で引く） */
function checkKeys(chart: Chart): ChartIssue[] {
  const issues: ChartIssue[] = []
  ;(chart.variants ?? []).forEach((v, i) => {
    v.keys.forEach((k, j) => {
      if (k !== null && midiOf(v.layout, k) === null)
        issues.push({
          path: `variants[${i}].keys[${j}]`,
          code: 'unknown_key',
          message: `${v.layout} の配列表に無い鍵（${JSON.stringify(k)}）`,
        })
    })
  })
  return issues
}

/** 表示用のパス。cwd の下なら相対、外なら絶対。区切りは / に揃える */
function showPath(f: string): string {
  const rel = path.relative(process.cwd(), f)
  const shown = rel === '' || rel.startsWith('..') || path.isAbsolute(rel) ? f : rel
  return shown.split(path.sep).join('/')
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
