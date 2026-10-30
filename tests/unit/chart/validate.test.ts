import { describe, expect, it } from 'vitest'
import { isChart, normalizeChart, validateChart } from '../../../src/chart/validate.ts'
import type { ChartIssue } from '../../../src/chart/validate.ts'
import { CHART_FORMAT, DEFAULT_RESOLUTION } from '../../../src/shared/types.ts'

// design.md §3.2 の必須・任意と、m0-kickoff.md 手順 2 の手直し（/2 拒否、layout 4 値、dur 必須）。

const ID = 'sha256:' + '0123456789abcdef'.repeat(4)

type Rec = Record<string, unknown>

/** 最小の正しい譜面（呼ぶたびに新しい写し） */
function minimal(): Rec {
  return {
    format: CHART_FORMAT,
    id: ID,
    name: 'テスト',
    notes: [
      { midi: 60, beat: 0, dur: 1 },
      { midi: 64, beat: 1, dur: 0.5 },
      { midi: 67, beat: 1.5, dur: 0.5 },
    ],
    pulse: { resolution: 240, tempo: [{ beat: 0, bpm: 120 }] },
    sync: { sources: [] },
    source: { kind: 'bundled', rights: 'pd' },
  }
}

function issuesOf(x: unknown): ChartIssue[] {
  const r = validateChart(x)
  return r.ok ? [] : r.issues
}

function paths(x: unknown): string[] {
  return issuesOf(x).map((i) => i.path)
}

function codeAt(x: unknown, path: string): string | undefined {
  return issuesOf(x).find((i) => i.path === path)?.code
}

describe('validateChart: 必須の形（§3.2）', () => {
  it('最小の正しい譜面が通る', () => {
    const r = validateChart(minimal())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.chart.format).toBe(CHART_FORMAT)
      expect(r.chart.notes).toHaveLength(3)
      expect(r.chart.pulse.resolution).toBe(240)
    }
  })

  it('format "hexnote-chart/2" を拒む', () => {
    const c = minimal()
    c['format'] = 'hexnote-chart/2'
    expect(codeAt(c, 'format')).toBe('unsupported')
  })

  it('format 無しを拒む', () => {
    const c = minimal()
    delete c['format']
    expect(codeAt(c, 'format')).toBe('missing')
  })

  it('id の形が違えば拒む（sha256:64hex だけ。ハッシュの一致は見ない）', () => {
    for (const bad of [
      'sha256:abc',
      'md5:' + 'a'.repeat(64),
      'sha256:' + 'A'.repeat(64),
      ID + '0',
      42,
    ]) {
      const c = minimal()
      c['id'] = bad
      expect(paths(c), String(bad)).toContain('id')
    }
    // 形が合えば中身の一致は問わない
    const c = minimal()
    c['id'] = 'sha256:' + 'f'.repeat(64)
    expect(validateChart(c).ok).toBe(true)
  })

  it('オブジェクトでない入力は not_object', () => {
    for (const x of [null, undefined, 'x', 3, [minimal()]]) {
      const r = validateChart(x)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.issues[0]?.code).toBe('not_object')
    }
  })

  it('name は空でない文字列', () => {
    const c = minimal()
    c['name'] = ''
    expect(paths(c)).toContain('name')
  })

  it('複数の問題をまとめて返す', () => {
    const c = minimal()
    c['format'] = 'hexnote-chart/2'
    c['id'] = 'x'
    delete c['name']
    const ps = paths(c)
    expect(ps).toEqual(expect.arrayContaining(['format', 'id', 'name']))
  })
})

describe('validateChart: notes（§3.2 Note）', () => {
  it('notes の順が逆なら拒み、normalizeChart の後は通る', () => {
    const c = minimal()
    c['notes'] = [
      { midi: 67, beat: 1.5, dur: 0.5 },
      { midi: 64, beat: 1, dur: 0.5 },
      { midi: 60, beat: 0, dur: 1 },
    ]
    expect(codeAt(c, 'notes[1].beat')).toBe('order')
    const r = validateChart(normalizeChart(c))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.chart.notes.map((n) => n.midi)).toEqual([60, 64, 67])
  })

  it('同拍は midi 昇順。逆なら拒み、同拍・同音は重複', () => {
    const c = minimal()
    c['notes'] = [
      { midi: 64, beat: 0, dur: 1 },
      { midi: 60, beat: 0, dur: 1 },
    ]
    expect(codeAt(c, 'notes[1].midi')).toBe('order')
    expect(validateChart(normalizeChart(c)).ok).toBe(true)

    const d = minimal()
    d['notes'] = [
      { midi: 60, beat: 0, dur: 1 },
      { midi: 60, beat: 0, dur: 1 },
    ]
    expect(codeAt(d, 'notes[1]')).toBe('duplicate')
  })

  it('beat が 1/240 の倍数でなければ拒む（許容 1e-6）', () => {
    const c = minimal()
    c['notes'] = [{ midi: 60, beat: 0.001, dur: 1 }]
    expect(codeAt(c, 'notes[0].beat')).toBe('not_multiple')
    const d = minimal()
    d['notes'] = [{ midi: 60, beat: 1 / 3 + 1e-9, dur: 1 }]
    expect(validateChart(d).ok).toBe(true)
  })

  it('許容内で同拍なら順序・重複も同拍として見る（1/resolution の目盛りで比較）', () => {
    const c = minimal()
    c['notes'] = [
      { midi: 64, beat: 1, dur: 1 },
      { midi: 60, beat: 1 + 1e-9, dur: 1 },
    ]
    expect(codeAt(c, 'notes[1].midi')).toBe('order')
    const d = minimal()
    d['notes'] = [
      { midi: 60, beat: 1, dur: 1 },
      { midi: 60, beat: 1 + 1e-9, dur: 1 },
    ]
    expect(codeAt(d, 'notes[1]')).toBe('duplicate')
    const e = minimal()
    e['notes'] = [
      { midi: 64, beat: 1 + 1e-9, dur: 1 },
      { midi: 60, beat: 1 + 1 / 240, dur: 1 },
    ]
    expect(validateChart(e).ok).toBe(true)
  })

  it('notes: [] は empty。accompaniment: [] は通る', () => {
    const c = minimal()
    c['notes'] = []
    expect(codeAt(c, 'notes')).toBe('empty')
    const d = minimal()
    d['accompaniment'] = []
    expect(validateChart(d).ok).toBe(true)
  })

  it('境界の受理: midi 0・127、resolution 1 で beat 3、dur 1e-9、vel 0・127。vel null は range', () => {
    const c = minimal()
    c['pulse'] = { resolution: 1, tempo: [{ beat: 0, bpm: 120 }] }
    c['notes'] = [
      { midi: 0, beat: 0, dur: 1e-9, vel: 0 },
      { midi: 127, beat: 3, dur: 1, vel: 127 },
    ]
    expect(issuesOf(c)).toEqual([])
    const d = minimal()
    d['notes'] = [{ midi: 60, beat: 0, dur: 1, vel: null }]
    expect(codeAt(d, 'notes[0].vel')).toBe('range')
    const e = minimal()
    e['pulse'] = { resolution: 1, tempo: [{ beat: 0, bpm: 120 }] }
    e['notes'] = [{ midi: 60, beat: 0.5, dur: 1 }]
    expect(codeAt(e, 'notes[0].beat')).toBe('not_multiple')
  })

  it('midi 128 を拒む（0〜127 の整数）', () => {
    for (const bad of [128, -1, 60.5, '60']) {
      const c = minimal()
      c['notes'] = [{ midi: bad, beat: 0, dur: 1 }]
      expect(codeAt(c, 'notes[0].midi'), String(bad)).toBe('range')
    }
  })

  it('dur 0 を拒む（正の拍。省略も不可）', () => {
    const c = minimal()
    c['notes'] = [{ midi: 60, beat: 0, dur: 0 }]
    expect(codeAt(c, 'notes[0].dur')).toBe('range')
    const d = minimal()
    d['notes'] = [{ midi: 60, beat: 0 }]
    expect(codeAt(d, 'notes[0].dur')).toBe('missing')
  })

  it('上限と整数（§3.2、decisions #19）: vel 80.5、resolution 9601、bpm 1001、beat・dur 1,000,001 は range', () => {
    const a = minimal()
    a['notes'] = [{ midi: 60, beat: 0, dur: 1, vel: 80.5 }]
    expect(codeAt(a, 'notes[0].vel')).toBe('range')

    const b = minimal()
    b['pulse'] = { resolution: 9601, tempo: [{ beat: 0, bpm: 120 }] }
    expect(codeAt(b, 'pulse.resolution')).toBe('range')

    const c = minimal()
    c['pulse'] = { resolution: 240, tempo: [{ beat: 0, bpm: 1001 }] }
    expect(codeAt(c, 'pulse.tempo[0].bpm')).toBe('range')
    c['bpm'] = 1001
    expect(codeAt(c, 'bpm')).toBe('range')

    const d = minimal()
    d['notes'] = [{ midi: 60, beat: 1_000_001, dur: 1 }]
    expect(codeAt(d, 'notes[0].beat')).toBe('range')
    d['notes'] = [{ midi: 60, beat: 0, dur: 1_000_001 }]
    expect(codeAt(d, 'notes[0].dur')).toBe('range')

    const ok = minimal()
    ok['pulse'] = { resolution: 9600, tempo: [{ beat: 0, bpm: 1000 }] }
    ok['notes'] = [{ midi: 60, beat: 1_000_000, dur: 1_000_000, vel: 127 }]
    expect(issuesOf(ok)).toEqual([])
  })

  it('vel は 0〜127、track は accompaniment だけ', () => {
    const c = minimal()
    c['notes'] = [{ midi: 60, beat: 0, dur: 1, vel: 200 }]
    expect(codeAt(c, 'notes[0].vel')).toBe('range')
    const d = minimal()
    d['notes'] = [{ midi: 60, beat: 0, dur: 1, track: 'melody' }]
    expect(codeAt(d, 'notes[0].track')).toBe('forbidden')
    const e = minimal()
    e['accompaniment'] = [
      { midi: 48, beat: 2, dur: 1, track: 'bass' },
      { midi: 40, beat: 0, dur: 2, vel: 60 },
    ]
    expect(validateChart(e).ok).toBe(true)
  })
})

describe('validateChart: pulse・sync・source', () => {
  it('tempo の先頭が beat 0 でなければ拒む', () => {
    const c = minimal()
    c['pulse'] = { resolution: 240, tempo: [{ beat: 1, bpm: 120 }] }
    expect(codeAt(c, 'pulse.tempo[0].beat')).toBe('first_beat')
  })

  it('tempo は beat 昇順・bpm > 0、空は不可', () => {
    const c = minimal()
    c['pulse'] = {
      resolution: 240,
      tempo: [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 0 },
        { beat: 4, bpm: 60 },
      ],
    }
    expect(codeAt(c, 'pulse.tempo[1].bpm')).toBe('range')
    expect(codeAt(c, 'pulse.tempo[2].beat')).toBe('order')
    const d = minimal()
    d['pulse'] = { resolution: 240, tempo: [] }
    expect(codeAt(d, 'pulse.tempo')).toBe('empty')
  })

  it('resolution 省略は 240 が入り、0 や小数は拒む', () => {
    const c = minimal()
    c['pulse'] = { tempo: [{ beat: 0, bpm: 120 }] }
    const r = validateChart(c)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.chart.pulse.resolution).toBe(DEFAULT_RESOLUTION)
    for (const bad of [0, 0.5, -240, '240']) {
      const d = minimal()
      d['pulse'] = { resolution: bad, tempo: [{ beat: 0, bpm: 120 }] }
      expect(codeAt(d, 'pulse.resolution'), String(bad)).toBe('range')
    }
  })

  it('timeSig は beat 昇順で num・den は正の整数', () => {
    const c = minimal()
    c['pulse'] = {
      resolution: 240,
      tempo: [{ beat: 0, bpm: 120 }],
      timeSig: [
        { beat: 0, num: 4, den: 4 },
        { beat: 8, num: 3, den: 4 },
      ],
    }
    expect(validateChart(c).ok).toBe(true)
    const d = minimal()
    d['pulse'] = {
      resolution: 240,
      tempo: [{ beat: 0, bpm: 120 }],
      timeSig: [{ beat: 0, num: 0, den: 4 }],
    }
    expect(codeAt(d, 'pulse.timeSig[0].num')).toBe('range')
  })

  it('youtube なのに videoId が無ければ拒む。audio は videoId を持たない', () => {
    const c = minimal()
    c['sync'] = { sources: [{ kind: 'youtube', offset: 0.5, rate: 1 }] }
    expect(codeAt(c, 'sync.sources[0].videoId')).toBe('required')
    const d = minimal()
    d['sync'] = { sources: [{ kind: 'youtube', videoId: 'abc', offset: 0.5, rate: 1 }] }
    expect(validateChart(d).ok).toBe(true)
    const e = minimal()
    e['sync'] = { sources: [{ kind: 'audio', videoId: 'abc', offset: 0, rate: 1 }] }
    expect(codeAt(e, 'sync.sources[0].videoId')).toBe('forbidden')
  })

  it('sync.sources[1..] は見ない', () => {
    const c = minimal()
    c['sync'] = {
      sources: [
        { kind: 'audio', offset: 0, rate: 1 },
        { kind: 'bogus', nothing: true },
      ],
    }
    expect(validateChart(c).ok).toBe(true)
  })

  it('cc-by なのに license が無ければ拒む。あれば通る', () => {
    const c = minimal()
    c['source'] = { kind: 'bundled', rights: 'cc-by' }
    expect(codeAt(c, 'source.license')).toBe('required')
    const d = minimal()
    d['source'] = {
      kind: 'bundled',
      rights: 'cc-by',
      license: { id: 'CC-BY-4.0', holder: '誰か', url: 'https://example.invalid/' },
    }
    expect(validateChart(d).ok).toBe(true)
    const e = minimal()
    e['source'] = { kind: 'bundled', rights: 'cc-by', license: { id: 'CC-BY-4.0' } }
    expect(paths(e)).toEqual(
      expect.arrayContaining(['source.license.holder', 'source.license.url']),
    )
  })

  it('source.kind と rights は語彙の中だけ', () => {
    const c = minimal()
    c['source'] = { kind: 'youtube', rights: 'cc-by-sa' }
    expect(codeAt(c, 'source.kind')).toBe('enum')
    expect(codeAt(c, 'source.rights')).toBe('enum')
  })
})

describe('validateChart: variants（decisions #12）', () => {
  function variant(over: Rec = {}): Rec {
    return {
      id: 'ableton/2/octave',
      layout: 'ableton',
      limit: 2,
      fold: 'octave',
      keys: ['KeyA', 'KeyD', null],
      ...over,
    }
  }

  it('正しい variant が通る', () => {
    const c = minimal()
    c['variants'] = [
      variant(),
      variant({ id: 'vmpk/3/cut', layout: 'vmpk', limit: 3, fold: 'cut' }),
    ]
    expect(validateChart(c).ok).toBe(true)
  })

  it('variants[].layout "custom" を拒む（4 値だけ）', () => {
    const c = minimal()
    c['variants'] = [variant({ id: 'custom/2/octave', layout: 'custom' })]
    expect(codeAt(c, 'variants[0].layout')).toBe('enum')
  })

  it('"garage" は normalize で ableton になり、id の先頭も揃う', () => {
    const c = minimal()
    c['variants'] = [variant({ id: 'garage/2/octave', layout: 'garage' })]
    expect(codeAt(c, 'variants[0].layout')).toBe('enum')
    const n = normalizeChart(c) as Rec
    const v = (n['variants'] as Rec[])[0]
    expect(v?.['layout']).toBe('ableton')
    expect(v?.['id']).toBe('ableton/2/octave')
    expect(validateChart(n).ok).toBe(true)
    // fl → vmpk、トップレベルの layout も
    const d = minimal()
    d['layout'] = 'fl'
    d['variants'] = [variant({ id: 'fl/2/octave', layout: 'fl' })]
    const m = normalizeChart(d) as Rec
    expect(m['layout']).toBe('vmpk')
    expect((m['variants'] as Rec[])[0]?.['layout']).toBe('vmpk')
  })

  it('別名は小文字の完全一致だけ。"Garage" は直らず enum で拒む', () => {
    const c = minimal()
    c['variants'] = [variant({ id: 'Garage/2/octave', layout: 'Garage' })]
    const n = normalizeChart(c) as Rec
    expect((n['variants'] as Rec[])[0]?.['layout']).toBe('Garage')
    expect(codeAt(n, 'variants[0].layout')).toBe('enum')
  })

  it('layout "constructor"・"toString"・"__proto__" はプロトタイプを引かず、そのまま enum で拒む', () => {
    for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const c = minimal()
      c['layout'] = bad
      c['variants'] = [variant({ id: `${bad}/2/octave`, layout: bad })]
      const n = normalizeChart(c) as Rec
      expect(n['layout'], bad).toBe(bad)
      const v = (n['variants'] as Rec[])[0]
      expect(v?.['layout'], bad).toBe(bad)
      expect(v?.['id'], bad).toBe(`${bad}/2/octave`)
      expect(codeAt(n, 'variants[0].layout'), bad).toBe('enum')
    }
  })

  it('keys の長さが notes と違えば拒む。要素は文字列か null', () => {
    const c = minimal()
    c['variants'] = [variant({ keys: ['KeyA', 'KeyD'] })]
    expect(codeAt(c, 'variants[0].keys')).toBe('length')
    const d = minimal()
    d['variants'] = [variant({ keys: ['KeyA', 5, null] })]
    expect(codeAt(d, 'variants[0].keys[1]')).toBe('type')
  })

  it('id は layout/limit/fold と一致し、limit は 2〜4、fold は 3 値', () => {
    const c = minimal()
    c['variants'] = [variant({ id: 'ableton/3/octave' })]
    expect(codeAt(c, 'variants[0].id')).toBe('mismatch')
    const d = minimal()
    d['variants'] = [variant({ id: 'ableton/5/wrap', limit: 5, fold: 'wrap' })]
    expect(codeAt(d, 'variants[0].limit')).toBe('enum')
    expect(codeAt(d, 'variants[0].fold')).toBe('enum')
    expect(codeAt(d, 'variants[0].id')).toBeUndefined()
    const e = minimal()
    e['variants'] = [variant(), variant()]
    expect(codeAt(e, 'variants[1].id')).toBe('duplicate')
  })
})

describe('validateChart: 任意と未知', () => {
  it('未知のトップレベルキーは無視して通る', () => {
    const c = minimal()
    c['whatever'] = { deep: [1, 2, 3] }
    c['hand'] = 'L'
    expect(validateChart(c).ok).toBe(true)
  })

  it('ext は中身を見ない（オブジェクトであればよい）', () => {
    const c = minimal()
    c['ext'] = { hand: ['L', 'R', 'L'], zones: null, custom: { layout: 'custom', keys: 3 } }
    expect(validateChart(c).ok).toBe(true)
    const d = minimal()
    d['ext'] = 'text'
    expect(codeAt(d, 'ext')).toBe('type')
  })

  it('bpm・beats・metrics・created・generator の型', () => {
    const c = minimal()
    c['bpm'] = 120
    c['beats'] = 8
    c['metrics'] = { density: 1.5, level: 3, extra: 'ignored' }
    c['created'] = '2026-10-30T00:00:00Z'
    c['generator'] = 'from-mel'
    expect(validateChart(c).ok).toBe(true)
    const d = minimal()
    d['bpm'] = 0
    d['beats'] = -1
    d['metrics'] = { density: 'high' }
    d['created'] = 20261030
    expect(paths(d)).toEqual(expect.arrayContaining(['bpm', 'beats', 'metrics.density', 'created']))
  })

  it('isChart は validateChart の ok。resolution 省略は入力が埋まらないので false、normalize 後は true', () => {
    expect(isChart(minimal())).toBe(true)
    expect(isChart({})).toBe(false)
    expect(isChart(null)).toBe(false)
    const c = minimal()
    c['pulse'] = { tempo: [{ beat: 0, bpm: 120 }] }
    expect(validateChart(c).ok).toBe(true)
    expect(isChart(c)).toBe(false)
    const n = normalizeChart(c)
    expect(isChart(n)).toBe(true)
    if (isChart(n)) expect(n.pulse.resolution).toBe(DEFAULT_RESOLUTION)
  })
})

describe('normalizeChart', () => {
  it('入力を変えず、写しを返す', () => {
    const c = minimal()
    c['notes'] = [
      { midi: 64, beat: 1.00000001, dur: 1 },
      { midi: 60, beat: 0, dur: 1 },
    ]
    const before = structuredClone(c)
    const n = normalizeChart(c)
    expect(c).toEqual(before)
    expect(n).not.toBe(c)
  })

  it('beat を 1/resolution に丸め、vel 省略を 80 で埋める（notes と accompaniment）', () => {
    const c = minimal()
    c['notes'] = [
      { midi: 60, beat: 0.3333, dur: 1 },
      { midi: 62, beat: 1.00000001, dur: 1, vel: 100 },
    ]
    c['accompaniment'] = [{ midi: 48, beat: 0.50000001, dur: 1 }]
    const n = normalizeChart(c) as Rec
    const notes = n['notes'] as Rec[]
    expect(notes[0]?.['beat']).toBeCloseTo(80 / 240, 12)
    expect(notes[0]?.['vel']).toBe(80)
    expect(notes[1]?.['beat']).toBe(1)
    expect(notes[1]?.['vel']).toBe(100)
    expect((n['accompaniment'] as Rec[])[0]?.['beat']).toBe(0.5)
    expect((n['accompaniment'] as Rec[])[0]?.['vel']).toBe(80)
    expect(validateChart(n).ok).toBe(true)
  })

  it('resolution が無ければ 240 を埋めて丸め、あればその値で丸める。正の整数でなければ 240 で丸めるだけ', () => {
    const c = minimal()
    c['pulse'] = { tempo: [{ beat: 0, bpm: 120 }] }
    c['notes'] = [{ midi: 60, beat: 0.001, dur: 1 }]
    const n = normalizeChart(c) as Rec
    expect((n['notes'] as Rec[])[0]?.['beat']).toBe(0)
    expect((n['pulse'] as Rec)['resolution']).toBe(DEFAULT_RESOLUTION)
    expect(c['pulse']).toEqual({ tempo: [{ beat: 0, bpm: 120 }] })
    const d = minimal()
    d['pulse'] = { resolution: 4, tempo: [{ beat: 0, bpm: 120 }] }
    d['notes'] = [{ midi: 60, beat: 0.3, dur: 1 }]
    expect(((normalizeChart(d) as Rec)['notes'] as Rec[])[0]?.['beat']).toBe(0.25)
    // resolution 0.5 は checkPulse が拒む値なので採用せず、beat 1 を書き換えない
    const e = minimal()
    e['pulse'] = { resolution: 0.5, tempo: [{ beat: 0, bpm: 120 }] }
    e['notes'] = [{ midi: 60, beat: 1, dur: 1 }]
    const m = normalizeChart(e) as Rec
    expect((m['notes'] as Rec[])[0]?.['beat']).toBe(1)
    expect((m['pulse'] as Rec)['resolution']).toBe(0.5)
    expect(codeAt(m, 'pulse.resolution')).toBe('range')
  })

  it('安定ソート: 同拍・同音は元の順を保つ（重複は残す。検査で duplicate になる）', () => {
    const c = minimal()
    c['notes'] = [
      { midi: 60, beat: 1, dur: 1, vel: 1 },
      { midi: 60, beat: 0, dur: 1, vel: 2 },
      { midi: 60, beat: 1, dur: 1, vel: 3 },
    ]
    const notes = (normalizeChart(c) as Rec)['notes'] as Rec[]
    expect(notes.map((n) => n['vel'])).toEqual([2, 1, 3])
  })

  it('accompaniment も beat 昇順・同拍 midi 昇順に並べ替える', () => {
    const c = minimal()
    c['accompaniment'] = [
      { midi: 48, beat: 5, dur: 1, track: 'bass' },
      { midi: 52, beat: 0, dur: 1 },
      { midi: 40, beat: 0, dur: 2 },
    ]
    const acc = (normalizeChart(c) as Rec)['accompaniment'] as Rec[]
    expect(acc.map((n) => [n['midi'], n['beat']])).toEqual([
      [40, 0],
      [52, 0],
      [48, 5],
    ])
    expect((c['accompaniment'] as Rec[])[0]?.['beat']).toBe(5)
  })

  it('オブジェクトでなければそのまま返し、壊れた notes は並べ替えない', () => {
    for (const x of [null, undefined, 'x', 7]) expect(normalizeChart(x)).toBe(x)
    const arr: unknown[] = []
    expect(normalizeChart(arr)).toBe(arr)
    const c = minimal()
    c['notes'] = [{ midi: 64, beat: 1, dur: 1 }, 'junk', { midi: 60, beat: 0, dur: 1 }]
    const notes = (normalizeChart(c) as Rec)['notes'] as unknown[]
    expect(notes[1]).toBe('junk')
    expect((notes[0] as Rec)['midi']).toBe(64)
  })
})
