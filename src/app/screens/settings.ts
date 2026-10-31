// S6 設定（M1-07、M1 の手順 10。骨組みは手順 2、校正の欄は手順 4）。出どころ: design.md §1.3 S6（群・「既定へ戻す」・
// 同時押し上限「テストをやり直す」・校正・データ〔記録の削除・書き出し／取り込み・端末プロファイルの初期化〕・クレジット）、
// m6 S6 L520–525・renderS6 L907–931（S6 は来た画面へ戻る）、decisions #29 (c)・#45・#50・#52・#53（取り込み）・#55 (b)・#67・
// #72、m1-kickoff 手順 10・§7-11。選ぶ項目は settings-view.ts（純関数）、同時押しテスト・校正・計測盤は部品（手順 9・4・
// 12。計測盤は m6 の順でデータの前）。オフラインと更新（SW、手順 13）はデータの後、オフセット（YouTube）は M3-08。
// M2 の手順 4（M2-06）: データの群に「持ち込み曲」（曲ごとの書き出しと削除、全持ち込み曲の版を作り直す）と、取り込み口で
// 譜面ファイルも受ける（同梱曲と同じ id は断る、持ち込み済みは上書き。m2-kickoff §7-18、文言は library-view.ts）。

import { validateChart } from '../../chart/validate.ts'
import { defaultLegendKind, legendOf } from '../../layout/legend.ts'
import { DEFAULT_CHORD_LIMIT, type Chart } from '../../shared/types.ts'
import {
  backupFileName,
  backupFileText,
  chartFileText,
  importText,
  makeBackup,
  type Backup,
} from '../../storage/file.ts'
import { defaultSettings, offsetFor, saveFade } from '../../storage/local.ts'
import { calibrationPanel } from '../calibration-panel.ts'
import { chordTestPanel, saveDeviceLimit, type ChordTestPanel } from '../chord-test-panel.ts'
import { downloadText } from '../file-io.ts'
import {
  LIBRARY_EMPTY,
  backupCharts,
  chartImportKind,
  chartImportText,
  deleteSure,
  deletedText,
  libraryRows,
  rebuildChart,
  rebuiltText,
} from '../library-view.ts'
import { SETTING_GROUPS, type Control } from '../settings-view.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { telemetryPanel } from '../telemetry-panel.ts'
import { updatePanel } from '../update-panel.ts'
import { button, frame, h } from './frame.ts'
import { calibText, limitText } from './home.ts'

/** 出どころの言葉（m6 の S1 の曲カードと同じ） */
const RIGHTS_TEXT: Readonly<Record<string, string>> = {
  pd: 'PD',
  own: '自作',
  cc0: 'CC0',
  'cc-by': 'CC BY',
}

/** 2 段の確かめ（押すと「本当に …」が出て、もう一度押すと実行） */
function confirmButton(doc: Document, text: string, sure: string, run: () => void | Promise<void>): HTMLElement {
  const wrap = h(doc, 'span', { className: 'confirm' })
  const first = button(doc, text, () => {
    wrap.replaceChildren(
      button(doc, sure, () => {
        wrap.replaceChildren(first)
        void run()
      }, 'small primary'),
      button(doc, 'やめる', () => wrap.replaceChildren(first), 'small'),
    )
  }, 'small')
  wrap.append(first)
  return wrap
} // prettier-ignore

export function settingsScreen(ctx: ScreenContext): ScreenView {
  const { doc, booted } = ctx
  const f = frame(ctx, '設定', { gear: false })
  let chordPanel: ChordTestPanel | null = null
  let alive = true
  // 計測盤（手順 12）。校正と同時押しテストが行を足したら読み直す
  const tele = telemetryPanel(ctx)

  // ---------- 選ぶ項目 ----------
  const groups = h(doc, 'div', { className: 'groups' })
  const segOf = (c: Control): HTMLElement => {
    const seg = h(doc, 'div', { className: 'seg' })
    const cur = c.get(ctx.settings())
    for (const ch of c.choices) {
      const b = button(
        doc,
        ch.label,
        () => {
          const before = ctx.settings()
          ctx.saveSettings(c.set(before, ch.value))
          // 低負荷を自動か OFF に戻したら、今の段の帯も下ろす（自動では戻さない、#29 (c)）
          if (c.id === 'fx.lowload' && ch.value !== 'on') ctx.band({ kind: 'lowLoad', level: 0 })
          showGroups()
        },
        'small',
      )
      b.setAttribute('aria-pressed', String(ch.value === cur))
      seg.append(b)
    }
    return seg
  }
  function showGroups(): void {
    groups.replaceChildren(
      ...SETTING_GROUPS.map((g) =>
        h(doc, 'section', { className: 'group' }, h(doc, 'h2', { text: g.title }),
          ...g.controls.map((c) =>
            h(doc, 'div', { className: 'row' }, h(doc, 'span', { className: 'label', text: c.label }), segOf(c),
              ...(c.note === undefined ? [] : [h(doc, 'span', { className: 'note', text: c.note })])),
          ),
        ),
      ),
    )
  } // prettier-ignore
  showGroups()
  const resetMsg = h(doc, 'span', { className: 'note' })
  const reset = h(
    doc,
    'div',
    { className: 'btnrow' },
    confirmButton(doc, '既定へ戻す', '本当に既定へ戻す', () => {
      ctx.saveSettings(defaultSettings())
      showGroups()
      resetMsg.textContent = '既定値に戻しました（入門者の既定）。'
    }),
    resetMsg,
  )

  // ---------- 同時押し上限 ----------
  const limitLine = h(doc, 'b')
  const limitBox = h(doc, 'div')
  const showLimit = (): void => {
    limitLine.textContent = limitText(ctx.device())
  }
  showLimit()
  const retest = button(
    doc,
    'テストをやり直す',
    () => {
      chordPanel?.unmount()
      chordPanel = chordTestPanel(ctx, {
        legend: legendOf(null, defaultLegendKind(navigator.language)).legend,
        doneText: 'この上限にする',
        onDone: (limit) => {
          saveDeviceLimit(ctx, limit, true)
          closeRetest()
          showLimit()
          tele.refresh()
        },
        skip: { text: 'やめる（今のまま）', onSkip: () => closeRetest() },
      })
      limitBox.replaceChildren(chordPanel.el)
      retest.hidden = true
      chordPanel.focus.focus({ preventScroll: true })
    },
    'small',
  )
  const closeRetest = (): void => {
    chordPanel?.unmount()
    chordPanel = null
    limitBox.replaceChildren()
    retest.hidden = false
  }
  const limitGroup = h(
    doc,
    'section',
    { className: 'group' },
    h(doc, 'h2', { text: '同時押し' }),
    h(doc, 'p', {}, '端末の上限: ', limitLine, ' ', retest),
    h(doc, 'p', { className: 'note', text: `譜面版の上限は既定 ${DEFAULT_CHORD_LIMIT}。端末の上限までの版はホームで選べます（3〜4 は保証なし）。超えた和音は低い音から落とし、最上声を残します。` }),
    limitBox,
  ) // prettier-ignore

  // ---------- 校正（手順 4） ----------
  const calibState = h(doc, 'b')
  const showCalib = (): void => {
    const c = ctx.calibration()
    calibState.textContent = calibText(c.audio === undefined ? null : offsetFor(c, 'audio'))
  }
  showCalib()
  const calib = calibrationPanel(ctx, {
    onDone: () => {
      showCalib()
      tele.refresh()
    },
  })
  const calibGroup = h(
    doc,
    'section',
    { className: 'group' },
    h(doc, 'h2', { text: '校正' }),
    h(doc, 'p', {}, 'オフセット（自前音源）: ', calibState),
    calib.el,
  )

  // ---------- データ ----------
  const dataMsg = h(doc, 'p', { className: 'note', text: '' })
  const say = (t: string): void => {
    if (alive) dataMsg.textContent = t
  }
  const exportBackup = async (): Promise<void> => {
    const at = new Date().toISOString()
    const [charts, results] = await Promise.all([booted.db.listCharts(), booted.db.listResults()])
    const b = makeBackup({ settings: ctx.settings(), fade: booted.fade, charts, results }, at)
    say(downloadText(doc, backupFileName(at), backupFileText(b)) ? `控えを書き出しました（記録 ${results.length} 件）。` : '書き出せませんでした。')
  } // prettier-ignore
  // ---------- 持ち込み曲（M2-06） ----------
  const library = h(
    doc,
    'ul',
    { className: 'library' },
    h(doc, 'li', { className: 'note', text: '読み込み中…' }),
  )
  /** 一覧を読み直す（削除・作り直し・取り込みの後） */
  const showLibrary = async (): Promise<void> => {
    const rows = libraryRows(await booted.db.listCharts().catch(() => []))
    if (!alive) return
    library.replaceChildren(...(rows.length === 0 ? [h(doc, 'li', { className: 'note', text: LIBRARY_EMPTY })] : rows.map((row) =>
      h(doc, 'li', {}, h(doc, 'span', { text: row.line }), ' ',
        button(doc, '書き出す', () => void exportChart(row.id, row.fileName), 'small'),
        confirmButton(doc, '削除', deleteSure(row.name), async () => {
          // 記録は残す（控えか曲のファイルで戻せる、§7-18）
          await booted.db.deleteChart(row.id).catch(() => {})
          say(deletedText(row.name))
          await showLibrary()
        }),
      ))))
  } // prettier-ignore
  /** 曲 1 つを書き出す（版なしのファイル名 曲名.hexnote.json、§1.3 S5 と同じ物） */
  const exportChart = async (id: string, fileName: string): Promise<void> => {
    const c = await booted.db.getChart(id).catch(() => undefined)
    if (c === undefined) return say('書き出せませんでした（曲が見つかりません）。')
    say(downloadText(doc, fileName, chartFileText(c)) ? `「${c.name}」を書き出しました。` : '書き出せませんでした。')
  } // prettier-ignore
  /** 全持ち込み曲の版を作り直す（保存時の fold のまま、§7-18） */
  const rebuildAll = async (): Promise<void> => {
    let done = 0
    let failed = 0
    for (const c of await booted.db.listCharts().catch(() => [])) {
      try {
        await booted.db.putChart(rebuildChart(c))
        done++
      } catch {
        failed++
      }
    }
    say(rebuiltText(done, failed))
    await showLibrary()
  }
  void showLibrary()

  const pending = h(doc, 'div', { className: 'btnrow' })
  /** 控えを取り込む（記録と持ち込み曲は足し、設定と足場外しは利用者が選んだときだけ上書き。#53 の未決、仮） */
  const applyBackup = async (b: Backup, withSettings: boolean): Promise<void> => {
    // 同梱曲と同じ id の曲は持ち込みにしない（§7-18。記録はそのまま）
    const { keep, bundled } = backupCharts(b.charts, await ctx.bundledIds())
    for (const c of keep) await booted.db.putChart(c).catch(() => {})
    for (const r of b.results) await booted.db.putResult(r).catch(() => {})
    if (withSettings) {
      ctx.saveSettings(b.settings)
      saveFade(booted.local, b.fade)
      showGroups()
    }
    pending.replaceChildren()
    say(
      `取り込みました（記録 ${b.results.length} 件・持ち込み曲 ${keep.length} 曲${withSettings ? '・設定も上書き' : ''}）。${bundled > 0 ? `同梱曲と同じ ${bundled} 曲は取り込みません。` : ''}`,
    )
    await showLibrary()
  }
  /** 譜面ファイル（Chart そのもの）を持ち込み曲として取り込む（同梱曲と同じ id は断る、同じ id は上書き、§7-18） */
  const applyChart = async (c: Chart, idChanged: boolean): Promise<void> => {
    const existing = (await booted.db.getChart(c.id).catch(() => undefined)) !== undefined
    const kind = chartImportKind(c.id, await ctx.bundledIds(), existing)
    if (kind !== 'bundled') await booted.db.putChart(c).catch(() => {})
    say(chartImportText(kind, c.name, idChanged))
    await showLibrary()
  }
  const fileIn = h(doc, 'input')
  fileIn.type = 'file'
  fileIn.accept = '.json,application/json'
  fileIn.setAttribute('aria-label', '控えか曲のファイル')
  fileIn.addEventListener('change', () => {
    const file = fileIn.files?.[0]
    fileIn.value = ''
    if (file === undefined) return
    void (async () => {
      const r = await importText(await file.text())
      if (!alive) return
      if (r.kind === 'error') return say(`取り込めませんでした（${r.reason}${r.issues[0] === undefined ? '' : `: ${r.issues[0]}`}）。`)
      if (r.kind === 'chart') return applyChart(r.chart, r.idChanged)
      const b = r.backup
      say(`控え（${b.exportedAt.slice(0, 10)}）: 記録 ${b.results.length} 件・持ち込み曲 ${b.charts.length} 曲${r.dropped.results + r.dropped.charts > 0 ? `（壊れた ${r.dropped.results + r.dropped.charts} 件は捨てます）` : ''}。設定も上書きしますか。`)
      pending.replaceChildren(
        button(doc, '記録だけ取り込む', () => void applyBackup(b, false), 'small primary'),
        button(doc, '設定も上書きする', () => void applyBackup(b, true), 'small'),
        button(doc, 'やめる', () => {
          pending.replaceChildren()
          say('取り込みをやめました。')
        }, 'small'),
      )
    })()
  }) // prettier-ignore
  const dataGroup = h(
    doc,
    'section',
    { className: 'group' },
    h(doc, 'h2', { text: 'データ' }),
    h(doc, 'div', { className: 'btnrow' },
      button(doc, '控えを書き出す', () => void exportBackup(), 'small'),
      h(doc, 'label', { className: 'small' }, '控え・曲のファイルを取り込む ', fileIn),
    ),
    pending,
    h(doc, 'h3', { text: '持ち込み曲' }),
    library,
    h(doc, 'div', { className: 'btnrow' },
      button(doc, '全持ち込み曲の版を作り直す', () => void rebuildAll(), 'small'),
      h(doc, 'span', { className: 'note', text: '折り畳みは持ち込んだときのまま。記録は残ります。Safari は 7 日で消えることがあるので、曲ごとか控えで書き出してください。' }),
    ),
    h(doc, 'div', { className: 'btnrow' },
      confirmButton(doc, '記録を削除', '本当に記録を全部消す', async () => {
        await booted.db.clear('results').catch(() => {})
        say('記録を削除しました（自己ベスト・完走も消えます）。')
      }),
      confirmButton(doc, '端末プロファイルの初期化', '本当に初期化して最初の導線へ', () => {
        ctx.resetDevice()
        ctx.go('S0')
      }),
    ),
    dataMsg,
  ) // prettier-ignore

  // ---------- オフラインと更新（手順 13） ----------
  const upd = updatePanel(ctx, 'S6')
  const updateGroup = h(
    doc,
    'section',
    { className: 'group' },
    h(doc, 'h2', { text: 'オフラインと更新' }),
    upd.el,
  )

  // ---------- クレジット ----------
  const songList = h(doc, 'ul', {}, h(doc, 'li', { className: 'note', text: '読み込み中…' }))
  void (async () => {
    const rows = await Promise.all(
      (await ctx.songs()).filter((s) => s.id.startsWith('bundled:')).map(async (s) => {
        try {
          const v = validateChart(await s.load())
          return v.ok ? creditOf(v.chart) : `${s.name}（読めません）`
        } catch {
          return `${s.name}（読めません）`
        }
      }),
    )
    if (alive) songList.replaceChildren(...rows.map((t) => h(doc, 'li', { text: t })))
  })() // prettier-ignore
  const credits = h(
    doc,
    'section',
    { className: 'group' },
    h(doc, 'h2', { text: 'クレジット' }),
    h(doc, 'p', { text: 'ピアノ音源: Salamander Grand Piano V3 — Alexander Holm、CC BY 3.0（30 音に間引き Opus に変換した改変物。未同梱の間は合成音で鳴ります）。' }),
    h(doc, 'p', { text: '同梱曲:' }),
    songList,
  ) // prettier-ignore

  f.body.append(
    groups,
    reset,
    limitGroup,
    calibGroup,
    tele.el,
    dataGroup,
    updateGroup,
    credits,
    h(
      doc,
      'div',
      { className: 'btnrow' },
      button(doc, '戻る', () => ctx.go('back'), 'primary'),
    ),
  )
  return {
    root: f.root,
    bandSlot: f.bandSlot,
    onInput: (events) => {
      chordPanel?.onInput(events)
      calib.onInput(events)
    },
    onUpdate: upd.refresh,
    unmount: () => {
      alive = false
      chordPanel?.unmount()
      calib.unmount()
      tele.unmount()
    },
  }
}

/** 同梱曲の 1 行（曲名・作曲者・出どころ。CC BY は帰属を足す） */
export function creditOf(c: Pick<Chart, 'name' | 'source'>): string {
  const s = c.source
  const by =
    s.license === undefined ? '' : `、${s.license.id} ${s.license.holder}（${s.license.url}）`
  return `${c.name}${s.composer === undefined ? '' : ` — ${s.composer}`} ・ ${RIGHTS_TEXT[s.rights] ?? s.rights}${by}`
}
