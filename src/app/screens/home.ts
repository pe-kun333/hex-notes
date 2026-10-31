// S1 ホーム／選曲（M1-08、M1 の手順 8。骨組みは手順 2）。曲カード・並び・譜面版の選択の中身は home-view.ts（純関数）。
// 出どころ: design.md §1.3 S1（上帯: プロファイル〔M1 では隠す〕・端末の上限・校正の有無。曲カード・譜面版の選択・並び）、
// m6 S1 L298–324（上帯・並び・曲カード・譜面版の箱）、m1-kickoff 手順 8 の手直し（device が無ければ「未診断（2）」。
// プロファイル切替・持ち込み・絞り込み・動画の切替は M1 では出さない）。開発ページへの導線は dev のときだけ（src/main.ts が渡す）。

import { validateChart } from '../../chart/validate.ts'
import { LAYOUTS } from '../../layout/presets.ts'
import {
  DEFAULT_CHORD_LIMIT,
  type Chart,
  type ChordLimit,
  type DeviceInfo,
  type LayoutId,
} from '../../shared/types.ts'
import { offsetFor } from '../../storage/local.ts'
import { signedMs } from '../calibration.ts'
import {
  LIMIT_NOTE,
  SORT_NAMES,
  missingText,
  songCard,
  sortCards,
  versionChoice,
  type SongCard,
  type SortKey,
} from '../home-view.ts'
import { TUTORIAL_SONG_ID, type SongEntry } from '../songs.ts'
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
  const settings = ctx.settings()
  const deviceLimit = ctx.device()?.limit ?? null
  const calibration = ctx.calibration()
  const audio = calibration.audio
  const top = h(
    doc,
    'div',
    { className: 'topband' },
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
  f.body.append(h(doc, 'div', { className: 'btnrow' }, h(doc, 'span', { className: 'note', text: '並び' }), sortSel), list, panel)

  let loaded: Loaded[] = []
  let failed: Failed[] = []
  let selected: string | null = ctx.song()?.id ?? null
  let layoutPick: LayoutId | null = null
  let limitPick: ChordLimit | null = null
  let alive = true

  const songButton = (c: SongCard): HTMLElement => {
    const b = button(doc, '', () => {
      selected = c.id
      layoutPick = null
      limitPick = null
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
    const l = loaded.find((x) => x.entry.id === selected)
    panel.hidden = l === undefined
    if (l === undefined) return
    const ch = versionChoice(l.chart, settings.layout, deviceLimit, layoutPick ?? undefined)
    const layout = layoutPick !== null && ch.layouts.includes(layoutPick) ? layoutPick : ch.recommended
    const ok = (x: ChordLimit): boolean => ch.limits.some((c) => c.limit === x && c.available && c.allowed)
    const limit = limitPick !== null && ok(limitPick) ? limitPick : (ch.pick?.limit ?? null)
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
      b.disabled = !c.available || !c.allowed
      if (!c.allowed) b.title = `端末の上限 ${deviceLimit ?? DEFAULT_CHORD_LIMIT} を超える`
      else if (!c.available) b.title = 'この曲はこの版を持ちません'
      b.setAttribute('aria-pressed', String(c.limit === limit))
      lim.append(b)
    }
    const play = button(doc, 'この譜面版で遊ぶ → プレイ', () => {
      if (limit === null) return
      ctx.pickSong(l.entry, 'all', { layout, limit, fold: 'octave' })
      ctx.go('S2')
    }, 'primary')
    play.disabled = limit === null
    const note = limit === null ? '' : limit > DEFAULT_CHORD_LIMIT ? LIMIT_NOTE : '既定。'
    panel.replaceChildren(
      h(doc, 'h3', { text: `譜面版を選ぶ: ${l.card.name}` }),
      h(doc, 'div', { className: 'row' }, h(doc, 'span', { text: '配列' }), lay),
      h(doc, 'div', { className: 'row' }, h(doc, 'span', { text: '同時押し上限' }), lim, h(doc, 'span', { className: 'note', text: note })),
      ...(limit === null ? [h(doc, 'p', { className: 'note', text: missingText(layout, DEFAULT_CHORD_LIMIT, l.card.tutorial) })] : []),
      h(doc, 'div', { className: 'btnrow' }, play, h(doc, 'span', { className: 'note', text: '成績の比較は同じ譜面版の中だけ。' })),
    )
  }

  function showList(): void {
    const cards = sortCards(loaded.map((l) => l.card), sortSel.value as SortKey)
    list.replaceChildren(
      ...cards.map(songButton),
      ...failed.map((x) => h(doc, 'p', { className: 'note', text: `${x.entry.name}: ${x.why}` })),
    )
    if (cards.length === 0 && failed.length === 0) list.append(h(doc, 'p', { className: 'note', text: '曲の一覧は準備中です。' }))
    showPanel()
  }

  sortSel.addEventListener('change', showList)

  // 曲の譜面と記録を読む（読めない譜面はその曲だけ文で出す。記録が読めなければ自己ベストなし）
  void (async () => {
    const records = await booted.db.listResults().catch(() => [])
    const results = await Promise.all(
      ctx.songs.map(async (entry): Promise<Loaded | Failed> => {
        try {
          const res = await fetch(entry.url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const v = validateChart(await res.json())
          if (!v.ok) return { entry, why: '譜面が読めません' }
          const c = songCard(entry.id, v.chart, { preferred: settings.layout, deviceLimit, profile: settings.profile, records, tutorialId: TUTORIAL_SONG_ID })
          // 名前は一覧の名前（dev のフィクスチャは「試験:」付き。同梱曲は譜面の name と同じ）
          const card = { ...c, name: entry.name }
          return { entry, chart: v.chart, card }
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
