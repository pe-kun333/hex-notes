// 製品の殻（M1-13、M1 の手順 2）。画面の差し替え（router.ts）、帯の表示（bands.ts）、キー入力の受け口（dom-input.ts）を
// 1 か所に持つ。出どころ: design.md §1.2・§1.3 S2（通知はプレイヤー矩形の外）・§2.8（Enter＝ボタン決定）、decisions #26
// （演奏・役割の鍵は preventDefault するので、Enter で焦点のボタンを押すのはここ）・#65（帯の置き場、仮）、m6 `render` L946–950
// （状態 → 描く）。状態は startShell の閉包に持つ（グローバルに置かない）。試験の外（DOM）なので手で確かめる（M1 の手順 14）。

import { createAudioOut, type AudioOut } from '../audio/context.ts'
import type { KeysetId } from '../chart/keyset.ts'
import type { InputEvent } from '../input/keyboard.ts'
import type { SyncKind } from '../shared/types.ts'
import {
  loadCalibration,
  saveCalibration,
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
  type BandsState,
} from './bands.ts'
import type { Booted } from './boot.ts'
import { attachKeyboard } from './dom-input.ts'
import type { FinishedPlay } from './play-runner.ts'
import { navigate, type Route, type ScreenId } from './router.ts'
import type { SongEntry } from './songs.ts'

/** 開発ページへの導線（dev のときだけ S1 に出す。build では空） */
export interface DevPage {
  readonly href: string
  readonly label: string
}

/** 画面が殻から受け取る物 */
export interface ScreenContext {
  readonly doc: Document
  readonly booted: Booted
  settings(): Settings
  /** 校正（起動で読んだ値に、この後の保存を重ねた物。S1 の上帯・S2 の判定が読む） */
  calibration(): Calibration
  /** 1 つの音源種別の校正を保存する（hexnote.calibration。置き場が壊れていてもメモリ内で続く、decisions #50） */
  saveCalibration(kind: SyncKind, entry: CalibEntry): void
  /** 画面を移る（行けない先は無視。router.ts） */
  go(to: ScreenId | 'back'): void
  /** 帯への知らせ（低負荷・予約の遅れなど。IME と保存の失敗は殻が受ける） */
  band(ev: BandEvent): void
  readonly devPages: readonly DevPage[]
  /** 選べる曲（手順 3 は dev のフィクスチャ 6 曲。同梱曲は手順 6・8） */
  readonly songs: readonly SongEntry[]
  /** 選んだ曲（S1 で選び S2 が読む。S3 の「もう一度」も同じ曲・同じ鍵数制限） */
  song(): SongEntry | null
  /** 選んだ鍵数制限（既定 all。S0d の段階 1・2 は d・dfjk、手順 7・9） */
  keyset(): KeysetId
  pickSong(s: SongEntry, keyset?: KeysetId): void
  /** 終わった回（S2 が書き S3 が読む。中身の画面は手順 5） */
  lastPlay(): FinishedPlay | null
  setLastPlay(r: FinishedPlay): void
  /** 終わった回の校正の提案（段 2）がまだ片付いていないか（S3 を出入りしても calib 行を 1 回だけ書く） */
  proposalOpen(): boolean
  /** 提案を片付けた（適用・見送り・何もせず S3 を離れた・条件を満たさなかった） */
  closeProposal(): void
  /** 音の出力（最初の呼び出しで作る。自動再生の制限があるので利用者の操作の中で呼ぶ。画面をまたいで 1 つ） */
  audio(): AudioOut
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
}

export interface Shell {
  band(ev: BandEvent): void
  route(): Route
}

function bandElement(doc: Document, b: Band, onDismiss: () => void): HTMLElement {
  const el = doc.createElement('div')
  el.className = `band band-${b.kind}`
  el.dataset['band'] = b.kind
  // S2 は帯を 1 行に詰めて本文を省くので、全文は title でも読めるようにする（#65）
  el.title = `${b.title}。${b.detail}`
  const title = doc.createElement('b')
  title.textContent = b.title
  const detail = doc.createElement('span')
  detail.textContent = b.detail
  el.append(title, detail)
  if (b.dismissible) {
    const close = doc.createElement('button')
    close.type = 'button'
    close.className = 'small'
    close.textContent = '閉じる'
    close.addEventListener('click', onDismiss)
    el.append(close)
  }
  return el
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
  const settings = booted.settings
  let view: ScreenView | null = null
  let song: SongEntry | null = null
  let keyset: KeysetId = 'all'
  let lastPlay: FinishedPlay | null = null
  let proposalOpen = false
  let audio: AudioOut | null = null
  let calibration = booted.calibration

  const renderBands = (): void => {
    if (view === null) return
    const slot = view.bandSlot
    slot.replaceChildren(
      ...bandsOf(bands, { imeStop: settings.imeStop }).map((b) =>
        bandElement(doc, b, () => band({ kind: 'dismiss', band: b.kind })),
      ),
    )
    if (import.meta.env.DEV) checkBands()
  }

  // dev ビルドの assert（kickoff 手順 2 の期待値、§7-12）: 帯の矩形がプレイヤー矩形と交差しない
  const checkBands = (): void => {
    const player = view?.player
    if (view === null || player === undefined) return
    const p = player.getBoundingClientRect()
    for (const el of view.bandSlot.querySelectorAll<HTMLElement>('.band'))
      if (!bandOutside(el.getBoundingClientRect(), p))
        console.error(`帯（${el.dataset['band'] ?? '?'}）がプレイヤー矩形に重なった`)
  }

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
    calibration: () => calibration,
    saveCalibration: (kind, entry) => {
      saveCalibration(booted.local, kind, entry)
      calibration = loadCalibration(booted.local)
    },
    go: (to) => go(to),
    band,
    devPages: opts.devPages ?? [],
    songs: opts.songs ?? [],
    song: () => song,
    keyset: () => keyset,
    pickSong: (s, k = 'all') => {
      song = s
      keyset = k
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
    if (import.meta.env.DEV) checkBands()
  })

  mount()
  return { band, route: () => route }
}
