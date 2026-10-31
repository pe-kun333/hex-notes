import { describe, expect, it } from 'vitest'
import { calibText, limitText } from '../../../src/app/screens/home.ts'
import { ONBOARD_STEPS } from '../../../src/app/screens/onboard.ts'

// 画面の骨組みの文言（M1 の手順 2）。出どころ: design.md §1.3 S1（上帯: 端末の上限・校正の有無）、m1-kickoff 手順 8 の手直し
// （device が無ければ「未診断（2）」）、m6 S0 L240（4 段の名前）。

describe('S1 の上帯', () => {
  it('端末の上限: 診断が無ければ「未診断（2）」、あれば数', () => {
    expect(limitText(null)).toBe('未診断（2）')
    expect(limitText(3)).toBe('3（同時押しテスト済み）')
  })

  it('校正: 無ければ「未校正」、あれば符号付きの ms（＋・−・±）', () => {
    expect(calibText(null)).toBe('未校正')
    expect(calibText(12)).toBe('校正済み（＋12 ms）')
    expect(calibText(-18)).toBe('校正済み（−18 ms）')
    expect(calibText(0)).toBe('校正済み（±0 ms）')
  })
})

describe('S0 の 4 段', () => {
  it('配列の確認 → 同時押しテスト → 校正 → チュートリアル曲（m6 L240）', () => {
    expect(ONBOARD_STEPS).toEqual([
      'a 配列の確認',
      'b 同時押しテスト',
      'c 校正',
      'd チュートリアル曲',
    ])
  })
})
