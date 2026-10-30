// 手順 3 のフィクスチャの元になる曲（拍単位の旋律）。出どころ: m1'（docs/planning/mocks/m1-geometry.html）の
// mel L244・SONGS L246–257 の 6 曲（random L256 は genRandom で毎回変わるので外す）と、m5
// （m5-song-import.html）の EXAMPLES L252–256 の 2 曲。並びは元の式のまま写した
// （tests/unit/chart/m5-port.test.ts が元のコードを評価して突き合わせる）。
// 曲の権利の欄（rights・composer）は元に無いので、使う側（mel-fixtures.ts）が持つ。

/** 1 歩: [音高（1 音・和音・休符 null）, 長さ（拍）] */
export type MelStep = readonly [number | readonly number[] | null, number]

export type MelSong = { name: string; bpm: number; seq: readonly MelStep[] }

/** m1' の曲（desc は画面の説明文） */
export type M1MelSong = MelSong & { desc: string }

/** m1' mel L244 の戻り（vel は持たない） */
export type M1Chart = {
  name: string
  desc: string
  bpm: number
  notes: { midi: number; beat: number; dur: number }[]
  beats: number
}

/** m1' mel L244: 拍を積み、和音は同じ beat に並べる */
export function m1Mel(song: M1MelSong): M1Chart {
  let b = 0
  const notes: M1Chart['notes'] = []
  for (const [p, d] of song.seq) {
    if (p !== null)
      for (const m of Array.isArray(p) ? p : [p]) notes.push({ midi: m, beat: b, dur: d })
    b += d
  }
  return { name: song.name, desc: song.desc, bpm: song.bpm, notes, beats: b }
}

/** 末尾だけ 2 拍、他は 0.5 拍の走句（m1' の scale・chroma の .map と同じ） */
function run(pitches: readonly number[]): MelStep[] {
  return pitches.map((p, i, a) => [p, i === a.length - 1 ? 2 : 0.5] as const)
}

// m1' L245（G は Gn）
const C = 60
const D = 62
const E = 64
const F = 65
const Gn = 67
const A = 69

// prettier-ignore
const TWINKLE: readonly MelStep[] = [
  [C, 1], [C, 1], [Gn, 1], [Gn, 1], [A, 1], [A, 1], [Gn, 2], [F, 1], [F, 1], [E, 1], [E, 1], [D, 1],
  [D, 1], [C, 2], [Gn, 1], [Gn, 1], [F, 1], [F, 1], [E, 1], [E, 1], [D, 2], [Gn, 1], [Gn, 1], [F, 1],
  [F, 1], [E, 1], [E, 1], [D, 2], [C, 1], [C, 1], [Gn, 1], [Gn, 1], [A, 1], [A, 1], [Gn, 2], [F, 1],
  [F, 1], [E, 1], [E, 1], [D, 1], [D, 1], [C, 2],
]

// prettier-ignore
const CANON: readonly MelStep[] = [
  [[62, 66, 69], 2], [[57, 61, 64], 2], [[59, 62, 66], 2], [[54, 57, 61], 2], [[55, 59, 62], 2],
  [[50, 54, 57], 2], [[55, 59, 62], 2], [[57, 61, 64], 2], [[62, 66, 69], 2], [[57, 61, 64], 2],
  [[59, 62, 66], 2], [[54, 57, 61], 2], [[55, 59, 62], 2], [[50, 54, 57], 2], [[55, 59, 62], 2],
  [[57, 61, 64], 2], [[62, 66, 69], 4],
]

/** m1' SONGS L246–257 の 6 曲（random を除く）。キーは元のまま */
export const M1_SONGS: Readonly<
  Record<'twinkle' | 'ode' | 'canon' | 'duet' | 'scale' | 'chroma', M1MelSong>
> = {
  twinkle: {
    name: 'きらきら星',
    desc: 'ゆっくり。白鍵だけで、段をまたがない基本形。',
    bpm: 96,
    seq: TWINKLE,
  },
  ode: {
    name: '歓喜の歌',
    desc: '順次進行と付点のリズム。ロングノートも出ます。',
    bpm: 112,
    // prettier-ignore
    seq: [
      [E, 1], [E, 1], [F, 1], [Gn, 1], [Gn, 1], [F, 1], [E, 1], [D, 1], [C, 1], [C, 1], [D, 1],
      [E, 1], [E, 1.5], [D, 0.5], [D, 2], [E, 1], [E, 1], [F, 1], [Gn, 1], [Gn, 1], [F, 1], [E, 1],
      [D, 1], [C, 1], [C, 1], [D, 1], [E, 1], [D, 1.5], [C, 0.5], [C, 3],
    ],
  },
  canon: {
    name: 'カノン進行（三和音）',
    desc: '2拍ごとの三和音。塊になる和音と殻になる和音の割合を見る。',
    bpm: 76,
    seq: CANON,
  },
  duet: {
    name: '二声（旋律＋ベース）',
    desc: '上声の旋律と 2 拍ごとのベース。段をまたぐ 2 音同時押しの見え方を試す。',
    bpm: 100,
    // prettier-ignore
    seq: [
      [[48, 64], 1], [62, 1], [[52, 60], 1], [62, 1], [[53, 64], 1], [65, 1], [[48, 67], 1], [65, 1],
      [[57, 64], 1], [62, 1], [[53, 60], 1], [62, 1], [[55, 59], 1], [62, 1], [[48, 60], 2],
    ],
  },
  scale: {
    name: 'スケール走り',
    desc: 'ハ長調を 2 オクターブ上下。段をまたぐ移動と辺ヒントの読みやすさを試す。',
    bpm: 120,
    seq: run([
      48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 74, 72, 71, 69, 67, 65,
      64, 62, 60, 59, 57, 55, 53, 52, 50, 48,
    ]),
  },
  chroma: {
    name: '半音階ドリル',
    desc: '黒鍵（30° 回した六角）との往復。',
    bpm: 100,
    seq: run([
      60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 71, 70, 69, 68, 67, 66, 65, 64, 63, 62,
      61, 60,
    ]),
  },
}

/** m5 EXAMPLES L252–256 の 2 曲（m5 の mel L249 に渡す。twinkle・canon は m1' と同じ並び） */
export const M5_EXAMPLES: Readonly<Record<'twinkle' | 'canon', MelSong>> = {
  twinkle: { name: 'きらきら星', bpm: 96, seq: TWINKLE },
  canon: { name: 'カノン進行（三和音）', bpm: 76, seq: CANON },
}
