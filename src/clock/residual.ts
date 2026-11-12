// 時計の残差の道具（M3 の手順 2、仮。m3-kickoff 手順 2「作る」・§7-5・§7-18、decisions #97、design §5.4 L270）。完了条件
// 「実動画で補間の残差 SD が直読みより小さい」を読む物差し。出どころ: m3 `lsq` L321–323・基準線（再アンカーで捨てる L326、
// 10 秒窓と当てはめ L332–333、span ≥ 1,000 ms L349）・`rawSd`／`intSd`（L408・L584。残差は ms L606、SD は n − 1 L248）。
// 手直し: m3 のダミーの基準は真の時刻（L352）→ ダミーでも実物でも読みの 10 秒窓の直線。数えるのは locked・可視・再アンカー
// から 3,000 ms 以後（m3 の標本 > 10・syncUntil 以後 L584・L605 から）。対照 ＝ 読み直さない時計（再アンカーの読み＋経過×1）の
// 残差。補間後の SD が直読みより小さいだけでは良否を分けない（対照も小さく出ることがある）ので、傾き・偏り・対照を並べて読む。
// フレームの列を値で受ける純関数（手順 1 の開発ページ youtube-dev と試験が使う）。

import { BETA_DEFAULT } from './clock-source.ts'
import { lsq, spanOf, type FitPoint } from './fit.ts'
import type { ClockPhase, ResyncReason, VideoState } from './types.ts'

/** 基準の窓（ms。読みが変わった tick の now がこれより古い物を落とす。2 点は残す） */
export const REF_WINDOW_MS = 10_000
/** 基準を使う span の下限（ms） */
export const REF_MIN_SPAN_MS = 1_000
/** 再アンカーから数え始めるまで（ms） */
export const SETTLE_MS = 3_000

/** 1 フレーム（rAF の 1 回。raw は標本の timeMs、out は時計の t） */
export interface ResidualFrame {
  readonly now: number
  readonly raw: number
  readonly out: number
  readonly phase: ClockPhase
  readonly visible: boolean
  /** このフレームの再アンカーの訳（無ければ null） */
  readonly resync: ResyncReason | null
  /** 時計の q̂（ClockOutput.qHat） */
  readonly qHat: number
  /** 標本の状態（走の要約が ENDED を見る。M3 の手順 11） */
  readonly state?: VideoState
}

export interface ResidualSummary {
  /** 数えたフレーム */
  readonly n: number
  /** 直読みの残差の SD（ms） */
  readonly rawSd: number
  /** 補間後（時計の t）の残差の SD（ms） */
  readonly outSd: number
  /** 補間後の残差の平均（ms。β·q̂ の先読みを含む） */
  readonly outMean: number
  /** 再アンカーの回数（start を除く） */
  readonly resyncs: number
  /** 最後の q̂（ms） */
  readonly qHat: number
  /** 最後に数えたフレームの基準の傾き（ms/ms） */
  readonly slope: number
  /** 偏り ＝ 補間後の平均 − β·q̂（ms） */
  readonly bias: number
  /** 対照 ＝ 読み直さない時計の残差の SD（ms） */
  readonly ctlSd: number
}

const mean = (a: readonly number[]): number => a.reduce((s, x) => s + x, 0) / a.length
const sd = (a: readonly number[]): number => {
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}

/** フレームの列の残差（数えたフレームが 2 未満なら null） */
export function residualOf(frames: readonly ResidualFrame[], beta = BETA_DEFAULT): ResidualSummary | null {
  let ref: FitPoint[] = []
  let last: number | null = null
  let anchor: { now: number; raw: number } | null = null
  let resyncs = 0
  let slope = Number.NaN
  let qHat = 0
  const raws: number[] = []
  const outs: number[] = []
  const ctls: number[] = []
  for (const f of frames) {
    qHat = f.qHat
    if (f.resync !== null) {
      // 再アンカーで基準を捨て、アンカーの読みは基準に入れない（m3 clk.reset L326）
      if (f.resync !== 'start') resyncs++
      ref = []
      last = f.raw
      anchor = { now: f.now, raw: f.raw }
    } else if (f.raw !== last) {
      last = f.raw
      ref.push({ now: f.now, raw: f.raw })
      let i = 0
      while (ref.length - i > 2 && f.now - (ref[i]?.now ?? f.now) > REF_WINDOW_MS) i++
      if (i > 0) ref = ref.slice(i)
    }
    const line = spanOf(ref) >= REF_MIN_SPAN_MS ? lsq(ref) : null
    if (line === null || anchor === null) continue
    if (f.phase !== 'locked' || !f.visible || f.now - anchor.now < SETTLE_MS) continue
    const base = line.a * f.now + line.b
    slope = line.a
    raws.push(f.raw - base)
    outs.push(f.out - base)
    ctls.push(anchor.raw + (f.now - anchor.now) - base)
  }
  if (raws.length < 2) return null
  const outMean = mean(outs)
  return {
    n: raws.length,
    rawSd: sd(raws),
    outSd: sd(outs),
    outMean,
    resyncs,
    qHat,
    slope,
    bias: outMean - beta * qHat,
    ctlSd: sd(ctls),
  }
} // prettier-ignore

// ---------- 走の要約（M3 の手順 11、仮。m3-kickoff 手順 11「作る」・§7-18） ----------
// 開発ページ youtube-dev の 1 走（ページの読込から ENDED まで）を残差の表の 1 行にする。数える走 ＝ 文書が隠れていない・
// rAF 50 回／秒以上・再アンカー 0・40 秒以上（手順 2 の線）。秒数と rAF は再生の始まり（最初の再アンカー start）から、
// 最初の ENDED の読みまで（無ければ最後のフレームまで）で数える（読込から ▶ までの待ちを入れない）。ENDED まで回したかは
// 印だけで、数える条件に入れない（見本の動画は ENDED まで回さない）。時計残差（play 行の clockResidualSd）は製品と同じ
// collectClock の値を呼ぶ側が渡す。

/** 数える走の rAF の下限（回／秒） */
export const RUN_MIN_RAF = 50
/** 数える走の長さの下限（秒） */
export const RUN_MIN_SECONDS = 40

export interface RunSummary extends ResidualSummary {
  /** 時計残差（locked の tick の dev の SD。play 行の clockResidualSd と同じ量。無ければ null） */
  readonly clockResidualSd: number | null
  /** 負の増分（読みが前のフレームより小さい回） */
  readonly negatives: number
  /** 再生の始まりから終わりまでのフレーム */
  readonly frames: number
  /** 再生の始まりから終わりまでの秒 */
  readonly seconds: number
  /** フレーム ÷ 秒 */
  readonly rafPerSec: number
  /** 始まりから終わりの間に文書が隠れたか */
  readonly hiddenSeen: boolean
  /** ENDED の読みまで回したか */
  readonly ended: boolean
}

/** 1 走の要約（再生が始まっていない・数えたフレームが 2 未満なら null） */
export function runSummary(frames: readonly ResidualFrame[], clockResidualSd: number | null, beta = BETA_DEFAULT): RunSummary | null {
  const start = frames.findIndex((f) => f.resync === 'start')
  if (start < 0) return null
  const endAt = frames.findIndex((f, i) => i >= start && f.state === 'ended')
  const run = frames.slice(start, endAt < 0 ? frames.length : endAt + 1)
  const r = residualOf(run, beta)
  const first = run[0]
  const last = run[run.length - 1]
  if (r === null || first === undefined || last === undefined) return null
  let negatives = 0
  for (let i = 1; i < run.length; i++) if ((run[i] as ResidualFrame).raw < (run[i - 1] as ResidualFrame).raw) negatives++
  const seconds = (last.now - first.now) / 1000
  return {
    ...r,
    clockResidualSd,
    negatives,
    frames: run.length,
    seconds,
    rafPerSec: seconds > 0 ? run.length / seconds : 0,
    hiddenSeen: run.some((f) => !f.visible),
    ended: endAt >= 0,
  }
} // prettier-ignore

/** 数える走か（隠れていない・rAF 50 回／秒以上・再アンカー 0・40 秒以上） */
export function runCountable(s: RunSummary): boolean {
  return (
    !s.hiddenSeen && s.rafPerSec >= RUN_MIN_RAF && s.resyncs === 0 && s.seconds >= RUN_MIN_SECONDS
  )
}
