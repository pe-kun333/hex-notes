// S0 初回導線（M1-04、M1 の手順 9。骨組みは手順 2）。出どころ: design.md §1.3 S0（4 段とも「あとで」で既定値のまま先へ。
// 全段で IME 帯が効く。S0b・S0c は組の表示・部品へ焦点を移し、ボタンは Enter だけで押せる）・S0a〜S0d・§2.1（刻印:
// getLayoutMap → 無ければ JIS／US）・§2.4（診断 10 組）、m6 S0 L238–296・renderS0 L721–735・ACT L955–957、decisions #26
// （試打欄は文字の欄なので入力層を通らない）・#43（刻印）・#52 (c)(e)（device・booted）・#55 (b)（device 行は診断を保存した
// とき）・#61・#70、m1-kickoff 手順 9・§7-13・§7-14。段の進みは onboard-flow.ts、同時押しテストは src/input/chord-test.ts、
// 校正は calibration-panel.ts（手順 4）、チュートリアル曲の 3 段階は S2（screens/play.ts）。

import { TUTORIAL_KEYSETS, KEYSET_NAMES } from '../../chart/keyset.ts'
import { perfNow } from '../../clock/clock-source.ts'
import {
  CHORD_GROUPS,
  chordDone,
  chordHold,
  chordLimit,
  chordResultText,
  chordStep,
  chordTick,
  initialChordTest,
  type ChordTestState,
} from '../../input/chord-test.ts'
import type { InputEvent } from '../../input/keyboard.ts'
import {
  defaultLegendKind,
  legendOf,
  type LegendKind,
  type LegendResult,
} from '../../layout/legend.ts'
import { keyboardCommands } from '../../render/canvas/cells.ts'
import { flush } from '../../render/canvas/flush.ts'
import { buildKeyboardGrid } from '../../render/hex/grid.ts'
import {
  DEFAULT_CHORD_LIMIT,
  type ChordLimit,
  type KeyCode,
  type LayoutId,
} from '../../shared/types.ts'
import { markBooted } from '../../storage/session.ts'
import { deviceRow, onboardRow } from '../../telemetry/rows.ts'
import { calibrationPanel, type CalibPanel } from '../calibration-panel.ts'
import {
  ONBOARD_IDS,
  TUTORIAL_TIPS,
  leaveStep,
  startOnboard,
  type OnboardLeave,
} from '../onboard-flow.ts'
import { TUTORIAL_SONG_ID } from '../songs.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { button, frame, h } from './frame.ts'

/** 4 段の名前（m6 L240） */
export const ONBOARD_STEPS: readonly string[] = [
  'a 配列の確認',
  'b 同時押しテスト',
  'c 校正',
  'd チュートリアル曲',
]

/** 段の中身（作った要素・入力・後始末） */
interface StepView {
  readonly el: HTMLElement
  /** 段に入ったら焦点を置く要素（S0b・S0c） */
  readonly focus?: HTMLElement
  onInput?(events: readonly InputEvent[]): void
  unmount?(): void
}

const iso = (): string => new Date().toISOString()

export function onboardScreen(ctx: ScreenContext): ScreenView {
  const { doc, booted } = ctx
  const f = frame(ctx, 'はじめに', { gear: true })
  const stepsEl = h(
    doc,
    'ol',
    { className: 'steps' },
    ...ONBOARD_STEPS.map((s) => h(doc, 'li', { text: s })),
  )
  const body = h(doc, 'div', { className: 'card' })
  f.body.append(stepsEl, body)
  let state = ctx.onboard() ?? startOnboard(perfNow())
  ctx.setOnboard(state)
  let cur: StepView | null = null
  let alive = true

  const log = (r: OnboardLeave): void => {
    void booted.db.appendTelemetry(onboardRow(r.step, r.seconds, r.left, iso())).catch(() => {})
  }

  /** 今の段を閉じて次へ（S0d の後と S0d の「あとで」は導線を終える） */
  const leave = (left: boolean): void => {
    const r = leaveStep(state, perfNow(), left)
    log(r.row)
    state = r.state
    ctx.setOnboard(state)
    show()
  }

  /** 導線を終えて S1 へ（S0d の「あとで」。booted を書き、このタブでは導線に戻らない） */
  const finishLater = (): void => {
    const r = leaveStep(state, perfNow(), true)
    log(r.row)
    ctx.setOnboard(null)
    markBooted(booted.session)
    ctx.go('S1')
  }

  // ---------- S0a 配列の確認 ----------
  const stepA = (): StepView => {
    const settings = ctx.settings()
    let kind: LegendKind =
      settings.legend === 'auto' ? defaultLegendKind(navigator.language) : settings.legend
    let legend: LegendResult = legendOf(null, kind)
    const pressed = new Set<KeyCode>()
    const canvas = h(doc, 'canvas')
    canvas.setAttribute('aria-label', 'Ableton 型の六角鍵盤図')
    const g2d = canvas.getContext('2d')
    const draw = (): void => {
      if (g2d === null) return
      const pad = 8
      const grid = buildKeyboardGrid('ableton', 26, { left: pad, top: pad }, legend.legend)
      const w = Math.ceil(grid.width + 2 * pad)
      const hh = Math.ceil(grid.height + 2 * pad)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(hh * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${hh}px`
      const kb = keyboardCommands(grid, {
        mode: 'cell',
        pressed,
        glow: new Map(),
        labels: 'key',
        depth: true,
      })
      const area = { x: 0, y: 0, w, h: hh }
      flush(g2d, [...kb.polys, ...kb.texts], {
        regions: { fall: { ...area, h: 0 }, keys: area, stageArea: w * hh },
        width: w,
        height: hh,
        dpr,
      })
    }
    const note = h(doc, 'span', { className: 'note' })
    const seg = h(doc, 'div', { className: 'seg' })
    const showLegend = (): void => {
      note.textContent =
        legend.source === 'layoutMap'
          ? `getLayoutMap で刻印を読みました（QWERTY から ${legend.changed} 鍵を変えました）。`
          : kind === 'jis'
            ? 'JIS 刻印（getLayoutMap が使えないので選んでください。ja なら JIS が既定）。AZERTY・Dvorak は QWERTY 刻印で表示します。'
            : 'US 刻印（getLayoutMap が使えないので選んでください）。AZERTY・Dvorak は QWERTY 刻印で表示します。'
      seg.hidden = legend.source === 'layoutMap'
      seg.replaceChildren(
        ...(['jis', 'us'] as const).map((k) => {
          const b = button(
            doc,
            k.toUpperCase(),
            () => {
              kind = k
              legend = legendOf(null, k)
              ctx.saveSettings({ ...ctx.settings(), legend: k })
              showLegend()
            },
            'small',
          )
          b.setAttribute('aria-pressed', String(k === kind))
          return b
        }),
      )
      draw()
    }
    // getLayoutMap（Chromium・HTTPS）が読めれば刻印をそれにする（§2.1）
    const kbApi = (
      navigator as Navigator & {
        keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> }
      }
    ).keyboard
    void kbApi
      ?.getLayoutMap?.()
      .then((m) => {
        if (!alive) return
        legend = legendOf(m, kind)
        showLegend()
      })
      .catch(() => {})
    // 試打欄: 文字の欄なので入力層を通らない（#26）。その欄の keydown で同じ code のセルを光らせるだけ
    const field = h(doc, 'input')
    field.type = 'text'
    field.placeholder = 'ここで何か打つと、上の鍵盤図の同じキーが光ります'
    field.setAttribute('aria-label', '試打欄')
    field.addEventListener('keydown', (e) => {
      pressed.add(e.code)
      draw()
    })
    field.addEventListener('keyup', (e) => {
      pressed.delete(e.code)
      draw()
    })
    field.addEventListener('blur', () => {
      pressed.clear()
      draw()
    })
    const lay = h(doc, 'div', { className: 'seg' })
    const showLayout = (): void => {
      lay.replaceChildren(
        ...(['ableton', 'vmpk'] as const).map((id: LayoutId) => {
          const b = button(
            doc,
            id === 'ableton' ? 'Ableton 型（おすすめ）' : 'VMPK 型',
            () => {
              ctx.saveSettings({ ...ctx.settings(), layout: id })
              showLayout()
            },
            'small',
          )
          b.setAttribute('aria-pressed', String(ctx.settings().layout === id))
          return b
        }),
      )
    }
    showLayout()
    showLegend()
    const el = h(
      doc,
      'div',
      {},
      h(doc, 'h2', { text: 'S0a 刻印は合っていますか' }),
      h(doc, 'p', {
        text: 'キーボードの文字の並びを確かめて、おすすめの配列（Ableton 型: A 段が白鍵、Q 段が黒鍵）で始めます。',
      }),
      canvas,
      h(
        doc,
        'div',
        { className: 'btnrow' },
        h(doc, 'span', { className: 'note', text: '刻印' }),
        seg,
        note,
      ),
      h(
        doc,
        'div',
        { className: 'btnrow' },
        h(doc, 'span', { className: 'note', text: '試打欄' }),
        field,
      ),
      h(
        doc,
        'details',
        {},
        h(doc, 'summary', {
          className: 'note',
          text: '別の配列（VMPK 型: Z 段と Q 段が白鍵、2 段×2 で音域が広い）',
        }),
        h(doc, 'p', {
          className: 'note',
          text: 'ここで選んでも初回導線は Ableton 型のまま進み、ホームの既定配列にだけ効きます。',
        }),
        lay,
      ),
      h(
        doc,
        'div',
        { className: 'btnrow' },
        button(doc, 'これで始める', () => leave(false), 'primary'),
        button(doc, 'あとで', () => leave(true)),
      ),
    )
    return { el }
  }

  // ---------- S0b 同時押しテスト ----------
  const stepB = (): StepView => {
    const legend = legendOf(null, defaultLegendKind(navigator.language)).legend
    let test: ChordTestState = initialChordTest(perfNow())
    const count = h(doc, 'span', { className: 'num', text: '0' })
    const groupText = h(doc, 'dd')
    const keys = h(doc, 'div', { className: 'keys' })
    const hold = h(doc, 'i')
    const result = h(doc, 'p', { className: 'note' })
    const next = button(doc, '次へ', () => save(chordLimit(test.results), false), 'primary')
    next.disabled = true
    const board = h(doc, 'div', { className: 'chord-test' })
    board.tabIndex = -1
    board.append(
      h(doc, 'dl', { className: 'kv' }, h(doc, 'dt', { text: '進捗' }), h(doc, 'dd', {}, count, ' / 10'), h(doc, 'dt', { text: 'いまの組' }), groupText),
      keys,
      h(doc, 'div', { className: 'hold' }, hold),
    )
    const label = (c: KeyCode): string => legend.get(c) ?? c
    const show = (now: number): void => {
      const done = chordDone(test)
      count.textContent = String(test.results.length)
      const g = CHORD_GROUPS[test.index]
      groupText.textContent = done || g === undefined
        ? '終わりました'
        : test.startedAt === null
          ? '押しているキーを全部離してください'
          : `${g.codes.map(label).join('・')} を同時に押して、1 秒そのまま`
      keys.replaceChildren(...(g === undefined ? [] : g.codes.map((c) => {
        const k = h(doc, 'span', { text: label(c) })
        if (test.down.has(c)) k.className = 'on'
        return k
      })))
      hold.style.width = `${chordHold(test, now) * 100}%`
      result.textContent = done ? chordResultText(test.results) : ''
      next.disabled = !done
      if (done && doc.activeElement === board) next.focus({ preventScroll: true })
    } // prettier-ignore
    const timer = setInterval(() => {
      if (!alive) return
      const now = perfNow()
      test = chordTick(test, now)
      show(now)
    }, 50)
    /** 端末プロファイルを保存し（上限が上がるのは診断を通したときだけ）、device 行を足して次の段へ */
    const save = (limit: ChordLimit, skipped: boolean): void => {
      const kbApi = (navigator as Navigator & { keyboard?: { getLayoutMap?: unknown } }).keyboard
      const at = iso()
      const device = { ...(ctx.device() ?? {}), limit, at, layoutMapOk: typeof kbApi?.getLayoutMap === 'function', diagnosed: !skipped }
      ctx.saveDevice(device)
      void booted.db
        .appendTelemetry(deviceRow({ ua: navigator.userAgent, screenPx: [screen.width, screen.height], dpr: window.devicePixelRatio || 1, device }, at))
        .catch(() => {})
      leave(skipped)
    } // prettier-ignore
    show(perfNow())
    const el = h(
      doc,
      'div',
      {},
      h(doc, 'h2', { text: 'S0b 同時押しテスト' }),
      h(doc, 'p', { text: '10 組のキーを順に、押したまま 1 秒そのままにします。端末が何キーまで同時に読めるかを測り、譜面の同時押し上限（既定 2）を決めます。' }),
      board,
      h(doc, 'p', { className: 'note', text: '組の内訳: 同段 3 キー（Z X C／A S D／Q W E）、3u 離れた和音（A D G／S F J／D G K）、矩形 4 キー（Q W A S／E R D F）、両手 2＋2（A S K L／Z X , .）。同段 3 組と和音 3 組を全部通せば 3、矩形と両手も通せば 4。日本語入力が ON なら帯を出して組をやり直します。' }),
      result,
      h(doc, 'div', { className: 'btnrow' }, next, button(doc, `スキップ（${DEFAULT_CHORD_LIMIT} つのまま）`, () => save(DEFAULT_CHORD_LIMIT, true))),
    )
    return {
      el,
      focus: board,
      onInput: (events) => {
        for (const ev of events) {
          if (ev.kind === 'press' || ev.kind === 'release') test = chordStep(test, { kind: ev.kind, code: ev.code, tsPerf: ev.tsPerf })
          else if (ev.kind === 'ime') test = chordStep(test, { kind: 'ime', tsPerf: ev.tsPerf })
        }
        show(perfNow())
      },
      unmount: () => clearInterval(timer),
    }
  } // prettier-ignore

  // ---------- S0c 校正 ----------
  const stepC = (): StepView => {
    const panel: CalibPanel = calibrationPanel(ctx)
    const el = h(
      doc,
      'div',
      {},
      h(doc, 'h2', { text: 'S0c 校正' }),
      panel.el,
      h(doc, 'div', { className: 'btnrow' }, button(doc, '次へ', () => leave(false), 'primary'), button(doc, 'あとで', () => leave(true))),
    )
    return { el, focus: panel.el, onInput: panel.onInput, unmount: panel.unmount }
  } // prettier-ignore

  // ---------- S0d チュートリアル曲 ----------
  const stepD = (): StepView => {
    const entry = ctx.songs.find((s) => s.id === TUTORIAL_SONG_ID)
    const start = button(doc, 'チュートリアル曲を始める', () => {
      if (entry === undefined) return
      // 3 段階は S2 が曲末ごとに進め、最後の段階の後に S0d の行と booted を書いて S3 へ（screens/play.ts）
      ctx.setTutorial({ stage: 0, enteredAt: state.enteredAt })
      ctx.setOnboard(null)
      ctx.pickSong(entry, TUTORIAL_KEYSETS[0] ?? 'all')
      ctx.go('S2')
    }, 'primary')
    start.disabled = entry === undefined
    const el = h(
      doc,
      'div',
      {},
      h(doc, 'h2', { text: 'S0d チュートリアル曲「はじめの六角」' }),
      h(doc, 'p', { text: 'プレイ画面の入門者形態。配列は Ableton 型で、使うキーを 3 段階に増やします（曲の終わりで次の段階へ）。' }),
      h(doc, 'ol', { className: 'steps' }, ...TUTORIAL_KEYSETS.map((k) => h(doc, 'li', { text: KEYSET_NAMES[k] }))),
      h(doc, 'ul', {}, ...TUTORIAL_TIPS.map((t) => h(doc, 'li', { text: t }))),
      ...(entry === undefined ? [h(doc, 'p', { className: 'note', text: 'チュートリアル曲が見つかりません。' })] : []),
      h(doc, 'div', { className: 'btnrow' }, start, button(doc, 'あとで', finishLater)),
    )
    return { el }
  } // prettier-ignore

  const STEPS = [stepA, stepB, stepC, stepD]

  function show(): void {
    cur?.unmount?.()
    cur = null
    if (state.step >= ONBOARD_IDS.length) {
      // S0d の後（ここには来ない作りだが、来たら S1 へ）
      ctx.setOnboard(null)
      markBooted(booted.session)
      ctx.go('S1')
      return
    }
    ;[...stepsEl.children].forEach((li, i) => {
      li.className = i === state.step ? 'on' : i < state.step ? 'done' : ''
    })
    const make = STEPS[state.step]
    if (make === undefined) return
    cur = make()
    body.replaceChildren(cur.el)
    cur.focus?.focus({ preventScroll: true })
  }

  show()
  return {
    root: f.root,
    bandSlot: f.bandSlot,
    onInput: (events) => cur?.onInput?.(events),
    unmount: () => {
      alive = false
      cur?.unmount?.()
    },
  }
}
