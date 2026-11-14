// S3 結果（M1-06、M1 の手順 5。骨組みは手順 2、校正の提案は手順 4）。出どころ: design.md §1.2（S3 → もう一度・S1）・
// §1.3 S3（精度・ランク・内訳・提案。比較は同じ譜面版の中だけ）・§2.7（段 2 の提案、音源種別ごとに保存）、m6 S3 L360–393
// （2 枚のカード: 精度・ランク・曲の行・内訳の表／自力率・和音・ずれとオフセット・苦手区間）・提案帯 L381–384（適用／
// 今回は見送る）、decisions #55 (a)（calib 行は段 2 も書く）・#62。文言は result-view.ts。記録の保存は S2 の終わり
// （screens/play.ts）。称号・ストリークは手順 11、「練習室で弾く」は M2-03。
// M2 の手順 9（M2-05）: 音ゲー向けの FULL COMBO（m6 S3 L366）と節（塊／殻／段またぎ・FAST／SLOW・早遅ヒストグラム、
// m6 S3 L375–379）、途中終了の称号の文。
// M3 の手順 8（M3-06、m3-kickoff §7-33）: 称号の節は rewardFor の門の後ろ。対象外の回（YouTube 再生・途中で動画なしに
// 切り替わった回）は記録も同梱曲の id も読まず、集計中…を出さずに対象外の文をその場で置く。

import { appliedText, driftText, proposalFor, proposalText } from '../calibration.ts'
import { DEFAULT_PRACTICE, type FinishedPlay } from '../play-runner.ts'
import { practiceEntryText, weakRange } from '../practice-view.ts'
import { HIST_BAR_MS, HIST_BARS, offTargetLines, resultView, rewardView } from '../result-view.ts'
import { localDay } from '../../results/awards.ts'
import { isFinished } from '../../results/record.ts'
import { offTargetWhy, rewardFor, type RewardLoad } from '../../results/reward.ts'
import { dailyAfterPlay, dailyDone, dailyOf } from '../../results/daily.ts'
import { loadDaily, saveDaily } from '../../storage/local.ts'
import { DAILY_DONE_LINE } from '../daily-view.ts'
import type { ResultRecord } from '../../shared/types.ts'

/** この回が、その日（記録の日）の 1 曲の対象プレイの完走か（M4 の手順 7） */
function dailyDoneNow(rec: ResultRecord, pool: readonly string[]): boolean {
  const day = localDay(rec.at)
  const id = dailyOf(day, pool)
  return id !== null && dailyDone(rec, day, id)
}
import type { ScreenContext, ScreenView } from '../shell.ts'
import { calibRow } from '../../telemetry/rows.ts'
import { updatePanel } from '../update-panel.ts'
import { button, frame, h } from './frame.ts'

/**
 * 校正の提案の帯（段 2）。条件を満たせば「適用／今回は見送る」、満たさなければ出さない。calib 行は回ごとに 1 回
 * （適用・見送り・何もせず S3 を離れた・満たさなかった）。片付けた後は出さない。M3 の手順 9: 保存先・文・calib 行の source は
 * 記録の syncUsed.kind（提案が出る回は校正の種別と同じ）。ずれの傾きの注意が立った回は、帯の場所に注意の 1 行（釦も calib 行も無い）
 */
function proposalBand(ctx: ScreenContext, last: FinishedPlay): { el: HTMLElement | null; leave(): void } {
  const none = { el: null, leave: () => {} }
  const { doc } = ctx
  if (last.drift?.warn === true) {
    const el = h(doc, 'div', { className: 'band offer' }, h(doc, 'span', { text: driftText(last.drift) }))
    el.dataset['band'] = 'drift'
    return { el, leave: () => {} }
  }
  const v = proposalFor(last)
  if (v === null || !ctx.proposalOpen()) return none
  const kind = last.record.syncUsed.kind
  const n = last.samples.length
  const log = (applied: boolean): void => {
    if (!ctx.proposalOpen()) return
    ctx.closeProposal()
    void ctx.booted.db.appendTelemetry(calibRow('propose', v, n, applied, new Date().toISOString(), kind === 'youtube' ? 'youtube' : undefined)).catch(() => {})
  }
  if (!v.ok) {
    log(false)
    return none
  }
  const t = proposalText(v, n, last.offsetUsed, kind)
  const el = h(doc, 'div', { className: 'band offer' }, h(doc, 'b', { text: t.title }), h(doc, 'span', { text: t.detail }))
  el.dataset['band'] = 'offer'
  const done = (msg: string): void => {
    el.replaceChildren(h(doc, 'span', { text: msg }))
  }
  el.append(
    button(doc, '適用', () => {
      ctx.saveCalibration(kind, { offsetMs: v.offset, at: new Date().toISOString(), via: 'propose' })
      log(true)
      done(appliedText(kind, v.offset))
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
        ...(v.fullCombo ? [h(doc, 'div', { className: 'fc' }, h(doc, 'div', { className: 'note', text: 'コンボ' }), h(doc, 'div', { className: 'rank', text: 'FULL COMBO' }))] : []),
      ),
      h(doc, 'p', { className: 'note', text: v.song }),
      ...v.notes.map((n) => h(doc, 'p', { className: 'note', text: n })),
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
    // 音ゲー向けの節（m6 S3 L375–379。ヒストグラムの本の高さは最も多い本に対する比、数は aria-label と title に）
    if (v.gamer !== null) {
      const max = Math.max(1, ...v.gamer.hist)
      const half = (HIST_BARS * HIST_BAR_MS) / 2
      const hist = h(doc, 'div', { className: 'hist' }, ...v.gamer.hist.map((n, i) => {
        const bar = h(doc, 'i', { className: i === (HIST_BARS - 1) / 2 ? 'zero' : i > (HIST_BARS - 1) / 2 ? 'late' : '' })
        bar.style.height = `${Math.round((n / max) * 100)}%`
        bar.title = `${-half + i * HIST_BAR_MS}〜${-half + (i + 1) * HIST_BAR_MS} ms: ${n}`
        return bar
      }))
      hist.setAttribute('role', 'img')
      hist.setAttribute('aria-label', `早遅ヒストグラム（早い側から）: ${v.gamer.hist.join('・')}`)
      side.append(
        h(doc, 'dl', { className: 'kv' },
          h(doc, 'dt', { text: '塊／殻／段またぎ' }), h(doc, 'dd', { text: v.gamer.shapes }),
          h(doc, 'dt', { text: 'FAST／SLOW' }), h(doc, 'dd', { text: v.gamer.fastSlow })),
        h(doc, 'h4', { text: `早遅ヒストグラム（−${half} … +${half} ms、${HIST_BAR_MS} ms 幅）` }),
        hist,
      )
    }
    const offset = h(doc, 'div', { className: 'card' }, h(doc, 'h3', { text: 'ずれとオフセット' }))
    offset.append(h(doc, 'p', { text: v.lean ?? '正しいキーで当てた音がありません。' }))
    const p = proposalBand(ctx, last)
    if (p.el !== null) offset.append(p.el)
    leave = p.leave
    offset.append(h(doc, 'h3', { text: '苦手区間' }), h(doc, 'p', { text: v.weak ?? 'はずれはありませんでした。' }))
    // 称号・ストリーク（手順 11。記録を全部読んでから。保存がまだ終わっていなくても、この回の記録は足して数える）。対象外の回は
    // 門の前で文をその場で置く（集計を呼ばない。M3 の手順 8）
    const rec = last.record
    const reward = h(doc, 'div', { className: 'card' }, h(doc, 'h3', { text: '称号・ストリーク' }), h(doc, 'p', { className: 'note', text: '集計中…' }))
    f.body.append(h(doc, 'div', { className: 'grid2' }, main, side), offset, reward)
    const load = async (): Promise<RewardLoad> => {
      const [records, bundledIds] = await Promise.all([booted.db.listResults().catch(() => []), ctx.bundledIds()])
      return { records, bundledIds }
    }
    const put = (pills: readonly string[], lines: readonly string[]): void => {
      const row = h(doc, 'div', { className: 'btnrow' }, ...pills.map((t) => h(doc, 'span', { className: 'pill good', text: t })))
      reward.replaceChildren(h(doc, 'h3', { text: '称号・ストリーク' }), ...(pills.length > 0 ? [row] : []), ...lines.map((t, i) => h(doc, 'p', { className: i === 0 ? '' : 'note', text: t })))
    }
    // 対象外はその場で（集計中…を出したままにしない）。対象プレイは門の後ろで集計
    const why = offTargetWhy(rec)
    if (why !== null) put([], offTargetLines(why, isFinished(rec)))
    else
      void rewardFor(rec, load, { today: localDay(new Date().toISOString()) }).then(async (g) => {
        if (!g.target) return
        // デイリー（M4 の手順 7）: 門の後ろで、この回がその日の 1 曲の対象プレイの完走なら鍵に書き、行を 1 つ足す（書いた日は
        // 変えないので、S3 を出入りしても 1 度だけ）。対象外の回は記録もデイリーも読まない
        const pool = await ctx.dailyPool()
        const done = dailyDoneNow(rec, pool)
        if (done) saveDaily(booted.local, dailyAfterPlay(loadDaily(booted.local), rec, pool))
        if (!alive) return
        const rv = rewardView(g.awards, rec.aborted === true)
        put(rv.pills, done ? [...rv.lines, DAILY_DONE_LINE] : rv.lines)
      })
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
      button(doc, 'もう一度', () => {
        // 練習室の「もう一度」もその回のヒートマップを持ち越す（M4 の手順 2、decisions #121 (b)）
        if (ctx.practice() !== null) ctx.setHeatCarry(last?.heat ?? null)
        ctx.go(ctx.practice() !== null ? 'S4' : 'S2')
      }, 'primary'),
      // 練習室で弾く（初回導線の S3 では出さない。苦手 2 小節があればループ区間に、m6 L387・L858・L987）
      ...(last === null || last.onboardEnd === true ? [] : [button(doc, practiceEntryText(weakRange(last.weak)), () => {
        ctx.setPractice({ ...DEFAULT_PRACTICE, loop: weakRange(last.weak) })
        // その回のヒートマップを持ち越し、S4 で表示を ON にする（decisions #118。M4 の手順 2）
        ctx.setHeatCarry(last.heat ?? null)
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
