// S0 初回導線の骨組み（M1 の手順 2。中身の S0a〜S0d は手順 9、M1-04）。出どころ: design.md §1.3 S0（4 段とも「あとで」で
// 既定値のまま先へ。全段で IME 帯が効く）、m6 S0 L238–244（段の並び）・ACT s0later L957（「あとで」は S1 へ）、
// decisions #52 (e)（hexnote.booted でこのタブの間は導線へ戻らない）。

import { markBooted } from '../../storage/session.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { button, frame, h } from './frame.ts'

/** 4 段の名前（m6 L240） */
export const ONBOARD_STEPS: readonly string[] = [
  'a 配列の確認',
  'b 同時押しテスト',
  'c 校正',
  'd チュートリアル曲',
]

export function onboardScreen(ctx: ScreenContext): ScreenView {
  const { doc } = ctx
  const f = frame(ctx, 'はじめに', { gear: true })
  const later = (): void => {
    // 「あとで」は既定値のまま S1 へ（端末プロファイルは保存しない。上限が上がるのは診断の通過だけ、M1-04）
    markBooted(ctx.booted.session)
    ctx.go('S1')
  }
  f.body.append(
    h(doc, 'ol', { className: 'steps' }, ...ONBOARD_STEPS.map((s) => h(doc, 'li', { text: s }))),
    h(doc, 'p', {
      className: 'note',
      text: '初回の導線は準備中です。「あとで」で既定値のまま先へ進めます。',
    }),
    h(doc, 'div', { className: 'btnrow' }, button(doc, 'あとで', later, 'primary')),
  )
  return { root: f.root, bandSlot: f.bandSlot, unmount: () => {} }
}
