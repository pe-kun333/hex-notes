// S2 のループ（M1-03、M1 の手順 3）。出どころ: play-dev.ts の startRun・applyStep・applyJudge・onPress・onRelease・frame
// （L415–505・L652–681・L735–763。手直し: 「読めるか」の記録〔readability.ts〕は入れない、ゲージ 0 の途中終了は M2-05）、
// audio-dev.ts の onClock・pump（L170–187: 再アンカーで先の予約を止めて数え直す）、design.md §4.1（rAF 1 本: 時計 →
// 判定 → 計測 → 描画、音は 25 ms 周期・100 ms 先読み）・§4.2（終了 ＝ 最終ノート＋1.2 秒）、decisions #39（猶予中に窓が
// 終わる音は skipped）・#47・#48（打鍵音は誤打だけ）、m1-kickoff 手順 3。
// 1 回の演奏の状態（時計と状態機械・判定・計測・発音の予約）→ 次の状態と、画面がする事（演出・打鍵音・予約の取り消し）の
// 純関数。now は src/app/ が読んだ performance.now を値で受ける（decisions #25・#32）。DOM・Canvas・AudioContext は
// screens/play.ts。

import { keyclickFor, type KeyclickPlan } from '../audio/keyclick.ts'
import {
  initialScheduler,
  pumpSchedule,
  seekSchedule,
  soundItems,
  type ScheduledSound,
  type SchedulerState,
  type SoundItem,
  type SoundOptions,
} from '../audio/scheduler.ts'
import { filterKeyset, type KeysetId } from '../chart/keyset.ts'
import type { AudioBridge } from '../clock/audio-bridge.ts'
import type { ClockMap } from '../clock/types.ts'
import type { KeyCode } from '../shared/types.ts'
import {
  END_TAIL_MS,
  endAtMs,
  initialJudge,
  judgeClock,
  judgePress,
  judgeRelease,
  judgeSweep,
  resultsByIndex,
  summarizeJudge,
  timingSamples,
  type JudgeOutcome,
  type JudgeRules,
  type JudgeState,
  type JudgeSummary,
} from '../judge/judge.ts'
import type { FadeState } from '../judge/self-rate.ts'
import { midiOf } from '../layout/presets.ts'
import {
  initialSession,
  sessionIdle,
  sessionInput,
  sessionTick,
  type Session,
  type SessionStep,
} from '../play/session.ts'
import type { PlayEvent, PlayPhase } from '../play/state.ts'
import type { FrameNote } from '../render/canvas/cells.ts'
import { frameNotes } from '../render/canvas/commands.ts'
import type { FxIntent } from '../render/canvas/feedback.ts'
import {
  chordRate,
  weakBars,
  type ChordRate,
  type NoteOutcome,
  type WeakBars,
} from '../results/analysis.ts'
import { resultRecord } from '../results/record.ts'
import type { Chart, Profile, ResultRecord, Variant } from '../shared/types.ts'
import {
  collectClock,
  collectFrame,
  collectPress,
  initialCollect,
  type PlayCollect,
} from '../telemetry/collect.ts'
import { controlOf, type ControlInput, type ControlOptions } from './play-control.ts'

/** 曲の前の助走 ms（t は −LEAD_MS から始まる。play-dev L73、m1-kickoff §7-19） */
export const LEAD_MS = 2000

/** 演奏する曲（譜面と、選んだ譜面版） */
export interface RunSong {
  readonly chartId: string
  readonly name: string
  readonly chart: Pick<Chart, 'notes' | 'pulse' | 'accompaniment'>
  readonly variant: Variant
}

export interface RunOptions {
  /** 判定の規則（プロファイルの窓・校正のオフセット・隣・ラベル） */
  readonly rules: JudgeRules
  /** 足場外しの α（hexnote.fade。自力率の hinted／solo） */
  readonly fade?: FadeState
  /** 鳴らす部（旋律 ＝ 設定のガイド音、伴奏は常に、メトロノーム ＝ 設定。§2.9） */
  readonly sound: SoundOptions
  /** 誤打の打鍵音（S6「空打ち発音」。decisions #48） */
  readonly keyclick: boolean
  /** 鍵数制限（実行時フィルタ、src/chart/keyset.ts。無ければ all。S0d の段階 1・2 と M2-07） */
  readonly keyset?: KeysetId
}

export interface Run {
  readonly song: RunSong
  readonly opts: RunOptions
  /** プレイの状態機械と時計（動画なし。t は譜面の ms、開始は −LEAD_MS） */
  readonly session: Session
  /** 最後の歩の写像（次の歩まで。押下の tsPerf → 曲 ms、発音の予約） */
  readonly map: ClockMap
  /** 最後の歩の t（曲 ms） */
  readonly t: number
  /** 描画層のノート（全部 pending。状態は runNotes で判定から写す） */
  readonly notes: readonly FrameNote[]
  readonly judge: JudgeState
  /** 最終ノートの終わり（曲 ms。HUD の進行の分母、m1-kickoff §7-19） */
  readonly lastEndMs: number
  /** 終了の曲 ms（最終ノートの終わり＋1.2 秒、§4.2） */
  readonly endMs: number
  readonly collect: PlayCollect
  readonly items: readonly SoundItem[]
  readonly sched: SchedulerState
}

/** 画面がする事（出た順に効かせる） */
export type RunEffect =
  | { readonly kind: 'fx'; readonly fx: FxIntent }
  | { readonly kind: 'keyclick'; readonly plan: KeyclickPlan }
  /** 先の予約を止める（再アンカー・一時停止・やり直し。context.ts の cancelFrom を今の時刻で） */
  | { readonly kind: 'cancelSounds' }

export interface RunStep {
  readonly run: Run
  readonly effects: RunEffect[]
}

/** 待機の回（Space を待つ）。ノート・発音の列はここで 1 回作る */
export function newRun(song: RunSong, opts: RunOptions): Run {
  const all = frameNotes(song.chart, song.variant)
  // 鍵数制限で外した音は判定にも描画にも出さない。終わりと進行は曲全体（ガイド音は外さないので最後まで鳴る）
  const notes = [...filterKeyset(all, opts.keyset ?? 'all')]
  const endMs = endAtMs(all)
  return {
    song,
    opts,
    session: initialSession({ mode: 'novideo', t0: -LEAD_MS }),
    map: { a: 0, b: -LEAD_MS },
    t: -LEAD_MS,
    notes,
    judge: initialJudge(notes, opts.rules, opts.fade),
    lastEndMs: endMs - END_TAIL_MS,
    endMs,
    collect: initialCollect(),
    items: soundItems(song.chart, song.variant, opts.sound),
    sched: initialScheduler(),
  }
}

export const runPhase = (r: Run): PlayPhase => r.session.play.phase

/** 判定の事象 → 演出と打鍵音（play-dev applyJudge。skipped は描画のノートの状態だけ） */
function judgeEffects(r: Run, out: readonly JudgeOutcome[], realNow: number): RunEffect[] {
  const fx: RunEffect[] = []
  const push = (f: FxIntent): void => {
    fx.push({ kind: 'fx', fx: f })
  }
  for (const o of out) {
    if (o.kind === 'hit' && o.grade === 'near') {
      push({ kind: 'slide', atMs: realNow, from: o.noteCode, to: o.code })
      push({ kind: 'judgeText', atMs: realNow, grade: 'near', dtMs: o.dtMs })
    } else if (o.kind === 'hit') {
      push({ kind: 'edgeReturn', atMs: realNow, code: o.code, grade: o.grade })
      push({ kind: 'judgeText', atMs: realNow, grade: o.grade, dtMs: o.dtMs })
    } else if (o.kind === 'miss')
      push({ kind: 'judgeText', atMs: realNow, grade: 'miss', dtMs: null })
    else if (o.kind === 'stray' && r.opts.keyclick) {
      const layout = r.song.variant.layout
      const plan = keyclickFor(o, (c: KeyCode) => midiOf(layout, c))
      if (plan !== null) fx.push({ kind: 'keyclick', plan })
    }
    // failed（音ゲー向けのゲージ 0）の途中終了は M2-05。入門者の規則では出ない
  }
  return fx
}

/**
 * 状態機械と時計の 1 歩を回に写す。再アンカーは発音を数え直し（先の予約を止める）、一時停止に入ったら先の予約を止める。
 * 時計の事象（resync・graceEnd）を判定層へ渡す（猶予内に窓が終わる音の skipped、猶予中に溜めた押下の判定）
 */
function applyStep(r: Run, step: SessionStep, realNow: number, effects: RunEffect[]): Run {
  const before = runPhase(r)
  let sched = r.sched
  let cancel = false
  for (const ev of step.out.events)
    if (ev.kind === 'resync') {
      // 動画なしは時計の軸 ＝ 譜面の軸
      sched = seekSchedule(sched, r.items, ev.t)
      cancel = true
    }
  const phase = step.session.play.phase
  if (phase === 'paused' && before !== 'paused') cancel = true
  if (cancel) effects.push({ kind: 'cancelSounds' })
  const j = judgeClock(r.judge, step.out.events, { map: step.out.map, now: realNow })
  const next: Run = {
    ...r,
    session: step.session,
    map: step.out.map,
    t: step.out.t,
    collect: collectClock(r.collect, step.out),
    judge: j.state,
    sched,
  }
  effects.push(...judgeEffects(next, j.out, realNow))
  return next
}

/** 状態機械への事象（start・pause・resume・chartEnd） */
export function runInput(r: Run, now: number, ev: PlayEvent): RunStep {
  const effects: RunEffect[] = []
  return { run: applyStep(r, sessionInput(r.session, now, ev), now, effects), effects }
}

/**
 * 演奏の押下。先に今の相へ進め（猶予の終わりを次のフレームまで待たない）、再生・同期中だけ判定層へ（同期中は溜めて猶予の
 * 終わりに判定）。待機・一時停止・終了の押下は数えない
 */
export function runPress(
  r: Run,
  press: { readonly code: KeyCode; readonly tsPerf: number; readonly lag: number | null },
  now: number,
): RunStep {
  const effects: RunEffect[] = []
  const r1 = applyStep(r, sessionIdle(r.session, now), now, effects)
  const phase = runPhase(r1)
  if (phase !== 'playing' && phase !== 'syncing') return { run: r1, effects }
  const j = judgePress(r1.judge, press, { map: r1.map, now })
  const r2: Run = { ...r1, judge: j.state, collect: collectPress(r1.collect, press.lag) }
  effects.push(...judgeEffects(r2, j.out, now))
  return { run: r2, effects }
}

/** 演奏の離し（ホールドの終わり。強制の離し〔blur〕も渡す） */
export function runRelease(
  r: Run,
  rel: { readonly code: KeyCode; readonly tsPerf: number; readonly forced: boolean },
  now: number,
): RunStep {
  const effects: RunEffect[] = []
  const r1 = applyStep(r, sessionIdle(r.session, now), now, effects)
  const j = judgeRelease(r1.judge, rel, { map: r1.map, now })
  const r2: Run = { ...r1, judge: j.state }
  effects.push(...judgeEffects(r2, j.out, now))
  return { run: r2, effects }
}

/**
 * 毎フレーム（rAF 1 本）。計測（待機の間は数えない）→ 時計 → 判定の掃き出し → 終了（t が終了の曲 ms を過ぎた再生中は
 * chartEnd）。frameMs は rAF の引数、now は performance.now
 */
export function runFrame(r: Run, now: number, frameMs: number): RunStep {
  const effects: RunEffect[] = []
  const collect = runPhase(r) === 'idle' ? r.collect : collectFrame(r.collect, frameMs)
  let next = applyStep({ ...r, collect }, sessionTick(r.session, now, null), now, effects)
  const j = judgeSweep(next.judge, { map: next.map, now })
  next = { ...next, judge: j.state }
  effects.push(...judgeEffects(next, j.out, now))
  if (next.t > next.endMs && runPhase(next) === 'playing') {
    const end = runInput(next, now, { kind: 'chartEnd' })
    return { run: end.run, effects: [...effects, ...end.effects] }
  }
  return { run: next, effects }
}

/** 発音の予約 1 回（PUMP_MS ごと。bridge は同じタスクで読んだ AudioContext の対応点） */
export function runPump(
  r: Run,
  now: number,
  bridge: AudioBridge,
): { run: Run; play: ScheduledSound[] } {
  const p = pumpSchedule(r.sched, r.items, { map: r.map, now }, bridge)
  return { run: p.state === r.sched ? r : { ...r, sched: p.state }, play: p.play }
}

/** 描画層のノート（判定の状態を写す。変わらない音は同じ物） */
export function runNotes(r: Run): FrameNote[] {
  const byIndex = resultsByIndex(r.judge)
  return r.notes.map((n) => {
    const st = byIndex.get(n.index)?.state ?? 'pending'
    return st === n.state ? n : { ...n, state: st }
  })
}

/** 終わった回（S3 と計測の play 行へ） */
export interface PlayResult {
  readonly chartId: string
  readonly variantId: string
  readonly name: string
  readonly judge: JudgeSummary
  /** 予約の遅れの最大 ms（音を予約しない回は null） */
  readonly audioLateMaxMs: number | null
  /** 正しい鍵で当てた音の dt（校正を足した後。校正 段 2 の標本、timingSamples） */
  readonly samples: readonly number[]
  /** この回に使った校正のオフセット ms */
  readonly offsetUsed: number
  /** 鍵数制限（all でなければ練習記録: 自己ベスト・完走・校正 段 2 の母集団に入らない。§2.3・§2.7） */
  readonly keyset: KeysetId
  /** 校正 段 2 の母集団に入れるか（固定テンポ・1.0 倍・全鍵の通常プレイ。§2.7。M1 の S2 は全鍵の回だけ真） */
  readonly calibEligible: boolean
  /** 苦手区間（miss が最も多い連続 2 小節。miss が無ければ null） */
  readonly weak: WeakBars | null
  /** 同時押しが合った割合 */
  readonly chords: ChordRate
}

/** 音ごとの結果（tick ＝ 描画のノートの group。結果の分析に渡す） */
function noteOutcomes(r: Run): NoteOutcome[] {
  const byIndex = resultsByIndex(r.judge)
  return r.notes.map((n) => {
    const res = byIndex.get(n.index)
    return { tick: n.group, grade: res?.grade ?? null, skipped: res?.skipped ?? false }
  })
}

export function runOutcome(r: Run): PlayResult {
  const notes = noteOutcomes(r)
  return {
    chartId: r.song.chartId,
    variantId: r.song.variant.id,
    name: r.song.name,
    judge: summarizeJudge(r.judge),
    audioLateMaxMs: r.items.length === 0 ? null : r.sched.lateMaxMs,
    samples: timingSamples(r.judge),
    offsetUsed: r.opts.rules.offsetMs,
    keyset: r.opts.keyset ?? 'all',
    calibEligible: (r.opts.keyset ?? 'all') === 'all',
    weak: weakBars(r.song.chart.pulse, notes),
    chords: chordRate(notes),
  }
}

/** 保存した記録を持つ終わった回（S3 へ） */
export interface FinishedPlay extends PlayResult {
  readonly record: ResultRecord
}

/**
 * 終わった回と記録。M1 の S2 は動画なし（clock novideo・syncUsed audio）・固定テンポ・1.0 倍。鍵数制限は RunOptions.keyset。
 * id と at は呼ぶ側（crypto.randomUUID と Date）
 */
export function finishedPlay(
  r: Run,
  meta: { readonly id: string; readonly at: string; readonly profile: Profile },
): FinishedPlay {
  const o = runOutcome(r)
  const record = resultRecord(
    {
      id: meta.id,
      chartId: o.chartId,
      variantId: o.variantId,
      profile: meta.profile,
      clock: 'novideo',
      mode: 'fixed',
      rate: 1,
      keyset: o.keyset,
      at: meta.at,
      syncUsed: { kind: 'audio' },
      offsetUsed: o.offsetUsed,
    },
    o.judge,
  )
  return { ...o, record }
}

export interface RunControl {
  /** 回の 1 歩（何もしない入力は null）。「最初から」は新しい回を開始した物 */
  readonly step: RunStep | null
  /** 画面の移動（「やめる」→ S1。記録は保存しない） */
  readonly go: 'S1' | null
  /** 新しい回を始めた（待機からの開始か「最初から」。画面は予約の遅れの帯と演出を捨てる） */
  readonly fresh: boolean
}

/**
 * Space・Escape・blur・IME・Pause の選択を回に効かせる（振り分けは play-control.ts の controlOf）。「最初から」は同じ曲・
 * 同じ規則の新しい回を待機から開始する（同期中の猶予 300 ms から。先の予約は止める）
 */
export function runControl(
  r: Run,
  now: number,
  input: ControlInput,
  opts: ControlOptions,
): RunControl {
  const a = controlOf(runPhase(r), input, opts)
  if (a === null) return { step: null, go: null, fresh: false }
  if (a.kind === 'quit') return { step: null, go: 'S1', fresh: false }
  if (a.kind === 'restart') {
    const s = runInput(newRun(r.song, r.opts), now, { kind: 'start' })
    return {
      step: { run: s.run, effects: [{ kind: 'cancelSounds' }, ...s.effects] },
      go: null,
      fresh: true,
    }
  }
  const step = runInput(r, now, a.event)
  return { step, go: null, fresh: runPhase(r) === 'idle' && runPhase(step.run) !== 'idle' }
}
