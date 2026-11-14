import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SHARE_MAX_CHARS,
  SHARE_PREFIX,
  SHARE_REFUSAL_TEXT,
  canShare,
  decodeShare,
  encodeShare,
  fromBase64Url,
  isShareFragment,
  shareIndexOf,
  sharePayloadOf,
  toBase64Url,
} from '../../../src/chart/share.ts'
import type { Chart, Rights } from '../../../src/shared/types.ts'

// src/chart/share.ts（M4 の手順 4）。出どころ: docs/planning/m4-kickoff.md 手順 4 の期待値 (1)〜(3)・§7-3・§7-11、
// decisions #117・#123、design.md §5.5 L286「private は URL に埋められない」、tests-inventory「M4 手順 4」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const load = (rel: string): Chart =>
  JSON.parse(readFileSync(path.join(root, ...rel.split('/')), 'utf8')) as Chart
const TWINKLE = load('content/charts/pd/twinkle.json')
const ODE = load('content/charts/pd/ode.json')
const HAJIME = load('content/charts/tutorial/hajime.json')
const CANON = load('tests/fixtures/charts/m1/canon.hexnote.json')

/** 中身を JSON にして deflate-raw ＋ base64url（encodeShare を通さず細工した物を作る） */
async function rawFragment(payload: unknown, key = 'c1'): Promise<string> {
  const bytes = new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload))
  const z = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
  return `#${key}=${toBase64Url(z)}`
} // prettier-ignore

const withRights = (c: Chart, rights: Rights): Chart => ({
  ...c,
  source: {
    ...c.source,
    rights,
    ...(rights === 'cc-by' ? { license: { id: 'CC-BY-4.0', holder: '作った人', url: 'https://creativecommons.org/licenses/by/4.0/' } } : {}),
  },
}) // prettier-ignore

describe('期待値 (1): 大きさ（node の CompressionStream。ブラウザの値は手順 5 の pane で取り直す）', () => {
  const cases: [string, Chart, number, number][] = [
    ['きらきら星', TWINKLE, 1612, 692],
    ['歓喜の歌', ODE, 1259, 630],
    ['はじめの六角', HAJIME, 790, 483],
    ['カノン進行（フィクスチャ、51 音、own）', CANON, 1856, 698],
  ]
  for (const [name, c, json, chars] of cases)
    it(`${name}: JSON ${json} 文字 → ${chars} 文字（#c1= の後ろ）`, async () => {
      expect(JSON.stringify(sharePayloadOf(c)).length).toBe(json)
      const e = await encodeShare(c)
      expect(e).toMatchObject({ ok: true, chars })
      if (e.ok) expect(e.fragment).toBe(`${SHARE_PREFIX}${e.fragment.slice(4)}`)
    })

  it('載せるのは format・id・name・notes・pulse・source（伴奏があれば accompaniment）だけ', () => {
    expect(Object.keys(sharePayloadOf(CANON))).toEqual(['format', 'id', 'name', 'notes', 'pulse', 'source'])
    const acc = { ...CANON, accompaniment: [{ midi: 48, beat: 0, dur: 1 }] }
    expect(Object.keys(sharePayloadOf(acc))).toEqual(['format', 'id', 'name', 'notes', 'pulse', 'source', 'accompaniment'])
  }) // prettier-ignore
})

describe('期待値 (2): private は URL に埋められない（design L286）', () => {
  for (const r of ['pd', 'own', 'cc0', 'cc-by'] as const)
    it(`${r} は通る`, async () => {
      const c = withRights(CANON, r)
      expect(canShare(c)).toBe(true)
      expect((await encodeShare(c)).ok).toBe(true)
    })

  it('private は canShare 偽、encodeShare は断る', async () => {
    const c = withRights(CANON, 'private')
    expect(canShare(c)).toBe(false)
    expect(await encodeShare(c)).toEqual({ ok: false, reason: 'private' })
  })

  it('細工して private を載せた URL も、開く側で断る', async () => {
    const f = await rawFragment(sharePayloadOf(withRights(CANON, 'private')))
    expect(await decodeShare(f)).toEqual({ ok: false, reason: 'private' })
  })
})

describe('期待値 (3): 往復と検査', () => {
  it('往復で id・name・notes・pulse・source が同じ。sync は空、譜面版は持たない（開いた側で作る）', async () => {
    const e = await encodeShare(CANON)
    if (!e.ok) throw new Error('encode')
    const d = await decodeShare(e.fragment)
    if (!d.ok) throw new Error(d.reason)
    expect([d.chart.id, d.chart.name, d.chart.notes, d.chart.pulse, d.chart.source]).toEqual([CANON.id, CANON.name, CANON.notes, CANON.pulse, CANON.source])
    expect(d.chart.sync).toEqual({ sources: [] })
    expect(d.chart.variants).toBeUndefined()
    // 先頭の # は無くても良い
    expect((await decodeShare(e.fragment.slice(1))).ok).toBe(true)
  }) // prettier-ignore

  it('音の高さを 1 つ書き換えた中身 → id が合わず断る（付け直さない）', async () => {
    const p = sharePayloadOf(CANON)
    const notes = p.notes.map((n, i) => (i === 0 ? { ...n, midi: n.midi + 1 } : n))
    expect(await decodeShare(await rawFragment({ ...p, notes }))).toEqual({
      ok: false,
      reason: 'id',
    })
  })

  it('曲名・出どころは id が守らないので、書き換えても通る（手順 5 の確認で「申告」と見せる）', async () => {
    const p = sharePayloadOf(CANON)
    const d = await decodeShare(await rawFragment({ ...p, name: '別の名前', source: { ...p.source, composer: '誰か' } }))
    expect(d.ok && [d.chart.name, d.chart.source.composer]).toEqual(['別の名前', '誰か'])
  }) // prettier-ignore

  it('載せない欄（variants・sync・ext）を足した中身は、その欄を捨てて開く', async () => {
    const p = { ...sharePayloadOf(CANON), variants: CANON.variants, sync: { sources: [{ kind: 'youtube', videoId: 'x' }] }, ext: { a: 1 } }
    const d = await decodeShare(await rawFragment(p))
    expect(d.ok && [d.chart.variants, d.chart.sync, d.chart.ext]).toEqual([undefined, { sources: [] }, undefined])
  }) // prettier-ignore

  it('壊れた文字列・deflate でない・JSON でない → broken', async () => {
    expect(await decodeShare('#c1=@@@')).toEqual({ ok: false, reason: 'broken' })
    expect(await decodeShare('#c1=')).toEqual({ ok: false, reason: 'broken' })
    expect(await decodeShare(`#c1=${toBase64Url(new TextEncoder().encode('deflate でない'))}`)).toEqual({ ok: false, reason: 'broken' })
    expect(await decodeShare(await rawFragment('{"format":'))).toEqual({ ok: false, reason: 'broken' })
  }) // prettier-ignore

  it('譜面として足りない → invalid（訳の行を持つ）', async () => {
    const { notes: _n, ...rest } = sharePayloadOf(CANON)
    const d = await decodeShare(await rawFragment(rest))
    expect(d.ok).toBe(false)
    if (!d.ok) expect([d.reason, (d.issues ?? []).length > 0]).toEqual(['invalid', true])
    expect(await decodeShare(await rawFragment([1, 2]))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('知らない版 #c9= → version、共有でない #x=1 → not_share', async () => {
    expect(await decodeShare(await rawFragment(sharePayloadOf(CANON), 'c9'))).toEqual({ ok: false, reason: 'version' })
    expect(await decodeShare('#x=1')).toEqual({ ok: false, reason: 'not_share' })
    expect([isShareFragment('#c1=abc'), isShareFragment('c9=abc'), isShareFragment('#top')]).toEqual([true, true, false])
  }) // prettier-ignore

  it('8,000 文字を超える物 → too_large（作る側も開く側も）', async () => {
    expect(await decodeShare(`#c1=${'A'.repeat(SHARE_MAX_CHARS + 1)}`)).toEqual({
      ok: false,
      reason: 'too_large',
    })
    // 乱数の音高で縮まない長い譜面（作る側）
    let x = 1
    const notes = Array.from({ length: 4000 }, (_, i) => {
      x = (x * 1103515245 + 12345) % 2147483648
      return { midi: 36 + (x % 48), beat: i / 4, dur: 0.25 }
    })
    const big = await encodeShare({ ...CANON, notes })
    expect(big).toMatchObject({ ok: false, reason: 'too_large' })
    if (!big.ok) expect(big.chars).toBeGreaterThan(SHARE_MAX_CHARS)
  })

  it('戻すと巨大になる物（空白 2 MB を縮めた物）→ too_large（主スレッドを止めない）', async () => {
    const f = await rawFragment(' '.repeat(2_000_000))
    expect(f.length).toBeLessThan(SHARE_MAX_CHARS)
    expect(await decodeShare(f)).toEqual({ ok: false, reason: 'too_large' })
  })
})

describe('小道具', () => {
  it('base64url の往復（= を付けない、- と _）。使えない文字・長さが合わない物は null', () => {
    const b = new Uint8Array([0, 251, 255, 62, 63])
    const s = toBase64Url(b)
    expect(s).toBe('APv_Pj8')
    expect(fromBase64Url(s)).toEqual(b)
    expect(fromBase64Url('a+b')).toBeNull()
    expect(fromBase64Url('abcde')).toBeNull()
  })

  it('索引の 1 行: id・name・rights と、あれば license・composer・origin', () => {
    expect(shareIndexOf(TWINKLE)).toEqual({ id: TWINKLE.id, name: 'きらきら星', rights: 'pd', composer: 'フランス民謡', origin: TWINKLE.source.origin })
    expect(Object.keys(shareIndexOf(withRights(CANON, 'cc-by')))).toContain('license')
  }) // prettier-ignore

  it('断った訳の文は 7 つ全部ある', () => {
    expect(Object.keys(SHARE_REFUSAL_TEXT).sort()).toEqual(['broken', 'id', 'invalid', 'not_share', 'private', 'too_large', 'version'])
  }) // prettier-ignore
})
