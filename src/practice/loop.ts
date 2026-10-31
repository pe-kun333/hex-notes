// ループ（区間・自動ループ・解除。M2-03 前半、M2 の手順 5）。出どころ: design.md §2.7「自動ループ」（2 小節で MISS 3 回 →
// ループ、1 小節前からカウントイン、ノーミス 2 周で解除）・§1.3 S4（S3 から入ると苦手 2 小節がループ済み）、m4 ループ L297・
// 折り返し L463–464・miss L431–435・evalPhrase L414–417・seekToBar L400–406、m2-kickoff 手順 5・§7-10、decisions #87。
// 手直し: m4 の seek の前倒し travel＋0.1 s → 1 小節前（曲頭なら −LEAD の助走）。m4 の解除なし → ノーミス 2 周。
// 状態は値で持つ純関数。折り返しの judgeRewind と seek は呼ぶ側（app/play-runner.ts）。

import type { MsTable } from '../chart/mstable.ts'
import type { Pulse } from '../shared/types.ts'
import { barStartMs, phraseFirstBar } from './bars.ts'

/** 区間（小節、1 始まり、両端を含む） */
export interface LoopRange {
  readonly startBar: number
  readonly endBar: number
}

/** 自動ループに入る同じ通過の miss の数（§2.7） */
export const AUTO_LOOP_MISSES = 3
/** 解除に要るノーミスの周（§2.7） */
export const CLEAN_LAPS = 2

export interface LoopState {
  readonly range: LoopRange | null
  readonly autoLoop: boolean
  /** 今の区間で回った周（折り返しの数） */
  readonly laps: number
  /** 続けてノーミスだった周 */
  readonly clean: number
  /** 今の周で区間の音の miss */
  readonly lapMiss: number
  /** 区間の外でフレーズごとの同じ通過の miss（フレーズの境の評価で 0 に戻す） */
  readonly phraseMiss: Readonly<Record<number, number>>
  /** 回の折り返しの合計（計測の練習の要約） */
  readonly loops: number
}

export function initialLoop(range: LoopRange | null, autoLoop: boolean): LoopState {
  return { range, autoLoop, laps: 0, clean: 0, lapMiss: 0, phraseMiss: {}, loops: 0 }
}

export function sameRange(a: LoopRange | null, b: LoopRange | null): boolean {
  return a !== null && b !== null && a.startBar === b.startBar && a.endBar === b.endBar
}

/** フレーズ（0 始まり）の区間 */
export function phraseRange(phrase: number): LoopRange {
  const startBar = phraseFirstBar(phrase)
  return { startBar, endBar: startBar + 1 }
}

/** 区間の頭（判定を戻す境、曲 ms） */
export function loopStartMs(ms: MsTable, pulse: Pick<Pulse, 'timeSig'>, r: LoopRange): number {
  return barStartMs(ms, pulse, r.startBar)
}

/**
 * 折り返す曲 ms ＝ min(終点の次の小節の頭, 最終ノートの終わり)（§7-10。最後の小節を含む区間は chartEnd で終わらず折り返す）
 */
export function loopLimitMs(
  ms: MsTable,
  pulse: Pick<Pulse, 'timeSig'>,
  r: LoopRange,
  lastEndMs: number,
): number {
  return Math.min(barStartMs(ms, pulse, r.endBar + 1), lastEndMs)
}

/** 頭出しの曲 ms ＝ 始点の 1 小節前（カウントイン。曲頭より前なら −leadMs の助走） */
export function loopSeekMs(
  ms: MsTable,
  pulse: Pick<Pulse, 'timeSig'>,
  r: LoopRange,
  leadMs: number,
): number {
  return r.startBar <= 1 ? -leadMs : barStartMs(ms, pulse, r.startBar - 1)
}

/**
 * miss 1 つ（音の小節とフレーズ）。区間の中なら今の周の miss に数える。区間が無く自動ループなら、そのフレーズの同じ通過の
 * miss を数え、3 回でそのフレーズ（2 小節）を区間にする（start ＝ 決めた区間。呼ぶ側はすぐ judgeRewind と seek）。区間を
 * ループ中の自動ループは無視（同じ区間でも他の区間でも。m4 L434）
 */
export function loopMiss(
  s: LoopState,
  note: { readonly bar: number; readonly phrase: number },
): { state: LoopState; start: LoopRange | null } {
  if (s.range !== null) {
    const inRange = note.bar >= s.range.startBar && note.bar <= s.range.endBar
    return { state: inRange ? { ...s, lapMiss: s.lapMiss + 1 } : s, start: null }
  }
  if (!s.autoLoop) return { state: s, start: null }
  const count = (s.phraseMiss[note.phrase] ?? 0) + 1
  if (count < AUTO_LOOP_MISSES)
    return { state: { ...s, phraseMiss: { ...s.phraseMiss, [note.phrase]: count } }, start: null }
  const range = phraseRange(note.phrase)
  return {
    state: { ...s, range, laps: 0, clean: 0, lapMiss: 0, phraseMiss: {} },
    start: range,
  }
}

/** フレーズの境の評価（m4 evalPhrase L417: 同じ通過の miss を 0 に戻す） */
export function loopPhraseEnd(s: LoopState, phrase: number): LoopState {
  if (s.phraseMiss[phrase] === undefined) return s
  const phraseMiss = { ...s.phraseMiss }
  delete phraseMiss[phrase]
  return { ...s, phraseMiss }
}

/**
 * 折り返し（t が loopLimitMs に達した）。周を数え、ノーミスが 2 周続いたら区間を外す（release 真 ＝ 止めずに通しへ。
 * 頭出ししない）。でなければ呼ぶ側が judgeRewind(区間の頭) と seek(loopSeekMs)
 */
export function loopWrap(s: LoopState): { state: LoopState; release: boolean } {
  const clean = s.lapMiss === 0 ? s.clean + 1 : 0
  const base = { ...s, laps: s.laps + 1, loops: s.loops + 1, lapMiss: 0 }
  if (clean >= CLEAN_LAPS)
    return { state: { ...base, range: null, laps: 0, clean: 0, phraseMiss: {} }, release: true }
  return { state: { ...base, clean }, release: false }
}

/** 区間を決める（S3 の苦手 2 小節・S4 の帯クリック。手順 6）。周は数え直す */
export function setLoop(s: LoopState, range: LoopRange | null): LoopState {
  return { ...s, range, laps: 0, clean: 0, lapMiss: 0, phraseMiss: {} }
}
