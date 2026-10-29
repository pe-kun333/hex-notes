// SPDX 式を許可一覧で評価する（M0-01）。check-deps.ts と tests/unit/licenses.test.ts が使う。
// license-checker-rseidelsohn の --onlyAllow は部分一致（式の中に許可名が 1 つあれば通す）なので使わず、
// --json の出力を受けてここで判定する。
//   - 末尾の `*`（推定印）は外して比べる
//   - OR は 1 項が許可一覧にあればよい
//   - AND は全ての項が許可一覧になければならない
//   - `X WITH exception` は 1 項として扱い、全体の文字列で比べる
//   - 読めない式・UNKNOWN・空は不許可
// Node が直接実行するので相対 import は .ts 拡張子付き、DOM には触れない。

type Node = { kind: 'id'; id: string } | { kind: 'and' | 'or'; left: Node; right: Node }

function tokenize(expr: string): string[] {
  return expr
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

// 文法（SPDX の優先順位: AND が OR より強い）
//   or  := and ( 'OR' and )*
//   and := atom ( 'AND' atom )*
//   atom := '(' or ')' | ID ( 'WITH' ID )?
function parse(expr: string): Node | null {
  const tokens = tokenize(expr)
  let pos = 0
  const peek = (): string | undefined => tokens[pos]
  const next = (): string | undefined => tokens[pos++]

  function parseOr(): Node | null {
    let left = parseAnd()
    if (!left) return null
    while (peek()?.toUpperCase() === 'OR') {
      next()
      const right = parseAnd()
      if (!right) return null
      left = { kind: 'or', left, right }
    }
    return left
  }

  function parseAnd(): Node | null {
    let left = parseAtom()
    if (!left) return null
    while (peek()?.toUpperCase() === 'AND') {
      next()
      const right = parseAtom()
      if (!right) return null
      left = { kind: 'and', left, right }
    }
    return left
  }

  function parseAtom(): Node | null {
    const t = next()
    if (t === undefined) return null
    if (t === '(') {
      const inner = parseOr()
      if (!inner || next() !== ')') return null
      return inner
    }
    if (t === ')' || /^(AND|OR|WITH)$/i.test(t)) return null
    let id = t
    if (peek()?.toUpperCase() === 'WITH') {
      next()
      const exc = next()
      if (exc === undefined || exc === '(' || exc === ')') return null
      id = `${id} WITH ${exc}`
    }
    return { kind: 'id', id }
  }

  const node = parseOr()
  if (!node || pos !== tokens.length) return null
  return node
}

function stripGuess(id: string): string {
  return id.endsWith('*') ? id.slice(0, -1) : id
}

function evaluate(node: Node, allowed: ReadonlySet<string>): boolean {
  switch (node.kind) {
    case 'id':
      return allowed.has(stripGuess(node.id))
    case 'and':
      return evaluate(node.left, allowed) && evaluate(node.right, allowed)
    case 'or':
      return evaluate(node.left, allowed) || evaluate(node.right, allowed)
  }
}

/** 式 `expr` が許可一覧 `allow` の中に収まるか。読めない式は false。 */
export function isAllowed(expr: string, allow: readonly string[]): boolean {
  const trimmed = expr.trim()
  if (trimmed === '' || /^UNKNOWN$/i.test(stripGuess(trimmed))) return false
  const node = parse(trimmed)
  if (!node) return false
  return evaluate(node, new Set(allow))
}

/** license-checker の `licenses` 欄（文字列か配列）を式の配列に揃える。 */
export function licensesOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  return []
}

/**
 * license-checker の --json 出力（パッケージ名 → {licenses}）を評価し、通らないパッケージを返す。
 * `licenses` が配列（複数のライセンスファイルを見つけた場合）のときは、全ての要素が通ることを要求する。
 */
export function findDisallowed(
  json: Record<string, { licenses?: unknown }>,
  allow: readonly string[],
): Array<{ name: string; licenses: string }> {
  const out: Array<{ name: string; licenses: string }> = []
  for (const [name, info] of Object.entries(json)) {
    const exprs = licensesOf(info.licenses)
    const ok = exprs.length > 0 && exprs.every((e) => isAllowed(e, allow))
    if (!ok) out.push({ name, licenses: exprs.join(' , ') || '(無し)' })
  }
  return out
}
