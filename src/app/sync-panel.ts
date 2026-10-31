// 同期タップの部品（M2-02、M2 の手順 3）。M2 は開発ページ（ダミー動画）で使い、S5 の段 4 への組み込みは M3-03（decisions #79。
// 動画は IFrame の時計に替わる）。出どころ: m6 段 4 L492–498（「再生したら、拍に合わせて Space を 8 回タップします」・
// タップ k／8・offset・rate・残差）、m5 startVideo L520–530・finishTaps L535–540・renderSync L543–547、m2-kickoff 手順 3・
// §7-12（Space だけ・拍 0 から 8 拍・保存の可否とおすすめは別の欄）、design.md §2.8（Space＝同期タップ、Escape＝中止）。
// 当てはめと回の状態機械は src/clock/sync-tap.ts、文言は syncResultLines（純関数）。動画と時計は呼ぶ側が渡す
// （再生の開始・止める・今の写像）。タップの時刻は入力層の tsPerf（decisions #25）を時計の写像で動画 ms にする。

import {
  SYNC_TAP_BEATS,
  initialSyncTap,
  syncTapStep,
  tapVideoMs,
  type SyncTapResult,
  type SyncTapState,
} from '../clock/sync-tap.ts'
import type { ClockMap } from '../clock/types.ts'
import type { InputEvent } from '../input/keyboard.ts'
import { button, h } from './screens/frame.ts'

export interface SyncPanelOptions {
  readonly doc: Document
  /** タップする拍の譜面 ms（syncTapPlan） */
  readonly plan: readonly number[]
  /** 動画を頭から再生する（M2 はダミー動画とクリック、M3 は IFrame の click-to-play の後） */
  startVideo(): void
  /** 動画を止める（中止・8 拍そろった・部品を外す） */
  stopVideo(): void
  /** 今の時計の写像（動画の軸。perf → 動画 ms）。タップのたびに呼ぶので、呼ぶ側はここで動画を読み直してよい */
  clockMap(): ClockMap
  /** 今の perf（ms。app/ がハンドラで読む値） */
  now(): number
  /** 8 拍そろった回（telemetry の sync 行は呼ぶ側が書く） */
  onResult?(r: SyncTapResult, attempts: number): void
}

export interface SyncPanel {
  readonly el: HTMLElement
  /** 画面の入力（Space の role primary をタップ、Escape の role pause を中止） */
  onInput(events: readonly InputEvent[]): void
  state(): SyncTapState
  unmount(): void
}

const f3 = (x: number): string => x.toFixed(3)

/** 結果の行（m6 L497 の kv と、保存の可否・おすすめ。§7-12） */
export function syncResultLines(r: SyncTapResult, attempts: number): { label: string; text: string }[] {
  const v = r.verdict
  return [
    { label: 'offset（拍 0 の動画時刻）', text: `${f3(r.fit.offset)} s` },
    { label: 'rate（動画 BPM ÷ 譜面 BPM）', text: r.fit.rate.toFixed(4) },
    { label: '残差', text: `SD ${r.fit.residualSd.toFixed(1)} ms（最大 ${Math.round(r.fit.maxAbs)} ms）` },
    { label: 'かかった時間', text: `${r.elapsedS.toFixed(1)} 秒（${attempts} 回目）` },
    {
      label: '判定',
      text: (v.savable ? '保存できます。' : '残差が大きすぎるので保存できません。もう一度タップしてください。') +
        (v.savable && v.retry ? '残差が 30 ms を超えています。「やり直し」をおすすめします。' : ''),
    },
  ]
} // prettier-ignore

export function syncPanel(o: SyncPanelOptions): SyncPanel {
  const { doc } = o
  let s: SyncTapState = initialSyncTap()

  const count = h(doc, 'span', { className: 'num', text: '0' })
  const bar = h(doc, 'i')
  const status = h(doc, 'p', {
    className: 'note',
    text: '再生したら、拍に合わせて Space を 8 回タップします（拍 0 から）。',
  })
  const result = h(doc, 'dl', { className: 'kv' })
  result.hidden = true
  const start = button(
    doc,
    `再生して ${SYNC_TAP_BEATS} 拍タップ（Space）`,
    () => begin(),
    'primary',
  )
  const stop = button(doc, '中止（Esc）', () => cancel())
  stop.hidden = true
  const el = h(doc, 'div', { className: 'card soft sync-panel' },
    h(doc, 'dl', { className: 'kv' }, h(doc, 'dt', { text: 'タップ' }), h(doc, 'dd', {}, count, ` / ${SYNC_TAP_BEATS}`)),
    h(doc, 'div', { className: 'hold' }, bar),
    status, result,
    h(doc, 'div', { className: 'btnrow' }, start, stop),
  ) // prettier-ignore

  const show = (): void => {
    count.textContent = String(s.taps.length)
    bar.style.width = `${(s.taps.length / SYNC_TAP_BEATS) * 100}%`
    start.hidden = s.phase === 'tapping'
    stop.hidden = s.phase !== 'tapping'
    start.textContent = s.attempts > 0 ? 'やり直し' : `再生して ${SYNC_TAP_BEATS} 拍タップ（Space）`
    const r = s.result
    result.hidden = r === null
    if (r !== null)
      result.replaceChildren(
        ...syncResultLines(r, s.attempts).flatMap((l) => [
          h(doc, 'dt', { text: l.label }),
          h(doc, 'dd', { text: l.text }),
        ]),
      )
  }

  function begin(): void {
    o.startVideo()
    s = syncTapStep(s, { kind: 'start', now: o.now() }, o.plan)
    status.textContent = '再生中。拍に合わせて Space を押してください。'
    show()
  }

  function cancel(): void {
    if (s.phase !== 'tapping') return
    o.stopVideo()
    s = syncTapStep(s, { kind: 'cancel' }, o.plan)
    status.textContent = '中止しました。'
    show()
  }

  show()
  return {
    el,
    state: () => s,
    onInput: (events) => {
      for (const ev of events) {
        if (ev.kind !== 'role') continue
        if (ev.role === 'pause') cancel()
        if (ev.role !== 'primary' || s.phase !== 'tapping') continue
        s = syncTapStep(
          s,
          { kind: 'tap', videoMs: tapVideoMs(o.clockMap(), ev.tsPerf), now: ev.tsPerf },
          o.plan,
        )
        if (s.phase === 'done' && s.result !== null) {
          o.stopVideo()
          status.textContent = '8 拍そろいました。'
          o.onResult?.(s.result, s.attempts)
        } else if (s.phase === 'idle') {
          // 当てはめられない（時計が止まっていて全部のタップが同じ時刻など）。その回は捨てて動画も止める
          o.stopVideo()
          status.textContent = '当てはめられませんでした。もう一度タップしてください。'
        }
        show()
      }
    },
    unmount: () => {
      if (s.phase === 'tapping') o.stopVideo()
    },
  }
}
