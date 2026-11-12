// build の sw.js の precache を読む（M1-09、M1 の手順 13）。出どころ: decisions #64・ADR 0004 の改訂（同梱曲は全部 precache、
// runtime の CacheFirst は音源だけ）、m1-kickoff 手順 13 の期待値（sw.js の precache に content/charts/**/*.json がある）。
// sw.js は workbox の generateSW が書く 1 行の JS（precacheAndRoute([{url:"…",revision:…},…])）。純関数（読むのは check-precache.ts）。
// M3 の手順 10: YouTube 系の URL・NetworkOnly の規則・束のプレイヤーの呼び出しの検査を足した（下の節）。

export interface PrecacheReport {
  /** precache の url（重ならないように並べた物） */
  readonly urls: readonly string[]
  /** 落ちている物・余計な物（空なら合格） */
  readonly problems: readonly string[]
}

/** precacheAndRoute の配列の url を順に（無ければ null） */
export function precacheUrls(sw: string): string[] | null {
  const at = sw.indexOf('precacheAndRoute(')
  if (at < 0) return null
  const end = sw.indexOf(']', at)
  if (end < 0) return null
  return [...sw.slice(at, end).matchAll(/url:"([^"]+)"/g)].map((m) => m[1] ?? '')
}

/**
 * charts は content/charts/ からの相対の譜面（rights.json を除く。tools/charts/rights.ts の listCharts）。殻（index.html）と
 * 全部の譜面が precache にあり、権利表・音源は無く、譜面の runtime の規則（cacheName charts）が無いこと
 */
export function checkPrecache(sw: string, charts: readonly string[]): PrecacheReport {
  const raw = precacheUrls(sw)
  if (raw === null) return { urls: [], problems: ['precacheAndRoute が無い'] }
  const urls = [...new Set(raw)].sort()
  const problems: string[] = []
  if (!urls.includes('index.html')) problems.push('殻の index.html が無い')
  for (const c of charts)
    if (!urls.includes(`content/charts/${c}`)) problems.push(`同梱曲 content/charts/${c} が無い`)
  for (const u of urls) {
    if (u.endsWith('rights.json')) problems.push(`権利表 ${u} は配らない`)
    if (u.startsWith('content/samples/'))
      problems.push(`音源 ${u} は runtime の cache-first（precache しない）`)
  }
  for (const u of urls)
    if (YOUTUBE_HOST.test(u)) problems.push(`YouTube 系の URL は precache しない: ${u}`)
  if (/cacheName:"charts"/.test(sw))
    problems.push('譜面の runtime の規則（cacheName charts）が残っている')
  return { urls, problems }
}

// M3 の手順 10（YouTube 規約の照合表、III.E.1.a・E.1.b: 動画を保存・キャッシュしない、オフライン再生しない）。
// design §6.1 の照合表と m3-kickoff 手順 10 の期待値 (8)・(10)。

/** YouTube 系のホスト（youtube・youtu.be・ytimg・googlevideo） */
const YOUTUBE_HOST =
  /(^|[/.])(youtube(-nocookie)?\.com|youtu\.be|ytimg\.com|googlevideo\.com)([/:?]|$)/

/** sw.js の registerRoute のうち NetworkOnly の規則の式（workbox の generateSW が書く 1 行の JS から読む） */
export function networkOnlyRoutes(sw: string): RegExp[] {
  const out: RegExp[] = []
  for (const m of sw.matchAll(
    /registerRoute\(\/((?:\\.|[^/\\\n])+)\/([a-z]*),new [\w$.]*NetworkOnly\b/g,
  ))
    out.push(new RegExp(m[1] ?? '', m[2] ?? ''))
  return out
}

/** YouTube の NetworkOnly の規則が親ページの読む iframe_api に当たるか（無ければ problem 1 件） */
export function checkYoutubeRoute(sw: string): string[] {
  return networkOnlyRoutes(sw).some((r) => r.test('https://www.youtube.com/iframe_api'))
    ? []
    : ['YouTube の NetworkOnly の規則が無い（iframe_api を SW が溜めうる）']
}

/** 製品の束で数えるプレイヤーの呼び出し（seekTo・再生レート・ミュート。decisions #11・#94・#95） */
export const BANNED_CALLS = ['seekTo', 'setPlaybackRate', '.mute('] as const

/** 束の文字列の中の BANNED_CALLS の数 */
export function bannedCalls(js: string): Record<(typeof BANNED_CALLS)[number], number> {
  const n = (w: string): number => js.split(w).length - 1
  return { seekTo: n('seekTo'), setPlaybackRate: n('setPlaybackRate'), '.mute(': n('.mute(') }
}
