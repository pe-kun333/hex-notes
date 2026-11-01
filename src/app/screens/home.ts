// S1 ホーム／選曲（M1-08、M1 の手順 8。骨組みは手順 2）。曲カード・並び・譜面版の選択の中身は home-view.ts（純関数）。
// 出どころ: design.md §1.3 S1（上帯: プロファイル〔M1 では隠す〕・端末の上限・校正の有無。曲カード・譜面版の選択・並び）、
// m6 S1 L298–324（上帯・並び・曲カード・譜面版の箱）、m1-kickoff 手順 8 の手直し（device が無ければ「未診断（2）」。
// プロファイル切替・絞り込み・動画の切替は M1 では出さない）。開発ページへの導線は dev のときだけ（src/main.ts が渡す）。
// M2 の手順 2: 「＋ 曲を持ち込む」（初回でないとき）と、一覧に持ち込み曲（同梱曲の後）。版は曲の fold で選ぶ（foldOf）。
// M2 の手順 4: 絞り込み（すべて／同梱／持ち込み。初回は同梱だけで出さない）と、持ち込み曲の「この配列／上限の版を作る」
// （library-view.ts）。
// M2 の手順 9（M2-05）: 上帯にプロファイルと「切替」（m6 S1 L302。applyProfileDefaults で既定値を一括。曲カードの
// 自己ベスト・完走印をそのプロファイルで引き直す）。

import { validateChart } from '../../chart/validate.ts'
import { LAYOUTS } from '../../layout/presets.ts'
import {
  DEFAULT_CHORD_LIMIT,
  type Chart,
  type ChordLimit,
  type DeviceInfo,
  type LayoutId,
  type ResultRecord,
} from '../../shared/types.ts'
import { localDay, streakDays } from '../../results/awards.ts'
import { offsetFor } from '../../storage/local.ts'
import { signedMs } from '../calibration.ts'
import {
  LIMIT_NOTE,
  SORT_NAMES,
  foldOf,
  missingText,
  songCard,
  sortCards,
  versionChoice,
  type CardContext,
  type SongCard,
  type SortKey,
} from '../home-view.ts'
import {
  FILTER_NAMES,
  MAKE_BUTTON,
  MAKE_MISSING,
  canMakeVariant,
  emptyListText,
  filterChoices,
  songVisible,
  withVariant,
  type SongFilter,
} from '../library-view.ts'
import { DEFAULT_PRACTICE } from '../play-runner.ts'
import { PROFILE_NAMES, applyProfileDefaults, otherProfile } from '../profile.ts'
import { TUTORIAL_SONG_ID, localSong, type SongEntry } from '../songs.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { button, frame, h } from './frame.ts'

/** 上帯の端末の上限（診断が無いか飛ばしたなら既定の 2 で「未診断」） */
export function limitText(
  device: { readonly limit: number; readonly diagnosed?: boolean } | null,
): string {
  return device === null || device.diagnosed === false
    ? `未診断（${DEFAULT_CHORD_LIMIT}）`
    : `${device.limit}（同時押しテスト済み）`
}

/** 上帯の校正（自前音源のオフセット。未校正は印だけ） */
export function calibText(offsetMs: number | null): string {
  if (offsetMs === null) return '未校正'
  return `校正済み（${signedMs(offsetMs)}）`
}

type Loaded = { readonly entry: SongEntry; readonly chart: Chart; readonly card: SongCard }
type Failed = { readonly entry: SongEntry; readonly why: string }

export function homeScreen(ctx: ScreenContext): ScreenView {
  const { doc, booted } = ctx
  const f = frame(ctx, 'ホーム', { gear: true })
  let settings = ctx.settings()
  const deviceLimit = ctx.device()?.limit ?? null
  const calibration = ctx.calibration()
  const audio = calibration.audio
  // プロファイルの切替: 既定値を一括で入れ替え、記録の引き直しのためにカードを作り直す（記録はプロファイルごと）
  const profName = h(doc, 'b', { text: PROFILE_NAMES[settings.profile] })
  const swap = button(doc, '切替', () => {
    settings = applyProfileDefaults(ctx.settings(), otherProfile(settings.profile))
    ctx.saveSettings(settings)
    profName.textContent = PROFILE_NAMES[settings.profile]
    loaded = loaded.map((l) => ({ ...l, card: cardOf(l.entry, l.chart) }))
    showList()
  }, 'small swap-profile')
  const top = h(
    doc,
    'div',
    { className: 'topband' },
    h(doc, 'span', {}, 'プロファイル ', profName, ' ', swap),
    h(doc, 'span', {}, '端末の上限 ', h(doc, 'b', { text: limitText(ctx.device()) })),
    h(doc, 'span', {}, h(doc, 'b', { text: calibText(audio === undefined ? null : offsetFor(calibration, 'audio')) })),
  )
  f.root.insertBefore(top, f.bandSlot)

  // 並び → 曲カード → 選んだ曲の譜面版
  const sortSel = h(doc, 'select')
  sortSel.setAttribute('aria-label', '並び')
  for (const k of Object.keys(SORT_NAMES) as SortKey[]) {
    const o = h(doc, 'option', { text: SORT_NAMES[k] })
    o.value = k
    sortSel.append(o)
  }
  const list = h(doc, 'div', { className: 'songs' }, h(doc, 'p', { className: 'note', text: '曲を読み込み中…' }))
  const panel = h(doc, 'div', { className: 'card variant' })
  panel.hidden = true
  const sortRow = h(doc, 'div', { className: 'btnrow' }, h(doc, 'span', { className: 'note', text: '並び' }), sortSel)
  // 初回か（S1 を開くたびに評価する、m2-kickoff §7-27）。初回は同梱曲だけで、絞り込みと「曲を持ち込む」を出さない
  const first = ctx.isFirst()
  let filter: SongFilter = 'all'
  const filters = filterChoices(first)
  const filterSeg = h(doc, 'div', { className: 'seg' })
  const showFilter = (): void => {
    filterSeg.replaceChildren(...(filters ?? []).map((k) => {
      const b = button(doc, FILTER_NAMES[k], () => {
        filter = k
        showFilter()
        showList()
      }, 'small')
      b.setAttribute('aria-pressed', String(k === filter))
      return b
    }))
  }
  if (filters !== null) {
    showFilter()
    // 狭い視口で「絞り込み」と釦が別の行に分かれないよう 1 つの塊に
    sortRow.append(h(doc, 'span', { className: 'filter' }, h(doc, 'span', { className: 'note', text: '絞り込み' }), filterSeg))
  }
  // 曲を持ち込む（S5）は初回でないときだけ（m6 L312）
  if (!first) sortRow.append(button(doc, '＋ 曲を持ち込む', () => ctx.go('S5'), 'import-entry'))
  f.body.append(sortRow, list, panel)

  let loaded: Loaded[] = []
  let failed: Failed[] = []
  let records: readonly ResultRecord[] = []
  let selected: string | null = ctx.song()?.id ?? null
  let layoutPick: LayoutId | null = null
  let limitPick: ChordLimit | null = null
  /** 「版を作る」が失敗したときの 1 行（曲を選び直すと消す） */
  let makeError = ''
  let alive = true
  const cardContext = (): CardContext => ({ preferred: settings.layout, deviceLimit, profile: settings.profile, records, tutorialId: TUTORIAL_SONG_ID })
  /** 曲カード（名前は一覧の名前。dev のフィクスチャは「試験:」付き、同梱曲は譜面の name と同じ） */
  const cardOf = (entry: SongEntry, chart: Chart): SongCard => ({ ...songCard(entry.id, chart, cardContext()), name: entry.name })
  const shown = (e: SongEntry): boolean => songVisible(e.source, filter, first)

  const songButton = (c: SongCard): HTMLElement => {
    const b = button(doc, '', () => {
      selected = c.id
      layoutPick = null
      limitPick = null
      makeError = ''
      showList()
    }, `song${c.id === selected ? ' sel' : ''}`)
    b.setAttribute('aria-pressed', String(c.id === selected))
    const head = h(doc, 'div', { className: 't' }, h(doc, 'span', { className: 'name', text: c.name }))
    if (c.finished) head.append(h(doc, 'span', { className: 'pill good', text: '完走' }))
    const pills = h(doc, 'div', { className: 'm' }, h(doc, 'span', { className: 'pill', text: '自前音源' }))
    if (c.tutorial) pills.append(h(doc, 'span', { className: 'pill', text: 'チュートリアル' }))
    const axes = h(doc, 'div', { className: 'axes' })
    for (const a of c.axes) {
      const bar = h(doc, 'i')
      bar.style.width = `${a.pct}%`
      axes.append(
        h(doc, 'span', { text: a.label }),
        h(doc, 'span', { className: 'bar' }, bar),
        h(doc, 'span', { className: a.caution ? 'caution' : '', text: a.caution ? `${a.text}（注意）` : a.text }),
      )
    }
    b.append(
      head,
      h(doc, 'div', { className: 'm' }, h(doc, 'span', { text: c.rights }), h(doc, 'span', { text: c.bpm }), h(doc, 'span', { text: c.length })),
      pills,
      axes,
      h(doc, 'div', { className: 'best', text: c.best }),
      h(doc, 'div', { className: 'note', text: `譜面版: ${c.variants}` }),
    )
    return b
  }

  function showPanel(): void {
    const l = loaded.find((x) => x.entry.id === selected && shown(x.entry))
    panel.hidden = l === undefined
    if (l === undefined) return
    const src = l.entry.source
    const ch = versionChoice(l.chart, settings.layout, deviceLimit, layoutPick ?? undefined)
    const layout = layoutPick !== null && ch.layouts.includes(layoutPick) ? layoutPick : ch.recommended
    const choiceOf = (x: ChordLimit) => ch.limits.find((c) => c.limit === x)
    const ok = (x: ChordLimit): boolean => ch.limits.some((c) => c.limit === x && c.available && c.allowed)
    // 持ち込み曲は版の無い上限も選べる（選ぶと「この配列／上限の版を作る」、§1.3 S1・m6 L781–786）
    const can = (x: ChordLimit): boolean => ok(x) || canMakeVariant(src, choiceOf(x))
    const limit = limitPick !== null && can(limitPick) ? limitPick : (ch.pick?.limit ?? ch.limits.find((c) => canMakeVariant(src, c))?.limit ?? null)
    const missing = limit !== null && !ok(limit)
    const lay = h(doc, 'div', { className: 'seg' })
    for (const id of ch.layouts) {
      const b = button(doc, `${LAYOUTS[id].name}${id === ch.recommended ? '（推奨）' : ''}`, () => {
        layoutPick = id
        limitPick = null
        showPanel()
      }, 'small')
      b.setAttribute('aria-pressed', String(id === layout))
      lay.append(b)
    }
    const lim = h(doc, 'div', { className: 'seg' })
    for (const c of ch.limits) {
      const b = button(doc, String(c.limit), () => {
        limitPick = c.limit
        showPanel()
      }, 'small')
      b.disabled = !can(c.limit)
      if (!c.allowed) b.title = `端末の上限 ${deviceLimit ?? DEFAULT_CHORD_LIMIT} を超える`
      else if (!c.available) b.title = src === 'local' ? 'この版はまだありません（作れます）' : 'この曲はこの版を持ちません'
      b.setAttribute('aria-pressed', String(c.limit === limit))
      lim.append(b)
    }
    const play = button(doc, 'この譜面版で遊ぶ → プレイ', () => {
      if (limit === null || missing) return
      ctx.pickSong(l.entry, 'all', { layout, limit, fold: foldOf(l.chart) })
      ctx.setPractice(null)
      ctx.go('S2')
    }, 'primary')
    play.disabled = limit === null || missing
    // 練習室で弾く（区間なし。練習の設定は既定から、m6 L321・L967、M2 の手順 6）
    const room = button(doc, '練習室で弾く', () => {
      if (limit === null || missing) return
      ctx.pickSong(l.entry, 'all', { layout, limit, fold: foldOf(l.chart) })
      ctx.setPractice(DEFAULT_PRACTICE)
      ctx.go('S4')
    })
    room.disabled = play.disabled
    const note = limit === null ? '' : limit > DEFAULT_CHORD_LIMIT ? LIMIT_NOTE : '既定。'
    const make = !missing || limit === null ? [] : [h(doc, 'p', { className: 'note' }, MAKE_MISSING, ' ',
      button(doc, MAKE_BUTTON, () => void makeVariant(l, layout, limit), 'small make-variant'),
      ...(makeError === '' ? [] : [' ', makeError]))]
    panel.replaceChildren(
      h(doc, 'h3', { text: `譜面版を選ぶ: ${l.card.name}` }),
      h(doc, 'div', { className: 'row' }, h(doc, 'span', { text: '配列' }), lay),
      h(doc, 'div', { className: 'row' }, h(doc, 'span', { text: '同時押し上限' }), lim, h(doc, 'span', { className: 'note', text: note })),
      ...(limit === null ? [h(doc, 'p', { className: 'note', text: missingText(layout, DEFAULT_CHORD_LIMIT, l.card.tutorial) })] : []),
      ...make,
      h(doc, 'div', { className: 'btnrow' }, play, room, h(doc, 'span', { className: 'note', text: '成績の比較は同じ譜面版の中だけ。' })),
    )
  }

  /** 持ち込み曲に版を 1 つ足して保存し、その版を選んだ状態で描き直す（m6 makevariant L966。fold は曲の fold） */
  async function makeVariant(l: Loaded, layout: LayoutId, limit: ChordLimit): Promise<void> {
    let chart: Chart
    try {
      chart = withVariant(l.chart, { layout, limit })
      // resilientDb は投げずにメモリへ移る（帯は保存層が出す）。包んでいない置き場が投げたときもここで知らせる
      await booted.db.putChart(chart).catch(() => ctx.band({ kind: 'storageFail', area: 'idb' }))
    } catch (e) {
      makeError = `版を作れませんでした（${e instanceof Error ? e.message : String(e)}）。`
      if (alive) showPanel()
      return
    }
    if (!alive) return
    // 一覧の曲も新しい譜面を返す物に替える（S2 がこの曲を load する。id は同じ、§3.3）
    const entry = { ...localSong(chart), name: l.entry.name }
    loaded = loaded.map((x) => (x.entry.id === l.entry.id ? { entry, chart, card: cardOf(entry, chart) } : x))
    layoutPick = layout
    limitPick = limit
    makeError = ''
    showList()
  }

  function showList(): void {
    const cards = sortCards(loaded.filter((l) => shown(l.entry)).map((l) => l.card), sortSel.value as SortKey)
    const bad = failed.filter((x) => shown(x.entry))
    list.replaceChildren(
      ...cards.map(songButton),
      ...bad.map((x) => h(doc, 'p', { className: 'note', text: `${x.entry.name}: ${x.why}` })),
    )
    if (cards.length === 0 && bad.length === 0) list.append(h(doc, 'p', { className: 'note', text: emptyListText(filter) }))
    showPanel()
  }

  sortSel.addEventListener('change', showList)

  // 曲の譜面と記録を読む（読めない譜面はその曲だけ文で出す。記録が読めなければ自己ベストなし）
  void (async () => {
    records = await booted.db.listResults().catch(() => [])
    // 上帯のストリーク（手順 11、m6 L754。1 日以上のときだけ）
    const streak = streakDays(records, localDay(new Date().toISOString()))
    if (alive && streak > 0)
      top.append(h(doc, 'span', {}, 'ストリーク ', h(doc, 'b', { text: `${streak} 日` }), '（自前音源のプレイだけが対象）'))
    const songs = await ctx.songs()
    const results = await Promise.all(
      songs.map(async (entry): Promise<Loaded | Failed> => {
        try {
          const v = validateChart(await entry.load())
          if (!v.ok) return { entry, why: '譜面が読めません' }
          return { entry, chart: v.chart, card: cardOf(entry, v.chart) }
        } catch (e) {
          return { entry, why: `読めません（${e instanceof Error ? e.message : String(e)}）` }
        }
      }),
    )
    if (!alive) return
    loaded = results.filter((x): x is Loaded => 'card' in x)
    failed = results.filter((x): x is Failed => !('card' in x))
    showList()
  })()

  // 開発ページへの導線（dev のときだけ）
  if (ctx.devPages.length > 0)
    f.body.append(
      h(
        doc,
        'details',
        { className: 'dev' },
        h(doc, 'summary', { text: '開発ページ' }),
        h(doc, 'ul', {}, ...ctx.devPages.map((p) => {
          const a = h(doc, 'a', { text: p.label })
          a.href = p.href
          return h(doc, 'li', {}, a)
        })),
      ),
    )
  return {
    root: f.root,
    bandSlot: f.bandSlot,
    unmount: () => {
      alive = false
    },
  }
} // prettier-ignore
