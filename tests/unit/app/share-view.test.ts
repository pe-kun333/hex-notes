import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { libraryRows } from '../../../src/app/library-view.ts'
import {
  SHARE_CONFIRM_NOTE,
  SHARE_PRIVATE_NOTE,
  shareConfirmRows,
  shareCopiedText,
  shareOpenKind,
  shareOpenedBand,
  shareRefusedBand,
  shareUrlOf,
} from '../../../src/app/share-view.ts'
import type { Chart } from '../../../src/shared/types.ts'

// src/app/share-view.ts と S6 の行の印（M4 の手順 5）。出どころ: docs/planning/m4-kickoff.md 手順 5 の期待値 (1)〜(4)・§7-17、
// decisions #117 (d)・#124。画面の流れ（覆い・保存・帯・S6 の釦）は pane で通した（tests-inventory「M4 手順 5」）。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const CANON = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', 'canon.hexnote.json'), 'utf8')) as Chart // prettier-ignore

describe('開いた曲の行き先（#117 (d)）', () => {
  it('同梱曲と同じ id → bundled（保存しない）、持ち込み済み → exists（上書きしない）、他 → new', () => {
    expect(shareOpenKind('a', ['a', 'b'], true)).toBe('bundled')
    expect(shareOpenKind('c', ['a'], true)).toBe('exists')
    expect(shareOpenKind('c', ['a'], false)).toBe('new')
  })

  it('帯の文（3 つ）と、開けなかった時の文', () => {
    expect(shareOpenedBand('new', 'X')).toEqual({ title: '共有された曲を保存しました', detail: '「X」を持ち込み曲に保存して開きました（S6 で削除できます）。' })
    expect(shareOpenedBand('exists', 'X').title).toBe('既にあります')
    expect(shareOpenedBand('bundled', 'X').detail).toBe('「X」は同梱曲と同じ曲なので保存せず、その曲を開きました。')
    expect(shareRefusedBand('broken')).toEqual({ title: '共有の URL を開けませんでした', detail: '共有の URL が壊れています（途中で切れていないか確かめてください）。' })
  }) // prettier-ignore
})

describe('確認の覆いの中身', () => {
  it('曲名・権利の印・出どころ・音の数。注記は「申告」', () => {
    expect(shareConfirmRows(CANON)).toEqual([
      ['曲名', 'カノン進行（三和音）'],
      ['権利の印', '自作'],
      ['出どころ', `${CANON.source.composer ?? ''} ・ ${CANON.source.origin ?? ''}`],
      ['音の数', '51 音'],
    ])
    expect(SHARE_CONFIRM_NOTE).toContain('申告')
  })

  it('CC BY は帰属を添え、伴奏があれば音の数に添える。出どころが無ければ —', () => {
    const c: Chart = {
      ...CANON,
      source: { kind: 'midi', rights: 'cc-by', license: { id: 'CC-BY-4.0', holder: '作者', url: 'https://example.org' } },
      accompaniment: [{ midi: 48, beat: 0, dur: 1 }],
    }
    expect(shareConfirmRows(c).slice(1)).toEqual([
      ['権利の印', 'CC BY、CC-BY-4.0 作者'],
      ['出どころ', '—'],
      ['音の数', '51 音（伴奏 1 音）'],
    ])
  }) // prettier-ignore
})

describe('S6 の「共有 URL を写す」', () => {
  it('行の shareable は権利印が private でない時だけ（private の行は釦の代わりに訳）', () => {
    const rows = libraryRows([CANON, { ...CANON, id: 'x', name: 'ひみつ', source: { ...CANON.source, rights: 'private' } }])
    expect(rows.map((r) => [r.name, r.shareable])).toEqual([['カノン進行（三和音）', true], ['ひみつ', false]])
    expect(SHARE_PRIVATE_NOTE).toBe('（私的な曲は URL にできません）')
  }) // prettier-ignore

  it('URL は今のページの場所 ＋ フラグメント（クエリは付けない）。写せた・写せなかった文', () => {
    expect(shareUrlOf('http://localhost:5173', '/', '#c1=abc')).toBe('http://localhost:5173/#c1=abc')
    expect(shareCopiedText('X', 698, true)).toBe('「X」の共有 URL を写しました（698 文字）。曲名と権利の印は、開いた人には申告として見えます。')
    expect(shareCopiedText('X', 698, false)).toBe('「X」の共有 URL です。写せなかったので、下の欄から写してください。')
  }) // prettier-ignore
})
