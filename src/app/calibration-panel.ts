// 校正 段 1 の部品（M1-05、M1 の手順 4。S0c〔手順 9〕と S6 で同じ物）。出どころ: m6 S0c L269–281（音のテスト →
// 聞こえる／聞こえない → 100 BPM・予備 4 拍・24 打の進捗 → 結果。「Space で打ちます（ボタンは Enter だけで押せます）」）、
// m3 startCal L435–448（AudioContext が running になってから予定を組む）・stopCal L452、design.md §2.7・§2.8（Space＝
// 校正タップ）、decisions #37（クリックの実時刻は audio-bridge）・#40 (b)・#55 (a)（calib 行）・#62。
// 打鍵は Space だけ（m3 の「A 段のキーか Space」は採らない、仮）。演奏の鍵は数えない。DOM と AudioContext に触れる薄い部分で、
// クリックの予定・対応付け・結果は src/judge/calibration-tap.ts、文言は calibration.ts。

import { readAudioClock, resumeAudio } from '../audio/context.ts'
import { playClick } from '../audio/metronome.ts'
import { bridgeOf } from '../clock/audio-bridge.ts'
import { perfNow } from '../clock/clock-source.ts'
import type { InputEvent } from '../input/keyboard.ts'
import { TAP_COUNT, type OffsetVerdict } from '../judge/calibration-offset.ts'
import {
  CAL_INTERVAL_MS,
  calClicks,
  calDeadline,
  calDone,
  calResult,
  calTap,
  initialCal,
  type CalState,
} from '../judge/calibration-tap.ts'
import { calibRow } from '../telemetry/rows.ts'
import { signedMs, silentText, tapResultText } from './calibration.ts'
import { button, h } from './screens/frame.ts'
import type { ScreenContext } from './shell.ts'

export interface CalibPanel {
  readonly el: HTMLElement
  /** 画面の入力（Space の role primary だけを見る） */
  onInput(events: readonly InputEvent[]): void
  unmount(): void
}

export interface CalibPanelOptions {
  /** 終わった（verdict）か「聞こえない」（null）。画面は状態の行を描き直す */
  onDone?(v: OffsetVerdict | null): void
}

export function calibrationPanel(ctx: ScreenContext, opts: CalibPanelOptions = {}): CalibPanel {
  const { doc } = ctx
  let cal: CalState | null = null
  let nodes: AudioScheduledSourceNode[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let alive = true

  const intro = h(doc, 'p', {
    text: 'まず音のテスト。聞こえるなら、メトロノームに合わせて Space を 24 回打ち、入力の遅れを測ります。',
  })
  const count = h(doc, 'span', { className: 'num', text: '0' })
  const hold = h(doc, 'i')
  const result = h(doc, 'p', {
    className: 'note',
    text: 'Space で打ちます（ボタンは Enter だけで押せます）。',
  })
  const start = button(doc, '計測を始める', () => void begin(), 'primary')
  const stop = button(doc, '中止', () => end('中止しました。'), '')
  stop.hidden = true
  const box = h(
    doc,
    'div',
    { className: 'card soft calib' },
    h(
      doc,
      'dl',
      { className: 'kv' },
      h(doc, 'dt', { text: 'テンポ' }),
      h(doc, 'dd', {
        text: `${Math.round(60000 / CAL_INTERVAL_MS)} BPM・予備 4 拍・${TAP_COUNT} 打`,
      }),
      h(doc, 'dt', { text: '進捗' }),
      h(doc, 'dd', {}, count, ` / ${TAP_COUNT}`),
    ),
    h(doc, 'div', { className: 'hold' }, hold),
    result,
    h(doc, 'div', { className: 'btnrow' }, start, stop),
  )
  box.hidden = true

  /** 音のテスト: 強拍と弱拍を 1 つずつ */
  const testSound = (): void => {
    void (async () => {
      const out = ctx.audio()
      await resumeAudio(out)
      const t = out.ctx.currentTime + 0.05
      playClick(out.ctx, out.buses.click, t, true)
      playClick(out.ctx, out.buses.click, t + CAL_INTERVAL_MS / 1000, false)
    })()
  }
  const yes = button(doc, '聞こえる', () => {
    box.hidden = false
    silent.hidden = true
    start.focus({ preventScroll: true })
  })
  const no = button(doc, '聞こえない', () => {
    end(null)
    silent.textContent = silentText(ctx.calibration().audio !== undefined)
    box.hidden = true
    silent.hidden = false
    opts.onDone?.(null)
  })
  const silent = h(doc, 'p', { className: 'note' })
  silent.hidden = true
  const el = h(
    doc,
    'div',
    { className: 'calib-panel' },
    intro,
    h(doc, 'div', { className: 'btnrow' }, button(doc, '♪ 音を鳴らす', testSound), yes, no),
    box,
    silent,
  )

  const show = (): void => {
    const n = cal?.errs.length ?? 0
    count.textContent = String(n)
    hold.style.width = `${(n / TAP_COUNT) * 100}%`
  }

  /** 予約したクリックを止め、見張りを外す。msg があれば結果の行に出す */
  function end(msg: string | null): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    for (const n of nodes)
      try {
        n.stop()
      } catch {
        // 鳴り終わった
      }
    nodes = []
    cal = null
    start.hidden = false
    stop.hidden = true
    if (msg !== null) result.textContent = msg
  }

  const finish = (): void => {
    const s = cal
    if (s === null || !alive) return
    const v = calResult(s)
    const n = s.errs.length
    const at = new Date().toISOString()
    if (v.ok) ctx.saveCalibration('audio', { offsetMs: v.offset, at, via: 'tap' })
    void ctx.booted.db.appendTelemetry(calibRow('tap', v, n, v.ok, at)).catch(() => {})
    end(tapResultText(v, n))
    start.textContent = 'もう一度'
    opts.onDone?.(v)
  }

  /** AudioContext が動いてから予定を組む（m3 L437。suspended のままだと currentTime が止まって予定が狂う） */
  async function begin(): Promise<void> {
    if (cal !== null) return
    const out = ctx.audio()
    start.disabled = true
    await resumeAudio(out)
    start.disabled = false
    if (!alive) return
    if (out.ctx.state !== 'running') {
      result.textContent = `音声を開始できませんでした（${out.ctx.state}）。画面を一度クリックしてからもう一度試してください。`
      return
    }
    const now = perfNow()
    const clicks = calClicks(bridgeOf(readAudioClock(out.ctx, now)), now)
    nodes = clicks.map((c) => playClick(out.ctx, out.buses.click, c.ctxSec, c.accent))
    cal = initialCal(clicks)
    start.hidden = true
    stop.hidden = false
    result.textContent = `予備 4 拍のあと ${TAP_COUNT} 打。クリックに合わせて Space を押してください。`
    show()
    timer = setTimeout(finish, Math.max(0, calDeadline(cal) - perfNow()))
  }

  return {
    el,
    onInput: (events) => {
      for (const ev of events) {
        if (cal === null || ev.kind !== 'role' || ev.role !== 'primary') continue
        const r = calTap(cal, ev.tsPerf)
        cal = r.state
        show()
        if (r.tap.kind === 'hit')
          result.textContent = `計測中… ${cal.errs.length}/${TAP_COUNT}（直前 ${signedMs(r.tap.err)}）`
        if (calDone(cal, perfNow())) finish()
      }
    },
    unmount: () => {
      alive = false
      end(null)
    },
  }
}
