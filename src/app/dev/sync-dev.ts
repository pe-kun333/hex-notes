// 同期タップの開発ページ（M2-02、M2 の手順 3）。ダミー動画（decisions #36）を時計層で読み、メトロノームのクリックを動画の
// 拍 0 から鳴らして、同期タップの部品（src/app/sync-panel.ts）で offset・rate を当てはめる。真値（offset 1.2〜2.8 s、
// rate 0.96〜1.04 の 5 通り。m5 newTruth L517）と推定の誤差を出す（m5 の drawVideo の代わり）。製品画面ではない
// （導線は開発時だけ、src/main.ts）。performance.now の直呼びは src/app/ だけ（src/README.md）。
// browser pane が隠れていると rAF とタイマーが間引かれるので、表に出した状態で試す（HANDOFF）。

import '../styles.css'
import { createAudioOut, resumeAudio, type AudioOut } from '../../audio/context.ts'
import { playClick } from '../../audio/metronome.ts'
import { createClockSource, type ClockSource } from '../../clock/clock-source.ts'
import { createDummyVideo, type DummyVideo } from '../../clock/dummy-video.ts'
import { fromChartMs } from '../../clock/map.ts'
import { SYNC_TAP_BEATS, syncTapPlan, type SyncTapResult } from '../../clock/sync-tap.ts'
import type { Pulse } from '../../shared/types.ts'
import { syncRow } from '../../telemetry/rows.ts'
import { attachKeyboard } from '../dom-input.ts'
import { syncPanel } from '../sync-panel.ts'

const BPM = 100
const PULSE: Pulse = { resolution: 240, tempo: [{ beat: 0, bpm: BPM }] }
const PLAN = syncTapPlan(PULSE)
/** 鳴らすクリックの数（m5 L520 の 16） */
const CLICKS = 16
const RATES = [0.96, 0.98, 1, 1.02, 1.04] as const

const $ = (id: string): HTMLElement => {
  const e = document.getElementById(id)
  if (e === null) throw new Error(`#${id} が無い`)
  return e
}

const truth = { offset: 1.8, rate: 1 as number }
const newTruth = (): void => {
  truth.offset = Math.round((1.2 + Math.random() * 1.6) * 1000) / 1000
  truth.rate = RATES[Math.floor(Math.random() * RATES.length)] ?? 1
}
newTruth()

let audio: AudioOut | null = null
let video: DummyVideo | null = null
let clock: ClockSource | null = null
let nodes: AudioScheduledSourceNode[] = []
let raf = 0

const showTruth = (): void => {
  $('truth').textContent =
    `真値: 拍 0 の動画時刻 ${truth.offset.toFixed(3)} s、rate ${truth.rate}（譜面 ${BPM} BPM → 動画 ${(BPM * truth.rate).toFixed(1)} BPM）。` +
    `クリック ${CLICKS} 拍のうち最初の ${SYNC_TAP_BEATS} 拍をタップします。`
}

const stopVideo = (): void => {
  for (const n of nodes)
    try {
      n.stop()
    } catch {
      // 鳴り終わった
    }
  nodes = []
  video?.pauseVideo(performance.now())
  cancelAnimationFrame(raf)
}

const frame = (): void => {
  const v = video
  const c = clock
  if (v === null || c === null) return
  const now = performance.now()
  const out = c.tick(v.sample(now))
  const beat = ((out.t / 1000 - truth.offset) * BPM * truth.rate) / 60
  $('video').textContent =
    `動画 ${(out.t / 1000).toFixed(3)} s（真 ${(v.trueTime(now) / 1000).toFixed(3)} s）・時計の相 ${c.state().phase}・拍 ${beat < 0 ? '—' : Math.floor(beat)}`
  raf = requestAnimationFrame(frame)
}

const startVideo = (): void => {
  stopVideo()
  const out = (audio ??= createAudioOut())
  void resumeAudio(out)
  const now = performance.now()
  video = createDummyVideo({ stepMs: 15, seed: 7 })
  clock = createClockSource({ mode: 'video', t0: 0 })
  video.play(now)
  // 動画の拍 k は fromChartMs（譜面 ms → 動画 ms）。動画 0 ＝ 今なので、context の今からの秒で予約する
  const t0 = out.ctx.currentTime
  const spb = 60000 / BPM
  nodes = Array.from({ length: CLICKS }, (_, k) =>
    playClick(out.ctx, out.buses.click, t0 + fromChartMs(k * spb, truth) / 1000, k % 4 === 0),
  )
  raf = requestAnimationFrame(frame)
}

const attempts: string[] = []
const onResult = (r: SyncTapResult, n: number): void => {
  const lat = (audio?.ctx.outputLatency ?? 0) * 1000
  const errOffset = (r.fit.offset - truth.offset) * 1000
  attempts.unshift(
    `${n} 回目: offset ${r.fit.offset.toFixed(3)} s（誤差 ${errOffset.toFixed(0)} ms、出力遅延 ${lat.toFixed(0)} ms を引くと ` +
      `${(errOffset - lat).toFixed(0)} ms）、rate ${r.fit.rate.toFixed(4)}（誤差 ${((r.fit.rate / truth.rate - 1) * 100).toFixed(2)}%）、` +
      `残差 SD ${r.fit.residualSd.toFixed(1)} ms、${r.elapsedS.toFixed(1)} 秒、${r.verdict.savable ? '保存できる' : '保存できない'}` +
      `${r.verdict.retry ? '・やり直しをすすめる' : ''}`,
  )
  $('attempts').replaceChildren(
    ...attempts.map((t) => Object.assign(document.createElement('li'), { textContent: t })),
  )
  $('row').textContent = JSON.stringify(
    syncRow('dev:sync', r, n, new Date().toISOString()),
    null,
    2,
  )
}

const panel = syncPanel({
  doc: document,
  plan: PLAN,
  startVideo,
  stopVideo,
  // タップの瞬間にも 1 回読む（rAF が間引かれていても、写像が古い・保持のままにならないように）
  clockMap: () => {
    if (video !== null && clock !== null) clock.tick(video.sample(performance.now()))
    return clock?.read().map ?? { a: 0, b: 0 }
  },
  now: () => performance.now(),
  onResult,
})
const again = document.createElement('button')
again.type = 'button'
again.textContent = '真値を変える'
again.addEventListener('click', () => {
  newTruth()
  showTruth()
})
$('panel').append(panel.el, again)
showTruth()

attachKeyboard(window, (events) => panel.onInput(events), { focusTarget: $('app') })
