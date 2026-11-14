// 共有 URL の符号化と検査（M4-02 前半、M4 の手順 4）。出どころ: docs/planning/m4-kickoff.md 手順 4・§7-3・§7-11、
// decisions #117（載せるのは譜面の本体だけ・private は載せない・上限 8,000 文字・id が中身と合わない物は断る）・#123、
// design.md §5.5 M4-02「private は URL に埋められない」・§3.2（権利印 5 種）・§3.3（id）。
//
// 形: `#c1=` ＋ base64url（deflate-raw（UTF-8 の JSON））。JSON は format・id・name・notes・pulse・source・accompaniment だけで、
// 譜面版 variants・動画の sync・写しの欄（bpm・beats・metrics・created・generator・ext）は載せない（開いた側で版を作る）。
// フラグメントはサーバーへ送られない（サーバー・公開の索引・投稿の受け口は持たない、§4）。版を上げる時は鍵（c1）を替える。
// 純関数（DOM に触れない。CompressionStream・crypto.subtle は Node とブラウザの両方にある）。

import { verifyChartId } from './hash.ts'
import { validateChart } from './validate.ts'
import type { Chart, License, Rights } from '../shared/types.ts'

/** フラグメントの鍵と版（§7-11）。版を上げる時は鍵を替える */
export const SHARE_KEY = 'c1'
export const SHARE_PREFIX = `#${SHARE_KEY}=`
/** 符号化の後（base64url の部分）の上限文字数（#117 (c)、仮） */
export const SHARE_MAX_CHARS = 8000
/** 戻した JSON の上限バイト（壊れた・細工した物で主スレッドを止めない。8,000 文字の deflate の現実的な上限より十分大きい、仮） */
export const SHARE_MAX_JSON_BYTES = 1_000_000

/** URL に載せる中身（譜面の本体だけ） */
export type SharePayload = Pick<Chart, 'format' | 'id' | 'name' | 'notes' | 'pulse' | 'source'> &
  Partial<Pick<Chart, 'accompaniment'>>

/** 載せられない・開けない訳 */
export type ShareRefusal =
  /** 権利印が private（design L286） */
  | 'private'
  /** 符号化の後で上限を超える */
  | 'too_large'
  /** 共有のフラグメントでない（#c1= で始まらない） */
  | 'not_share'
  /** 知らない版（#c2= 以降・#c9= など） */
  | 'version'
  /** base64url・deflate・JSON として読めない */
  | 'broken'
  /** 譜面の検査を通らない */
  | 'invalid'
  /** id が中身と合わない（付け直さず断る。取り込みの #53 (c) と変える、#117 (d)） */
  | 'id'

/** 断った訳の文（作る側・開く側の画面が出す。手順 5） */
export const SHARE_REFUSAL_TEXT: Readonly<Record<ShareRefusal, string>> = {
  private: '権利の印が「私的」の曲は URL にできません。',
  too_large: 'URL にするには大きすぎます。ファイルで渡してください。',
  not_share: '共有の URL ではありません。',
  version: 'この版の共有 URL は開けません（アプリを更新してください）。',
  broken: '共有の URL が壊れています（途中で切れていないか確かめてください）。',
  invalid: '共有の URL の譜面が読めません。',
  id: '共有の URL の譜面が書き換えられています（id が中身と合いません）。',
}

/** URL にできるか（権利印が private でない） */
export function canShare(chart: Pick<Chart, 'source'>): boolean {
  return chart.source.rights !== 'private'
}

/** 載せる中身（伴奏が無い・空なら欄を持たない） */
export function sharePayloadOf(chart: Chart): SharePayload {
  const p: SharePayload = {
    format: chart.format,
    id: chart.id,
    name: chart.name,
    notes: chart.notes,
    pulse: chart.pulse,
    source: chart.source,
  }
  return chart.accompaniment !== undefined && chart.accompaniment.length > 0
    ? { ...p, accompaniment: chart.accompaniment }
    : p
}

// ---------- base64url と deflate-raw ----------

/** バイト列 → base64url（= を付けない） */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url → バイト列（使えない文字・長さが合わなければ null） */
export function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function pipeBytes(bytes: Uint8Array, t: ReadableWritablePair<Uint8Array, BufferSource>, max: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(t).getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      await reader.cancel()
      return null
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
} // prettier-ignore

// ---------- 作る・開く ----------

export type EncodeResult =
  | { readonly ok: true; readonly fragment: string; readonly chars: number }
  | { readonly ok: false; readonly reason: 'private' | 'too_large'; readonly chars?: number }

/** 譜面 → フラグメント（`#c1=…`）。private と上限を超える物は断る。chars は base64url の部分の文字数 */
export async function encodeShare(chart: Chart): Promise<EncodeResult> {
  if (!canShare(chart)) return { ok: false, reason: 'private' }
  const json = new TextEncoder().encode(JSON.stringify(sharePayloadOf(chart)))
  const z = await pipeBytes(json, new CompressionStream('deflate-raw'), Number.MAX_SAFE_INTEGER)
  const body = toBase64Url(z ?? new Uint8Array())
  if (body.length > SHARE_MAX_CHARS) return { ok: false, reason: 'too_large', chars: body.length }
  return { ok: true, fragment: `${SHARE_PREFIX}${body}`, chars: body.length }
}

export type DecodeResult =
  | { readonly ok: true; readonly chart: Chart }
  | { readonly ok: false; readonly reason: ShareRefusal; readonly issues?: readonly string[] }

/** フラグメント（先頭の # は有っても無くても良い）が共有の物か。版を問わず `c<数>=` で始まれば真 */
export function isShareFragment(fragment: string): boolean {
  return /^#?c\d+=/.test(fragment)
}

const PAYLOAD_KEYS = ['format', 'id', 'name', 'notes', 'pulse', 'source', 'accompaniment'] as const

/**
 * フラグメント → 譜面。版・上限・base64url・deflate・JSON を確かめ、載せる欄だけを拾って空の sync（{sources: []}）を足し、
 * 譜面の検査（validateChart）を通す。private と id が中身と合わない物は断る（付け直さない）
 */
export async function decodeShare(fragment: string): Promise<DecodeResult> {
  const m = /^#?c(\d+)=(.*)$/s.exec(fragment)
  if (m === null) return { ok: false, reason: 'not_share' }
  if (m[1] !== SHARE_KEY.slice(1)) return { ok: false, reason: 'version' }
  const body = m[2] ?? ''
  if (body.length > SHARE_MAX_CHARS) return { ok: false, reason: 'too_large' }
  const bytes = fromBase64Url(body)
  if (bytes === null || bytes.length === 0) return { ok: false, reason: 'broken' }
  let json: Uint8Array | null
  try {
    json = await pipeBytes(bytes, new DecompressionStream('deflate-raw'), SHARE_MAX_JSON_BYTES)
  } catch {
    return { ok: false, reason: 'broken' }
  }
  if (json === null) return { ok: false, reason: 'too_large' }
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)) as unknown
  } catch {
    return { ok: false, reason: 'broken' }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { ok: false, reason: 'invalid' }
  const rec = raw as Record<string, unknown>
  const picked: Record<string, unknown> = { sync: { sources: [] } }
  for (const k of PAYLOAD_KEYS) if (k in rec) picked[k] = rec[k]
  const v = validateChart(picked)
  if (!v.ok)
    return {
      ok: false,
      reason: 'invalid',
      issues: v.issues.map((i) => `${i.path || '(全体)'}: ${i.message}`),
    }
  if (!canShare(v.chart)) return { ok: false, reason: 'private' }
  if (!(await verifyChartId(v.chart))) return { ok: false, reason: 'id' }
  return { ok: true, chart: v.chart }
}

/** 索引の 1 行（「索引型」の下地。置き場のリンクと公開の索引は持たない、§4） */
export interface ShareIndexRow {
  readonly id: string
  readonly name: string
  readonly rights: Rights
  readonly license?: License
  readonly composer?: string
  readonly origin?: string
}

export function shareIndexOf(chart: Chart): ShareIndexRow {
  const s = chart.source
  return {
    id: chart.id,
    name: chart.name,
    rights: s.rights,
    ...(s.license === undefined ? {} : { license: s.license }),
    ...(s.composer === undefined ? {} : { composer: s.composer }),
    ...(s.origin === undefined ? {} : { origin: s.origin }),
  }
}
