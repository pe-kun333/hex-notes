// DEV の動画の口と、pane から読む口（M3 の手順 2、仮。m3-kickoff 手順 2「入口」・§7-13、decisions #36）。src/main.ts の
// DEV 分岐が動的に読み、殻の videoPort（ShellOptions.videoPort）と devProbe へ渡す。build の束には入らない。
// 表 DUMMY_VIDEOS（ダミーの動画 ID〔形だけ正しい 11 文字〕→ 筋書き）に当たる videoId なら、手順 1 の dummyPort に筋書きを
// 被せ、プレイヤー矩形の中に釦「▶（ダミー）」を置いた口を返す。外れれば null（殻が実物の口を作る）。筋書きの時刻は ▶ からの
// ms（tests/unit/app/play-runner-video.test.ts の (9) と同じ作り。手順 4 の段 4 も同じ表を引く）。
// window.__hexnoteDev（DEV だけ）: ダミーが受けた要求と事象（状態の変化）の列・AudioContext の state・回の相と源・最後の記録。
// 手順 5 で失敗の筋書き 4 行（onError 150 の ▶ の前・再生中 5 秒、読込の失敗、応答なし。事象は実物と同じく口の作り手の onEvent が
// 運ぶ。VideoPort の型と dummyPort は変えない）と、口の dispose の回数・失敗の事象の列を足した。
// 手順 7 で「▶（ダミー）」を stuck(0) → play に（凍結を解く利用者の ▶）、筋書き「広告中から切替」1 行（1 回目の pauseVideo だけ
// 効かない）、実物の口の読みを固める freezeReads（window.__hexnoteDev.freeze(forMs)。殻の wrapVideoPort が実物の口を包む）を足した。
// 手順 6 で筋書き「playVideo 無効」1 行（手順 1 の dummyPort の pass が playVideo だけ偽 ＝ 呼べたが効かない。再開の Space の後に
// 自動再生ブロックの帯。利用者の ▶（ダミー）は口を通らないので効く）を足した。
// 手順 3 で band（帯を点ける。殻の band へ）と actions（帯の釦の押下の記録）を足した。performance.now の直呼びは src/app/ だけ
// （src/README.md）。
// M4 の手順書 §7-13 (i)（decisions #128）: 実物の口も recordingPort で包み、要求と状態の変わり目を同じ列に残す（m3-verification
// §16 の「▶ の後の状態の列」と「pauseVideo → PAUSED の遅れ」を DEV で読めるように）。

import {
  createDummyVideo,
  dummyPort,
  type DummyVideo,
  type DummyVideoOptions,
} from '../../clock/dummy-video.ts'
import type { VideoPort, VideoRequest, VideoState } from '../../clock/types.ts'
import type { ResultRecord } from '../../shared/types.ts'
import type { BandEvent } from '../bands.ts'
import type { DevProbe, DevPlayState, Shell } from '../shell.ts'
import type { MountOptions } from '../youtube-player.ts'
import { errorGroupOf } from '../../youtube/errors.ts'
import type { PortEvent } from '../../youtube/port.ts'

/** 筋書きの 1 手（▶ から at ms に、ダミーへ） */
export interface ScriptStep {
  readonly at: number
  run(d: DummyVideo, now: number): void
}

/** 表の 1 行 */
export interface DummyScenario {
  /** ダミーの動画 ID（形だけ正しい 11 文字。実在の動画ではない） */
  readonly id: string
  readonly label: string
  /** ダミー動画の作り（既定は 15 ms 切り捨て・種 7） */
  readonly options: DummyVideoOptions
  readonly script: readonly ScriptStep[]
  /** 失敗の筋書き（mount ＝ 口を作って 300 ms 後、数 ＝ ▶ からの ms。M3 の手順 5） */
  readonly fail?: {
    readonly at: 'mount' | number
    readonly kind: 'error' | 'loadFail' | 'noResponse'
    readonly code: number
  }
  /** 口の playVideo を呼べたが効かない（自動再生ブロックの模擬。M3 の手順 6） */
  readonly blockPlay?: true
  /** 1 回目の pauseVideo だけ効かない（広告中から切替の模擬。M3 の手順 7） */
  readonly dropFirstPause?: true
}

/** DEV の表（S1 の「試験: クリック 100 BPM」の 5 行と、手順 4 の段 4） */
export const DUMMY_VIDEOS: readonly DummyScenario[] = [
  { id: 'hexDmyPlain', label: '何もしない', options: {}, script: [] },
  {
    id: 'hexDmyJump3',
    label: '飛び ＋300 ms（10 秒）',
    options: {},
    script: [{ at: 10_000, run: (d, now) => d.jump(300, now) }],
  },
  {
    id: 'hexDmyFreez',
    label: '凍結（10 秒から）',
    options: {},
    script: [{ at: 10_000, run: (d, now) => d.stuck(60_000, now) }],
  },
  {
    id: 'hexDmyAdPau',
    label: 'pause の効かない凍結 6 秒（10 秒）',
    options: { pauseLatencyMs: 'never' },
    script: [{ at: 10_000, run: (d, now) => d.stuck(6_000, now) }],
  },
  {
    id: 'hexDmyAdHld',
    label: '時刻も止まる広告 6 秒（10 秒）',
    options: { pauseLatencyMs: 'never', freezeHold: true, seekFreezeMs: 6_000 },
    script: [{ at: 10_000, run: (d, now) => d.seek(d.trueTime(now), now) }],
  },
  // 失敗の筋書き（M3 の手順 5。ID は行ごとに 1 つ、見本の動画とも実物の試しの abcdefghijk とも別）
  {
    id: 'hexDmyE150p',
    label: 'onError 150（▶ の前）',
    options: {},
    script: [],
    fail: { at: 'mount', kind: 'error', code: 150 },
  },
  {
    id: 'hexDmyE150r',
    label: 'onError 150（再生中 5 秒）',
    options: {},
    script: [],
    fail: { at: 5_000, kind: 'error', code: 150 },
  },
  {
    id: 'hexDmyLoadF',
    label: '読込の失敗',
    options: {},
    script: [],
    fail: { at: 'mount', kind: 'loadFail', code: -1 },
  },
  {
    id: 'hexDmyNoRes',
    label: '応答なし',
    options: {},
    script: [],
    fail: { at: 'mount', kind: 'noResponse', code: -2 },
  },
  // 自動再生ブロックの模擬（M3 の手順 6）: 一時停止 → Space の再開の playVideo が効かない
  {
    id: 'hexDmyNoPly',
    label: 'playVideo 無効（再開の Space が効かない）',
    options: {},
    script: [],
    blockPlay: true,
  },
  // 広告中から切替（M3 の手順 7）: 10 秒から凍結、1 回目の pauseVideo が効かず広告中とみなし、2.5 秒後の 2 回目が効いて S7c
  {
    id: 'hexDmyAdFal',
    label: '広告中から切替（10 秒、1 回目の pause が効かない）',
    options: {},
    script: [{ at: 10_000, run: (d, now) => d.stuck(60_000, now) }],
    dropFirstPause: true,
  },
  // 切替の後の失敗（M3 の手順 7、§7-32）: 10 秒から凍結 → 12 秒に S7c → 14 秒に onError 150。回は続き、帯は「戻せない」
  {
    id: 'hexDmyFrE15',
    label: '凍結の後に onError 150（14 秒）',
    options: {},
    script: [{ at: 10_000, run: (d, now) => d.stuck(60_000, now) }],
    fail: { at: 14_000, kind: 'error', code: 150 },
  },
]

/** 筋書きの失敗を口の事象の形に（error は手順 1 の errorGroupOf で組を付ける） */
function failEvent(f: NonNullable<DummyScenario['fail']>, at: number): PortEvent {
  return f.kind === 'error'
    ? { kind: 'error', code: f.code, group: errorGroupOf(f.code), at }
    : { kind: f.kind, code: f.code, at }
}

export const dummyScenarioOf = (videoId: string): DummyScenario | null =>
  DUMMY_VIDEOS.find((s) => s.id === videoId) ?? null

export interface ScenarioHooks {
  onRequest?(now: number, q: VideoRequest): void
  /** 標本の状態が変わった（読んだ tick の now） */
  onState?(now: number, state: VideoState): void
}

/** 筋書き付きのダミーの口（DOM に触れない。試験も同じ物を使う） */
export interface ScenarioPort {
  readonly video: DummyVideo
  readonly port: VideoPort
  /** 利用者の ▶（最初の ▶ が筋書きの原点。一時停止中の ▶ は iframe での再生と同じ） */
  play(now: number): void
  /** 最初の ▶ の now（押す前は null） */
  startedAt(): number | null
}

export function scenarioPort(sc: DummyScenario, hooks: ScenarioHooks = {}): ScenarioPort {
  const d = createDummyVideo({ stepMs: 15, seed: 7, ...sc.options })
  let pauses = 0
  const pass = (_now: number, q: VideoRequest): boolean => {
    if (sc.blockPlay === true && q.kind === 'playVideo') return false
    if (sc.dropFirstPause === true && q.kind === 'pauseVideo' && pauses++ === 0) return false
    return true
  }
  const base = dummyPort(d, {
    ...(hooks.onRequest === undefined ? {} : { onRequest: hooks.onRequest }),
    ...(sc.blockPlay === true || sc.dropFirstPause === true ? { pass } : {}),
  })
  let start: number | null = null
  const done = new Set<number>()
  let last: VideoState = d.state
  return {
    video: d,
    play(now) {
      start ??= now
      // 利用者の ▶ は凍った読みも動かす（M3 の手順 7。凍ったままの PLAYING は vitest だけ）
      d.stuck(0, now)
      d.play(now)
    },
    startedAt: () => start,
    port: {
      sample(now) {
        const s0 = start
        if (s0 !== null)
          sc.script.forEach((e, i) => {
            if (done.has(i) || now < s0 + e.at) return
            done.add(i)
            e.run(d, s0 + e.at)
          })
        const s = base.sample(now)
        if (s !== null && s.state !== last) {
          last = s.state
          hooks.onState?.(now, s.state)
        }
        return s
      },
      apply: (now, reqs) => base.apply(now, reqs),
      dispose: () => base.dispose(),
    },
  }
}

/** pane から読む口の中身 */
interface DevState {
  /** 最初の ▶ の performance.now（無ければ null。列の at はここからの ms） */
  startAt: number | null
  videoId: string | null
  /** 口への要求と状態の変わり目（ダミーの口と、wrapRealPort で包んだ実物の口。実物の at は再生へ向かった最初の状態から） */
  requests: Array<{ at: number; kind: VideoRequest['kind']; why?: string }>
  events: Array<{ at: number; state: VideoState }>
  play: DevPlayState | null
  lastRecord: ResultRecord | null
  /** 帯の釦の押下（id と performance.now。M3 の手順 3） */
  actions: Array<{ at: number; id: string }>
  /** 口の dispose の回数（口を作るたびに 0 から。M3 の手順 5） */
  disposes: number
  /** 筋書きが流した失敗の事象（M3 の手順 5） */
  fails: Array<{ at: number; kind: PortEvent['kind']; code: number }>
}

const state: DevState = {
  startAt: null,
  videoId: null,
  requests: [],
  events: [],
  play: null,
  lastRecord: null,
  actions: [],
  disposes: 0,
  fails: [],
}

let shell: Shell | null = null

/** 読みを固める口（M3 の手順 7。§7-11） */
export interface FrozenPort {
  readonly port: VideoPort
  /** now から forMs の間、標本の timeMs を最初の読みに固める（state・apply・事象は実物のまま） */
  freeze(forMs: number, now: number): void
}

/**
 * 実物の口を包み、点けた時から sample の timeMs だけを固定する（pauseVideo が効けば PAUSED で切り替わる）。解くのは実物が
 * PLAYING でなくなった tick か forMs の後
 */
export function freezeReads(base: VideoPort): FrozenPort {
  let frozen: { until: number; timeMs: number | null } | null = null
  return {
    freeze(forMs, now) {
      frozen = { until: now + forMs, timeMs: null }
    },
    port: {
      sample(now) {
        const s = base.sample(now)
        if (frozen === null || s === null) return s
        if (s.state !== 'playing' || now >= frozen.until) {
          frozen = null
          return s
        }
        frozen.timeMs ??= s.timeMs
        return { ...s, timeMs: frozen.timeMs }
      },
      apply: (now, reqs) => base.apply(now, reqs),
      dispose: () => base.dispose(),
    },
  }
}

/** 今の実物の口（freeze の的） */
let realFreeze: FrozenPort | null = null

/** 記録の受け口（ダミーの口の ScenarioHooks と同じ形に、口の dispose を足した） */
export interface RecordHooks extends ScenarioHooks {
  onDispose?(): void
}

/**
 * 口を包み、apply に渡した要求と、標本の状態の変わり目を受け口へ流す（中身は変えない）。実物の口の要求・事象を DEV の
 * 読み口に残すため（m3-verification §16 の宿題、M4 の手順書 §7-13 (i)、decisions #128）。状態は読んだ tick の now で、
 * 同じ状態が続く間は流さない
 */
export function recordingPort(base: VideoPort, hooks: RecordHooks): VideoPort {
  let last: VideoState | null = null
  return {
    sample(now) {
      const s = base.sample(now)
      if (s !== null && s.state !== last) {
        last = s.state
        hooks.onState?.(now, s.state)
      }
      return s
    },
    apply(now, reqs) {
      for (const q of reqs) hooks.onRequest?.(now, q)
      return base.apply(now, reqs)
    },
    dispose() {
      hooks.onDispose?.()
      base.dispose()
    },
  }
}

/** 実物の口の最初の ▶ と見なす状態（iframe の ▶ は DEV から見えないので、再生へ向かった最初の状態で原点を置く） */
const REAL_START: readonly VideoState[] = ['buffering', 'playing']

/**
 * 殻の wrapVideoPort（実物の口を作るたびに包む。DEV だけ）。読み口の列を空にし、要求と状態の変わり目を記録してから
 * 凍結の包みを掛ける（凍結は timeMs だけを固め、状態は実物のまま記録される）。startAt は buffering か playing を
 * 最初に読んだ時（それより前の unstarted・cued は at 0）
 */
export function wrapRealPort(p: VideoPort, o?: Pick<MountOptions, 'videoId'>): VideoPort {
  Object.assign(state, {
    startAt: null,
    videoId: o?.videoId ?? null,
    requests: [],
    events: [],
    disposes: 0,
    fails: [],
  })
  let disposed = false
  const rec = recordingPort(p, {
    onRequest: (now, q) =>
      state.requests.push({
        at: since(now),
        kind: q.kind,
        ...(q.kind === 'pauseVideo' ? { why: q.why } : {}),
      }),
    onState: (now, s) => {
      if (state.startAt === null && REAL_START.includes(s)) state.startAt = now
      state.events.push({ at: since(now), state: s })
    },
    onDispose: () => {
      if (!disposed) state.disposes++
      disposed = true
    },
  })
  realFreeze = freezeReads(rec)
  return realFreeze.port
}

const r1 = (x: number): number => Math.round(x * 10) / 10
const since = (now: number): number => r1(now - (state.startAt ?? now))

/** window.__hexnoteDev を起こし、殻へ渡す観測口を返す（DEV だけ。main.ts が 1 回呼ぶ） */
export function installDevProbe(): DevProbe {
  ;(window as unknown as { __hexnoteDev: unknown }).__hexnoteDev = {
    get state(): DevState {
      return structuredClone(state)
    },
    /** 帯を点ける・消す（殻の band。例 {kind: 'videoFallback', on: true, enabled: true}） */
    band(ev: BandEvent): void {
      shell?.band(ev)
    },
    /** 釦の押下の記録を空にする */
    clearActions(): void {
      state.actions = []
    },
    /** 実物の口の読み（timeMs）を forMs の間固める（凍結の模擬。PLAYING でなくなれば解ける。M3 の手順 7） */
    freeze(forMs: number): boolean {
      if (realFreeze === null) return false
      realFreeze.freeze(forMs, performance.now())
      return true
    },
  }
  return {
    play: (s) => {
      state.play = s
    },
    finished: (r) => {
      state.lastRecord = r.record
    },
    bandAction: (id) => {
      state.actions.push({ at: r1(performance.now()), id })
    },
    dummyVideoId: (DUMMY_VIDEOS[0] as DummyScenario).id,
  }
}

/** 殻を渡す（__hexnoteDev.band が殻の band を呼ぶ。main.ts が startShell の後に 1 回） */
export function attachShell(s: Shell): void {
  shell = s
}

/**
 * 殻の videoPort の差し口。表に当たる videoId はダミーの口（矩形に ▶（ダミー）と筋書きの名前・読み）、外れれば null。
 * 作るたびに pane の列を空にする（「最初から」の作り直しも新しい回）
 */
export function devVideoPort(o: MountOptions): VideoPort | null {
  const sc = dummyScenarioOf(o.videoId)
  if (sc === null) return null
  Object.assign(state, {
    startAt: null,
    videoId: o.videoId,
    requests: [],
    events: [],
    disposes: 0,
    fails: [],
  })
  let disposed = false
  let failed = false
  const fail = (now: number): void => {
    const f = sc.fail
    if (f === undefined || failed || disposed) return
    failed = true
    state.fails.push({ at: since(now), kind: f.kind, code: f.code })
    o.onEvent(failEvent(f, now))
  }
  if (sc.fail?.at === 'mount') setTimeout(() => fail(performance.now()), 300)
  const sp = scenarioPort(sc, {
    onRequest: (now, q) =>
      state.requests.push({
        at: since(now),
        kind: q.kind,
        ...(q.kind === 'pauseVideo' ? { why: q.why } : {}),
      }),
    onState: (now, s) => state.events.push({ at: since(now), state: s }),
  })
  const doc = o.host.ownerDocument
  const play = doc.createElement('button')
  play.type = 'button'
  play.className = 'primary'
  play.textContent = '▶（ダミー）'
  const read = doc.createElement('p')
  read.className = 'note'
  const box = doc.createElement('div')
  box.className = 'card source'
  const name = doc.createElement('b')
  name.textContent = `ダミー動画: ${sc.label}`
  box.append(name, play, read)
  play.addEventListener('click', () => {
    const now = performance.now()
    state.startAt ??= now
    sp.play(now)
    // 焦点は画面へ戻す（Space・Esc を殻の受け口へ。実物は iframe に焦点が入る、design §2.8）
    play.blur()
    o.host.closest<HTMLElement>('[tabindex]')?.focus({ preventScroll: true })
  })
  o.host.replaceChildren(box)
  return {
    sample: (now) => {
      const t0 = sp.startedAt()
      const at = sc.fail?.at
      if (typeof at === 'number' && t0 !== null && now >= t0 + at) fail(now)
      const s = sp.port.sample(now)
      if (s !== null) {
        const text = `${s.state} ・ 読み ${Math.round(s.timeMs)} ms ・ ×${s.rate}`
        if (read.textContent !== text) read.textContent = text
      }
      return s
    },
    apply: (now, reqs) => sp.port.apply(now, reqs),
    dispose: () => {
      if (!disposed) state.disposes++
      disposed = true
      sp.port.dispose()
      o.host.replaceChildren()
    },
  }
}
