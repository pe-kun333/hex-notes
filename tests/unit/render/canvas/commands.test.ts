import { describe, expect, it } from 'vitest'
import { buildFrame, frameNotes, seamCommands } from '../../../../src/render/canvas/commands.ts'
import { CORNER_AID_MIN_R, drawRadius } from '../../../../src/render/canvas/cells.ts'
import type { FxIntent } from '../../../../src/render/canvas/feedback.ts'
import {
  LAYERS,
  bboxOf,
  inRegion,
  regionsOf,
  type DrawCommand,
} from '../../../../src/render/canvas/primitives.ts'
import { buildKeyboardGrid } from '../../../../src/render/hex/grid.ts'
import { TRAVEL_MS, computeSizing } from '../../../../src/render/hex/sizing.ts'
import { LAYOUTS } from '../../../../src/layout/presets.ts'
import { SONGS, VARIANT_IDS, initialInput, setup } from './frame-setup.ts'

// src/render/canvas/commands.ts（buildFrame）。出どころ: 台帳 手順 6「コマンド列の全図形が落下域＋鍵盤図の矩形内」、
// design.md §2.2・§2.5・§2.8・§5.1 M0-03b「演出が領域外に出ない」、相談 B の描く順、decisions #27・#30（仮）。

const tags = (cmds: readonly DrawCommand[]): Record<string, number> => {
  const o: Record<string, number> = {}
  for (const c of cmds) o[c.tag] = (o[c.tag] ?? 0) + 1
  return o
}

describe('frameNotes', () => {
  it('canon・ableton/2/octave: keys が null の 17 音を除いた 34 音、和音の印は tick', () => {
    const s = setup('canon', 'ableton/2/octave')
    expect(s.chart.notes).toHaveLength(51)
    expect(s.notes).toHaveLength(34)
    expect(new Set(s.notes.map((n) => n.group)).size).toBe(17)
    // 76 BPM・2 拍 ＝ 1,578.9 ms ≥ 500 → ホールド
    expect(s.notes[0]?.tEndMs).toBeCloseTo(120_000 / 76, 9)
    expect(s.notes.every((n) => n.hold)).toBe(true)
  })

  it('鍵の MIDI は配列の表から（vmpk の Digit2 は 61）', () => {
    const s = setup('canon', 'vmpk/2/octave')
    const n = s.notes.find((x) => x.code === 'Digit2')
    expect(n?.midi).toBe(61)
  })
})

describe('領域（全図形が落下域＋鍵盤図の矩形内）', () => {
  const fx = (code: string, to: string): FxIntent[] => [
    { kind: 'edgeReturn', atMs: 0, code, grade: 'perfect' },
    { kind: 'slide', atMs: 0, from: code, to },
    { kind: 'flash', atMs: 0, codes: [code, to], mode: 'full' },
    { kind: 'flash', atMs: 0, codes: [to], mode: 'degraded' },
    { kind: 'judgeText', atMs: 0, grade: 'good', dtMs: 87 },
  ]
  const boxes = [
    { left: 0, top: 0, width: 850, height: 644 },
    { left: 0, top: 0, width: 764, height: 596 },
    { left: 0, top: 0, width: 577, height: 490 },
    // 高さ不足（R 24 で v_min）と、溝を食う幅不足
    { left: 0, top: 0, width: 600, height: 300 },
    { left: 0, top: 0, width: 470, height: 644 },
  ]

  it('6 曲×2 配列×2 着地×5 箱×5 時刻×演出あり・押下あり・文字 3 種で、外に出るコマンドが 0', () => {
    let checked = 0
    for (const song of SONGS)
      for (const vid of VARIANT_IDS)
        for (const box of boxes) {
          const s = setup(song, vid, box)
          const rg = regionsOf(s.sizing)
          const edgeKeys = [s.grid.cells[0], s.grid.cells[s.grid.cells.length - 1]]
          for (const mode of ['cell', 'line'] as const)
            for (const t of [-1000, 0, 700, 2500, 6000])
              for (const labels of ['both', 'key', 'note'] as const) {
                const a = edgeKeys[0]?.code ?? 'KeyA'
                const b = edgeKeys[1]?.code ?? 'KeyS'
                const cmds = buildFrame(
                  initialInput(s, {
                    mode,
                    labels,
                    t: { song: t, real: 60 },
                    pressed: new Set([a, b]),
                    effects: fx(a, b),
                  }),
                )
                for (const c of cmds) {
                  const ok = inRegion(bboxOf(c), c.region, rg)
                  if (!ok)
                    throw new Error(
                      `${song} ${vid} ${box.width}×${box.height} ${mode} t${t}: ${c.tag} が ${c.region} の外 ${JSON.stringify(bboxOf(c))}`,
                    )
                  checked++
                }
              }
        }
    expect(checked).toBeGreaterThan(100_000)
  })

  it('region の割り当て: 鍵盤図の物は keys、落ちる物は stage、判定文字は fall', () => {
    const s = setup('canon', 'vmpk/2/octave')
    const cmds = buildFrame(
      initialInput(s, { effects: fx('KeyA', 'KeyS'), t: { song: 0, real: 10 } }),
    )
    const regionOf = new Map<string, Set<string>>()
    for (const c of cmds)
      regionOf.set(
        `${c.layer}/${c.tag}`,
        (regionOf.get(`${c.layer}/${c.tag}`) ?? new Set()).add(c.region),
      )
    expect(Object.fromEntries([...regionOf].map(([k, v]) => [k, [...v].join()]))).toEqual({
      'bg/lane': 'fall',
      'bg/seam': 'keys',
      'keys/cell': 'keys',
      'keys/label': 'keys',
      'keys/noteName': 'keys',
      'keys/sharp': 'keys',
      'hints/hint': 'keys',
      'hints/hintDigit': 'keys',
      'notes/tail': 'stage',
      'notes/hull': 'stage',
      'notes/note': 'stage',
      'notes/label': 'stage',
      'notes/noteName': 'stage',
      'notes/sharp': 'stage',
      'fx/slide': 'keys',
      'fx/edgeReturn': 'keys',
      'fx/flash': 'keys',
      'fx/judgeText': 'fall',
    })
  })
})

describe('描く順（bg → keys → hints → notes → fx）', () => {
  it('層の順が崩れない。notes の中は 尾 → 殻 → セル → 文字', () => {
    for (const song of SONGS)
      for (const vid of VARIANT_IDS) {
        const s = setup(song, vid)
        const cmds = buildFrame(initialInput(s, { t: { song: 500, real: 0 } }))
        const li = cmds.map((c) => LAYERS.indexOf(c.layer))
        expect(li).toEqual([...li].sort((a, b) => a - b))
        const order = ['tail', 'hull', 'note', 'text']
        const ni = cmds
          .filter((c) => c.layer === 'notes')
          .map((c) => order.indexOf(c.kind === 'text' ? 'text' : c.tag))
        expect(ni).toEqual([...ni].sort((a, b) => a - b))
      }
  })

  it('落ちるセルは着地の遅い順（早い音が上に重なる）', () => {
    const s = setup('scale', 'ableton/2/octave')
    const cmds = buildFrame(initialInput(s, { t: { song: 500, real: 0 } }))
    const ys = cmds
      .filter((c) => c.tag === 'note' && c.kind === 'poly')
      .map((c) => (c.kind === 'poly' ? Math.max(...c.pts.map((p) => p[1])) : 0))
    expect(ys.length).toBeGreaterThan(2)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
  })
})

describe('鍵盤図（§2.2・§2.5、decisions #30）', () => {
  const s = setup('twinkle', 'ableton/2/octave')

  it('ableton: 音のある 17 鍵は塗りと縁の 2 コマンド、空の 3 鍵は 1 コマンド（計 37）。♯ は黒鍵 7 個', () => {
    const cmds = buildFrame(initialInput(s, { t: { song: -5000, real: 0 } }))
    expect(tags(cmds).cell).toBe(17 * 2 + 3)
    expect(tags(cmds).sharp).toBe(7)
  })

  it('押下中の鍵は塗りが不透明・縁が白 2.5 px', () => {
    const cmds = buildFrame(
      initialInput(s, { t: { song: -5000, real: 0 }, pressed: new Set(['KeyA']) }),
    )
    const a = s.grid.byCode.get('KeyA')
    const mine = cmds.filter(
      (c) =>
        c.tag === 'cell' &&
        c.kind === 'poly' &&
        Math.abs((c.pts[0]?.[0] ?? 0) - (a?.cx ?? 0)) < 30 &&
        Math.abs((c.pts[1]?.[1] ?? 0) - (a?.cy ?? 0)) < 30,
    )
    expect(
      mine.some((c) => c.kind === 'poly' && c.stroke === 'pressedEdge' && c.width === 2.5),
    ).toBe(true)
    expect(mine.some((c) => c.kind === 'poly' && c.fill === 'shade2' && (c.alpha ?? 1) === 1)).toBe(
      true,
    )
  })

  it('R < 26 で角の補助（♯）を消す。黒鍵は 30° 回したまま', () => {
    const small = buildKeyboardGrid('ableton', 25, { left: 0, top: 0 })
    const cmds = buildFrame(initialInput({ ...s, grid: small }, { t: { song: -5000, real: 0 } }))
    expect(CORNER_AID_MIN_R).toBe(26)
    expect(tags(cmds).sharp).toBeUndefined()
    // 30° 回した六角の頂点 0 は真右（y がセルの中心と同じ）
    const w = small.byCode.get('KeyW')
    const poly = cmds.find(
      (c) =>
        c.tag === 'cell' &&
        c.kind === 'poly' &&
        Math.abs((c.pts[0]?.[1] ?? 0) - (w?.cy ?? -1)) < 1e-9 &&
        (c.pts[0]?.[0] ?? 0) > (w?.cx ?? 0),
    )
    expect(poly).toBeDefined()
  })

  it('白鍵の塗りは段の明度（ableton の A 段は shade2、vmpk の Z 段は shade3）、黒鍵は black', () => {
    const fills = (cmds: DrawCommand[]) =>
      new Set(
        cmds
          .filter((c) => c.tag === 'cell' && c.kind === 'poly' && c.fill)
          .map((c) => (c.kind === 'poly' ? c.fill : '')),
      )
    expect(fills(buildFrame(initialInput(s, { t: { song: -5000, real: 0 } })))).toEqual(
      new Set(['shade2', 'black', 'cellEmpty']),
    )
    const v = setup('twinkle', 'vmpk/2/octave')
    expect(fills(buildFrame(initialInput(v, { t: { song: -5000, real: 0 } })))).toEqual(
      new Set(['shade1', 'shade3', 'black', 'cellEmpty']),
    )
  })

  it('継ぎ目は vmpk だけ（2 本の折れ線、1 px）。4 段でも wicki には引かない（decisions #30(f)）', () => {
    const counts = (['ableton', 'vmpk', 'genshin', 'wicki'] as const).map(
      (l) => seamCommands(buildKeyboardGrid(l, 28, { left: 0, top: 0 })).length,
    )
    expect(counts).toEqual([0, 2, 0, 0])
    const v = setup('twinkle', 'vmpk/2/octave')
    const seam = seamCommands(v.grid)
    expect(seam.every((c) => c.width === 1 && c.pts.length === 21)).toBe(true)
  })

  it('文字「音名」でも鍵盤図はキー文字を残す（note → both）、「なし」はキー文字だけ（m1 drawCell L401、decisions #30(d)）', () => {
    const keysTags = (labels: 'note' | 'none') =>
      tags(
        buildFrame(initialInput(s, { labels, t: { song: -5000, real: 0 } })).filter(
          (c) => c.layer === 'keys',
        ),
      )
    // ableton: 音のある 17 鍵＋空の 3 鍵
    expect(keysTags('note')).toMatchObject({ label: 20, noteName: 17 })
    expect(keysTags('none').label).toBe(20)
    expect(keysTags('none').noteName).toBeUndefined()
  })
})

describe('低負荷の段（演出なし → 殻なし → 奥行きなし）', () => {
  const s = setup('canon', 'ableton/2/octave')
  const fx: FxIntent[] = [{ kind: 'flash', atMs: 0, codes: ['KeyA'], mode: 'full' }]
  const at = (level: 0 | 1 | 2 | 3) =>
    buildFrame(initialInput(s, { level, effects: fx, t: { song: 0, real: 10 } }))

  it('段 0 は閃光・殻あり、段 1 で閃光なし、段 2 で殻なし', () => {
    expect(tags(at(0)).flash).toBe(1)
    expect(tags(at(0)).hull).toBeGreaterThan(0)
    expect(tags(at(1)).flash).toBeUndefined()
    expect(tags(at(1)).hull).toBeGreaterThan(0)
    expect(tags(at(2)).hull).toBeUndefined()
  })

  it('段 3 で奥行きなし（上の段のセルも最下段と同じ径）', () => {
    const radiusOf = (cmds: DrawCommand[], code: string): number => {
      const c = s.grid.byCode.get(code)
      const p = cmds.find(
        (x) =>
          x.tag === 'cell' &&
          x.kind === 'poly' &&
          x.pts.some((q) => Math.abs(q[0] - (c?.cx ?? 0)) < 1e-9 && q[1] < (c?.cy ?? 0)),
      )
      if (!p || p.kind !== 'poly' || !c) return Number.NaN
      return Math.max(...p.pts.map((q) => Math.hypot(q[0] - c.cx, q[1] - c.cy)))
    }
    expect(radiusOf(at(0), 'KeyQ')).toBeCloseTo(0.93 * 28 * 0.96, 9)
    expect(radiusOf(at(3), 'KeyQ')).toBeCloseTo(0.93 * 28, 9)
  })
})

describe('一本線（対照）', () => {
  it('line のときだけ一本線 1 本、全部のセルが同じ y で着地', () => {
    const s = setup('canon', 'vmpk/2/octave')
    expect(tags(buildFrame(initialInput(s))).landingLine).toBeUndefined()
    const cmds = buildFrame(initialInput(s, { mode: 'line' }))
    expect(tags(cmds).landingLine).toBe(1)
    const ys = new Set(
      cmds
        .filter((c) => c.tag === 'note' && c.kind === 'poly')
        .map((c) =>
          c.kind === 'poly'
            ? Math.round((c.pts.reduce((m, p) => m + p[1], 0) / c.pts.length) * 100)
            : 0,
        ),
    )
    expect(ys.size).toBe(1)
  })
})

describe('上端で切る（箱の上端にかかるセル）', () => {
  it('切ったセルは切り口の辺を描かず、文字は出さない', () => {
    const s = setup('scale', 'ableton/2/octave')
    // 着地 1,500 ms 前 − 少しのとき、最上段（Q）のセルは上端にかかる。scale は白鍵だけなので A 段で確かめる
    let found = false
    for (let t = -2000; t <= 3000 && !found; t += 10) {
      const cmds = buildFrame(initialInput(s, { t: { song: t, real: 0 }, labels: 'key' }))
      const cut = cmds.find((c) => c.tag === 'note' && c.kind === 'poly' && c.edges !== undefined)
      if (cut && cut.kind === 'poly') {
        found = true
        expect(Math.min(...cut.pts.map((p) => p[1]))).toBeCloseTo(s.sizing.fallTop + 0.75, 9)
      }
    }
    expect(found).toBe(true)
  })
})

describe('全配列の鍵盤図（譜面なし。全鍵を押下・全鍵に縁の返しと閃光）', () => {
  const boxes = [
    { left: 0, top: 0, width: 850, height: 644 },
    { left: 0, top: 0, width: 577, height: 490 },
    { left: 0, top: 0, width: 600, height: 300 },
  ]
  it('ableton・vmpk・genshin・wicki × 3 箱 × 段 0・3 × 2 着地で、外に出るコマンドが 0（wicki の端の黒鍵を含む）', () => {
    for (const layout of ['ableton', 'vmpk', 'genshin', 'wicki'] as const)
      for (const box of boxes) {
        const sizing = computeSizing(box, LAYOUTS[layout].rowsUsed, TRAVEL_MS.beginner)
        const grid = buildKeyboardGrid(layout, sizing.R, { left: sizing.kbLeft, top: sizing.kbTop })
        const codes = grid.cells.map((c) => c.code)
        const effects: FxIntent[] = [
          ...codes.map((code): FxIntent => ({ kind: 'edgeReturn', atMs: 0, code, grade: 'miss' })),
          { kind: 'flash', atMs: 0, codes, mode: 'full' },
          { kind: 'flash', atMs: 0, codes, mode: 'degraded' },
        ]
        const rg = regionsOf(sizing)
        for (const level of [0, 3] as const)
          for (const mode of ['cell', 'line'] as const) {
            const cmds = buildFrame({
              sizing,
              grid,
              mode,
              notes: [],
              t: { song: 0, real: 120 },
              pressed: new Set(codes),
              effects,
              labels: 'both',
              hints: true,
              level,
            })
            const bad = cmds.filter((c) => !inRegion(bboxOf(c), c.region, rg))
            expect(bad.map((c) => `${layout} ${box.width} ${level} ${mode} ${c.tag}`)).toEqual([])
          }
      }
  })

  it('wicki の端の列の黒鍵（Slash 66・gx 10.5、Digit1 63・gx 0）は径を √3/2·R − 1.5 に抑え、端でない黒鍵（KeyQ 58・gx 0.5）は抑えない', () => {
    const g = buildKeyboardGrid('wicki', 28, { left: 0, top: 0 })
    const cell = (code: string) => {
      const c = g.byCode.get(code)
      if (!c) throw new Error(code)
      return c
    }
    const cap = (Math.sqrt(3) / 2) * 28 - 1.5
    expect(drawRadius(g, cell('Slash'), 'cell', 0.93, true)).toBeCloseTo(cap, 9)
    // Digit1 は 3 段上で 0.93·28·0.96³ ＝ 23.04 ＞ 22.75 なので、奥行きがあっても抑えが効く
    expect(drawRadius(g, cell('Digit1'), 'cell', 0.93, true)).toBeCloseTo(cap, 9)
    expect(drawRadius(g, cell('Digit1'), 'cell', 0.93, false)).toBeCloseTo(cap, 9)
    expect(drawRadius(g, cell('KeyQ'), 'cell', 0.93, false)).toBeCloseTo(0.93 * 28, 9)
  })
})

describe('落下域が低い箱の判定文字（添え字は収まるときだけ）', () => {
  it('ableton の箱 850×112（D 20）・850×132（D 40）・850×146（D 54）で判定文字が落下域に収まる', () => {
    for (const h of [112, 132, 146]) {
      const s = setup('twinkle', 'ableton/2/octave', { left: 0, top: 0, width: 850, height: h })
      const rg = regionsOf(s.sizing)
      const cmds = buildFrame(
        initialInput(s, {
          effects: [{ kind: 'judgeText', atMs: 0, grade: 'good', dtMs: 87 }],
          t: { song: 0, real: 100 },
        }),
      )
      const texts = cmds.filter((c) => c.tag === 'judgeText')
      expect(texts.length).toBe(h === 146 ? 2 : 1)
      for (const c of texts) expect(inRegion(bboxOf(c), c.region, rg)).toBe(true)
    }
  })
})
