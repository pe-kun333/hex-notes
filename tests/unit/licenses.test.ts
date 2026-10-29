import { describe, expect, it } from 'vitest'
import { ALLOW_DEV_ONLY, ALLOW_DIST } from '../../tools/licenses/allow-lists.ts'
import { checkAttribution } from '../../tools/licenses/attribution.ts'
import { findDisallowed, isAllowed } from '../../tools/licenses/spdx-allow.ts'

// m0-kickoff.md §1.6「デュアルライセンス 1 件と推定印 1 件を含めて通る」の代替。
// 今の木に推定印 `*` は無いので、式の評価を偽の値で確かめる。
const DEV = [...ALLOW_DIST, ...ALLOW_DEV_ONLY]

describe('ライセンス式の評価（decisions #16、ADR 0002）', () => {
  it('単独の許可名は通る', () => {
    for (const id of ALLOW_DIST) expect(isAllowed(id, ALLOW_DIST), id).toBe(true)
  })

  it('推定印 MIT* は MIT の許可で通る', () => {
    expect(isAllowed('MIT*', ALLOW_DIST)).toBe(true)
  })

  it('OR は 1 項でよい', () => {
    expect(isAllowed('(MIT OR CC0-1.0)', ALLOW_DIST)).toBe(true)
    expect(isAllowed('(MIT OR GPL-3.0)', ALLOW_DIST)).toBe(true)
    expect(isAllowed('(GPL-3.0 OR AGPL-3.0)', ALLOW_DIST)).toBe(false)
  })

  it('AND は全項が要る: (MIT AND GPL-3.0) は MIT の許可だけでは止まる', () => {
    expect(isAllowed('(MIT AND GPL-3.0)', ALLOW_DIST)).toBe(false)
    expect(isAllowed('MIT AND LGPL-2.1', ALLOW_DIST)).toBe(false)
    expect(isAllowed('(MIT AND Apache-2.0)', ALLOW_DIST)).toBe(true)
  })

  it('GPL／AGPL／LGPL／不明／空は止まる', () => {
    for (const id of [
      'GPL-3.0',
      'AGPL-3.0',
      'LGPL-2.1',
      'UNKNOWN',
      'UNKNOWN*',
      '',
      'Custom: see LICENSE',
    ]) {
      expect(isAllowed(id, DEV), id).toBe(false)
    }
  })

  it('開発依存の拡張一覧: (MIT AND CC-BY-3.0) は開発では通り、配布物では止まる', () => {
    expect(isAllowed('(MIT AND CC-BY-3.0)', DEV)).toBe(true)
    expect(isAllowed('(MIT AND CC-BY-3.0)', ALLOW_DIST)).toBe(false)
    expect(isAllowed('BlueOak-1.0.0', DEV)).toBe(true)
    expect(isAllowed('BlueOak-1.0.0', ALLOW_DIST)).toBe(false)
  })

  it('Zlib は decisions #16 に無いので止まる', () => {
    expect(isAllowed('(MIT AND Zlib)', DEV)).toBe(false)
  })

  it('入れ子と優先順位（AND が OR より強い）', () => {
    expect(isAllowed('MIT OR GPL-3.0 AND AGPL-3.0', ALLOW_DIST)).toBe(true)
    expect(isAllowed('(GPL-3.0 OR MIT) AND (ISC OR AGPL-3.0)', ALLOW_DIST)).toBe(true)
    expect(isAllowed('(GPL-3.0 OR MIT) AND (LGPL-3.0 OR AGPL-3.0)', ALLOW_DIST)).toBe(false)
    expect(isAllowed('(MIT', ALLOW_DIST)).toBe(false)
    expect(isAllowed('GPL-3.0 WITH Classpath-exception-2.0', ALLOW_DIST)).toBe(false)
  })

  it('--json の形（licenses が文字列か配列）から通らない物を拾う', () => {
    const bad = findDisallowed(
      {
        'a@1.0.0': { licenses: 'MIT' },
        'b@1.0.0': { licenses: '(MIT AND GPL-3.0)' },
        'c@1.0.0': { licenses: ['MIT', 'Apache-2.0'] },
        'd@1.0.0': { licenses: ['MIT', 'GPL-2.0'] },
        'e@1.0.0': {},
      },
      ALLOW_DIST,
    )
    expect(bad.map((b) => b.name)).toEqual(['b@1.0.0', 'd@1.0.0', 'e@1.0.0'])
  })
})

// m0-kickoff.md 手順 10 の期待値「check-license-files が ATTRIBUTION.md の項目欠けで fail」。
describe('ATTRIBUTION.md の必須 6 項目（CC BY 3.0 §4(b)）', () => {
  const full = [
    '| 項目 | 内容 |',
    '|---|---|',
    '| 題名 | Salamander Grand Piano V3 |',
    '| 作者 | Alexander Holm |',
    '| 出典 URL | https://example.invalid/salamander |',
    '| ライセンス名と URL | CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/ |',
    '| 改変内容 | 30 音・1 層へ間引き、FLAC → Opus |',
    '| 変換日 | 2026-11-01 |',
  ]

  it('全項目が埋まっていれば通る', () => {
    expect(checkAttribution(full.join('\n'))).toEqual([])
  })

  it('行が無い・値が空・未同梱・URL 無しで止まる', () => {
    const noRow = full.filter((l) => !l.startsWith('| 変換日'))
    expect(checkAttribution(noRow.join('\n'))).toEqual(['「変換日」の行が無い'])
    const empty = full.map((l) => (l.startsWith('| 作者') ? '| 作者 |  |' : l))
    expect(checkAttribution(empty.join('\n'))).toEqual(['「作者」の値が空'])
    const pending = full.map((l) =>
      l.startsWith('| 出典 URL') ? '| 出典 URL | （未同梱。間引き版を置くときに書く） |' : l,
    )
    expect(checkAttribution(pending.join('\n'))).toHaveLength(1)
    expect(checkAttribution(pending.join('\n'))[0]).toContain('未記入')
    const noUrl = full.map((l) => (l.startsWith('| 出典 URL') ? '| 出典 URL | 公式サイト |' : l))
    expect(checkAttribution(noUrl.join('\n'))).toEqual(['「出典 URL」に URL が無い（公式サイト）'])
  })

  it('見出し語が説明文にあるだけでは通らない', () => {
    const prose =
      '必須 6 項目は 題名・作者・出典 URL・ライセンス名と URL・改変内容・変換日。https://example.invalid/'
    expect(checkAttribution(prose)).toHaveLength(6)
  })
})
