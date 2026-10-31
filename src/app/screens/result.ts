// S3 結果（M1-06、M1 の手順 5。骨組みは手順 2、校正の提案は手順 4）。出どころ: design.md §1.2（S3 → もう一度・S1）・
// §1.3 S3（精度・ランク・内訳・提案。比較は同じ譜面版の中だけ）・§2.7（段 2 の提案、音源種別ごとに保存）、m6 S3 L360–393
// （2 枚のカード: 精度・ランク・曲の行・内訳の表／自力率・和音・ずれとオフセット・苦手区間）・提案帯 L381–384（適用／
// 今回は見送る）、decisions #55 (a)（calib 行は段 2 も書く）・#62。文言は result-view.ts。記録の保存は S2 の終わり
// （screens/play.ts）。称号・ストリークは手順 11、「練習室で弾く」は M2-03。

import { proposalFor, proposalText, signedMs } from '../calibration.ts'
import { DEFAULT_PRACTICE, type PlayResult } from '../play-runner.ts'
import { practiceEntryText, weakRange } from '../practice-view.ts'
import { resultView, rewardView } from '../result-view.ts'
import { awardsFor, localDay } from '../../results/awards.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { calibRow } from '../../telemetry/rows.ts'
import { updatePanel } from '../update-panel.ts'
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
  const t = proposalText(v, n, last.offsetUsed)
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
  const { doc, booted } = ctx
  const last = ctx.lastPlay()
  const v = last === null ? null : resultView(last)
  const f = frame(ctx, v?.title ?? '結果', { gear: true })
  let leave = (): void => {}
  let alive = true
  if (last === null || v === null)
    f.body.append(h(doc, 'p', { className: 'note', text: '結果がありません。' }))
  else {
    const scope = h(doc, 'p', { className: 'note scope', text: v.scope })
    f.root.insertBefore(scope, f.bandSlot)
    const table = h(doc, 'table', { className: 't' })
    for (const [k, val] of v.rows)
      table.append(h(doc, 'tr', {}, h(doc, 'td', { text: k }), h(doc, 'td', { text: val })))
    const main = h(
      doc,
      'div',
      { className: 'card' },
      h(
        doc,
        'div',
        { className: 'btnrow' },
        h(doc, 'div', {}, h(doc, 'div', { className: 'note', text: '精度' }), h(doc, 'div', { className: 'big', text: v.accuracy })),
        h(doc, 'div', {}, h(doc, 'div', { className: 'note', text: 'ランク' }), h(doc, 'div', { className: 'rank', text: v.rank })),
      ),
      h(doc, 'p', { className: 'note', text: v.song }),
      table,
    )
    const side = h(doc, 'div', { className: 'card' }, h(doc, 'h3', { text: '自力率' }))
    if (v.self.length === 0) side.append(h(doc, 'p', { className: 'note', text: '数えた音がありません。' }))
    else {
      const stack = h(doc, 'div', { className: 'stack' })
      const legend = h(doc, 'div', { className: 'legend' })
      for (const p of v.self) {
        const bar = h(doc, 'i', { className: `self-${p.key}` })
        bar.style.width = `${p.pct}%`
        stack.append(bar)
        legend.append(h(doc, 'span', {}, h(doc, 'i', { className: `self-${p.key}` }), p.label))
      }
      side.append(stack, legend)
    }
    if (v.chord !== null) side.append(h(doc, 'h3', { text: '和音' }), h(doc, 'p', { text: v.chord }))
    const offset = h(doc, 'div', { className: 'card' }, h(doc, 'h3', { text: 'ずれとオフセット' }))
    offset.append(h(doc, 'p', { text: v.lean ?? '正しいキーで当てた音がありません。' }))
    const p = proposalBand(ctx, last)
    if (p.el !== null) offset.append(p.el)
    leave = p.leave
    offset.append(h(doc, 'h3', { text: '苦手区間' }), h(doc, 'p', { text: v.weak ?? 'はずれはありませんでした。' }))
    // 称号・ストリーク（手順 11。記録を全部読んでから。保存がまだ終わっていなくても、この回の記録は足して数える）
    const reward = h(doc, 'div', { className: 'card' }, h(doc, 'h3', { text: '称号・ストリーク' }), h(doc, 'p', { className: 'note', text: '集計中…' }))
    f.body.append(h(doc, 'div', { className: 'grid2' }, main, side), offset, reward)
    void (async () => {
      const [records, bundledIds] = await Promise.all([booted.db.listResults().catch(() => []), ctx.bundledIds()])
      if (!alive) return
      const rv = rewardView(awardsFor(records, last.record, { today: localDay(new Date().toISOString()), bundledIds }))
      const pills = h(doc, 'div', { className: 'btnrow' }, ...rv.pills.map((t) => h(doc, 'span', { className: 'pill good', text: t })))
      reward.replaceChildren(h(doc, 'h3', { text: '称号・ストリーク' }), ...(rv.pills.length > 0 ? [pills] : []), ...rv.lines.map((t, i) => h(doc, 'p', { className: i === 0 ? '' : 'note', text: t })))
    })()
  }
  // 新しい版が待っていれば「更新する」（プレイの合間。手順 13、ADR 0004）
  const upd = updatePanel(ctx, 'S3')
  f.body.append(upd.el)
  if (last?.onboardEnd === true)
    f.body.append(h(doc, 'p', { className: 'note', text: '初回導線はここで終わります。「ホームへ」で曲一覧に進みます。' }))
  f.body.append(
    h(
      doc,
      'div',
      { className: 'btnrow' },
      // もう一度 ＝ 同じ曲・同じ設定（同じ譜面版）で S2。練習室の回なら S4 へ（同じ練習の設定、M2 の手順 6）
      button(doc, 'もう一度', () => ctx.go(ctx.practice() !== null ? 'S4' : 'S2'), 'primary'),
      // 練習室で弾く（初回導線の S3 では出さない。苦手 2 小節があればループ区間に、m6 L387・L858・L987）
      ...(last === null || last.onboardEnd === true ? [] : [button(doc, practiceEntryText(weakRange(last.weak)), () => {
        ctx.setPractice({ ...DEFAULT_PRACTICE, loop: weakRange(last.weak) })
        ctx.go('S4')
      })]),
      button(doc, 'ホームへ', () => {
        ctx.setPractice(null)
        ctx.go('S1')
      }),
    ),
  )
  // 何もせず S3 を離れたら見送りとして 1 回書く（S6 へ行って戻ったときも片付いたものとする）
  return {
    root: f.root,
    bandSlot: f.bandSlot,
    onUpdate: upd.refresh,
    unmount: () => {
      alive = false
      leave()
    },
  }
} // prettier-ignore
