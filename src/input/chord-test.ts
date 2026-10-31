// 同時押しテスト（S0b、M1-04、M1 の手順 9）。出どころ: design.md §2.4（既定 2。診断 10 組を押したまま 1 秒保持。同段 3 組と
// 和音 3 組を全部通せば 3、さらに矩形と両手も通せば 4、1 つでも落ちれば 2）・§1.3 S0b（進捗 n/10、押下キーの点灯、1 秒の
// 保持バー、最初の keydown が 229 なら帯を出し組をやり直す）、m6 S0b L258–267・renderS0 L727、decisions #7・#26、
// m1-kickoff 手順 9・§7-13（細部、仮）。
// 細部（§7-13、仮）: 押下集合がちょうどその組になった keydown の tsPerf から 1,000 ms 続けば通過。組の外の鍵が押されたら落ち、
// 揃った後に 1 つでも離せば落ち（揃う前の離しは数えない）、組が始まってから 10 秒で揃わなければ落ち（ゴースト ＝ 3 鍵目の
// keydown が来ない）。落ちた組はやり直さず次へ。IME（229）だけは同じ組をやり直す。次の組は押している鍵が全部離れてから
// 始める（前の組の鍵を次の組の余分な鍵に数えない）。純関数（時刻は tsPerf と呼ぶ側の now）。

import type { KeyCode } from '../shared/types.ts'
import { DEFAULT_CHORD_LIMIT, type ChordLimit } from '../shared/types.ts'

/** 保持する長さ ms（§2.4） */
export const CHORD_HOLD_MS = 1000
/** 揃わなければ落とす長さ ms（§7-13、仮） */
export const CHORD_TIMEOUT_MS = 10_000

export type ChordKind = 'row' | 'chord' | 'rect' | 'hands'

export interface ChordGroup {
  readonly kind: ChordKind
  readonly codes: readonly KeyCode[]
}

/** 10 組（§2.4 の順: 同段 3・3u 離れた和音 3・矩形 2・両手 2） */
export const CHORD_GROUPS: readonly ChordGroup[] = [
  { kind: 'row', codes: ['KeyZ', 'KeyX', 'KeyC'] },
  { kind: 'row', codes: ['KeyA', 'KeyS', 'KeyD'] },
  { kind: 'row', codes: ['KeyQ', 'KeyW', 'KeyE'] },
  { kind: 'chord', codes: ['KeyA', 'KeyD', 'KeyG'] },
  { kind: 'chord', codes: ['KeyS', 'KeyF', 'KeyJ'] },
  { kind: 'chord', codes: ['KeyD', 'KeyG', 'KeyK'] },
  { kind: 'rect', codes: ['KeyQ', 'KeyW', 'KeyA', 'KeyS'] },
  { kind: 'rect', codes: ['KeyE', 'KeyR', 'KeyD', 'KeyF'] },
  { kind: 'hands', codes: ['KeyA', 'KeyS', 'KeyK', 'KeyL'] },
  { kind: 'hands', codes: ['KeyZ', 'KeyX', 'Comma', 'Period'] },
]

export type ChordOutcome = 'pass' | 'fail'

export interface ChordTestState {
  /** 今の組（10 で終わり） */
  readonly index: number
  readonly results: readonly ChordOutcome[]
  readonly down: ReadonlySet<KeyCode>
  /** 組が始まった時刻（前の組の鍵が全部離れるまでは null ＝ 待ち） */
  readonly startedAt: number | null
  /** 押下集合がちょうど組になった時刻（揃っていなければ null） */
  readonly since: number | null
}

export type ChordTestEvent =
  | { readonly kind: 'press'; readonly code: KeyCode; readonly tsPerf: number }
  | { readonly kind: 'release'; readonly code: KeyCode; readonly tsPerf: number }
  /** IME（keyCode 229）の打鍵。同じ組をやり直す（§1.3 S0b） */
  | { readonly kind: 'ime'; readonly tsPerf: number }

export function initialChordTest(now: number): ChordTestState {
  return { index: 0, results: [], down: new Set(), startedAt: now, since: null }
}

export const chordDone = (s: ChordTestState): boolean => s.index >= CHORD_GROUPS.length

/** 組の鍵が全部押されている（組の外の鍵はその場で落ちるので、押下集合は組の鍵だけ） */
const exact = (down: ReadonlySet<KeyCode>, g: ChordGroup): boolean =>
  g.codes.every((c) => down.has(c))

/** 組を閉じて次へ（押している鍵が残っていれば、全部離れるまで次の組を始めない） */
function close(s: ChordTestState, outcome: ChordOutcome, at: number): ChordTestState {
  return {
    index: s.index + 1,
    results: [...s.results, outcome],
    down: s.down,
    startedAt: s.down.size === 0 ? at : null,
    since: null,
  }
}

/** 押下・離し・IME を 1 つ */
export function chordStep(s: ChordTestState, ev: ChordTestEvent): ChordTestState {
  if (chordDone(s)) return s
  const g = CHORD_GROUPS[s.index]
  if (g === undefined) return s
  if (ev.kind === 'ime')
    return { ...s, startedAt: s.startedAt === null ? null : ev.tsPerf, since: null }
  const down = new Set(s.down)
  if (ev.kind === 'press') down.add(ev.code)
  else down.delete(ev.code)
  // 待ち（前の組の鍵が残っている）: 全部離れたら組を始める。待ちの間の押下は数えない
  if (s.startedAt === null) return { ...s, down, startedAt: down.size === 0 ? ev.tsPerf : null }
  const next: ChordTestState = { ...s, down }
  if (ev.kind === 'press') {
    if (!g.codes.includes(ev.code)) return close(next, 'fail', ev.tsPerf)
    return exact(down, g) ? { ...next, since: ev.tsPerf } : next
  }
  // 揃った後の離しは落ち、揃う前の離しは数えない
  if (s.since !== null) return close(next, 'fail', ev.tsPerf)
  return next
}

/** 時間の経過（毎フレーム）: 1,000 ms 揃い続けたら通過、10 秒で揃わなければ落ち */
export function chordTick(s: ChordTestState, now: number): ChordTestState {
  if (chordDone(s) || s.startedAt === null) return s
  if (s.since !== null) return now - s.since >= CHORD_HOLD_MS ? close(s, 'pass', now) : s
  return now - s.startedAt >= CHORD_TIMEOUT_MS ? close(s, 'fail', now) : s
}

/** 保持の進み 0–1（揃っていなければ 0） */
export function chordHold(s: ChordTestState, now: number): number {
  return s.since === null ? 0 : Math.min(1, Math.max(0, (now - s.since) / CHORD_HOLD_MS))
}

/** 結果の上限: 同段 3 組と和音 3 組が全部通れば 3、さらに矩形と両手も通れば 4、他は 2（§2.4）。未完了の組は落ちと同じ */
export function chordLimit(results: readonly ChordOutcome[]): ChordLimit {
  const passed = (k: ChordKind): boolean =>
    CHORD_GROUPS.every((g, i) => g.kind !== k || results[i] === 'pass')
  if (!passed('row') || !passed('chord')) return DEFAULT_CHORD_LIMIT
  return passed('rect') && passed('hands') ? 4 : 3
}

const KIND_NAMES: Readonly<Record<ChordKind, string>> = {
  row: '同段',
  chord: '和音',
  rect: '矩形',
  hands: '両手',
}

/** 結果の文（m6 L727「結果: 同段 3 組と和音 3 組を通過、矩形で 1 組落ちました → 上限 3。」の形） */
export function chordResultText(results: readonly ChordOutcome[]): string {
  const failed = new Map<ChordKind, number>()
  CHORD_GROUPS.forEach((g, i) => {
    if (results[i] !== 'pass') failed.set(g.kind, (failed.get(g.kind) ?? 0) + 1)
  })
  const limit = chordLimit(results)
  if (failed.size === 0) return `結果: 10 組すべて通過しました → 上限 ${limit}。`
  const fails = [...failed].map(([k, n]) => `${KIND_NAMES[k]}で ${n} 組`).join('、')
  const head = limit >= 3 ? '同段 3 組と和音 3 組を通過、' : ''
  return `結果: ${head}${fails}落ちました → 上限 ${limit}。`
}
