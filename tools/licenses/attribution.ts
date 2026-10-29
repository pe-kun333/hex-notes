// ATTRIBUTION.md（CC BY の帰属表示）の必須項目の検査（M0-01）。
// check-license-files.ts と tests/unit/licenses.test.ts が使う。純関数だけで、ファイルも DOM も触らない。

/** 必須項目の行を読み、値を検査する。問題の一覧を返す（空なら合格）。 */
export function checkAttribution(text: string): string[] {
  const required = ['題名', '作者', '出典 URL', 'ライセンス名と URL', '改変内容', '変換日']
  const needsUrl = new Set(['出典 URL', 'ライセンス名と URL'])
  const rows = parseTable(text)
  const out: string[] = []
  for (const key of required) {
    const value = rows.get(key)
    if (value === undefined) {
      out.push(`「${key}」の行が無い`)
      continue
    }
    if (value === '') {
      out.push(`「${key}」の値が空`)
      continue
    }
    if (/未同梱|未記入|TODO/i.test(value)) {
      out.push(`「${key}」が未記入（${value}）`)
      continue
    }
    if (needsUrl.has(key) && !/https?:\/\//.test(value)) {
      out.push(`「${key}」に URL が無い（${value}）`)
    }
  }
  return out
}

/** Markdown の表の行 `| 項目 | 内容 |` を項目 → 内容に読む。見出し行と区切り行は飛ばす。 */
function parseTable(text: string): Map<string, string> {
  const rows = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(line)
    if (!m) continue
    const key = m[1] ?? ''
    const value = m[2] ?? ''
    if (key === '項目' || /^-+$/.test(key)) continue
    rows.set(key, value)
  }
  return rows
}
