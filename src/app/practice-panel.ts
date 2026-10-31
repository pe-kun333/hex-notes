// S4 練習室のパネル（M2-03 後半、M2 の手順 6）。出どころ: m6 S4 L395–452・renderS4 L871–884、design.md §1.3 S4、m2-kickoff
// 手順 6・§7-9（右列は全高を落下域に使うので、パネルは左列のプレイヤー矩形の場所に置く）。文言と帯の目盛は practice-view.ts
// （純関数）。部品は選んだ値を onChange で返すだけで、回への効かせ方（待機なら作り直し、走っていれば runSetPractice）は
// screens/play.ts が持つ。足場外しの 9 マスは手順 8、鍵数制限の箱は手順 7。

import type { KeysetId } from '../chart/keyset.ts'
import type { LoopRange } from '../practice/loop.ts'
import type { WaitMode } from '../practice/wait.ts'
import type { LayoutId, SelfRate } from '../shared/types.ts'
import type { PracticeOptions } from './play-runner.ts'
import {
  KEYSET_CHOICES,
  KEYSET_NOTE,
  keysetLayoutNote,
  LOOP_NOTE,
  TEMPO_CHOICES,
  TEMPO_NOTE,
  WAIT_CHOICES,
  bandClick,
  loopBand,
  loopStatus,
  rangeFrom,
  selfLine,
} from './practice-view.ts'
import { button, h } from './screens/frame.ts'

/** パネルが毎フレーム読む回の様子（変わった所だけ描き直す） */
export interface PanelState {
  readonly opts: PracticeOptions
  /** 今のテンポ段（自動昇降で変わる） */
  readonly rate: number
  readonly range: LoopRange | null
  readonly laps: number
  readonly bars: number
  readonly nowBar: number
  readonly self: SelfRate
  /** 鍵数制限（M2-07）。shown 偽（音ゲー向け）なら箱を隠す。idle 偽（回の途中）なら替えられない */
  readonly keyset: KeysetId
  readonly keysetShown: boolean
  readonly layout: LayoutId
  readonly idle: boolean
}

export interface PracticePanel {
  readonly el: HTMLElement
  update(s: PanelState): void
}

export function practicePanel(
  doc: Document,
  on: {
    readonly change: (patch: Partial<PracticeOptions>) => void
    readonly keyset: (k: KeysetId) => void
    readonly fullPlay: () => void
    readonly home: () => void
  },
): PracticePanel {
  let last = ''
  let cur: PanelState | null = null
  let pending: number | null = null

  const seg = (cls: string): HTMLElement => h(doc, 'div', { className: `seg ${cls}` })
  const waitSeg = seg('wait')
  const waitNote = h(doc, 'p', { className: 'note' })
  const tempoSeg = seg('tempo')
  const autoTempo = h(doc, 'input')
  autoTempo.type = 'checkbox'
  autoTempo.addEventListener('change', () => on.change({ autoTempo: autoTempo.checked }))
  const band = h(doc, 'div', { className: 'loopband' })
  band.setAttribute('aria-label', '曲の帯。始点と終点をクリック')
  const loopLine = h(doc, 'p', { className: 'note' })
  const autoLoop = h(doc, 'input')
  autoLoop.type = 'checkbox'
  autoLoop.addEventListener('change', () => on.change({ autoLoop: autoLoop.checked }))
  const selfText = h(doc, 'b')
  // 鍵数制限（入門者だけ。1 行に収め、説明は title）
  const keysetSeg = seg('keyset')
  const keysetHead = h(doc, 'span', { className: 'label', text: '鍵数制限' })
  keysetHead.title = KEYSET_NOTE
  const keysetRow = h(doc, 'div', { className: 'btnrow keysetrow' }, keysetHead, keysetSeg)
  keysetRow.title = KEYSET_NOTE

  const draw = (s: PanelState): void => {
    waitSeg.replaceChildren(...WAIT_CHOICES.map((c) => {
      const b = button(doc, c.label, () => on.change({ mode: c.value as WaitMode }), 'small')
      b.setAttribute('aria-pressed', String(c.value === s.opts.mode))
      return b
    }))
    waitNote.textContent = WAIT_CHOICES.find((c) => c.value === s.opts.mode)?.note ?? ''
    tempoSeg.replaceChildren(...TEMPO_CHOICES.map((c) => {
      const b = button(doc, c.label, () => on.change({ rate: c.rate }), 'small')
      b.setAttribute('aria-pressed', String(c.rate === s.rate))
      return b
    }))
    autoTempo.checked = s.opts.autoTempo
    band.replaceChildren(...loopBand(s.bars, s.range, pending, s.nowBar).map((c) => {
      const b = button(doc, '', () => {
        const k = bandClick(pending, c.bar)
        pending = k.pending
        if (k.range !== null) on.change({ loop: k.range })
        else if (cur !== null) draw(cur)
      }, `cell${c.in ? ' in' : ''}${c.start ? ' start' : ''}${c.now ? ' now' : ''}`)
      b.title = `${c.bar} 小節`
      b.setAttribute('aria-label', `${c.bar} 小節`)
      return b
    }))
    loopLine.textContent = loopStatus(s.range, s.laps, s.opts.autoLoop)
    autoLoop.checked = s.opts.autoLoop
    selfText.textContent = selfLine(s.self)
    keysetRow.hidden = !s.keysetShown
    keysetSeg.replaceChildren(...KEYSET_CHOICES.map((c) => {
      const b = button(doc, c.label, () => on.keyset(c.value), 'small')
      b.setAttribute('aria-pressed', String(c.value === s.keyset))
      b.disabled = !s.idle && c.value !== s.keyset
      return b
    }))
    const ln = keysetLayoutNote(s.layout)
    keysetRow.title = ln === null ? KEYSET_NOTE : `${KEYSET_NOTE} ${ln}`
  } // prettier-ignore

  // 狭い視口でも左列に縦スクロールなしで入るよう、テンポ段とループの説明は見出しと帯の title に置く（手順 6、3 視口）
  const tempoHead = h(doc, 'span', { className: 'label', text: 'テンポ段' })
  tempoHead.title = TEMPO_NOTE
  const loopHead = h(doc, 'h3', { text: 'ループ' })
  loopHead.title = LOOP_NOTE
  band.title = LOOP_NOTE
  const el = h(doc, 'div', { className: 'practice-panel' },
    h(doc, 'section', {}, h(doc, 'div', { className: 'btnrow' }, h(doc, 'span', { className: 'label', text: '待ち方' }), waitSeg), waitNote),
    h(doc, 'section', {}, h(doc, 'div', { className: 'btnrow' }, tempoHead, tempoSeg, h(doc, 'label', { className: 'note' }, autoTempo, ' 自動昇降'))),
    h(doc, 'section', {}, loopHead, band, loopLine,
      h(doc, 'div', { className: 'btnrow' },
        button(doc, '今の小節から 2 小節', () => cur !== null && on.change({ loop: rangeFrom(cur.nowBar, cur.bars) }), 'small'),
        button(doc, '区間を外す', () => {
          pending = null
          on.change({ loop: null })
        }, 'small'),
        h(doc, 'label', { className: 'note' }, autoLoop, ' 自動ループ'))),
    keysetRow,
    h(doc, 'p', { className: 'self' }, '自力率 ', selfText),
    h(doc, 'div', { className: 'btnrow' },
      button(doc, '通しで弾く → プレイ', () => on.fullPlay(), 'primary'),
      button(doc, 'ホームへ', () => on.home())),
  ) // prettier-ignore

  return {
    el,
    update: (s) => {
      cur = s
      // 変わった所があるときだけ描き直す（毎フレーム呼ばれる）
      const key = JSON.stringify([
        s.opts,
        s.rate,
        s.range,
        s.laps,
        s.bars,
        s.nowBar,
        s.self,
        s.keyset,
        s.keysetShown,
        s.layout,
        s.idle,
        pending,
      ])
      if (key === last) return
      last = key
      draw(s)
    },
  }
}
