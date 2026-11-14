import { describe, expect, it } from 'vitest'
import {
  EMBED_TITLES,
  embedFailPlan,
  embedView,
  syncFailText,
  type EmbedFailEvent,
} from '../../../src/app/embed-view.ts'
import { useVideoDefault } from '../../../src/app/home-view.ts'
import { rowBrief } from '../../../src/app/telemetry-view.ts'
import { createDummyVideo, type DummyVideoOptions } from '../../../src/clock/dummy-video.ts'
import { initialSession, sessionTick } from '../../../src/play/session.ts'
import { isTargetPlay } from '../../../src/results/awards.ts'
import type { SyncSource } from '../../../src/shared/types.ts'
import { memoryStorage, safeStorage } from '../../../src/storage/fallback.ts'
import type { Backup } from '../../../src/storage/file.ts'
import {
  LOCAL_KEYS,
  NOEMBED_MAX,
  NOEMBED_TTL_MS,
  datedNoEmbed,
  loadNoEmbed,
  markNoEmbed,
  noEmbedExpiry,
  noEmbedIds,
  parseNoEmbed,
  readJson,
  saveNoEmbed,
  unmarkNoEmbed,
} from '../../../src/storage/local.ts'
import { embedErrorRow } from '../../../src/telemetry/rows.ts'
import { errorGroupOf } from '../../../src/youtube/errors.ts'

// S7a と埋め込み不可の記録（M3 の手順 5、M3-05 前半、仮）。出どころ: m3-kickoff 手順 5 の期待値 (1)〜(12)（2026-11-11・12 に
// 実物と原型で検算した値）・§7-26・§7-27・§7-32・§7-38、m6 S7a L938・L976、design §1.3 S7 L89・§4.4 L194・§4.6 L202。
// A ＝ 見本の M7lc1UVf-VE、B ＝ 形だけ正しい abcdefghijk（どちらも純関数の入力）。

const A = 'M7lc1UVf-VE'
const B = 'abcdefghijk'
const AT = '2026-11-12T00:00:00.000Z'
const err = (code: number): EmbedFailEvent => ({
  kind: 'error',
  code,
  group: errorGroupOf(code),
  at: 0,
})
const kv = () =>
  safeStorage(
    'local',
    () => memoryStorage(),
    () => {},
  )

describe('S7a の表（期待値 (1)）', () => {
  it('組ごとの見出しと「（コード n）」。印を残すのは 100・101・150 だけ', () => {
    expect(embedView(err(2)).title).toBe(`${EMBED_TITLES.badId}（コード 2）`)
    for (const c of [5, 153, 999]) expect(embedView(err(c))).toMatchObject({ title: `${EMBED_TITLES.env}（コード ${c}）`, mark: false, code: c })
    expect(embedView(err(100))).toMatchObject({ title: `${EMBED_TITLES.gone}（コード 100）`, mark: true })
    for (const c of [101, 150]) expect(embedView(err(c))).toMatchObject({ title: `${EMBED_TITLES.noEmbed}（コード ${c}）`, mark: true })
    expect(embedView({ kind: 'loadFail', code: -1, at: 0 })).toMatchObject({ title: `${EMBED_TITLES.load}（コード -1）`, mark: false, code: -1 })
    expect(embedView({ kind: 'noResponse', code: -2, at: 0 })).toMatchObject({ title: `${EMBED_TITLES.load}（コード -2）`, mark: false, code: -2 })
    expect(EMBED_TITLES).toEqual({
      badId: '動画 ID を確かめてください',
      gone: '動画が見つかりません（削除か非公開）',
      noEmbed: 'この動画は埋め込みで再生できません',
      env: 'このブラウザでは動画を読めませんでした',
      load: '動画を読み込めませんでした',
    })
  }) // prettier-ignore

  it('数でない値（NaN）は「このブラウザでは…」で番号を出さず、行の code は null。153 の本文は Referer と拡張機能に触れる', () => {
    expect(embedView(err(Number.NaN))).toEqual(expect.objectContaining({ title: EMBED_TITLES.env, code: null, mark: false }))
    expect(embedView(err(153)).body).toMatch(/Referer.*拡張機能/)
    expect(embedView(err(150)).body).toContain('この曲は「動画なし」を既定にします。')
    expect(embedView(err(5)).body).not.toContain('既定にします')
  }) // prettier-ignore
})

describe('埋め込み不可の一覧 hexnote.noembed（期待値 (2)〜(6)。門を外す PR で v:2〔日付つき・30 日〕、decisions #114）', () => {
  const NOW = Date.parse(AT)
  const DAY = 24 * 60 * 60 * 1000
  const iso = (ms: number): string => new Date(ms).toISOString()

  it('(2) 読み: 鍵が無い・壊れた JSON・v 1（日付が無い）→ 空。重複・形の違う ID・日付の無い物・数は捨てる', () => {
    const s = kv()
    expect(loadNoEmbed(s, NOW)).toEqual([])
    s.set(LOCAL_KEYS.noembed, '{broken')
    expect(loadNoEmbed(s, NOW)).toEqual([])
    expect(parseNoEmbed({ v: 1, ids: [A, B] }, NOW)).toEqual([])
    const raw = { v: 2, marks: [{ id: A, at: AT }, { id: A, at: AT }, { id: 'bad id', at: AT }, { id: B }, 5, { id: 'M7lc1UVf-V', at: AT }, { id: B, at: 'yesterday' }, { id: B, at: AT }] }
    expect(parseNoEmbed(raw, NOW)).toEqual([{ id: A, at: AT }, { id: B, at: AT }])
  }) // prettier-ignore

  it('(3) 足す・保存: 空に A → {"v":2,"marks":[{"id":"M7lc1UVf-VE","at":"2026-11-12T00:00:00.000Z"}]}、もう一度 A → 同じ配列、short は足さない', () => {
    const s = kv()
    const one = markNoEmbed([], A)
    expect(one).toEqual([A])
    saveNoEmbed(s, datedNoEmbed([], one, AT), NOW)
    expect(s.get(LOCAL_KEYS.noembed)).toBe('{"v":2,"marks":[{"id":"M7lc1UVf-VE","at":"2026-11-12T00:00:00.000Z"}]}')
    expect(loadNoEmbed(s, NOW)).toEqual([{ id: A, at: AT }])
    expect(markNoEmbed(one, A)).toBe(one)
    expect(markNoEmbed(one, 'short')).toBe(one)
  }) // prettier-ignore

  it('30 日: 付けてから 30 日 − 1 ms は残り、ちょうど 30 日で消える。30 日以上先の日付も消える。前からある ID は付けた日のまま', () => {
    const m = [{ id: A, at: AT }]
    expect(NOEMBED_TTL_MS).toBe(2_592_000_000)
    expect(parseNoEmbed({ v: 2, marks: m }, NOW + 30 * DAY - 1)).toEqual(m)
    expect(parseNoEmbed({ v: 2, marks: m }, NOW + 30 * DAY)).toEqual([])
    expect(parseNoEmbed({ v: 2, marks: [{ id: A, at: iso(NOW + 30 * DAY) }] }, NOW)).toEqual([])
    expect(parseNoEmbed({ v: 2, marks: [{ id: A, at: iso(NOW + 29 * DAY) }] }, NOW)).toHaveLength(1)
    const later = iso(NOW + 10 * DAY)
    const two = datedNoEmbed(m, [A, B], later)
    expect(two).toEqual([{ id: A, at: AT }, { id: B, at: later }])
    expect(noEmbedIds(two)).toEqual([A, B])
    expect([noEmbedExpiry([]), noEmbedExpiry(two)]).toEqual([Infinity, NOW + 30 * DAY])
    // A の 30 日の後は B だけ残る（S1 の既定は A の曲で はい に戻り、まだ埋め込めなければ S7a でまた印が付く）
    expect(noEmbedIds(parseNoEmbed({ v: 2, marks: two }, NOW + 30 * DAY))).toEqual([B])
  }) // prettier-ignore

  it('(4) 外す: [A, B] から A → [B]、無い ID → 同じ配列', () => {
    const ab = [A, B]
    expect(unmarkNoEmbed(ab, A)).toEqual([B])
    expect(unmarkNoEmbed(ab, 'zzzzzzzzzzz')).toBe(ab)
  })

  it('(5) 上限: 200 件に 1 件足すと 200 件のまま先頭が落ちる', () => {
    const full = Array.from({ length: NOEMBED_MAX }, (_, i) => `id${String(i).padStart(9, '0')}`)
    expect(NOEMBED_MAX).toBe(200)
    const next = markNoEmbed(full, B)
    expect(next).toHaveLength(200)
    expect([next[0], next[199]]).toEqual([full[1], B])
  })

  it('(6) 既定（sync は A）: 一覧が空 → はい、[A] → いいえ、[B] → はい', () => {
    const src: SyncSource = { kind: 'youtube', videoId: A, offset: 3, rate: 1 }
    expect([useVideoDefault(src, []), useVideoDefault(src, [A]), useVideoDefault(src, [B])]).toEqual([true, false, true])
  }) // prettier-ignore
})

describe('embedError 行と手（期待値 (7)〜(10)）', () => {
  it('(7) embedErrorRow(150) → {kind embedError, at, code 150}（動画 ID 無し）、要約「エラー 150」、応答なしは「エラー -2」', () => {
    const row = embedErrorRow(150, AT)
    expect(row).toEqual({ kind: 'embedError', at: AT, code: 150 })
    expect(rowBrief(row)).toBe('エラー 150')
    expect(rowBrief(embedErrorRow(-2, AT))).toBe('エラー -2')
  })

  it('(8) embedFailPlan（ID は B・一覧は空）: 150 → 行 1・一覧 [B]、同じ iframe の 2 回目 → 行なし、応答なし → code −2 の行・一覧は空、5・999 → その code の行・一覧は空、NaN → 行なし・一覧は空', () => {
    expect(embedFailPlan(err(150), B, [], false, AT)).toMatchObject({ row: { kind: 'embedError', code: 150 }, list: [B] })
    expect(embedFailPlan(err(150), B, [], true, AT).row).toBe(null)
    expect(embedFailPlan({ kind: 'noResponse', code: -2, at: 0 }, B, [], false, AT)).toMatchObject({ row: { code: -2 }, list: [] })
    for (const c of [5, 999]) expect(embedFailPlan(err(c), B, [], false, AT)).toMatchObject({ row: { code: c }, list: [] })
    const nan = embedFailPlan(err(Number.NaN), B, [], false, AT)
    expect([nan.row, nan.list, nan.view.title]).toEqual([null, [], EMBED_TITLES.env])
  }) // prettier-ignore

  it('(9) 段 4: onError 150 →「この動画は埋め込みで再生できません（コード 150）。動画なしで保存できます。」', () => {
    expect(syncFailText(embedView(err(150)))).toBe('この動画は埋め込みで再生できません（コード 150）。動画なしで保存できます。')
  }) // prettier-ignore

  it('(10) isTargetPlay: audio → 真、youtube → 偽（「ピアノ音で遊ぶ」の回は audio で対象プレイ）', () => {
    expect(isTargetPlay({ syncUsed: { kind: 'audio' } })).toBe(true)
    expect(isTargetPlay({ syncUsed: { kind: 'youtube', videoId: A } })).toBe(false)
  })
})

describe('控えと初期化（期待値 (11)）', () => {
  it('Backup の欄に noembed が無い。鍵を remove した後は get が null・readJson が undefined・一覧は空', () => {
    const keys: (keyof Backup)[] = ['format', 'exportedAt', 'settings', 'fade', 'charts', 'results', 'daily']
    // M4 の手順 6 でデイリーの達成 daily を足した（noembed は今も無い）
    const b: Record<keyof Backup, unknown> = { format: 0, exportedAt: 0, settings: 0, fade: 0, charts: 0, results: 0, daily: 0 }
    expect(Object.keys(b)).toEqual(keys)
    const s = kv()
    const now = Date.parse(AT)
    saveNoEmbed(s, datedNoEmbed([], [A], AT), now)
    s.remove(LOCAL_KEYS.noembed)
    expect([s.get(LOCAL_KEYS.noembed), readJson(s, LOCAL_KEYS.noembed), loadNoEmbed(s, now)]).toEqual([null, undefined, []])
  }) // prettier-ignore
})

describe('再生中の失敗の後の state と、標本を渡さない門（期待値 (12)、§7-32）', () => {
  const F = 1000 / 60
  /** ダミー動画を 0 で再生し、i × F の tick で回す。i 300（5,000 ms）の tick の sample の前に change。pass 偽なら 5,000 から標本を渡さない */
  function runOn(change: (d: ReturnType<typeof createDummyVideo>, now: number) => void, opts: { pass?: boolean; dummy?: DummyVideoOptions; until?: number } = {}) {
    const d = createDummyVideo({ stepMs: 15, seed: 7, ...(opts.dummy ?? {}) })
    let s = initialSession({ mode: 'video', t0: 0 })
    d.play(0)
    const log: string[] = []
    let requests = 0
    for (let i = 1; i <= (opts.until ?? 480); i++) {
      const now = i * F
      if (i === 300) change(d, now)
      const smp = opts.pass === false && i >= 300 ? null : d.sample(now)
      const st = sessionTick(s, now, smp)
      s = st.session
      for (const e of st.out.events) if (e.kind === 'stall' || e.kind === 'novideo' || e.kind === 'adSuspected') log.push(`${(Math.round(now * 10) / 10).toFixed(1)} ${e.kind}`)
      for (const q of st.video) {
        requests++
        log.push(`${(Math.round(now * 10) / 10).toFixed(1)} ${q.kind}${q.kind === 'pauseVideo' ? `(${q.why})` : ''}`)
        if (q.kind === 'pauseVideo') d.pauseVideo(now)
      }
      if (i === 300) log.push(`5000 ${s.play.phase}`)
    }
    return { log, phase: s.play.phase, source: s.play.source, requests }
  } // prettier-ignore

  it('渡し続ける: unstarted・cued・buffering → 5,000 に同期中、paused → 一時停止、ended → 終了', () => {
    for (const st of ['unstarted', 'cued', 'buffering'] as const) expect(runOn((d, now) => d.setState(st, now)).log[0]).toBe('5000 syncing')
    expect(runOn((d, now) => d.setState('paused', now)).log[0]).toBe('5000 paused')
    expect(runOn((d, now) => d.setState('ended', now)).log[0]).toBe('5000 ended')
  }) // prettier-ignore

  it('渡し続ける・凍結した PLAYING: 6,983.3 に stall と pauseVideo(stall)。pause の遅れ 0 ms なら 7,000 に novideo、効かなければ 7,483.3 に adSuspected', () => {
    const freeze = (d: ReturnType<typeof createDummyVideo>, now: number) => d.stuck(1e9, now)
    const r0 = runOn(freeze)
    expect(r0.log.slice(1, 4)).toEqual(['6983.3 stall', '6983.3 pauseVideo(stall)', '7000.0 novideo'])
    expect(r0.source).toBe('novideo')
    const rn = runOn(freeze, { dummy: { pauseLatencyMs: 'never' } })
    expect(rn.log.slice(1, 4)).toEqual(['6983.3 stall', '6983.3 pauseVideo(stall)', '7483.3 adSuspected'])
  }) // prettier-ignore

  it('渡さない: どの state でも相は再生のまま進まず要求 0（ENDED が続いても終わらない ＝ results 0 件）', () => {
    for (const change of [(d: ReturnType<typeof createDummyVideo>, now: number) => d.setState('ended', now), (d: ReturnType<typeof createDummyVideo>, now: number) => d.setState('paused', now), (d: ReturnType<typeof createDummyVideo>, now: number) => d.stuck(1e9, now)]) {
      const r = runOn(change, { pass: false })
      expect([r.phase, r.requests, r.log]).toEqual(['playing', 0, ['5000 playing']])
    }
  }) // prettier-ignore
})
