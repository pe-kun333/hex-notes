// 動画 ID の取り出し（M3 の手順 1、仮。m3-kickoff §7-10）。11 文字の ID か、YouTube の URL から ID を取る。
// 持ち込み（S5 の段 4、手順 4）と開発ページが使う。validate.ts の検査（空でない文字列）は締めない。DOM に触れない。

const ID = /^[A-Za-z0-9_-]{11}$/

/** 受ける host（www・m・music・素の youtube.com・youtu.be・nocookie） */
const HOSTS: ReadonlySet<string> = new Set([
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
])

/** パスの形（/embed/ID・/shorts/ID・/live/ID） */
const PATH = /^\/(?:embed|shorts|live)\/([^/]+)/

/**
 * 前後の空白を除いて 11 文字の ID ならそのまま。URL なら https・http で、上の host の watch?v=・/embed/・/shorts/・
 * /live/・youtu.be/ から取る（`://` が無ければ https:// を補う）。他は null。
 */
export function videoIdOf(text: string): string | null {
  const s = text.trim()
  if (s === '') return null
  if (ID.test(s)) return s
  let url: URL
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!HOSTS.has(url.hostname)) return null
  let cand: string | null
  if (url.hostname === 'youtu.be') cand = url.pathname.slice(1).split('/')[0] ?? null
  else if (url.pathname === '/watch') cand = url.searchParams.get('v')
  else cand = PATH.exec(url.pathname)?.[1] ?? null
  return cand !== null && ID.test(cand) ? cand : null
}
