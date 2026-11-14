// 帯（M1-13、M1 の手順 2）。出どころ: design.md §1.3 S2（通知はプレイヤー矩形の外）・S7（IME・自動再生ブロック・S7d も帯）・
// §2.8（IME の打鍵は無視して帯、低負荷は自動で落として帯で知らせる）、decisions #26 (5)（IME の帯は演奏・役割の keydown で
// 消える）・#29 (c)（自動では上げない。戻すのは S6）・#47 (c)（予約の遅れが 20 ms を超えたら帯）・#50 (a)(g)（置き場ごとに
// 1 回、文言）・#65（置き場と閉じ方、仮）、m6 bandsHtml L790–803。
// 帯の状態 → 帯の列の純関数（DOM は shell.ts）。同期中（S7b）・動画なし（S7a・S7c）・音待ちの帯は M2・M3 で足す。
// M3 の手順 3（m3-kickoff §7-22、仮）: 帯に釦 `action`（殻が釦を作り、押下を画面の onBandAction へ返す）と、釦の型と口を
// 通す仮の帯 videoFallback（S7c の帯。名前と題・活性の 3 つの形 ＝ 切替・▶ の案内・戻せない、は手順 7 で決める）。
// 題と活性は画面が渡し、ここは canReturn を知らない。「閉じる」なし・釦「戻す」（m6 L797 の「閉じる」は外した）。
// M3 の手順 6（m3-kickoff §7-22・§7-28、仮）: 同期中の帯 sync（m6 L792。長引くときだけ画面が点ける。釦なし・閉じるあり、出口は
// Esc → Pause）を ime の次に。自動再生ブロックの帯は題・本文を画面が渡せる（省けば今の文。notVisible の 2 つ目の文）。
// sync と videoFallback を同時に出さないのはここでなく同期中の訳（源が novideo になれば訳が消えて sync が下りる）。

import { IME_BAND_TEXT } from '../input/ime.ts'
import { LATE_BAND_MS } from '../audio/scheduler.ts'
import type { LowLoadLevel } from '../render/canvas/lowload.ts'
import {
  STORAGE_FAIL_BAND_DETAIL,
  STORAGE_FAIL_BAND_TITLE,
  type StorageArea,
} from '../storage/fallback.ts'

/**
 * 帯の種類。sync は同期中が長引いた（M3 の手順 6）、autoplayBlocked は再開の playVideo が効かない（M3 の手順 6）。lowLoad は
 * 低負荷の段が自動で上がったとき、audioLate は発音の予約の遅れ（#47 (c)）
 */
export type BandKind =
  | 'ime'
  | 'share'
  | 'sync'
  | 'videoFallback'
  | 'autoplayBlocked'
  | 'audioLate'
  | 'lowLoad'
  | 'storageFail'

/**
 * 並べる順（m6 L790–803 の ime → 自動再生 → 保存できません の間に、低負荷と予約の遅れを入れた。M3 の手順 3 で videoFallback を
 * ime の次に、手順 6 で sync を ime の次に、m3-kickoff §7-22）
 */
export const BAND_ORDER: readonly BandKind[] = [
  'ime',
  'share',
  'sync',
  'videoFallback',
  'autoplayBlocked',
  'audioLate',
  'lowLoad',
  'storageFail',
]

export interface Band {
  readonly kind: BandKind
  readonly title: string
  readonly detail: string
  /** 「閉じる」を出すか。IME は演奏・役割の keydown で消えるので出さない（#26 (5)） */
  readonly dismissible: boolean
  /** 帯の釦（殻が釦を作り、押下を画面の onBandAction(id) へ返す。無効は disabled。M3 の手順 3） */
  readonly action?: BandAction
}

export interface BandAction {
  readonly id: string
  readonly label: string
  readonly enabled: boolean
}

/** S7c の帯の題の既定（m6 L797 の 19 字。仮） */
export const VIDEO_FALLBACK_TITLE = '動画が止まったので、ピアノ音で続けます'

/** 同期中の帯（m6 L792 の見出し。本文は自作、仮） */
export const SYNC_BAND_TITLE = '同期中'
export const SYNC_BAND_DETAIL = '動画が進むのを待っています。広告なら終わるまで待ちます。'

/** 自動再生ブロックの帯の既定の文（m6 L801） */
export const AUTOPLAY_TITLE = '再生はクリックで始めます'
export const AUTOPLAY_DETAIL = '自動再生がブロックされました。プレイヤーの ▶ を押してください。'

export interface BandsState {
  /** IME の帯（入力層の imeBand をそのまま写す） */
  readonly ime: boolean
  /** 保存の失敗を知らせた置き場（置き場ごとに 1 回。#50 (a)） */
  readonly storageFail: readonly StorageArea[]
  /** 低負荷の段（0 は帯なし） */
  readonly lowLoad: LowLoadLevel
  readonly audioLate: boolean
  /** 同期中が長引いた（M3 の手順 6） */
  readonly sync: boolean
  /** 自動再生ブロックの帯（題・本文は無ければ既定。null は出さない。M3 の手順 6） */
  readonly autoplayBlocked: { readonly title?: string; readonly detail?: string } | null
  /** S7c の帯（題は無ければ既定、釦「戻す」の活性。null は出さない。M3 の手順 3、仮） */
  readonly videoFallback: { readonly title?: string; readonly enabled: boolean } | null
  /**
   * 共有 URL を開いた・開けなかった知らせ（題と本文は殻が share-view.ts から渡す。閉じるあり。null は出さない。M4 の手順 5、
   * decisions #124）
   */
  readonly share: { readonly title: string; readonly detail: string } | null
  /** 「閉じる」で閉じた帯（同じ種類の新しい知らせで開き直す） */
  readonly closed: readonly BandKind[]
}

export type BandEvent =
  | { kind: 'ime'; on: boolean }
  | { kind: 'storageFail'; area: StorageArea }
  /** 低負荷の段が変わった（自動で上がった、か S6 で戻した） */
  | { kind: 'lowLoad'; level: LowLoadLevel }
  /** 予約の遅れ（on は lateBand が真になった。新しい回の始めに false） */
  | { kind: 'audioLate'; on: boolean }
  /** 同期中の帯（M3 の手順 6） */
  | { kind: 'sync'; on: boolean }
  /** 自動再生ブロックの帯（題・本文は画面が渡せる。省けば今の文。M3 の手順 6） */
  | { kind: 'autoplayBlocked'; on: true; title?: string; detail?: string }
  | { kind: 'autoplayBlocked'; on: false }
  /** S7c の帯（題と釦の活性は画面が渡す。M3 の手順 3、仮） */
  | { kind: 'videoFallback'; on: true; title?: string; enabled: boolean }
  | { kind: 'videoFallback'; on: false }
  /** 共有 URL の知らせ（M4 の手順 5） */
  | { kind: 'share'; on: true; title: string; detail: string }
  | { kind: 'share'; on: false }
  | { kind: 'dismiss'; band: BandKind }

export function initialBands(): BandsState {
  return {
    ime: false,
    storageFail: [],
    lowLoad: 0,
    audioLate: false,
    sync: false,
    autoplayBlocked: null,
    videoFallback: null,
    share: null,
    closed: [],
  }
}

const reopen = (closed: readonly BandKind[], kind: BandKind): readonly BandKind[] =>
  closed.includes(kind) ? closed.filter((k) => k !== kind) : closed

/** 1 つの知らせを処理する。何も変わらなければ渡した state をそのまま返す（呼ぶ側は === で描き直しを省ける） */
export function bandStep(s: BandsState, ev: BandEvent): BandsState {
  switch (ev.kind) {
    case 'ime':
      return s.ime === ev.on ? s : { ...s, ime: ev.on }
    case 'storageFail':
      // 置き場ごとに 1 回（同じ置き場の 2 回目は来ない作りだが、来ても開き直さない）。別の置き場なら閉じていても開き直す
      if (s.storageFail.includes(ev.area)) return s
      return {
        ...s,
        storageFail: [...s.storageFail, ev.area],
        closed: reopen(s.closed, 'storageFail'),
      }
    case 'lowLoad':
      if (ev.level === s.lowLoad) return s
      // 上がったら開き直す。下がった（S6 で戻した）なら段だけ写す（0 で帯が消える）
      return ev.level > s.lowLoad
        ? { ...s, lowLoad: ev.level, closed: reopen(s.closed, 'lowLoad') }
        : { ...s, lowLoad: ev.level }
    case 'audioLate':
    case 'sync': {
      if (s[ev.kind] === ev.on) return s
      return ev.on
        ? { ...s, [ev.kind]: true, closed: reopen(s.closed, ev.kind) }
        : { ...s, [ev.kind]: false }
    }
    case 'autoplayBlocked': {
      if (!ev.on) return s.autoplayBlocked === null ? s : { ...s, autoplayBlocked: null }
      const cur = s.autoplayBlocked
      if (cur !== null && cur.title === ev.title && cur.detail === ev.detail) return s
      const next = {
        ...(ev.title === undefined ? {} : { title: ev.title }),
        ...(ev.detail === undefined ? {} : { detail: ev.detail }),
      }
      // 出ていない → 出す で開き直す（文だけ替わった時は閉じたまま）
      return cur === null
        ? { ...s, autoplayBlocked: next, closed: reopen(s.closed, 'autoplayBlocked') }
        : { ...s, autoplayBlocked: next }
    }
    case 'videoFallback': {
      if (!ev.on) return s.videoFallback === null ? s : { ...s, videoFallback: null }
      const cur = s.videoFallback
      if (cur !== null && cur.title === ev.title && cur.enabled === ev.enabled) return s
      return {
        ...s,
        videoFallback: {
          ...(ev.title === undefined ? {} : { title: ev.title }),
          enabled: ev.enabled,
        },
      }
    }
    case 'share': {
      if (!ev.on) return s.share === null ? s : { ...s, share: null }
      const cur = s.share
      if (
        cur !== null &&
        cur.title === ev.title &&
        cur.detail === ev.detail &&
        !s.closed.includes('share')
      )
        return s
      // 新しい知らせは閉じていても開き直す
      return {
        ...s,
        share: { title: ev.title, detail: ev.detail },
        closed: reopen(s.closed, 'share'),
      }
    }
    case 'dismiss':
      // IME と S7c の帯は「閉じる」を出さない（S7c を閉じると戻す手段が見えない）
      if (ev.band === 'ime' || ev.band === 'videoFallback' || s.closed.includes(ev.band)) return s
      return { ...s, closed: [...s.closed, ev.band] }
  }
}

/** 低負荷の段の文言（§2.8「演出なし→殻なし→奥行きなし」の順に落とす。自動では上げないので戻すのは S6、#29 (c)） */
const LOWLOAD_DETAIL: Readonly<Record<Exclude<LowLoadLevel, 0>, string>> = {
  1: '動きが重いので、光る演出を止めました。設定で戻せます。',
  2: '動きが重いので、光る演出と和音の殻を止めました。設定で戻せます。',
  3: '動きが重いので、光る演出・和音の殻・奥行きを止めました。設定で戻せます。',
}

/** 文言を変える設定 */
export interface BandsOptions {
  /** S6「IME 検知時に曲を止める」（既定 OFF。OFF なら m6 L800 の「曲は止めません。」、ON なら止める旨） */
  readonly imeStop: boolean
}

/** IME の帯の本文（m6 bandsHtml L800。imeStop が ON のときは事実に合わせて書き換える、#65） */
export function imeDetail(imeStop: boolean): string {
  return `日本語入力中の打鍵は無視します。${imeStop ? '曲は一時停止します。' : '曲は止めません。'}`
}

function bandOf(s: BandsState, kind: BandKind, opts: BandsOptions): Band | null {
  const open = !s.closed.includes(kind)
  switch (kind) {
    case 'ime':
      return s.ime
        ? { kind, title: IME_BAND_TEXT, detail: imeDetail(opts.imeStop), dismissible: false }
        : null
    case 'videoFallback': {
      const v = s.videoFallback
      return v === null
        ? null
        : {
            kind,
            title: v.title ?? VIDEO_FALLBACK_TITLE,
            detail: '',
            dismissible: false,
            action: { id: 'return', label: '戻す', enabled: v.enabled },
          }
    }
    case 'sync':
      return s.sync && open
        ? { kind, title: SYNC_BAND_TITLE, detail: SYNC_BAND_DETAIL, dismissible: true }
        : null
    case 'autoplayBlocked': {
      const a = s.autoplayBlocked
      return a !== null && open
        ? {
            kind,
            title: a.title ?? AUTOPLAY_TITLE,
            detail: a.detail ?? AUTOPLAY_DETAIL,
            dismissible: true,
          }
        : null
    }
    case 'audioLate':
      return s.audioLate && open
        ? {
            kind,
            title: '音が遅れています',
            detail: `発音の予約が ${LATE_BAND_MS} ms を超えて遅れました。ほかのタブやアプリを閉じると直ることがあります。`,
            dismissible: true,
          }
        : null
    case 'lowLoad':
      return s.lowLoad > 0 && open
        ? {
            kind,
            title: '低負荷モード',
            detail: LOWLOAD_DETAIL[s.lowLoad as Exclude<LowLoadLevel, 0>],
            dismissible: true,
          }
        : null
    case 'share':
      return s.share !== null && open
        ? { kind, title: s.share.title, detail: s.share.detail, dismissible: true }
        : null
    case 'storageFail':
      return s.storageFail.length > 0 && open
        ? {
            kind,
            title: STORAGE_FAIL_BAND_TITLE,
            detail: STORAGE_FAIL_BAND_DETAIL,
            dismissible: true,
          }
        : null
  }
}

/** 今出す帯の列（BAND_ORDER の順） */
export function bandsOf(s: BandsState, opts: BandsOptions): Band[] {
  return BAND_ORDER.map((k) => bandOf(s, k, opts)).filter((b): b is Band => b !== null)
}

/** 画面の矩形（getBoundingClientRect の形。CSS px） */
export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * 帯がプレイヤー矩形の外か（§1.3 S2「通知もプレイヤー矩形の外」、§5.2 M1-13 の完了条件）。辺が接するだけなら外、
 * 幅か高さが 0 の帯（隠れている）は外。dev ビルドの assert が getBoundingClientRect で使う（機械検査は M3-01）
 */
export function bandOutside(band: Box, player: Box): boolean {
  if (!(band.right > band.left && band.bottom > band.top)) return true
  return !(
    band.left < player.right &&
    player.left < band.right &&
    band.top < player.bottom &&
    player.top < band.bottom
  )
}
