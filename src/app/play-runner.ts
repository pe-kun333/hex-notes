// S2 のループ（M1-03、M1 の手順 3）。出どころ: play-dev.ts の startRun・applyStep・applyJudge・onPress・onRelease・frame
// （L415–505・L652–681・L735–763。手直し: 「読めるか」の記録〔readability.ts〕は入れない、ゲージ 0 の途中終了は M2-05）、
// audio-dev.ts の onClock・pump（L170–187: 再アンカーで先の予約を止めて数え直す）、design.md §4.1（rAF 1 本: 時計 →
// 判定 → 計測 → 描画、音は 25 ms 周期・100 ms 先読み）・§4.2（終了 ＝ 最終ノート＋1.2 秒）、decisions #39（猶予中に窓が
// 終わる音は skipped）・#47・#48（打鍵音は誤打だけ）、m1-kickoff 手順 3。
// 1 回の演奏の状態（時計と状態機械・判定・計測・発音の予約）→ 次の状態と、画面がする事（演出・打鍵音・予約の取り消し）の
// 純関数。now は src/app/ が読んだ performance.now を値で受ける（decisions #25・#32）。DOM・Canvas・AudioContext は
// screens/play.ts。
// M2 の手順 5（M2-03 前半）: RunOptions.practice で練習層（src/practice/ の待ち・ループ・テンポ段）を回す。練習層は時計に
// 触らず、ここが PlayEvent（waitStop・waitHit・seek・setRate）と判定層の judgeWaitHit・judgeRewind に渡す（decisions #80・
// #81・#87、m2-kickoff 手順 5・§7-3・§7-10・§7-11）。描画は曲時間軸のまま（テンポ段で跳ばない）。

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
import { buildMsTable, type MsTable } from '../chart/mstable.ts'
import type { AudioBridge } from '../clock/audio-bridge.ts'
import { perfAt } from '../clock/map.ts'
import type { ClockMap } from '../clock/types.ts'
import type { KeyCode, PlayMode } from '../shared/types.ts'
import { phraseOfBar } from '../practice/bars.ts'
import {
  initialLoop,
  setLoop,
  loopLimitMs,
  loopMiss,
  loopPhraseEnd,
  loopSeekMs,
  loopStartMs,
  loopWrap,
  type LoopRange,
  type LoopState,
} from '../practice/loop.ts'
import { isCorrect, rateChangeSafe, tempoAfter } from '../practice/tempo.ts'
import {
  clearWait,
  effectiveMode,
  initialWait,
  waitCheck,
  waitPress,
  waitRelease,
  type WaitMode,
  type WaitState,
} from '../practice/wait.ts'
import { barOf } from '../results/analysis.ts'
import {
  END_TAIL_MS,
  endAtMs,
  initialJudge,
  judgeClock,
  judgePress,
  judgeRelease,
  judgeRewind,
  judgeSweep,
  judgeWaitHit,
  resultsByIndex,
  summarizeJudge,
  timingSamples,
  type JudgeOutcome,
  type JudgeRules,
  type JudgeState,
  type JudgeSummary,
} from '../judge/judge.ts'
import type { FadeState } from '../judge/self-rate.ts'
import { lateEdge } from '../judge/windows.ts'
import { GRACE_MS } from '../clock/grace.ts'
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
  /** 練習（S4・S0d。無ければ通常プレイ ＝ 固定テンポ・1.0 倍・ループ無し） */
  readonly practice?: PracticeOptions
}

/** 練習の設定（殻が持ち、保存しない。m2-kickoff §7-7） */
export interface PracticeOptions {
  /** 待ち方（源が動画なら固定テンポ） */
  readonly mode: WaitMode
  /** 始めのテンポ段 */
  readonly rate: number
  /** 始めの区間（S3 の苦手 2 小節。始点の 1 小節前から始める） */
  readonly loop?: LoopRange | null
  readonly autoLoop: boolean
  readonly autoTempo: boolean
}

/** 練習の設定の既定（S4 に入るたびに。音待ち・1.0・ループ無し・自動ループ ON・自動昇降 ON、m2-kickoff §7-7、仮） */
export const DEFAULT_PRACTICE: PracticeOptions = Object.freeze({
  mode: 'note',
  rate: 1,
  loop: null,
  autoLoop: true,
  autoTempo: true,
})

/** S0d の段階の練習（音待ち・1.0・ループ無し・自動なし。decisions #61・#82） */
export const TUTORIAL_PRACTICE: PracticeOptions = Object.freeze({
  mode: 'note',
  rate: 1,
  loop: null,
  autoLoop: false,
  autoTempo: false,
})

/** 練習の回の状態（Run.practice） */
export interface PracticeRun {
  readonly opts: PracticeOptions
  readonly mode: WaitMode
  readonly wait: WaitState
  readonly loop: LoopState
  /** 今のテンポ段（時計へ出した物） */
  readonly rate: number
  /** 自動昇降が決めて、まだ時計へ出していない段（猶予に窓が掛からないフレームまで待つ） */
  readonly pendingRate: number | null
  /** この回で使った段（記録の rate・計測のテンポ段の始めと終わり） */
  readonly rates: readonly number[]
  /** 評価したフレーズ（この通過。頭出しで数え直す）と、評価を始めるフレーズ（頭出しの前の小節は評価しない） */
  readonly evaluated: readonly number[]
  readonly evalFrom: number
  /** 音（notes の添字）の小節とフレーズ */
  readonly pos: ReadonlyMap<number, { readonly bar: number; readonly phrase: number }>
  /** 判定するノート（着地の順。待ちが見る） */
  readonly byLand: readonly FrameNote[]
  readonly ms: MsTable
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
  /** 練習（RunOptions.practice。通常プレイは null） */
  readonly practice: PracticeRun | null
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

/** 練習の回の始め（動画なし。源が動画なら固定テンポ、M3-02） */
function newPractice(song: RunSong, notes: readonly FrameNote[], p: PracticeOptions): PracticeRun {
  const pulse = song.chart.pulse
  const pos = new Map<number, { bar: number; phrase: number }>()
  for (const n of notes) {
    const bar = barOf(pulse, n.group / pulse.resolution)
    pos.set(n.index, { bar, phrase: phraseOfBar(bar) })
  }
  const mode = effectiveMode(p.mode, 'novideo')
  const loop = initialLoop(p.loop ?? null, p.autoLoop)
  return {
    opts: p,
    mode,
    wait: initialWait(mode, notes, pulse),
    loop,
    rate: p.rate,
    pendingRate: null,
    rates: [p.rate],
    evaluated: [],
    evalFrom: loop.range === null ? 0 : phraseOfBar(loop.range.startBar),
    pos,
    byLand: [...notes].sort((a, b) => a.tLandMs - b.tLandMs || a.index - b.index),
    ms: buildMsTable(pulse),
  }
}

/** 待機の回（Space を待つ）。ノート・発音の列はここで 1 回作る */
export function newRun(song: RunSong, opts: RunOptions): Run {
  const all = frameNotes(song.chart, song.variant)
  // 鍵数制限で外した音は判定にも描画にも出さない。終わりと進行は曲全体（ガイド音は外さないので最後まで鳴る）
  const notes = [...filterKeyset(all, opts.keyset ?? 'all')]
  const endMs = endAtMs(all)
  const practice = opts.practice === undefined ? null : newPractice(song, notes, opts.practice)
  // 始めの区間があれば始点の 1 小節前から（それより前の音は開始の猶予で skipped）
  const range = practice?.loop.range ?? null
  const t0 = range === null || practice === null ? -LEAD_MS : loopSeekMs(practice.ms, song.chart.pulse, range, LEAD_MS)
  return {
    song,
    opts,
    session: initialSession({ mode: 'novideo', t0, ...(practice === null ? {} : { rate: practice.rate }) }),
    map: { a: 0, b: t0 },
    t: t0,
    notes,
    judge: initialJudge(notes, opts.rules, opts.fade),
    lastEndMs: endMs - END_TAIL_MS,
    endMs,
    collect: initialCollect(),
    items: soundItems(song.chart, song.variant, opts.sound),
    sched: initialScheduler(),
    practice,
  }
} // prettier-ignore

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
  // 一時停止・待ちに入ったら先の予約を止める（待ちの解除は着地から数え直す）
  if ((phase === 'paused' || phase === 'waiting') && before !== phase) cancel = true
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
  // 待ち中の押下は練習層へ（判定層の窓では見ない。計測の演奏の押下にも数えない、m2-kickoff 手順 5）
  if (phase === 'waiting' && r1.practice !== null)
    return { run: waitPressRun(r1, r1.practice, press, now, effects), effects }
  if (phase !== 'playing' && phase !== 'syncing') return { run: r1, effects }
  const j = judgePress(r1.judge, press, { map: r1.map, now })
  const r2: Run = { ...r1, judge: j.state, collect: collectPress(r1.collect, press.lag) }
  effects.push(...judgeEffects(r2, j.out, now))
  return { run: r2, effects }
}

/** 練習層への事象を状態機械と時計に効かせる */
function practiceEvent(r: Run, now: number, ev: PlayEvent, effects: RunEffect[]): Run {
  return applyStep(r, sessionInput(r.session, now, ev), now, effects)
}

/**
 * 待ちの解除（組が揃った後。フレーズ待ちは 250 ms の空白の後）。待った tick の着地 − 猶予·rate へ戻して再開し、発音の予約は
 * 着地から数え直す（巻き戻した区間を鳴らし直さない、§7-3）
 */
function releaseWait(r: Run, now: number, effects: RunEffect[]): Run {
  const p = r.practice
  if (p === null) return r
  const rel = waitRelease(p.wait, now, p.rate)
  const r1: Run = rel.state === p.wait ? r : { ...r, practice: { ...p, wait: rel.state } }
  if (rel.release === null) return r1
  const r2 = practiceEvent(r1, now, { kind: 'waitHit', t: rel.release.t }, effects)
  return { ...r2, sched: seekSchedule(r2.sched, r2.items, rel.release.landMs) }
}

/** 待ち中の押下 1 つ: 組の鍵なら judgeWaitHit、鍵違いは tainted と誤打の音（時計が止まっていても鳴らす、#48 の例外） */
function waitPressRun(
  r: Run,
  p: PracticeRun,
  press: { readonly code: KeyCode; readonly tsPerf: number },
  now: number,
  effects: RunEffect[],
): Run {
  const w = waitPress(p.wait, press.code)
  const r1: Run = { ...r, practice: { ...p, wait: w.state } }
  if (w.press.kind === 'wrong') {
    if (r.opts.keyclick) {
      const layout = r.song.variant.layout
      const stray = {
        kind: 'stray',
        code: press.code,
        tsPerf: press.tsPerf,
        reason: 'window',
      } as const
      const plan = keyclickFor(stray, (c: KeyCode) => midiOf(layout, c))
      if (plan !== null) effects.push({ kind: 'keyclick', plan })
    }
    return r1
  }
  if (w.press.kind !== 'hit') return r1
  const j = judgeWaitHit(r1.judge, w.press.index, { tainted: w.press.tainted })
  const r2: Run = { ...r1, judge: j.state }
  effects.push(...judgeEffects(r2, j.out, now))
  return w.press.done ? releaseWait(r2, now, effects) : r2
}

/** 区間の頭出し: 区間の音を未判定に戻し（judgeRewind）、始点の 1 小節前へ。待ちの組を下ろし、評価を数え直す */
function rewindLoop(r: Run, p: PracticeRun, range: LoopRange, now: number, effects: RunEffect[]): Run {
  const pulse = r.song.chart.pulse
  const j = judgeRewind(r.judge, loopStartMs(p.ms, pulse, range))
  const practice: PracticeRun = { ...p, wait: clearWait(p.wait), evaluated: [], evalFrom: phraseOfBar(range.startBar) }
  const r1: Run = { ...r, judge: j.state, practice }
  const t = loopSeekMs(p.ms, pulse, range, LEAD_MS)
  // 待ちの間は時計が止まっているので、seek だけでは動かない。解除と同じく戻して再開する
  return practiceEvent(r1, now, runPhase(r1) === 'waiting' ? { kind: 'waitHit', t } : { kind: 'seek', t }, effects)
} // prettier-ignore

/** フレーズ 1 つの評価（境 ＋ 遅れ側の窓 ＋ G の後、か折り返し）: 自動ループの同じ通過の miss を 0 に、自動昇降の段を決める */
function evalPhrase(r: Run, p: PracticeRun, phrase: number): PracticeRun {
  let judged = 0
  let correct = 0
  if (p.opts.autoTempo) {
    const byIndex = resultsByIndex(r.judge)
    for (const n of r.notes) {
      if (p.pos.get(n.index)?.phrase !== phrase) continue
      const res = byIndex.get(n.index)
      if (res === undefined || res.grade === null || res.skipped) continue
      judged++
      if (isCorrect(res.grade, res.self)) correct++
    }
  }
  const cur = p.pendingRate ?? p.rate
  const next = p.opts.autoTempo ? tempoAfter(cur, judged, correct) : cur
  return {
    ...p,
    loop: loopPhraseEnd(p.loop, phrase),
    evaluated: [...p.evaluated, phrase],
    pendingRate: next === p.rate ? null : next,
  }
}

/** 決めた段を時計へ（猶予の中に窓が終わる未判定の音が無いフレームまで待つ。止まっている時計はすぐ） */
function applyRate(r: Run, p: PracticeRun, now: number, effects: RunEffect[]): Run {
  const rate = p.pendingRate
  if (rate === null) return r
  const phase = runPhase(r)
  if (phase === 'playing' || phase === 'syncing') {
    const wLate = lateEdge(r.opts.rules.windows)
    const byIndex = resultsByIndex(r.judge)
    const ends = r.notes.filter((n) => byIndex.get(n.index)?.state === 'pending').map((n) => perfAt(r.map, n.tLandMs) + wLate)
    if (!rateChangeSafe(ends, now)) return r
  }
  const r1: Run = { ...r, practice: { ...p, rate, pendingRate: null, rates: [...p.rates, rate] } }
  return practiceEvent(r1, now, { kind: 'setRate', rate }, effects)
} // prettier-ignore

/**
 * 練習層の 1 フレーム（時計・判定の掃き出しの後）: miss → 自動ループ、フレーズの評価 → 自動昇降、折り返し、段の切替、待ち
 */
function practiceFrame(r0: Run, misses: readonly number[], now: number, effects: RunEffect[]): Run {
  let r = r0
  const pulse = r.song.chart.pulse
  const P = (): PracticeRun => r.practice as PracticeRun
  // miss → 区間の miss か自動ループ（同じ通過で 3 回 → そのフレーズを区間に、すぐ頭出し）
  for (const index of misses) {
    const pos = P().pos.get(index)
    if (pos === undefined) continue
    const m = loopMiss(P().loop, pos)
    r = { ...r, practice: { ...P(), loop: m.state } }
    if (m.start !== null) r = rewindLoop(r, P(), m.start, now, effects)
  }
  // フレーズの評価（境 ＋ 遅れ側の窓 ＋ G を曲 ms に直した後）
  const rules = r.opts.rules
  const tEval = r.t - (lateEdge(rules.windows) + rules.missMarginMs) * P().rate
  const done = phraseOfBar(barOf(pulse, P().ms.msToBeat(tEval))) - 1
  if (done >= P().evalFrom && !P().evaluated.includes(done)) r = { ...r, practice: evalPhrase(r, P(), done) }
  // 折り返し（区間の最後のフレーズもここで評価）。ノーミス 2 周なら区間を外して通しへ
  const range = P().loop.range
  const phase = runPhase(r)
  if (range !== null && (phase === 'playing' || phase === 'syncing') && r.t >= loopLimitMs(P().ms, pulse, range, r.lastEndMs)) {
    const last = phraseOfBar(range.endBar)
    if (!P().evaluated.includes(last)) r = { ...r, practice: evalPhrase(r, P(), last) }
    const w = loopWrap(P().loop)
    r = { ...r, practice: { ...P(), loop: w.state } }
    if (!w.release) r = rewindLoop(r, P(), range, now, effects)
  }
  // 段の切替（待ちの解除より先に。解除の t は今の段で戻す）
  r = applyRate(r, P(), now, effects)
  // 待ち: 再生中に着地に達した組で止める（掃き出しの前にも見ている、waitStopFirst）。待ち中は解除の時刻を見る
  if (runPhase(r) === 'playing') r = waitStopFirst(r, now, effects)
  else if (runPhase(r) === 'waiting') r = releaseWait(r, now, effects)
  return r
} // prettier-ignore

/**
 * 再生中に着地に達した組があれば止める（waitStop）。runFrame は MISS の掃き出しより先にこれを呼ぶ: フレームが途切れて t が
 * 着地を遅れ側の窓より大きく越えても、待つ音を MISS にしない（止まった時計では掃き出さない）。browser pane で見つけた
 */
function waitStopFirst(r: Run, now: number, effects: RunEffect[]): Run {
  const p = r.practice
  if (p === null || p.mode === 'fixed' || runPhase(r) !== 'playing') return r
  const byIndex = resultsByIndex(r.judge)
  const c = waitCheck(
    p.wait,
    p.byLand,
    (i) => (byIndex.get(i)?.state ?? 'pending') === 'pending',
    r.t,
  )
  const r1: Run = c.state === p.wait ? r : { ...r, practice: { ...p, wait: c.state } }
  return c.stop ? practiceEvent(r1, now, { kind: 'waitStop' }, effects) : r1
}

/**
 * 練習の設定を回の途中で替える（S4 のパネル、M2 の手順 6）。待ち方は待ちの状態を作り直し（待ち中なら解除と同じく戻して
 * 再開）、テンポ段は自動昇降と同じく猶予に窓が掛からないフレームまで待って切り替え、区間は決めた直後に頭出し（区間を
 * 外すなら止めずに通しへ）、自動ループ・自動昇降は次の評価から。待機中の回は呼ぶ側が newRun で作り直す
 */
export function runSetPractice(r: Run, now: number, patch: Partial<PracticeOptions>): RunStep {
  const p0 = r.practice
  const effects: RunEffect[] = []
  if (p0 === null) return { run: r, effects }
  const opts: PracticeOptions = { ...p0.opts, ...patch }
  let p: PracticeRun = { ...p0, opts, loop: { ...p0.loop, autoLoop: opts.autoLoop } }
  let next: Run = { ...r, practice: p }
  if (patch.mode !== undefined && patch.mode !== p0.mode) {
    const mode = effectiveMode(patch.mode, 'novideo')
    const group = p0.wait.group
    const wait = { ...initialWait(mode, r.notes, r.song.chart.pulse), waits: p0.wait.waits }
    p = { ...p, mode, wait }
    next = { ...next, practice: p }
    // 待ち中に待ち方を替えたら、待っていた組の着地 − 猶予·rate から再開する（固定テンポなら止まらずに続く）
    if (runPhase(next) === 'waiting' && group !== null) {
      next = practiceEvent(
        next,
        now,
        { kind: 'waitHit', t: group.landMs - GRACE_MS * p.rate },
        effects,
      )
      next = { ...next, sched: seekSchedule(next.sched, next.items, group.landMs) }
    }
  }
  if (patch.rate !== undefined) {
    const cur = next.practice as PracticeRun
    next = {
      ...next,
      practice: { ...cur, pendingRate: patch.rate === cur.rate ? null : patch.rate },
    }
    next = applyRate(next, next.practice as PracticeRun, now, effects)
  }
  if (patch.loop !== undefined) {
    const cur = next.practice as PracticeRun
    const loop = setLoop(cur.loop, patch.loop)
    next = { ...next, practice: { ...cur, loop } }
    const phase = runPhase(next)
    if (patch.loop !== null && phase !== 'idle' && phase !== 'ended')
      next = rewindLoop(next, next.practice as PracticeRun, patch.loop, now, effects)
  }
  return { run: next, effects }
}

/** 今の t の小節（1 始まり。助走の間は 1） */
export function runBar(r: Run): number {
  const pulse = r.song.chart.pulse
  const ms = r.practice?.ms ?? buildMsTable(pulse)
  return Math.max(1, barOf(pulse, ms.msToBeat(Math.max(0, r.t))))
}

/** 曲の小節の数（最終ノートの終わりを含む小節まで） */
export function runBars(r: Run): number {
  const pulse = r.song.chart.pulse
  const ms = r.practice?.ms ?? buildMsTable(pulse)
  return Math.max(1, barOf(pulse, ms.msToBeat(Math.max(0, r.lastEndMs - 1))))
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
  // 待ちは掃き出しより先（途切れたフレームの後でも、待つ音を MISS にせず止める）
  if (next.practice !== null) next = waitStopFirst(next, now, effects)
  const j = judgeSweep(next.judge, { map: next.map, now })
  next = { ...next, judge: j.state }
  effects.push(...judgeEffects(next, j.out, now))
  if (next.practice !== null) {
    const misses = j.out.flatMap((o) => (o.kind === 'miss' ? [o.index] : []))
    next = practiceFrame(next, misses, now, effects)
  }
  // ループ中は chartEnd を出さない（区間の終わりで折り返す、§7-10）
  if (next.t > next.endMs && runPhase(next) === 'playing' && next.practice?.loop.range == null) {
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
  /** 待ち方（通常プレイは fixed） */
  readonly mode: PlayMode
  /** 記録のテンポ段（回の全てを 1.0 で弾いたときだけ 1。途中で替えたら最後に使った 1.0 以外の段。decisions #87） */
  readonly rate: number
  /** 練習の要約（通常プレイは null。計測の play 行と S3 の条件） */
  readonly practice: PracticeSummary | null
  /** 校正 段 2 の母集団に入れるか（固定テンポ・1.0 倍・全鍵・ループ無しの通常プレイ。§2.7） */
  readonly calibEligible: boolean
  /** 苦手区間（miss が最も多い連続 2 小節。miss が無ければ null） */
  readonly weak: WeakBars | null
  /** 同時押しが合った割合 */
  readonly chords: ChordRate
}

/** 練習の要約（m6 L451「測ること」: ループの回数・テンポ段の始めと終わり・待った回数、§7-20） */
export interface PracticeSummary {
  readonly loops: number
  readonly tempoFrom: number
  readonly tempoTo: number
  readonly waits: number
}

/** 記録のテンポ段: 全て 1.0 なら 1、途中で替えたら最後に使った 1.0 以外の段（1.0 に戻っても練習記録のまま） */
export function recordRate(rates: readonly number[]): number {
  for (let i = rates.length - 1; i >= 0; i--) if (rates[i] !== 1) return rates[i] as number
  return 1
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
  const p = r.practice
  const mode = p?.mode ?? 'fixed'
  const rate = p === null ? 1 : recordRate(p.rates)
  const keyset = r.opts.keyset ?? 'all'
  const practice: PracticeSummary | null =
    p === null
      ? null
      : {
          loops: p.loop.loops,
          tempoFrom: p.rates[0] ?? 1,
          tempoTo: p.rates[p.rates.length - 1] ?? 1,
          waits: p.wait.waits,
        }
  return {
    chartId: r.song.chartId,
    variantId: r.song.variant.id,
    name: r.song.name,
    judge: summarizeJudge(r.judge),
    audioLateMaxMs: r.items.length === 0 ? null : r.sched.lateMaxMs,
    samples: timingSamples(r.judge),
    offsetUsed: r.opts.rules.offsetMs,
    keyset,
    mode,
    rate,
    practice,
    calibEligible:
      keyset === 'all' && mode === 'fixed' && rate === 1 && (practice?.loops ?? 0) === 0,
    weak: weakBars(r.song.chart.pulse, notes),
    chords: chordRate(notes),
  }
}

/** 保存した記録を持つ終わった回（S3 へ） */
export interface FinishedPlay extends PlayResult {
  readonly record: ResultRecord
  /** 初回導線（S0d）の最後の段階で、導線がここで終わる（S3 の注記） */
  readonly onboardEnd?: boolean
}

/**
 * 終わった回と記録。動画なし（clock novideo・syncUsed audio）。待ち方・テンポ段・ループは練習層の実値（M2-03）、鍵数制限は
 * RunOptions.keyset。id と at は呼ぶ側（crypto.randomUUID と Date）
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
      mode: o.mode,
      rate: o.rate,
      keyset: o.keyset,
      at: meta.at,
      syncUsed: { kind: 'audio' },
      offsetUsed: o.offsetUsed,
      ...((o.practice?.loops ?? 0) > 0 ? { looped: true } : {}),
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
    // 足場外しの α はこの回で動いた所から続ける（M2-04）
    const s = runInput(newRun(r.song, { ...r.opts, fade: r.judge.fade }), now, { kind: 'start' })
    return {
      step: { run: s.run, effects: [{ kind: 'cancelSounds' }, ...s.effects] },
      go: null,
      fresh: true,
    }
  }
  const step = runInput(r, now, a.event)
  return { step, go: null, fresh: runPhase(r) === 'idle' && runPhase(step.run) !== 'idle' }
}
