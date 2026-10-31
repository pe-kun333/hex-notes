// 時計層の開発ページ（M0-05、手順 7）。ダミー動画（src/clock/dummy-video.ts）を流し、時計層とプレイの状態機械
// （src/play/session.ts）の振る舞いを目で確かめる: 生の読みと出力の真の時刻からの差（残差）のグラフ、相とイベント
// （飛び・pause 要求・adSuspected・novideo）の記録、seek・飛び・凍結・広告の模擬・非表示・再生レートのボタン。
// 製品画面ではない（導線は開発時だけ、src/main.ts）。performance.now の直呼びは src/app/ だけ（src/README.md）。
// browser pane が隠れていると rAF とタイマーが間引かれるので、数値は表に出した状態で見る（next-session §1）。

import {
  createDummyVideo,
  type DummyVideo,
  type DummyVideoOptions,
} from '../../clock/dummy-video.ts'
import type { ClockEvent, ClockOutput, VideoRequest } from '../../clock/types.ts'
import type { InputEvent } from '../../input/keyboard.ts'
import {
  initialSession,
  sessionInput,
  sessionTick,
  type Session,
  type SessionStep,
} from '../../play/session.ts'
import type { PlayEvent } from '../../play/state.ts'
import { attachKeyboard } from '../dom-input.ts'

/** グラフの横幅 ms と縦の範囲 ±ms */
const TRACE_MS = 8000
const RANGE_MS = 30
/** 広告の模擬の長さ ms（この間は pauseVideo を落とし、読みを止める） */
const AD_MS = 8000

type Trace = { now: number; raw: number; out: number; phase: string; novideo: boolean }

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

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { type: 'button', textContent: label })
  b.addEventListener('click', onClick)
  return b
}

function describeEvent(ev: ClockEvent): string {
  switch (ev.kind) {
    case 'resync':
      return `resync（${ev.reason}${ev.devMs === undefined ? '' : `、差 ${ev.devMs.toFixed(0)} ms`}）→ 猶予 300 ms`
    case 'graceEnd':
      return '猶予の終わり'
    case 'stall':
      return '停止検知（2 秒凍結）→ pauseVideo を要求'
    case 'adSuspected':
      return '500 ms で PAUSED が来ない → 広告中とみなす（同期中へ）'
    case 'novideo':
      return '動画なしへ切り替え（S7c）'
    case 'held':
      return `動画が ${ev.state}${ev.late ? '（遅い PAUSED）' : ''} → 止める`
  }
}

function main(): void {
  const panel = document.getElementById('panel')
  const readout = document.getElementById('readout')
  const graph = document.getElementById('graph')
  if (
    !(panel instanceof HTMLElement) ||
    !(readout instanceof HTMLElement) ||
    !(graph instanceof HTMLCanvasElement)
  )
    throw new Error('clock-dev: 要素が無い')
  const ctx = graph.getContext('2d')
  if (ctx === null) throw new Error('clock-dev: 2D の文脈が無い')

  const quantSel = select<'floor' | 'round'>(
    [
      ['floor', '刻み 15 ms 切り捨て'],
      ['round', '刻み 15 ms 四捨五入'],
    ],
    'floor',
  )
  const betaSel = select<'0.5' | '0'>(
    [
      ['0.5', 'β 0.5（切り捨て仮定）'],
      ['0', 'β 0'],
    ],
    '0.5',
  )
  const latencySel = select<'0' | '100' | '700' | 'never'>(
    [
      ['0', 'pause の効き 0 ms'],
      ['100', 'pause の効き 100 ms'],
      ['700', 'pause の効き 700 ms（遅い）'],
      ['never', 'pause が効かない'],
    ],
    '100',
  )
  const backBox = el('input', { type: 'checkbox', checked: true })
  const noiseBox = el('input', { type: 'checkbox', checked: false })
  const holdBox = el('input', { type: 'checkbox', checked: false })
  const rateSel = select<'1' | '1.25' | '0.75' | '0.5'>(
    [
      ['1', 'レート 1.0'],
      ['1.25', 'レート 1.25'],
      ['0.75', 'レート 0.75'],
      ['0.5', 'レート 0.5'],
    ],
    '1',
  )
  const log = el('ol', { id: 'log', reversed: true })

  let dummy: DummyVideo = createDummyVideo()
  let session: Session = initialSession({ mode: 'video', t0: 0 })
  let last: ClockOutput | null = null
  let trace: Trace[] = []
  let adUntil = -Infinity
  /** ダミーの visible（ページが持つ。読むためにダミーを sample すると逆行と乱数の列を進めてしまう） */
  let visible = true

  const addLog = (now: number, text: string): void => {
    const t = last === null ? '' : `曲 ${(last.t / 1000).toFixed(2)} s`
    log.prepend(el('li', {}, `実 ${(now / 1000).toFixed(2)} s ${t}  ${text}`))
    while (log.childElementCount > 40) log.lastElementChild?.remove()
  }

  const applyVideo = (now: number, reqs: VideoRequest[]): void => {
    for (const q of reqs) {
      if (q.kind === 'pauseVideo') {
        const why = q.why === 'stall' ? '停止検知' : '一時停止'
        if (now < adUntil) addLog(now, `pauseVideo（${why}。広告の模擬中なので効かない）`)
        else {
          addLog(now, `pauseVideo（${why}）`)
          dummy.pauseVideo(now)
        }
      } else if (q.kind === 'playVideo') {
        addLog(now, 'playVideo（再開）')
        dummy.play(now)
      } else {
        addLog(now, `seekTo ${q.t.toFixed(0)}`)
        dummy.seek(q.t, now)
      }
    }
  }

  const apply = (now: number, step: SessionStep): void => {
    const before = session.play
    session = step.session
    last = step.out
    for (const ev of step.out.events) addLog(now, describeEvent(ev))
    applyVideo(now, step.video)
    const p = session.play
    if (p.phase !== before.phase || p.source !== before.source)
      addLog(now, `プレイの相: ${before.phase}/${before.source} → ${p.phase}/${p.source}`)
  }

  const playInput = (ev: PlayEvent): void => {
    const now = performance.now()
    apply(now, sessionInput(session, now, ev))
  }

  const reset = (): void => {
    const opts: DummyVideoOptions = {
      quant: quantSel.value as 'floor' | 'round',
      pauseLatencyMs: latencySel.value === 'never' ? 'never' : Number(latencySel.value),
      backPerSec: backBox.checked ? 0.6 : 0,
      noiseSd: noiseBox.checked ? 3 : 0,
      freezeHold: holdBox.checked,
    }
    dummy = createDummyVideo(opts)
    session = initialSession({ mode: 'video', t0: 0, beta: Number(betaSel.value) })
    rateSel.value = '1'
    trace = []
    adUntil = -Infinity
    visible = true
    log.replaceChildren()
    addLog(performance.now(), '作り直した。「動画を再生」で始める（click-to-play）')
  }

  const at = (f: (now: number) => void) => () => {
    f(performance.now())
    graph.focus({ preventScroll: true })
  }

  panel.append(
    el('h1', {}, '時計層（開発ページ、手順 7）'),
    el(
      'p',
      { className: 'note' },
      '動画はダミー（15 ms の刻み・逆行・seek 後の凍結）。グラフは真の時刻からの差: 点 ＝ 生の読み、線 ＝ 時計の出力。' +
        '背景は相（黄 ＝ 猶予、赤 ＝ pause 要求、紫 ＝ 広告中、灰 ＝ 止まっている、青 ＝ 動画なし）。' +
        'Space で再開、Escape・タブの切替で一時停止（状態機械を通る）。',
    ),
    el('h2', {}, 'ダミーの癖（作り直しで効く）'),
    el('div', { className: 'row' }, quantSel, betaSel, latencySel),
    el(
      'div',
      { className: 'row' },
      el('label', {}, backBox, '逆行（0.6 回/秒、≤10 ms）'),
      el('label', {}, noiseBox, '揺れ 3 ms'),
      el('label', {}, holdBox, 'seek の凍結中は真の時刻も止まる'),
    ),
    el(
      'div',
      { className: 'row' },
      button('作り直す', reset),
      button(
        '動画を再生（click-to-play）',
        at((now) => dummy.play(now)),
      ),
    ),
    el('h2', {}, '起こす'),
    el(
      'div',
      { className: 'row' },
      button(
        '動画側の seek −5 s（時計には飛び）',
        at((now) => dummy.seek(Math.max(0, dummy.trueTime(now) - 5000), now)),
      ),
      button(
        '動画側の seek +5 s（時計には飛び）',
        at((now) => dummy.seek(dummy.trueTime(now) + 5000, now)),
      ),
      button(
        '飛び +300',
        at((now) => dummy.jump(300, now)),
      ),
      button(
        '飛び +200',
        at((now) => dummy.jump(200, now)),
      ),
    ),
    el(
      'div',
      { className: 'row' },
      button(
        '凍結 3 s（stuck）',
        at((now) => dummy.stuck(3000, now)),
      ),
      button(
        '広告の模擬（8 s、pause が効かない）',
        at((now) => {
          adUntil = now + AD_MS
          dummy.stuck(AD_MS, now)
        }),
      ),
      button(
        'BUFFERING 1 s',
        at((now) => {
          // 1 秒後に同じダミーがまだ BUFFERING なら戻す（作り直した後・iframe で止めた後は触らない）
          const d = dummy
          d.setState('buffering', now)
          window.setTimeout(() => {
            if (d === dummy && d.state === 'buffering') d.setState('playing', performance.now())
          }, 1000)
        }),
      ),
    ),
    el(
      'div',
      { className: 'row' },
      button(
        'iframe で止める（PAUSED）',
        at((now) => dummy.setState('paused', now)),
      ),
      button(
        '非表示の切替（ダミーの visible）',
        at(() => {
          visible = !visible
          dummy.setVisible(visible)
        }),
      ),
      rateSel,
      button(
        '戻す',
        at(() => playInput({ kind: 'return' })),
      ),
    ),
    el('h2', {}, '記録（新しい順）'),
    log,
  )

  rateSel.addEventListener('change', () => {
    dummy.setRate(Number(rateSel.value), performance.now())
    graph.focus({ preventScroll: true })
  })
  for (const s of [quantSel, betaSel, latencySel]) s.addEventListener('change', reset)
  for (const b of [backBox, noiseBox, holdBox]) b.addEventListener('change', reset)

  attachKeyboard(
    window,
    (events: InputEvent[]) => {
      for (const ev of events) {
        if (ev.kind === 'role' && ev.role === 'primary') playInput({ kind: 'resume' })
        else if (ev.kind === 'role' && ev.role === 'pause')
          playInput({ kind: 'pause', reason: 'escape' })
        else if (ev.kind === 'pause') playInput({ kind: 'pause', reason: ev.reason })
      }
    },
    { focusTarget: graph },
  )

  const PHASE_FILL: Record<string, string> = {
    grace: 'rgba(243, 210, 122, 0.12)',
    pauseReq: 'rgba(240, 100, 90, 0.18)',
    ad: 'rgba(170, 110, 230, 0.16)',
    held: 'rgba(140, 140, 150, 0.12)',
    stopped: 'rgba(140, 140, 150, 0.12)',
  }

  const draw = (now: number): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = graph.clientWidth
    const h = graph.clientHeight
    if (graph.width !== Math.round(w * dpr) || graph.height !== Math.round(h * dpr)) {
      graph.width = Math.round(w * dpr)
      graph.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const x = (t: number): number => w - ((now - t) / TRACE_MS) * w
    const y = (ms: number): number => h / 2 - (ms / RANGE_MS) * (h / 2 - 10)
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1]
      const b = trace[i]
      if (!a || !b) continue
      const fill = b.novideo ? 'rgba(90, 150, 240, 0.14)' : PHASE_FILL[b.phase]
      if (fill === undefined) continue
      ctx.fillStyle = fill
      ctx.fillRect(x(a.now), 0, x(b.now) - x(a.now) + 0.5, h)
    }
    ctx.strokeStyle = '#2a2e37'
    ctx.lineWidth = 1
    for (const ms of [-20, -10, 0, 10, 20]) {
      ctx.beginPath()
      ctx.moveTo(0, y(ms))
      ctx.lineTo(w, y(ms))
      ctx.stroke()
    }
    ctx.fillStyle = '#8a8f99'
    ctx.font = '11px system-ui, sans-serif'
    for (const ms of [-20, 0, 20]) ctx.fillText(`${ms} ms`, 4, y(ms) - 3)
    ctx.fillStyle = 'rgba(232, 233, 236, 0.45)'
    for (const p of trace) {
      if (Math.abs(p.raw) > RANGE_MS) continue
      ctx.fillRect(x(p.now) - 1, y(p.raw) - 1, 2, 2)
    }
    ctx.strokeStyle = '#f3d27a'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    let pen = false
    for (const p of trace) {
      const ok = Math.abs(p.out) <= RANGE_MS * 1.5
      if (ok && pen) ctx.lineTo(x(p.now), y(p.out))
      else if (ok) ctx.moveTo(x(p.now), y(p.out))
      pen = ok
    }
    ctx.stroke()
  }

  const frame = (): void => {
    const now = performance.now()
    const sample = dummy.sample(now)
    apply(now, sessionTick(session, now, sample))
    const tt = dummy.trueTime(now)
    const o = last
    if (o !== null) {
      trace.push({
        now,
        raw: sample.timeMs - tt,
        out: o.t - tt,
        phase: o.phase,
        novideo: o.mode === 'novideo',
      })
      trace = trace.filter((p) => now - p.now <= TRACE_MS)
      const p = session.play
      readout.textContent = [
        `プレイ ${p.phase}/${p.source}   時計 ${o.mode}・${o.phase}   動画 ${sample.state}${sample.visible ? '' : '（非表示）'}   レート ${sample.rate}`,
        `出力 t ${o.t.toFixed(1)} ms   真 ${tt.toFixed(1)} ms   出力−真 ${(o.t - tt).toFixed(2)} ms   生−真 ${(sample.timeMs - tt).toFixed(2)} ms`,
        `傾き a ${o.map.a.toFixed(5)}   q̂ ${o.qHat.toFixed(2)} ms   戻せる ${o.canReturn ? 'はい' : 'いいえ'}`,
      ].join('\n')
    }
    draw(now)
    requestAnimationFrame(frame)
  }

  reset()
  graph.focus({ preventScroll: true })
  requestAnimationFrame(frame)
}

main()
