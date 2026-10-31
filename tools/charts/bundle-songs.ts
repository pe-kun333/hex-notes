// 同梱曲の一覧（M1-01、M1 の手順 6）。出どころ: design.md §2.9（同梱曲 10 曲 ＝ チュートリアル 1 曲＋入門 9 曲）、
// m1-kickoff §5 の U-03 の代替（入門 9 曲が決まるまで、チュートリアル曲と PD の 2 曲〔きらきら星・歓喜の歌、
// mel-songs.ts の手採譜〕を暫定の同梱曲にする。9 曲は手順 14 の前に差し替える）・§7-17（チュートリアル曲、仮）、
// decisions #61（S0d は固定テンポ、60 BPM・音の間隔 2 拍）。権利の欄は content/charts/rights.json（ADR 0005）。

import type { Source } from '../../src/shared/types.ts'
import { TUTORIAL_SPECS, type BundleSong } from './bundle.ts'
import { M1_SONGS, type MelStep } from './mel-songs.ts'

const C4 = 60
const D4 = 62
const E4 = 64
const F4 = 65
const G4 = 67
const A4 = 69
const B4 = 71
const C5 = 72

/**
 * チュートリアル曲「はじめの六角」（自作、仮）。C 長調・60 BPM・2 拍ごとに 1 音。1 つおきに E4（Ableton 型の KeyD）を置き、
 * 段階 1（KeyD だけ）で 4 秒ごとの拍になる。E4・F4・B4・C5（KeyD・KeyF・KeyJ・KeyK ＝ ホームポジション）で段階 2 の旋律、
 * 全鍵で段階 3（手順 7 の実行時フィルタ）。終わりは主音 C4 を 4 拍のばす
 */
// prettier-ignore
export const HAJIME: readonly MelStep[] = [
  [E4, 2], [F4, 2], [E4, 2], [G4, 2],
  [E4, 2], [B4, 2], [E4, 2], [C5, 2],
  [E4, 2], [A4, 2], [E4, 2], [F4, 2],
  [E4, 2], [D4, 2], [E4, 2], [C4, 4],
]

const MEL_ORIGIN =
  'tools/charts/mel-songs.ts（docs/planning/mocks/m1-geometry.html SONGS の手採譜）'

const PD_TWINKLE: Source = {
  kind: 'bundled',
  rights: 'pd',
  title: 'きらきら星',
  composer: 'フランス民謡',
  origin: `${MEL_ORIGIN}.twinkle`,
}
const PD_ODE: Source = {
  kind: 'bundled',
  rights: 'pd',
  title: '歓喜の歌',
  composer: 'ベートーヴェン',
  origin: `${MEL_ORIGIN}.ode`,
}

/** 同梱曲（今は U-03 の代替の 3 曲） */
export const BUNDLE_SONGS: readonly BundleSong[] = [
  {
    file: 'tutorial/hajime.json',
    from: { kind: 'mel', song: { name: 'はじめの六角', bpm: 60, seq: HAJIME } },
    source: { kind: 'bundled', rights: 'own', title: 'はじめの六角', origin: 'tools/charts/bundle-songs.ts HAJIME（m1-kickoff §7-17）' },
    specs: TUTORIAL_SPECS,
  },
  { file: 'pd/twinkle.json', from: { kind: 'mel', song: M1_SONGS.twinkle }, source: PD_TWINKLE },
  { file: 'pd/ode.json', from: { kind: 'mel', song: M1_SONGS.ode }, source: PD_ODE },
] // prettier-ignore
