// 入力層の芯（M0-04、手順 5）。KeyboardEvent を DOM 無しのレコードで受け、押下集合を更新して入力イベント列を返す。
// 出どころ: design.md §2.8「code で判定、押下集合で keyup と対応付け、e.repeat か既にある code は捨てる。IME…は
// 無視して帯…修飾キーは使わない」、§4.1「{code, tsPerf} に正規化。repeat 捨て、IME 無視＋帯、blur で全離し、役割キー」、
// kickoff 手順 5（m1' L524–533、m3 L647–655、m4 L650–659・L674、m2 L409–416 の手直し）、L49（試験は
// {code, keyCode, isComposing, repeat, timeStamp} のレコード）。グローバル状態を持たない（状態は引数と戻り値）。
// 時刻は ms。now は src/app/ がハンドラの冒頭で 1 回読んで値で渡す（performance.now の直呼びは src/clock/clock-source.ts
// の perfNow と src/app/ だけ。kickoff §2・decisions #32）。tsPerf の式は timestamp.ts（decisions #25、仮）。

import type { KeyCode } from '../shared/types.ts'
import type { FocusSignal, PauseReason } from './focus.ts'
import { focusAction } from './focus.ts'
import { isImeKeydown, nextImeBand } from './ime.ts'
import type { Role } from './roles.ts'
import { META_CODES, PLAY_CODES, ROLE_KEYS, classifyCode } from './roles.ts'
import { toTsPerf } from './timestamp.ts'

/** 入力層が受けるレコード（KeyboardEvent の写し。src/app/ が作る） */
export interface KeyEventRecord {
  type: 'keydown' | 'keyup'
  code: KeyCode
  /** Event.timeStamp（performance.timeOrigin 基準の ms） */
  timeStamp: number
  repeat: boolean
  isComposing: boolean
  keyCode: number
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

/** 入力層の状態。down ＝ 押下集合（演奏と役割の code → 押した tsPerf、押した順）、imeBand ＝ IME の帯が点いているか */
export interface InputState {
  readonly down: ReadonlyMap<KeyCode, number>
  readonly imeBand: boolean
}

export function emptyInputState(): InputState {
  return { down: new Map(), imeBand: false }
}

/**
 * 入力イベント。press が入力列（{code, tsPerf}。lag は入力遅延の標本 now − timeStamp で、timeStamp が使えない・
 * 古いときは null）。release はホールドの離し（forced ＝ blur・非表示・iframe・コンテキストメニュー・Meta での
 * 全離し。時刻は blur などが now、Meta の keyup による全離しはその keyup の tsPerf。decisions #25 (a)。採点しない）。
 * role は役割キーの押下（Space の校正タップも同じ tsPerf）。ime は IME の keydown の検知（毎回出す。S6 の「IME 検知時に
 * 曲を止める」と S0b の「229 なら組をやり直す」はこれを見る）、imeBand は帯の表示の点け消し（変わったときだけ）。
 * pause は一時停止の要求（blur・非表示・iframe）。Escape は role の pause で、呼ぶ側は両方で一時停止に入る
 * （要求は冪等。どの相で効かせるかは呼ぶ側のプレイの状態機械 src/play/state.ts が決める。decisions #26・#35）。
 */
export type InputEvent =
  | { kind: 'press'; code: KeyCode; tsPerf: number; lag: number | null }
  | { kind: 'release'; code: KeyCode; tsPerf: number; forced: boolean }
  | { kind: 'role'; role: Role; code: KeyCode; tsPerf: number }
  | { kind: 'ime'; code: KeyCode; tsPerf: number }
  | { kind: 'imeBand'; on: boolean; code: KeyCode; tsPerf: number }
  | { kind: 'pause'; reason: PauseReason; tsPerf: number }

export interface InputStep {
  /** 何も変わらなかった回は渡した state をそのまま返す（呼ぶ側は === で変化を見られる） */
  state: InputState
  events: InputEvent[]
  /** 呼ぶ側が e.preventDefault() を呼ぶか（演奏・役割の鍵だけ。素通しの鍵と IME の keydown はブラウザに渡す） */
  preventDefault: boolean
}

export interface KeyboardOptions {
  /** 演奏に使う code（既定は 40 個の PLAY_CODES） */
  playCodes?: ReadonlySet<KeyCode>
}

function pass(state: InputState): InputStep {
  return { state, events: [], preventDefault: false }
}

/**
 * keydown／keyup を 1 つ処理する。keydown の順（仮、decisions #26）:
 * 1. Ctrl・Alt・Meta 付きは素通し（ブラウザの操作に渡す。Shift は見ない）。
 * 2. 禁止・修飾の code は素通し（半角/全角＝Backquote は IME より先に捨て、切替で帯を点けない）。
 * 3. IME（229／isComposing）なら入れずに ime を出し、帯を点ける（点いていなければ imeBand 1 件）。preventDefault しない。
 * 4. その他の code（Tab・矢印など）は素通し。
 * 5. IME でない演奏・役割の keydown で帯を消す。repeat か押下集合に既にある code は捨てる。
 * 6. 押下集合に足し、演奏なら press、役割なら role を出す。
 * keyup は修飾の有無・IME を見ず、押下集合にある code だけを外す（役割でなければ release。押した後に playCodes が
 * 変わっても離しは出す）。Meta の keyup は全離し（macOS は Meta を押している間に離した鍵の keyup を出さない）。
 */
export function handleKey(
  state: InputState,
  ev: KeyEventRecord,
  now: number,
  opts: KeyboardOptions = {},
): InputStep {
  const { tsPerf, lag } = toTsPerf(ev.timeStamp, now)

  if (ev.type === 'keyup') {
    if (META_CODES.has(ev.code)) return releaseAll(state, tsPerf)
    if (!state.down.has(ev.code)) return pass(state)
    const down = new Map(state.down)
    down.delete(ev.code)
    const events: InputEvent[] =
      ROLE_KEYS[ev.code] === undefined
        ? [{ kind: 'release', code: ev.code, tsPerf, forced: false }]
        : []
    return { state: { ...state, down }, events, preventDefault: true }
  }

  if (ev.ctrlKey || ev.altKey || ev.metaKey) return pass(state)
  const cls = classifyCode(ev.code, opts.playCodes ?? PLAY_CODES)
  if (cls.kind === 'forbidden' || cls.kind === 'modifier') return pass(state)

  if (isImeKeydown(ev)) {
    const band = nextImeBand(state.imeBand, 'ime')
    const events: InputEvent[] = [{ kind: 'ime', code: ev.code, tsPerf }]
    if (!band.changed) return { state, events, preventDefault: false }
    events.push({ kind: 'imeBand', on: true, code: ev.code, tsPerf })
    return { state: { ...state, imeBand: true }, events, preventDefault: false }
  }
  if (cls.kind === 'other') return pass(state)

  const band = nextImeBand(state.imeBand, 'playOrRole')
  const events: InputEvent[] = band.changed
    ? [{ kind: 'imeBand', on: false, code: ev.code, tsPerf }]
    : []
  const base = band.changed ? { ...state, imeBand: false } : state
  if (ev.repeat || state.down.has(ev.code)) return { state: base, events, preventDefault: true }

  const down = new Map(state.down)
  down.set(ev.code, tsPerf)
  events.push(
    cls.kind === 'play'
      ? { kind: 'press', code: ev.code, tsPerf, lag }
      : { kind: 'role', role: cls.role, code: ev.code, tsPerf },
  )
  return { state: { ...base, down }, events, preventDefault: true }
}

/** 押下集合を空にする。役割でない鍵ごとに release（forced）を押した順に出す。役割の鍵は黙って外す */
export function releaseAll(state: InputState, tsPerf: number): InputStep {
  if (state.down.size === 0) return pass(state)
  const events: InputEvent[] = []
  for (const code of state.down.keys())
    if (ROLE_KEYS[code] === undefined) events.push({ kind: 'release', code, tsPerf, forced: true })
  return { state: { ...state, down: new Map() }, events, preventDefault: false }
}

/**
 * blur・visibilitychange・contextmenu を処理する。全離し＋Pause 要求（contextmenu は全離しだけ）。
 * reclaim は呼ぶ側が焦点をページへ戻すか。
 */
export function handleFocus(
  state: InputState,
  sig: FocusSignal,
  now: number,
): { state: InputState; events: InputEvent[]; reclaim: boolean } {
  const act = focusAction(sig)
  let next = state
  const events: InputEvent[] = []
  if (act.releaseAll) {
    const r = releaseAll(state, now)
    next = r.state
    events.push(...r.events)
  }
  if (act.pause !== null) events.push({ kind: 'pause', reason: act.pause, tsPerf: now })
  return { state: next, events, reclaim: act.reclaim }
}
