import { describe, expect, it } from 'vitest'
import { applyProfileDefaults, profileOf } from '../../../src/app/profile.ts'
import { PROFILES } from '../../../src/judge/windows.ts'
import { DEFAULT_LANDING } from '../../../src/render/hex/landing.ts'
import { TRAVEL_MS } from '../../../src/render/hex/sizing.ts'
import { DEFAULT_CHORD_LIMIT } from '../../../src/shared/types.ts'
import { defaultSettings, parseSettings } from '../../../src/storage/local.ts'

// src/app/profile.ts（M1-02、M1 の手順 1）。出どころ: design.md §2.3（入門者 24／100／180 ms・遅れ側 ×1.3、NEAR 1、
// ゲージなし）、§2.2（流れる時間 1.5 s、辺ヒントは入門者のみ）、§1.3 S2（HUD の項目）、decisions #3・#7・#60、
// tests-inventory「M1 手順 1」。数値は PROFILES・TRAVEL_MS と直に比べ、ここにも design の値を書いて二重に固定する。

describe('入門者の既定値（§2 と一致）', () => {
  const b = profileOf('beginner')

  it('窓 24／100／180・遅れ側 ×1.3・NEAR 1・ゲージなし（PROFILES.beginner と同じ物）', () => {
    expect(b.rules).toBe(PROFILES.beginner)
    expect(b.rules.windows).toEqual({ perfect: 24, great: 100, good: 180, lateFactor: 1.3 })
    expect(b.rules.near).toBe(1)
    expect(b.rules.gauge).toBe(false)
    expect(b.failOnGauge).toBe(false)
  })

  it('流れる時間 1,500 ms・辺ヒント ON・着地 cell・上限の既定 2・ラベル kb key／note both', () => {
    expect(b.travelMs).toBe(1500)
    expect(b.travelMs).toBe(TRAVEL_MS.beginner)
    expect(b.hints).toBe(true)
    expect(b.landing).toBe('cell')
    expect(b.landing).toBe(DEFAULT_LANDING)
    expect(b.limit).toBe(2)
    expect(b.limit).toBe(DEFAULT_CHORD_LIMIT)
    expect(b.labels).toEqual({ kb: 'key', note: 'both' })
  })

  it('HUD は曲名・進行・精度% だけ（ランク・ゲージ・コンボ・ハイスピード・FAST／SLOW は無い）', () => {
    expect(b.hud).toEqual(['title', 'progress', 'accuracy'])
    for (const g of ['rank', 'gauge', 'combo', 'hispeed', 'fastSlow'] as const)
      expect(b.hud).not.toContain(g)
  })

  it('設定の既定値は入門者の既定と同じ（defaultSettings ＝ applyProfileDefaults(…, beginner)）', () => {
    const d = defaultSettings()
    expect(d.profile).toBe('beginner')
    expect(d.labels).toEqual(b.labels)
    expect(d.hints).toBe(b.hints)
    expect(d.landing).toBe(b.landing)
    expect(applyProfileDefaults(d, 'beginner')).toEqual(d)
  })
})

describe('音ゲー向け（M2-05 の下地。型と既定だけ）', () => {
  const g = profileOf('gamer')

  it('窓 30／90／200・×1.0・NEAR 0・ゲージあり・1,000 ms・辺ヒントなし', () => {
    expect(g.rules).toBe(PROFILES.gamer)
    expect(g.rules.windows).toEqual({ perfect: 30, great: 90, good: 200, lateFactor: 1 })
    expect(g.rules.near).toBe(0)
    expect(g.failOnGauge).toBe(true)
    expect(g.travelMs).toBe(1000)
    expect(g.hints).toBe(false)
    expect(g.limit).toBe(2)
    expect(g.hud).toEqual([
      'title',
      'progress',
      'accuracy',
      'rank',
      'gauge',
      'combo',
      'hispeed',
      'fastSlow',
    ])
  })

  it('applyProfileDefaults は profile・labels・hints・landing だけを入れ替え、他は保つ', () => {
    const s = parseSettings({
      ...defaultSettings(),
      layout: 'vmpk',
      legend: 'us',
      landing: 'line',
      labels: { kb: 'none', note: 'none' },
      audio: { guide: false, metronome: true, keyclick: false, accompVolume: 0.5 },
    })
    const out = applyProfileDefaults(s, 'gamer')
    expect(out.profile).toBe('gamer')
    expect(out.labels).toEqual(g.labels)
    expect(out.hints).toBe(false)
    expect(out.landing).toBe('cell')
    expect(out.layout).toBe('vmpk')
    expect(out.legend).toBe('us')
    expect(out.audio).toEqual({ guide: false, metronome: true, keyclick: false, accompVolume: 0.5 })
    expect(applyProfileDefaults(out, 'beginner')).toEqual({
      ...out,
      profile: 'beginner',
      labels: { kb: 'key', note: 'both' },
      hints: true,
    })
  })
})
