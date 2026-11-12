import { describe, expect, it } from 'vitest'
import { bandStep, bandsOf, initialBands, VIDEO_FALLBACK_TITLE } from '../../../src/app/bands.ts'
import { finishedPlay, runOutcome, untilNextMs, type Run } from '../../../src/app/play-runner.ts'
import { PHASE_TEXT, phaseText } from '../../../src/app/screens/play.ts'
import {
  FALLBACK_FAILED_TITLE,
  FALLBACK_GUIDE_TITLE,
  S7C_TEXT,
  SYNC_TEXT,
  fallbackBand,
  syncNotice,
  zenkakuLength,
} from '../../../src/app/sync-notice.ts'
import {
  initialScheduler,
  lateBand,
  pumpSchedule,
  seekSchedule,
  soundItems,
  type SoundItem,
} from '../../../src/audio/scheduler.ts'
import { IDENTITY_AXIS, toChartMs } from '../../../src/clock/map.ts'
import type { ClockEvent } from '../../../src/clock/types.ts'
import { playStep, type PlayState } from '../../../src/play/state.ts'
import { syncCauseStep } from '../../../src/play/sync-cause.ts'
import { parseResult } from '../../../src/storage/file.ts'
import { playRow } from '../../../src/telemetry/collect.ts'
import { FRAME_MS, START_NOW } from '../../../tools/harness/autoplay.ts'
import { CLICK, clickRun, drive, rel, type Step } from './fallback-drive.ts'

// S7c と「戻す」（M3 の手順 7、M3-05 後半、仮）。出どころ: m3-kickoff 手順 7 の期待値 (1)〜(4)・(6)〜(12)（原型で検算した値。
// (5) は §7-4 の案 B の記録で、#96 で案 A を採ったので試験にしない）、§7-4（案 A ＝ #96: 源 novideo の間の PLAYING で同期中に入り
// ピアノを止め、読みが動いたら戻す。釦「戻す」は ▶ の案内）・§7-14・§7-15・§7-17・§7-22・§7-31・§7-32、m6 bandsHtml L797・
// restore L983、m3 enterNoVideo L383・leaveNoVideo L384、design §1.3 S7 L89・§4.2 L184–186・§6.1 L320、decisions #34・#35・#39 (c)。
// 譜面とダミーは手順 2 と同じ（クリック譜面・pause の効き 0 ms）、筋書き「凍結（10,000〜）」、時刻は ▶ からの ms。回し方は
// fallback-drive.ts。

const FREEZE: Step = { at: 10_000, run: (c) => c.d.stuck(600_000, c.now) }
const PLAY_AT = (at: number): Step => ({ at, run: (c) => c.play() })
/** ▶ が play だけ（読みは凍ったまま。iframe への blur を伴う） */
const PLAY_FROZEN = (at: number): Step => ({
  at,
  run: (c) => {
    c.input({ kind: 'pause', reason: 'iframe' })
    c.d.play(c.now)
  },
})
const ESC = (at: number): Step => ({ at, run: (c) => c.input({ kind: 'pause', reason: 'escape' }) })
const SPACE = (at: number): Step => ({ at, run: (c) => c.input({ kind: 'resume' }) })
const head2 = (log: readonly string[]): string[] => log.filter((l) => !/^(16\.67|316\.67) /.test(l))
const sw = (r: Run): boolean => r.collect.fallbackT !== null && r.session.play.source === 'novideo'

describe('切替と切替の後の音の列（期待値 (1)(2)）', () => {
  const r = drive({ script: [FREEZE] })
  const o = runOutcome(r.run)

  it('11,983.33 に stall と pauseVideo(stall)、12,000 に novideo（t 12,001.06 ＝ 譜面 9,001.06）。再生のまま源 novideo、fallbackAt 9,001', () => {
    expect(head2(r.log)).toEqual(['11983.33 stall t=11984.39', '12000 novideo t=12001.06'])
    expect(r.reqs).toEqual(['pauseVideo(stall)@11983.33'])
    expect(r.stages).toContain('12000 playing/novideo')
    expect(toChartMs(12_001.06, { offset: 3, rate: 1 })).toBeCloseTo(9001.06, 9)
    expect(o.syncUsed).toEqual({ kind: 'youtube', videoId: 'hexDmyPlain', offset: 3, rate: 1, fallbackAt: 9001 })
    expect([o.judge.counts.perfect, o.judge.skipped, r.frames]).toEqual([64, 0, 2538])
  }) // prettier-ignore

  it('列: 動画の回 0 件 → 切替の後 64 件（メトロノーム OFF）。最初の音は 12,500 の予約で 12,598.94 に遅れ 0、曲末まで 48 音・捨てた音 0・帯なし', () => {
    const r0 = clickRun()
    expect([r0.items.length, r0.fallbackItems.length]).toEqual([0, 64])
    expect(r.sounds).toHaveLength(48)
    expect(r.sounds[0]).toEqual({ at: 12_500, tMs: 9600, part: 'melody', playAt: 12_598.94, late: 0 })
    expect([r.run.sched.dropped, lateBand(r.run.sched)]).toEqual([0, false])
    // 切替のあった回の予約の遅れは数値（列が空でも。§7-38）
    expect(o.audioLateMaxMs).toBe(0)
  }) // prettier-ignore

  it('列の作り: メトロノーム ON は 128 件、ガイド音 OFF を設定どおりにすると 0 件（だから旋律は設定によらず鳴らす）', () => {
    const run = clickRun()
    const song = run.song
    expect(soundItems(song.chart, song.variant, { melody: true, accomp: true, click: true })).toHaveLength(128)
    expect(soundItems(song.chart, song.variant, { melody: false, accomp: true, click: false })).toHaveLength(0)
  }) // prettier-ignore

  it('切替の t を譜面の ms にして seek: next 16（譜面 9,600）。動画の t のまま seek すると next 21、seek しないと捨てた音 15・帯', () => {
    const items = clickRun().fallbackItems
    expect(seekSchedule(initialScheduler(), items, 9001.06).next).toBe(16)
    expect(seekSchedule(initialScheduler(), items, 12_001.06).next).toBe(21)
    // seek しない: 切替の時の予約で頭から全部遅れる（t ＝ perf − 998.94 の動画の軸、譜面へは offset 3 s）
    const p = pumpSchedule(initialScheduler(), items, { map: { a: 1, b: -998.94 }, now: START_NOW + 12_000, axis: { offset: 3, rate: 1 } }, { ctxSec: (START_NOW + 12_000) / 1000, perfMs: START_NOW + 12_000, via: 'outputTimestamp' })
    expect(p.state.dropped).toBe(15)
    expect(p.state.lateMaxMs).toBeCloseTo(9001.06, 6)
    expect(lateBand(p.state)).toBe(true)
  }) // prettier-ignore

  it('fallbackAt が負になる切替（動画 3,087.90・offset 3.5 → −412.10）は 0 に丸める（負のままだと parseResult が null）', () => {
    const f = toChartMs(3087.9, { offset: 3.5, rate: 1 })
    expect(f).toBeCloseTo(-412.1, 6)
    expect(Math.max(0, Math.round(f))).toBe(0)
    const rec = finishedPlay(r.run, { id: 'r', at: '2026-11-12T00:00:00.000Z', profile: 'beginner' }).record
    expect(parseResult(rec)).not.toBeNull()
    expect(parseResult({ ...rec, syncUsed: { ...rec.syncUsed, fallbackAt: -412 } })).toBeNull()
  }) // prettier-ignore
})

describe('動画への戻り（期待値 (3)。§7-4 の案 A ＝ #96）', () => {
  const at: Record<number, { t: number; until: number | null }> = {}
  const r = drive({ script: [FREEZE, PLAY_AT(15_000)], onFrame: (run, now) => { at[rel(now)] = { t: run.t, until: untilNextMs(run) } } }) // prettier-ignore

  it('15,000 の ▶（blur は無変化）→ 同じ時刻の tick で PLAYING を見て同期中（t を 15,001.06 で止める）→ 15,016.67 に resync(return)（t 12,007.39）→ 源 video', () => {
    expect(head2(r.log)).toEqual(['11983.33 stall t=11984.39', '12000 novideo t=12001.06', '15000 held:playing', '15016.67 resync:return t=12007.39', '15316.67 graceEnd'])
    expect(r.stages).toEqual(['16.67 syncing/video', '316.67 playing/video', '12000 playing/novideo', '15000 syncing/novideo', '15016.67 syncing/video', '15316.67 playing/video', '45316.67 ended/video'])
    // 空白（巻き戻り）2,993.67 ms
    expect((at[15_000]?.t ?? NaN) - (at[15_016.67]?.t ?? NaN)).toBeCloseTo(2993.67, 2)
  }) // prettier-ignore

  it('ピアノは 5 音（最後は譜面 12,000 の 14,998.94）、次の着地は譜面 12,600 で戻りから 3,592.61 ms（「あと 4 秒」から）', () => {
    expect(r.sounds).toHaveLength(5)
    expect(r.sounds[4]).toMatchObject({ tMs: 12_000, playAt: 14_998.94 })
    expect(r.run.returnLandMs).toBe(12_600)
    expect(at[15_016.67]?.until).toBeCloseTo(3592.61, 2)
    expect(S7C_TEXT.countdown(at[15_016.67]?.until ?? 0)).toBe('動画に戻しました。あと 4 秒で続きが流れます')
    expect(at[15_000]?.until).toBeNull()
  }) // prettier-ignore

  it('perfect 64・skipped 0・2,719 フレーム、要求は停止検知の 1 件だけ、fallbackAt は切替の値のまま、resyncCount 0', () => {
    const o = runOutcome(r.run)
    expect([o.judge.counts.perfect, o.judge.skipped, r.frames]).toEqual([64, 0, 2719])
    expect(r.reqs).toEqual(['pauseVideo(stall)@11983.33'])
    expect(o.syncUsed.fallbackAt).toBe(9001)
    expect(r.run.collect.resyncCount).toBe(0)
  }) // prettier-ignore

  it('▶ を 15,000.01 に: 最初の tick で読みがもう動いていて待たずに戻る（t 11,992.39、空白 3,025.34）', () => {
    const x = drive({ untilMs: 15_400, press: false, script: [FREEZE, PLAY_AT(15_000.01)] })
    expect(head2(x.log)).toContain('15016.67 resync:return t=11992.39')
    expect(x.log.some((l) => l.includes('held:playing'))).toBe(false)
  }) // prettier-ignore

  it('▶ の時刻を 14,400〜15,000 に 2.5 ms 刻みで: ▶ から同期中まで 1 フレーム以内・戻りまで 18.25 ms 以内、▶ の後に鳴り始めるピアノは 1 音まで・1 フレーム未満', () => {
    let toSync = 0
    let toRet = 0
    let after = 0
    let afterMs = 0
    for (let t = 14_400; t <= 15_000; t += 2.5) {
      const x = drive({ untilMs: 15_500, press: false, script: [FREEZE, PLAY_AT(t)] })
      const first = x.stages.find((s) => s.includes('syncing') && parseFloat(s) >= t)
      const ret = x.log.find((l) => l.includes('resync:return'))
      toSync = Math.max(toSync, parseFloat(first ?? 'NaN') - t)
      toRet = Math.max(toRet, parseFloat(ret ?? 'NaN') - t)
      const late = x.sounds.filter((s) => s.playAt > t)
      after = Math.max(after, late.length)
      afterMs = Math.max(afterMs, ...late.map((s) => s.playAt - t), 0)
    }
    expect(toSync).toBeLessThanOrEqual(FRAME_MS)
    expect(toRet).toBeLessThanOrEqual(18.25)
    expect(after).toBeLessThanOrEqual(1)
    expect(afterMs).toBeLessThan(FRAME_MS)
  }, 60_000) // prettier-ignore
})

describe('戻らない・止める・また止まる（期待値 (4)）', () => {
  it('▶ が play だけ（PLAYING で読みは凍ったまま）→ 15,000 の tick から同期中のまま、ピアノは 5 音で止まる、要求は停止検知の 1 件', () => {
    const x = drive({ untilMs: 30_000, script: [FREEZE, PLAY_FROZEN(15_000)] })
    expect(head2(x.log)).toEqual(['11983.33 stall t=11984.39', '12000 novideo t=12001.06', '15000 held:playing'])
    expect(x.stages[x.stages.length - 1]).toBe('15000 syncing/novideo')
    expect([x.sounds.length, x.reqs.length]).toEqual([5, 1])
  }) // prettier-ignore

  it('同じで 16,000 に Esc → pauseVideo(user)・一時停止、17,000 に Space → 止めた t から resync(resume)（t 15,001.06、playVideo 0 件）、ピアノは計 48 音・perfect 64', () => {
    const x = drive({ script: [FREEZE, PLAY_FROZEN(15_000), ESC(16_000), SPACE(17_000)] })
    expect(x.reqs).toEqual(['pauseVideo(stall)@11983.33', 'pauseVideo(user)@16000'])
    expect(head2(x.log)).toContain('17000 resync:resume t=15001.06')
    expect(x.stages).toContain('16000 paused/novideo')
    expect(x.sounds).toHaveLength(48)
    expect(x.sounds[5]).toMatchObject({ tMs: 12_600, playAt: 17_598.94 })
    expect(runOutcome(x.run).judge.counts.perfect).toBe(64)
  }) // prettier-ignore

  it('同じで Esc の pauseVideo が効かない（広告）→ 17,000 の tick でまた同期中、ピアノは 5 音のまま（出口は Pause）', () => {
    const x = drive({ untilMs: 30_000, script: [FREEZE, PLAY_FROZEN(15_000), ESC(16_000), SPACE(17_000)], drop: (q) => q.kind === 'pauseVideo' && q.why === 'user' })
    expect(head2(x.log).slice(-2)).toEqual(['17000 resync:resume t=15001.06', '17000 held:playing'])
    expect(x.sounds).toHaveLength(5)
  }) // prettier-ignore

  it('同じで 16,000 に動画が PAUSED（動かずに PLAYING でなくなる）→ 止めた t から resync(resume)、ピアノは譜面 12,600（16,598.94）から計 48 音', () => {
    const x = drive({ script: [FREEZE, PLAY_FROZEN(15_000), { at: 16_000, run: (c) => c.d.setState('paused', c.now) }] })
    expect(head2(x.log)).toContain('16000 resync:resume t=15001.06')
    expect(x.sounds).toHaveLength(48)
    expect(x.sounds[5]).toMatchObject({ tMs: 12_600, playAt: 16_598.94 })
  }) // prettier-ignore

  it('14,000 に失敗の事象（以後は標本を渡さない）・15,000 に ▶ → 戻らない（曲末まで源 novideo・48 音）', () => {
    const x = drive({ deadFrom: 14_000, script: [FREEZE, PLAY_AT(15_000)] })
    expect(x.run.session.play.source).toBe('novideo')
    expect(x.sounds).toHaveLength(48)
  })

  it('戻りを待つ間（▶ が play だけ）の 15,500 に失敗 → runVideoGone で止めた t から resync(resume)、予約の門が開いてピアノは計 48 音、曲末で終わる', () => {
    const x = drive({ deadFrom: 15_500, script: [FREEZE, PLAY_FROZEN(15_000)] })
    expect(x.stages.slice(-3)).toEqual(['15000 syncing/novideo', '15800 playing/novideo', '42800 ended/novideo'])
    expect([x.sounds.length, x.run.session.clock.lastState]).toEqual([48, 'paused'])
    expect(runOutcome(x.run).judge.counts.perfect).toBe(64)
  }) // prettier-ignore

  it('戻った後 20,000 にまた凍結 → 21,983.33 に stall、22,000 に 2 回目の novideo（譜面 15,984.36）、ピアノは譜面 16,200 から計 42 音・捨てた音 0、fallbackAt は最初の値', () => {
    const x = drive({ script: [FREEZE, PLAY_AT(15_000), { at: 20_000, run: (c) => c.d.stuck(600_000, c.now) }] })
    expect(head2(x.log).slice(-2)).toEqual(['21983.33 stall t=18967.7', '22000 novideo t=18984.36'])
    expect(x.sounds).toHaveLength(42)
    expect(x.sounds[5]).toMatchObject({ tMs: 16_200, playAt: 22_215.64 })
    expect([x.run.sched.dropped, runOutcome(x.run).syncUsed.fallbackAt]).toEqual([0, 9001])
  }) // prettier-ignore

  it('切替の後に Esc 14,000、一時停止中の 14,500 に ▶、Space 15,000 → resync(resume)（t 14,001.06）と同じ tick の resync(return)（t 12,487.39、空白 1,513.67）、ピアノは 3 音', () => {
    const x = drive({ script: [FREEZE, ESC(14_000), PLAY_AT(14_500), SPACE(15_000)] })
    expect(head2(x.log).slice(2, 4)).toEqual(['15000 resync:resume t=14001.06', '15000 resync:return t=12487.39'])
    expect(x.sounds).toHaveLength(3)
    expect(x.reqs).toEqual(['pauseVideo(stall)@11983.33'])
  }) // prettier-ignore
})

describe('完了条件: pause 無効の模擬で切り替わらない（期待値 (6)、§5.4 L272）と広告中からの切替（(7)）', () => {
  it('pause 無効・凍結 6 秒: 12,483.33 adSuspected、14,483.33 に要求し直し、16,000 resync(adEnd)。源 video のまま、ピアノ 0 音・S7c の帯 0 回、fallbackAt 無し、play 行の fallback 偽', () => {
    let bands = 0
    const x = drive({ dummy: { pauseLatencyMs: 'never' }, script: [{ at: 10_000, run: (c) => c.d.stuck(6000, c.now) }], onFrame: (run) => { if (fallbackBand({ switched: sw(run), running: true, waiting: false, guide: false, failed: false }).on) bands++ } }) // prettier-ignore
    expect(head2(x.log).slice(1, 3)).toEqual(['12483.33 adSuspected t=12484.44', '16000 resync:adEnd t=15997.39'])
    expect(x.reqs).toEqual(['pauseVideo(stall)@11983.33', 'pauseVideo(stall)@14483.33'])
    const o = runOutcome(x.run)
    expect([x.run.session.play.source, x.sounds.length, bands, o.syncUsed.fallbackAt, o.audioLateMaxMs]).toEqual(['video', 0, 0, undefined, null])
    expect(playRow(x.run.collect, { chartId: 'c', variantId: 'v', profile: 'beginner', clock: 'video', mode: 'fixed' }, o.judge, o.audioLateMaxMs, 'x').fallback).toBe(false)
  }) // prettier-ignore

  it('1 回目の要求が効かず 2 回目（14,483.33）が効く: 14,500 に novideo → resync(fallback)（t 12,484.44）、fallbackAt 9,484、最初の音は 14,615.56。帯は sync が下り videoFallback が点く', () => {
    const seen: string[] = []
    const x = drive({
      script: [FREEZE],
      drop: (q, n) => q.kind === 'pauseVideo' && n === 0,
      onFrame: (run, now) => {
        const s = `${syncNotice(run.syncCause, now).band ? 'sync' : ''}|${fallbackBand({ switched: sw(run), running: true, waiting: false, guide: false, failed: false }).on ? 'S7c' : ''}`
        if (seen[seen.length - 1]?.endsWith(s) !== true) seen.push(`${rel(now)} ${s}`)
      },
    })
    expect(head2(x.log).slice(2, 4)).toEqual(['14500 novideo t=12484.44', '14500 resync:fallback t=12484.44'])
    expect(runOutcome(x.run).syncUsed.fallbackAt).toBe(9484)
    expect(x.sounds[0]).toMatchObject({ tMs: 9600, playAt: 14_615.56 })
    expect(seen).toEqual(['16.67 |', '12483.33 sync|', '14500 |S7c'])
  }) // prettier-ignore
})

describe('予約の門と数え直し（期待値 (8)）・切替の直後の遅れ（(10)）', () => {
  it('context が 13,000 から running（切替は 12,000）→ 最初の音は譜面 10,200（13,198.94）・捨てた音 0・帯なし、計 47 音', () => {
    const x = drive({ script: [FREEZE], running: (ms) => ms >= 13_000 })
    expect(x.sounds[0]).toEqual({ at: 13_100, tMs: 10_200, part: 'melody', playAt: 13_198.94, late: 0 })
    expect([x.sounds.length, x.run.sched.dropped, lateBand(x.run.sched)]).toEqual([47, 0, false])
  }) // prettier-ignore

  it('切替 now 20,000・最初の予約 20,025・切替から d ms 後の 1 音: 遅れ max(0, 25 − d)、帯は d 0・4 で真・5・25 で偽', () => {
    const out = [0, 4, 5, 25].map((d) => {
      const items: SoundItem[] = [{ id: 0, part: 'melody', tMs: 20_000 + d, durMs: 100, midi: 60, vel: 100, accent: false }]
      const p = pumpSchedule(seekSchedule(initialScheduler(), items, 20_000), items, { map: { a: 1, b: 0 }, now: 20_025, axis: IDENTITY_AXIS }, { ctxSec: 20.025, perfMs: 20_025, via: 'outputTimestamp' })
      return [p.play[0]?.lateMs, lateBand(p.state)]
    })
    expect(out).toEqual([[25, true], [21, true], [20, false], [0, false]])
  }) // prettier-ignore
})

describe('源 novideo の間の状態機械（期待値 (9)）', () => {
  const S = (phase: PlayState['phase'], source: PlayState['source'] = 'novideo', returning = false): PlayState => ({ phase, source, ...(returning ? { returning: true as const } : {}) }) // prettier-ignore
  const held = (state: 'playing' | 'paused'): ClockEvent => ({ kind: 'held', state, late: false })

  it('同期中・一時停止中の return は無変化。源 novideo の間の pause(iframe)（▶ の click の blur）は無視', () => {
    for (const s of [S('syncing'), S('paused')]) expect(playStep(s, { kind: 'return' }).state).toEqual(s)
    expect(playStep(S('playing'), { kind: 'pause', reason: 'iframe' }).state).toEqual(S('playing'))
    expect(playStep(S('playing', 'video'), { kind: 'pause', reason: 'iframe' }).state.phase).toBe('paused')
  }) // prettier-ignore

  it('源 novideo の held(playing) で戻りを待つ同期中。待つ間の Esc は pauseVideo(user) も出す。再生中の Esc は出さない', () => {
    const w = playStep(S('playing'), { kind: 'clock', event: held('playing') })
    expect(w).toEqual({ state: S('syncing', 'novideo', true), clock: [], video: [] })
    expect(playStep(w.state, { kind: 'pause', reason: 'escape' })).toEqual({ state: S('paused'), clock: [{ kind: 'pause' }], video: [{ kind: 'pauseVideo', why: 'user' }] })
    expect(playStep(S('playing'), { kind: 'pause', reason: 'escape' }).video).toEqual([])
  }) // prettier-ignore

  it('切替の後の Esc 14,000 → Space 15,000 は resync(resume)（t 14,001.06）で、pauseVideo・playVideo は 0 件', () => {
    const x = drive({ script: [FREEZE, ESC(14_000), SPACE(15_000)] })
    expect(head2(x.log).slice(2)).toEqual(['15000 resync:resume t=14001.06', '15300 graceEnd'])
    expect(x.reqs).toEqual(['pauseVideo(stall)@11983.33'])
  }) // prettier-ignore
})

describe('帯 videoFallback の形と案内の行の文（期待値 (11)）', () => {
  const on = { switched: true, running: true, waiting: false, guide: false, failed: false }
  const show = (i: typeof on): ReturnType<typeof bandsOf> =>
    bandsOf(bandStep(initialBands(), fallbackBand(i)), { imeStop: false })

  it('切替 → 題は既定・閉じるなし・釦「戻す」有効、「戻す」の後 → ▶ の案内・無効、失敗の後 → 戻せない・無効、待つ間・戻り・待機・終了は 0 本', () => {
    expect(show(on)).toEqual([{ kind: 'videoFallback', title: VIDEO_FALLBACK_TITLE, detail: '', dismissible: false, action: { id: 'return', label: '戻す', enabled: true } }])
    expect(show({ ...on, guide: true })[0]).toMatchObject({ title: FALLBACK_GUIDE_TITLE, action: { enabled: false } })
    expect(show({ ...on, failed: true })[0]).toMatchObject({ title: FALLBACK_FAILED_TITLE, action: { enabled: false } })
    expect([FALLBACK_GUIDE_TITLE, FALLBACK_FAILED_TITLE]).toEqual(['プレイヤーの ▶ を押してください', '動画に戻せません。ピアノ音で続けます'])
    for (const i of [{ ...on, waiting: true }, { ...on, switched: false }, { ...on, running: false }]) expect(show(i)).toEqual([])
  }) // prettier-ignore

  it('案内の行: 切替の後の再生「ピアノ音で続けています」、音が出ない間「音が出ないときは鍵を 1 つ押してください」、戻りの後「あと n 秒」（切り上げ）、0 なら相の文', () => {
    const base = { phase: 'playing' as const, source: 'novideo' as const, ready: true, switched: true }
    expect(phaseText({ ...base, audioRunning: true })).toBe('ピアノ音で続けています')
    expect(phaseText({ ...base, audioRunning: false })).toBe('音が出ないときは鍵を 1 つ押してください')
    const v = { phase: 'playing' as const, source: 'video' as const, ready: true }
    expect(phaseText({ ...v, untilNextMs: 3592.61 })).toBe('動画に戻しました。あと 4 秒で続きが流れます')
    expect(phaseText({ ...v, untilNextMs: 3000 })).toBe('動画に戻しました。あと 3 秒で続きが流れます')
    expect(phaseText({ ...v, untilNextMs: 0 })).toBe(PHASE_TEXT.playing)
    expect(phaseText({ ...v, untilNextMs: null })).toBe(PHASE_TEXT.playing)
    // 全角換算で 11・19.5・21.5（n が 2〜3 桁でも 22〜22.5。手順 3 の 24 字以内）
    expect([S7C_TEXT.piano, S7C_TEXT.silent, S7C_TEXT.countdown(4000), S7C_TEXT.countdown(61_000), S7C_TEXT.countdown(600_000)].map(zenkakuLength)).toEqual([11, 19.5, 21.5, 22, 22.5])
  }) // prettier-ignore

  it('戻りを待つ訳 returnWait: 1,999 ms まで帯なし（再生待ちの文）・2,000 ms で帯 sync と広告の文。再アンカーで消える', () => {
    const c = syncCauseStep(null, { phase: 'syncing', source: 'novideo', events: [{ kind: 'held', state: 'playing', late: false }], video: [], now: 15_000 })
    expect(c).toEqual({ kind: 'returnWait', since: 15_000, bandFrom: 17_000 })
    expect(syncNotice(c, 16_999)).toEqual({ text: SYNC_TEXT.resumeWait, band: false, autoplay: null })
    expect(syncNotice(c, 17_000)).toEqual({ text: SYNC_TEXT.ad, band: true, autoplay: null })
    expect(phaseText({ phase: 'syncing', source: 'novideo', ready: true, cause: c, syncText: syncNotice(c, 17_000).text })).toBe(SYNC_TEXT.ad)
    expect(syncCauseStep(c, { phase: 'syncing', source: 'novideo', events: [], video: [], now: 16_000 })).toBe(c)
    const resume: ClockEvent = { kind: 'resync', reason: 'resume', t: 0, graceUntil: 0, nominal: { a: 1, b: 0 } }
    expect(syncCauseStep(c, { phase: 'syncing', source: 'novideo', events: [resume], video: [], now: 16_000 })).toBeNull()
    expect(syncCauseStep(null, { phase: 'syncing', source: 'novideo', events: [resume], video: [], now: 16_000 })).toBeNull()
  }) // prettier-ignore
})

describe('戻りの先と空白（期待値 (12)）', () => {
  const notes = CLICK.notes
  const chart128 = {
    ...CLICK,
    notes: [...notes, ...notes.map((n) => ({ ...n, beat: n.beat + 64 }))],
    variants: (CLICK.variants ?? []).map((v) => ({ ...v, keys: [...v.keys, ...v.keys] })),
  }

  it('128 音の譜面で動画なしに 60 秒いて 72,000 に ▶ → 72,016.67 に resync(return)（t 12,007.39）、次の着地は譜面 69,600（「あと 61 秒」）、ピアノ 100 音・perfect 128・skipped 0', () => {
    const at: Record<number, number | null> = {}
    const x = drive({ chart: chart128, script: [FREEZE, PLAY_AT(72_000)], onFrame: (run, now) => { at[rel(now)] = untilNextMs(run) } }) // prettier-ignore
    expect(head2(x.log).slice(2, 4)).toEqual(['72000 held:playing', '72016.67 resync:return t=12007.39'])
    expect(x.run.returnLandMs).toBe(69_600)
    expect(at[72_016.67]).toBeCloseTo(60_592.61, 2)
    expect(S7C_TEXT.countdown(at[72_016.67] ?? 0)).toContain('あと 61 秒')
    const o = runOutcome(x.run)
    expect([x.sounds.length, o.judge.counts.perfect, o.judge.skipped]).toEqual([100, 128, 0])
  }) // prettier-ignore

  it('14,000 に止まったプレイヤーを 30,000 へシークして 15,000 に ▶ → t 30,022.39（先へ飛ぶ）、間の 25 音は skipped（中断あり）・perfect 39、次の着地は 577.61 ms 後', () => {
    const at: Record<number, number | null> = {}
    const x = drive({ script: [FREEZE, { at: 14_000, run: (c) => c.d.seek(30_000, c.now) }, PLAY_AT(15_000)], onFrame: (run, now) => { at[rel(now)] = untilNextMs(run) } }) // prettier-ignore
    expect(head2(x.log)).toContain('15016.67 resync:return t=30022.39')
    const o = runOutcome(x.run)
    expect([o.judge.counts.perfect, o.judge.skipped]).toEqual([39, 25])
    expect(at[15_016.67]).toBeCloseTo(577.61, 2)
  }) // prettier-ignore

  it('5,000 へシーク → t 5,017.39（空白 9,983.67）、次の着地は 10,582.61 ms 後、perfect 64・skipped 0（判定済みの音は二度判定しない、#39 (c)）', () => {
    const at: Record<number, number | null> = {}
    const x = drive({ script: [FREEZE, { at: 14_000, run: (c) => c.d.seek(5000, c.now) }, PLAY_AT(15_000)], onFrame: (run, now) => { at[rel(now)] = untilNextMs(run) } }) // prettier-ignore
    expect(head2(x.log)).toContain('15016.67 resync:return t=5017.39')
    const o = runOutcome(x.run)
    expect([o.judge.counts.perfect, o.judge.skipped]).toEqual([64, 0])
    expect(at[15_016.67]).toBeCloseTo(10_582.61, 2)
  }) // prettier-ignore
})
