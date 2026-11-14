import { describe, expect, it } from 'vitest'
import {
  AUTOPLAY_DETAIL,
  AUTOPLAY_TITLE,
  BAND_ORDER,
  SYNC_BAND_DETAIL,
  SYNC_BAND_TITLE,
  bandOutside,
  bandStep,
  bandsOf,
  imeDetail,
  initialBands,
  type BandEvent,
  type BandKind,
  type BandsState,
  VIDEO_FALLBACK_TITLE,
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

  it('IME と S7c 以外の 6 種は「閉じる」を出し、閉じると消える（M3 の手順 6 で sync、M4 の手順 5 で share）', () => {
    const shown: Record<Exclude<BandKind, 'ime' | 'videoFallback'>, BandEvent> = {
      share: { kind: 'share', on: true, title: '題', detail: '本文' },
      sync: { kind: 'sync', on: true },
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

  it('全部出ていれば BAND_ORDER の順（ime → 共有 → 同期中 → S7c → 自動再生 → 予約の遅れ → 低負荷 → 保存できません。8 種）', () => {
    const s = run([
      { kind: 'share', on: true, title: '題', detail: '本文' },
      { kind: 'videoFallback', on: true, enabled: true },
      { kind: 'sync', on: true },
      { kind: 'storageFail', area: 'idb' },
      { kind: 'lowLoad', level: 3 },
      { kind: 'audioLate', on: true },
      { kind: 'autoplayBlocked', on: true },
      { kind: 'ime', on: true },
    ])
    // m6 L790–803 の ime → 自動再生 → 保存できません の間に、予約の遅れと低負荷、ime の次に S7c（M3 の手順 3）、その前に sync
    // （M3 の手順 6、期待値 (9)）。BAND_ORDER 自身と比べない
    expect(kinds(s)).toEqual([
      'ime',
      'share',
      'sync',
      'videoFallback',
      'autoplayBlocked',
      'audioLate',
      'lowLoad',
      'storageFail',
    ])
    expect(BAND_ORDER).toEqual(kinds(s))
  })
})

describe('帯の釦と S7c の仮の帯（M3 の手順 3、期待値 (8)、m3-kickoff §7-22）', () => {
  it('videoFallback を on・enabled 真 → 題は既定（m6 L797 の 19 字）・閉じるなし・釦 {return, 戻す, 真}', () => {
    const s = run([{ kind: 'videoFallback', on: true, enabled: true }])
    expect(bandsOf(s, OFF)).toEqual([
      {
        kind: 'videoFallback',
        title: VIDEO_FALLBACK_TITLE,
        detail: '',
        dismissible: false,
        action: { id: 'return', label: '戻す', enabled: true },
      },
    ])
    expect(VIDEO_FALLBACK_TITLE).toBe('動画が止まったので、ピアノ音で続けます')
    expect([...VIDEO_FALLBACK_TITLE]).toHaveLength(19)
  })

  it('題と活性は画面が渡す（題「プレイヤーの ▶ を押してください」・enabled 偽 → その題と偽）', () => {
    const s = run([{ kind: 'videoFallback', on: true, title: 'プレイヤーの ▶ を押してください', enabled: false }])
    expect(bandsOf(s, OFF)[0]).toMatchObject({
      title: 'プレイヤーの ▶ を押してください',
      action: { id: 'return', label: '戻す', enabled: false },
    })
    // 題を省けば既定に戻る
    expect(bandsOf(bandStep(s, { kind: 'videoFallback', on: true, enabled: false }), OFF)[0]?.title).toBe(VIDEO_FALLBACK_TITLE)
  }) // prettier-ignore

  it('同じ値の知らせと dismiss は同じ state（===）、off で消える。今の 5 種は釦なし', () => {
    const s = run([{ kind: 'videoFallback', on: true, enabled: true }])
    expect(bandStep(s, { kind: 'videoFallback', on: true, enabled: true })).toBe(s)
    expect(bandStep(s, { kind: 'dismiss', band: 'videoFallback' })).toBe(s)
    expect(bandStep(s, { kind: 'videoFallback', on: true, enabled: false })).not.toBe(s)
    expect(kinds(bandStep(s, { kind: 'videoFallback', on: false }))).toEqual([])
    const off = initialBands()
    expect(bandStep(off, { kind: 'videoFallback', on: false })).toBe(off)
    const all = run([
      { kind: 'ime', on: true },
      { kind: 'autoplayBlocked', on: true },
      { kind: 'audioLate', on: true },
      { kind: 'lowLoad', level: 1 },
      { kind: 'storageFail', area: 'local' },
    ])
    expect(bandsOf(all, OFF).every((b) => b.action === undefined)).toBe(true)
  })
})

describe('同期中の帯 sync と自動再生ブロックの文（M3 の手順 6、期待値 (6)(7)(9)、m3-kickoff §7-22・§7-28）', () => {
  it('sync: 見出し「同期中」（m6 L792）・本文・閉じるあり・釦なし。同じ on は同じ state、閉じると消え、偽 → 真で開き直す', () => {
    const s = run([{ kind: 'sync', on: true }])
    expect(bandsOf(s, OFF)).toEqual([{ kind: 'sync', title: SYNC_BAND_TITLE, detail: SYNC_BAND_DETAIL, dismissible: true }])
    expect(SYNC_BAND_TITLE).toBe('同期中')
    expect(SYNC_BAND_DETAIL).toBe('動画が進むのを待っています。広告なら終わるまで待ちます。')
    expect(bandStep(s, { kind: 'sync', on: true })).toBe(s)
    const closed = bandStep(s, { kind: 'dismiss', band: 'sync' })
    expect(kinds(closed)).toEqual([])
    // 閉じた後の同じ on は開き直さない（長引いている間は閉じたまま）。下りてもう一度点けば開き直す
    expect(bandStep(closed, { kind: 'sync', on: true })).toBe(closed)
    expect(kinds(run([{ kind: 'sync', on: false }, { kind: 'sync', on: true }], closed))).toEqual(['sync'])
    expect(kinds(bandStep(s, { kind: 'sync', on: false }))).toEqual([])
    const off = initialBands()
    expect(bandStep(off, { kind: 'sync', on: false })).toBe(off)
  }) // prettier-ignore

  it('autoplayBlocked: 題・本文を省けば今の文、渡せば 2 つ目の文（プレイヤーが隠れている）。文が替わっても閉じたまま', () => {
    const a = run([{ kind: 'autoplayBlocked', on: true }])
    expect(bandsOf(a, OFF)[0]).toMatchObject({ title: AUTOPLAY_TITLE, detail: AUTOPLAY_DETAIL })
    const nv = { kind: 'autoplayBlocked', on: true, title: 'プレイヤーが隠れています', detail: '半分以上が見える位置に戻し、プレイヤーの ▶ を押してください。' } as const
    const b = bandStep(a, nv)
    expect(bandsOf(b, OFF)[0]).toMatchObject({ title: nv.title, detail: nv.detail, dismissible: true })
    expect(bandStep(b, nv)).toBe(b)
    // 閉じた後に文だけ替わっても開き直さない。下りてからの on で開き直す
    const closed = bandStep(b, { kind: 'dismiss', band: 'autoplayBlocked' })
    expect(kinds(bandStep(closed, { kind: 'autoplayBlocked', on: true }))).toEqual([])
    expect(kinds(run([{ kind: 'autoplayBlocked', on: false }, { kind: 'autoplayBlocked', on: true }], closed))).toEqual(['autoplayBlocked'])
    const off = initialBands()
    expect(bandStep(off, { kind: 'autoplayBlocked', on: false })).toBe(off)
  }) // prettier-ignore

  it('定数の順は 8 種 ＝ ime → share → sync → videoFallback → autoplayBlocked → audioLate → lowLoad → storageFail。bands.ts は排他を持たない', () => {
    expect(BAND_ORDER).toEqual(['ime', 'share', 'sync', 'videoFallback', 'autoplayBlocked', 'audioLate', 'lowLoad', 'storageFail'])
    // sync と videoFallback を同時に点けても両方出る（同時に出さないのは同期中の訳。期待値 (9) は sync-video.test.ts）
    expect(kinds(run([{ kind: 'videoFallback', on: true, enabled: false }, { kind: 'sync', on: true }]))).toEqual(['sync', 'videoFallback'])
  }) // prettier-ignore
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
