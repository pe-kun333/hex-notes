// 状態列付きのダミー動画（M0-05、手順 7、decisions #36、仮）。YouTube の getCurrentTime の癖（約 15 ms の量子化・小さな
// 逆行・seek 後の凍結・広告中に pause が効かない）を模し、時計層の試験・開発ページ clock-dev・同期タップ（M2-02、
// decisions #14）・回帰ハーネス（手順 13）が使う。製品の入口（index.html）からは辿らない（build に入らない）。
// 出どころ: m3 `dummy` L278–302 を ms に直して作り直した（kickoff 手順 7）。乱数は種付きの mulberry32（既定の種 7）。
// 状態は閉包に持つ（グローバルに置かない）。時刻は全て呼ぶ側が渡す now（ms）。

import { gauss, mulberry32, type Rng } from '../shared/random.ts'
import type { VideoSample, VideoState } from './types.ts'

export interface DummyVideoOptions {
  /** 読みの刻み ms（既定 15。0 は連続） */
  stepMs?: number
  /** 刻みの丸め（既定 floor ＝ 切り捨て。round ＝ 四捨五入） */
  quant?: 'floor' | 'round'
  /** 再生レート（既定 1） */
  rate?: number
  /** 長さ ms（既定 Infinity。届いたら ENDED） */
  durationMs?: number
  /** pauseVideo が効くまでの ms（既定 0）。'never' は効かない（広告の模擬） */
  pauseLatencyMs?: number | 'never'
  /** seek の後に読みが凍結する ms（既定 240。設計の T-1「seek 後 210〜260 ms」の中、相談 C） */
  seekFreezeMs?: number
  /** 凍結の間は真の時刻も止まる（既定 false ＝ 真の時刻は進み、凍結明けに読みが追いつく） */
  freezeHold?: boolean
  /** 逆行の頻度（曲の 1 秒あたり。既定 0 ＝ 無し。m3 の既定は 0.6、指数分布の間隔で平均 1,667 ms） */
  backPerSec?: number
  /**
   * 逆行の大きさの上限 ms（既定 10。直前の読みから 0〜これだけ戻る。m3 dummy の backMs 10・相談 C の backMaxMs の写しで
   * 自作値。T-1 が裏付けるのは逆行があることだけ。docs/references.md）
   */
  backMaxMs?: number
  /** 読みに足すガウスの揺れの SD ms（既定 0） */
  noiseSd?: number
  /** 乱数の種（既定 7。m3 L287） */
  seed?: number
  /** 文書が表示中か（既定 true） */
  visible?: boolean
}

export interface DummyVideo {
  /** 予定した pause を now までに効かせてから 1 回読む */
  sample(now: number): VideoSample
  /** 真の時刻（ms。残差の基準） */
  trueTime(now: number): number
  readonly state: VideoState
  play(now: number): void
  /** プログラムからの pauseVideo（pauseLatencyMs の後に PAUSED。never なら効かない） */
  pauseVideo(now: number): void
  seek(t: number, now: number): void
  /** 真の時刻を ms だけ飛ばす */
  jump(ms: number, now: number): void
  /** 読みだけを ms の間止める（状態は PLAYING のまま、真の時刻は進む） */
  stuck(ms: number, now: number): void
  setRate(rate: number, now: number): void
  setVisible(visible: boolean): void
  /** 外からの状態の変化（利用者が iframe で止めた・BUFFERING・ENDED・再生） */
  setState(state: VideoState, now: number): void
}

export function createDummyVideo(opts: DummyVideoOptions = {}): DummyVideo {
  const stepMs = opts.stepMs ?? 15
  const quant = opts.quant ?? 'floor'
  const durationMs = opts.durationMs ?? Infinity
  const pauseLatency = opts.pauseLatencyMs ?? 0
  const freezeMs = opts.seekFreezeMs ?? 240
  const freezeHold = opts.freezeHold ?? false
  const backPerSec = opts.backPerSec ?? 0
  const backMaxMs = opts.backMaxMs ?? 10
  const noiseSd = opts.noiseSd ?? 0
  const rng: Rng = mulberry32(opts.seed ?? 7)

  let st: VideoState = 'unstarted'
  let rate = opts.rate ?? 1
  let visible = opts.visible ?? true
  let anchorT = 0
  let anchorNow = 0
  let frozenUntil = -Infinity
  let frozenVal = 0
  let stuckUntil = -Infinity
  let lastRaw = 0
  let pauseAt: number | null = null

  const q = (t: number): number => {
    if (!(stepMs > 0)) return t
    return (quant === 'round' ? Math.round(t / stepMs) : Math.floor(t / stepMs)) * stepMs
  }
  // 逆行の起きる時刻は曲の時刻で先に決める（指数の間隔）ので、同じ種なら同じ曲の時刻で起きる（m3 L281）
  const nextBackFrom = (t: number): number =>
    backPerSec > 0 ? t - (Math.log(1 - rng()) / backPerSec) * 1000 : Infinity
  let nextBack = nextBackFrom(0)

  // 凍結で anchorNow を未来に置いたときは max で真の時刻を anchorT に止める（m3 L280）
  const trueTime = (now: number): number => {
    const t = st === 'playing' ? Math.max(anchorT, anchorT + (now - anchorNow) * rate) : anchorT
    return Math.min(t, durationMs)
  }

  const applyPause = (at: number): void => {
    anchorT = trueTime(at)
    st = 'paused'
    lastRaw = q(anchorT)
  }

  const read = (now: number): number => {
    if (now < stuckUntil) return lastRaw
    if (now < frozenUntil) return frozenVal
    const tt = trueTime(now)
    if (st === 'playing' && tt >= durationMs) {
      anchorT = durationMs
      st = 'ended'
      lastRaw = durationMs
      return lastRaw
    }
    if (st !== 'playing') return lastRaw
    let v = q(tt)
    if (noiseSd > 0) v += gauss(rng) * noiseSd
    // 逆行: 直前の読みより 0〜backMaxMs 小さい値を 1 回だけ返す（刻みより小さい逆行でも本当に戻るように直前の読み基準）。
    // 読む間隔が刻みより長い（rAF が間引かれた開発ページなど）と直前の読みが古く、逆行が大きくなって飛びに見える（m3 と同じ）
    if (backPerSec > 0 && tt >= nextBack) {
      v = Math.max(0, Math.min(v, lastRaw) - rng() * backMaxMs)
      nextBack = nextBackFrom(tt)
    }
    lastRaw = v
    return v
  }

  return {
    sample(now) {
      if (pauseAt !== null && now >= pauseAt) {
        applyPause(pauseAt)
        pauseAt = null
      }
      // read が ENDED に変えることがあるので、状態は読んだ後に取る
      const timeMs = read(now)
      return { state: st, timeMs, rate, visible }
    },
    trueTime,
    get state() {
      return st
    },
    play(now) {
      if (st === 'playing') return
      if (anchorT >= durationMs) anchorT = 0
      anchorNow = now
      st = 'playing'
      pauseAt = null
    },
    pauseVideo(now) {
      if (pauseLatency === 'never') return
      pauseAt = now + pauseLatency
    },
    seek(t, now) {
      anchorT = Math.max(0, Math.min(durationMs, t))
      anchorNow = freezeHold ? now + freezeMs : now
      frozenUntil = now + freezeMs
      // 凍結中の読みも刻みに乗せる（decisions #36。m3 は丸めない anchorT）
      frozenVal = lastRaw = q(anchorT)
      if (st === 'ended') st = 'paused'
      nextBack = nextBackFrom(anchorT)
    },
    jump(ms, now) {
      anchorT = trueTime(now) + ms
      anchorNow = now
    },
    stuck(ms, now) {
      stuckUntil = now + ms
    },
    setRate(r, now) {
      anchorT = trueTime(now)
      anchorNow = now
      rate = r
    },
    setVisible(v) {
      visible = v
    },
    setState(s, now) {
      if (s === 'playing') {
        if (st !== 'playing') {
          anchorNow = now
          st = 'playing'
        }
        return
      }
      anchorT = trueTime(now)
      if (s === 'paused') lastRaw = q(anchorT)
      st = s
    },
  }
}
