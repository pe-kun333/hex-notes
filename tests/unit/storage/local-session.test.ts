import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fadeAfter, initialFade } from '../../../src/judge/self-rate.ts'
import { DEFAULT_STAGGER } from '../../../src/layout/stagger.ts'
import { memoryStorage, safeStorage, type KvStore } from '../../../src/storage/fallback.ts'
import {
  LOCAL_KEYS,
  defaultSettings,
  loadCalibration,
  loadDevice,
  loadFade,
  loadSettings,
  offsetFor,
  parseCalibration,
  parseDevice,
  parseAudio,
  parseFade,
  parseLimit,
  parseSettings,
  readJson,
  saveCalibration,
  saveDevice,
  saveFade,
  saveSettings,
} from '../../../src/storage/local.ts'
import { BOOTED_KEY, isBooted, isFirstRun, markBooted } from '../../../src/storage/session.ts'

// src/storage/local.ts・session.ts。出どころ: design.md §4.3・§1.2、kickoff 手順 11 の期待値（'7' → 4。m1' L269 の丸めを直す）、
// m1' L269・L470、m3 L665（行番号で切り出して照合）、decisions #25・#40・#41・#42・#45・#52（仮）。

const AT = '2026-10-31T00:00:00.000Z'
const MOCKS = new URL('../../../docs/planning/mocks/', import.meta.url)
const lines = (f: string): string[] =>
  readFileSync(fileURLToPath(new URL(f, MOCKS)), 'utf8').split('\n')
const M1 = lines('m1-geometry.html')
const M3 = lines('m3-clock-judge.html')
function line(src: string[], n: number, head: string): string {
  const s = src[n - 1] ?? ''
  if (!s.trimStart().startsWith(head)) throw new Error(`モックの行がずれた: L${n}`)
  return s
}

const kv = (): KvStore =>
  safeStorage(
    'local',
    () => memoryStorage(),
    () => {},
  )

describe("同時押し上限 parseLimit（m1' L269 の 2..6 → 2..4）", () => {
  // m1' L269: `if (v) state.limit = Math.max(2, Math.min(6, +v))`
  const m1Read = new Function(
    'localStorage',
    'state',
    line(M1, 269, "try { const v = localStorage.getItem('hexnote.limit')") + '\nreturn state.limit',
  ) as (ls: { getItem(k: string): string | null }, state: { limit: number }) => number
  const viaM1 = (v: string): number => m1Read({ getItem: () => v }, { limit: 2 })

  it("kickoff の期待値: '7' → 4（m1' は 6）", () => {
    expect(parseLimit('7')).toBe(4)
    expect(viaM1('7')).toBe(6)
  })

  it("m1' L470 が書く 2・3・4 は m1' と同じに読む", () => {
    for (const v of ['2', '3', '4']) expect(parseLimit(v)).toBe(viaM1(v))
  })

  it.each([
    ['3.4', 3],
    ['3.5', 4],
    ['1', 2],
    ['-5', 2],
    [' 3 ', 3],
    [6, 4],
    [2.49, 2],
  ] as const)('%j → %d（四捨五入して 2..4）', (x, want) => {
    expect(parseLimit(x)).toBe(want)
  })

  it.each([[''], ['  '], ['abc'], [null], [undefined], [Infinity], [Number.NaN], [true], [[3]]])(
    '%j → null',
    (x) => {
      expect(parseLimit(x)).toBe(null)
    },
  )
})

describe('設定 hexnote.settings（v:1）', () => {
  it('無い・壊れた JSON・版違い・オブジェクトでない → 既定値', () => {
    const k = kv()
    expect(loadSettings(k)).toEqual(defaultSettings())
    k.set(LOCAL_KEYS.settings, '{not json')
    expect(readJson(k, LOCAL_KEYS.settings)).toBeUndefined()
    expect(loadSettings(k)).toEqual(defaultSettings())
    for (const raw of [null, 'x', [], { v: 2, layout: 'vmpk' }, { layout: 'vmpk' }])
      expect(parseSettings(raw)).toEqual(defaultSettings())
  })

  it('既定値（profile beginner・ableton・octave・刻印 auto・正六角・ANSI の段ずれ・ラベル 鍵盤側 key／ノート側 both〔#60〕・M1 の項目〔#58〕）', () => {
    expect(defaultSettings()).toEqual({
      v: 1,
      profile: 'beginner',
      layout: 'ableton',
      fold: 'octave',
      legend: 'auto',
      geometry: 'regular',
      stagger: DEFAULT_STAGGER,
      staggers: [],
      labels: { kb: 'key', note: 'both' },
      hints: true,
      landing: 'cell',
      audio: { guide: true, metronome: false, keyclick: true, accompVolume: 1 },
      fx: { budget: 'standard', lowload: 'auto' },
      imeStop: false,
    })
  })

  it('M1 の項目（hints・landing・audio・fx・imeStop）が無い M0 の JSON は既定値で読め、版は 1 のまま', () => {
    const m0 = {
      v: 1,
      profile: 'beginner',
      layout: 'vmpk',
      fold: 'octave',
      legend: 'jis',
      geometry: 'regular',
      stagger: [0.5, 0.25, 0.5],
      staggers: [],
      labels: { kb: 'note', note: 'none' },
    }
    const s = parseSettings(m0)
    expect(s.v).toBe(1)
    expect(s.layout).toBe('vmpk')
    expect(s.labels).toEqual({ kb: 'note', note: 'none' })
    expect(s.hints).toBe(true)
    expect(s.landing).toBe('cell')
    expect(s.audio).toEqual({ guide: true, metronome: false, keyclick: true, accompVolume: 1 })
    expect(s.fx).toEqual({ budget: 'standard', lowload: 'auto' })
    expect(s.imeStop).toBe(false)
  })

  it('M1 の項目は項目ごとに検査し、悪い物（文字の真偽・範囲外・知らない値）だけ既定値', () => {
    const s = parseSettings({
      v: 1,
      hints: 'yes',
      landing: 'line',
      audio: { guide: false, metronome: 1, keyclick: true, accompVolume: 1.5 },
      fx: { budget: 'none', lowload: 'sometimes' },
      imeStop: true,
    })
    expect(s.hints).toBe(true)
    expect(s.landing).toBe('line')
    expect(s.audio).toEqual({ guide: false, metronome: false, keyclick: true, accompVolume: 1 })
    expect(s.fx).toEqual({ budget: 'none', lowload: 'auto' })
    expect(s.imeStop).toBe(true)
    expect(parseSettings({ v: 1, audio: 'loud', fx: [], landing: 'cells' })).toEqual(
      defaultSettings(),
    )
    expect(parseSettings({ v: 1, audio: { accompVolume: 0 } }).audio.accompVolume).toBe(0)
    expect(parseSettings({ v: 1, audio: { accompVolume: -0.1 } }).audio.accompVolume).toBe(1)
    expect(parseSettings({ v: 1, audio: { accompVolume: NaN } }).audio.accompVolume).toBe(1)
    for (const bad of ['0.5', true, null, [0.5], {}])
      expect(parseSettings({ v: 1, audio: { accompVolume: bad } }).audio.accompVolume).toBe(1)
  })

  it('accompVolume の境界（0 と 1 を含む）は既定と違う base で固定する', () => {
    const base = { ...defaultSettings().audio, accompVolume: 0.5 }
    expect(parseAudio({ accompVolume: 1 }, base).accompVolume).toBe(1)
    expect(parseAudio({ accompVolume: 0 }, base).accompVolume).toBe(0)
    expect(parseAudio({ accompVolume: 1.000001 }, base).accompVolume).toBe(0.5)
    expect(parseAudio({ accompVolume: -1e-9 }, base).accompVolume).toBe(0.5)
    expect(parseAudio({ accompVolume: '1' }, base).accompVolume).toBe(0.5)
    expect(parseAudio('loud', base)).toBe(base)
  })

  it('項目ごとに悪い物だけ既定値。別名 garage → ableton・fl → vmpk。知らない項目は捨てる', () => {
    const s = parseSettings({
      v: 1,
      profile: 'gamer',
      layout: 'fl',
      fold: 'bogus',
      legend: 'jis',
      geometry: 'fallback',
      stagger: [0, 2, 0],
      staggers: [
        { name: 'mine', v: [0.25, 0.25, 0.25] },
        { name: '', v: [0, 0, 0] },
        { name: 'bad', v: [1, 2] },
        7,
      ],
      labels: { kb: 'none', note: 'nope' },
      extra: 1,
    })
    expect(s).toEqual({
      v: 1,
      profile: 'gamer',
      layout: 'vmpk',
      fold: 'octave',
      legend: 'jis',
      geometry: 'fallback',
      stagger: DEFAULT_STAGGER,
      staggers: [{ name: 'mine', v: [0.25, 0.25, 0.25] }],
      labels: { kb: 'none', note: 'both' },
      hints: true,
      landing: 'cell',
      audio: { guide: true, metronome: false, keyclick: true, accompVolume: 1 },
      fx: { budget: 'standard', lowload: 'auto' },
      imeStop: false,
    })
    expect(parseSettings({ v: 1, layout: 'garage' }).layout).toBe('ableton')
    expect(parseSettings({ v: 1, layout: 'constructor' }).layout).toBe('ableton')
  })

  it('書いて読むと同じ（JSON の往復）', () => {
    const k = kv()
    const s = {
      ...defaultSettings(),
      layout: 'wicki' as const,
      stagger: [0.5, 0.5, 0.5] as const,
      staggers: [{ name: 'u01', v: [0.47, 0.26, 0.52] as const }],
      hints: false,
      landing: 'line' as const,
      audio: { guide: false, metronome: true, keyclick: false, accompVolume: 0.4 },
      fx: { budget: 'light' as const, lowload: 'on' as const },
      imeStop: true,
    }
    expect(saveSettings(k, s)).toBe(true)
    expect(loadSettings(k)).toEqual(s)
  })
})

describe('校正 hexnote.calibration（音源種別ごと）', () => {
  it('種別ごとに別。片方を書いても他方は残る。未校正は 0', () => {
    const k = kv()
    expect(loadCalibration(k)).toEqual({ v: 1 })
    expect(offsetFor(loadCalibration(k), 'audio')).toBe(0)
    saveCalibration(k, 'audio', { offsetMs: -12, at: AT, via: 'tap' })
    saveCalibration(k, 'youtube', { offsetMs: 40, at: AT, via: 'propose' })
    const c = loadCalibration(k)
    expect(offsetFor(c, 'audio')).toBe(-12)
    expect(offsetFor(c, 'youtube')).toBe(40)
    saveCalibration(k, 'audio', { offsetMs: 5, at: AT, via: 'manual' })
    expect(loadCalibration(k)).toEqual({
      v: 1,
      audio: { offsetMs: 5, at: AT, via: 'manual' },
      youtube: { offsetMs: 40, at: AT, via: 'propose' },
    })
  })

  it('±120・1 ms 丸め（decisions #40）。m3 L665 と整数の範囲内では同じ値', () => {
    // m3 L665: `if (saved != null && isFinite(+saved)) S.offset = Math.max(-120, Math.min(120, +saved))`
    const src = line(M3, 665, "try { const saved = localStorage.getItem('hexnote-m3-offset')")
    const body = src.replace(/ \$\('#offset'\)[^}]*/, '')
    const m3Read = new Function('localStorage', 'S', body + '\nreturn S.offset') as (
      ls: { getItem(k: string): string | null },
      S: { offset: number },
    ) => number
    for (const v of [-200, -120, -37, 0, 15, 120, 300]) {
      const ours = parseCalibration({ v: 1, audio: { offsetMs: v, at: AT } }).audio?.offsetMs
      expect(ours).toBe(m3Read({ getItem: () => String(v) }, { offset: 0 }))
    }
    expect(parseCalibration({ v: 1, audio: { offsetMs: 12.6, at: AT } }).audio?.offsetMs).toBe(13)
  })

  it('悪い項目は捨てる（数でない・時刻でない）。via が悪ければ manual', () => {
    expect(
      parseCalibration({
        v: 1,
        audio: { offsetMs: 'x', at: AT },
        youtube: { offsetMs: 3, at: 'yesterday' },
      }),
    ).toEqual({ v: 1 })
    expect(parseCalibration({ v: 1, audio: { offsetMs: 3, at: AT, via: '?' } }).audio?.via).toBe(
      'manual',
    )
    expect(parseCalibration({ audio: { offsetMs: 3, at: AT } })).toEqual({ v: 1 })
  })
})

describe('端末 hexnote.device', () => {
  it('tsResolution は推定できた（正の数）ときだけ書く（decisions #25: 0 と null は書かない）', () => {
    const k = kv()
    saveDevice(k, { limit: 3, at: AT, layoutMapOk: true, tsResolution: 0 })
    expect(JSON.parse(k.get(LOCAL_KEYS.device) ?? '')).toEqual({
      limit: 3,
      at: AT,
      layoutMapOk: true,
    })
    saveDevice(k, { limit: 3, at: AT, layoutMapOk: true, tsResolution: 0.1 })
    expect(loadDevice(k)).toEqual({ limit: 3, at: AT, layoutMapOk: true, tsResolution: 0.1 })
  })

  it('limit か at が読めなければ null（診断をやり直す）。layoutMapOk は true だけ true', () => {
    // 同時押しテストを飛ばした印（M1 の手順 9）。偽だけ残し、真や他の値は書かない（無い ＝ 通した扱い）
    expect(parseDevice({ limit: 2, at: AT, diagnosed: false })).toEqual({
      limit: 2,
      at: AT,
      layoutMapOk: false,
      diagnosed: false,
    })
    expect(parseDevice({ limit: 3, at: AT, diagnosed: true })).toEqual({
      limit: 3,
      at: AT,
      layoutMapOk: false,
    })
    expect(parseDevice({ limit: 3, at: AT, diagnosed: 'no' })).toEqual({
      limit: 3,
      at: AT,
      layoutMapOk: false,
    })
    expect(parseDevice(null)).toBe(null)
    expect(parseDevice({ limit: 'x', at: AT })).toBe(null)
    expect(parseDevice({ limit: 3 })).toBe(null)
    expect(parseDevice({ limit: '7', at: AT, layoutMapOk: 'yes', tsResolution: -1 })).toEqual({
      limit: 4,
      at: AT,
      layoutMapOk: false,
    })
    expect(saveDevice(kv(), { limit: 3, at: 'never', layoutMapOk: true })).toBe(false)
  })
})

describe('足場外し hexnote.fade', () => {
  it('α の鍵は MIDI 0..127 の整数だけ、値は 0..1・小数 3 桁', () => {
    expect(
      parseFade({
        v: 1,
        mode: 'manual',
        manual: 0.33333,
        alpha: {
          '60': 0.5,
          '0': 1.5,
          '127': -1,
          '128': 0.2,
          '-1': 0.2,
          '1.5': 0.2,
          x: 0.2,
          '61': 'a',
          '62': 0.1234,
        },
      }),
    ).toEqual({ mode: 'manual', manual: 0.333, alpha: { 60: 0.5, 0: 1, 127: 0, 62: 0.123 } })
  })

  it('悪い形・版違いは既定値（成績連動・手動 1・α なし）', () => {
    for (const raw of [null, 3, { v: 2, mode: 'manual' }])
      expect(parseFade(raw)).toEqual(initialFade())
    expect(parseFade({ mode: 'other', manual: 'x', alpha: [] })).toEqual(initialFade())
  })

  it('fadeAfter で動かした状態を書いて読むと同じ', () => {
    const k = kv()
    let f = initialFade()
    f = fadeAfter(f, 60, 'solo')
    f = fadeAfter(f, 60, 'hinted')
    f = fadeAfter(f, 62, 'miss')
    expect(saveFade(k, f)).toBe(true)
    expect(JSON.parse(k.get(LOCAL_KEYS.fade) ?? '')).toMatchObject({ v: 1 })
    expect(loadFade(k)).toEqual(f)
  })
})

describe('sessionStorage hexnote.booted と初回の判定', () => {
  it('端末プロファイルが無く、このタブで導線を通していなければ初回', () => {
    const local = kv()
    const session = safeStorage(
      'session',
      () => memoryStorage(),
      () => {},
    )
    expect(isFirstRun(local, session)).toBe(true)
    expect(markBooted(session)).toBe(true)
    expect(session.get(BOOTED_KEY)).toBe('1')
    expect(isFirstRun(local, session)).toBe(false)
    const fresh = safeStorage(
      'session',
      () => memoryStorage(),
      () => {},
    )
    saveDevice(local, { limit: 2, at: AT, layoutMapOk: false })
    expect(isFirstRun(local, fresh)).toBe(false)
  })

  it('保存できない端末: 書けなくてもページの間は導線へ戻らない（ループ防止）', () => {
    const deny = (): never => {
      throw Object.assign(new Error('x'), { name: 'SecurityError' })
    }
    const fails: string[] = []
    const local = safeStorage('local', deny, (f) => void fails.push(f.area))
    const session = safeStorage('session', deny, (f) => void fails.push(f.area))
    expect(isFirstRun(local, session)).toBe(true)
    expect(saveDevice(local, { limit: 2, at: AT, layoutMapOk: false })).toBe(false)
    expect(markBooted(session)).toBe(false)
    expect(isBooted(session)).toBe(true)
    expect(isFirstRun(local, session)).toBe(false)
    expect(fails).toEqual(['local', 'session'])
  })
})
