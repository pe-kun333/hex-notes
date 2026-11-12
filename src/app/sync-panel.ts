// 同期タップの部品（M2-02、M2 の手順 3。M3 の手順 4 で S5 の段 4 に組み込んだ、decisions #79・#98）。出どころ: m6 段 4 L492–498
// （「再生したら、拍に合わせて Space を 8 回タップします」・タップ k／8・offset・rate・残差）、m5 finishTaps L535–540・
// renderSync L543–547、m2-kickoff 手順 3・§7-12（Space だけ・拍 0 から 8 拍・保存の可否とおすすめは別の欄）、design.md §2.8
// （Space＝同期タップ、Escape＝中止）、m3-kickoff 手順 4・§7-3・§7-6・§7-23。
// 当てはめと回の状態機械は src/clock/sync-tap.ts、文言は syncResultLines（純関数）。M3 の手順 4 から、動画の再生と停止はこの部品
// から出さない（開始は利用者の ▶、decisions #95）。呼ぶ側が時計の事象を渡す: PLAYING の再アンカーで videoStarted（tapping を
// 頭から。訳は問わない）、tapping 中に PLAYING でなくなったら videoStopped（その回を捨てて待ちへ）。やり直し・中止・8 拍の後は
// onRetry（呼ぶ側が iframe を作り直して ▶ を待つ）。タップの時刻は入力層の tsPerf（decisions #25）を時計の写像で動画 ms にする。

import {
  SYNC_TAP_BEATS,
  initialSyncTap,
  syncTapDrift,
  syncTapStep,
  tapVideoMs,
  type SyncTapDrift,
  type SyncTapResult,
  type SyncTapState,
} from '../clock/sync-tap.ts'
import type { ClockMap } from '../clock/types.ts'
import type { InputEvent } from '../input/keyboard.ts'
import { button, h } from './screens/frame.ts'

export interface SyncPanelOptions {
  readonly doc: Document
  /** 起点 start の拍の譜面 ms（syncTapPlan(pulse, 8, start)。起点 0 で回を数え、「1 拍前へ／後ろへ」で ±1） */
  planOf(start: number): readonly number[]
  /** 今の時計の写像（動画の軸。perf → 動画 ms）。タップのたびに呼ぶので、呼ぶ側はここで動画を読み直してよい */
  clockMap(): ClockMap
  /** 今の perf（ms。app/ がハンドラで読む値） */
  now(): number
  /** テンポ違いの注意（曲の長さ ms と、判定層の遅れ側の窓 ms。無ければ注意を出さない） */
  readonly drift?: { readonly songMs: number; readonly windowMs: number }
  /** 8 拍そろった回（telemetry の sync 行は呼ぶ側が書く） */
  onResult?(r: SyncTapResult, attempts: number): void
  /** 今の結果が変わった（新しい回・1 拍ずらし。呼ぶ側が保存できる結果を段の状態へ） */
  onChange?(r: SyncTapResult | null): void
  /** やり直し・中止・8 拍そろった後（呼ぶ側が iframe を作り直して利用者の ▶ を待つ。§7-3） */
  onRetry?(): void
}

export interface SyncPanel {
  readonly el: HTMLElement
  /** 画面の入力（Space の role primary をタップ、Escape の role pause を中止） */
  onInput(events: readonly InputEvent[]): void
  /** 動画が PLAYING で再アンカーした（tapping を頭から） */
  videoStarted(now: number): void
  /** 動画が PLAYING でなくなった（tapping 中ならその回を捨てる） */
  videoStopped(): void
  state(): SyncTapState
  unmount(): void
}

const f3 = (x: number): string => x.toFixed(3)

/** 待ちの文（仮、m3-kickoff 手順 4） */
export const SYNC_WAIT_TEXT = `プレイヤーの ▶ を押し、拍 0 から Space を ${SYNC_TAP_BEATS} 回タップします。`

/** テンポ違いの注意の文（decisions #98） */
export function driftText(x: number): string {
  return `動画のテンポが MIDI と違うようです。このままだと曲の終わりで約 ±${x} ms ずれます。`
}

/**
 * 結果の行（m6 L497 の kv と、保存の可否・おすすめ。§7-12）。M3 の手順 4 から offset は rate 1.0 固定の当てはめ、テンポは
 * 診断の値（参考）、注意は門を越えた回だけの 1 行
 */
export function syncResultLines(r: SyncTapResult, attempts: number, drift: SyncTapDrift | null = null): { label: string; text: string }[] {
  const v = r.verdict
  return [
    { label: 'offset（拍 0 の動画時刻）', text: `${f3(r.fit.offset)} s${r.start === 0 ? '' : `（起点を拍 ${r.start} に）`}` },
    { label: '動画のテンポ（参考）', text: r.diag.rate.toFixed(4) },
    { label: '残差', text: `SD ${r.fit.residualSd.toFixed(1)} ms（最大 ${Math.round(r.fit.maxAbs)} ms）` },
    { label: 'かかった時間', text: `${r.elapsedS.toFixed(1)} 秒（${attempts} 回目）` },
    {
      label: '判定',
      text: (v.savable ? '保存できます。' : '残差が大きすぎるので保存できません。もう一度タップしてください。') +
        (v.savable && v.retry ? '残差が 30 ms を超えています。「やり直し」をおすすめします。' : ''),
    },
    ...(drift !== null && drift.warn ? [{ label: '注意', text: driftText(drift.x) }] : []),
  ]
} // prettier-ignore

export function syncPanel(o: SyncPanelOptions): SyncPanel {
  const { doc } = o
  let s: SyncTapState = initialSyncTap()
  const plan0 = o.planOf(0)

  const count = h(doc, 'span', { className: 'num', text: '0' })
  const bar = h(doc, 'i')
  const status = h(doc, 'p', { className: 'note', text: SYNC_WAIT_TEXT })
  const result = h(doc, 'dl', { className: 'kv' })
  result.hidden = true
  const stop = button(doc, '中止（Esc）', () => cancel())
  const earlier = button(doc, '1 拍前へ', () => refit(1), 'small')
  const later = button(doc, '1 拍後ろへ', () => refit(-1), 'small')
  const retry = button(doc, 'やり直し', () => {
    status.textContent = SYNC_WAIT_TEXT
    o.onRetry?.()
    show()
  })
  const el = h(doc, 'div', { className: 'card soft sync-panel' },
    h(doc, 'dl', { className: 'kv' }, h(doc, 'dt', { text: 'タップ' }), h(doc, 'dd', {}, count, ` / ${SYNC_TAP_BEATS}`)),
    h(doc, 'div', { className: 'hold' }, bar),
    status, result,
    h(doc, 'div', { className: 'btnrow' }, stop, earlier, later, retry),
  ) // prettier-ignore

  const show = (): void => {
    count.textContent = String(s.taps.length)
    bar.style.width = `${(s.taps.length / SYNC_TAP_BEATS) * 100}%`
    const tapping = s.phase === 'tapping'
    const r = s.result
    stop.hidden = !tapping
    earlier.hidden = later.hidden = tapping || r === null || s.phase !== 'done'
    retry.hidden = tapping || r === null
    result.hidden = r === null
    if (r !== null) {
      const drift =
        o.drift === undefined ? null : syncTapDrift(r.diag, o.drift.songMs, o.drift.windowMs)
      result.replaceChildren(
        ...syncResultLines(r, s.attempts, drift).flatMap((l) => [
          h(doc, 'dt', { text: l.label }),
          h(doc, 'dd', { text: l.text }),
        ]),
      )
    }
  }

  function cancel(): void {
    if (s.phase !== 'tapping') return
    s = syncTapStep(s, { kind: 'cancel' }, plan0)
    status.textContent = '中止しました。'
    o.onRetry?.()
    show()
  }

  function refit(d: number): void {
    const r = s.result
    if (r === null) return
    const next = syncTapStep(s, { kind: 'refit', start: r.start + d }, plan0, o.planOf)
    if (next === s) return
    s = next
    o.onChange?.(s.result)
    show()
  }

  show()
  return {
    el,
    state: () => s,
    videoStarted: (now) => {
      s = syncTapStep(s, { kind: 'start', now }, plan0)
      status.textContent = '再生中。拍に合わせて Space を押してください。'
      show()
    },
    videoStopped: () => {
      if (s.phase !== 'tapping') return
      s = syncTapStep(s, { kind: 'cancel' }, plan0)
      status.textContent = `止まったので、この回は数えません。${SYNC_WAIT_TEXT}`
      show()
    },
    onInput: (events) => {
      for (const ev of events) {
        if (ev.kind !== 'role') continue
        if (ev.role === 'pause') cancel()
        if (ev.role !== 'primary' || s.phase !== 'tapping') continue
        s = syncTapStep(
          s,
          { kind: 'tap', videoMs: tapVideoMs(o.clockMap(), ev.tsPerf), now: ev.tsPerf },
          plan0,
        )
        if (s.phase === 'done' && s.result !== null) {
          status.textContent = `${SYNC_TAP_BEATS} 拍そろいました。合わなければ「1 拍前へ／後ろへ」か「やり直し」。`
          o.onResult?.(s.result, s.attempts)
          o.onChange?.(s.result)
          // 8 拍の後は作り直して ▶ を待つ（仮、§7-23）
          o.onRetry?.()
        } else if (s.phase === 'idle') {
          // 当てはめられない（時計が止まっていて全部のタップが同じ時刻など）。その回は捨てて作り直す
          status.textContent = '当てはめられませんでした。もう一度タップしてください。'
          o.onRetry?.()
        }
        show()
      }
    },
    unmount: () => {},
  }
}
