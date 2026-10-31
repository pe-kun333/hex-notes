// S3 結果の骨組み（M1 の手順 2。中身は手順 5、M1-06。手順 3 で S2 の回の曲名と精度、手順 4 で校正の提案〔段 2〕を出す）。
// 出どころ: design.md §1.2（S3 → もう一度・S1）・§2.7（段 2 の提案、音源種別ごとに保存）、m6 S3 L360–393・提案帯
// L381–384（適用／今回は見送る）、decisions #55 (a)（calib 行は段 2 も書く。applied は提案を受けた）・#62（符号と文言）。

import { proposalFor, proposalText, signedMs } from '../calibration.ts'
import { accuracyText } from '../hud.ts'
import type { PlayResult } from '../play-runner.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { calibRow } from '../../telemetry/rows.ts'
import { button, frame, h } from './frame.ts'

/**
 * 校正の提案の帯（段 2）。条件を満たせば「適用／今回は見送る」、満たさなければ出さない。calib 行は回ごとに 1 回
 * （適用・見送り・何もせず S3 を離れた・満たさなかった）。片付けた後は出さない
 */
function proposalBand(ctx: ScreenContext, last: PlayResult): { el: HTMLElement | null; leave(): void } {
  const v = proposalFor(last)
  const none = { el: null, leave: () => {} }
  if (v === null || !ctx.proposalOpen()) return none
  const n = last.samples.length
  const log = (applied: boolean): void => {
    if (!ctx.proposalOpen()) return
    ctx.closeProposal()
    void ctx.booted.db.appendTelemetry(calibRow('propose', v, n, applied, new Date().toISOString())).catch(() => {})
  }
  if (!v.ok) {
    log(false)
    return none
  }
  const { doc } = ctx
  const t = proposalText(v, n)
  const el = h(doc, 'div', { className: 'band offer' }, h(doc, 'b', { text: t.title }), h(doc, 'span', { text: t.detail }))
  el.dataset['band'] = 'offer'
  const done = (msg: string): void => {
    el.replaceChildren(h(doc, 'span', { text: msg }))
  }
  el.append(
    button(doc, '適用', () => {
      ctx.saveCalibration('audio', { offsetMs: v.offset, at: new Date().toISOString(), via: 'propose' })
      log(true)
      done(`自前音源のオフセットを ${signedMs(v.offset)} にしました。`)
    }, 'small primary'),
    button(doc, '今回は見送る', () => {
      log(false)
      done('今回は見送りました。')
    }, 'small'),
  )
  return { el, leave: () => log(false) }
} // prettier-ignore

export function resultScreen(ctx: ScreenContext): ScreenView {
  const { doc } = ctx
  const f = frame(ctx, '結果', { gear: true })
  // S2 から受けた回の曲名と精度、校正の提案（内訳・保存・称号は手順 5・11）
  const last = ctx.lastPlay()
  let leave = (): void => {}
  if (last !== null) {
    f.body.append(
      h(doc, 'p', {}, h(doc, 'b', { text: last.name }), `　精度 ${accuracyText(last.judge)}`),
    )
    const p = proposalBand(ctx, last)
    if (p.el !== null) f.body.append(p.el)
    leave = p.leave
  }
  f.body.append(
    h(doc, 'p', { className: 'note', text: '結果の画面は準備中です。' }),
    h(
      doc,
      'div',
      { className: 'btnrow' },
      button(doc, 'もう一度', () => ctx.go('S2'), 'primary'),
      button(doc, 'ホームへ', () => ctx.go('S1')),
    ),
  )
  // 何もせず S3 を離れたら見送りとして 1 回書く（S6 へ行って戻ったときも片付いたものとする）
  return { root: f.root, bandSlot: f.bandSlot, unmount: () => leave() }
}
