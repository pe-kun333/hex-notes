import { describe, expect, it } from 'vitest'
import { foldOf, songCard, variantsText, versionChoice } from '../../../src/app/home-view.ts'
import {
  canNext,
  canSave,
  collapsedText,
  duplicateText,
  fileStem,
  foldCards,
  importStep,
  initialImport,
  loadErrorText,
  previewItems,
  resetAccomp,
  saveSummary,
  songInfo,
  trackRows,
  variantsNote,
  type ImportEvent,
  type ImportState,
} from '../../../src/app/import-view.ts'
import { canGo, navigate } from '../../../src/app/router.ts'
import { localSong } from '../../../src/app/songs.ts'
import { chartFromSmf, smfParts } from '../../../src/chart/import.ts'
import { parseSmf, type Smf } from '../../../src/chart/smf.ts'
import { buildVariant } from '../../../src/chart/variants.ts'
import {
  memoryDb,
  memoryStorage,
  safeStorage,
  type KvStore,
} from '../../../src/storage/fallback.ts'
import { chartFileName } from '../../../src/storage/file.ts'
import { saveDevice } from '../../../src/storage/local.ts'
import { isFirstRun, markBooted } from '../../../src/storage/session.ts'
import { M5_EXAMPLES } from '../../../tools/charts/mel-songs.ts'
import { format1ThreeTracks, melToSmf, smfBytes, END } from '../../fixtures/smf/build.ts'

// src/app/import-view.ts・router.ts・songs.ts・home-view.ts（M2-01 後半、M2 の手順 2）。出どころ: m2-kickoff 手順 2 の期待値・
// §7-2・§7-6・§7-18・§7-26・§7-27、design.md §1.3 S5・S1、m6 S5 L454–518・L990–998、decisions #52 (e)・#71 (c)(f)・#79・#83、
// tests-inventory「M2 手順 2」。

const THREE: Smf = parseSmf(format1ThreeTracks())
const loaded = (smf: Smf = THREE, fileName = 'three.mid'): ImportState =>
  importStep(initialImport('octave'), { kind: 'loaded', file: { fileName, smf } }) as ImportState
const run = (s: ImportState, ...evs: ImportEvent[]): ImportState | 'exit' =>
  evs.reduce<ImportState | 'exit'>((cur, ev) => (cur === 'exit' ? cur : importStep(cur, ev)), s)

describe('S5 の段の状態機械（段 4 は M3-03、§7-2）', () => {
  it('1 → 2 → 3 → 5、戻ると 5 → 3 → 2 → 1、段 5 の「次へ」は無い', () => {
    const s = loaded()
    const steps: number[] = [s.step]
    let cur: ImportState = s
    for (const ev of ['next', 'next', 'next', 'next', 'back', 'back', 'back', 'back'] as const) {
      cur = importStep(cur, { kind: ev }) as ImportState
      steps.push(cur.step)
    }
    expect(steps).toEqual([1, 2, 3, 5, 5, 3, 2, 1, 1])
  })

  it('やめる → S1（どの段からでも）。段 1 はファイルが読めるまで進めない', () => {
    expect(run(loaded(), { kind: 'next' }, { kind: 'cancel' })).toBe('exit')
    expect(importStep(initialImport('cut'), { kind: 'cancel' })).toBe('exit')
    const empty = initialImport('octave')
    expect(canNext(empty)).toBe(false)
    expect(importStep(empty, { kind: 'next' })).toBe(empty)
  })

  it('読めたら既定のトラック（弾く Melody・伴奏 Chords、ドラム除外）と曲名（ファイル名から）', () => {
    const s = loaded(THREE, 'My Song.MIDI')
    expect([s.play, s.accomp, s.name, s.fold, s.error]).toEqual([0, [1], 'My Song', 'octave', null])
    expect(
      trackRows(s).map((r) => [r.name, r.ch, r.drum, r.notes, r.range, r.beats, r.role]),
    ).toEqual([
      ['Melody', 1, false, 8, 'C4〜C5', '8', 'play'],
      ['Chords', 2, false, 6, 'C3〜C4', '4', 'accomp'],
      ['Drums', 10, true, 4, 'C2〜D2', '3.5', 'off'],
    ])
    expect(songInfo({ fileName: 'three.mid', smf: THREE })).toBe(
      'three.mid ・ 形式 1 ・ 3 トラック ・ 100 BPM（テンポ変化 1 回） ・ 4/4 ・ 0:04',
    )
    expect(fileStem('a.mid.mid')).toBe('a.mid')
  })

  it('形式 2 の SMF・SMPTE →「読めませんでした（SMF 形式 0／1 だけ対応）」、他は読み取りの文', () => {
    const bad = (f: () => unknown): string => {
      try {
        f()
        return ''
      } catch (e) {
        return loadErrorText(e)
      }
    }
    const notes = [
      [0, [0x90, 60, 64]],
      [96, [0x80, 60, 0]],
      [0, END],
    ] as const
    expect(bad(() => parseSmf(smfBytes(2, 96, [notes])))).toBe(
      '読めませんでした（SMF 形式 0／1 だけ対応）',
    )
    expect(bad(() => parseSmf(smfBytes(0, 0xe728, [notes])))).toBe(
      '読めませんでした（SMF 形式 0／1 だけ対応）',
    )
    expect(bad(() => parseSmf(new Uint8Array(20)))).toBe(
      '読めませんでした（MThd ヘッダーが無いので MIDI ファイルではありません）',
    )
    const s = importStep(loaded(), { kind: 'failed', why: 'x' }) as ImportState
    expect([s.file, s.error, canNext(s)]).toEqual([null, 'x', false])
  })

  it('弾くトラックを替えると伴奏から外す。弾くトラックは伴奏にできない。既定に戻すとドラム以外の全部', () => {
    const s = run(
      loaded(),
      { kind: 'accomp', track: 2, on: true },
      { kind: 'play', track: 1 },
    ) as ImportState
    expect([s.play, s.accomp]).toEqual([1, [2]])
    expect(importStep(s, { kind: 'accomp', track: 1, on: true })).toBe(s)
    expect(importStep(s, { kind: 'play', track: 9 })).toBe(s)
    expect(resetAccomp(s).accomp).toEqual([0])
    expect(trackRows(s).map((r) => r.role)).toEqual(['off', 'play', 'accomp'])
  })

  it('保存は段 5 で曲名が空でないときだけ', () => {
    const s5 = run(loaded(), { kind: 'next' }, { kind: 'next' }, { kind: 'next' }) as ImportState
    expect(canSave(s5)).toBe(true)
    expect(canSave(importStep(s5, { kind: 'name', text: '  ' }) as ImportState)).toBe(false)
    expect(canSave(importStep(s5, { kind: 'back' }) as ImportState)).toBe(false)
  })
})

describe('段 3 の 3 択と試聴', () => {
  const canon = smfParts(parseSmf(melToSmf(M5_EXAMPLES.canon)), 0)

  it('カノン進行: オクターブ寄せは Ableton で失われる音 0・位置が変わる音 24、切り捨ては 24 を失う', () => {
    const cards = foldCards(canon)
    expect(cards.map((c) => c.title)).toEqual(['オクターブ寄せ', '切り捨て', '最寄りの鍵'])
    expect(cards[0]?.lines).toEqual([
      'Ableton: 失われる音 0・位置が変わる音 24',
      'VMPK: 失われる音 0・位置が変わる音 0',
    ])
    expect(cards[1]?.lines[0]).toBe('Ableton: 失われる音 24・位置が変わる音 0')
    expect(cards[0]?.thin).toBe('同時押し上限で間引く音: 上限 2 で 17・上限 3 で 0（Ableton）')
    expect(collapsedText(0)).toBeNull()
    expect(collapsedText(2)).toContain('2 音を 1 つにまとめました')
  })

  it('試聴は最初の 8 小節（4/4 で拍 32 より前）の折り畳み後の旋律と伴奏、メトロノームなし', () => {
    const smf = parseSmf(format1ThreeTracks())
    const p = smfParts(smf, 0, [1])
    const items = previewItems(p, buildVariant(p, { layout: 'ableton', limit: 2, fold: 'octave' }))
    expect(items.filter((i) => i.part === 'melody')).toHaveLength(8)
    expect(items.filter((i) => i.part === 'accomp')).toHaveLength(6)
    expect(items.some((i) => i.part === 'click')).toBe(false)
    const long = smfParts(parseSmf(melToSmf(M5_EXAMPLES.canon)), 0)
    const lv = buildVariant(long, { layout: 'ableton', limit: 2, fold: 'octave' })
    // canon は 2 拍ごとの三和音 17 個（拍 0〜32）。8 小節 ＝ 拍 32 の前までの 16 個 → 上限 2 で 32 音
    expect(previewItems(long, lv)).toHaveLength(32)
    expect(previewItems(long, lv, 1)).toHaveLength(4)
  })
})

describe('段 5 と保存（§7-6・§7-18）', () => {
  it('要約: 難度 4 軸・注意・運指の警告・生成する版', async () => {
    const c = await chartFromSmf({
      smf: parseSmf(melToSmf(M5_EXAMPLES.canon)),
      play: 0,
      fold: 'octave',
      name: 'canon',
    })
    expect(saveSummary(c, 'vmpk')).toEqual({
      variant: 'VMPK／上限 2',
      axes: '密度 1.2 音/秒 ・ 跳躍 最大 6 ・ 同時押し率 100% ・ 段またぎ率 50%',
      cautions: ['最大跳躍が 6 以上'],
      warnCount: 0,
      warnings: [],
    })
    expect(saveSummary(c, 'ableton')?.cautions).toEqual([])
    expect(variantsNote('cut')).toBe('Ableton×{2,3}・VMPK×{2,3}（折り畳み: 切り捨て）')
    expect(saveSummary({ ...c, variants: [] }, 'ableton')).toBeNull()
  })

  it('同じ曲の 1 行: 持ち込み済みは上書き、同梱曲と同じは断る', () => {
    expect(duplicateText('none')).toBeNull()
    expect(duplicateText('local')).toContain('上書き')
    expect(duplicateText('bundled')).toContain('保存しません')
  })

  it('保存 → listCharts に 1 件、S1 のカードは「持ち込み（private）」で同梱曲の後、id は local:＋譜面の id', async () => {
    const db = memoryDb()
    const c = await chartFromSmf({
      smf: THREE,
      play: 0,
      accomp: [1],
      fold: 'octave',
      name: 'three',
    })
    await db.putChart(c)
    await db.putChart(c)
    expect((await db.listCharts()).map((x) => x.id)).toEqual([c.id])
    const e = localSong(c)
    expect([e.id, e.name, e.source]).toEqual([`local:${c.id}`, 'three', 'local'])
    expect(await e.load()).toBe(c)
    const card = songCard(e.id, c, {
      preferred: 'ableton',
      deviceLimit: null,
      profile: 'beginner',
      records: [],
      tutorialId: 'x',
    })
    expect(card.rights).toBe('出どころ 持ち込み（private）')
  })

  it('譜面版の自動選択が持ち込み曲にも効く: 切り捨てで Ableton に落ちる音が多ければ VMPK を先頭、版は 4 つ（今までは 0）', async () => {
    // 48・50 は Ableton（60〜76）の外で、切り捨てでは落ちる。VMPK は 48〜76 を持つ
    const smf: Smf = { format: 0, division: 480, tempo: [{ beat: 0, bpm: 120 }], timeSig: [], tracks: [
      { name: 'm', ch: 0, drum: false, notes: [48, 50, 60, 62].map((midi, i) => ({ midi, beat: i, dur: 1, vel: 80 })) },
    ] } // prettier-ignore
    const c = await chartFromSmf({ smf, play: 0, fold: 'cut', name: 'low' })
    expect(foldOf(c)).toBe('cut')
    expect(variantsText(c)).toBe('Ableton×{2,3}・VMPK×{2,3}')
    const ch = versionChoice(c, 'ableton', null)
    expect([ch.recommended, ch.layouts]).toEqual(['vmpk', ['vmpk', 'ableton']])
    expect(ch.pick).toEqual({ layout: 'vmpk', limit: 2, fold: 'cut' })
    // fold の無い譜面（版なし）は octave
    expect(foldOf({ variants: [] })).toBe('octave')
  })

  it('書き出しのファイル名は 曲名.hexnote.json（版なし。使えない文字は _）', () => {
    expect(chartFileName({ name: 'three' })).toBe('three.hexnote.json')
    expect(chartFileName({ name: 'A/B: "x"?' })).toBe('A_B_ _x__.hexnote.json')
  })
})

describe('「曲を持ち込む」の出し分けと歯車（§7-26・§7-27）', () => {
  const kv = (): KvStore =>
    safeStorage(
      'local',
      () => memoryStorage(),
      () => {},
    )

  it('初回（device も booted も無い）は出ない、導線を終えた同じタブ（booted だけ）・device ありは出る', () => {
    const local = kv()
    const session = kv()
    expect(isFirstRun(local, session)).toBe(true)
    markBooted(session)
    expect(isFirstRun(local, session)).toBe(false)
    const local2 = kv()
    saveDevice(local2, {
      limit: 3,
      at: '2026-11-01T00:00:00.000Z',
      layoutMapOk: true,
      diagnosed: true,
    })
    expect(isFirstRun(local2, kv())).toBe(false)
  })

  it('router: S1 → S5 → S1。S5 から S6・S2 へは行けない', () => {
    expect(canGo('S1', 'S5')).toBe(true)
    expect(canGo('S5', 'S1')).toBe(true)
    expect(canGo('S5', 'S6')).toBe(false)
    expect(canGo('S5', 'S2')).toBe(false)
    const at5 = navigate({ screen: 'S1', back: null }, 'S5')
    expect(at5).toEqual({ screen: 'S5', back: null })
    expect(navigate(at5, 'S6')).toBe(at5)
  })
})
