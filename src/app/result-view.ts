// S3 結果の文言（M1-06、M1 の手順 5）。出どころ: m6 renderS3 L833–869（見出し・曲の行・内訳の表・完走の行）・
// selfRateHtml L612–617（自力率の 4 区分と長い凡例）・S3 L374（和音）・L383（ずれ）・L386（苦手区間）、design.md §1.3 S3
// （比較は同じ譜面版の中だけ）・§4.4（完走、decisions #63 の「中断あり」）、decisions #31 (e)（内訳の言葉 ぴったり／よい／
// おしい／となり／はずれ）・#62・#67（ずれの言葉）、m1-kickoff 手順 5（完了条件「同じ譜面版だけで比較する旨が画面にある」、
// 譜面版 id を見出しに出す）。音ゲー向けの節（ランク以外の点・ゲージ・コンボ・FAST／SLOW）は M2-05、「練習室で弾く」は
// M2-03、称号は手順 11。鍵数制限の回（手順 7）は「練習の結果」（m6 L837）。純関数（DOM は screens/result.ts）。

import { KEYSET_NAMES, type KeysetId } from '../chart/keyset.ts'
import { LAYOUTS } from '../layout/presets.ts'
import { JUDGE_WORDS } from '../render/canvas/feedback.ts'
import type { Awards } from '../results/awards.ts'
import { isFinished } from '../results/record.ts'
import type { LayoutId, PlayMode, Profile, ResultRecord, SelfRate } from '../shared/types.ts'
import { leanWord, signedMs } from './calibration.ts'
import { accuracyText } from './hud.ts'
import type { FinishedPlay } from './play-runner.ts'

const PROFILE_NAMES: Readonly<Record<Profile, string>> = { beginner: '入門者', gamer: '音ゲー向け' }

/** 自力率の区分（m6 selfRateHtml の長い凡例。入門者の 4 区分） */
export const SELF_LABELS: Readonly<Record<keyof SelfRate, string>> = {
  solo: 'ラベル無しで当てた',
  hinted: 'ヒント付き',
  near: 'となり（NEAR）',
  miss: '外した',
}
const SELF_ORDER: readonly (keyof SelfRate)[] = ['solo', 'hinted', 'near', 'miss']

export interface SelfPart {
  readonly key: keyof SelfRate
  /** 0–100（整数に丸めた %。帯の幅と凡例） */
  readonly pct: number
  readonly label: string
}

export interface ResultView {
  readonly title: string
  /** 比較の範囲（完了条件。譜面版 id を入れる） */
  readonly scope: string
  readonly song: string
  readonly accuracy: string
  readonly rank: string
  readonly rows: readonly (readonly [string, string])[]
  /** 自力率の帯（数えた音が無ければ空） */
  readonly self: readonly SelfPart[]
  readonly chord: string | null
  readonly lean: string | null
  readonly weak: string | null
}

/** 譜面版 id（layout/limit/fold）→ 「Ableton 型／上限 2」 */
export function variantText(variantId: string): string {
  const [layout, limit] = variantId.split('/')
  const name = layout !== undefined && layout in LAYOUTS ? LAYOUTS[layout as LayoutId].name : layout
  return `${name ?? '?'}／上限 ${limit ?? '?'}`
}

/** 自力率の区分の割合（4 区分の和を分母にする。0 なら空） */
export function selfParts(s: SelfRate): SelfPart[] {
  const total = s.solo + s.hinted + s.near + s.miss
  if (total === 0) return []
  return SELF_ORDER.map((key) => {
    const pct = Math.round((s[key] / total) * 100)
    return { key, pct, label: `${SELF_LABELS[key]} ${pct}%` }
  })
}

/** 待ち方の言葉（S4 の待ち方の箱と同じ。§1.3 S4） */
const MODE_NAMES: Readonly<Record<PlayMode, string>> = {
  fixed: '固定テンポ',
  note: '音待ち',
  phrase: 'フレーズ待ち',
}

/** 練習の条件（「音待ち・0.75 倍・全鍵」。ループした回は「・ループ」。m2-kickoff 手順 5） */
export function conditionText(r: Pick<ResultRecord, 'mode' | 'rate' | 'keyset' | 'looped'>): string {
  const keys = r.keyset === 'all' ? '全鍵' : (KEYSET_NAMES[r.keyset as KeysetId] ?? r.keyset)
  return `${MODE_NAMES[r.mode]}・${Number.isInteger(r.rate) ? r.rate.toFixed(1) : String(r.rate)} 倍・${keys}${r.looped === true ? '・ループ' : ''}`
} // prettier-ignore

export function resultView(p: FinishedPlay): ResultView {
  const r = p.record
  const c = r.counts
  const w = JUDGE_WORDS
  const finished = isFinished(r)
  const rows: [string, string][] = [
    [`${w.perfect}／${w.great}／${w.good}`, `${c.perfect} ／ ${c.great} ／ ${c.good}`],
    [`${w.near}（隣のキー）`, String(c.near)],
    [w.miss, String(c.miss)],
  ]
  if (r.skipped > 0) rows.push(['判定なし（再開の猶予の中）', String(r.skipped)])
  // 練習記録（鍵数制限・待ち・テンポ≠1.0・ループ。M2 の手順 5）は条件と残すものを出す（m6 renderS3 L846–847）
  const practice = r.keyset !== 'all' || r.mode !== 'fixed' || r.rate !== 1 || r.looped === true
  if (practice)
    rows.push(
      ['条件', conditionText(r)],
      ['残すもの', '精度%と自力率だけ（自己ベスト・完走・オフセット提案の対象外）'],
    )
  else
    rows.push([
      '完走',
      finished
        ? 'はい（固定テンポ・1.0 倍・全鍵）'
        : r.skipped > 0
          ? 'いいえ（中断あり。自己ベストと完走の対象外）'
          : 'いいえ（練習の条件。自己ベストと完走の対象外）',
    ])
  const j = p.judge
  const ch = p.chords
  const accuracy = accuracyText(j)
  return {
    title: practice ? '練習の結果' : '結果',
    scope: `成績の比較は同じ譜面版（${r.variantId}）の中だけです。`,
    song: `${p.name} ・ ${variantText(r.variantId)} ・ ${PROFILE_NAMES[r.profile]} ・ 自前音源`,
    accuracy,
    // 判定した音が無い回（全て skipped）は精度もランクも「—」
    rank: accuracy === '—' ? '—' : r.rank,
    rows,
    self: selfParts(r.selfRate),
    chord:
      ch.total === 0
        ? null
        : `同時押しが合った割合 ${Math.round((ch.hit / ch.total) * 100)}%（${ch.hit} ／ ${ch.total} 拍）`,
    lean:
      j.meanMs === null
        ? null
        : `平均 ${signedMs(j.meanMs)}（${leanWord(j.meanMs)}）、ばらつき ${j.sdMs === null ? '—' : `${Math.round(j.sdMs)} ms`}、ヒット ${p.samples.length}。`,
    weak:
      p.weak === null
        ? null
        : `ミスが集まった${p.weak.from === p.weak.to ? '小節' : ' 2 小節'}: ${p.weak.from === p.weak.to ? p.weak.from : `${p.weak.from}〜${p.weak.to}`} 小節（はずれ ${p.weak.misses}）`,
  }
}

/** S3 の称号・ストリークの節（m6 renderS3 L859–868。M1 は動画の回が無いので、対象外の文は練習記録の物だけ） */
export function rewardView(a: Awards): { readonly pills: readonly string[]; readonly lines: readonly string[] } {
  if (!a.counted) return { pills: [], lines: ['練習記録は称号・ストリークの対象になりません。'] }
  const rest = a.total - a.done
  return {
    pills: a.titles,
    lines: [
      `ストリーク ${a.streak} 日（自前音源のプレイがある日の連続）。${
        a.total === 0 ? '' : rest > 0 ? `同梱 ${a.total} 曲完走まであと ${rest} 曲。` : `同梱 ${a.total} 曲をすべて完走しました。`
      }`,
      '対象プレイ ＝ 開始から動画を使っていない回だけ。',
    ],
  }
} // prettier-ignore
