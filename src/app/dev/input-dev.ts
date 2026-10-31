// 入力層の開発ページ（M0-04、手順 5）。押下集合・IME の帯・役割・一時停止の要求・入力遅延を表示し、手弾きで確かめる。
// 製品画面ではない（導線は開発時だけ、src/main.ts）。確かめること: 同じ code の 2 度目（押しっぱなし）が入らない、
// IME を ON にして打つと入力列に入らず帯が 1 件（ime は打鍵ごと）、文字の欄では入らない、select に焦点があっても
// Escape・Space・演奏の鍵は入り焦点が外れる、iframe を押すと全離し＋Pause 要求＋焦点が戻る、タブを隠すと全離し＋
// Pause 要求、右クリックで全離し（Pause 要求なし）、Ctrl 付きは素通し。timeStamp の刻み（decisions #25）と入力遅延の中央値も見る。

import type { InputEvent, InputState } from '../../input/keyboard.ts'
import { IME_BAND_TEXT } from '../../input/ime.ts'
import { estimateTsResolution, isCoarse } from '../../input/resolution.ts'
import { median } from '../../input/timestamp.ts'
import { qwertyLabel } from '../../layout/legend.ts'
import { KEY_ROWS } from '../../layout/presets.ts'
import { attachKeyboard } from '../dom-input.ts'

const LOG_MAX = 200
/** 刻みの推定に使う直近の timeStamp の数 */
const TS_SAMPLES_MAX = 200

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

function main(): void {
  const root = document.getElementById('dev')
  if (!(root instanceof HTMLElement)) throw new Error('input-dev: #dev が無い')

  const band = el(
    'div',
    { id: 'band', hidden: true },
    `IME: ${IME_BAND_TEXT}（打鍵は入力列に入りません）`,
  )
  const keys = new Map<string, HTMLElement>()
  const grid = el('div')
  KEY_ROWS.forEach((codes, r) => {
    const row = el('div', { className: 'row' })
    row.style.marginLeft = `${[0, 0.5, 0.75, 1.25][r] ?? 0}em`
    for (const code of codes) {
      const k = el('div', { className: 'key', title: code }, qwertyLabel(code))
      keys.set(code, k)
      row.append(k)
    }
    grid.append(row)
  })

  const ddDown = el('dd', {}, '（なし）')
  const ddRole = el('dd', {}, '—')
  const ddPause = el('dd', {}, '0 回')
  const ddIme = el('dd', {}, '0 打')
  const ddPress = el('dd', {}, '0 件')
  const ddLatency = el('dd', {}, '—')
  const ddGrid = el('dd', {}, '—')
  const info = el(
    'dl',
    {},
    el('dt', {}, '押下集合'),
    ddDown,
    el('dt', {}, '役割（最後）'),
    ddRole,
    el('dt', {}, '一時停止（Escape＋blur・非表示・iframe）'),
    ddPause,
    el('dt', {}, 'IME の打鍵（ime）'),
    ddIme,
    el('dt', {}, '入力列（press）'),
    ddPress,
    el('dt', {}, '入力遅延 now − timeStamp'),
    ddLatency,
    el('dt', {}, 'timeStamp の刻み'),
    ddGrid,
  )

  const text = el('input', { type: 'text', placeholder: '文字の欄（ここでは入らない）' })
  const select = el(
    'select',
    { title: 'select（焦点があっても入る）' },
    el('option', {}, 'Ableton 型'),
    el('option', {}, 'VMPK 型'),
  )
  const frame = el('iframe', {
    title: '焦点の取り戻しの試験',
    srcdoc:
      '<body style="margin:0;font:13px system-ui;color:#e8e9ec;background:#1c1f26"><button style="margin:16px">ここを押すと焦点が iframe へ移る</button></body>',
  })
  const tests = el('div', { className: 'tests' }, text, select, frame)
  const log = el('div', { id: 'log' })

  root.append(
    el('h1', {}, '入力層（開発ページ、手順 5）'),
    el(
      'p',
      { className: 'note' },
      '演奏 40 鍵・Space（primary）・Enter（confirm）・Escape（pause）。IME・押しっぱなし・iframe・タブの切替を確かめる。',
    ),
    band,
    grid,
    info,
    tests,
    log,
  )
  root.focus()

  const lines: string[] = []
  let pauses = 0
  let imes = 0
  let presses = 0
  const latencies: number[] = []

  const render = (state: InputState): void => {
    for (const [code, k] of keys) k.classList.toggle('down', state.down.has(code))
    ddDown.textContent = state.down.size > 0 ? [...state.down.keys()].join(' ') : '（なし）'
    band.hidden = !state.imeBand
  }

  const fmt = (ev: InputEvent): string => {
    const t = ev.tsPerf.toFixed(1).padStart(10)
    switch (ev.kind) {
      case 'press':
        return `${t}  press    ${ev.code}`
      case 'release':
        return `${t}  release  ${ev.code}${ev.forced ? '（全離し）' : ''}`
      case 'role':
        return `${t}  role     ${ev.role}（${ev.code}）`
      case 'ime':
        return `${t}  ime      ${ev.code}`
      case 'imeBand':
        return `${t}  imeBand  ${ev.on ? 'ON' : 'OFF'}（${ev.code}）`
      case 'pause':
        return `${t}  pause    ${ev.reason}`
    }
  }

  attachKeyboard(
    window,
    (events: InputEvent[], state: InputState) => {
      for (const ev of events) {
        lines.push(fmt(ev))
        if (ev.kind === 'pause' || (ev.kind === 'role' && ev.role === 'pause')) pauses++
        if (ev.kind === 'ime') imes++
        if (ev.kind === 'press') presses++
        if (ev.kind === 'role') ddRole.textContent = `${ev.role}（${ev.code}）`
      }
      for (const ev of events)
        if (ev.kind === 'press' && ev.lag !== null) {
          latencies.push(ev.lag)
          if (latencies.length > 60) latencies.shift()
          ddLatency.textContent = `最後 ${ev.lag.toFixed(2)} ms、中央値 ${(median(latencies) ?? 0).toFixed(2)} ms（${latencies.length} 打）`
        }
      while (lines.length > LOG_MAX) lines.shift()
      log.textContent = lines.slice().reverse().join('\n')
      ddPause.textContent = `${pauses} 回`
      ddIme.textContent = `${imes} 打`
      ddPress.textContent = `${presses} 件`
      render(state)
    },
    { focusTarget: root },
  )

  // 刻みは実際の keydown・keyup の timeStamp で見る（repeat・IME・素通しの鍵も含む。入力層の判定とは別に集める）
  const stamps: number[] = []
  const onStamp = (e: KeyboardEvent): void => {
    stamps.push(e.timeStamp)
    if (stamps.length > TS_SAMPLES_MAX) stamps.shift()
    const r = estimateTsResolution(stamps)
    ddGrid.textContent =
      r.q === null
        ? `標本不足（重複を除いて ${r.n}／20）`
        : r.q === 0
          ? `当てはまる刻みなし（${r.n} 値）`
          : `${r.q} ms（一致率 ${r.fit.toFixed(2)}、${r.n} 値）${isCoarse(r.q) ? '。判定が粗い環境' : ''}`
  }
  window.addEventListener('keydown', onStamp, true)
  window.addEventListener('keyup', onStamp, true)
}

main()
