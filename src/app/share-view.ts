// 共有 URL を作る・開く画面の中身（M4-02 後半、M4 の手順 5）。出どころ: docs/planning/m4-kickoff.md 手順 5・§7-14・§7-17、
// decisions #117 (d)（確認を必ず挟み、曲名と権利印は申告と書く。同じ id は上書きしない。同梱曲と同じ id は保存せずその曲を開く）・
// #123・#124。純関数（DOM は shell.ts の覆いと screens/settings.ts の行）。

import { SHARE_REFUSAL_TEXT, type ShareRefusal } from '../chart/share.ts'
import type { Chart } from '../shared/types.ts'

/** 開いた曲の行き先: 新しく保存 ／ 同じ id の持ち込み曲が既にある（上書きしない）／ 同梱曲と同じ id（保存しない） */
export type ShareOpenKind = 'new' | 'exists' | 'bundled'

export function shareOpenKind(
  id: string,
  bundledIds: readonly string[],
  existing: boolean,
): ShareOpenKind {
  if (bundledIds.includes(id)) return 'bundled'
  return existing ? 'exists' : 'new'
}

/** 権利の印の言葉（S1 の曲カード・S6 のクレジットと同じ。private は開く側には来ない） */
const RIGHTS_TEXT: Readonly<Record<string, string>> = {
  pd: 'PD（パブリックドメイン）',
  own: '自作',
  cc0: 'CC0',
  'cc-by': 'CC BY',
  private: '私的',
}

/** 確認の覆いの見出し */
export const SHARE_CONFIRM_TITLE = '共有された曲を開きます'

/** 確認の覆いの注記（#117 (d)） */
export const SHARE_CONFIRM_NOTE =
  '曲名と権利の印は、URL を作った人の申告です（このアプリは確かめられません）。保存すると持ち込み曲としてこの端末だけに残ります。'

/** 確認の覆いの行（見出しと値） */
export function shareConfirmRows(c: Chart): [string, string][] {
  const s = c.source
  const license = s.license === undefined ? '' : `、${s.license.id} ${s.license.holder}`
  const from = [s.composer, s.arranger === undefined ? undefined : `編曲 ${s.arranger}`, s.origin]
    .filter((x): x is string => x !== undefined && x !== '')
    .join(' ・ ')
  return [
    ['曲名', c.name],
    ['権利の印', `${RIGHTS_TEXT[s.rights] ?? s.rights}${license}`],
    ['出どころ', from === '' ? '—' : from],
    ['音の数', `${c.notes.length} 音${(c.accompaniment?.length ?? 0) > 0 ? `（伴奏 ${c.accompaniment?.length ?? 0} 音）` : ''}`],
  ]
} // prettier-ignore

/** 確認の釦 */
export const SHARE_OPEN_LABEL = 'この端末に保存して開く'
export const SHARE_CANCEL_LABEL = 'やめる'

/** 開いた後の帯の題と文（帯 share） */
export function shareOpenedBand(kind: ShareOpenKind, name: string): { title: string; detail: string } {
  if (kind === 'bundled')
    return { title: '同梱曲です', detail: `「${name}」は同梱曲と同じ曲なので保存せず、その曲を開きました。` }
  if (kind === 'exists')
    return { title: '既にあります', detail: `「${name}」は持ち込み曲に既にあるので上書きせず、その曲を開きました。` }
  return { title: '共有された曲を保存しました', detail: `「${name}」を持ち込み曲に保存して開きました（S6 で削除できます）。` }
} // prettier-ignore

/** 開けなかった時の帯の題と文 */
export function shareRefusedBand(reason: ShareRefusal): { title: string; detail: string } {
  return { title: '共有の URL を開けませんでした', detail: SHARE_REFUSAL_TEXT[reason] }
}

/** 保存できなかった時の帯（IndexedDB が使えない等） */
export const SHARE_SAVE_FAILED = {
  title: '共有の URL を開けませんでした',
  detail: 'この端末に保存できませんでした。',
} as const

// ---------- S6 の「共有 URL を写す」 ----------

export const SHARE_COPY_LABEL = '共有 URL を写す'

/** private の行に出す訳（釦の代わり） */
export const SHARE_PRIVATE_NOTE = '（私的な曲は URL にできません）'

/** 写した後の文 */
export function shareCopiedText(name: string, chars: number, copied: boolean): string {
  return copied
    ? `「${name}」の共有 URL を写しました（${chars} 文字）。曲名と権利の印は、開いた人には申告として見えます。`
    : `「${name}」の共有 URL です。写せなかったので、下の欄から写してください。`
}

/** 共有 URL（今のページの場所 ＋ フラグメント。クエリは付けない） */
export function shareUrlOf(origin: string, pathname: string, fragment: string): string {
  return `${origin}${pathname}${fragment}`
}
