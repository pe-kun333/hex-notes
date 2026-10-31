// 帯（M1-13、M1 の手順 2）。出どころ: design.md §1.3 S2（通知はプレイヤー矩形の外）・S7（IME・自動再生ブロック・S7d も帯）・
// §2.8（IME の打鍵は無視して帯、低負荷は自動で落として帯で知らせる）、decisions #26 (5)（IME の帯は演奏・役割の keydown で
// 消える）・#29 (c)（自動では上げない。戻すのは S6）・#47 (c)（予約の遅れが 20 ms を超えたら帯）・#50 (a)(g)（置き場ごとに
// 1 回、文言）・#65（置き場と閉じ方、仮）、m6 bandsHtml L790–803。
// 帯の状態 → 帯の列の純関数（DOM は shell.ts）。同期中（S7b）・動画なし（S7a・S7c）・音待ちの帯は M2・M3 で足す。

import { IME_BAND_TEXT } from '../input/ime.ts'
import { LATE_BAND_MS } from '../audio/scheduler.ts'
import type { LowLoadLevel } from '../render/canvas/lowload.ts'
import {
  STORAGE_FAIL_BAND_DETAIL,
  STORAGE_FAIL_BAND_TITLE,
  type StorageArea,
} from '../storage/fallback.ts'

/**
 * 帯の種類。autoplayBlocked は動画あり（M3）まで文言だけ。lowLoad は低負荷の段が自動で上がったとき、audioLate は発音の
 * 予約の遅れ（#47 (c)）
 */
export type BandKind = 'ime' | 'autoplayBlocked' | 'audioLate' | 'lowLoad' | 'storageFail'

/** 並べる順（m6 L790–803 の ime → 自動再生 → 保存できません の間に、低負荷と予約の遅れを入れた） */
export const BAND_ORDER: readonly BandKind[] = [
  'ime',
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
}

export interface BandsState {
  /** IME の帯（入力層の imeBand をそのまま写す） */
  readonly ime: boolean
  /** 保存の失敗を知らせた置き場（置き場ごとに 1 回。#50 (a)） */
  readonly storageFail: readonly StorageArea[]
  /** 低負荷の段（0 は帯なし） */
  readonly lowLoad: LowLoadLevel
  readonly audioLate: boolean
  readonly autoplayBlocked: boolean
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
  | { kind: 'autoplayBlocked'; on: boolean }
  | { kind: 'dismiss'; band: BandKind }

export function initialBands(): BandsState {
  return {
    ime: false,
    storageFail: [],
    lowLoad: 0,
    audioLate: false,
    autoplayBlocked: false,
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
    case 'autoplayBlocked': {
      if (s[ev.kind] === ev.on) return s
      return ev.on
        ? { ...s, [ev.kind]: true, closed: reopen(s.closed, ev.kind) }
        : { ...s, [ev.kind]: false }
    }
    case 'dismiss':
      if (ev.band === 'ime' || s.closed.includes(ev.band)) return s
      return { ...s, closed: [...s.closed, ev.band] }
  }
}

/** 低負荷の段の文言（§2.8「演出なし→殻なし→奥行きなし」の順に落とす。自動では上げないので戻すのは S6、#29 (c)） */
const LOWLOAD_DETAIL: Readonly<Record<Exclude<LowLoadLevel, 0>, string>> = {
  1: '動きが重いので、光る演出を止めました。設定で戻せます。',
  2: '動きが重いので、光る演出と和音の殻を止めました。設定で戻せます。',
  3: '動きが重いので、光る演出・和音の殻・奥行きを止めました。設定で戻せます。',
}

function bandOf(s: BandsState, kind: BandKind): Band | null {
  const open = !s.closed.includes(kind)
  switch (kind) {
    case 'ime':
      return s.ime
        ? {
            kind,
            title: IME_BAND_TEXT,
            detail: '日本語入力中の打鍵は無視します。',
            dismissible: false,
          }
        : null
    case 'autoplayBlocked':
      return s.autoplayBlocked && open
        ? {
            kind,
            title: '再生はクリックで始めます',
            detail: '自動再生がブロックされました。プレイヤーの ▶ を押してください。',
            dismissible: true,
          }
        : null
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
export function bandsOf(s: BandsState): Band[] {
  return BAND_ORDER.map((k) => bandOf(s, k)).filter((b): b is Band => b !== null)
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
