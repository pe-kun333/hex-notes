// 手順 3 のフィクスチャ（tests/fixtures/）を作る純関数。tools/charts/from-mel.ts が書き、試験が照合する。
// 出どころ: m0-kickoff.md 手順 3「m1' の 6 曲と m5 EXAMPLES を /1 に」「6＋2 曲の /1 JSON と m5 の JSON 出力」。
// m1' の 6 曲: m1Mel → /1（原曲音高。vel は元に無いので書かない＝既定 80）→ 同梱曲の 4 版（src/chart/variants.ts）。
// m5 の 2 曲: m5 の mel → buildVariant（m5-port。garage・octave・上限 2 ＝ m5 の既定 state L370）→ convertM5。
// m5 の JSON 出力は同じ variant の buildJSON → fmtJSON（照合用。/1 の検査には掛けない）。
// 書く文字列は決定的（日時を入れない）。fixtures は .prettierignore の対象なので、この整形がそのまま残る。

import { convertM5 } from '../../src/chart/convert-m5.ts'
import type { ConvertM5Input } from '../../src/chart/convert-m5.ts'
import { computeChartId } from '../../src/chart/hash.ts'
import { validateChart } from '../../src/chart/validate.ts'
import { buildVariants } from '../../src/chart/variants.ts'
import type { Chart, Note, Source } from '../../src/shared/types.ts'
import { CHART_FORMAT, DEFAULT_RESOLUTION } from '../../src/shared/types.ts'
import { m5BuildJson, m5BuildVariant, m5FmtJson, m5MakeClock, m5Mel } from './m5-port.ts'
import type { M5PortVariant } from './m5-port.ts'
import { M1_SONGS, M5_EXAMPLES, m1Mel } from './mel-songs.ts'

export type M1SongKey = keyof typeof M1_SONGS
export type M5SongKey = keyof typeof M5_EXAMPLES
export const M1_SONG_KEYS = Object.keys(M1_SONGS) as M1SongKey[]
export const M5_SONG_KEYS = Object.keys(M5_EXAMPLES) as M5SongKey[]

/** from-mel が書く generator */
export const FROM_MEL_GENERATOR = 'hexnote from-mel (M0-02)'

/**
 * m1' の曲の出どころ（元のモックに権利の欄は無いので書き足した。仮・フィクスチャ用で content/charts の同梱曲ではない。
 * kind が bundled なのは同梱曲の 4 版の見本として作るため）。同梱するときは content/charts/RIGHTS.md の行を作り直す。
 * canon は和声進行が PD でも、声部の配置とリズムはモックの作者の編曲なので own（RIGHTS.md の arrangerDied 欄「自分で編曲したなら … license を own」）
 */
const ORIGIN = 'docs/planning/mocks/m1-geometry.html SONGS'
export const M1_SOURCES: Readonly<Record<M1SongKey, Source>> = {
  twinkle: { kind: 'bundled', rights: 'pd', title: 'きらきら星', composer: 'フランス民謡', origin: `${ORIGIN}.twinkle` },
  ode: { kind: 'bundled', rights: 'pd', title: '歓喜の歌', composer: 'ベートーヴェン', origin: `${ORIGIN}.ode` },
  canon: { kind: 'bundled', rights: 'own', title: 'カノン進行', composer: 'パッヘルベル（和声進行のみ）', origin: `${ORIGIN}.canon` },
  duet: { kind: 'bundled', rights: 'own', title: '二声（旋律＋ベース）', origin: `${ORIGIN}.duet` },
  scale: { kind: 'bundled', rights: 'own', title: 'スケール走り', origin: `${ORIGIN}.scale` },
  chroma: { kind: 'bundled', rights: 'own', title: '半音階ドリル', origin: `${ORIGIN}.chroma` },
} // prettier-ignore

/** フィクスチャ 1 つ。path は tests/fixtures/ からの相対（区切り /） */
export type FixtureFile = { path: string; text: string }

/** m1' の曲を /1 に（同梱曲の 4 版付き） */
export async function m1Chart(key: M1SongKey): Promise<Chart> {
  const c = m1Mel(M1_SONGS[key])
  const notes: Note[] = c.notes
    .map((n) => ({ midi: n.midi, beat: n.beat, dur: n.dur }))
    .sort((a, b) => a.beat - b.beat || a.midi - b.midi)
  const chart: Chart = {
    format: CHART_FORMAT,
    id: '',
    name: c.name,
    bpm: c.bpm,
    beats: c.beats,
    notes,
    pulse: { resolution: DEFAULT_RESOLUTION, tempo: [{ beat: 0, bpm: c.bpm }] },
    sync: { sources: [] },
    source: { ...M1_SOURCES[key] },
    variants: [],
    generator: FROM_MEL_GENERATOR,
  }
  chart.variants = buildVariants(chart)
  chart.id = await computeChartId(chart)
  const r = validateChart(chart)
  if (!r.ok)
    throw new Error(`m1Chart(${key}): ${r.issues.map((i) => `${i.path} ${i.message}`).join('; ')}`)
  return chart
}

/** m5 の曲を m5 の既定 state（garage・octave・上限 2）で buildVariant した内部表現 */
export function m5Default(key: M5SongKey): ConvertM5Input & { variant: M5PortVariant } {
  const song = m5Mel(M5_EXAMPLES[key])
  const first = song.tracks[0]
  if (!first) throw new Error(`m5Default(${key}): トラックが無い`)
  const variant = m5BuildVariant(first.notes, 'garage', 'octave', 2, m5MakeClock(song))
  return { song, variant }
}

/** フィクスチャを全部作る（書く順） */
export async function buildMelFixtures(): Promise<FixtureFile[]> {
  const files: FixtureFile[] = []
  for (const key of M1_SONG_KEYS)
    files.push({
      path: `charts/m1/${key}.hexnote.json`,
      text: formatJson(await m1Chart(key)) + '\n',
    })
  for (const key of M5_SONG_KEYS) {
    const input = m5Default(key)
    const chart = await convertM5(input)
    files.push({ path: `charts/m5/${key}.hexnote.json`, text: formatJson(chart) + '\n' })
    files.push({
      path: `m5-json/${key}.garage.octave.L2.json`,
      text: m5FmtJson(m5BuildJson(input.song, input.variant)) + '\n',
    })
  }
  return files
}

// ---------- 整形 ----------

/**
 * JSON を読みやすく書く。値が全て素の値（か素の値の配列）のオブジェクトと、素の値の配列は 1 行
 * （Note は 1 行に 1 つ、keys は 1 行）。それ以外は 2 字下げで展開する。undefined のキーは書かない
 */
export function formatJson(value: unknown, indent = ''): string {
  if (isInline(value)) return inline(value)
  const next = indent + '  '
  if (Array.isArray(value))
    return `[\n${value.map((v) => next + formatJson(v, next)).join(',\n')}\n${indent}]`
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  )
  const body = entries.map(([k, v]) => `${next}${JSON.stringify(k)}: ${formatJson(v, next)}`)
  return `{\n${body.join(',\n')}\n${indent}}`
}

function isPrimitive(v: unknown): boolean {
  return v === null || typeof v !== 'object'
}

function isInline(v: unknown): boolean {
  if (isPrimitive(v)) return true
  if (Array.isArray(v)) return v.every(isPrimitive)
  return Object.values(v as Record<string, unknown>).every(
    (x) => isPrimitive(x) || (Array.isArray(x) && x.every(isPrimitive)),
  )
}

function inline(v: unknown): string {
  if (isPrimitive(v)) return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => JSON.stringify(x) ?? 'null').join(', ')}]`
  const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined)
  if (entries.length === 0) return '{}'
  return `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }`
}
