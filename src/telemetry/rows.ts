// play 以外の行（M0-12、手順 12）。出どころ: design.md §4.6（calib・onboard／quit・device・storageFail・embedError）・
// §6.3 M-2・M-3・M-4、decisions #25（tsResolution）・#40（校正の段 1・段 2）・#54（仮）。行の型は src/shared/types.ts
// （手順 2）。storageFail の行は保存層の storageFailRow（src/storage/fallback.ts、decisions #50）。
// 行の時刻 at は app/ が Date で作る ISO 8601 を受ける（performance.now は持ち込まない）。UA は大分類だけ（版・機種は持たない）。

import type { OffsetVerdict } from '../judge/calibration-offset.ts'
import type {
  CalibTelemetry,
  DeviceInfo,
  DeviceTelemetry,
  EmbedErrorTelemetry,
  OnboardTelemetry,
} from '../shared/types.ts'

/** ブラウザの大分類（順に見る。Edge・Opera は Chrome を名乗るので先、Chrome は Safari を名乗るので Safari が最後） */
const BROWSERS: readonly [string, RegExp][] = [
  ['edge', /\bEdg(e|A|iOS)?\//],
  ['opera', /\bOPR\/|\bOpera\b/],
  ['samsung', /\bSamsungBrowser\//],
  ['firefox', /\bFirefox\/|\bFxiOS\//],
  ['chrome', /\bChrome\/|\bCriOS\/|\bChromium\//],
  ['safari', /\bSafari\//],
]
const OSES: readonly [string, RegExp][] = [
  ['windows', /\bWindows\b/],
  ['ios', /\biPhone\b|\biPad\b|\biPod\b/],
  ['android', /\bAndroid\b/],
  ['chromeos', /\bCrOS\b/],
  ['macos', /\bMac OS X\b|\bMacintosh\b/],
  ['linux', /\bLinux\b/],
]

/** UA の大分類「ブラウザ/OS」（chrome/windows など。当たらなければ other）。版は持たない */
export function uaClass(ua: string): string {
  const b = BROWSERS.find(([, re]) => re.test(ua))?.[0] ?? 'other'
  const o = OSES.find(([, re]) => re.test(ua))?.[0] ?? 'other'
  return `${b}/${o}`
}

export interface DeviceInput {
  readonly ua: string
  /** screen.width・screen.height（CSS px） */
  readonly screenPx: readonly [number, number]
  /** devicePixelRatio（拡大率。M-7） */
  readonly dpr: number
  readonly device: DeviceInfo
}

/** device 行（M-2・M-3）。tsResolution は推定できたときだけ（decisions #25） */
export function deviceRow(d: DeviceInput, at: string): DeviceTelemetry {
  return {
    kind: 'device',
    at,
    ua: uaClass(d.ua),
    screenPx: [Math.round(d.screenPx[0]), Math.round(d.screenPx[1])],
    dpr: d.dpr,
    limit: d.device.limit,
    layoutMapOk: d.device.layoutMapOk,
    ...(d.device.tsResolution !== undefined && d.device.tsResolution > 0
      ? { tsResolution: d.device.tsResolution }
      : {}),
  }
}

/**
 * calib 行。verdict は tapOffset（段 1）か proposeOffset（段 2）の戻り、n は標本の数、applied は段 1 なら条件を
 * 満たして入れた、段 2 なら利用者が提案を受けた
 */
export function calibRow(
  stage: CalibTelemetry['stage'],
  verdict: OffsetVerdict,
  n: number,
  applied: boolean,
  at: string,
): CalibTelemetry {
  return {
    kind: 'calib',
    at,
    stage,
    n,
    sd: verdict.sd,
    applied: verdict.ok && applied,
    proposed: verdict.ok ? verdict.offset : null,
    ...(verdict.ok ? {} : { reason: verdict.reason }),
  }
}

/** onboard 行（段 S0a〜S0d などに着いた・離れた。M-4） */
export function onboardRow(
  step: string,
  seconds: number,
  left: boolean,
  at: string,
): OnboardTelemetry {
  return { kind: 'onboard', at, step, seconds, left }
}

/** quit 行（途中でやめた。where は画面 id か曲の ms） */
export function quitRow(
  step: string,
  seconds: number,
  where: string,
  at: string,
): OnboardTelemetry {
  return { kind: 'quit', at, step, seconds, left: true, where }
}

/** embedError 行（YouTube の onError のコード。動画 ID は入れない） */
export function embedErrorRow(code: number, at: string): EmbedErrorTelemetry {
  return { kind: 'embedError', at, code }
}
