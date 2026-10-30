import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFrame } from '../../../../src/render/canvas/commands.ts'
import {
  bboxOf,
  canonicalFrame,
  inRegion,
  regionsOf,
} from '../../../../src/render/canvas/primitives.ts'
import { FRAME_DIR, SONGS, VARIANT_IDS, initialInput, setup } from './frame-setup.ts'

// 「同じ絵」（design.md §5.1 M0-03b「m1' の 6 曲が同じ絵」、台帳 手順 6、decisions #28（仮））: 6 曲×2 配列の初期フレームの
// コマンド列を tests/fixtures/render/frames/ のスナップショットと照合する。譜面は variants.ts の譜面版（kickoff §7-23）。
// 入力: 箱 850×644（1366×668 の右列）、t 0、押下なし、演出なし、入門者（1.5 s）、文字 both、辺ヒントあり、段別着地。
// 照合の前に R 28・v 0.3587（ableton）／0.3027（vmpk）を断定する（decisions #24）。作り直しは `npx vitest run -u`。

const V_EXPECTED: Readonly<Record<string, number>> = { ableton: 0.3587, vmpk: 0.3027 }

describe('初期フレームのスナップショット（12 本）', () => {
  for (const song of SONGS)
    for (const vid of VARIANT_IDS) {
      const s = setup(song, vid)
      const layout = vid.split('/')[0] ?? ''
      it(`${song}・${vid}`, async () => {
        expect(s.sizing.R).toBe(28)
        expect(s.sizing.v).toBeCloseTo(V_EXPECTED[layout] ?? Number.NaN, 4)
        const cmds = buildFrame(initialInput(s))
        const rg = regionsOf(s.sizing)
        expect(cmds.filter((c) => !inRegion(bboxOf(c), c.region, rg))).toEqual([])
        const file = path.join(FRAME_DIR, `${song}.${vid.replaceAll('/', '-')}.t0.json`)
        await expect(canonicalFrame(cmds)).toMatchFileSnapshot(file)
      })
    }
})
