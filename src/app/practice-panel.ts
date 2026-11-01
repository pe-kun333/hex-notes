// S4 練習室のパネル（M2-03 後半、M2 の手順 6）。出どころ: m6 S4 L395–452・renderS4 L871–884、design.md §1.3 S4、m2-kickoff
// 手順 6・§7-9（右列は全高を落下域に使うので、パネルは左列のプレイヤー矩形の場所に置く）。文言と帯の目盛は practice-view.ts
// （純関数）。部品は選んだ値を onChange で返すだけで、回への効かせ方（待機なら作り直し、走っていれば runSetPractice）は
// screens/play.ts が持つ。鍵数制限の行は手順 7、足場外し（9 マス・手動／成績連動・音高ごとの棒・リセット・自力率の 4 区分）は
// 手順 8 で折り畳みの中に（左列は 3 視口でちょうど入る高さなので、開いたときだけ左列の中で縦に流れる）。

import type { KeysetId } from '../chart/keyset.ts'
import type { LoopRange } from '../practice/loop.ts'
import type { WaitMode } from '../practice/wait.ts'
import type { FadeState, LabelSides } from '../judge/self-rate.ts'
import type { LayoutId, SelfRate } from '../shared/types.ts'
import type { PracticeOptions } from './play-runner.ts'
import {
  FADE_NOTE,
  LABEL_SIDE_CHOICES,
  fadeBars,
  manualValue,
  selfPartsText,
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
  /** 足場外し（M2-04）: ラベル 9 マス（設定の値）、透明度の状態、曲の音高、退避の間は止まっている */
  readonly labels: LabelSides
  readonly fade: FadeState
  readonly pitches: readonly number[]
  readonly fadeFrozen: boolean
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
    /** ラベル 9 マス（待機中だけ） */
    readonly labels: (l: LabelSides) => void
    /** 透明度（手動／成績連動・手動の値・リセット。いつでも） */
    readonly fade: (patch: Partial<FadeState>) => void
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
  // 足場外し（折り畳み。開いた状態は描き直しても保つ）
  const nine = h(doc, 'div', { className: 'nine' })
  const fadeSeg = seg('fademode')
  const manual = h(doc, 'input')
  manual.type = 'range'
  manual.min = '0'
  manual.max = '100'
  manual.step = '5'
  manual.setAttribute('aria-label', '手動の透明度')
  const manualText = h(doc, 'span', { className: 'note' })
  manual.addEventListener('input', () => on.fade({ manual: manualValue(Number(manual.value)) }))
  const bars = h(doc, 'div', { className: 'fadebars' })
  const parts = h(doc, 'p', { className: 'note' })
  const frozenNote = h(doc, 'p', {
    className: 'note',
    text: '退避（幾何）の間はキー文字を常に出し、透明度は動きません。',
  })
  const fadeBox = h(doc, 'details', { className: 'fadebox' },
    h(doc, 'summary', { text: '足場外し（ラベルの透明度）・自力率の内訳' }),
    h(doc, 'p', { className: 'note', text: FADE_NOTE }),
    nine,
    h(doc, 'div', { className: 'btnrow' }, fadeSeg, manual, manualText,
      button(doc, '透明度をリセット（全音 100%）', () => on.fade({ alpha: {} }), 'small')),
    bars, frozenNote, parts,
  ) // prettier-ignore

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
    // ラベルのマス（4×4。行 ＝ 鍵盤側、列 ＝ ノート側）。替えられるのは待機中だけ（判定の自力率の数え方が変わるため）
    nine.replaceChildren(h(doc, 'span'), ...LABEL_SIDE_CHOICES.map((c) => h(doc, 'span', { className: 'h', text: `ノート側: ${c.label}` })),
      ...LABEL_SIDE_CHOICES.flatMap((r) => [h(doc, 'span', { className: 'h', text: `鍵盤側: ${r.label}` }), ...LABEL_SIDE_CHOICES.map((c) => {
        const b = button(doc, r.value === 'none' && c.value === 'none' ? '自力' : '', () => on.labels({ kb: r.value, note: c.value }), 'small cell')
        b.setAttribute('aria-pressed', String(s.labels.kb === r.value && s.labels.note === c.value))
        b.setAttribute('aria-label', `鍵盤側 ${r.label}・ノート側 ${c.label}`)
        b.disabled = !s.idle
        return b
      })]))
    fadeSeg.replaceChildren(...([['manual', '手動'], ['linked', '成績連動']] as const).map(([v, label]) => {
      const b = button(doc, label, () => on.fade({ mode: v }), 'small')
      b.setAttribute('aria-pressed', String(s.fade.mode === v))
      return b
    }))
    manual.hidden = s.fade.mode !== 'manual'
    manual.value = String(Math.round(s.fade.manual * 100))
    manualText.textContent = s.fade.mode === 'manual' ? `${Math.round(s.fade.manual * 100)}%` : ''
    bars.replaceChildren(...fadeBars(s.fade, s.pitches).map((x) => {
      const fill = h(doc, 'i')
      fill.style.width = `${x.pct}%`
      return h(doc, 'div', { className: `fadebar${x.hidden ? ' off' : ''}` }, h(doc, 'span', { text: x.name }), h(doc, 'span', { className: 'bar' }, fill), h(doc, 'span', { text: `${x.pct}%` }))
    }))
    frozenNote.hidden = !s.fadeFrozen
    parts.textContent = selfPartsText(s.self)
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
    fadeBox,
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
        s.labels,
        s.fade,
        s.pitches,
        s.fadeFrozen,
        pending,
      ])
      if (key === last) return
      last = key
      draw(s)
    },
  }
}
