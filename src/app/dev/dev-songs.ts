// 開発時だけの曲（M3 の手順 2 で src/app/songs.ts から移した。m3-kickoff 手順 2「手直し」・§7-39）。src/main.ts の DEV 分岐が
// 動的に読むので、build の束に tests/ の道が残らない（vite dev は tests/ も配る）。
// FIXTURE_SONGS ＝ 回帰ハーネスのフィクスチャ 6 曲（M1 の手順 3。play-dev と同じ）。VIDEO_SONGS ＝ クリック譜面
// （tests/fixtures/charts/m3/click.hexnote.json。tools/clicktrack/ が作り、sync は式の値で measured 無し）の videoId を
// 差し替えた 6 行（ダミー 5 ＝ dummy-port.ts の表、見本の動画 1 ＝ 実物の口。見本の動画を置くのは聞く事 6〔§7-7〕）。

import { urlSong, type SongEntry, type UrlSong } from '../songs.ts'
import { DUMMY_VIDEOS } from './dummy-port.ts'

/** 見本の動画（IFrame Player API の説明に使われる公開動画。spikes/coep-youtube/index.html L116。m3-kickoff §5 の聞く事 6） */
export const SAMPLE_VIDEO_ID = 'M7lc1UVf-VE'

/** 手順 3 の曲: tests/fixtures/charts/m1/ の 6 曲（vite dev が配る。play-dev と同じ）。名前は譜面の name */
export const FIXTURE_SONGS: readonly UrlSong[] = [
  ['twinkle', 'きらきら星'],
  ['ode', '歓喜の歌'],
  ['scale', 'スケール走り'],
  ['chroma', '半音階ドリル'],
  ['duet', '二声（旋律＋ベース）'],
  ['canon', 'カノン進行（三和音）'],
].map(([id, name]) =>
  urlSong(`fixture:${id}`, name ?? '', `/tests/fixtures/charts/m1/${id}.hexnote.json`),
)

/** クリック譜面（M3 の手順 2。tools/clicktrack/ が作る） */
export const CLICK_URL = '/tests/fixtures/charts/m3/click.hexnote.json'

/** 譜面の JSON の sync.sources[0].videoId を差し替える（形が違えばそのまま返し、検査は songOf に任せる） */
export function withVideoId(json: unknown, videoId: string): unknown {
  if (typeof json !== 'object' || json === null) return json
  const c = json as { sync?: { sources?: unknown } }
  const sources = c.sync?.sources
  if (!Array.isArray(sources) || sources.length === 0) return json
  const [first, ...rest] = sources as unknown[]
  if (typeof first !== 'object' || first === null) return json
  return { ...c, sync: { ...c.sync, sources: [{ ...first, videoId }, ...rest] } }
}

/** クリック譜面の 6 行（ダミー 5・見本の動画 1） */
export const VIDEO_SONGS: readonly SongEntry[] = [
  ...DUMMY_VIDEOS.map((d) => [d.id, `ダミー（${d.label}）`] as const),
  [SAMPLE_VIDEO_ID, '見本の動画（実物の口）'] as const,
].map(([videoId, label]) => {
  const base = urlSong(`fixture:m3/click/${videoId}`, `クリック 100 BPM ・ ${label}`, CLICK_URL)
  return { ...base, load: async () => withVideoId(await base.load(), videoId) }
})

/** S1 に足す曲（dev だけ。「試験:」を付けて同梱曲の後ろ） */
export const DEV_SONGS: readonly SongEntry[] = [...FIXTURE_SONGS, ...VIDEO_SONGS].map((s) => ({
  ...s,
  name: `試験: ${s.name}`,
}))

/**
 * 同梱曲を n 曲に見せる複製（dev だけ。URL の ?bulk=30。M4 の手順 3「DEV で曲を 30 枚に増やした S1 と S6 のクレジット」）。
 * チュートリアル曲を除く同梱曲を巡回して、id bundled:dev-bulk/<番号>・名前「複製 番号: 曲名」で足す（中身は元の曲の URL）
 */
export function bulkSongs(bundled: readonly UrlSong[], n: number): UrlSong[] {
  const pool = bundled.filter((s) => s.id !== 'bundled:tutorial/hajime')
  const out: UrlSong[] = []
  for (let i = bundled.length; i < n && pool.length > 0; i++) {
    const s = pool[(i - bundled.length) % pool.length] as UrlSong
    out.push(urlSong(`bundled:dev-bulk/${i + 1}`, `複製 ${i + 1}: ${s.name}`, s.url))
  }
  return out
}
