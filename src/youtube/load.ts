// 読込の見張り（M3 の手順 1、仮。m3 loadYT L462–475 の形を純関数にした）。同意の門 → iframe_api（読めた後は 1 ページ
// 1 回）→ iframe と YT.Player の順に効果を返し、onReady・onError・script の読込の失敗・応答なしを事象にする。
// 世代番号で遅れた事象を捨てる（作り直し・dispose で世代を進める）。見張りは mount から 1 本（10,000 ms は自作値、
// m3-kickoff §7-41）。読込の失敗（script の onerror）は自作の code −1、応答なしは −2（m3-kickoff §7-26・§7-38、仮）で、
// どちらも errorGroupOf に渡さない。読込の失敗の後の mount は script を作り直して 1 回試す（m3 L475）。DOM に触れない。

import { errorGroupOf, type ErrorGroup } from './errors.ts'

/** onReady を待つ長さ（mount から。自作値） */
export const RESPONSE_TIMEOUT_MS = 10_000
/** 読込の失敗・応答なしの自作の code */
export const LOAD_FAIL_CODE = -1
export const NO_RESPONSE_CODE = -2

/** idle ＝ まだ mount していない／門が閉じた、loadingApi ＝ iframe_api を待つ、waitingReady ＝ onReady を待つ */
export type LoadPhase = 'idle' | 'loadingApi' | 'waitingReady' | 'ready' | 'failed' | 'disposed'

export interface LoadState {
  readonly gen: number
  readonly phase: LoadPhase
  /** 見張りの起点（mount の now） */
  readonly startedAt: number
}

/** iframe_api の様子（mount の時に app 層が見る）: 読めている／まだ／前に読込に失敗した */
export type ApiStatus = 'ready' | 'absent' | 'failed'

export type LoadInput =
  | { kind: 'mount'; now: number; gate: boolean; api: ApiStatus }
  | { kind: 'apiLoaded'; gen: number }
  | { kind: 'apiFailed'; gen: number }
  | { kind: 'ready'; gen: number }
  | { kind: 'error'; gen: number; code: number }
  | { kind: 'tick'; now: number }
  | { kind: 'dispose' }

export type LoadEffect =
  /** iframe_api の script を足す（recreate ＝ 前の失敗した script を外して作り直す） */
  | { kind: 'loadApi'; recreate: boolean }
  /** 自前の iframe を host に敷き、new YT.Player を付ける */
  | { kind: 'createPlayer'; gen: number }
  /** 応答なしで iframe を外す */
  | { kind: 'removeIframe' }
  /** player.destroy() と iframe を外す */
  | { kind: 'destroy' }

export type LoadNotice =
  | { kind: 'loadFail'; code: number }
  | { kind: 'noResponse'; code: number }
  | { kind: 'error'; code: number; group: ErrorGroup }

export interface LoadStep {
  state: LoadState
  effects: LoadEffect[]
  notices: LoadNotice[]
}

export const initialLoad: LoadState = { gen: 0, phase: 'idle', startedAt: 0 }

const keep = (state: LoadState): LoadStep => ({ state, effects: [], notices: [] })

export function loadStep(s: LoadState, ev: LoadInput): LoadStep {
  switch (ev.kind) {
    case 'mount': {
      if (!ev.gate) return keep(s)
      const gen = s.gen + 1
      if (ev.api === 'ready')
        return {
          state: { gen, phase: 'waitingReady', startedAt: ev.now },
          effects: [{ kind: 'createPlayer', gen }],
          notices: [],
        }
      return {
        state: { gen, phase: 'loadingApi', startedAt: ev.now },
        effects: [{ kind: 'loadApi', recreate: ev.api === 'failed' }],
        notices: [],
      }
    }
    case 'apiLoaded':
      if (ev.gen !== s.gen || s.phase !== 'loadingApi') return keep(s)
      return {
        state: { ...s, phase: 'waitingReady' },
        effects: [{ kind: 'createPlayer', gen: s.gen }],
        notices: [],
      }
    case 'apiFailed':
      if (ev.gen !== s.gen || s.phase !== 'loadingApi') return keep(s)
      return {
        state: { ...s, phase: 'failed' },
        effects: [],
        notices: [{ kind: 'loadFail', code: LOAD_FAIL_CODE }],
      }
    case 'ready':
      if (ev.gen !== s.gen || s.phase !== 'waitingReady') return keep(s)
      return keep({ ...s, phase: 'ready' })
    case 'error':
      if (ev.gen !== s.gen || (s.phase !== 'waitingReady' && s.phase !== 'ready')) return keep(s)
      return {
        state: { ...s, phase: 'failed' },
        effects: [],
        notices: [{ kind: 'error', code: ev.code, group: errorGroupOf(ev.code) }],
      }
    case 'tick':
      if (s.phase !== 'loadingApi' && s.phase !== 'waitingReady') return keep(s)
      if (ev.now - s.startedAt < RESPONSE_TIMEOUT_MS) return keep(s)
      return {
        state: { ...s, phase: 'failed' },
        effects: [{ kind: 'removeIframe' }],
        notices: [{ kind: 'noResponse', code: NO_RESPONSE_CODE }],
      }
    case 'dispose':
      return {
        state: { ...s, gen: s.gen + 1, phase: 'disposed' },
        effects: [{ kind: 'destroy' }],
        notices: [],
      }
  }
}
