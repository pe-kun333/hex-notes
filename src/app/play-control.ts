// S2 の入力の振り分けと Pause メニュー（M1-13、M1 の手順 2）。出どころ: design.md §1.3 S2「Pause（Esc・blur・
// visibilitychange）は再開／最初から／やめる。再開は S7b を通る」・§2.8（役割キー: Space＝開始・再開、Escape＝一時停止。
// IME の打鍵は無視して帯、曲は止めない）・§1.3 S6「IME 検知時に曲を止める（既定 OFF）」、decisions #26・#35（Pause 要求は
// 冪等。タブの切替は hidden と blur の 2 件）・#65（一時停止中の Escape、最初から、やめる。仮）、m6 Pause の覆い L347–353・
// keydown L1037–1044、play-dev L686–694。
// 入力の事象と Pause の選択 → プレイの状態機械への事象・やり直し・画面の移動の純関数。押下・離しの判定は手順 3（play-runner）。

import type { InputEvent } from '../input/keyboard.ts'
import { initialSession, sessionInput, type Session, type SessionStep } from '../play/session.ts'
import type { PlayEvent, PlayPhase } from '../play/state.ts'

/** Pause メニューの選択（再開 Space／最初から／やめる） */
export type PauseChoice = 'resume' | 'restart' | 'quit'
export const PAUSE_CHOICES: readonly PauseChoice[] = ['resume', 'restart', 'quit']

export type ControlInput =
  { kind: 'key'; event: InputEvent } | { kind: 'choice'; choice: PauseChoice }

/** 振り分けの結果。play ＝ 状態機械へ、restart ＝ 曲の頭から始め直す、quit ＝ S1 へ（記録は保存しない） */
export type ControlAction =
  { kind: 'play'; event: PlayEvent } | { kind: 'restart' } | { kind: 'quit' }

export interface ControlOptions {
  /** S6「IME 検知時に曲を止める」（hexnote.settings.imeStop、既定 OFF） */
  readonly imeStop: boolean
}

/**
 * 入力 → 行い。Space は待機なら開始、一時停止なら再開（他の相では何もしない）。Escape と blur・非表示・iframe は Pause 要求で、
 * 効くかは状態機械が決める（冪等。一時停止中の Escape は何もしない ＝ やめるはメニューから、#65）。IME の検知は imeStop が
 * ON のときだけ Pause 要求。押下・離し・Enter・帯の点け消しはここでは扱わない（null）。
 */
export function controlOf(
  phase: PlayPhase,
  input: ControlInput,
  opts: ControlOptions,
): ControlAction | null {
  if (input.kind === 'choice') {
    if (input.choice === 'resume') return { kind: 'play', event: { kind: 'resume' } }
    return { kind: input.choice }
  }
  const ev = input.event
  switch (ev.kind) {
    case 'role':
      if (ev.role === 'pause') return { kind: 'play', event: { kind: 'pause', reason: 'escape' } }
      if (ev.role === 'primary') {
        if (phase === 'idle') return { kind: 'play', event: { kind: 'start' } }
        if (phase === 'paused') return { kind: 'play', event: { kind: 'resume' } }
      }
      return null
    case 'pause':
      return { kind: 'play', event: { kind: 'pause', reason: ev.reason } }
    case 'ime':
      return opts.imeStop ? { kind: 'play', event: { kind: 'pause', reason: 'ime' } } : null
    default:
      return null
  }
}

/**
 * 曲の頭から始め直す（「最初から」。動画なしは t0 から時計の start、§1.3 S2）。新しい時計で待機から開始を入れ、
 * 同期中（猶予 300 ms）から走る
 */
export function restartSession(t0: number, now: number): SessionStep {
  return sessionInput(initialSession({ mode: 'novideo', t0 }), now, { kind: 'start' })
}

export interface ControlStep {
  /** 時計と状態機械の 1 歩（何もしない入力は null） */
  readonly step: SessionStep | null
  /** 画面の移動（「やめる」→ S1。記録は保存しない） */
  readonly go: 'S1' | null
}

/** 入力を今の session に効かせる（t0 は「最初から」の開始の t。動画なしの曲の頭） */
export function controlStep(
  s: Session,
  now: number,
  input: ControlInput,
  opts: ControlOptions & { readonly t0: number },
): ControlStep {
  const a = controlOf(s.play.phase, input, opts)
  if (a === null) return { step: null, go: null }
  if (a.kind === 'quit') return { step: null, go: 'S1' }
  if (a.kind === 'restart') return { step: restartSession(opts.t0, now), go: null }
  return { step: sessionInput(s, now, a.event), go: null }
}
