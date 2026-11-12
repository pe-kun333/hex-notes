// YouTube の規約へのリンクの行（M3 の手順 4、仮。decisions #100、m3-kickoff §7-8）。段 4 のプレイヤーの下と S6 のクレジットの群に
// 置く。門（VIDEO_FEATURE）の内で、外すのは手順 12 の PR。文と URL は手順 10 が照合する（利用規約は
// docs/planning/research/youtube-legal.md L101、Google のプライバシーポリシーは調査に無い仮の値）。同意の保存・読込前の 1 画面は
// 公開先を決める時（U-08）。

import { h } from './screens/frame.ts'

export const YOUTUBE_TERMS_URL = 'https://www.youtube.com/t/terms'
/** 仮（調査に無い。手順 10 で照合） */
export const GOOGLE_PRIVACY_URL = 'https://policies.google.com/privacy'

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
