// その回のヒートマップの集計（M4-04、M4 の手順 1）。出どころ: docs/planning/m4-kickoff.md 手順 1・§7-7、m4-practice の
// heatKey・recordDir L439–440・誤打の相手 L448、decisions #118（その回だけで保存しない）・#120（相手と待ち・ループの回）。
// 回の間、判定の事象を 1 つずつ足して貯め（heatAdd）、終わりに鍵ごとにまとめる（heatStats）。回の終わりの判定の状態からは
// 作らない（ループは周ごとに結果が巻き戻り、最後の周しか残らないため。judgeRewind）。純関数（DOM に触れない）。
//
// 誤打の向き: 狙いの鍵から見て、押した鍵が六角のどの隣か（HEX_DIRS の順 R・DR・DL・L・UL・UR）。扇は狙いの鍵に付く。
// 隣でない誤打は other に数え、扇にしない（m4 は角度を 60° に丸めて全部を 6 つに入れていた → 隣だけ）。向きは物理の鍵の
// 位置（keyPosition）で決め、配列には依らない。

import type { JudgeOutcome } from '../judge/judge.ts'
import { sampleSd } from '../judge/score.ts'
import { keyPosition } from '../layout/presets.ts'
import { HEX_DIRS, hexDist } from '../render/hex/hex.ts'
import type { KeyCode } from '../shared/types.ts'

/** 1 つの鍵（狙いの鍵）に貯めた物 */
export interface HeatKey {
  /** 誤打の向きごとの回数（HEX_DIRS の順の 6 つ） */
  readonly dirs: readonly number[]
  /** 隣でない誤打の回数（扇にしない） */
  readonly other: number
  /** 当てた音のずれ ms（押した − 着地。正が遅い）。perfect・great・good だけ（timingSamples と同じ選び方） */
  readonly offs: readonly number[]
}

/** その回のヒートマップ（狙いの鍵 → 貯めた物）。保存しない */
export type Heat = ReadonlyMap<KeyCode, HeatKey>

export const EMPTY_HEAT: Heat = new Map()

/**
 * heatAdd が受ける物: 判定の事象か、待ちの間の鍵違い（src/practice/wait.ts の wrong。判定層を通らない）。waiting は
 * 待っている組のうちまだ当てていない音の鍵
 */
export type HeatInput =
  | JudgeOutcome
  | { readonly kind: 'waitWrong'; readonly code: KeyCode; readonly waiting: readonly KeyCode[] }

const EMPTY_KEY: HeatKey = { dirs: [0, 0, 0, 0, 0, 0], other: 0, offs: [] }

/** 押した鍵が狙いの鍵のどの隣か（HEX_DIRS の添字）。隣でなければ -1、どちらかが 40 個の外なら null */
export function dirIndexOf(target: KeyCode, pressed: KeyCode): number | null {
  const a = keyPosition(target)
  const b = keyPosition(pressed)
  if (a === null || b === null) return null
  return HEX_DIRS.findIndex((d) => b.row - a.row === d.dr && b.col - a.col === d.dc)
}

/**
 * 待ちの間の鍵違いの相手: 待っている音のうち、押した鍵に六角距離で一番近い鍵（同じ近さなら先の音）。無ければ null。
 * 待ちの組は同じ着地の音なので、時刻ではなく位置で選ぶ（和音の 1 つ隣を押した、を拾う）
 */
export function waitTargetOf(code: KeyCode, waiting: readonly KeyCode[]): KeyCode | null {
  const p = keyPosition(code)
  let best: KeyCode | null = null
  let bestD = Infinity
  for (const w of waiting) {
    const q = keyPosition(w)
    const d = p === null || q === null ? Infinity : hexDist(p, q)
    if (best === null || d < bestD) {
      best = w
      bestD = d
    }
  }
  return best
}

function withKey(heat: Heat, code: KeyCode, f: (k: HeatKey) => HeatKey): Heat {
  const m = new Map(heat)
  m.set(code, f(heat.get(code) ?? EMPTY_KEY))
  return m
}

function addWrong(heat: Heat, target: KeyCode, pressed: KeyCode): Heat {
  if (target === pressed) return heat
  const i = dirIndexOf(target, pressed)
  if (i === null) return heat
  return withKey(heat, target, (k) =>
    i < 0
      ? { ...k, other: k.other + 1 }
      : { ...k, dirs: k.dirs.map((c, j) => (j === i ? c + 1 : c)) },
  )
}

/**
 * 事象 1 つを足す（変わらなければ同じ物を返す）。
 * - hit: NEAR は押した鍵の向きを狙いの鍵に足す。perfect・great・good は ずれを足す（待ちで当てた音 untimed は足さない）。
 * - stray: 訳が window で相手（target）がある物だけ、相手の鍵に向きを足す。止まった時計の stopped は数えない。
 * - waitWrong: 待っている音のうち押した鍵に一番近い音を相手にして向きを足す。
 * - miss・skipped・holdEnd ほかは足さない。
 */
export function heatAdd(heat: Heat, ev: HeatInput): Heat {
  switch (ev.kind) {
    case 'hit':
      if (ev.grade === 'near') return addWrong(heat, ev.noteCode, ev.code)
      if (ev.grade === 'miss' || ev.untimed === true) return heat
      return withKey(heat, ev.noteCode, (k) => ({ ...k, offs: [...k.offs, ev.dtMs] }))
    case 'stray':
      if (ev.reason !== 'window' || ev.target === undefined) return heat
      return addWrong(heat, ev.target.code, ev.code)
    case 'waitWrong': {
      const t = waitTargetOf(ev.code, ev.waiting)
      return t === null ? heat : addWrong(heat, t, ev.code)
    }
    default:
      return heat
  }
}

/** 事象の列をまとめて足す */
export function heatAddAll(heat: Heat, evs: readonly HeatInput[]): Heat {
  return evs.reduce(heatAdd, heat)
}

/** 鍵ごとのまとめ */
export interface HeatStat {
  readonly dirs: readonly number[]
  readonly other: number
  /** ずれの標本の数 */
  readonly n: number
  /** ずれの平均 ms（標本が無ければ null） */
  readonly meanMs: number | null
  /** ずれの標本標準偏差 ms（n − 1 で割る。標本が 2 つ未満なら null ＝ 輪を描かない） */
  readonly sdMs: number | null
}

/** 終わりにまとめる（鍵の順は貯めた順） */
export function heatStats(heat: Heat): Map<KeyCode, HeatStat> {
  const out = new Map<KeyCode, HeatStat>()
  for (const [code, k] of heat) {
    const n = k.offs.length
    out.set(code, {
      dirs: k.dirs,
      other: k.other,
      n,
      meanMs: n === 0 ? null : k.offs.reduce((a, x) => a + x, 0) / n,
      sdMs: sampleSd(k.offs),
    })
  }
  return out
}

/** 要約の数（手順 2 の文に使う）: 記録した鍵、誤打（うち隣でない物）、ずれの標本 */
export interface HeatSummary {
  readonly keys: number
  readonly wrong: number
  readonly other: number
  readonly timing: number
}

export function heatSummary(stats: ReadonlyMap<KeyCode, HeatStat>): HeatSummary {
  let wrong = 0
  let other = 0
  let timing = 0
  for (const s of stats.values()) {
    const d = s.dirs.reduce((a, x) => a + x, 0)
    wrong += d + s.other
    other += s.other
    timing += s.n
  }
  return { keys: stats.size, wrong, other, timing }
}
