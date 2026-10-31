// S1 ホームの骨組み（M1 の手順 2。曲一覧と譜面版の選択は手順 8、M1-08。手順 3 で曲を選んで S2 へ入る口だけ足した）。出どころ: design.md §1.3 S1（上帯: プロファイル
// 〔M1 では隠す〕・端末の上限・校正の有無）、m6 S1 L298–307（上帯）、m1-kickoff 手順 8 の手直し（device が無ければ
// 「未診断（2）」）。開発ページへの導線は dev のときだけ（src/main.ts が渡す）。

import { DEFAULT_CHORD_LIMIT } from '../../shared/types.ts'
import { offsetFor } from '../../storage/local.ts'
import { signedMs } from '../calibration.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { button, frame, h } from './frame.ts'

/** 上帯の端末の上限（診断が無ければ既定の 2 で「未診断」） */
export function limitText(limit: number | null): string {
  return limit === null ? `未診断（${DEFAULT_CHORD_LIMIT}）` : `${limit}（同時押しテスト済み）`
}

/** 上帯の校正（自前音源のオフセット。未校正は印だけ） */
export function calibText(offsetMs: number | null): string {
  if (offsetMs === null) return '未校正'
  return `校正済み（${signedMs(offsetMs)}）`
}

export function homeScreen(ctx: ScreenContext): ScreenView {
  const { doc, booted } = ctx
  const f = frame(ctx, 'ホーム', { gear: true })
  const calibration = ctx.calibration()
  const audio = calibration.audio
  const top = h(
    doc,
    'div',
    { className: 'topband' },
    h(
      doc,
      'span',
      {},
      '端末の上限 ',
      h(doc, 'b', { text: limitText(booted.device?.limit ?? null) }),
    ),
    h(
      doc,
      'span',
      {},
      h(doc, 'b', {
        text: calibText(audio === undefined ? null : offsetFor(calibration, 'audio')),
      }),
    ),
  )
  f.root.insertBefore(top, f.bandSlot)
  // 曲の一覧（同梱曲、dev はフィクスチャも。曲カード・譜面版・難度・並びは手順 8）
  if (ctx.songs.length === 0)
    f.body.append(h(doc, 'p', { className: 'note', text: '曲の一覧は準備中です。' }))
  else
    f.body.append(
      h(
        doc,
        'div',
        { className: 'btnrow songs' },
        ...ctx.songs.map((s) =>
          button(doc, s.name, () => {
            ctx.pickSong(s)
            ctx.go('S2')
          }),
        ),
      ),
    )
  if (ctx.devPages.length > 0)
    f.body.append(
      h(
        doc,
        'details',
        { className: 'dev' },
        h(doc, 'summary', { text: '開発ページ' }),
        h(
          doc,
          'ul',
          {},
          ...ctx.devPages.map((p) => {
            const a = h(doc, 'a', { text: p.label })
            a.href = p.href
            return h(doc, 'li', {}, a)
          }),
        ),
      ),
    )
  return { root: f.root, bandSlot: f.bandSlot, unmount: () => {} }
}
