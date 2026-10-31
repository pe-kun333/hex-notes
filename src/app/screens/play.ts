// S2 プレイの骨組み（M1-13、M1 の手順 2。落下・判定・音・HUD の中身は手順 3、M1-03）。出どころ: design.md §1.3 S2（左右分割:
// 左列にプレイヤー矩形 480×270 と HUD、右列の全高を落下域＋鍵盤図。通知もプレイヤー矩形の外。Pause は再開／最初から／
// やめる）・§2.5（右列の箱 ＝ src/render/hex/sizing.ts の columnBox）・§4.2（動画なしは Space で同期中）、decisions #24・#35・
// #65（帯は左列の HUD の下、仮）、m1-kickoff §7-3（動画なし形態は矩形の場所に音源のカード、仮）、m6 S2 L326–358、
// play-dev L177–791（ループと Pause の流れ）。
// 今は曲を持たず、動画なしの時計と状態機械だけを回す（Pause・帯・矩形の外を確かめる骨組み）。

import { perfNow } from '../../clock/clock-source.ts'
import type { InputEvent } from '../../input/keyboard.ts'
import { initialSession, sessionTick, type Session, type SessionStep } from '../../play/session.ts'
import type { PlayPhase } from '../../play/state.ts'
import { PLAYER_DEFAULT, columnBox } from '../../render/hex/sizing.ts'
import { controlStep, type ControlInput } from '../play-control.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { h } from './frame.ts'
import { pauseOverlay } from './pause.ts'

/** 曲の前の助走 ms（t は −LEAD_MS から始まる。play-dev L73、m1-kickoff §7-19） */
export const LEAD_MS = 2000

/** 相ごとの案内（HUD の下の 1 行） */
export const PHASE_TEXT: Readonly<Record<PlayPhase, string>> = {
  idle: 'Space で開始',
  syncing: '同期中（300 ms は判定を猶予します）',
  playing: '再生中（Esc で一時停止）',
  waiting: '待ち',
  paused: '一時停止中',
  ended: '終わりました',
}

export function playScreen(ctx: ScreenContext): ScreenView {
  const { doc } = ctx
  const t0 = -LEAD_MS
  let session: Session = initialSession({ mode: 'novideo', t0 })
  let raf: number | null = null
  // 外した後に同じ回の入力（「やめる」の後の事象）を効かせない
  let alive = true

  // 左列: プレイヤー矩形（動画なし形態は音源のカード）→ HUD → 案内 → 帯
  const player = h(
    doc,
    'div',
    { className: 'player' },
    h(
      doc,
      'div',
      { className: 'card source' },
      h(doc, 'b', { text: '自前音源' }),
      h(doc, 'span', { text: 'ピアノ音で鳴らします（動画なし）' }),
    ),
  )
  player.id = 'player'
  const hudValue = (label: string): HTMLElement => {
    const v = h(doc, 'dd', { text: '—' })
    hud.append(h(doc, 'dt', { text: label }), v)
    return v
  }
  const hud = h(doc, 'dl', { className: 'hud' })
  const title = hudValue('曲名')
  const progress = hudValue('進行')
  hudValue('精度')
  title.textContent = '（曲なし）'
  progress.textContent = '0%'
  const status = h(doc, 'p', { className: 'status', text: PHASE_TEXT.idle })
  const bandSlot = h(doc, 'div', { className: 'bands' })
  bandSlot.setAttribute('role', 'status')
  bandSlot.setAttribute('aria-live', 'polite')
  const left = h(doc, 'div', { className: 'left' }, player, hud, status, bandSlot)

  // 右列: 落下域＋鍵盤図の箱（手順 3 で canvas を描く）と Pause の覆い（右列だけを覆う）
  const pause = pauseOverlay(doc, (choice) => input({ kind: 'choice', choice }))
  const stage = h(doc, 'div', { className: 'stage' }, h(doc, 'canvas'), pause.el)
  const root = h(doc, 'section', { className: 'screen play' }, left, stage)
  root.tabIndex = -1

  const layout = (): void => {
    const box = columnBox({ w: window.innerWidth, h: window.innerHeight }, PLAYER_DEFAULT)
    left.style.width = `${PLAYER_DEFAULT.w}px`
    player.style.height = `${PLAYER_DEFAULT.h}px`
    Object.assign(stage.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    })
  }

  const show = (): void => {
    const phase = session.play.phase
    status.textContent = PHASE_TEXT[phase]
    if (phase === 'paused') pause.show()
    else if (!pause.el.hidden) {
      pause.hide()
      root.focus({ preventScroll: true })
    }
  }

  const apply = (step: SessionStep): void => {
    session = step.session
    show()
  }

  function input(i: ControlInput): void {
    if (!alive) return
    const r = controlStep(session, perfNow(), i, { imeStop: ctx.settings().imeStop, t0 })
    if (r.go !== null) {
      ctx.go(r.go)
      return
    }
    if (r.step !== null) apply(r.step)
  }

  const frame = (): void => {
    apply(sessionTick(session, perfNow(), null))
    raf = requestAnimationFrame(frame)
  }

  layout()
  raf = requestAnimationFrame(frame)

  return {
    root,
    bandSlot,
    player,
    onInput: (events: readonly InputEvent[]) => {
      for (const event of events) input({ kind: 'key', event })
    },
    onResize: layout,
    unmount: () => {
      alive = false
      if (raf !== null) cancelAnimationFrame(raf)
      raf = null
    },
  }
}
