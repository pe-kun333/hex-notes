// 判定（M0-06、手順 8）。出どころ: design.md §2.3（窓・NEAR・ホールド・窓の外は無視、GOOD 遅れ側を過ぎたら MISS）・
// §2.6（判定は実時間で比べる、猶予 300 ms は判定保留、猶予内に窓が終わるノートは skipped）、m1' `judge` L318–324・
// `miss` L325・`releaseHold` L327・`onKey` L330–341（作り直し）、m4 `judge` L423–430（作り直し）、m3 `resync` L376–382
// （ヒット済みは戻さない）、kickoff §7-16、decisions #25（押下は tsPerf の順、forced は採点しない）・#32〜#34・#38〜#40（仮）。
//
// 状態は値で持つ純関数（時計層・入力層と同じ形）。時刻は全て ms。押下・離しの tsPerf と now は実時間（performance 基準）、
// ノートの tLandMs・tEndMs は譜面の軸。時計の出力 map（動画の軸、t ＝ a·perf ＋ b）を rules.axis で譜面の軸へ換算し、
// ノートの実時刻 ＝ perfAt(map, tLand) と、押した実時刻 ＋ 校正のオフセット（calibration-offset.ts）を比べる。
//
// 呼ぶ側の順: 毎フレーム judgeClock（その回の時計の事象）→ judgeSweep。入力のハンドラでは judgePress・judgeRelease
// （先に judgeClock で時計を今に進める）。押下は届いた順に渡す（tsPerf の順。猶予中に溜めた押下は tsPerf で並べ直す）。
// 練習層（M2-03、M2 の手順 5）の口: 待ちで当てた音 judgeWaitHit（perfect、ずれの標本に入れない、待ち中の誤打は tainted）と、
// ループの頭出しで区間の音を未判定に戻す judgeRewind（decisions #39 (c) の例外、#80・#87）。

import { endsInGrace } from '../clock/grace.ts'
import { IDENTITY_AXIS, perfAt, toChartMap, type SyncAxis } from '../clock/map.ts'
import type { ClockEvent, ClockMap } from '../clock/types.ts'
import { hexDist, type HexPos } from '../render/hex/hex.ts'
import type { JudgeCounts, Judgment, KeyCode, Rank, SelfRate } from '../shared/types.ts'
import { judgedTime } from './calibration-offset.ts'
import { releaseResult, type HoldResult } from './hold.ts'
import {
  accuracyOf,
  addJudgment,
  histogramOf,
  initialScore,
  isCleared,
  isFullCombo,
  judgedOf,
  mean,
  rankOf,
  sampleSd,
  unstableRate,
  type ScoreState,
} from './score.ts'
import {
  classify,
  emptySelfRate,
  fadeAfter,
  initialFade,
  labelVisible,
  type FadeState,
  type LabelSides,
  type SelfCategory,
} from './self-rate.ts'
import {
  PROFILES,
  gradeOf,
  inGoodWindow,
  lateEdge,
  releaseWindow,
  type ProfileRules,
} from './windows.ts'

/** MISS の確定の余裕 G（ms）。まだハンドラに届いていない押下の分（kickoff §7-16 の候補 50 ms、decisions #38、仮） */
export const MISS_MARGIN_MS = 50
/** 終了 ＝ 最終ノートの終わり＋1.2 秒（§4.2） */
export const END_TAIL_MS = 1200

/** 判定するノート（描画層の FrameNote と同じ名前の欄。そのまま渡せる） */
export interface JudgeNote {
  /** notes の添字（結果・事象はこれで返す） */
  readonly index: number
  readonly code: KeyCode
  /** 鍵の MIDI（足場外しの α は音高ごと） */
  readonly midi: number
  /** 譜面の軸の ms */
  readonly tLandMs: number
  readonly tEndMs: number
  readonly hold: boolean
}

export interface JudgeRules extends ProfileRules {
  /** 校正のオフセット ms（判定だけに効かせる。decisions #40） */
  readonly offsetMs: number
  /** MISS の確定の余裕 ms */
  readonly missMarginMs: number
  /** 時計の軸 → 譜面の軸（sync.sources[0]。map.ts の axisOf） */
  readonly axis: SyncAxis
  /** 2 つの鍵が NEAR の距離か（near 0 なら呼ばない） */
  readonly neighbor: (a: KeyCode, b: KeyCode) => boolean
  /** ラベルの出し方（自力率の hinted／solo） */
  readonly labels: LabelSides
  /**
   * 足場外しを止める（退避 geometry fallback の間。キー文字は常に見えるので hinted に数え、α も動かさない。#45 (c)・#73 (c)、
   * m2-kickoff §7-13）。無ければ偽
   */
  readonly fadeFrozen?: boolean
}

export type JudgeRulesInput = Partial<Omit<JudgeRules, keyof ProfileRules>> &
  Pick<JudgeRules, 'neighbor'>

/** プロファイルの既定値に、校正・余裕・軸・隣・ラベルを足す */
export function rulesOf(profile: ProfileRules, over: JudgeRulesInput): JudgeRules {
  return {
    ...profile,
    offsetMs: 0,
    missMarginMs: MISS_MARGIN_MS,
    axis: IDENTITY_AXIS,
    labels: { kb: 'both', note: 'both' },
    ...over,
  }
}

/** 鍵の位置の表（KeyboardGrid.byCode をそのまま渡せる）から、六角距離 1 の組を NEAR にする関数 */
export function neighborOf(
  byCode: ReadonlyMap<KeyCode, HexPos>,
): (a: KeyCode, b: KeyCode) => boolean {
  return (a, b) => {
    const p = byCode.get(a)
    const q = byCode.get(b)
    return p !== undefined && q !== undefined && hexDist(p, q) === 1
  }
}

/** 1 音の結果 */
export interface NoteResult {
  /** pending ＝ 未判定、holding ＝ ホールド中、done ＝ 判定済み・skipped */
  readonly state: 'pending' | 'holding' | 'done'
  /** 判定（pending・skipped は null） */
  readonly grade: Judgment | null
  /** 猶予内に窓が終わって判定しなかった（精度・自力率の分母に入れない。decisions #39） */
  readonly skipped: boolean
  /** 判定に使った実時刻（校正込み）− 着地の実時刻（ms、正が遅れ）。当てた音と NEAR だけ */
  readonly dtMs: number | null
  /** 押した鍵（NEAR なら隣の鍵）。ホールドはこの鍵の離しで閉じる */
  readonly key: KeyCode | null
  readonly hold: HoldResult | null
  readonly self: SelfCategory | null
}

const PENDING: NoteResult = Object.freeze({
  state: 'pending',
  grade: null,
  skipped: false,
  dtMs: null,
  key: null,
  hold: null,
  self: null,
})

/** 猶予中に溜めた押下（離しが猶予中に来たらそれも持つ） */
interface Deferred {
  readonly code: KeyCode
  readonly tsPerf: number
  readonly release: { readonly tsPerf: number; readonly forced: boolean } | null
}

export interface JudgeState {
  readonly rules: JudgeRules
  /** 着地の順（同じなら index の順）に並べ直したノート */
  readonly notes: readonly JudgeNote[]
  /** notes と同じ並び */
  readonly results: readonly NoteResult[]
  /** 最初の未解決（pending・holding）の位置 */
  readonly from: number
  /** 猶予の中か（resync で立て、graceEnd で下ろす）。中の押下は溜めて猶予の終わりに判定する */
  readonly inGrace: boolean
  readonly deferred: readonly Deferred[]
  /** 押している鍵 → ホールド中の音の位置 */
  readonly holds: ReadonlyMap<KeyCode, number>
  readonly score: ScoreState
  readonly fade: FadeState
  readonly selfRate: SelfRate
}

/** 判定の事象（演出・音・計測は呼ぶ側がこれから作る） */
export type JudgeOutcome =
  /** 当てた（grade は perfect／great／good／near）。code は押した鍵、noteCode はノートの鍵 */
  | {
      readonly kind: 'hit'
      readonly index: number
      readonly grade: Judgment
      readonly dtMs: number
      readonly code: KeyCode
      readonly noteCode: KeyCode
      readonly self: SelfCategory
    }
  | { readonly kind: 'miss'; readonly index: number; readonly noteCode: KeyCode }
  | { readonly kind: 'skipped'; readonly index: number }
  /** 窓の外・鍵違いの押下（空打ち。§2.3「押下は無視」）。stopped は時計が止まっている間の押下 */
  | {
      readonly kind: 'stray'
      readonly code: KeyCode
      readonly tsPerf: number
      readonly reason: 'window' | 'stopped'
    }
  /** 猶予中の押下を溜めた（猶予の終わりに判定する） */
  | { readonly kind: 'deferred'; readonly code: KeyCode; readonly tsPerf: number }
  /** 溜めた押下を捨てた（猶予の終わりの前に次の再アンカーが来た） */
  | { readonly kind: 'dropped'; readonly count: number }
  | { readonly kind: 'holdEnd'; readonly index: number; readonly result: HoldResult }
  /** ゲージが 0 になった（音ゲー向けの途中終了、1 回だけ） */
  | { readonly kind: 'failed' }

export interface JudgeStep {
  state: JudgeState
  out: JudgeOutcome[]
}

/** その回の時計（出力の map は動画の軸のまま渡す） */
export interface JudgeClock {
  readonly map: ClockMap
  readonly now: number
}

export function initialJudge(
  notes: readonly JudgeNote[],
  rules: JudgeRules,
  fade: FadeState = initialFade(),
): JudgeState {
  const sorted = [...notes].sort((x, y) => x.tLandMs - y.tLandMs || x.index - y.index)
  return {
    rules,
    notes: sorted,
    results: sorted.map(() => PENDING),
    from: 0,
    inGrace: false,
    deferred: [],
    holds: new Map(),
    score: initialScore(),
    fade,
    selfRate: emptySelfRate(),
  }
}

/** 既定の規則（入門者、隣なし）。試験と開発ページの手早い形 */
export function beginnerRules(over: Partial<JudgeRules> = {}): JudgeRules {
  return { ...rulesOf(PROFILES.beginner, { neighbor: () => false }), ...over }
}

// ---------- 内部: 書き換えの小道具（写してから変える） ----------

/** 1 回の処理の作業台。終わりに freeze で状態に戻す */
interface Work {
  s: JudgeState
  results: NoteResult[] | null
  holds: Map<KeyCode, number> | null
  out: JudgeOutcome[]
}

function begin(s: JudgeState): Work {
  return { s, results: null, holds: null, out: [] }
}

function resultsOf(w: Work): NoteResult[] {
  if (w.results === null) w.results = [...w.s.results]
  return w.results
}

function holdsOf(w: Work): Map<KeyCode, number> {
  if (w.holds === null) w.holds = new Map(w.s.holds)
  return w.holds
}

function curResult(w: Work, i: number): NoteResult {
  return (w.results ?? w.s.results)[i] ?? PENDING
}

function curHolds(w: Work): ReadonlyMap<KeyCode, number> {
  return w.holds ?? w.s.holds
}

function finish(w: Work): JudgeStep {
  const results = w.results ?? w.s.results
  let from = w.s.from
  while (from < results.length && results[from]?.state === 'done') from++
  const state: JudgeState =
    w.results === null && w.holds === null && from === w.s.from
      ? w.s
      : { ...w.s, results, holds: w.holds ?? w.s.holds, from }
  return { state, out: w.out }
}

const chartMap = (s: JudgeState, map: ClockMap): ClockMap => toChartMap(map, s.rules.axis)

/** 判定を 1 つ決めて点・自力率・足場外しを進める */
function settle(
  w: Work,
  i: number,
  grade: Judgment,
  dt: number | null,
  code: KeyCode | null,
  tainted = false,
): void {
  const s = w.s
  const n = s.notes[i]
  if (n === undefined) return
  const r = s.rules
  const hit = grade === 'miss' ? 'miss' : grade === 'near' ? 'near' : 'hit'
  const cat = classify(
    hit,
    r.fadeFrozen === true || labelVisible(s.fade, n.midi, r.labels),
    tainted,
  )
  const holding = n.hold && hit !== 'miss' && code !== null
  const results = resultsOf(w)
  results[i] = {
    state: holding ? 'holding' : 'done',
    grade,
    skipped: false,
    dtMs: hit === 'miss' ? null : dt,
    key: hit === 'miss' ? null : code,
    hold: null,
    self: cat,
  }
  if (holding && code !== null) {
    const holds = holdsOf(w)
    const old = holds.get(code)
    // 同じ鍵のホールドが閉じずに残っていたら（離しを取り逃した）、採点せずに閉じる
    if (old !== undefined) closeHold(w, old, 'forced')
    holds.set(code, i)
  }
  const failedBefore = s.score.failed
  const score = addJudgment(s.score, grade, r.gauge)
  w.s = {
    ...w.s,
    score,
    fade: r.fadeFrozen === true ? s.fade : fadeAfter(s.fade, n.midi, cat),
    selfRate: { ...s.selfRate, [cat]: s.selfRate[cat] + 1 },
  }
  if (hit === 'miss') w.out.push({ kind: 'miss', index: n.index, noteCode: n.code })
  else
    w.out.push({
      kind: 'hit',
      index: n.index,
      grade,
      dtMs: dt ?? 0,
      code: code ?? n.code,
      noteCode: n.code,
      self: cat,
    })
  if (!failedBefore && score.failed) w.out.push({ kind: 'failed' })
}

function closeHold(w: Work, i: number, result: HoldResult): void {
  const cur = curResult(w, i)
  if (cur.state !== 'holding') return
  const results = resultsOf(w)
  results[i] = { ...cur, state: 'done', hold: result }
  if (cur.key !== null && curHolds(w).get(cur.key) === i) holdsOf(w).delete(cur.key)
  const n = w.s.notes[i]
  if (n) w.out.push({ kind: 'holdEnd', index: n.index, result })
}

/**
 * 押下 1 つを今の写像で判定する。同じ鍵の未判定の音のうち GOOD の窓の中で最も近い音（同じ近さなら先の音）を取り、
 * 無ければ隣の鍵（六角距離 ≤ near）の音を NEAR で取る（m1' onKey L333–336 の順）。どちらも無ければ空打ち。
 */
function pressNow(w: Work, code: KeyCode, tsPerf: number, map: ClockMap): void {
  const s = w.s
  const r = s.rules
  if (!(map.a > 0)) {
    w.out.push({ kind: 'stray', code, tsPerf, reason: 'stopped' })
    return
  }
  const tj = judgedTime(tsPerf, r.offsetMs)
  let same = -1
  let sameD = Infinity
  let near = -1
  let nearD = Infinity
  for (let i = s.from; i < s.notes.length; i++) {
    const n = s.notes[i]
    if (n === undefined) break
    const dt = tj - perfAt(map, n.tLandMs)
    // 早い側の窓の外: これより後の音はもっと遠い
    if (dt < -r.windows.good) break
    if (curResult(w, i).state !== 'pending' || !inGoodWindow(r.windows, dt)) continue
    const d = Math.abs(dt)
    if (n.code === code) {
      if (d < sameD) {
        same = i
        sameD = d
      }
    } else if (r.near > 0 && d < nearD && r.neighbor(n.code, code)) {
      near = i
      nearD = d
    }
  }
  const pick = same >= 0 ? same : near
  const n = s.notes[pick]
  if (pick < 0 || n === undefined) {
    w.out.push({ kind: 'stray', code, tsPerf, reason: 'window' })
    return
  }
  const dt = tj - perfAt(map, n.tLandMs)
  const grade = same >= 0 ? (gradeOf(r.windows, dt) ?? 'good') : 'near'
  settle(w, pick, grade, dt, code)
}

/** 離し 1 つ。ホールド中の鍵なら閉じる（forced・止まった時計は採点しない） */
function releaseNow(w: Work, code: KeyCode, tsPerf: number, forced: boolean, map: ClockMap): void {
  const i = curHolds(w).get(code)
  if (i === undefined) return
  const n = w.s.notes[i]
  if (n === undefined) return
  if (forced || !(map.a > 0)) {
    closeHold(w, i, 'forced')
    return
  }
  const r = w.s.rules
  const tj = judgedTime(tsPerf, r.offsetMs)
  closeHold(w, i, releaseResult(tj, perfAt(map, n.tEndMs), releaseWindow(r.windows)))
}

// ---------- 公開の関数 ----------

/**
 * 時計の事象を写す。resync（再アンカー）: 溜めた押下を捨て、猶予に入り、未判定の音のうち猶予内に窓が終わる音を
 * skipped にする（名目の写像で。判定済み・ホールド中の音は戻さない＝広告明けで t が戻っても二度判定しない。
 * m3 resync L379。decisions #39）。graceEnd: 猶予を出て、溜めた押下を tsPerf の順に今の写像で判定する。
 */
export function judgeClock(
  s0: JudgeState,
  events: readonly ClockEvent[],
  clock: JudgeClock,
): JudgeStep {
  const w = begin(s0)
  for (const ev of events) {
    if (ev.kind === 'resync') {
      if (w.s.deferred.length > 0) w.out.push({ kind: 'dropped', count: w.s.deferred.length })
      w.s = { ...w.s, inGrace: true, deferred: [] }
      const r = w.s.rules
      const nominal = chartMap(w.s, ev.nominal)
      const wLate = lateEdge(r.windows)
      for (let i = w.s.from; i < w.s.notes.length; i++) {
        const n = w.s.notes[i]
        if (n === undefined) break
        // 判定に使う実時刻の軸（押した実時刻 ＋ 校正）で、着地 ＝ perfAt − offset
        const land = perfAt(nominal, n.tLandMs) - r.offsetMs
        if (!endsInGrace(land, wLate, ev.graceUntil)) break
        if (curResult(w, i).state !== 'pending') continue
        resultsOf(w)[i] = { ...PENDING, state: 'done', skipped: true }
        w.out.push({ kind: 'skipped', index: n.index })
      }
    } else if (ev.kind === 'graceEnd') {
      const queue = [...w.s.deferred].sort((a, b) => a.tsPerf - b.tsPerf)
      w.s = { ...w.s, inGrace: false, deferred: [] }
      const map = chartMap(w.s, clock.map)
      for (const d of queue) {
        pressNow(w, d.code, d.tsPerf, map)
        if (d.release) releaseNow(w, d.code, d.release.tsPerf, d.release.forced, map)
      }
    }
  }
  return finish(w)
}

/** 押下 1 つ（入力層の press）。猶予中なら溜める */
export function judgePress(
  s0: JudgeState,
  press: { readonly code: KeyCode; readonly tsPerf: number },
  clock: JudgeClock,
): JudgeStep {
  if (s0.inGrace) {
    const d: Deferred = { code: press.code, tsPerf: press.tsPerf, release: null }
    return {
      state: { ...s0, deferred: [...s0.deferred, d] },
      out: [{ kind: 'deferred', code: press.code, tsPerf: press.tsPerf }],
    }
  }
  const w = begin(s0)
  pressNow(w, press.code, press.tsPerf, chartMap(s0, clock.map))
  return finish(w)
}

/** 離し 1 つ（入力層の release。forced は全離し）。猶予中は溜めた押下の離しとして持つ */
export function judgeRelease(
  s0: JudgeState,
  rel: { readonly code: KeyCode; readonly tsPerf: number; readonly forced: boolean },
  clock: JudgeClock,
): JudgeStep {
  if (s0.inGrace) {
    const k = s0.deferred.findIndex((d) => d.code === rel.code && d.release === null)
    if (k >= 0) {
      const deferred = s0.deferred.map((d, j) =>
        j === k ? { ...d, release: { tsPerf: rel.tsPerf, forced: rel.forced } } : d,
      )
      return { state: { ...s0, deferred }, out: [] }
    }
  }
  const w = begin(s0)
  releaseNow(w, rel.code, rel.tsPerf, rel.forced, chartMap(s0, clock.map))
  return finish(w)
}

/**
 * 毎フレーム。未判定の音で、遅れ側の窓の終わりが now − G より前になった音を MISS にし（猶予中は見ない）、終点を
 * 過ぎたホールドを ok で閉じる。時計が止まっている（a ≤ 0）間は何もしない。
 */
export function judgeSweep(s0: JudgeState, clock: JudgeClock): JudgeStep {
  const map = chartMap(s0, clock.map)
  if (!(map.a > 0)) return { state: s0, out: [] }
  const w = begin(s0)
  const r = s0.rules
  const nowJ = judgedTime(clock.now, r.offsetMs)
  if (!s0.inGrace) {
    const wLate = lateEdge(r.windows)
    for (let i = s0.from; i < s0.notes.length; i++) {
      const n = s0.notes[i]
      if (n === undefined) break
      if (perfAt(map, n.tLandMs) + wLate >= nowJ - r.missMarginMs) break
      if (curResult(w, i).state === 'pending') settle(w, i, 'miss', null, null)
    }
  }
  for (const [, i] of [...curHolds(w)]) {
    const n = w.s.notes[i]
    if (n !== undefined && nowJ >= perfAt(map, n.tEndMs)) closeHold(w, i, 'ok')
  }
  return finish(w)
}

// ---------- 練習層の口（M2-03） ----------

/**
 * 待ちで当てた音（§2.7「音待ち／フレーズ待ち」、decisions #80）。index は notes の添字。perfect で記録し、dt は持たない
 * （ずれの標本・FAST／SLOW に入れない）。自力率は α のラベルで hinted／solo、tainted（待ち中に鍵違いを押した）なら miss。
 * 未判定でなければ何もしない
 */
export function judgeWaitHit(
  s0: JudgeState,
  index: number,
  opts: { readonly tainted: boolean },
): JudgeStep {
  const i = s0.notes.findIndex((n) => n.index === index)
  const n = s0.notes[i]
  if (n === undefined || s0.results[i]?.state !== 'pending') return { state: s0, out: [] }
  const w = begin(s0)
  settle(w, i, 'perfect', null, n.code, opts.tainted)
  return finish(w)
}

/**
 * ループの頭出し（§2.7「自動ループ」、m2-kickoff §7-10）。着地が fromChartMs 以上の音を未判定に戻す（判定済み・skipped。
 * ホールド中は採点せずに閉じてから戻す）。点・自力率・α・コンボは戻さない（周をまたいで積む）。溜めた押下は捨てる。
 * decisions #39 (c)「再アンカーは判定済みを戻さない」の例外で、ループの折り返しと区間を決めた直後だけ呼ぶ
 */
export function judgeRewind(s0: JudgeState, fromChartMs: number): JudgeStep {
  const w = begin(s0)
  for (const [code, i] of [...curHolds(w)]) {
    const n = w.s.notes[i]
    if (n !== undefined && n.tLandMs >= fromChartMs) {
      resultsOf(w)[i] = PENDING
      holdsOf(w).delete(code)
    }
  }
  for (let i = 0; i < w.s.notes.length; i++) {
    const n = w.s.notes[i]
    if (n !== undefined && n.tLandMs >= fromChartMs && curResult(w, i).state !== 'pending')
      resultsOf(w)[i] = PENDING
  }
  if (w.s.deferred.length > 0) w.out.push({ kind: 'dropped', count: w.s.deferred.length })
  w.s = { ...w.s, deferred: [] }
  const step = finish(w)
  // finish は from を前へしか進めないので、戻した位置まで数え直す
  const results = step.state.results
  let from = 0
  while (from < results.length && results[from]?.state === 'done') from++
  return from === step.state.from ? step : { ...step, state: { ...step.state, from } }
}

// ---------- 読み出し ----------

/** 全ての音が判定済み（skipped を含む）か */
export function isComplete(s: JudgeState): boolean {
  return s.from >= s.notes.length
}

/** 終了の譜面の ms（最終ノートの終わり＋1.2 秒。ノートが無ければ 1.2 秒） */
export function endAtMs(notes: readonly Pick<JudgeNote, 'tEndMs'>[]): number {
  return notes.reduce((m, n) => Math.max(m, n.tEndMs), 0) + END_TAIL_MS
}

/** index → 結果（描画のノートの状態に写す） */
export function resultsByIndex(s: JudgeState): Map<number, NoteResult> {
  const m = new Map<number, NoteResult>()
  s.notes.forEach((n, i) => m.set(n.index, s.results[i] ?? PENDING))
  return m
}

/** 時刻のずれの標本: 正しい鍵で当てた音（perfect・great・good）の dt。NEAR は入れない（decisions #39） */
export function timingSamples(s: JudgeState): number[] {
  const out: number[] = []
  for (const r of s.results)
    if (r.dtMs !== null && (r.grade === 'perfect' || r.grade === 'great' || r.grade === 'good'))
      out.push(r.dtMs)
  return out
}

/**
 * FAST／SLOW（S2 の HUD・S3 の音ゲー向けの節）: 正しい鍵の当たりのうち perfect 以外（great・good）を dt の符号で数える
 * （dt < 0 が FAST、dt > 0 が SLOW。perfect と dt 0 は数えない。m2-kickoff 手順 9・§7-19、仮）
 */
export function fastSlowOf(s: Pick<JudgeState, 'results'>): { fast: number; slow: number } {
  let fast = 0
  let slow = 0
  for (const r of s.results) {
    if (r.dtMs === null || (r.grade !== 'great' && r.grade !== 'good')) continue
    if (r.dtMs < 0) fast++
    else if (r.dtMs > 0) slow++
  }
  return { fast, slow }
}

export interface JudgeSummary {
  /** 精度 0–1（判定した音が無ければ 1） */
  readonly acc: number
  readonly rank: Rank
  readonly counts: JudgeCounts
  /** 判定しなかった音（精度の分母の外） */
  readonly skipped: number
  readonly selfRate: SelfRate
  /** 正しい鍵で当てた音の dt の平均・SD（n − 1）・UR（SD×10）・早遅ヒストグラム。標本が足りなければ null */
  readonly meanMs: number | null
  readonly sdMs: number | null
  readonly ur: number | null
  readonly hist: Record<string, number>
  /** NEAR ／ 判定した音（無ければ 0） */
  readonly nearRate: number
  readonly holds: { readonly ok: number; readonly early: number; readonly forced: number }
  readonly maxCombo: number
  /** FAST／SLOW（fastSlowOf） */
  readonly fastSlow: { readonly fast: number; readonly slow: number }
  /** 音ゲー向けだけ（入門者は null） */
  readonly gamer: {
    readonly points: number
    readonly gauge: number
    readonly fullCombo: boolean
    readonly cleared: boolean
    readonly failed: boolean
  } | null
}

export function summarizeJudge(s: JudgeState): JudgeSummary {
  const sc = s.score
  const acc = accuracyOf(sc)
  const dts = timingSamples(s)
  const judged = judgedOf(sc.counts)
  const holds = { ok: 0, early: 0, forced: 0 }
  for (const r of s.results) if (r.hold !== null) holds[r.hold]++
  return {
    acc,
    rank: rankOf(acc),
    counts: sc.counts,
    skipped: s.results.filter((r) => r.skipped).length,
    selfRate: s.selfRate,
    meanMs: mean(dts),
    sdMs: sampleSd(dts),
    ur: unstableRate(dts),
    hist: histogramOf(dts),
    nearRate: judged > 0 ? sc.counts.near / judged : 0,
    holds,
    maxCombo: sc.maxCombo,
    fastSlow: fastSlowOf(s),
    gamer: s.rules.gauge
      ? {
          points: sc.points,
          gauge: sc.gauge,
          fullCombo: isFullCombo(sc.counts),
          cleared: isCleared(sc),
          failed: sc.failed,
        }
      : null,
  }
}
