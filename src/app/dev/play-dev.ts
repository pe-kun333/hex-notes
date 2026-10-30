// 描画層の開発ページ（M0-03b、手順 6）。6 曲×2 配列（＋負荷譜面）を段別着地か一本線で流し、手弾きで「位置で読めるか」を
// 確かめる（§5.7「M0-03b の途中」、ADR 0006）。製品画面ではない（導線は開発時だけ、src/main.ts）。
// 仮時計は m3 nvTime L351 相当（performance.now − 開始、手順 7 の時計層で差し替え）。手弾きは手順 5 の attachKeyboard、
// 押下の時刻は press の tsPerf。判定は開発用の仮（±300 ms の対応付けと入門者の窓。製品の判定層は手順 8）。
// performance.now の直呼びは src/app/ だけ（src/README.md）。

import { buildVariant } from '../../chart/variants.ts'
import type { InputEvent } from '../../input/keyboard.ts'
import { LAYOUTS } from '../../layout/presets.ts'
import type { Chart, Judgment, KeyCode, LayoutId, Variant } from '../../shared/types.ts'
import type { FrameNote, LabelMode } from '../../render/canvas/cells.ts'
import { buildFrame, frameNotes } from '../../render/canvas/commands.ts'
import { admitFlash, emptyBudget, type BudgetState } from '../../render/canvas/budget.ts'
import { flashArea, pruneEffects, type FxIntent } from '../../render/canvas/feedback.ts'
import { flush } from '../../render/canvas/flush.ts'
import { feedFrame, initialLowLoad, type LowLoadState } from '../../render/canvas/lowload.ts'
import { regionsOf } from '../../render/canvas/primitives.ts'
import { buildKeyboardGrid, type KeyboardGrid } from '../../render/hex/grid.ts'
import { hexDist } from '../../render/hex/hex.ts'
import type { LandingMode } from '../../render/hex/landing.ts'
import { TRAVEL_MS, computeSizing, sizeForViewport, type Sizing } from '../../render/hex/sizing.ts'
import { attachKeyboard } from './dom-input.ts'
import {
  MATCH_MS,
  matchPress,
  summarize,
  type NoteOutcome,
  type ReadabilitySummary,
} from './readability.ts'

/** 開始から拍 0 までの予備 ms（m1' LEAD 2.2 s を丸めた値） */
const LEAD_MS = 2000
/** 最後の着地の後に走りを閉じるまで ms（§4.2 終了「最終ノート＋1.2 秒」） */
const TAIL_MS = 1200
/** 開発用の仮の窓（入門者 24/100/180、遅れ側 ×1.3。§2.3。製品の判定は手順 8） */
const WINDOWS: readonly [Judgment, number][] = [
  ['perfect', 24],
  ['great', 100],
  ['good', 180],
]
const LATE_FACTOR = 1.3

const SONGS = ['twinkle', 'ode', 'scale', 'chroma', 'duet', 'canon'] as const
const STRESS = 'stress'
type SongId = (typeof SONGS)[number] | typeof STRESS

/** 負荷譜面（dev 専用）: 60〜76 の半音階を上下に 3.5 音/秒・20 秒（ableton では Q↔A、vmpk では数字↔Q が交互） */
function stressChart(): Pick<Chart, 'name' | 'notes' | 'pulse'> {
  const notes: Chart['notes'] = []
  const up = Array.from({ length: 17 }, (_, i) => 60 + i)
  const seq = [...up, ...up.slice(1, -1).reverse()]
  for (let i = 0; i < 70; i++) notes.push({ midi: seq[i % seq.length] ?? 60, beat: i, dur: 0.5 })
  return {
    name: '負荷（半音階 3.5 音/秒・20 秒）',
    notes,
    pulse: { resolution: 240, tempo: [{ beat: 0, bpm: 210 }] },
  }
}

type Loaded = {
  name: string
  chart: Pick<Chart, 'notes' | 'pulse'>
  variants: Map<LayoutId, Variant>
}

async function loadSong(id: SongId): Promise<Loaded> {
  if (id === STRESS) {
    const c = stressChart()
    const variants = new Map<LayoutId, Variant>()
    for (const layout of ['ableton', 'vmpk'] as const)
      variants.set(layout, buildVariant(c, { layout, limit: 2, fold: 'octave' }))
    return { name: c.name, chart: c, variants }
  }
  const res = await fetch(`/tests/fixtures/charts/m1/${id}.hexnote.json`)
  if (!res.ok) throw new Error(`play-dev: ${id} が読めない（${res.status}）`)
  const chart = (await res.json()) as Chart
  const variants = new Map<LayoutId, Variant>()
  for (const v of chart.variants ?? [])
    if (v.limit === 2 && v.fold === 'octave') variants.set(v.layout, v)
  return { name: chart.name, chart, variants }
}

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

type RunRecord = {
  song: SongId
  layout: LayoutId
  mode: LandingMode
  viewport: string
  R: number
  v: number
  summary: ReadabilitySummary
  /** 利用者が付ける主観（読めた／読めない）。未記入は null */
  readable: boolean | null
  outcomes: NoteOutcome[]
}

type Run = {
  startNow: number
  notes: FrameNote[]
  states: Map<number, FrameNote['state']>
  outcomes: NoteOutcome[]
  /** 押下中の鍵 → ホールド中の音の添字 */
  holds: Map<KeyCode, number>
  endMs: number
}

function main(): void {
  const panel = document.getElementById('panel')
  const playerBox = document.getElementById('player')
  const canvas = document.getElementById('stage')
  if (
    !(panel instanceof HTMLElement) ||
    !(playerBox instanceof HTMLElement) ||
    !(canvas instanceof HTMLCanvasElement)
  )
    throw new Error('play-dev: 要素が無い')
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('play-dev: 2D の文脈が無い')

  const songSel = select<SongId>(
    [
      ['twinkle', 'きらきら星'],
      ['ode', '歓喜の歌'],
      ['scale', '音階'],
      ['chroma', '半音階'],
      ['duet', '二声'],
      ['canon', 'カノン進行'],
      [STRESS, '負荷（Q↔A 交互・20 秒）'],
    ],
    'twinkle',
  )
  const layoutSel = select<LayoutId>(
    [
      ['ableton', 'Ableton 型（2 段）'],
      ['vmpk', 'VMPK 型（4 段）'],
    ],
    'ableton',
  )
  const modeSel = select<LandingMode>(
    [
      ['cell', '段別着地（既定）'],
      ['line', '一本線（対照）'],
    ],
    'cell',
  )
  const labelSel = select<LabelMode>(
    [
      ['both', '文字: キー＋音名'],
      ['key', '文字: キー'],
      ['note', '文字: 音名'],
      ['none', '文字: なし'],
    ],
    'both',
  )
  const hintBox = el('input', { type: 'checkbox', checked: true })
  const flashBtn = el('button', { type: 'button', textContent: '閃光を試す（1 秒に 5 回）' })
  const status = el('div', { className: 'band', hidden: false })
  const info = el('div', { className: 'note' })
  const tbody = el('tbody')
  const table = el(
    'table',
    {},
    el(
      'thead',
      {},
      el(
        'tr',
        {},
        ...[
          '走り',
          '外し率',
          'dt SD',
          '上段 SD',
          '最下段 SD',
          '入れ違い',
          '和音の幅',
          '読めた',
        ].map((h) => el('th', {}, h)),
      ),
    ),
    tbody,
  )
  const out = el('textarea', {
    readOnly: true,
    placeholder: '走りを終えると記録がここに JSON で出ます（全部を選んでコピー）',
  })

  panel.append(
    el('h1', {}, '描画層（開発ページ、手順 6）'),
    el(
      'ol',
      {},
      el('li', {}, '曲・配列・着地を選ぶ（選んだ後は落下域を一度クリックして焦点を戻す）。'),
      el('li', {}, 'Space で開始。Escape で中止。セルが自分の鍵のセルに重なった瞬間に押す。'),
      el('li', {}, '曲が終わると表に 1 行増える。「読めた」を付け、最後に下の JSON を渡す。'),
    ),
    el('div', { className: 'row' }, songSel, layoutSel, modeSel),
    el('div', { className: 'row' }, labelSel, el('label', {}, hintBox, '辺ヒント'), flashBtn),
    status,
    info,
    table,
    out,
  )

  let loaded: Loaded | null = null
  let sizing: Sizing | null = null
  let grid: KeyboardGrid | null = null
  let notesTemplate: FrameNote[] = []
  let run: Run | null = null
  let effects: FxIntent[] = []
  let budget: BudgetState = emptyBudget()
  let low: LowLoadState = initialLowLoad()
  let pressed: ReadonlySet<KeyCode> = new Set()
  const runs: RunRecord[] = []
  let dpr = 1

  const layoutId = (): LayoutId => layoutSel.value as LayoutId
  const mode = (): LandingMode => modeSel.value as LandingMode

  const relayout = (): void => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const rows = LAYOUTS[layoutId()].rowsUsed
    const outer = sizeForViewport({ w: vw, h: vh }, rows, TRAVEL_MS.beginner)
    const box = outer.box
    const p = outer.player
    Object.assign(playerBox.style, {
      left: '12px',
      top: '12px',
      width: `${p.w}px`,
      height: `${p.h}px`,
    })
    Object.assign(panel.style, {
      left: '12px',
      top: `${12 + p.h + 12}px`,
      width: `${p.w}px`,
      height: `${Math.max(120, vh - p.h - 36)}px`,
    })
    Object.assign(canvas.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    })
    dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(box.width * dpr)
    canvas.height = Math.round(box.height * dpr)
    sizing = computeSizing(
      { left: 0, top: 0, width: box.width, height: box.height },
      rows,
      TRAVEL_MS.beginner,
      p,
    )
    grid = buildKeyboardGrid(layoutId(), sizing.R, { left: sizing.kbLeft, top: sizing.kbTop })
    info.textContent =
      `視口 ${vw}×${vh}、箱 ${box.width}×${box.height}、R ${sizing.R}、v ${sizing.v.toFixed(4)} px/ms、` +
      `見える時間 ${Math.round(sizing.travelMs)} ms${sizing.limited ? `（${sizing.limited} が足りない）` : ''}`
  }

  const reload = async (): Promise<void> => {
    stopRun(false)
    loaded = await loadSong(songSel.value as SongId)
    const v = loaded.variants.get(layoutId())
    notesTemplate = v ? frameNotes(loaded.chart, v) : []
    relayout()
    setStatus(
      `${loaded.name}・${LAYOUTS[layoutId()].name}・${mode() === 'cell' ? '段別着地' : '一本線'}: Space で開始`,
    )
  }

  const setStatus = (s: string): void => {
    status.textContent = s
  }

  const songNow = (nowPerf: number): number => (run ? nowPerf - run.startNow - LEAD_MS : -LEAD_MS)

  const startRun = (): void => {
    if (!grid || notesTemplate.length === 0) return
    const g = grid
    const now = performance.now()
    const outcomes: NoteOutcome[] = notesTemplate.map((n) => ({
      index: n.index,
      code: n.code,
      rowIndex: g.byCode.get(n.code)?.rowIndex ?? 0,
      tLandMs: n.tLandMs,
      group: n.group,
      pressMs: null,
      pressedCode: null,
    }))
    const last = notesTemplate.reduce((m, n) => Math.max(m, n.tEndMs), 0)
    run = {
      startNow: now,
      notes: notesTemplate,
      states: new Map(),
      outcomes,
      holds: new Map(),
      endMs: last + TAIL_MS,
    }
    effects = []
    setStatus('再生中（Escape で中止）')
    canvas.focus({ preventScroll: true })
  }

  const stopRun = (finished: boolean): void => {
    const r = run
    run = null
    if (!r || !finished || !loaded || !sizing) {
      if (r) setStatus('中止しました。Space でもう一度')
      return
    }
    const rec: RunRecord = {
      song: songSel.value as SongId,
      layout: layoutId(),
      mode: mode(),
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      R: sizing.R,
      v: Math.round(sizing.v * 10000) / 10000,
      summary: summarize(r.outcomes),
      readable: null,
      outcomes: r.outcomes,
    }
    runs.push(rec)
    addRow(rec)
    writeOut()
    setStatus('終わりました。表の「読めた」を付けてください。Space でもう一度')
  }

  const fmt = (x: number | null, unit = ''): string =>
    x === null ? '—' : `${Math.round(x)}${unit}`

  const addRow = (rec: RunRecord): void => {
    const s = rec.summary
    const rows = Object.keys(s.dtSdByRow)
      .map(Number)
      .sort((a, b) => a - b)
    const top = rows.length > 0 ? (s.dtSdByRow[rows[0] ?? 0] ?? null) : null
    const bottom = rows.length > 0 ? (s.dtSdByRow[rows[rows.length - 1] ?? 0] ?? null) : null
    const yes = el('input', { type: 'checkbox', title: '読めた' })
    yes.addEventListener('change', () => {
      rec.readable = yes.checked
      writeOut()
      canvas.focus({ preventScroll: true })
    })
    rec.readable = false
    tbody.append(
      el(
        'tr',
        {},
        el('td', {}, `${rec.song}・${rec.layout}・${rec.mode}`),
        el('td', {}, `${Math.round(s.missRate * 100)}%`),
        el('td', {}, fmt(s.dtSd)),
        el('td', {}, fmt(top)),
        el('td', {}, fmt(bottom)),
        el('td', {}, String(s.inversions)),
        el('td', {}, fmt(s.chordSpreadMedian)),
        el('td', {}, yes),
      ),
    )
  }

  const writeOut = (): void => {
    out.value = JSON.stringify(
      {
        page: 'play-dev（手順 6）',
        ua: navigator.userAgent,
        runs: runs.map((r) => ({
          ...r,
          outcomes: r.outcomes.map((o) => [
            o.index,
            o.code,
            o.rowIndex,
            Math.round(o.tLandMs),
            o.pressMs === null ? null : Math.round(o.pressMs * 10) / 10,
            o.pressedCode,
          ]),
        })),
      },
      null,
      1,
    )
  }

  const gradeOf = (dt: number): Judgment => {
    for (const [g, w] of WINDOWS) if (dt < 0 ? -dt <= w : dt <= w * LATE_FACTOR) return g
    return 'miss'
  }

  const pushFx = (fx: FxIntent): void => {
    effects = [...effects, fx]
  }

  const onPress = (code: KeyCode, tsPerf: number): void => {
    if (!run || !grid) return
    const t = songNow(tsPerf)
    const realNow = performance.now()
    const i = matchPress(run.outcomes, code, t)
    if (i === null) return
    const o = run.outcomes[i]
    const n = run.notes[i]
    if (!o || !n) return
    run.outcomes[i] = { ...o, pressMs: t, pressedCode: code }
    const dt = t - n.tLandMs
    if (o.code === code) {
      const grade = gradeOf(dt)
      run.states.set(n.index, n.hold && grade !== 'miss' ? 'holding' : 'done')
      if (n.hold && grade !== 'miss') run.holds.set(code, i)
      pushFx({ kind: 'edgeReturn', atMs: realNow, code, grade })
      pushFx({ kind: 'judgeText', atMs: realNow, grade, dtMs: dt })
    } else {
      const a = grid.byCode.get(o.code)
      const b = grid.byCode.get(code)
      const near = a && b && hexDist(a, b) === 1 && Math.abs(dt) <= 180 * (dt > 0 ? LATE_FACTOR : 1)
      run.states.set(n.index, 'done')
      if (near) {
        pushFx({ kind: 'slide', atMs: realNow, from: o.code, to: code })
        pushFx({ kind: 'judgeText', atMs: realNow, grade: 'near', dtMs: dt })
      } else pushFx({ kind: 'judgeText', atMs: realNow, grade: 'miss', dtMs: null })
    }
  }

  const onRelease = (code: KeyCode): void => {
    if (!run) return
    const i = run.holds.get(code)
    if (i === undefined) return
    run.holds.delete(code)
    const n = run.notes[i]
    if (n) run.states.set(n.index, 'done')
  }

  const onEvents = (events: InputEvent[]): void => {
    for (const ev of events) {
      if (ev.kind === 'press') onPress(ev.code, ev.tsPerf)
      else if (ev.kind === 'release') onRelease(ev.code)
      else if (ev.kind === 'role' && ev.role === 'primary') {
        if (!run) startRun()
      } else if ((ev.kind === 'role' && ev.role === 'pause') || ev.kind === 'pause') stopRun(false)
    }
  }

  attachKeyboard(
    window,
    (events, state) => {
      pressed = new Set(state.down.keys())
      onEvents(events)
    },
    { focusTarget: canvas },
  )

  flashBtn.addEventListener('click', () => {
    if (!grid || !sizing) return
    const g = grid
    const s = sizing
    const codes = g.cells.filter((c) => c.midi !== null).map((c) => c.code)
    for (let k = 0; k < 5; k++) {
      window.setTimeout(() => {
        const pick = [codes[(k * 7) % codes.length], codes[(k * 7 + 1) % codes.length]].filter(
          (c): c is string => c !== undefined,
        )
        const at = performance.now()
        const area = flashArea(pick, g, mode(), low.level < 3)
        const r = admitFlash(budget, at, area, regionsOf(s).stageArea)
        budget = r.state
        pushFx({ kind: 'flash', atMs: at, codes: pick, mode: r.mode })
      }, k * 150)
    }
    canvas.focus({ preventScroll: true })
  })

  for (const s of [songSel, layoutSel, modeSel]) s.addEventListener('change', () => void reload())
  window.addEventListener('resize', relayout)

  const frame = (ts: number): void => {
    const lo = feedFrame(low, ts)
    low = lo.state
    if (lo.changed)
      setStatus(`低負荷: 段 ${low.level} に落としました（演出なし→殻なし→奥行きなし）`)
    const now = performance.now()
    if (sizing && grid) {
      const t = songNow(now)
      let notes: FrameNote[] = notesTemplate
      if (run) {
        const r = run
        for (const o of r.outcomes) {
          if (o.pressMs === null && t > o.tLandMs + MATCH_MS && r.states.get(o.index) !== 'done') {
            r.states.set(o.index, 'done')
            pushFx({ kind: 'judgeText', atMs: now, grade: 'miss', dtMs: null })
          }
        }
        for (const [code, i] of r.holds) {
          const n = r.notes[i]
          if (n && t >= n.tEndMs) {
            r.holds.delete(code)
            r.states.set(n.index, 'done')
          }
        }
        notes = r.notes.map((n) => {
          const st = r.states.get(n.index)
          return st === undefined ? n : { ...n, state: st }
        })
        if (t > r.endMs) stopRun(true)
      }
      effects = pruneEffects(effects, now)
      const cmds = buildFrame({
        sizing,
        grid,
        mode: mode(),
        notes,
        t: { song: t, real: now },
        pressed,
        effects,
        labels: labelSel.value as LabelMode,
        hints: hintBox.checked,
        level: low.level,
      })
      flush(ctx, cmds, {
        regions: regionsOf(sizing),
        width: sizing.box.width,
        height: sizing.box.height,
        dpr,
      })
    }
    requestAnimationFrame(frame)
  }

  void reload().then(() => {
    canvas.focus({ preventScroll: true })
    requestAnimationFrame(frame)
  })
}

main()
