import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRACE_MS, graceEnd, skippedAt } from '../../../src/clock/grace.ts'
import { neighborOf, rulesOf, type JudgeNote, type JudgeRules } from '../../../src/judge/judge.ts'
import { PROFILES, lateEdge } from '../../../src/judge/windows.ts'
import { frameNotes } from '../../../src/render/canvas/commands.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import { isFinished } from '../../../src/results/record.ts'
import type { Chart, Profile } from '../../../src/shared/types.ts'
import {
  VIDEO_AXIS,
  runAutoplayVideo,
  type VideoAutoRun,
  type VideoScenario,
} from '../../../tools/harness/autoplay-video.ts'
import { diffTables } from '../../../tools/harness/diff.ts'
import {
  HARNESS_SONGS,
  buildVideoTable,
  parseTable,
  pickVariant,
  rowKey,
  tableText,
  type HarnessRow,
} from '../../../tools/harness/table.ts'

// 動画ありの自動プレイと 3 つ目の表 m3-04.json（M3 の手順 6、M3-04、仮）。出どころ: m3-kickoff 手順 6 の期待値 (1)〜(5)・(8)・(9)
// （原型で検算した値。twinkle・入門者・ableton/2/octave・揺れ 0・60 Hz・軸 offset 2.0 s、ダミー 15 ms 切り捨て・種 7、
// 「@」は開始からの ms）・§7-29（広告の入りの MISS は案 A ＝ 今のまま）・§7-30、design §5.4 L271・§2.6 L135、decisions #33・
// #34・#39・#56・#63、m3 L602・L641（飛び ＋400 → ＋300）。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const SONGS = HARNESS_SONGS.map((song) => ({
  song,
  chart: JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'charts', 'm1', `${song}.hexnote.json`), 'utf8')) as Chart,
})) // prettier-ignore
const TIMEOUT = 120_000

function setup(song: string, profile: Profile): { notes: JudgeNote[]; rules: JudgeRules } {
  const s = SONGS.find((x) => x.song === song)
  if (s === undefined) throw new Error(song)
  const notes = frameNotes(s.chart, pickVariant(s.chart, 'ableton'))
  const grid = buildKeyboardGrid('ableton', 1, { left: 0, top: 0 })
  return { notes, rules: rulesOf(PROFILES[profile], { neighbor: neighborOf(grid.byCode), axis: VIDEO_AXIS }) }
} // prettier-ignore

const r2 = (x: number): number => Math.round(x * 100) / 100
const play = (song: string, profile: Profile, scenario: VideoScenario, atFrame: number, extra = {}): VideoAutoRun => {
  const s = setup(song, profile)
  return runAutoplayVideo(s.notes, s.rules, { scenario, atFrame, ...extra })
} // prettier-ignore
const log = (r: VideoAutoRun): string[] =>
  r.events.map(
    (e) =>
      `${e.kind}${e.reason === undefined ? '' : `:${e.reason}`}@${e.at}${e.t === undefined ? '' : ` t=${r2(e.t)}`}`,
  )
const reqs = (r: VideoAutoRun): string[] =>
  r.requests.map((q) => `${q.q.kind}${q.q.kind === 'pauseVideo' ? `(${q.q.why})` : ''}@${q.at}`)

describe('猶予内に窓が終わる音の境（期待値 (1)）', () => {
  it('再アンカー R 3,000・名目 a 1・猶予の終わり 3,300: 入門者 R＋66 skipped・R＋67 残る、音ゲー向け R＋100／R＋101（境 ＝ 300 − W_late）', () => {
    const nominal = { a: 1, b: 0 }
    const R = 3000
    const gu = graceEnd(R)
    const wb = lateEdge(PROFILES.beginner.windows)
    const wg = lateEdge(PROFILES.gamer.windows)
    expect([wb, wg, gu]).toEqual([234, 200, R + GRACE_MS])
    expect([skippedAt(R + 66, nominal, wb, gu), skippedAt(R + 67, nominal, wb, gu)]).toEqual([true, false])
    expect([skippedAt(R + 100, nominal, wg, gu), skippedAt(R + 101, nominal, wg, gu)]).toEqual([true, false])
  }) // prettier-ignore
})

describe('人工の飛び ＋300（期待値 (2)(3)、design §5.4 L271 の読み替え）', () => {
  it('フレーム 270（@4,500）: resync(jump) で t 4,807.52（devMs 306.97）・graceEnd @4,800、残る最初の音は再アンカーの 317.48 ms 後、perfect 42・skipped 0・MISS 0、源 video、1,974 フレーム', () => {
    const r = play('twinkle', 'beginner', 'jump', 270)
    expect(log(r)).toEqual(['resync:start@16.67 t=15', 'graceEnd@316.67', 'resync:jump@4500 t=4807.52', 'graceEnd@4800'])
    expect(r2(r.events[2]?.devMs ?? NaN)).toBe(306.97)
    expect(r.firstLand.map((x) => (x === null ? null : r2(x)))).toEqual([317.48])
    expect(r.summary.counts).toMatchObject({ perfect: 42, miss: 0 })
    expect(r.summary.skipped).toBe(0)
    expect([r.source, r.frames, r.requests.length]).toEqual(['video', 1974, 0])
  }) // prettier-ignore

  it('フレーム 255: perfect 41・skipped 1・着地 572.48 で完走でない（中断あり、#63）', () => {
    const r = play('twinkle', 'beginner', 'jump', 255)
    expect([r.summary.counts.perfect, r.summary.skipped, r.summary.counts.miss]).toEqual([41, 1, 0])
    expect(r.firstLand.map((x) => (x === null ? null : r2(x)))).toEqual([572.48])
    expect(isFinished({ mode: 'fixed', rate: 1, keyset: 'all', skipped: r.summary.skipped })).toBe(false)
  }) // prettier-ignore

  it(
    '走査（scale、フレーム 200〜400 の 201 通り）: 残る最初の音の着地の最小 入門者 67.58（＞ 66）・音ゲー向け 102.6（＞ 100）、MISS 計 0、skipped は 1 か 2',
    () => {
      for (const [profile, min, edge] of [['beginner', 67.58, 66], ['gamer', 102.6, 100]] as const) {
        const s = setup('scale', profile)
        let lo = Infinity
        let miss = 0
        const skipped = new Set<number>()
        for (let f = 200; f <= 400; f++) {
          const r = runAutoplayVideo(s.notes, s.rules, { scenario: 'jump', atFrame: f })
          lo = Math.min(lo, r.firstLand[0] ?? Infinity)
          miss += r.summary.counts.miss
          skipped.add(r.summary.skipped)
        }
        expect(r2(lo)).toBe(min)
        expect(lo).toBeGreaterThan(edge)
        expect(miss).toBe(0)
        expect([...skipped].sort()).toEqual([1, 2])
      }
    },
    TIMEOUT,
  ) // prettier-ignore
})

describe('広告の模擬 2 形と凍結（期待値 (4)。広告は S7b のまま、§7-29 の案 A ＝ 今のまま。表に載せない）', () => {
  it('読みだけ止まる（pause 無効・stuck 8 秒、フレーム 270）: stall @6,483.33・adSuspected @6,983.33・resync(adEnd) @12,500、要求 3 回（2.5 s おき）、perfect 34・skipped 8・MISS 0、源 video', () => {
    const r = play('twinkle', 'beginner', 'adStuck', 270)
    expect(log(r)).toEqual(['resync:start@16.67 t=15', 'graceEnd@316.67', 'stall@6483.33 t=6483.53', 'adSuspected@6983.33 t=6983.44', 'resync:adEnd@12500 t=12502.52', 'graceEnd@12800'])
    expect(reqs(r)).toEqual(['pauseVideo(stall)@6483.33', 'pauseVideo(stall)@8983.33', 'pauseVideo(stall)@11483.33'])
    expect([r.summary.counts.perfect, r.summary.skipped, r.summary.counts.miss, r.source]).toEqual([34, 8, 0, 'video'])
  }) // prettier-ignore

  it('時刻も止まる（seek の凍結 8 秒・freezeHold）: adSuspected @7,000・adEnd @12,516.67 で t 7,000.81 → 4,522.57、perfect 40・miss 2（案 A）、2,472 フレーム、源 video', () => {
    const r = play('twinkle', 'beginner', 'adHold', 270)
    expect(log(r).slice(2)).toEqual(['stall@6500 t=6500.81', 'adSuspected@7000 t=7000.81', 'resync:adEnd@12516.67 t=4522.57', 'graceEnd@12816.67'])
    expect([r.summary.counts.perfect, r.summary.counts.miss, r.summary.skipped, r.frames, r.source]).toEqual([40, 2, 0, 2472, 'video'])
  }) // prettier-ignore

  it('凍結（pause の効きは既定の 0 ms、stuck 600 秒）: novideo @6,500、同期中を通らず perfect 42、源 novideo', () => {
    const r = play('twinkle', 'beginner', 'freeze', 270)
    expect(log(r).slice(2)).toEqual(['stall@6483.33 t=6483.53', 'novideo@6500 t=6500.2'])
    expect([r.summary.counts.perfect, r.summary.counts.miss, r.source]).toEqual([42, 0, 'novideo'])
  }) // prettier-ignore
})

describe('広告の入り 2.5 秒の MISS とゲージ（期待値 (5)、§7-29 の案 A。途中終了は runFrame だけで、ここは最後まで回す）', () => {
  it('音ゲー向け・時刻も止まる広告をフレーム 270: 6 曲の miss は 2・4・8・7・4・2、scale のゲージ終値 99.5 → 39.5', () => {
    expect(HARNESS_SONGS.map((s) => play(s, 'gamer', 'adHold', 270).summary.counts.miss)).toEqual([2, 4, 8, 7, 4, 2])
    // 筋書きを起こさない回（フレームが来ない）と比べる
    expect(play('scale', 'gamer', 'adHold', Infinity).summary.gamer?.gauge).toBe(99.5)
    expect(play('scale', 'gamer', 'adHold', 270).summary.gamer?.gauge).toBe(39.5)
  }) // prettier-ignore

  it(
    'scale をフレーム 110 なら miss 9 でゲージ 0。フレーム 100〜500 の 5 刻み 81 通り中 6 通りでゲージ 0',
    () => {
      const r = play('scale', 'gamer', 'adHold', 110)
      expect([r.summary.counts.miss, r.summary.gamer?.failed]).toEqual([9, true])
      const s = setup('scale', 'gamer')
      let failed = 0
      let n = 0
      for (let f = 100; f <= 500; f += 5) {
        n++
        if (runAutoplayVideo(s.notes, s.rules, { scenario: 'adHold', atFrame: f }).summary.gamer?.failed === true) failed++
      }
      expect([n, failed]).toEqual([81, 6])
    },
    TIMEOUT,
  ) // prettier-ignore
})

describe('排他の筋書き（期待値 (9)）', () => {
  it('凍結（フレーム 270）で 1 回目の pauseVideo だけダミーへ渡さない → adSuspected @6,983.33、出し直し @8,983.33 が効き novideo と resync(fallback) @9,000（t 6,983.44）', () => {
    let n = 0
    const r = play('twinkle', 'beginner', 'freeze', 270, { drop: (q: { kind: string }) => q.kind === 'pauseVideo' && n++ === 0 })
    expect(log(r).slice(2)).toEqual(['stall@6483.33 t=6483.53', 'adSuspected@6983.33 t=6983.44', 'novideo@9000 t=6983.44', 'resync:fallback@9000 t=6983.44', 'graceEnd@9300'])
    expect(reqs(r)).toEqual(['pauseVideo(stall)@8983.33'])
    expect(r.source).toBe('novideo')
  }) // prettier-ignore
})

describe('動画ありの表 m3-04.json（期待値 (8)、§7-30）', () => {
  const TABLE = buildVideoTable(SONGS)
  const expected = parseTable(
    readFileSync(path.join(root, 'tests', 'harness', 'expected', 'm3-04.json'), 'utf8'),
  )

  it('6 曲 × 2 プロファイル × 2 筋書き（ableton、フレーム 120）＝ 24 行。2 回作って同じ、期待の表と差分 0', () => {
    expect(TABLE).toHaveLength(24)
    expect(tableText(buildVideoTable(SONGS))).toBe(tableText(TABLE))
    expect(diffTables(expected, TABLE)).toEqual([])
  })

  it('MISS 計 0、飛びの skipped は scale・chroma の 4 行で 1・他は 0、要求は飛び 0・凍結 1 回、音ゲー向けはゲージが 50 を割らず failed 0', () => {
    expect(TABLE.reduce((a, r) => a + r.counts.miss, 0)).toBe(0)
    const jump = TABLE.filter((r) => r.video?.scenario === 'jump')
    expect(jump.filter((r) => r.skipped === 1).map((r) => `${r.song}:${r.profile}`)).toEqual(['scale:beginner', 'scale:gamer', 'chroma:beginner', 'chroma:gamer'])
    expect(jump.every((r) => r.skipped <= 1)).toBe(true)
    expect(TABLE.every((r) => r.video?.requests === (r.video?.scenario === 'jump' ? 0 : 1))).toBe(true)
    const gamer = TABLE.filter((r) => r.profile === 'gamer')
    expect(gamer.every((r) => r.gamer !== null && !r.gamer.failed && r.gamer.gauge >= 50)).toBe(true)
  }) // prettier-ignore

  it('twinkle・入門者: 飛びは perfect 42・着地 322.53、凍結は novideo @4,000・perfect 42', () => {
    const [j, f] = TABLE.slice(0, 2)
    expect([j?.counts.perfect, j?.video]).toEqual([42, { scenario: 'jump', source: 'video', resync: 'start,jump', novideoT: null, firstLandMs: 322.53, requests: 0, frames: 1974 }])
    expect([f?.counts.perfect, f?.video]).toEqual([42, { scenario: 'freeze', source: 'novideo', resync: 'start', novideoT: 4000, firstLandMs: null, requests: 1, frames: 1992 }])
  }) // prettier-ignore

  it('行の鍵に筋書き（筋書きだけ違う 2 行は別の鍵）。入れ子の video は読み戻して差分 0、変えれば video.source の形、配列は差分になる', () => {
    const [j, f] = TABLE.slice(0, 2) as [HarnessRow, HarnessRow]
    expect(rowKey(j)).toBe('twinkle ableton/2/octave beginner sd0 vjump')
    expect(rowKey(f)).not.toBe(rowKey(j))
    const { video: _v, ...plain } = j
    expect(rowKey(plain)).toBe('twinkle ableton/2/octave beginner sd0')
    expect(diffTables(parseTable(tableText(TABLE)), TABLE)).toEqual([])
    const changed = { ...j, video: { ...(j.video as NonNullable<HarnessRow['video']>), source: 'novideo' as const } }
    expect(diffTables([j], [changed])).toEqual([{ kind: 'changed', key: rowKey(j), column: 'video.source', before: 'video', after: 'novideo' }])
    // 配列の列は === で比べるので、読み戻すたびに差分になる（だから resync は文字列にした）
    const arr = { ...j, video: { ...j.video, resync: ['start', 'jump'] } } as unknown as HarnessRow
    expect(diffTables(parseTable(tableText([arr])), [arr])).toHaveLength(1)
  }) // prettier-ignore
})
