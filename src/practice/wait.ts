// 待ち（音待ち／フレーズ待ち／固定テンポ。M2-03 前半、M2 の手順 5）。出どころ: design.md §2.7「音待ち／フレーズ待ち」
// 「固定テンポ」・§4.2、decisions #80（解除は待った tick の着地 − 猶予·rate から再開、250 ms の空白はフレーズ待ちだけ、待った
// 音は perfect で記録しずれの標本に入れない、待ち中の鍵違いは tainted と誤打の音）、m4 update L471–480・starter L361–362・
// 誤打 L449–450、m2-kickoff 手順 5・§7-3。
// 手直し: m4 の音待ちは音ごとに止まる → 同じ tick の組で止まる。m4 の巻き戻し無し → 全ての待ちで GRACE_MS·rate 戻す。
// 状態は値で持つ純関数。時計・判定には触らず、呼ぶ側（app/play-runner.ts）が PlayEvent（waitStop・waitHit）と判定層の
// judgeWaitHit に渡す。源が動画なら常に固定テンポ（§1.3 S4、動画の自動停止・再開の反復を避ける）。

import { GRACE_MS } from '../clock/grace.ts'
import type { ClockMode } from '../clock/types.ts'
import type { KeyCode, Pulse } from '../shared/types.ts'
import { phraseOfBeat } from './bars.ts'

/** 待ち方（ResultRecord.mode と同じ値。fixed ＝ 止まらない、通常プレイの唯一のモード） */
export type WaitMode = 'note' | 'phrase' | 'fixed'

/** フレーズ待ちの解除の前の空白 ms（§2.7・m4 GAP_MS。音待ちには入れない、#80） */
export const PHRASE_GAP_MS = 250

/** 待ちが見る音（描画層の FrameNote の欄。group は tick） */
export interface WaitNote {
  readonly index: number
  readonly code: KeyCode
  readonly tLandMs: number
  readonly group: number
}

/** 止まっている組（同じ tick の音） */
export interface WaitGroup {
  readonly landMs: number
  /** 組の音（notes の添字）と鍵 */
  readonly notes: readonly { readonly index: number; readonly code: KeyCode }[]
}

export interface WaitState {
  readonly mode: WaitMode
  /** フレーズ待ちで止まる着地（フレーズ 1 以降の最初の tick。音待ちは null ＝ 全ての tick） */
  readonly targets: ReadonlySet<number> | null
  readonly group: WaitGroup | null
  /** 組のうち当てた音（notes の添字） */
  readonly hit: readonly number[]
  /** この組で鍵違いを押した（後で当てても自力率は「外した」、α ＋0.30） */
  readonly tainted: boolean
  /** フレーズ待ちの解除の時刻（実時間。組が揃ってから 250 ms の空白） */
  readonly releaseAt: number | null
  /** 止まった回数（計測の練習の要約） */
  readonly waits: number
}

/** 実際の待ち方（源が動画なら固定テンポ） */
export function effectiveMode(mode: WaitMode, source: ClockMode): WaitMode {
  return source === 'video' ? 'fixed' : mode
}

/**
 * 待ちの始め。フレーズ待ちの止まる着地 ＝ フレーズ k ≥ 1（小節 2k＋1〜2k＋2）の最初の tick（m4 starter L361–362。フレーズ 0 は
 * 止まらない）
 */
export function initialWait(
  mode: WaitMode,
  notes: readonly WaitNote[],
  pulse: Pick<Pulse, 'resolution' | 'timeSig'>,
): WaitState {
  let targets: Set<number> | null = null
  if (mode === 'phrase') {
    const first = new Map<number, number>()
    for (const n of notes) {
      const p = phraseOfBeat(pulse, n.group / pulse.resolution)
      if (p >= 1 && (first.get(p) ?? Infinity) > n.tLandMs) first.set(p, n.tLandMs)
    }
    targets = new Set(first.values())
  }
  return { mode, targets, group: null, hit: [], tainted: false, releaseAt: null, waits: 0 }
}

/**
 * 毎フレーム（再生中だけ呼ぶ）。未判定の音のうち着地に達した tick があれば、その組で止める（stop 真 → waitStop）。
 * 音待ちは最も早い未判定の tick、フレーズ待ちは止まる着地のうち未判定の音が残る tick。notes は着地の順
 */
export function waitCheck(
  s: WaitState,
  notes: readonly WaitNote[],
  pending: (index: number) => boolean,
  t: number,
): { state: WaitState; stop: boolean } {
  if (s.mode === 'fixed' || s.group !== null) return { state: s, stop: false }
  for (const n of notes) {
    if (n.tLandMs > t) break
    if (!pending(n.index)) continue
    if (s.targets !== null && !s.targets.has(n.tLandMs)) continue
    const group = notes.filter((x) => x.tLandMs === n.tLandMs && pending(x.index))
    return {
      state: { ...s, group: { landMs: n.tLandMs, notes: group.map((x) => ({ index: x.index, code: x.code })) }, hit: [], tainted: false, releaseAt: null, waits: s.waits + 1 },
      stop: true,
    }
  }
  return { state: s, stop: false }
} // prettier-ignore

/** 待ち中の押下の結果 */
export type WaitPress =
  /** 組の音を当てた（judgeWaitHit に index と tainted を渡す）。done は組が揃った */
  | {
      readonly kind: 'hit'
      readonly index: number
      readonly tainted: boolean
      readonly done: boolean
    }
  /** 鍵違い（組の全音に tainted。誤打の音を鳴らす） */
  | { readonly kind: 'wrong' }
  /** 組の当てた鍵をもう一度押した・待っていない */
  | { readonly kind: 'none' }

/** 待ち中の押下 1 つ（m4 L446–450 の作り直し） */
export function waitPress(s: WaitState, code: KeyCode): { state: WaitState; press: WaitPress } {
  const g = s.group
  if (g === null || s.releaseAt !== null) return { state: s, press: { kind: 'none' } }
  const n = g.notes.find((x) => x.code === code && !s.hit.includes(x.index))
  if (n === undefined) {
    if (g.notes.some((x) => x.code === code)) return { state: s, press: { kind: 'none' } }
    return { state: { ...s, tainted: true }, press: { kind: 'wrong' } }
  }
  const hit = [...s.hit, n.index]
  const done = hit.length >= g.notes.length
  return { state: { ...s, hit }, press: { kind: 'hit', index: n.index, tainted: s.tainted, done } }
}

/**
 * 組が揃った後の解除。音待ちはすぐ、フレーズ待ちは 250 ms の空白の後（呼ぶ側はその間も時計を止めたまま毎フレーム呼ぶ）。
 * 解除なら t ＝ 待った tick の着地 − GRACE_MS·rate（猶予 300 ms の終わりで t が着地に戻る、#80）と landMs（発音の予約は
 * 着地から数え直す。巻き戻した区間を鳴らし直さない）を返し、組を下ろす
 */
export function waitRelease(
  s: WaitState,
  now: number,
  rate: number,
): { state: WaitState; release: { readonly t: number; readonly landMs: number } | null } {
  const g = s.group
  if (g === null || s.hit.length < g.notes.length) return { state: s, release: null }
  if (s.mode === 'phrase') {
    if (s.releaseAt === null)
      return { state: { ...s, releaseAt: now + PHRASE_GAP_MS }, release: null }
    if (now < s.releaseAt) return { state: s, release: null }
  }
  return {
    state: { ...s, group: null, hit: [], tainted: false, releaseAt: null },
    release: { t: g.landMs - GRACE_MS * rate, landMs: g.landMs },
  }
}

/** 組を下ろす（ループの頭出し。戻した音で改めて止まる） */
export function clearWait(s: WaitState): WaitState {
  return s.group === null ? s : { ...s, group: null, hit: [], tainted: false, releaseAt: null }
}
