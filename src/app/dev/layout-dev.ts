// 配列プリセット層の開発ページ（M0-07、手順 9）。m2 の位相表を src/layout/ の部品で再現し、U-01（実機の段ずれ計測）を
// 記録する（§5.1 M0-07「m2 が再現。U-01 で黒鍵位相の合否」）。製品画面ではない（導線は開発時だけ、src/main.ts）。
// 段ずれの申告（既定の表か 1/4u 刻みの入力）× 配列で、段間ごとの位相・効く段間・勧める幾何・赤い組（正六角で隣なのに
// 物理で 1/4u 以上ずれる）・物理との差・同音の鍵・刻印（getLayoutMap か JIS／US）を出し、鍵盤図を ① 正六角 ② 物理座標
// で並べる。押した鍵は両方の図で光る。下の JSON を U-01 の記録に使う。performance.now の直呼びは src/app/ だけ。

import {
  DEFAULT_GEOMETRY,
  GEOMETRY_MODES,
  fallbackRowDiffs,
  labelsFor,
  recommendGeometry,
  type GeometryMode,
} from '../../layout/fallback.ts'
import {
  defaultLegendKind,
  legendOf,
  type LegendKind,
  type LegendResult,
} from '../../layout/legend.ts'
import { layoutPhase, type LayoutPhase, type PhaseLevel } from '../../layout/phase.ts'
import { KEY_ROWS, LAYOUTS, midiOf } from '../../layout/presets.ts'
import { samePitchGroups } from '../../layout/same-pitch.ts'
import {
  DEFAULT_STAGGER,
  GAP_NAMES,
  STAGGER_MAX_U,
  STAGGER_PRESETS,
  STAGGER_STEP_U,
  parseStagger,
  physOffFor,
  redPairs,
  type Stagger,
} from '../../layout/stagger.ts'
import { noteName } from '../../render/canvas/cells.ts'
import { ROW_OFF, SQ3, hexVertices, isBlackKey, rotationOf } from '../../render/hex/hex.ts'
import { LAYOUT_IDS, type KeyCode, type LayoutId } from '../../shared/types.ts'
import { attachKeyboard } from './dom-input.ts'

const ROW_NAMES = ['数字段', 'Q 段', 'A 段', 'Z 段'] as const
const GEOMETRY_NAMES: Readonly<Record<GeometryMode, string>> = {
  regular: '正六角（既定）',
  physical: '物理せん断',
  fallback: '退避（正六角のまま文字だけで押す）',
}
const LEVEL_TEXT: Readonly<Record<PhaseLevel, string>> = {
  ok: '合う',
  mid: 'ずれる',
  ng: '合わない',
}

type KeyboardApi = { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> }

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  Object.assign(e, props)
  e.append(...children)
  return e
}

function select<T extends string>(options: readonly [T, string][], value: T): HTMLSelectElement {
  const s = el('select')
  for (const [v, label] of options) s.append(el('option', { value: v, textContent: label }))
  s.value = value
  return s
}

/** u の分数表記（m2 fmtU L194） */
function fmtU(v: number): string {
  const t: Record<string, string> = {
    '0': '0',
    '0.25': '1/4',
    '0.5': '1/2',
    '0.75': '3/4',
    '1': '1',
  }
  return t[String(v)] ?? String(Math.round(v * 1000) / 1000)
}

function sgn(d: number): string {
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)}`
}

/** 段間 1 つの言葉（m2 updatePhase L456） */
function verdictText(level: PhaseLevel, err: number, iso: boolean): string {
  if (level === 'ok') return iso ? '合う（1/2u ずれ）' : '合う（黒鍵が白鍵の間）'
  if (level === 'mid') return `${fmtU(Math.round(err * 4) / 4)}u ずれる`
  return iso ? '合わない（真上）' : '合わない（黒鍵が真上）'
}

/** 全体の注記（m2 updatePhase L458–462） */
function phaseNote(p: LayoutPhase, layout: LayoutId, stagName: string): string {
  const name = LAYOUTS[layout].name
  if (p.worst === null) return `${name} は黒鍵も段またぎの意味も無いので、位相は関係なし。`
  const head = `この端末（${stagName}）× ${name}: `
  if (p.worst === 'ok')
    return head + (p.iso ? '段ずれが六角格子と合う。' : '黒鍵の位相が六角格子と合う。')
  const tail = '退避「正六角のまま文字だけで押す」か、鍵盤図を物理座標に歪めるかを比べてください。'
  if (p.worst === 'mid')
    return (
      head +
      (p.iso
        ? '1/4u ずれる（六角の隣接に寄るが真上ではない）。'
        : '1/4u ずれる（黒鍵は白鍵の間寄り）。') +
      tail
    )
  return head + '位相が合わない（真上）。' + tail
}

function main(): void {
  const root = document.getElementById('dev')
  if (!(root instanceof HTMLElement)) throw new Error('layout-dev: #dev が無い')

  const layoutSel = select<LayoutId>(
    LAYOUT_IDS.map((id) => [id, LAYOUTS[id].name]),
    'ableton',
  )
  const stagSel = select<string>(
    [...STAGGER_PRESETS.map((p): [string, string] => [p.id, p.name]), ['custom', '（入力中）']],
    'ansi',
  )
  const stagIn = [0, 1, 2].map((i) =>
    el('input', {
      type: 'number',
      min: '0',
      max: String(STAGGER_MAX_U),
      step: String(STAGGER_STEP_U),
      value: String(DEFAULT_STAGGER[i]),
      title: GAP_NAMES[i],
    }),
  )
  const legendSel = select<LegendKind>(
    [
      ['jis', 'JIS'],
      ['us', 'US'],
    ],
    defaultLegendKind(navigator.language),
  )
  const geomSel = select<GeometryMode>(
    GEOMETRY_MODES.map((g) => [g, GEOMETRY_NAMES[g]]),
    DEFAULT_GEOMETRY,
  )
  const nameIn = el('input', { type: 'text', placeholder: '端末の名前（U-01 の記録）' })
  const tbody = el('tbody')
  const table = el(
    'table',
    {},
    el(
      'thead',
      {},
      el('tr', {}, ...['段間', '申告', '位相', 'この配列で効く'].map((h) => el('th', {}, h))),
    ),
    tbody,
  )
  const note = el('p', {})
  const facts = el('dl')
  const canvas = el('canvas', { tabIndex: 0 })
  const out = el('textarea', { readOnly: true })

  root.append(
    el('h1', {}, '配列層（開発ページ、手順 9）'),
    el(
      'p',
      { className: 'note' },
      '段ずれの申告（U-01: 実機で 数字–Q／Q–A／A–Z の左端のずれを 1u 単位で測る。ADR 0001）と配列から、黒鍵の位相と勧める幾何を出す。' +
        '鍵を押すと両方の図で光る（図を一度クリックして焦点を移す）。下の JSON を U-01 の記録に使う。',
    ),
    el(
      'div',
      { className: 'controls' },
      layoutSel,
      stagSel,
      ...stagIn.flatMap((input, i) => [el('label', {}, `${GAP_NAMES[i]} `, input)]),
    ),
    el(
      'div',
      { className: 'controls' },
      el('label', {}, '刻印（getLayoutMap が無いとき） ', legendSel),
      el('label', {}, '幾何 ', geomSel),
      nameIn,
    ),
    table,
    note,
    facts,
    canvas,
    out,
  )

  let stagger: Stagger = DEFAULT_STAGGER
  let layoutMap: ReadonlyMap<string, string> | null = null
  let legend: LegendResult = legendOf(null, legendSel.value as LegendKind)
  let pressed: ReadonlySet<KeyCode> = new Set()

  const stagName = (): string =>
    stagSel.value === 'custom'
      ? `申告 ${stagger.map(fmtU).join('・')}`
      : (STAGGER_PRESETS.find((p) => p.id === stagSel.value)?.name ?? stagSel.value)

  const fact = (k: string, v: string): Node[] => [el('dt', {}, k), el('dd', {}, v)]

  const draw = (): void => {
    const layout = layoutSel.value as LayoutId
    const geom = geomSel.value as GeometryMode
    const labels = labelsFor(geom, 'both')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const cssW = canvas.clientWidth || 900
    const w = cssW / 12.5
    const R = w / SQ3
    const unit = w
    const showPhys = geom !== 'fallback'
    const hexH = 6.5 * R + 28
    const physH = showPhys ? 4 * unit + 28 : 0
    const cssH = Math.ceil(hexH + physH + 12)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.height = `${cssH}px`
    const ctx = canvas.getContext('2d')
    if (ctx === null) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const cell = (code: KeyCode, cx: number, cy: number, r: number): void => {
      const midi = midiOf(layout, code)
      const pts = hexVertices(cx, cy, r, rotationOf(midi))
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      ctx.closePath()
      const on = pressed.has(code)
      ctx.fillStyle = on
        ? '#f4f2ea'
        : midi === null
          ? 'rgba(255,255,255,0.03)'
          : isBlackKey(midi)
            ? '#3d4456'
            : '#5d6577'
      ctx.fill()
      ctx.strokeStyle = midi === null ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
      const ink = on ? '#0b0d12' : midi === null ? 'rgba(255,255,255,0.3)' : '#f4f2ea'
      ctx.fillStyle = ink
      const k = legend.legend.get(code) ?? code
      if (midi === null || labels === 'key') {
        ctx.font = `700 ${Math.round(r * 0.8)}px system-ui, sans-serif`
        ctx.fillText(k, cx, cy)
      } else {
        ctx.font = `700 ${Math.round(r * 0.72)}px system-ui, sans-serif`
        ctx.fillText(k, cx, cy - r * 0.22)
        ctx.font = `500 ${Math.round(r * 0.42)}px system-ui, sans-serif`
        ctx.fillText(noteName(midi), cx, cy + r * 0.45)
      }
    }

    // ① 正六角（全 40 鍵）。赤い組は中心を結ぶ赤い線
    ctx.textAlign = 'left'
    ctx.fillStyle = '#8a8f99'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(
      geom === 'fallback'
        ? '① 正六角格子（退避: 文字だけで押す）'
        : '① 正六角格子（均等 1/2 ずれ）',
      8,
      14,
    )
    ctx.textAlign = 'center'
    const hexCenter = (row: number, col: number): [number, number] => [
      8 + w * ((ROW_OFF[row] ?? 0) + col + 0.5),
      28 + R + 1.5 * R * row,
    ]
    const pos = new Map<KeyCode, [number, number]>()
    KEY_ROWS.forEach((codes, row) =>
      codes.forEach((code, col) => {
        const [cx, cy] = hexCenter(row, col)
        pos.set(code, [cx, cy])
        cell(code, cx, cy, R * 0.93)
      }),
    )
    ctx.strokeStyle = '#f06a6a'
    ctx.lineWidth = 2
    for (const p of redPairs(stagger)) {
      const a = pos.get(p.a)
      const b = pos.get(p.b)
      if (!a || !b) continue
      const mx = (a[0] + b[0]) / 2
      const my = (a[1] + b[1]) / 2
      ctx.beginPath()
      ctx.moveTo(mx - (b[1] - a[1]) * 0.18, my + (b[0] - a[0]) * 0.18)
      ctx.lineTo(mx + (b[1] - a[1]) * 0.18, my - (b[0] - a[0]) * 0.18)
      ctx.stroke()
    }

    // ② 物理座標（申告の段ずれ。行の間は 1u、六角は触れない。m2 GRIDS.phys）
    if (!showPhys) return
    const top = hexH + 12
    ctx.textAlign = 'left'
    ctx.fillStyle = '#8a8f99'
    ctx.font = '13px system-ui, sans-serif'
    ctx.fillText(`② 物理座標（${stagName()}）`, 8, top + 14)
    ctx.textAlign = 'center'
    const off = physOffFor(stagger)
    KEY_ROWS.forEach((codes, row) =>
      codes.forEach((code, col) =>
        cell(
          code,
          8 + unit * ((off[row] ?? 0) + col + 0.5),
          top + 28 + unit * (row + 0.5),
          R * 0.84,
        ),
      ),
    )
  }

  const refresh = (): void => {
    const layout = layoutSel.value as LayoutId
    const p = layoutPhase(layout, stagger)
    tbody.replaceChildren(
      ...p.gaps.map((g) =>
        el(
          'tr',
          {},
          el('td', {}, GAP_NAMES[g.gap] ?? String(g.gap)),
          el('td', {}, `${fmtU(g.v)}u`),
          el('td', { className: g.level }, verdictText(g.level, g.err, p.iso)),
          el('td', {}, g.relevant ? '●' : el('span', { className: 'dim' }, '—')),
        ),
      ),
    )
    note.textContent = phaseNote(p, layout, stagName())
    const rec = recommendGeometry(p)
    const diffs = fallbackRowDiffs(stagger)
    const red = redPairs(stagger)
    const same = samePitchGroups(layout)
    facts.replaceChildren(
      ...fact('勧める幾何', GEOMETRY_NAMES[rec]),
      ...fact(
        '物理との差（数字段を基準）',
        diffs.map((d, i) => `${ROW_NAMES[i + 1]} ${sgn(Math.round(d * 100) / 100)}u`).join('、'),
      ),
      ...fact(
        '赤い組（正六角で隣、物理で 1/4u 以上ずれる）',
        red.length === 0
          ? 'なし'
          : `${red.length} 組（${[...new Set(red.map((r) => GAP_NAMES[r.gap]))].join('・')}）`,
      ),
      ...fact(
        '同音の鍵（既定は 60 以上で上の段）',
        same.length === 0
          ? 'なし'
          : same
              .map(
                (g) =>
                  `${noteName(g.midi)}: ${g.codes.map((c) => legend.legend.get(c) ?? c).join('／')}`,
              )
              .join('、'),
      ),
      ...fact(
        '刻印',
        legend.source === 'layoutMap'
          ? `getLayoutMap（QWERTY から ${legend.changed} 鍵を変えた）`
          : `getLayoutMap なし → ${legend.source.toUpperCase()}（40 鍵は JIS・US で同じ文字。AZERTY・Dvorak でも QWERTY の文字で出す）`,
      ),
    )
    out.value = JSON.stringify(
      {
        page: 'layout-dev（手順 9、U-01）',
        at: new Date().toISOString(),
        ua: navigator.userAgent,
        device: nameIn.value,
        stagger: { name: stagName(), v: stagger },
        layout,
        phase: p.gaps.map((g) => ({
          gap: GAP_NAMES[g.gap],
          v: g.v,
          level: g.level,
          relevant: g.relevant,
        })),
        worst: p.worst,
        recommend: rec,
        legend: { source: legend.source, changed: legend.changed },
      },
      null,
      1,
    )
    draw()
  }

  const readInputs = (): void => {
    const v = parseStagger(
      stagIn.map((i) => (i.value.trim() === '' ? Number.NaN : Number(i.value))),
    )
    if (v === null) {
      note.textContent = `段ずれは 0〜${STAGGER_MAX_U} の数を 3 つ（u）`
      return
    }
    stagger = v
    const preset = STAGGER_PRESETS.find((p) => p.v.every((x, i) => x === v[i]))
    stagSel.value = preset?.id ?? 'custom'
    refresh()
  }

  stagSel.addEventListener('change', () => {
    const preset = STAGGER_PRESETS.find((p) => p.id === stagSel.value)
    if (!preset) return
    stagger = preset.v
    stagIn.forEach((input, i) => (input.value = String(preset.v[i])))
    refresh()
  })
  for (const input of stagIn) input.addEventListener('input', readInputs)
  for (const s of [layoutSel, geomSel]) s.addEventListener('change', refresh)
  nameIn.addEventListener('input', refresh)
  legendSel.addEventListener('change', () => {
    legend = legendOf(layoutMap, legendSel.value as LegendKind)
    refresh()
  })
  window.addEventListener('resize', draw)

  attachKeyboard(
    window,
    (_events, state) => {
      pressed = new Set(state.down.keys())
      draw()
    },
    { focusTarget: canvas },
  )

  const kb = (navigator as Navigator & { keyboard?: KeyboardApi }).keyboard
  if (kb?.getLayoutMap) {
    kb.getLayoutMap()
      .then((m) => {
        layoutMap = m
        legend = legendOf(layoutMap, legendSel.value as LegendKind)
        refresh()
      })
      .catch(() => refresh())
  }
  refresh()
}

main()
