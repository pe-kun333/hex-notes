// 製品の殻（M1-13、M1 の手順 2）。画面の差し替え（router.ts）、帯の表示（bands.ts）、キー入力の受け口（dom-input.ts）を
// 1 か所に持つ。出どころ: design.md §1.2・§1.3 S2（通知はプレイヤー矩形の外）・§2.8（Enter＝ボタン決定）、decisions #26
// （演奏・役割の鍵は preventDefault するので、Enter で焦点のボタンを押すのはここ）・#65（帯の置き場、仮）、m6 `render` L946–950
// （状態 → 描く）。状態は startShell の閉包に持つ（グローバルに置かない）。試験の外（DOM）なので手で確かめる（M1 の手順 14）。
// M3 の手順 2: 「動画を使う」（useVideo。保存しない・既定 真、切替は手順 4）と動画の口（videoPort。DEV の差し口が返せば
// それ、無ければ実物の口 createYoutubePlayer）と DEV の観測口（devProbe）を画面へ渡す（m3-kickoff §7-13）。
// M3 の手順 3: 帯の釦（押下を画面の onBandAction へ返し、焦点を host に戻す。同じ種類の帯の要素は使い回して、押す途中の
// click を落とさない）と、dev の assert checkLayout（帯と矩形の重なりに、左列の他の子・.stage・.pause、矩形の 5 点の先頭、
// 左列の溢れ、配置モデルと実 DOM の差を足した。build では空の関数。m3-kickoff §7-20・§7-22）。

import { createAudioOut, type AudioOut } from '../audio/context.ts'
import type { KeysetId } from '../chart/keyset.ts'
import { validateChart } from '../chart/validate.ts'
import type { VariantSpec } from '../chart/variants.ts'
import type { ClockMode, VideoPort } from '../clock/types.ts'
import type { InputEvent } from '../input/keyboard.ts'
import type { PlayPhase } from '../play/state.ts'
import type { FadeState } from '../judge/self-rate.ts'
import type { DeviceInfo, SyncKind } from '../shared/types.ts'
import type { OnboardState, TutorialRun } from './onboard-flow.ts'
import { BOOTED_KEY, isFirstRun } from '../storage/session.ts'
import {
  LOCAL_KEYS,
  loadCalibration,
  loadNoEmbed,
  saveNoEmbed,
  saveCalibration,
  saveDevice,
  saveFade,
  saveSettings,
  type CalibEntry,
  type Calibration,
  type Settings,
} from '../storage/local.ts'
import {
  bandOutside,
  bandStep,
  bandsOf,
  initialBands,
  type Band,
  type BandEvent,
  type BandKind,
  type BandsState,
  type Box,
} from './bands.ts'
import { playerPoints, type Placement } from './placement.ts'
import type { Booted } from './boot.ts'
import { attachKeyboard } from './dom-input.ts'
import type { FinishedPlay, PracticeOptions } from './play-runner.ts'
import { navigate, type Route, type ScreenId } from './router.ts'
import { songList, type SongEntry } from './songs.ts'
import { INITIAL_UPDATE, type UpdateState } from './sw-update.ts'
import { createYoutubePlayer, type MountOptions } from './youtube-player.ts'

/** 開発ページへの導線（dev のときだけ S1 に出す。build では空） */
export interface DevPage {
  readonly href: string
  readonly label: string
}

/** S2 の回の様子（DEV の観測口へ。毎フレーム） */
export interface DevPlayState {
  readonly phase: PlayPhase
  /** 回の今の源（動画の回は video、S7c の後は novideo） */
  readonly source: ClockMode
  /** AudioContext の state（まだ作っていなければ null） */
  readonly audio: AudioContextState | null
}

/** 開発時の観測口（src/app/dev/dummy-port.ts の __hexnoteDev が写す。build では無い） */
export interface DevProbe {
  play(s: DevPlayState): void
  finished(r: FinishedPlay): void
  /** 帯の釦が押された（M3 の手順 3） */
  bandAction(id: string): void
  /** S5 段 4 の「ダミー動画で試す」が入れる ID（DEV の表のダミーの動画 ID。M3 の手順 4） */
  readonly dummyVideoId: string
}

/** dev の assert に画面が渡す物（S2・S4。M3 の手順 3、仮） */
export interface LayoutProbe {
  /** 矩形と交差してはならない物（左列の他の子・`.stage`・`.pause`。帯は殻が足す） */
  readonly outside: readonly HTMLElement[]
  /** 予算を見る左列（S2 の待機・演奏中。S4 と S0d は null ＝ 見ない） */
  readonly column: HTMLElement | null
  /** 配置モデル（鍵盤図が入らない窓は null） */
  readonly placement: Placement | null
  /** 右列の箱の要素（placement.canvas と突き合わせる） */
  readonly canvas: HTMLElement | null
}

/** 画面が殻から受け取る物 */
export interface ScreenContext {
  readonly doc: Document
  readonly booted: Booted
  settings(): Settings
  /** 設定を保存する（hexnote.settings。S0a の刻印と配列、S6 は手順 10） */
  saveSettings(s: Settings): void
  /** 足場外しの α（起動で読んだ値に、回の終わりと S4・控えの取り込みの保存を重ねた物。M2-04） */
  fade(): FadeState
  /** 足場外しを保存する（hexnote.fade。回の終わり・S4 の手動／成績連動・リセット・控えの取り込み） */
  saveFade(f: FadeState): void
  /** 端末プロファイル（同時押しテストの結果。無ければ null ＝ 未診断） */
  device(): DeviceInfo | null
  /** 端末プロファイルを保存する（S0b の終わり。device 行は呼ぶ側、decisions #55 (b)） */
  saveDevice(d: DeviceInfo): void
  /** 端末プロファイルの初期化（S6 → S0。hexnote.device と hexnote.booted を消し、次は初回の導線、§1.3 S6） */
  resetDevice(): void
  /**
   * 初回か（端末プロファイルが無く、このタブで導線を通していない）。呼ぶたびに評価し直す（S1 の「曲を持ち込む」とフィルタ。
   * 起動時の booted.first は同じタブで導線を終えた後も真のままなので使わない、m2-kickoff §7-27）
   */
  isFirst(): boolean
  /** S0d のチュートリアル曲の段階（S2 をまたいで持つ。導線の外は null） */
  tutorial(): TutorialRun | null
  setTutorial(t: TutorialRun | null): void
  /** 初回導線の今の段（S6 へ行って戻っても続きから。始める前は null） */
  onboard(): OnboardState | null
  setOnboard(s: OnboardState | null): void
  /** 同梱曲の chartId（「同梱 10 曲完走」を数える。初めて呼んだときに譜面を読んで覚える、手順 11） */
  bundledIds(): Promise<readonly string[]>
  /** 校正（起動で読んだ値に、この後の保存を重ねた物。S1 の上帯・S2 の判定が読む） */
  calibration(): Calibration
  /** 1 つの音源種別の校正を保存する（hexnote.calibration。置き場が壊れていてもメモリ内で続く、decisions #50） */
  saveCalibration(kind: SyncKind, entry: CalibEntry): void
  /** 埋め込み不可の動画 ID（hexnote.noembed。起動で読んだ値にこの後の足す・外すを重ねた物。M3 の手順 5） */
  noEmbed(): readonly string[]
  /** 一覧を替える（S7a の印〔100・101・150〕、印のある動画で最初の PLAYING が来たら外す）。鍵に書く */
  setNoEmbed(ids: readonly string[]): void
  /** 画面を移る（行けない先は無視。router.ts） */
  go(to: ScreenId | 'back'): void
  /** 帯への知らせ（低負荷・予約の遅れなど。IME と保存の失敗は殻が受ける） */
  band(ev: BandEvent): void
  readonly devPages: readonly DevPage[]
  /**
   * 選べる曲（同梱曲〔dev はフィクスチャも〕の後に持ち込み曲〔IndexedDB の charts、曲名の順〕）。S1 を開くたびに読む
   * （decisions #71 (f)。持ち込み曲が読めなければ同梱曲だけ）
   */
  songs(): Promise<readonly SongEntry[]>
  /** 選んだ曲（S1 で選び S2 が読む。S3 の「もう一度」も同じ曲・同じ鍵数制限） */
  song(): SongEntry | null
  /** 選んだ鍵数制限（既定 all。S0d の段階 1・2 は d・dfjk、手順 7・9） */
  keyset(): KeysetId
  /** S1 で選んだ譜面版（無ければ設定の配列とプロファイルの上限、手順 8） */
  variantSpec(): VariantSpec | null
  pickSong(s: SongEntry, keyset?: KeysetId, spec?: VariantSpec): void
  /**
   * 練習の設定（S4 の回。null ＝ 練習室の外 ＝ 通常プレイ）。保存しない（S4 に入るたびに既定、m2-kickoff §7-7）。S3 の
   * 「もう一度」はこれが null でなければ S4 へ
   */
  practice(): PracticeOptions | null
  setPractice(p: PracticeOptions | null): void
  /** 終わった回（S2 が書き S3 が読む。中身の画面は手順 5） */
  lastPlay(): FinishedPlay | null
  setLastPlay(r: FinishedPlay): void
  /** 終わった回の校正の提案（段 2）がまだ片付いていないか（S3 を出入りしても calib 行を 1 回だけ書く） */
  proposalOpen(): boolean
  /** 提案を片付けた（適用・見送り・何もせず S3 を離れた・条件を満たさなかった） */
  closeProposal(): void
  /** 音の出力（最初の呼び出しで作る。自動再生の制限があるので利用者の操作の中で呼ぶ。画面をまたいで 1 つ） */
  audio(): AudioOut
  /** アプリの更新とオフラインの状態（手順 13。変わったら画面の onUpdate が呼ばれる） */
  update(): UpdateState
  /** 待っている版に入れ替えてページを読み直す（S6・S3 の「更新する」。S2 には出さない、ADR 0004） */
  applyUpdate(): void
  /** 「動画を使う」（保存しない・既定 真。video-run.ts の videoRunOf の use） */
  useVideo(): boolean
  /** 「動画を使う」を書く（S1 の釦 2 つと、手順 5 の「ピアノ音で遊ぶ」だけが書く。他は値を保つ、m3-kickoff §7-24） */
  setUseVideo(v: boolean): void
  /** 動画の口（S2 の動画の回。DEV の差し口が口を返せばそれ、無ければ実物の口。事象はどちらも o.onEvent へ） */
  videoPort(o: MountOptions): VideoPort
  /** 開発時の観測口（build では null） */
  readonly devProbe: DevProbe | null
  /** 配置が変わった（相の変わり目・口の作り直し）。dev では assert を回す（build では何もしない） */
  layoutChanged(): void
}

/** 画面の DOM と受け口 */
export interface ScreenView {
  readonly root: HTMLElement
  /** 帯を出す場所（上帯の直下。S2 は左列のプレイヤー矩形と HUD の下、#65） */
  readonly bandSlot: HTMLElement
  /** プレイヤー矩形（S2 だけ。帯が重ならないかを dev ビルドで確かめる） */
  readonly player?: HTMLElement
  /** 入力イベント（Enter の焦点のボタンと IME の帯は殻が先に処理する） */
  onInput?(events: readonly InputEvent[]): void
  /** 視口が変わった */
  onResize?(): void
  /** アプリの更新とオフラインの状態が変わった（ctx.update() を読み直す） */
  onUpdate?(): void
  /** 帯の釦が押された（id は Band.action.id。M3 の手順 3） */
  onBandAction?(id: string): void
  /** dev の assert に渡す物（無ければ帯と矩形の重なりだけ） */
  layoutProbe?(): LayoutProbe
  unmount(): void
}

export type ScreenFactory = (ctx: ScreenContext) => ScreenView

export interface ShellOptions {
  readonly doc: Document
  /** 画面を入れる要素（tabindex 付き。iframe・select からの焦点の戻し先） */
  readonly host: HTMLElement
  readonly booted: Booted
  readonly screens: Readonly<Record<ScreenId, ScreenFactory>>
  readonly devPages?: readonly DevPage[]
  readonly songs?: readonly SongEntry[]
  /** SW の登録（sw-register.ts。無ければ SW を使わない扱い） */
  readonly updates?: { state(): UpdateState; apply(): void }
  /** 動画の口の差し口（DEV のダミーの口。null を返せば実物の口。src/app/dev/dummy-port.ts） */
  readonly videoPort?: (o: MountOptions) => VideoPort | null
  /** 開発時の観測口（src/app/dev/dummy-port.ts） */
  readonly devProbe?: DevProbe
}

export interface Shell {
  band(ev: BandEvent): void
  route(): Route
  /** アプリの更新とオフラインの状態が変わった（今の画面に知らせる） */
  updated(): void
}

/** 帯の要素の手（同じ種類の帯は要素を使い回し、題・本文・釦の文字と活性だけ書き換える） */
interface BandHandlers {
  dismiss(kind: BandKind): void
  action(id: string): void
}

function bandElement(doc: Document, b: Band, on: BandHandlers): HTMLElement {
  const el = doc.createElement('div')
  el.className = `band band-${b.kind}`
  el.dataset['band'] = b.kind
  const title = doc.createElement('b')
  const detail = doc.createElement('span')
  el.append(title, detail)
  if (b.action !== undefined) {
    const act = doc.createElement('button')
    act.type = 'button'
    act.className = 'small'
    act.dataset['action'] = '1'
    // 押下の時の id は要素に書いた今の値（題と活性の書き換えで釦を作り直さない）
    act.addEventListener('click', () => {
      const id = act.dataset['id']
      if (id !== undefined && !act.disabled) on.action(id)
    })
    el.append(act)
  }
  if (b.dismissible) {
    const close = doc.createElement('button')
    close.type = 'button'
    close.className = 'small'
    close.textContent = '閉じる'
    close.addEventListener('click', () => on.dismiss(b.kind))
    el.append(close)
  }
  updateBand(el, b)
  return el
}

/** 帯の要素に今の文言と釦の活性を書く（変わった所だけ） */
function updateBand(el: HTMLElement, b: Band): void {
  // S2 は帯を 1 行に詰めて本文を省くので、全文は title でも読めるようにする（#65）
  const full = b.detail === '' ? b.title : `${b.title}。${b.detail}`
  if (el.title !== full) el.title = full
  const [title, detail] = [el.querySelector('b'), el.querySelector('span')]
  if (title !== null && title.textContent !== b.title) title.textContent = b.title
  if (detail !== null && detail.textContent !== b.detail) detail.textContent = b.detail
  const act = el.querySelector<HTMLButtonElement>('button[data-action]')
  if (act === null || b.action === undefined) return
  if (act.textContent !== b.action.label) act.textContent = b.action.label
  act.dataset['id'] = b.action.id
  if (act.disabled === b.action.enabled) act.disabled = !b.action.enabled
}

/** 焦点のある押せる物を押す（Enter＝ボタン決定。入力層が Enter を preventDefault するので、ブラウザの既定の押下の代わり） */
function clickFocused(doc: Document): void {
  const a = doc.activeElement
  if (a instanceof HTMLButtonElement) {
    if (!a.disabled) a.click()
  } else if (
    a instanceof HTMLAnchorElement ||
    (a instanceof HTMLElement && a.tagName === 'SUMMARY')
  )
    a.click()
}

export function startShell(opts: ShellOptions): Shell {
  const { doc, host, booted } = opts
  let route = booted.route
  let bands: BandsState = initialBands()
  let settings = booted.settings
  let fade = booted.fade
  let device = booted.device
  let tutorial: TutorialRun | null = null
  let onboard: OnboardState | null = null
  let bundled: Promise<readonly string[]> | null = null
  let view: ScreenView | null = null
  let song: SongEntry | null = null
  let keyset: KeysetId = 'all'
  let spec: VariantSpec | null = null
  let practice: PracticeOptions | null = null
  let lastPlay: FinishedPlay | null = null
  let proposalOpen = false
  let audio: AudioOut | null = null
  let calibration = booted.calibration
  let noEmbed: readonly string[] = loadNoEmbed(booted.local)
  let useVideo = true

  const handlers: BandHandlers = {
    dismiss: (kind) => band({ kind: 'dismiss', band: kind }),
    action: (id) => {
      opts.devProbe?.bandAction(id)
      view?.onBandAction?.(id)
      // 焦点は host へ（演奏・役割の keydown を画面へ。#26）
      host.focus({ preventScroll: true })
    },
  }

  const renderBands = (): void => {
    if (view === null) return
    const slot = view.bandSlot
    const old = new Map<string, HTMLElement>()
    for (const el of slot.querySelectorAll<HTMLElement>(':scope > .band'))
      old.set(el.dataset['band'] ?? '', el)
    const els = bandsOf(bands, { imeStop: settings.imeStop }).map((b) => {
      const el = old.get(b.kind)
      // 釦の有無が変わった帯だけ作り直す（他は使い回し、押す途中の click を落とさない）
      const same =
        el !== undefined &&
        (el.querySelector('button[data-action]') !== null) === (b.action !== undefined)
      if (!same) return bandElement(doc, b, handlers)
      updateBand(el, b)
      return el
    })
    // 並びが同じなら付け替えない
    const cur = [...slot.children]
    if (cur.length !== els.length || cur.some((c, i) => c !== els[i])) slot.replaceChildren(...els)
    if (import.meta.env.DEV) checkLayout()
  }

  // dev ビルドの assert（M1 の kickoff 手順 2、§7-12 に M3 の手順 3 で足した。m3-kickoff §7-20）: build では空の関数
  const checkLayout = import.meta.env.DEV ? (): void => devCheckLayout(doc, view) : (): void => {}

  const band = (ev: BandEvent): void => {
    const next = bandStep(bands, ev)
    if (next === bands) return
    bands = next
    renderBands()
  }

  const ctx: ScreenContext = {
    doc,
    booted,
    settings: () => settings,
    saveSettings: (s) => {
      saveSettings(booted.local, s)
      settings = s
    },
    fade: () => fade,
    saveFade: (f) => {
      saveFade(booted.local, f)
      fade = f
    },
    device: () => device,
    saveDevice: (d) => {
      saveDevice(booted.local, d)
      device = d
    },
    resetDevice: () => {
      booted.local.remove(LOCAL_KEYS.device)
      // 埋め込み不可の一覧も消す（M3 の手順 5、m3-kickoff §7-27）
      booted.local.remove(LOCAL_KEYS.noembed)
      booted.session.remove(BOOTED_KEY)
      device = null
      noEmbed = []
    },
    isFirst: () => isFirstRun(booted.local, booted.session),
    tutorial: () => tutorial,
    setTutorial: (t) => {
      tutorial = t
    },
    onboard: () => onboard,
    setOnboard: (s) => {
      onboard = s
    },
    bundledIds: () =>
      (bundled ??= Promise.all(
        (opts.songs ?? [])
          .filter((s) => s.id.startsWith('bundled:'))
          .map(async (s) => {
            try {
              const v = validateChart(await s.load())
              return v.ok ? v.chart.id : null
            } catch {
              return null
            }
          }),
      ).then((ids) => ids.filter((x): x is string => x !== null))),
    calibration: () => calibration,
    saveCalibration: (kind, entry) => {
      saveCalibration(booted.local, kind, entry)
      calibration = loadCalibration(booted.local)
    },
    go: (to) => go(to),
    band,
    devPages: opts.devPages ?? [],
    songs: async () => songList(opts.songs ?? [], await booted.db.listCharts().catch(() => [])),
    song: () => song,
    keyset: () => keyset,
    variantSpec: () => spec,
    pickSong: (s, k = 'all', v) => {
      song = s
      keyset = k
      spec = v ?? null
    },
    practice: () => practice,
    setPractice: (p) => {
      practice = p
    },
    lastPlay: () => lastPlay,
    setLastPlay: (r) => {
      lastPlay = r
      proposalOpen = true
    },
    proposalOpen: () => proposalOpen,
    closeProposal: () => {
      proposalOpen = false
    },
    audio: () => (audio ??= createAudioOut()),
    update: () => opts.updates?.state() ?? { ...INITIAL_UPDATE, off: 'unsupported' },
    applyUpdate: () => {
      // プレイ中は入れ替えない（S2 は釦を出さないが、念のため殻でも止める。ADR 0004）
      if (route.screen !== 'S2') opts.updates?.apply()
    },
    layoutChanged: () => checkLayout(),
    noEmbed: () => noEmbed,
    setNoEmbed: (ids) => {
      if (ids === noEmbed) return
      noEmbed = ids
      saveNoEmbed(booted.local, ids)
    },
    useVideo: () => useVideo,
    setUseVideo: (v) => {
      useVideo = v
    },
    videoPort: (o) => opts.videoPort?.(o) ?? createYoutubePlayer(o),
    devProbe: opts.devProbe ?? null,
  }

  const mount = (): void => {
    view?.unmount()
    view = opts.screens[route.screen](ctx)
    view.root.dataset['screen'] = route.screen
    host.replaceChildren(view.root)
    host.focus({ preventScroll: true })
    renderBands()
  }

  function go(to: ScreenId | 'back'): void {
    const next = navigate(route, to)
    if (next === route) {
      if (import.meta.env.DEV) console.warn(`画面 ${route.screen} から ${to} へは行けない`)
      return
    }
    route = next
    mount()
  }

  attachKeyboard(
    window,
    (events) => {
      for (const ev of events) {
        if (ev.kind === 'imeBand') band({ kind: 'ime', on: ev.on })
        else if (ev.kind === 'role' && ev.role === 'confirm') clickFocused(doc)
      }
      view?.onInput?.(events)
    },
    { focusTarget: host },
  )
  window.addEventListener('resize', () => {
    view?.onResize?.()
    checkLayout()
  })

  mount()
  return { band, route: () => route, updated: () => view?.onUpdate?.() }
}

/** 矩形と実 DOM の差の許し（px） */
const LAYOUT_TOL = 0.5

const rectOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

const near = (a: Box, b: Box): boolean =>
  Math.abs(a.left - b.left) <= LAYOUT_TOL &&
  Math.abs(a.top - b.top) <= LAYOUT_TOL &&
  Math.abs(a.right - b.right) <= LAYOUT_TOL &&
  Math.abs(a.bottom - b.bottom) <= LAYOUT_TOL

const boxText = (b: Box): string =>
  `{${[b.left, b.top, b.right, b.bottom].map((x) => Math.round(x * 10) / 10).join(', ')}}`

/**
 * dev の assert（M3 の手順 3、仮。m3-kickoff §7-20）。矩形（view.player）と、帯・左列の他の子・.stage・.pause が交差しない。
 * (i) 矩形の 5 点のうち視口の中の点で elementsFromPoint の先頭が矩形かその子孫（動画ありで iframe があればその iframe）。
 * (ii) 予算を見る左列（S2 の待機・演奏中）は溢れず、先頭の帯の下端 ≤ 左列の下端。(iii) 配置モデルと実 DOM の差が 0.5 px
 * 以内。破れたら console.error（DEV だけ。試験の外なので pane で確かめる）
 */
function devCheckLayout(doc: Document, view: ScreenView | null): void {
  const player = view?.player
  if (view === null || player === undefined) return
  const win = doc.defaultView
  if (win === null) return
  const p = rectOf(player)
  const probe = view.layoutProbe?.() ?? null
  const bands = [...view.bandSlot.querySelectorAll<HTMLElement>('.band')]
  const named = (el: HTMLElement): string =>
    el.dataset['band'] !== undefined ? `帯（${el.dataset['band']}）` : `${el.tagName.toLowerCase()}.${el.className || '?'}`
  for (const el of [...bands, ...(probe?.outside ?? [])])
    if (!bandOutside(rectOf(el), p)) console.error(`${named(el)}がプレイヤー矩形に重なった`)
  // (i) 5 点の先頭
  const iframe = player.classList.contains('video') ? player.querySelector('iframe') : null
  const radius = parseFloat(win.getComputedStyle(player).borderTopLeftRadius) || 0
  for (const pt of playerPoints(p, { w: win.innerWidth, h: win.innerHeight }, radius)) {
    const top = doc.elementsFromPoint(pt.x, pt.y)[0]
    const ok = top !== undefined && (iframe !== null ? top === iframe : player.contains(top))
    if (!ok)
      console.error(`プレイヤー矩形の点 (${pt.x}, ${pt.y}) の先頭が${iframe !== null ? ' iframe' : '矩形の中'}でない（${top === undefined ? '無し' : top.tagName.toLowerCase()}）`)
  }
  if (probe === null) return
  // (ii) 左列の予算
  const col = probe.column
  if (col !== null) {
    if (col.scrollHeight > col.clientHeight)
      console.error(`左列が溢れた（${col.scrollHeight}／${col.clientHeight}）`)
    const first = bands[0]
    if (first !== undefined && first.getBoundingClientRect().bottom > rectOf(col).bottom + LAYOUT_TOL)
      console.error(`先頭の帯（${first.dataset['band'] ?? '?'}）が左列の下端を越えた`)
  }
  // (iii) 配置モデルと実 DOM
  const pl = probe.placement
  if (pl === null) return
  if (!near(p, pl.player))
    console.error(`プレイヤー矩形 ${boxText(p)} が配置モデル ${boxText(pl.player)} と違う`)
  if (col !== null && !near(rectOf(col), pl.left))
    console.error(`左列 ${boxText(rectOf(col))} が配置モデル ${boxText(pl.left)} と違う`)
  if (probe.canvas !== null && !near(rectOf(probe.canvas), pl.canvas))
    console.error(`右列の箱 ${boxText(rectOf(probe.canvas))} が配置モデル ${boxText(pl.canvas)} と違う`)
} // prettier-ignore
