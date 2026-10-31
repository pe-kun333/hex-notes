import { describe, expect, it } from 'vitest'
import {
  BAND_ORDER,
  bandOutside,
  bandStep,
  bandsOf,
  imeDetail,
  initialBands,
  type BandEvent,
  type BandKind,
  type BandsState,
} from '../../../src/app/bands.ts'
import { LATE_BAND_MS } from '../../../src/audio/scheduler.ts'
import { emptyInputState, handleKey, type KeyEventRecord } from '../../../src/input/keyboard.ts'
import { IME_BAND_TEXT } from '../../../src/input/ime.ts'
import {
  STORAGE_FAIL_BAND_TEXT,
  memoryStorage,
  safeStorage,
  type StorageFailure,
} from '../../../src/storage/fallback.ts'

// src/app/bands.ts（M1-13、M1 の手順 2）。出どころ: tests-inventory「M1 手順 2 帯 bandsOf」、decisions #26 (5)・#29 (c)・
// #47 (c)・#50 (a)(g)・#65（仮）、m6 bandsHtml L790–803。入力層（handleKey）と保存層（safeStorage）を通した知らせで確かめる。

const run = (events: readonly BandEvent[], s: BandsState = initialBands()): BandsState =>
  events.reduce(bandStep, s)
const OFF = { imeStop: false }
const kinds = (s: BandsState): string[] => bandsOf(s, OFF).map((b) => b.kind)

const key = (code: string, over: Partial<KeyEventRecord> = {}): KeyEventRecord => ({
  type: 'keydown',
  code,
  timeStamp: 100,
  repeat: false,
  isComposing: false,
  keyCode: 0,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...over,
})

describe('IME の帯（入力層の imeBand をそのまま写す）', () => {
  it('IME の keydown を 3 回 → 帯 1 件。演奏の keydown で消える（閉じるは出さない）', () => {
    let input = emptyInputState()
    let bands = initialBands()
    const feed = (rec: KeyEventRecord): void => {
      const r = handleKey(input, rec, 200)
      input = r.state
      for (const ev of r.events)
        if (ev.kind === 'imeBand') bands = bandStep(bands, { kind: 'ime', on: ev.on })
    }
    for (let i = 0; i < 3; i++) feed(key('KeyA', { keyCode: 229 }))
    expect(bandsOf(bands, OFF)).toEqual([
      {
        kind: 'ime',
        title: IME_BAND_TEXT,
        detail: '日本語入力中の打鍵は無視します。曲は止めません。',
        dismissible: false,
      },
    ])
    feed(key('KeyS'))
    expect(bandsOf(bands, OFF)).toEqual([])
  })

  it('本文は m6 L800 の「曲は止めません。」。S6 の「IME 検知時に曲を止める」が ON なら止める旨に替える', () => {
    const s = run([{ kind: 'ime', on: true }])
    expect(imeDetail(false)).toBe('日本語入力中の打鍵は無視します。曲は止めません。')
    expect(imeDetail(true)).toBe('日本語入力中の打鍵は無視します。曲は一時停止します。')
    expect(bandsOf(s, { imeStop: true })[0]?.detail).toBe(imeDetail(true))
  })

  it('閉じる（dismiss）は効かない。同じ値の知らせは同じ state を返す', () => {
    const s = run([{ kind: 'ime', on: true }])
    expect(bandStep(s, { kind: 'dismiss', band: 'ime' })).toBe(s)
    expect(bandStep(s, { kind: 'ime', on: true })).toBe(s)
    expect(kinds(s)).toEqual(['ime'])
  })
})

describe('保存できません（S7d。置き場ごとに 1 回、#50 (a)）', () => {
  it('localStorage が 2 回失敗 → 知らせ 1 回 → 帯 1 件。文言は #50 (g)', () => {
    const fails: StorageFailure[] = []
    const kv = safeStorage(
      'local',
      () => ({
        getItem: () => null,
        setItem: () => {
          throw new DOMException('満杯', 'QuotaExceededError')
        },
        removeItem: () => {},
      }),
      (f) => fails.push(f),
    )
    expect(kv.set('a', '1')).toBe(false)
    expect(kv.set('b', '2')).toBe(false)
    expect(fails).toHaveLength(1)
    const s = run(fails.map((f) => ({ kind: 'storageFail', area: f.area })))
    const b = bandsOf(s, OFF)
    expect(b).toHaveLength(1)
    expect(`${b[0]?.title}。${b[0]?.detail}`).toBe(STORAGE_FAIL_BAND_TEXT)
    expect(b[0]?.dismissible).toBe(true)
  })

  it('閉じた後、同じ置き場の知らせでは開かず、別の置き場の知らせで開き直す', () => {
    const s = run([
      { kind: 'storageFail', area: 'local' },
      { kind: 'dismiss', band: 'storageFail' },
    ])
    expect(kinds(s)).toEqual([])
    expect(bandStep(s, { kind: 'storageFail', area: 'local' })).toBe(s)
    const t = bandStep(s, { kind: 'storageFail', area: 'idb' })
    expect(kinds(t)).toEqual(['storageFail'])
    expect(t.storageFail).toEqual(['local', 'idb'])
  })

  it('壊れない置き場（memoryStorage）では知らせが来ない', () => {
    const fails: StorageFailure[] = []
    const kv = safeStorage(
      'session',
      () => memoryStorage(),
      (f) => fails.push(f),
    )
    expect(kv.set('a', '1')).toBe(true)
    expect(fails).toEqual([])
  })
})

describe('低負荷（段が上がったら帯。自動では上げない、#29 (c)）', () => {
  it('段 1 → 2 → 3 で帯の文言が変わり、閉じても段が上がれば開き直す', () => {
    const s1 = run([{ kind: 'lowLoad', level: 1 }])
    expect(bandsOf(s1, OFF)[0]?.detail).toBe(
      '動きが重いので、光る演出を止めました。設定で戻せます。',
    )
    const closed = bandStep(s1, { kind: 'dismiss', band: 'lowLoad' })
    expect(kinds(closed)).toEqual([])
    const s2 = bandStep(closed, { kind: 'lowLoad', level: 2 })
    expect(kinds(s2)).toEqual(['lowLoad'])
    expect(bandsOf(s2, OFF)[0]?.detail).toBe(
      '動きが重いので、光る演出と和音の殻を止めました。設定で戻せます。',
    )
    const s3 = bandStep(s2, { kind: 'lowLoad', level: 3 })
    expect(bandsOf(s3, OFF)[0]?.detail).toBe(
      '動きが重いので、光る演出・和音の殻・奥行きを止めました。設定で戻せます。',
    )
  })

  it('同じ段の知らせ（毎フレーム送っても）は同じ state を返す（殻は === で描き直しを省く）', () => {
    const s = run([{ kind: 'lowLoad', level: 2 }])
    expect(bandStep(s, { kind: 'lowLoad', level: 2 })).toBe(s)
    const z = initialBands()
    expect(bandStep(z, { kind: 'lowLoad', level: 0 })).toBe(z)
  })

  it('S6 で戻した（段が下がる）なら開き直さず、0 で帯が消える', () => {
    const s = run([
      { kind: 'lowLoad', level: 2 },
      { kind: 'dismiss', band: 'lowLoad' },
      { kind: 'lowLoad', level: 1 },
    ])
    expect(kinds(s)).toEqual([])
    expect(
      kinds(
        run([
          { kind: 'lowLoad', level: 1 },
          { kind: 'lowLoad', level: 0 },
        ]),
      ),
    ).toEqual([])
  })
})

describe('予約の遅れ（#47 (c)）と自動再生ブロック', () => {
  it('予約の遅れ → 帯（20 ms の文言）。新しい回（off）の後にまた遅れたら開き直す', () => {
    const s = run([{ kind: 'audioLate', on: true }])
    expect(bandsOf(s, OFF)[0]?.detail).toContain(`${LATE_BAND_MS} ms`)
    const closed = bandStep(s, { kind: 'dismiss', band: 'audioLate' })
    expect(bandStep(closed, { kind: 'audioLate', on: true })).toBe(closed)
    const again = run(
      [
        { kind: 'audioLate', on: false },
        { kind: 'audioLate', on: true },
      ],
      closed,
    )
    expect(kinds(again)).toEqual(['audioLate'])
  })

  it('自動再生ブロック（M3 まで文言だけ）。m6 L799 の文言', () => {
    const s = run([{ kind: 'autoplayBlocked', on: true }])
    expect(bandsOf(s, OFF)[0]).toMatchObject({
      title: '再生はクリックで始めます',
      detail: '自動再生がブロックされました。プレイヤーの ▶ を押してください。',
      dismissible: true,
    })
  })

  it('IME 以外の 4 種は「閉じる」を出し、閉じると消える', () => {
    const shown: Record<Exclude<BandKind, 'ime'>, BandEvent> = {
      autoplayBlocked: { kind: 'autoplayBlocked', on: true },
      audioLate: { kind: 'audioLate', on: true },
      lowLoad: { kind: 'lowLoad', level: 1 },
      storageFail: { kind: 'storageFail', area: 'local' },
    }
    for (const [kind, ev] of Object.entries(shown) as [BandKind, BandEvent][]) {
      const s = run([ev])
      expect(bandsOf(s, OFF)).toEqual([expect.objectContaining({ kind, dismissible: true })])
      expect(kinds(bandStep(s, { kind: 'dismiss', band: kind }))).toEqual([])
    }
  })

  it('全部出ていれば BAND_ORDER の順（ime → 自動再生 → 予約の遅れ → 低負荷 → 保存できません）', () => {
    const s = run([
      { kind: 'storageFail', area: 'idb' },
      { kind: 'lowLoad', level: 3 },
      { kind: 'audioLate', on: true },
      { kind: 'autoplayBlocked', on: true },
      { kind: 'ime', on: true },
    ])
    // m6 L790–803 の ime → 自動再生 → 保存できません の間に、予約の遅れと低負荷（BAND_ORDER 自身と比べない）
    expect(kinds(s)).toEqual(['ime', 'autoplayBlocked', 'audioLate', 'lowLoad', 'storageFail'])
    expect(BAND_ORDER).toEqual(kinds(s))
  })
})

describe('帯がプレイヤー矩形の外か（dev ビルドの assert）', () => {
  // S2: プレイヤー矩形 480×270（左 12・上 12）、帯は HUD の下
  const player = { left: 12, top: 12, right: 492, bottom: 282 }

  it('左列の HUD の下の帯は外。辺が接するだけなら外（下・右・上・左の 4 辺）', () => {
    expect(bandOutside({ left: 12, top: 380, right: 492, bottom: 430 }, player)).toBe(true)
    expect(bandOutside({ left: 12, top: 282, right: 492, bottom: 330 }, player)).toBe(true)
    expect(bandOutside({ left: 492, top: 12, right: 900, bottom: 60 }, player)).toBe(true)
    // 矩形の上に隙間 0 で置いた形（m6 の #bands）と、左で接する形
    expect(bandOutside({ left: 12, top: 0, right: 492, bottom: 12 }, player)).toBe(true)
    expect(bandOutside({ left: 0, top: 100, right: 12, bottom: 140 }, player)).toBe(true)
  })

  it('1 px でも重なれば外でない（m6 の #bands を矩形の上に重ねた形など）', () => {
    expect(bandOutside({ left: 12, top: 0, right: 492, bottom: 13 }, player)).toBe(false)
    expect(bandOutside({ left: 491, top: 100, right: 600, bottom: 140 }, player)).toBe(false)
    expect(bandOutside({ left: 100, top: 100, right: 200, bottom: 140 }, player)).toBe(false)
  })

  it('幅か高さが 0 の帯（隠れている）は外', () => {
    expect(bandOutside({ left: 100, top: 100, right: 100, bottom: 140 }, player)).toBe(true)
    expect(bandOutside({ left: 100, top: 100, right: 200, bottom: 100 }, player)).toBe(true)
  })
})
