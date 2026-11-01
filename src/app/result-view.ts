// S3 結果の文言（M1-06、M1 の手順 5）。出どころ: m6 renderS3 L833–869（見出し・曲の行・内訳の表・完走の行）・
// selfRateHtml L612–617（自力率の 4 区分と長い凡例）・S3 L374（和音）・L383（ずれ）・L386（苦手区間）、design.md §1.3 S3
// （比較は同じ譜面版の中だけ）・§4.4（完走、decisions #63 の「中断あり」）、decisions #31 (e)（内訳の言葉 ぴったり／よい／
// おしい／となり／はずれ）・#62・#67（ずれの言葉）、m1-kickoff 手順 5（完了条件「同じ譜面版だけで比較する旨が画面にある」、
// 譜面版 id を見出しに出す）。「練習室で弾く」は M2-03、称号は手順 11。鍵数制限の回（手順 7）は「練習の結果」（m6 L837）。
// 純関数（DOM は screens/result.ts）。
// M2 の手順 9（M2-05）: 音ゲー向けの節（m6 renderS3 L837–850・S3 L364–379）: 内訳 PERFECT／GREAT／GOOD・MISS（NEAR の
// 行は無い）・最大コンボ・ゲージ終値・点・FULL COMBO、塊／殻／段またぎ・FAST／SLOW・早遅ヒストグラム 11 本（30 ms 幅。
// 計測の hist の 10 ms 幅とは別）、自力率は 3 区分（NEAR 無し、m6 selfRateHtml L611–616）。途中終了は見出し「途中終了」・
// ランク「—」・点「—」（m6 L837・L842・L850）。

import { KEYSET_NAMES, type KeysetId } from '../chart/keyset.ts'
import { LAYOUTS } from '../layout/presets.ts'
import { JUDGE_WORDS } from '../render/canvas/feedback.ts'
import type { Awards } from '../results/awards.ts'
import { isFinished } from '../results/record.ts'
import type { LayoutId, PlayMode, Profile, ResultRecord, SelfRate } from '../shared/types.ts'
import { leanWord, signedMs } from './calibration.ts'
import { accuracyText } from './hud.ts'
import type { FinishedPlay } from './play-runner.ts'
import { PROFILE_NAMES } from './profile.ts'

/** 自力率の区分（m6 selfRateHtml の長い凡例。入門者の 4 区分） */
export const SELF_LABELS: Readonly<Record<keyof SelfRate, string>> = {
  solo: 'ラベル無しで当てた',
  hinted: 'ヒント付き',
  near: 'となり（NEAR）',
  miss: '外した',
}
const SELF_ORDER: readonly (keyof SelfRate)[] = ['solo', 'hinted', 'near', 'miss']
/** 音ゲー向けの 3 区分（NEAR は無い、decisions #6） */
const SELF_ORDER_GAMER: readonly (keyof SelfRate)[] = ['solo', 'hinted', 'miss']

/** 音ゲー向けの内訳の言葉（m6 renderS3 L850） */
const GAMER_WORDS = { hits: 'PERFECT／GREAT／GOOD', miss: 'MISS' } as const

/** S3 の早遅ヒストグラム: 30 ms 幅 × 11 本（−165 … ＋165 ms。m2-kickoff 手順 9・§7-19 の自作値、仮） */
/** 当てた音が全部待ちの解除だった回の「ずれとオフセット」（M2 の手順 10、F1） */
export const WAIT_ONLY_LEAN =
  '待ちで当てた音はずれに数えません（時刻どおりに当てた音がありません）。'
export const HIST_BAR_MS = 30
export const HIST_BARS = 11

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
  /** FULL COMBO（音ゲー向けの通常プレイで、途中終了でなく miss 0） */
  readonly fullCombo: boolean
  /** 音ゲー向けの節（入門者・練習記録は null） */
  readonly gamer: GamerResultView | null
}

export interface GamerResultView {
  /** 「61% ／ 28% ／ 11%（18 和音）」。和音が無ければ「和音なし」 */
  readonly shapes: string
  /** 「37 ／ 22」 */
  readonly fastSlow: string
  /** 早遅ヒストグラムの 11 本の数（histBars） */
  readonly hist: readonly number[]
}

/** 譜面版 id（layout/limit/fold）→ 「Ableton 型／上限 2」 */
export function variantText(variantId: string): string {
  const [layout, limit] = variantId.split('/')
  const name = layout !== undefined && layout in LAYOUTS ? LAYOUTS[layout as LayoutId].name : layout
  return `${name ?? '?'}／上限 ${limit ?? '?'}`
}

/** 自力率の区分の割合（入門者は 4 区分、音ゲー向けは NEAR を除く 3 区分。区分の和を分母にする。0 なら空） */
export function selfParts(s: SelfRate, profile: Profile = 'beginner'): SelfPart[] {
  const order = profile === 'gamer' ? SELF_ORDER_GAMER : SELF_ORDER
  const total = order.reduce((a, k) => a + s[k], 0)
  if (total === 0) return []
  return order.map((key) => {
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

/**
 * 早遅ヒストグラムの 11 本（S3 の音ゲー向け）。本 i は [−165 + 30i, −135 + 30i)（中の本は [−15, 15)）。端の 2 本は外へ
 * 開いた区間（−135 未満・＋135 以上）で、音ゲー向けの GOOD の窓 ±200 の標本も落とさない（11 本の和 ＝ 標本の数）
 */
export function histBars(dts: readonly number[]): number[] {
  const out = new Array<number>(HIST_BARS).fill(0)
  const half = (HIST_BARS * HIST_BAR_MS) / 2
  for (const d of dts) {
    const i = Math.min(HIST_BARS - 1, Math.max(0, Math.floor((d + half) / HIST_BAR_MS)))
    out[i] = (out[i] ?? 0) + 1
  }
  return out
}

/** 点（整数に丸め、3 桁ごとに「,」） */
export function pointsText(points: number): string {
  return String(Math.round(points)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const pct = (n: number, d: number): number => Math.round((n / d) * 100)

/** 和音の形の文（m1' の「塊 / 殻 / 段またぎ」の割合と和音の数） */
export function shapesText(s: FinishedPlay['shapes']): string {
  if (s.total === 0) return '和音なし'
  return `${pct(s.cluster, s.total)}% ／ ${pct(s.shell, s.total)}% ／ ${pct(s.cross, s.total)}%（${s.total} 和音）`
}

export function resultView(p: FinishedPlay): ResultView {
  const r = p.record
  const c = r.counts
  const w = JUDGE_WORDS
  const finished = isFinished(r)
  const g = r.profile === 'gamer' ? p.judge.gamer : null
  const aborted = r.aborted === true
  const rows: [string, string][] =
    g === null
      ? [
          [`${w.perfect}／${w.great}／${w.good}`, `${c.perfect} ／ ${c.great} ／ ${c.good}`],
          [`${w.near}（隣のキー）`, String(c.near)],
          [w.miss, String(c.miss)],
        ]
      : [
          [GAMER_WORDS.hits, `${c.perfect} ／ ${c.great} ／ ${c.good}`],
          [GAMER_WORDS.miss, String(c.miss)],
        ]
  if (r.skipped > 0) rows.push(['判定なし（再開の猶予の中）', String(r.skipped)])
  // 練習記録（鍵数制限・待ち・テンポ≠1.0・ループ。M2 の手順 5）は条件と残すものを出す（m6 renderS3 L846–847）
  const practice = r.keyset !== 'all' || r.mode !== 'fixed' || r.rate !== 1 || r.looped === true
  // 音ゲー向けの通常プレイは最大コンボ・ゲージ終値・点（m6 L850）
  if (g !== null && !practice)
    rows.push(
      ['最大コンボ', String(p.judge.maxCombo)],
      [
        'ゲージ終値',
        aborted
          ? '0（途中終了）'
          : `${Math.floor(g.gauge)}（${g.cleared ? 'クリア' : 'クリアならず'}。クリアは ≥70）`,
      ],
      ['点', aborted ? '—' : pointsText(g.points)],
    )
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
        : aborted
          ? 'いいえ（途中終了。自己ベストと完走の対象外）'
          : r.skipped > 0
            ? 'いいえ（中断あり。自己ベストと完走の対象外）'
            : 'いいえ（練習の条件。自己ベストと完走の対象外）',
    ])
  const j = p.judge
  const ch = p.chords
  const accuracy = accuracyText(j)
  return {
    title: practice ? '練習の結果' : aborted ? '途中終了' : '結果',
    scope: `成績の比較は同じ譜面版（${r.variantId}）の中だけです。`,
    song: `${p.name} ・ ${variantText(r.variantId)} ・ ${PROFILE_NAMES[r.profile]} ・ 自前音源`,
    accuracy,
    // 判定した音が無い回（全て skipped）は精度もランクも「—」。途中終了もランク「—」（m6 L842）
    rank: accuracy === '—' || aborted ? '—' : r.rank,
    rows,
    self: selfParts(r.selfRate, r.profile),
    chord:
      ch.total === 0
        ? null
        : `同時押しが合った割合 ${Math.round((ch.hit / ch.total) * 100)}%（${ch.hit} ／ ${ch.total} 拍）`,
    // 待ちで当てた音は dt を持たない（ずれの標本に入らない）。音待ちで全部当てた回に「当てた音がありません」と出さない（M2 の手順 10、F1）
    lean:
      j.meanMs === null
        ? r.mode !== 'fixed' && c.perfect + c.great + c.good > 0
          ? WAIT_ONLY_LEAN
          : null
        : `平均 ${signedMs(j.meanMs)}（${leanWord(j.meanMs)}）、ばらつき ${j.sdMs === null ? '—' : `${Math.round(j.sdMs)} ms`}、ヒット ${p.samples.length}。`,
    weak:
      p.weak === null
        ? null
        : `ミスが集まった${p.weak.from === p.weak.to ? '小節' : ' 2 小節'}: ${p.weak.from === p.weak.to ? p.weak.from : `${p.weak.from}〜${p.weak.to}`} 小節（はずれ ${p.weak.misses}）`,
    fullCombo: g !== null && !practice && !aborted && g.fullCombo,
    gamer:
      g === null || practice
        ? null
        : {
            shapes: shapesText(p.shapes),
            fastSlow: `${p.judge.fastSlow.fast} ／ ${p.judge.fastSlow.slow}`,
            hist: histBars(p.samples),
          },
  }
}

/**
 * S3 の称号・ストリークの節（m6 renderS3 L859–868。M1 は動画の回が無いので、対象外の文は練習記録の物だけ）。途中終了の回は
 * 完走にならないがストリークの日には数える（m2-kickoff §7-14。m6 L868 の「途中終了は完走になりません。」）
 */
export function rewardView(a: Awards, aborted = false): { readonly pills: readonly string[]; readonly lines: readonly string[] } {
  if (!a.counted) return { pills: [], lines: ['練習記録は称号・ストリークの対象になりません。'] }
  const rest = a.total - a.done
  return {
    pills: a.titles,
    lines: [
      ...(aborted ? ['途中終了は完走になりません（ストリークの日には数えます）。'] : []),
      `ストリーク ${a.streak} 日（自前音源のプレイがある日の連続）。${
        a.total === 0 ? '' : rest > 0 ? `同梱 ${a.total} 曲完走まであと ${rest} 曲。` : `同梱 ${a.total} 曲をすべて完走しました。`
      }`,
      '対象プレイ ＝ 開始から動画を使っていない回だけ。',
    ],
  }
} // prettier-ignore
