// 音源層の開発ページ（M0-08、手順 10）。旋律（ガイド音）＋伴奏＋メトロノームを時計層（動画なしの ClockSource）の写像と
// audio-bridge で 25 ms ごとに 100 ms 先読みして予約し、鳴らして確かめる（§5.1 M0-08「伴奏付きで鳴る」）。製品画面ではない
// （導線は開発時だけ、src/main.ts）。伴奏は同梱曲の accompaniment が無いので、拍ごとの最低音の 1 オクターブ下を作る
// （カノンは三和音なので根音のベースになる。開発用）。Salamander は manifest に音があれば「読む」で読み、無ければ合成音。
// 一時停止・先頭へ・−5 秒・テンポは時計の再アンカー（resync）で先の予約を止めて数え直す。「主スレッドを 75 ms 止める」で
// 予約の遅れ（帯は 20 ms 超）を見る。鍵を押すと誤打の打鍵音（−18 dB・300 ms）。performance.now の直呼びは src/app/ だけ。

import {
  cancelFrom,
  createAudioOut,
  playKeyclick,
  playScheduled,
  readAudioClock,
  resumeAudio,
  type AudioOut,
} from '../../audio/context.ts'
import { keyclickFor } from '../../audio/keyclick.ts'
import { loadSampleBuffers, parseManifest, type SamplerManifest } from '../../audio/sampler.ts'
import {
  PUMP_MS,
  initialScheduler,
  lateBand,
  pumpSchedule,
  seekSchedule,
  soundItems,
  type SchedulerState,
  type SoundItem,
} from '../../audio/scheduler.ts'
import { bridgeOf, type AudioBridge } from '../../clock/audio-bridge.ts'
import { createClockSource, type ClockSource } from '../../clock/clock-source.ts'
import type { ClockOutput } from '../../clock/types.ts'
import { midiOf } from '../../layout/presets.ts'
import type { Chart, Note } from '../../shared/types.ts'
import { attachKeyboard } from '../dom-input.ts'

const SONGS = ['canon', 'twinkle', 'ode', 'scale', 'chroma', 'duet'] as const
const RATES = [0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25] as const
const LEAD_MS = 1000
const SAMPLE_BASE = '/content/samples/salamander/'

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  Object.assign(e, props)
  e.append(...children)
  return e
}

/** 開発用の伴奏: 拍ごとの最低音の 1 オクターブ下を、次の拍の頭まで（vel 70） */
function bassOf(notes: readonly Note[]): Note[] {
  const beats = [...new Set(notes.map((n) => n.beat))].sort((a, b) => a - b)
  const end = Math.max(...notes.map((n) => n.beat + n.dur))
  return beats.map((beat, i) => ({
    midi: Math.min(...notes.filter((n) => n.beat === beat).map((n) => n.midi)) - 12,
    beat,
    dur: (beats[i + 1] ?? end) - beat,
    vel: 70,
  }))
}

function main(): void {
  const root = document.getElementById('dev')
  if (!(root instanceof HTMLElement)) throw new Error('audio-dev: #dev が無い')

  const enableBtn = el('button', {
    type: 'button',
    textContent: '音を有効にする（AudioContext を作る）',
  })
  const songSel = el('select')
  for (const s of SONGS)
    songSel.append(
      el('option', { value: s, textContent: s === 'canon' ? 'canon（三和音・伴奏はベース）' : s }),
    )
  const rateSel = el('select')
  for (const r of RATES)
    rateSel.append(el('option', { value: String(r), textContent: `テンポ ×${r}` }))
  rateSel.value = '1'
  const box = (label: string, on: boolean): HTMLInputElement => {
    const i = el('input', { type: 'checkbox', checked: on })
    i.dataset['label'] = label
    return i
  }
  const melodyBox = box('旋律（ガイド音）', true)
  const accompBox = box('伴奏', true)
  const clickBox = box('メトロノーム', false)
  const keyBox = box('押した鍵で誤打の打鍵音', true)
  const playBtn = el('button', { type: 'button', textContent: '再生（先頭から）' })
  const pauseBtn = el('button', { type: 'button', textContent: '一時停止／再開' })
  const backBtn = el('button', { type: 'button', textContent: '−5 秒' })
  const stallBtn = el('button', { type: 'button', textContent: '主スレッドを 75 ms 止める' })
  const loadBtn = el('button', { type: 'button', textContent: 'Salamander を読む' })
  const status = el('div', { id: 'band', hidden: true })
  const facts = el('dl')

  root.append(
    el('h1', {}, '音源層（開発ページ、手順 10）'),
    el(
      'p',
      { className: 'note' },
      '旋律＋伴奏（＋メトロノーム）を 25 ms ごとに 100 ms 先読みで予約する。Salamander が未同梱なら合成音で鳴る。' +
        '一時停止・−5 秒・テンポの切替では先の予約を止めて数え直す。鍵を押すと誤打の打鍵音（−18 dB・300 ms）。',
    ),
    el('div', { className: 'controls' }, enableBtn, loadBtn),
    el(
      'div',
      { className: 'controls' },
      songSel,
      rateSel,
      ...[melodyBox, accompBox, clickBox, keyBox].map((b) =>
        el('label', {}, b, b.dataset['label'] ?? ''),
      ),
    ),
    el('div', { className: 'controls' }, playBtn, pauseBtn, backBtn, stallBtn),
    status,
    facts,
  )

  let out: AudioOut | null = null
  let manifest: SamplerManifest | null = null
  let chart: Chart | null = null
  let items: SoundItem[] = []
  let clock: ClockSource | null = null
  let sched: SchedulerState = initialScheduler()
  let bridge: AudioBridge | null = null
  let paused = false
  let cancelled = 0
  let samplerNote = 'manifest を読んでいない'

  const fact = (k: string, v: string): Node[] => [el('dt', {}, k), el('dd', {}, v)]
  const show = (): void => {
    const o = out
    facts.replaceChildren(
      ...fact('AudioContext', o ? `${o.ctx.state}、${o.ctx.sampleRate} Hz` : '未作成（ボタンで作る）'),
      ...fact(
        '出力遅延',
        o ? `outputLatency ${((o.ctx.outputLatency || 0) * 1000).toFixed(1)} ms、baseLatency ${((o.ctx.baseLatency || 0) * 1000).toFixed(1)} ms` : '—',
      ),
      ...fact('対応点（audio-bridge）', bridge ? `${bridge.via}（context ${bridge.ctxSec.toFixed(3)} s ＝ perf ${bridge.perfMs.toFixed(1)} ms）` : '—'),
      ...fact('音の数', `${items.length}（旋律 ${items.filter((i) => i.part === 'melody').length}・伴奏 ${items.filter((i) => i.part === 'accomp').length}・クリック ${items.filter((i) => i.part === 'click').length}）`),
      ...fact('予約', `${sched.scheduled} 音・鳴らさなかった ${sched.dropped}・止めた ${cancelled}・鳴っている ${o?.live.size ?? 0}`),
      ...fact('予約の遅れの最大', `${sched.lateMaxMs.toFixed(1)} ms（pump の間隔の最大 ${sched.gapMaxMs.toFixed(1)} ms）`),
      ...fact('ピアノ音源', samplerNote),
      ...fact('時計', clock ? `t ${clock.read().t.toFixed(0)} ms、${paused ? '一時停止' : clock.state().phase}` : '—'),
    ) // prettier-ignore
    status.hidden = !lateBand(sched)
    status.textContent = `予約が ${sched.lateMaxMs.toFixed(0)} ms 遅れた（20 ms 超）。音が遅れたか抜けた`
  }

  const loadChart = async (): Promise<void> => {
    const res = await fetch(`/tests/fixtures/charts/${songSel.value === 'canon' ? 'm5' : 'm1'}/${songSel.value}.hexnote.json`)
    if (!res.ok) throw new Error(`audio-dev: ${songSel.value} が読めない`)
    const c = (await res.json()) as Chart
    chart = { ...c, accompaniment: bassOf(c.notes) }
  } // prettier-ignore

  const rebuild = (): void => {
    if (!chart) return
    const v = chart.variants?.find((x) => x.layout === 'ableton' && x.limit === 2) ?? null
    items = soundItems(chart, v, {
      melody: melodyBox.checked,
      accomp: accompBox.checked,
      click: clickBox.checked,
    })
  }

  /** 時計の出力の再アンカーで、先の予約を止めて今の t から数え直す */
  const onClock = (o: ClockOutput): void => {
    for (const ev of o.events) {
      if (ev.kind !== 'resync') continue
      if (out) cancelled += cancelFrom(out, out.ctx.currentTime)
      sched = seekSchedule(sched, items, ev.t)
    }
  }

  const pump = (): void => {
    if (!out || !clock) return
    const now = performance.now()
    const o = clock.tick(null)
    onClock(o)
    bridge = bridgeOf(readAudioClock(out.ctx, now))
    const r = pumpSchedule(sched, items, { map: o.map, now }, bridge)
    sched = r.state
    for (const s of r.play) playScheduled(out, s)
  }

  const start = async (): Promise<void> => {
    if (!out) return
    await resumeAudio(out)
    await loadChart()
    rebuild()
    if (out) cancelled += cancelFrom(out, out.ctx.currentTime)
    sched = initialScheduler()
    cancelled = 0
    paused = false
    clock = createClockSource({ mode: 'novideo', t0: -LEAD_MS, rate: Number(rateSel.value) })
    onClock(clock.command({ kind: 'start' }))
  }

  enableBtn.addEventListener('click', () => {
    if (!out) out = createAudioOut()
    void resumeAudio(out)
    show()
  })
  loadBtn.addEventListener('click', () => {
    void (async () => {
      if (!out) out = createAudioOut()
      const m = manifest
      if (!m || m.files.length === 0) {
        samplerNote = '未同梱（manifest の files が空）→ 合成音'
        return show()
      }
      samplerNote = `読み込み中… 0/${m.files.length}`
      show()
      const t0 = performance.now()
      out.samples = await loadSampleBuffers(out.ctx, SAMPLE_BASE, m)
      samplerNote = `Salamander ${out.samples.size}/${m.files.length} 音（${(performance.now() - t0).toFixed(0)} ms）${out.samples.size === 0 ? '→ 復号できず合成音' : ''}`
      show()
    })()
  })
  playBtn.addEventListener('click', () => void start())
  pauseBtn.addEventListener('click', () => {
    if (!clock || !out) return
    paused = !paused
    if (paused) {
      cancelled += cancelFrom(out, out.ctx.currentTime)
      onClock(clock.command({ kind: 'pause' }))
    } else onClock(clock.command({ kind: 'resume' }))
  })
  backBtn.addEventListener('click', () => {
    if (clock)
      onClock(clock.command({ kind: 'seek', t: Math.max(-LEAD_MS, clock.read().t - 5000) }))
  })
  rateSel.addEventListener('change', () => {
    if (clock) onClock(clock.command({ kind: 'setRate', rate: Number(rateSel.value) }))
  })
  for (const b of [melodyBox, accompBox, clickBox])
    b.addEventListener('change', () => {
      rebuild()
      if (out && clock) {
        cancelled += cancelFrom(out, out.ctx.currentTime)
        sched = seekSchedule(sched, items, clock.read().t)
      }
    })
  stallBtn.addEventListener('click', () => {
    const until = performance.now() + 75
    while (performance.now() < until) {
      // 主スレッドを止める（予約の遅れを見るため）
    }
  })

  attachKeyboard(
    window,
    (events) => {
      if (!out || !keyBox.checked) return
      for (const ev of events) {
        if (ev.kind !== 'press') continue
        const plan = keyclickFor(
          { kind: 'stray', code: ev.code, tsPerf: ev.tsPerf, reason: 'window' },
          (c) => midiOf('ableton', c),
        )
        if (plan) playKeyclick(out, plan)
      }
    },
    { focusTarget: root },
  )

  void fetch(`${SAMPLE_BASE}manifest.json`)
    .then((r) => r.json())
    .then((j: unknown) => {
      manifest = parseManifest(j)
      samplerNote =
        manifest === null
          ? 'manifest の形が違う → 合成音'
          : manifest.files.length === 0
            ? '未同梱（manifest の files が空）→ 合成音'
            : `${manifest.files.length} 音（「Salamander を読む」で読む）`
      show()
    })
    .catch(() => {
      samplerNote = 'manifest が読めない → 合成音'
      show()
    })

  window.setInterval(pump, PUMP_MS)
  window.setInterval(show, 250)
  show()
}

main()
