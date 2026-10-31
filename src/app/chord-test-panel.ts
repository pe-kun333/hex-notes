// 同時押しテストの部品（S0b と S6「テストをやり直す」で同じ物。M1-04・M1-07、M1 の手順 9・10）。出どころ: design.md §1.3 S0b
// （進捗 n/10、押下キーの点灯、1 秒の保持バー、結果 2・3・4）・S6（同時押し上限「テストをやり直す」）・§2.4、m6 S0b L258–267、
// decisions #55 (b)（device 行は診断を保存したとき）・#72。合否は src/input/chord-test.ts（純関数）。DOM に触れる薄い部分。

import { perfNow } from '../clock/clock-source.ts'
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
} from '../input/chord-test.ts'
import type { InputEvent } from '../input/keyboard.ts'
import type { Legend } from '../layout/legend.ts'
import type { ChordLimit, KeyCode } from '../shared/types.ts'
import { deviceRow } from '../telemetry/rows.ts'
import { button, h } from './screens/frame.ts'
import type { ScreenContext } from './shell.ts'

export interface ChordTestPanel {
  readonly el: HTMLElement
  /** 組の表示（段に入ったら焦点を置く。ボタンは Enter だけで押せる、§1.3） */
  readonly focus: HTMLElement
  onInput(events: readonly InputEvent[]): void
  unmount(): void
}

export interface ChordTestOptions {
  readonly legend: Legend
  /** 終わった後の決めるボタンの文言（S0b「次へ」、S6「この上限にする」） */
  readonly doneText: string
  /** 終わって決めた（上限は呼ぶ側が saveDeviceLimit で保存する） */
  onDone(limit: ChordLimit): void
  /** 飛ばす・やめるボタン（無ければ出さない） */
  readonly skip?: { readonly text: string; onSkip(): void }
}

/**
 * 端末プロファイルに上限を保存して device 行を足す（#55 (b)。diagnosed は診断を通したか。上限が上がるのは通したときだけ）
 */
export function saveDeviceLimit(ctx: ScreenContext, limit: ChordLimit, diagnosed: boolean): void {
  const kbApi = (navigator as Navigator & { keyboard?: { getLayoutMap?: unknown } }).keyboard
  const at = new Date().toISOString()
  const device = { ...(ctx.device() ?? {}), limit, at, layoutMapOk: typeof kbApi?.getLayoutMap === 'function', diagnosed }
  ctx.saveDevice(device)
  void ctx.booted.db
    .appendTelemetry(deviceRow({ ua: navigator.userAgent, screenPx: [screen.width, screen.height], dpr: window.devicePixelRatio || 1, device }, at))
    .catch(() => {})
} // prettier-ignore

export function chordTestPanel(ctx: ScreenContext, opts: ChordTestOptions): ChordTestPanel {
  const { doc } = ctx
  let test: ChordTestState = initialChordTest(perfNow())
  let alive = true
  const count = h(doc, 'span', { className: 'num', text: '0' })
  const groupText = h(doc, 'dd')
  const keys = h(doc, 'div', { className: 'keys' })
  const hold = h(doc, 'i')
  const result = h(doc, 'p', { className: 'note' })
  const done = button(doc, opts.doneText, () => opts.onDone(chordLimit(test.results)), 'primary')
  done.disabled = true
  const board = h(doc, 'div', { className: 'chord-test' })
  board.tabIndex = -1
  board.append(
    h(doc, 'dl', { className: 'kv' }, h(doc, 'dt', { text: '進捗' }), h(doc, 'dd', {}, count, ' / 10'), h(doc, 'dt', { text: 'いまの組' }), groupText),
    keys,
    h(doc, 'div', { className: 'hold' }, hold),
  )
  const label = (c: KeyCode): string => opts.legend.get(c) ?? c
  const show = (now: number): void => {
    const fin = chordDone(test)
    count.textContent = String(test.results.length)
    const g = CHORD_GROUPS[test.index]
    groupText.textContent = fin || g === undefined
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
    result.textContent = fin ? chordResultText(test.results) : ''
    done.disabled = !fin
    if (fin && doc.activeElement === board) done.focus({ preventScroll: true })
  }
  const timer = setInterval(() => {
    if (!alive) return
    const now = perfNow()
    test = chordTick(test, now)
    show(now)
  }, 50)
  show(perfNow())
  const el = h(
    doc,
    'div',
    {},
    board,
    h(doc, 'p', { className: 'note', text: '組の内訳: 同段 3 キー（Z X C／A S D／Q W E）、3u 離れた和音（A D G／S F J／D G K）、矩形 4 キー（Q W A S／E R D F）、両手 2＋2（A S K L／Z X , .）。同段 3 組と和音 3 組を全部通せば 3、矩形と両手も通せば 4。日本語入力が ON なら帯を出して組をやり直します。' }),
    result,
    h(doc, 'div', { className: 'btnrow' }, done, ...(opts.skip === undefined ? [] : [button(doc, opts.skip.text, opts.skip.onSkip)])),
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
    unmount: () => {
      alive = false
      clearInterval(timer)
    },
  }
} // prettier-ignore
