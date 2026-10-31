// 描画層の開発ページ（M0-03b、手順 6）。6 曲×2 配列（＋負荷譜面）を段別着地か一本線で流し、手弾きで「位置で読めるか」を
// 確かめる（§5.7「M0-03b の途中」、ADR 0006）。製品画面ではない（導線は開発時だけ、src/main.ts）。
// 時計は手順 7 の時計層（動画なしの ClockSource、src/play/session.ts でプレイの状態機械とつなぐ。decisions #32・#35）。
// Space で開始・再開（再開は同期中＝猶予 300 ms を通る）、Escape・タブの切替・窓の外の click で一時停止、一時停止中の
// Escape か「中止」で中止。手弾きは手順 5 の attachKeyboard、押下の時刻は press の tsPerf を時計の写像で曲 ms にする。
// 判定は手順 8 の判定層（src/judge/。プロファイル 2 組・NEAR・ホールド・猶予中の押下の保留・skipped・校正のオフセット、
// decisions #38〜#40）。「位置で読めるか」の記録（readability.ts、±300 ms の対応付け）は判定と別に、再生中で猶予の
// 終わり以後の押下だけ取る（ADR 0006 の確認を他の端末でもやり直せるように残す）。performance.now の直呼びは src/app/
// だけ（src/README.md）。
// 計測（手順 12、src/telemetry/）: 時計の出力・rAF・演奏の押下を集め、曲の終わりに play 行と calib 行（段 2 の提案、受けて
// いない）を IndexedDB の telemetry に足す。開いたときに device 行を 1 つ足す。行は開発ページ telemetry.html で見る。

import { buildVariant } from '../../chart/variants.ts'
import { songAt } from '../../clock/map.ts'
import type { ClockMap } from '../../clock/types.ts'
import type { InputEvent } from '../../input/keyboard.ts'
import {
  endAtMs,
  initialJudge,
  judgeClock,
  judgePress,
  judgeRelease,
  judgeSweep,
  neighborOf,
  resultsByIndex,
  rulesOf,
  summarizeJudge,
  timingSamples,
  type JudgeOutcome,
  type JudgeState,
  type JudgeSummary,
} from '../../judge/judge.ts'
import { proposeOffset, type OffsetVerdict } from '../../judge/calibration-offset.ts'
import { selfRatio } from '../../judge/self-rate.ts'
import { PROFILES } from '../../judge/windows.ts'
import {
  initialSession,
  sessionIdle,
  sessionInput,
  sessionTick,
  type Session,
  type SessionStep,
} from '../../play/session.ts'
import type { PlayEvent } from '../../play/state.ts'
import { LAYOUTS } from '../../layout/presets.ts'
import type { Chart, KeyCode, LayoutId, Profile, Variant } from '../../shared/types.ts'
import type { FrameNote, LabelMode } from '../../render/canvas/cells.ts'
import { buildFrame, frameNotes } from '../../render/canvas/commands.ts'
import { admitFlash, emptyBudget, type BudgetState } from '../../render/canvas/budget.ts'
import { flashArea, pruneEffects, type FxIntent } from '../../render/canvas/feedback.ts'
import { flush } from '../../render/canvas/flush.ts'
import { feedFrame, initialLowLoad, type LowLoadState } from '../../render/canvas/lowload.ts'
import { regionsOf } from '../../render/canvas/primitives.ts'
import { buildKeyboardGrid, type KeyboardGrid } from '../../render/hex/grid.ts'
import type { LandingMode } from '../../render/hex/landing.ts'
import { TRAVEL_MS, computeSizing, sizeForViewport, type Sizing } from '../../render/hex/sizing.ts'
import { openIdb } from '../../storage/idb.ts'
import { resilientDb, safeStorage, storageFailRow } from '../../storage/fallback.ts'
import { loadDevice } from '../../storage/local.ts'
import {
  collectClock,
  collectFrame,
  collectPress,
  initialCollect,
  playRow,
  type PlayCollect,
} from '../../telemetry/collect.ts'
import { calibRow, deviceRow } from '../../telemetry/rows.ts'
import { attachKeyboard } from '../dom-input.ts'
import { matchPress, summarize, type NoteOutcome, type ReadabilitySummary } from './readability.ts'

/** 開始から拍 0 までの予備 ms（m1' LEAD 2.2 s を丸めた値） */
const LEAD_MS = 2000

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
  /** 計測の chartId（負荷譜面は id が無いので dev:stress） */
  chartId: string
  chart: Pick<Chart, 'notes' | 'pulse'>
  variants: Map<LayoutId, Variant>
}

async function loadSong(id: SongId): Promise<Loaded> {
  if (id === STRESS) {
    const c = stressChart()
    const variants = new Map<LayoutId, Variant>()
    for (const layout of ['ableton', 'vmpk'] as const)
      variants.set(layout, buildVariant(c, { layout, limit: 2, fold: 'octave' }))
    return { name: c.name, chartId: 'dev:stress', chart: c, variants }
  }
  const res = await fetch(`/tests/fixtures/charts/m1/${id}.hexnote.json`)
  if (!res.ok) throw new Error(`play-dev: ${id} が読めない（${res.status}）`)
  const chart = (await res.json()) as Chart
  const variants = new Map<LayoutId, Variant>()
  for (const v of chart.variants ?? [])
    if (v.limit === 2 && v.fold === 'octave') variants.set(v.layout, v)
  return { name: chart.name, chartId: chart.id, chart, variants }
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
  profile: Profile
  offsetMs: number
  judge: JudgeSummary
  /** 校正の段 2 の提案（固定テンポ・1.0 倍・全鍵の回だけが母集団。play-dev は常にそれ） */
  proposal: OffsetVerdict
}

type Run = {
  /** プレイの状態機械と時計（動画なし。t は譜面の ms、開始は −LEAD_MS） */
  session: Session
  /** 最後の tick・命令の写像（次の tick まで。押下の tsPerf → 曲 ms） */
  map: ClockMap
  /** 最後の tick の t（曲 ms） */
  t: number
  /** 最後の再アンカーの猶予の終わり（perf ms）。「読めるか」の記録はこれより前の押下を取らない */
  graceUntil: number
  notes: FrameNote[]
  /** 判定層の状態（ノートの状態・点・自力率） */
  judge: JudgeState
  /** 「読めるか」の記録（判定とは別の ±300 ms の対応付け） */
  outcomes: NoteOutcome[]
  /** notes の index → outcomes の位置 */
  posOf: Map<number, number>
  /** 終了の曲 ms（最終ノートの終わり＋1.2 秒、§4.2） */
  endMs: number
  profile: Profile
  offsetMs: number
  /** 計測（時計の出力・rAF・演奏の押下） */
  collect: PlayCollect
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
  const profileSel = select<Profile>(
    [
      ['beginner', '入門者（24/100/180・遅れ ×1.3・NEAR）'],
      ['gamer', '音ゲー向け（30/90/200・点・ゲージ）'],
    ],
    'beginner',
  )
  const offsetIn = el('input', { type: 'number', min: '-120', max: '120', step: '1', value: '0' })
  offsetIn.style.width = '5em'
  const flashBtn = el('button', { type: 'button', textContent: '閃光を試す（1 秒に 5 回）' })
  const stopBtn = el('button', { type: 'button', textContent: '中止' })
  const status = el('div', { className: 'band', hidden: false })
  const hud = el('div', { className: 'note' })
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
          '精度',
          '内訳',
          '平均・UR',
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
    el('h1', {}, '描画層（開発ページ、手順 6・7・8）'),
    el(
      'ol',
      {},
      el('li', {}, '曲・配列・着地を選ぶ（選んだ後は落下域を一度クリックして焦点を戻す）。'),
      el(
        'li',
        {},
        'Space で開始。セルが自分の鍵のセルに重なった瞬間に押す。Escape・タブの切替で一時停止、Space で再開' +
          '（300 ms の猶予の後に判定を戻す）。一時停止中の Escape か「中止」で中止。',
      ),
      el('li', {}, '曲が終わると表に 1 行増える。「読めた」を付け、最後に下の JSON を渡す。'),
    ),
    el('div', { className: 'row' }, songSel, layoutSel, modeSel),
    el(
      'div',
      { className: 'row' },
      profileSel,
      el('label', {}, '校正 ', offsetIn, ' ms'),
      labelSel,
      el('label', {}, hintBox, '辺ヒント'),
    ),
    el('div', { className: 'row' }, flashBtn, stopBtn),
    status,
    hud,
    info,
    table,
    out,
  )

  // 計測の置き場（失敗したらメモリ内で続け、storageFail の行も足す。保存層 decisions #50）
  const db = resilientDb(
    () => openIdb(globalThis.indexedDB),
    (f) => void db.appendTelemetry(storageFailRow(f, new Date().toISOString())),
  )
  const local = safeStorage(
    'local',
    () => window.localStorage,
    (f) => {
      void db.appendTelemetry(storageFailRow(f, new Date().toISOString()))
    },
  )
  {
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: unknown } }).keyboard
    const at = new Date().toISOString()
    void db.appendTelemetry(
      deviceRow(
        {
          ua: navigator.userAgent,
          screenPx: [screen.width, screen.height],
          dpr: window.devicePixelRatio || 1,
          device: loadDevice(local) ?? {
            limit: 2,
            at,
            layoutMapOk: typeof kb?.getLayoutMap === 'function',
          },
        },
        at,
      ),
    )
  }

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
    let outer: Sizing
    try {
      outer = sizeForViewport({ w: vw, h: vh }, rows, TRAVEL_MS.beginner)
    } catch (e) {
      // 箱が R 24 の鍵盤図より低い（decisions #24 (e) の RangeError）。描かずに知らせ、resize で組み直す
      sizing = null
      grid = null
      info.textContent = `視口 ${vw}×${vh} では鍵盤図が入りません（${e instanceof Error ? e.message : String(e)}）。窓を広げてください`
      return
    }
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

  /** 判定の事象を演出と「読めるか」の記録に写す */
  const applyJudge = (r: Run, out: readonly JudgeOutcome[], realNow: number): void => {
    for (const o of out) {
      if (o.kind === 'skipped') {
        const p = r.posOf.get(o.index)
        const rec = p === undefined ? undefined : r.outcomes[p]
        if (p !== undefined && rec && rec.pressMs === null)
          r.outcomes[p] = { ...rec, skipped: true }
      } else if (o.kind === 'hit' && o.grade === 'near') {
        pushFx({ kind: 'slide', atMs: realNow, from: o.noteCode, to: o.code })
        pushFx({ kind: 'judgeText', atMs: realNow, grade: 'near', dtMs: o.dtMs })
      } else if (o.kind === 'hit') {
        pushFx({ kind: 'edgeReturn', atMs: realNow, code: o.code, grade: o.grade })
        pushFx({ kind: 'judgeText', atMs: realNow, grade: o.grade, dtMs: o.dtMs })
      } else if (o.kind === 'miss')
        pushFx({ kind: 'judgeText', atMs: realNow, grade: 'miss', dtMs: null })
      else if (o.kind === 'failed') {
        setStatus('ゲージが 0 になりました（音ゲー向けの途中終了）')
        playInput({ kind: 'chartEnd' })
      }
    }
  }

  /**
   * 状態機械と時計の 1 歩を走りに写す。時計の事象（resync・graceEnd）を判定層へ渡す（猶予内に窓が終わる音の skipped、
   * 猶予中に溜めた押下の判定）
   */
  const applyStep = (r: Run, step: SessionStep, realNow: number): void => {
    const before = r.session.play.phase
    r.session = step.session
    r.map = step.out.map
    r.t = step.out.t
    r.collect = collectClock(r.collect, step.out)
    for (const ev of step.out.events) if (ev.kind === 'resync') r.graceUntil = ev.graceUntil
    const j = judgeClock(r.judge, step.out.events, { map: step.out.map, now: realNow })
    r.judge = j.state
    applyJudge(r, j.out, realNow)
    const phase = r.session.play.phase
    if (phase === before) return
    if (phase === 'syncing') setStatus('同期中（300 ms の猶予。押下は猶予の終わりに判定）')
    else if (phase === 'playing') setStatus('再生中（Escape・タブの切替で一時停止）')
    else if (phase === 'paused') setStatus('一時停止中: Space で再開、Escape か「中止」で中止')
  }

  const playInput = (ev: PlayEvent): void => {
    if (!run) return
    const now = performance.now()
    applyStep(run, sessionInput(run.session, now, ev), now)
  }

  const startRun = (): void => {
    if (!grid || notesTemplate.length === 0) return
    const g = grid
    const now = performance.now()
    const session = initialSession({ mode: 'novideo', t0: -LEAD_MS })
    const outcomes: NoteOutcome[] = notesTemplate.map((n) => ({
      index: n.index,
      code: n.code,
      rowIndex: g.byCode.get(n.code)?.rowIndex ?? 0,
      tLandMs: n.tLandMs,
      group: n.group,
      pressMs: null,
      pressedCode: null,
    }))
    const profile = profileSel.value as Profile
    const offset = Number(offsetIn.value)
    const offsetMs = Number.isFinite(offset) ? Math.max(-120, Math.min(120, Math.round(offset))) : 0
    const label = labelSel.value as LabelMode
    const rules = rulesOf(PROFILES[profile], {
      neighbor: neighborOf(g.byCode),
      offsetMs,
      labels: { kb: label, note: label },
    })
    const r: Run = {
      session,
      map: { a: 0, b: -LEAD_MS },
      t: -LEAD_MS,
      graceUntil: -Infinity,
      notes: notesTemplate,
      judge: initialJudge(notesTemplate, rules),
      outcomes,
      posOf: new Map(notesTemplate.map((n, i) => [n.index, i])),
      endMs: endAtMs(notesTemplate),
      profile,
      offsetMs,
      collect: initialCollect(),
    }
    run = r
    effects = []
    applyStep(r, sessionInput(session, now, { kind: 'start' }), now)
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
      profile: r.profile,
      offsetMs: r.offsetMs,
      judge: summarizeJudge(r.judge),
      proposal: proposeOffset(timingSamples(r.judge), r.offsetMs),
    }
    runs.push(rec)
    addRow(rec)
    writeOut()
    setStatus(
      rec.proposal.ok
        ? `終わりました。校正の提案: ${rec.proposal.offset} ms（平均 ${Math.round(rec.proposal.mean)} ms）。Space でもう一度`
        : '終わりました。表の「読めた」を付けてください。Space でもう一度',
    )
    // 計測: play 行と calib 行（段 2 の提案。play-dev では受けない）。動画なし・固定テンポ・全鍵
    const at = new Date().toISOString()
    const variant = loaded.variants.get(rec.layout)
    const play = playRow(
      r.collect,
      {
        chartId: loaded.chartId,
        variantId: variant?.id ?? `${rec.layout}/2/octave`,
        profile: r.profile,
        clock: 'novideo',
        mode: 'fixed',
      },
      rec.judge,
      null,
      at,
    )
    const calib = calibRow('propose', rec.proposal, timingSamples(r.judge).length, false, at)
    void Promise.all([db.appendTelemetry(play), db.appendTelemetry(calib)]).then(async () => {
      const mode = await db.mode()
      info.textContent =
        `計測: play 行と calib 行を足した（${mode}）。入力遅延の中央値 ${fmt(play.inputLatencyMedian, ' ms')}・` +
        `フレーム間隔 SD ${play.frameIntervalSd?.toFixed(2) ?? '—'} ms・p95 ${play.frameIntervalP95?.toFixed(1) ?? '—'} ms・` +
        `押下 ${play.pressCount}（遅延の標本なし ${play.pressNoLag}）`
    })
  }

  const fmt = (x: number | null, unit = ''): string =>
    x === null ? '—' : `${Math.round(x)}${unit}`

  const showHud = (r: Run): void => {
    const s = summarizeJudge(r.judge)
    const c = s.counts
    const self = selfRatio(s.selfRate)
    const base =
      `精度 ${(s.acc * 100).toFixed(1)}%・${s.rank}・ぴったり ${c.perfect}／よい ${c.great}／おしい ${c.good}` +
      `／となり ${c.near}／はずれ ${c.miss}・判定なし ${s.skipped}・自力率 ${self === null ? '—' : `${Math.round(self * 100)}%`}`
    const g = s.gamer
    hud.textContent = g
      ? `${base}・点 ${Math.round(g.points)}・ゲージ ${g.gauge.toFixed(1)}・コンボ ${r.judge.score.combo}`
      : base
  }

  const addRow = (rec: RunRecord): void => {
    const s = rec.summary
    const rows = Object.keys(s.dtSdByRow)
      .map(Number)
      .sort((a, b) => a - b)
    const top = rows.length > 0 ? (s.dtSdByRow[rows[0] ?? 0] ?? null) : null
    const bottom = rows.length > 0 ? (s.dtSdByRow[rows[rows.length - 1] ?? 0] ?? null) : null
    // 未記入（null）・読めた・読めないの 3 つ。未記入は ADR 0006 の主観の数に入れない
    const yes = select<'' | 'yes' | 'no'>(
      [
        ['', '未記入'],
        ['yes', '読めた'],
        ['no', '読めない'],
      ],
      '',
    )
    yes.addEventListener('change', () => {
      rec.readable = yes.value === '' ? null : yes.value === 'yes'
      writeOut()
      canvas.focus({ preventScroll: true })
    })
    const j = rec.judge
    const c = j.counts
    tbody.append(
      el(
        'tr',
        {},
        el('td', {}, `${rec.song}・${rec.layout}・${rec.mode}・${rec.profile}`),
        el('td', {}, `${(j.acc * 100).toFixed(1)}% ${j.rank}`),
        el(
          'td',
          {},
          `${c.perfect}/${c.great}/${c.good}/${c.near}/${c.miss}` +
            (j.skipped > 0 ? `（判定なし ${j.skipped}）` : ''),
        ),
        el('td', {}, `${fmt(j.meanMs)}・${fmt(j.ur)}`),
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
        page: 'play-dev（手順 6・8）',
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

  const pushFx = (fx: FxIntent): void => {
    effects = [...effects, fx]
  }

  const onPress = (code: KeyCode, tsPerf: number, lag: number | null): void => {
    if (!run) return
    // 押下の前に今の相へ進める（猶予の終わりを次のフレームまで待たない）
    const realNow = performance.now()
    applyStep(run, sessionIdle(run.session, realNow), realNow)
    const r = run
    const phase = r.session.play.phase
    // 「読めるか」の記録: 再生中で、押した時刻が猶予の終わり以後の押下だけ（判定とは別。手順 6 の記録のまま）
    if (phase === 'playing' && tsPerf >= r.graceUntil) {
      const t = songAt(r.map, tsPerf)
      const i = matchPress(r.outcomes, code, t)
      const o = i === null ? undefined : r.outcomes[i]
      if (i !== null && o) r.outcomes[i] = { ...o, pressMs: t, pressedCode: code }
    }
    // 判定: 再生・同期中の押下を判定層へ（同期中の猶予は溜めて猶予の終わりに判定、時計が止まった広告中は空打ち）
    if (phase !== 'playing' && phase !== 'syncing') return
    r.collect = collectPress(r.collect, lag)
    const j = judgePress(r.judge, { code, tsPerf }, { map: r.map, now: realNow })
    r.judge = j.state
    applyJudge(r, j.out, realNow)
  }

  const onRelease = (code: KeyCode, tsPerf: number, forced: boolean): void => {
    if (!run) return
    const realNow = performance.now()
    applyStep(run, sessionIdle(run.session, realNow), realNow)
    const j = judgeRelease(run.judge, { code, tsPerf, forced }, { map: run.map, now: realNow })
    run.judge = j.state
    applyJudge(run, j.out, realNow)
  }

  const onEvents = (events: InputEvent[]): void => {
    for (const ev of events) {
      if (ev.kind === 'press') onPress(ev.code, ev.tsPerf, ev.lag)
      else if (ev.kind === 'release') onRelease(ev.code, ev.tsPerf, ev.forced)
      else if (ev.kind === 'role' && ev.role === 'primary') {
        if (!run) startRun()
        else playInput({ kind: 'resume' })
      } else if (ev.kind === 'role' && ev.role === 'pause') {
        // 一時停止中の Escape は中止（Pause メニューの「やめる」の代わり）。他は一時停止の要求（冪等）
        if (run?.session.play.phase === 'paused') stopRun(false)
        else playInput({ kind: 'pause', reason: 'escape' })
      } else if (ev.kind === 'pause') playInput({ kind: 'pause', reason: ev.reason })
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

  stopBtn.addEventListener('click', () => {
    stopRun(false)
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
    if (run) {
      const r = run
      r.collect = collectFrame(r.collect, ts)
      applyStep(r, sessionTick(r.session, now, null), now)
      const j = judgeSweep(r.judge, { map: r.map, now })
      r.judge = j.state
      applyJudge(r, j.out, now)
      // 終了（最終ノートの終わり＋1.2 秒、§4.2）を状態機械へ。ゲージ 0 の途中終了もここで閉じる
      if (r.t > r.endMs && r.session.play.phase === 'playing') playInput({ kind: 'chartEnd' })
    }
    if (sizing && grid) {
      const t = run ? run.t : -LEAD_MS
      let notes: FrameNote[] = notesTemplate
      if (run) {
        const r = run
        const byIndex = resultsByIndex(r.judge)
        notes = r.notes.map((n) => {
          const st = byIndex.get(n.index)?.state ?? 'pending'
          return st === n.state ? n : { ...n, state: st }
        })
        showHud(r)
        if (r.session.play.phase === 'ended') stopRun(true)
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
