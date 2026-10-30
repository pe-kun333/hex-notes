// 同音の鍵（M0-07、手順 9）。出どころ: design.md §2.1「VMPK 型の同音は keys が決める（既定「60 以上は Q 段側」）。
// 譜面版の生成器は全配列で「候補が複数なら 60 以上は上の段、60 未満は下の段」」、decisions #21（手順 3 で
// src/chart/variants.ts に置いた規則をここへ移した。#44）、R2 spec 草稿 L22（同音許容 input-03 は「後」）。
// 判定は譜面版の keys の鍵だけを正解にする（同じ音の別の鍵は鍵違い。同音許容は後）。ここは表と純関数だけ。

import type { KeyCode, LayoutId } from '../shared/types.ts'
import { KEY_CODES, LAYOUTS } from './presets.ts'

/** 音高 → 候補の鍵（KEY_CODES の順＝上の段が先） */
export function candidatesOf(layout: LayoutId): Map<number, KeyCode[]> {
  const map = LAYOUTS[layout].map
  const byPitch = new Map<number, KeyCode[]>()
  for (const code of KEY_CODES) {
    if (!Object.hasOwn(map, code)) continue
    const midi = map[code]
    if (midi === undefined) continue
    const list = byPitch.get(midi)
    if (list) list.push(code)
    else byPitch.set(midi, [code])
  }
  return byPitch
}

/** 候補から既定の鍵（60 以上は上の段＝先頭、60 未満は下の段＝末尾。decisions #21） */
export function pickKey(cands: readonly KeyCode[] | undefined, midi: number): KeyCode | null {
  if (!cands || cands.length === 0) return null
  return (midi >= 60 ? cands[0] : cands[cands.length - 1]) ?? null
}

/**
 * 音高 → 押す鍵の既定（decisions #21、仮）。候補が 1 つならそれ。複数（vmpk の 60〜64、wicki）なら
 * 60 以上は上の段、60 未満は下の段（design.md §2.1「60 以上は Q 段側」を全配列に広げた）。無ければ null
 */
export function defaultKeyOf(layout: LayoutId, midi: number): KeyCode | null {
  return pickKey(candidatesOf(layout).get(midi), midi)
}

export type SamePitchGroup = {
  readonly midi: number
  /** 同じ音の鍵（上の段が先） */
  readonly codes: readonly KeyCode[]
  /** 既定の鍵（pickKey） */
  readonly preferred: KeyCode
}

/** 同じ音が 2 つ以上の鍵にある組（音高の昇順）。vmpk は 60〜64 の 5 組、ableton・genshin は無し */
export function samePitchGroups(layout: LayoutId): SamePitchGroup[] {
  const out: SamePitchGroup[] = []
  for (const [midi, codes] of candidatesOf(layout)) {
    const preferred = pickKey(codes, midi)
    if (codes.length >= 2 && preferred !== null) out.push({ midi, codes, preferred })
  }
  return out.sort((a, b) => a.midi - b.midi)
}
