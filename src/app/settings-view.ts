// S6 設定の項目（M1-07、M1 の手順 10）。出どころ: design.md §1.3 S6（群: プロファイル・配列・幾何・着地と判定・同時押し・
// 校正・ラベル 9 マス・色と演出・音・入力・計測盤・データ・クレジット）、m6 S6 L520–525・renderS6 L907–931、decisions #29 (c)
// （低負荷は自動では上げない。戻すのは S6）・#42（段ずれ）・#43（刻印）・#45（幾何）・#52（settings）、m1-kickoff 手順 10・§7-11
// （M1 で出さない物: プロファイル切替・対照 W–H・判定窓と離し窓の変更・持ち込み曲の削除と版の作り直し・オフセット〔YouTube〕。
// 色は 標準／グレースケール確認 の 2 値、演出の予算 標準／控えめ／なし、低負荷 自動／ON（段 3）／OFF（段 0）、仮）。
// 選ぶ項目を表で持ち、選んだ値 → 新しい設定の純関数（DOM は screens/settings.ts）。

import { STAGGER_PRESETS, type Stagger } from '../layout/stagger.ts'
import type { Settings } from '../storage/local.ts'

export interface Choice {
  readonly value: string
  readonly label: string
}

export interface Control {
  readonly id: string
  readonly label: string
  readonly choices: readonly Choice[]
  /** 今の値（choices のどれか。どれでもなければ null ＝ 自作の値） */
  get(s: Settings): string | null
  set(s: Settings, value: string): Settings
  readonly note?: string
}

export interface Group {
  readonly title: string
  readonly controls: readonly Control[]
}

const onOff: readonly Choice[] = [
  { value: 'on', label: 'ON' },
  { value: 'off', label: 'OFF' },
]
const bool = (v: string): boolean => v === 'on'
const onOffOf = (b: boolean): string => (b ? 'on' : 'off')

const LABEL_CHOICES: readonly Choice[] = [
  { value: 'key', label: 'キー文字' },
  { value: 'note', label: '音名' },
  { value: 'both', label: '両方' },
  { value: 'none', label: 'なし' },
]
type LabelMode = Settings['labels']['kb']
const asLabel = (v: string): LabelMode =>
  LABEL_CHOICES.some((c) => c.value === v) ? (v as LabelMode) : 'key'

const sameStagger = (a: Stagger, b: Stagger): boolean =>
  a.every((x, i) => Math.abs(x - (b[i] ?? NaN)) < 1e-9)

/** 伴奏の音量の段（0..1 の比、#47 (d)。100% が既定） */
export const ACCOMP_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1]

/** 選べる項目（m6 renderS6 の群の順。M1 で出さない物は入れない、§7-11） */
export const SETTING_GROUPS: readonly Group[] = [
  {
    title: '配列',
    controls: [
      {
        id: 'layout',
        label: '配列',
        choices: [
          { value: 'ableton', label: 'Ableton 型' },
          { value: 'vmpk', label: 'VMPK 型' },
        ],
        get: (s) => s.layout,
        set: (s, v) => ({ ...s, layout: v === 'vmpk' ? 'vmpk' : 'ableton' }),
        note: 'ホームで選ぶ譜面版の既定の配列（チュートリアル曲は Ableton 型のまま）。',
      },
      {
        id: 'legend',
        label: '刻印',
        choices: [
          { value: 'auto', label: '自動（getLayoutMap）' },
          { value: 'jis', label: 'JIS' },
          { value: 'us', label: 'US' },
        ],
        get: (s) => s.legend,
        set: (s, v) => ({ ...s, legend: v === 'jis' || v === 'us' ? v : 'auto' }),
      },
    ],
  },
  {
    title: '幾何',
    controls: [
      {
        id: 'geometry',
        label: '格子',
        choices: [
          { value: 'regular', label: '正六角（1/2 ずれ）' },
          { value: 'physical', label: '物理せん断' },
          { value: 'fallback', label: '退避: 正六角のまま文字だけ' },
        ],
        get: (s) => s.geometry,
        set: (s, v) => ({ ...s, geometry: v === 'physical' || v === 'fallback' ? v : 'regular' }),
        note: '判定は常にキーの位置（code）で、隣（NEAR）と辺ヒントは正六角の隣のまま。',
      },
      {
        id: 'stagger',
        label: '段ずれの自己申告',
        choices: STAGGER_PRESETS.map((p) => ({ value: p.id, label: p.name })),
        get: (s) => STAGGER_PRESETS.find((p) => sameStagger(p.v, s.stagger))?.id ?? null,
        set: (s, v) => {
          const p = STAGGER_PRESETS.find((x) => x.id === v)
          return p === undefined ? s : { ...s, stagger: p.v }
        },
        note: '物理せん断の鍵盤図に使う（数字–Q・Q–A・A–Z の順、キー幅単位）。実測（U-01）の値は開発ページ layout で受け取る。',
      },
    ],
  },
  {
    title: '着地と判定',
    controls: [
      {
        id: 'landing',
        label: '着地',
        choices: [
          { value: 'cell', label: '段別（鍵にはまる）＋奥行き' },
          { value: 'line', label: '一本線（対照）' },
        ],
        get: (s) => s.landing,
        set: (s, v) => ({ ...s, landing: v === 'line' ? 'line' : 'cell' }),
      },
      {
        id: 'hints',
        label: '辺ヒント',
        choices: [
          { value: 'on', label: '次を辺で指す' },
          { value: 'off', label: 'なし' },
        ],
        get: (s) => onOffOf(s.hints),
        set: (s, v) => ({ ...s, hints: bool(v) }),
      },
    ],
  },
  {
    title: 'ラベル（9 マス）',
    controls: [
      {
        id: 'labels.kb',
        label: '鍵盤側',
        choices: LABEL_CHOICES,
        get: (s) => s.labels.kb,
        set: (s, v) => ({ ...s, labels: { ...s.labels, kb: asLabel(v) } }),
        note: '鍵盤図ではキー文字を消さない（なし → キー文字、音名 → 両方で描く）。',
      },
      {
        id: 'labels.note',
        label: 'ノート側',
        choices: LABEL_CHOICES,
        get: (s) => s.labels.note,
        set: (s, v) => ({ ...s, labels: { ...s.labels, note: asLabel(v) } }),
      },
    ],
  },
  {
    title: '色と演出',
    controls: [
      {
        id: 'grayscale',
        label: '色',
        choices: [
          { value: 'off', label: '標準' },
          { value: 'on', label: 'グレースケール（確認用）' },
        ],
        get: (s) => onOffOf(s.grayscale),
        set: (s, v) => ({ ...s, grayscale: bool(v) }),
        note: '色に頼らず段と音が読めるかを確かめる。',
      },
      {
        id: 'fx.budget',
        label: '演出の予算',
        choices: [
          { value: 'standard', label: '標準' },
          { value: 'light', label: '控えめ' },
          { value: 'none', label: 'なし' },
        ],
        get: (s) => s.fx.budget,
        set: (s, v) => ({ ...s, fx: { ...s.fx, budget: v === 'light' || v === 'none' ? v : 'standard' } }),
        note: '閃光 1 秒 3 回以下、同時に光る面積 25% 以下（標準）。',
      },
      {
        id: 'fx.lowload',
        label: '低負荷モード',
        choices: [
          { value: 'auto', label: '自動' },
          { value: 'on', label: 'ON' },
          { value: 'off', label: 'OFF' },
        ],
        get: (s) => s.fx.lowload,
        set: (s, v) => ({ ...s, fx: { ...s.fx, lowload: v === 'on' || v === 'off' ? v : 'auto' } }),
        note: '自動は動きが重いと「演出なし → 殻なし → 奥行きなし」の順に落とす（自動では戻さない。ここで戻す）。',
      },
    ],
  },
  {
    title: '音',
    controls: [
      { id: 'audio.guide', label: 'ガイド音', choices: onOff, get: (s) => onOffOf(s.audio.guide), set: (s, v) => ({ ...s, audio: { ...s.audio, guide: bool(v) } }) },
      { id: 'audio.metronome', label: 'メトロノーム', choices: onOff, get: (s) => onOffOf(s.audio.metronome), set: (s, v) => ({ ...s, audio: { ...s.audio, metronome: bool(v) } }) },
      { id: 'audio.keyclick', label: '空打ち発音', choices: onOff, get: (s) => onOffOf(s.audio.keyclick), set: (s, v) => ({ ...s, audio: { ...s.audio, keyclick: bool(v) } }), note: '誤打のときだけ小さく短く鳴らす。' },
      {
        id: 'audio.accompVolume',
        label: '伴奏の音量',
        choices: ACCOMP_STEPS.map((x) => ({ value: String(x), label: `${Math.round(x * 100)}%` })),
        get: (s) => (ACCOMP_STEPS.includes(s.audio.accompVolume) ? String(s.audio.accompVolume) : null),
        set: (s, v) => {
          const x = Number(v)
          return ACCOMP_STEPS.includes(x) ? { ...s, audio: { ...s.audio, accompVolume: x } } : s
        },
      },
    ],
  },
  {
    title: '入力',
    controls: [
      {
        id: 'imeStop',
        label: 'IME 検知時に曲を止める',
        choices: onOff,
        get: (s) => onOffOf(s.imeStop),
        set: (s, v) => ({ ...s, imeStop: bool(v) }),
        note: '役割キー: Space 開始・再開・校正タップ、Enter 決定、Esc 一時停止。修飾キーは使いません。',
      },
    ],
  },
] // prettier-ignore

export function controlById(id: string): Control | undefined {
  for (const g of SETTING_GROUPS) for (const c of g.controls) if (c.id === id) return c
  return undefined
}
