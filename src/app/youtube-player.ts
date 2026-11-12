// 実物の YouTube プレイヤー（M3 の手順 1、仮）。DOM と YT の薄い包みで、決めるのは src/youtube/ の純関数。
// mountPlayer ＝ 読込の見張り（load.ts）の効果どおり 同意の門 → iframe_api（読めた後は 1 ページ 1 回）→ 自前の iframe →
// new YT.Player。createYoutubePlayer ＝ それに口の芯（port.ts）を被せた VideoPort（player は外へ出さない）。
// 読込の失敗・応答なし・onError・onStateChange・onPlaybackRateChange・onAutoplayBlocked は PortEvent で返すだけ（使うのは
// 手順 5〜7）。開発ページ youtube-dev だけが mountPlayer の player に計測用の呼び出し（ミュート再生など）を直に当てる。
// 製品の束がこれを辿るのは手順 2 から。performance.now の直呼びは src/app/ だけ（src/README.md）。

import type { VideoPort } from '../clock/types.ts'
import { EMBED_ATTRS, embedSrc } from '../youtube/embed.ts'
import { embedGate } from '../youtube/gate.ts'
import {
  initialLoad,
  loadStep,
  RESPONSE_TIMEOUT_MS,
  type ApiStatus,
  type LoadEffect,
  type LoadInput,
  type LoadState,
} from '../youtube/load.ts'
import { videoStateOf } from '../youtube/player-state.ts'
import { playerPort, type PlayerLike, type PortEvent } from '../youtube/port.ts'
import { moreThanHalfVisible } from '../youtube/visible.ts'

const API_SRC = 'https://www.youtube.com/iframe_api'

/** YT.Player の使う口（型は使う所だけ自前で宣言する） */
export interface YtPlayer extends PlayerLike {
  destroy(): void
}

interface YtEvent {
  data?: unknown
}

interface YtPlayerOptions {
  events: {
    onReady?: (e: YtEvent) => void
    onError?: (e: YtEvent) => void
    onStateChange?: (e: YtEvent) => void
    onPlaybackRateChange?: (e: YtEvent) => void
    onAutoplayBlocked?: (e: YtEvent) => void
  }
}

interface YtWindow {
  YT?: { Player?: new (el: HTMLElement, opts: YtPlayerOptions) => YtPlayer }
  onYouTubeIframeAPIReady?: () => void
}

export interface MountOptions {
  /** iframe を敷く箱（寸法は箱が持つ） */
  host: HTMLElement
  videoId: string
  onEvent: (e: PortEvent) => void
}

export interface MountedPlayer {
  /** onReady の後のプレイヤー（それまでと dispose の後は null） */
  player(): YtPlayer | null
  /** 読込の見張りの相（開発ページの表示用） */
  phase(): LoadState['phase']
  /** destroy して世代を進める（作り直しは新しい mount） */
  dispose(): void
}

const ytWindow = (): YtWindow => window as unknown as YtWindow

function apiStatus(): ApiStatus {
  if (ytWindow().YT?.Player !== undefined) return 'ready'
  const sc = document.querySelector<HTMLScriptElement>(`script[src="${API_SRC}"]`)
  return sc?.dataset['failed'] === '1' ? 'failed' : 'absent'
}

export function mountPlayer(opts: MountOptions): MountedPlayer {
  let st: LoadState = initialLoad
  let made: YtPlayer | null = null
  let ready: YtPlayer | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearWatch = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const teardown = (): void => {
    clearWatch()
    try {
      made?.destroy()
    } catch {
      // 作りかけのプレイヤー
    }
    made = null
    ready = null
    opts.host.replaceChildren()
  }

  const step = (ev: LoadInput): void => {
    const r = loadStep(st, ev)
    st = r.state
    for (const e of r.effects) effect(e)
    if (r.notices.length > 0) {
      const at = performance.now()
      for (const n of r.notices) opts.onEvent({ ...n, at })
    }
    if (st.phase === 'failed' || st.phase === 'ready' || st.phase === 'disposed') clearWatch()
  }

  /** 見張り（mount から 10,000 ms。早く着いたら残りを待ち直す） */
  const watch = (): void => {
    clearWatch()
    const left = st.startedAt + RESPONSE_TIMEOUT_MS - performance.now()
    timer = setTimeout(
      () => {
        timer = null
        step({ kind: 'tick', now: performance.now() })
        if (st.phase === 'loadingApi' || st.phase === 'waitingReady') watch()
      },
      Math.max(0, left),
    )
  }

  const loadApi = (recreate: boolean, gen: number): void => {
    const w = ytWindow()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${API_SRC}"]`)
    if (recreate) existing?.remove()
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      step({ kind: 'apiLoaded', gen })
    }
    if (existing !== null && !recreate) return
    const sc = document.createElement('script')
    sc.src = API_SRC
    sc.onerror = () => {
      sc.dataset['failed'] = '1'
      step({ kind: 'apiFailed', gen })
    }
    document.head.append(sc)
  }

  const createPlayer = (gen: number): void => {
    const Player = ytWindow().YT?.Player
    if (Player === undefined) return
    const f = document.createElement('iframe')
    for (const [k, v] of Object.entries(EMBED_ATTRS)) f.setAttribute(k, v)
    f.src = embedSrc(opts.videoId, window.location.origin)
    f.style.cssText = 'display:block;width:100%;height:100%;border:0'
    opts.host.replaceChildren(f)
    const live = (): boolean => gen === st.gen
    made = new Player(f, {
      events: {
        onReady: () => {
          if (!live()) return
          step({ kind: 'ready', gen })
          if (st.phase === 'ready') ready = made
        },
        onError: (e) => {
          if (live()) step({ kind: 'error', gen, code: Number(e.data) })
        },
        onStateChange: (e) => {
          const state = videoStateOf(e.data)
          if (live() && state !== null)
            opts.onEvent({ kind: 'state', state, at: performance.now() })
        },
        onPlaybackRateChange: (e) => {
          const rate = Number(e.data)
          if (live() && Number.isFinite(rate) && rate > 0)
            opts.onEvent({ kind: 'rate', rate, at: performance.now() })
        },
        onAutoplayBlocked: () => {
          if (live()) opts.onEvent({ kind: 'autoplayBlocked', at: performance.now() })
        },
      },
    })
  }

  function effect(e: LoadEffect): void {
    switch (e.kind) {
      case 'loadApi':
        loadApi(e.recreate, st.gen)
        return
      case 'createPlayer':
        createPlayer(e.gen)
        return
      case 'removeIframe':
      case 'destroy':
        teardown()
        return
    }
  }

  step({ kind: 'mount', now: performance.now(), gate: embedGate(), api: apiStatus() })
  if (st.phase === 'loadingApi' || st.phase === 'waitingReady') watch()

  return {
    player: () => ready,
    phase: () => st.phase,
    dispose: () => step({ kind: 'dispose' }),
  }
}

const docVisible = (): boolean => document.visibilityState === 'visible'

/** 実物の口（VideoPort）。visible は文書の表示、halfVisible は host の矩形と視口から（design §2.9 L149） */
export function createYoutubePlayer(opts: MountOptions): VideoPort {
  const m = mountPlayer(opts)
  const port = playerPort({
    player: () => m.player(),
    visible: docVisible,
    halfVisible: () =>
      moreThanHalfVisible(
        opts.host.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        docVisible(),
      ),
    onEvent: opts.onEvent,
  })
  return {
    sample: (now) => port.sample(now),
    apply: (now, requests) => port.apply(now, requests),
    dispose: () => {
      port.dispose()
      m.dispose()
    },
  }
}
