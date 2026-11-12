// YouTube の規約へのリンクの行（M3 の手順 4、仮。decisions #100、m3-kickoff §7-8）。段 4 のプレイヤーの下と S6 のクレジットの群に
// 置く。門（VIDEO_FEATURE）の内で、外すのは手順 12 の PR。URL は M3 の手順 10 で Developer Policies の III.A.1・III.A.2 の
// 原文に当てた（2026-11-12。どちらも条の中に書かれた URL のまま。プライバシーポリシーは手順 4 の仮の値
// policies.google.com/privacy から直した。開くと同じ文書へ転送される）。同意の保存・読込前の 1 画面は公開先を決める時（U-08）。

import { h } from './screens/frame.ts'

/** III.A.1 の YouTube 利用規約 */
export const YOUTUBE_TERMS_URL = 'https://www.youtube.com/t/terms'
/** III.A.2 の Google のプライバシーポリシー（条に書かれた URL のまま） */
export const GOOGLE_PRIVACY_URL = 'http://www.google.com/policies/privacy'

/** 文の部品（リンクの前・間・後） */
export const TERMS_TEXT = {
  before: 'YouTube の動画は ',
  terms: 'YouTube 利用規約',
  middle: 'と ',
  privacy: 'Google プライバシーポリシー',
  after: 'のもとで再生されます。',
} as const

/** 1 行（リンクは新しいタブ） */
export function termsLine(doc: Document): HTMLElement {
  const link = (href: string, text: string): HTMLAnchorElement => {
    const a = h(doc, 'a', { text })
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    return a
  }
  return h(
    doc,
    'p',
    { className: 'note terms' },
    TERMS_TEXT.before,
    link(YOUTUBE_TERMS_URL, TERMS_TEXT.terms),
    TERMS_TEXT.middle,
    link(GOOGLE_PRIVACY_URL, TERMS_TEXT.privacy),
    TERMS_TEXT.after,
  )
}
