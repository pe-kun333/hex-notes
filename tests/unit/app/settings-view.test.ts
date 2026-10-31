import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { versionChoice } from '../../../src/app/home-view.ts'
import { creditOf } from '../../../src/app/screens/settings.ts'
import { ACCOMP_STEPS, SETTING_GROUPS, controlById } from '../../../src/app/settings-view.ts'
import { physOffFor } from '../../../src/layout/stagger.ts'
import { buildKeyboardGrid } from '../../../src/render/hex/grid.ts'
import type { Chart } from '../../../src/shared/types.ts'
import { memoryStorage, safeStorage } from '../../../src/storage/fallback.ts'
import {
  LOCAL_KEYS,
  defaultSettings,
  parseSettings,
  saveDevice,
  type Settings,
} from '../../../src/storage/local.ts'
import { BOOTED_KEY, isFirstRun, markBooted } from '../../../src/storage/session.ts'

// src/app/settings-view.ts・S6 の部品（M1-07、M1 の手順 10）。出どころ: m1-kickoff 手順 10 の期待値（設定を変えても自己ベストの
// 鍵は変わらない、上限で譜面版が変わる、既定へ戻す、端末の初期化）・完了条件「設定を変えても記録が混ざらない」（§5.2 L238）、
// design.md §1.3 S6・§4.3、decisions #45 (d)（物理せん断の描画）・#52・#72、tests-inventory「M1 手順 10」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TWINKLE = JSON.parse(
  readFileSync(path.join(root, 'content', 'charts', 'pd', 'twinkle.json'), 'utf8'),
) as Chart
const CONTROLS = SETTING_GROUPS.flatMap((g) => g.controls)

/** 自己ベストの鍵（S1 が自動で選ぶ版 → (chartId, variantId, profile, clock)） */
function bestKey(s: Settings, deviceLimit: 2 | 3 | 4 | null): string {
  const p = versionChoice(TWINKLE, s.layout, deviceLimit).pick
  return `${TWINKLE.id}|${p?.layout}/${p?.limit}/${p?.fold}|${s.profile}|novideo`
}

describe('S6 の項目（m6 renderS6、§7-11）', () => {
  it('どの項目も選んだ値がそのまま読め、他の項目は変わらない（保存の往復も同じ）', () => {
    const base = defaultSettings()
    for (const c of CONTROLS)
      for (const ch of c.choices) {
        const s = c.set(base, ch.value)
        expect(c.get(s), `${c.id}=${ch.value}`).toBe(ch.value)
        expect(parseSettings(JSON.parse(JSON.stringify(s)))).toEqual(s)
        for (const other of CONTROLS) if (other.id !== c.id && !(c.id === 'geometry' && other.id === 'stagger')) expect(other.get(s), `${c.id} → ${other.id}`).toBe(other.get(base))
      }
  }) // prettier-ignore

  it('M1 で出さない物（プロファイル切替・判定窓・対照 W–H）は無い。群の順は m6 のまま', () => {
    expect(SETTING_GROUPS.map((g) => g.title)).toEqual(['配列', '幾何', '着地と判定', 'ラベル（9 マス）', '色と演出', '音', '入力'])
    expect(controlById('profile')).toBeUndefined()
    expect(controlById('layout')?.choices.map((c) => c.value)).toEqual(['ableton', 'vmpk'])
    expect(controlById('nope')).toBeUndefined()
  }) // prettier-ignore

  it('知らない値は既定の側へ、段ずれは表に無ければ null（自作の値）、伴奏の音量は 5 段', () => {
    const base = defaultSettings()
    expect(controlById('legend')?.set(base, 'x').legend).toBe('auto')
    expect(controlById('labels.kb')?.set(base, 'x').labels.kb).toBe('key')
    expect(controlById('stagger')?.get({ ...base, stagger: [0.47, 0.26, 0.52] })).toBe(null)
    expect(controlById('stagger')?.set(base, 'nope')).toBe(base)
    expect(
      controlById('audio.accompVolume')?.get({
        ...base,
        audio: { ...base.audio, accompVolume: 0.4 },
      }),
    ).toBe(null)
    expect(controlById('audio.accompVolume')?.set(base, '0.3')).toBe(base)
    expect(ACCOMP_STEPS).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('既定へ戻す ＝ defaultSettings（入門者の既定）', () => {
    const changed = CONTROLS.reduce(
      (s, c) => c.set(s, c.choices.at(-1)?.value ?? ''),
      defaultSettings(),
    )
    expect(changed).not.toEqual(defaultSettings())
    expect(parseSettings(defaultSettings())).toEqual(defaultSettings())
  })
})

describe('設定を変えても記録が混ざらない（完了条件）', () => {
  it('配列以外の項目をどう変えても自己ベストの鍵は同じ。配列を変えると別の版の鍵、上限を変えても別の鍵', () => {
    const base = defaultSettings()
    const k0 = bestKey(base, 2)
    for (const c of CONTROLS) {
      if (c.id === 'layout') continue
      for (const ch of c.choices)
        expect(bestKey(c.set(base, ch.value), 2), `${c.id}=${ch.value}`).toBe(k0)
    }
    expect(bestKey(controlById('layout')?.set(base, 'vmpk') ?? base, 2)).not.toBe(k0)
    // 端末の上限を上げても自動で選ぶのは上限 2（同じ鍵）。上限 3 の版を選べば別の鍵
    expect(bestKey(base, 3)).toBe(k0)
    expect(versionChoice(TWINKLE, 'ableton', 3).limits.find((l) => l.limit === 3)?.allowed).toBe(
      true,
    )
    expect(`${TWINKLE.id}|ableton/3/octave|beginner|novideo`).not.toBe(k0)
  })
})

describe('端末プロファイルの初期化（S6 → S0）', () => {
  it('device と booted を消すと初回（isFirstRun 真）', () => {
    const local = safeStorage(
      'local',
      () => memoryStorage(),
      () => {},
    )
    const session = safeStorage(
      'session',
      () => memoryStorage(),
      () => {},
    )
    saveDevice(local, { limit: 3, at: '2026-11-01T00:00:00.000Z', layoutMapOk: true })
    markBooted(session)
    expect(isFirstRun(local, session)).toBe(false)
    local.remove(LOCAL_KEYS.device)
    expect(isFirstRun(local, session)).toBe(false)
    session.remove(BOOTED_KEY)
    expect(isFirstRun(local, session)).toBe(true)
  })
})

describe('物理せん断の鍵盤図（decisions #45 (d)）', () => {
  it('段ずれの物理座標でセルの x をずらし、正六角の幅の真ん中に置く。段・列（隣と辺ヒント）は変えない', () => {
    const reg = buildKeyboardGrid('vmpk', 28, { left: 0, top: 0 })
    const phys = buildKeyboardGrid('vmpk', 28, { left: 0, top: 0 }, undefined, physOffFor([0.5, 0.25, 0.5]))
    expect(phys.cells.map((c) => [c.code, c.row, c.col, c.cy])).toEqual(reg.cells.map((c) => [c.code, c.row, c.col, c.cy]))
    expect([...phys.byCode.entries()].map(([k, v]) => [k, v.row, v.col])).toEqual([...reg.byCode.entries()].map(([k, v]) => [k, v.row, v.col]))
    const hexW = Math.sqrt(3) * 28
    const x = (g: typeof reg, code: string) => g.cells.find((c) => c.code === code)?.cx ?? NaN
    // 段の間の x の差: 正六角は 1/2 セルずつ、物理は 1/2・1/4・1/2 キー幅
    expect((x(reg, 'KeyQ') - x(reg, 'Digit1')) / hexW).toBeCloseTo(0.5, 9)
    expect((x(phys, 'KeyQ') - x(phys, 'Digit1')) / hexW).toBeCloseTo(0.5, 9)
    expect((x(phys, 'KeyA') - x(phys, 'KeyQ')) / hexW).toBeCloseTo(0.25, 9)
    expect((x(phys, 'KeyZ') - x(phys, 'KeyA')) / hexW).toBeCloseTo(0.5, 9)
    // 物理の方が狭い（1.25 ＜ 1.5）ので、両端の余りは左右で同じ
    const span = (g: typeof reg) => [Math.min(...g.cells.map((c) => c.cx)), Math.max(...g.cells.map((c) => c.cx))]
    const [a, b] = span(phys)
    const [l, r] = span(reg)
    expect((a ?? 0) - (l ?? 0)).toBeCloseTo((r ?? 0) - (b ?? 0), 9)
    expect(phys.width).toBe(reg.width)
  }) // prettier-ignore
})

describe('クレジット（同梱曲の 1 行）', () => {
  it('曲名・作曲者・出どころ、CC BY は帰属を足す', () => {
    expect(creditOf(TWINKLE)).toBe('きらきら星 — フランス民謡 ・ PD')
    expect(creditOf({ name: 'x', source: { kind: 'bundled', rights: 'cc-by', license: { id: 'CC-BY-4.0', holder: 'A', url: 'https://e.x' } } })).toBe('x ・ CC BY、CC-BY-4.0 A（https://e.x）')
    expect(creditOf({ name: 'はじめの六角', source: { kind: 'bundled', rights: 'own' } })).toBe('はじめの六角 ・ 自作')
  }) // prettier-ignore
})
