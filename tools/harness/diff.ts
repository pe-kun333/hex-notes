// 回帰ハーネスの差分（M0-10、手順 13）。出どころ: design.md §5 M0-10（差分）、kickoff 手順 13（期待値: 同じ種で差分 0）・
// §1.3 の 5（CI の upload-artifact で差分表を残す）、decisions #56（仮）。
// 期待の表と今の表を行の鍵（table.ts の rowKey）で突き合わせ、入れ子の欄は「counts.great」のように点でつないで比べる。
// 値は === で比べる（平らにした欄は数・文字・真偽・null だけ。−0 と 0 は同じ〔JSON に書けば同じ〕、null と 0 は違う）。
// 純関数（ファイルは run.ts）。

import { rowKey, type HarnessRow } from './table.ts'

export type HarnessDiff =
  | { readonly kind: 'changed'; readonly key: string; readonly column: string; readonly before: unknown; readonly after: unknown }
  | { readonly kind: 'missing'; readonly key: string }
  | { readonly kind: 'extra'; readonly key: string } // prettier-ignore

/** 入れ子の物を「a.b」→ 値 の組に平らにする（配列は持たない） */
function flatten(o: object, prefix = '', out = new Map<string, unknown>()): Map<string, unknown> {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix === '' ? k : `${prefix}.${k}`
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) flatten(v, key, out)
    else out.set(key, v)
  }
  return out
}

/** 期待の表 → 今の表の差分（期待の行の順、無い行、増えた行の順） */
export function diffTables(
  expected: readonly HarnessRow[],
  actual: readonly HarnessRow[],
): HarnessDiff[] {
  const now = new Map(actual.map((r) => [rowKey(r), r]))
  const out: HarnessDiff[] = []
  const seen = new Set<string>()
  for (const e of expected) {
    const key = rowKey(e)
    seen.add(key)
    const a = now.get(key)
    if (a === undefined) {
      out.push({ kind: 'missing', key })
      continue
    }
    const fe = flatten(e)
    const fa = flatten(a)
    for (const column of new Set([...fe.keys(), ...fa.keys()])) {
      const before = fe.has(column) ? fe.get(column) : undefined
      const after = fa.has(column) ? fa.get(column) : undefined
      if (before !== after) out.push({ kind: 'changed', key, column, before, after })
    }
  }
  for (const a of actual) {
    const key = rowKey(a)
    if (!seen.has(key)) out.push({ kind: 'extra', key })
  }
  return out
}

const cell = (v: unknown): string => (v === undefined ? '（無し）' : JSON.stringify(v))

/** 差分表（Markdown）。rows は今の表の行の数 */
export function diffText(diffs: readonly HarnessDiff[], rows: number): string {
  if (diffs.length === 0) return `# 回帰ハーネスの差分\n\n差分なし（${rows} 行）。\n`
  const keys = new Set(diffs.map((d) => d.key))
  const lines = [
    '# 回帰ハーネスの差分',
    '',
    `差分 ${diffs.length} 件（${keys.size} 行。今の表は ${rows} 行）。`,
    '',
    '| 行 | 列 | 期待 | 今 |',
    '|---|---|---|---|',
  ]
  for (const d of diffs) {
    if (d.kind === 'changed')
      lines.push(`| ${d.key} | ${d.column} | ${cell(d.before)} | ${cell(d.after)} |`)
    else if (d.kind === 'missing') lines.push(`| ${d.key} | （行） | 有り | 無い |`)
    else lines.push(`| ${d.key} | （行） | 無い | 有り |`)
  }
  return `${lines.join('\n')}\n`
}
