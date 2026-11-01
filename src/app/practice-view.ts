// S4 練習室の中身（M2-03 後半、M2 の手順 6）。出どころ: design.md §1.3 S4（待ち方 3 択・ループ「ミス 3 回で自動ループ」
// 「ノーミス 2 周で解除」・テンポ段 7 段・自力率「62%（ラベル無しで当てた 31／50）」・S3 から入ると苦手 2 小節がループ済み）・
// §2.7、m6 S4 L395–452（ループ中の帯 L398、待ち方 L403–405、ループ L408–410、テンポ段 L413–415）・renderS4 L871–884（待ちの説明
// L875–878、テンポの文 L884）・S2 の注記 L827、m2-kickoff 手順 6・§7-7・§7-9、decisions #87・#88。
// 手直し: m6 L397「ここでの回は練習記録になり、自己ベストには入らない」→ 固定テンポ・1.0・全鍵なら通常（§2.3）。m4 の始点・
// 終点の select → 帯のクリックと「今の小節から 2 小節」。動画ありの 4 段と「この動画ではテンポを変えられません」は M3-02。
// 純関数（DOM は practice-panel.ts）。

import { KEYSET_NAMES, type KeysetId } from '../chart/keyset.ts'
import { FADE_HIDE_BELOW, fadeOf, selfRatio, type FadeState } from '../judge/self-rate.ts'
import { noteName } from '../render/canvas/cells.ts'
import type { LoopRange } from '../practice/loop.ts'
import { TEMPO_NOVIDEO } from '../practice/tempo.ts'
import type { WaitMode } from '../practice/wait.ts'
import type { LayoutId, Profile, SelfRate } from '../shared/types.ts'
import type { PracticeOptions } from './play-runner.ts'

export interface WaitChoice {
  readonly value: WaitMode
  readonly label: string
  /** 選んだときの説明（m6 L875–878） */
  readonly note: string
}

/** 待ち方 3 択（m6 L403–405）。説明の「0.3 秒巻き戻し」は全ての待ちに（decisions #80） */
export const WAIT_CHOICES: readonly WaitChoice[] = [
  { value: 'note', label: '音待ち', note: '音待ち: どのノートも自分のキーにはまる位置で止まり、正しいキーを押すと進みます。' },
  { value: 'phrase', label: 'フレーズ待ち', note: 'フレーズ待ち: 2 小節の頭で止まり、正しいキーで再開します（250 ms の空白の後）。' },
  { value: 'fixed', label: '固定テンポ', note: '固定テンポ: 止まりません。通常プレイと同じ。' },
] // prettier-ignore

export const WAIT_NAMES: Readonly<Record<WaitMode, string>> = {
  note: '音待ち',
  phrase: 'フレーズ待ち',
  fixed: '固定テンポ',
}

/** テンポ段の文字（0.5・0.6・0.75・0.9・1.0・1.1・1.25） */
export function tempoText(rate: number): string {
  return Number.isInteger(rate) ? rate.toFixed(1) : String(rate)
}

export interface TempoChoice {
  readonly rate: number
  readonly label: string
}

/** テンポ段 7 釦（動画なし、m6 L585） */
export const TEMPO_CHOICES: readonly TempoChoice[] = TEMPO_NOVIDEO.map((rate) => ({
  rate,
  label: tempoText(rate),
}))

export const TEMPO_NOTE =
  '動画なし 7 段。自動昇降は 2 小節ごとに正答率 90% 超で上げ、70% 未満で下げ。1.0 以外の回は練習記録。'
export const LOOP_NOTE =
  '帯をクリックして始点 → 終点。ミス 3 回で自動ループ（1 小節前からカウントイン）、ノーミス 2 周で解除。'

/** 練習の回か（待ち・テンポ ≠ 1.0・鍵数制限。§2.3 L114。固定・1.0・全鍵なら S4 でも通常プレイ、m6 L989） */
export function isPracticeRun(
  p: Pick<PracticeOptions, 'mode' | 'rate'>,
  keyset: KeysetId,
): boolean {
  return p.mode !== 'fixed' || p.rate !== 1 || keyset !== 'all'
}

/** S2・S4 の注記（m6 L827「この回は練習記録（音待ち・テンポ 0.75・全鍵）。」）。通常プレイなら null */
export function practiceNote(
  p: Pick<PracticeOptions, 'mode' | 'rate'>,
  keyset: KeysetId,
): string | null {
  if (!isPracticeRun(p, keyset)) return null
  const keys = keyset === 'all' ? '全鍵' : KEYSET_NAMES[keyset]
  return `この回は練習記録（${WAIT_NAMES[p.mode]}・テンポ ${tempoText(p.rate)}・${keys}）。`
}

/** ループ中の帯（m6 L398）。inherited は S3 の苦手区間を引き継いだ */
export function loopBandText(range: LoopRange | null, inherited: boolean): { title: string; detail: string } | null {
  if (range === null) return null
  const bars = range.startBar === range.endBar ? `${range.startBar} 小節` : `${range.startBar}〜${range.endBar} 小節`
  return {
    title: `${bars}をループ中`,
    detail: inherited ? '結果画面の苦手区間を引き継ぎました。ノーミス 2 周で解除します。' : 'ノーミス 2 周で解除します。',
  }
} // prettier-ignore

/** ループの状態の 1 行（周の数。区間が無ければ自動ループの説明） */
export function loopStatus(range: LoopRange | null, laps: number, autoLoop: boolean): string {
  if (range !== null) return `区間 ${range.startBar}〜${range.endBar} 小節（${laps} 周）`
  return autoLoop ? '区間なし（2 小節でミス 3 回なら自動でループ）' : '区間なし（自動ループ OFF）'
}

/** 帯の 1 小節（in ＝ 区間の中、start ＝ クリックした始点で終点を待つ、now ＝ 今の小節） */
export interface BandCell {
  readonly bar: number
  readonly in: boolean
  readonly start: boolean
  readonly now: boolean
}

/** ループの帯の目盛（1〜bars 小節） */
export function loopBand(bars: number, range: LoopRange | null, pendingStart: number | null, nowBar: number): BandCell[] {
  return Array.from({ length: bars }, (_, i) => {
    const bar = i + 1
    return {
      bar,
      in: range !== null && bar >= range.startBar && bar <= range.endBar,
      start: pendingStart === bar,
      now: bar === nowBar,
    }
  })
} // prettier-ignore

/**
 * 帯のクリック（始点 → 終点）。1 回目は始点を持って null、2 回目で区間（逆順なら入れ替え、同じ小節なら 1 小節）。
 * 返す pending は次のクリックで使う始点
 */
export function bandClick(pendingStart: number | null, bar: number): { pending: number | null; range: LoopRange | null } {
  if (pendingStart === null) return { pending: bar, range: null }
  return { pending: null, range: { startBar: Math.min(pendingStart, bar), endBar: Math.max(pendingStart, bar) } }
} // prettier-ignore

/** 「今の小節から 2 小節」（最後の小節を越えるなら最後の 2 小節） */
export function rangeFrom(nowBar: number, bars: number): LoopRange {
  const startBar = Math.max(1, Math.min(nowBar, bars - 1))
  return { startBar, endBar: Math.min(bars, startBar + 1) }
}

/** 自力率の 1 行（§1.3 S4「62%（ラベル無しで当てた 31／50）」）。まだ判定が無ければ「—」 */
export function selfLine(s: SelfRate): string {
  const r = selfRatio(s)
  if (r === null) return '—（まだ判定がありません）'
  const n = s.solo + s.hinted + s.near + s.miss
  return `${Math.round(r * 100)}%（ラベル無しで当てた ${s.solo}／${n}）`
}

/** 終わった回の苦手 2 小節 → ループ区間（miss が無ければ null。S3 から入ると苦手 2 小節がループ済み、§1.3 S4） */
export function weakRange(
  weak: { readonly from: number; readonly to: number } | null,
): LoopRange | null {
  return weak === null ? null : { startBar: weak.from, endBar: weak.to }
}

/** S4 の鍵数制限の 3 択（m6 L427–430。d ＝ 1 音は S0d だけ、m2-kickoff §7-22） */
export const KEYSET_CHOICES: readonly { readonly value: KeysetId; readonly label: string }[] = [
  { value: 'dfjk', label: 'D F J K' },
  { value: '8', label: '8 鍵' },
  { value: 'all', label: '全部' },
]

export const KEYSET_NOTE =
  '譜面版は増やさず、実行時に絞ります。制限中の回は練習記録。替えられるのは回を始める前だけ。'

/** 鍵数制限の箱を出すか（入門者だけ。音ゲー向けは箱ごと隠し全鍵、m6 L888） */
export function keysetShown(profile: Profile): boolean {
  return profile === 'beginner'
}

/** VMPK 型の注記（集合は Ableton 型の刻印の code なので、VMPK 型では残る音高が変わる。仮） */
export function keysetLayoutNote(layout: LayoutId): string | null {
  return layout === 'vmpk'
    ? 'VMPK 型では同じキーでも鳴る音が Ableton 型と違います（鍵の位置で絞ります）。'
    : null
}

/** S3 の「練習室で弾く」の文（苦手区間があればその 2 小節をループに。m6 L387） */
export function practiceEntryText(weak: LoopRange | null): string {
  return weak === null
    ? '練習室で弾く'
    : `練習室で弾く（${weak.startBar}〜${weak.endBar} 小節をループ）`
}

// ---------- 足場外し（M2-04、M2 の手順 8） ----------

/**
 * ラベルのマスの 1 側の値（m6 renderS4 L885–887・m4 L158–173 は キー文字・音名・なし の 3×3 ＝ 9 マス。入門者の既定の
 * ノート側「両方」と S6 の 4 値を表せるよう「両方」を足して 4×4 にした、decisions #90）
 */
export const LABEL_SIDE_CHOICES: readonly { readonly value: 'key' | 'note' | 'both' | 'none'; readonly label: string }[] = [
  { value: 'key', label: 'キー文字' },
  { value: 'note', label: '音名' },
  { value: 'both', label: '両方' },
  { value: 'none', label: 'なし' },
] // prettier-ignore

export const FADE_NOTE =
  '当てた −0.12、外した ＋0.30、NEAR は不変。0.2 未満でラベル無し（鍵盤側も）。'

/** 手動の透明度の段（0〜100% を 5% 刻み、§7-13） */
export const MANUAL_STEP = 0.05

/** 手動の値を 5% 刻みに丸める（0..1） */
export function manualValue(pct: number): number {
  const x = Math.round(Math.min(100, Math.max(0, pct)) / 5) * 5
  return x / 100
}

export interface FadeBar {
  readonly midi: number
  readonly name: string
  /** α の百分率（四捨五入） */
  readonly pct: number
  /** 0.2 未満（ラベル無し。m4 renderFade の緑） */
  readonly hidden: boolean
}

/** 音高ごとの透明度の棒（その曲の音高の昇順。m4 renderFade L593–597） */
export function fadeBars(fade: FadeState, pitches: readonly number[]): FadeBar[] {
  return [...new Set(pitches)]
    .sort((a, b) => a - b)
    .map((midi) => {
      const a = fadeOf(fade, midi)
      return { midi, name: noteName(midi), pct: Math.round(a * 100), hidden: a < FADE_HIDE_BELOW }
    })
}

/** 自力率の 4 区分の 1 行（m4 L174–184 の区分） */
export function selfPartsText(s: SelfRate): string {
  return `ラベル無しで当てた ${s.solo}・ヒント付き ${s.hinted}・NEAR ${s.near}・外した ${s.miss}`
}
