// 起動（M1-13、M1 の手順 2）。出どころ: design.md §4.1「流れ: 起動（保存層→設定・校正・上限・透明度。失敗なら既定値＋
// S7d）」・§1.2（初回なら S0、でなければ S1）・§4.6 storageFail、decisions #50（置き場ごとに 1 回知らせてメモリ内で続ける）・
// #52 (e)（初回の判定）(f)（旧鍵の移行は起動時に 1 回）、m6 `go('Boot')` L628・L1046–1048。
// 置き場を開く口と時刻を注入で受ける（DOM に触れない。試験は memoryStorage・memoryDb で回す）。保存の失敗は onFail
// （帯 S7d）へ渡し、storageFail の行を IndexedDB の telemetry に足す。

import type { FadeState } from '../judge/self-rate.ts'
import type { DeviceInfo } from '../shared/types.ts'
import {
  resilientDb,
  safeStorage,
  storageFailRow,
  type FailReport,
  type KvStore,
  type ResilientDb,
  type StorageLike,
} from '../storage/fallback.ts'
import type { HexDb } from '../storage/idb.ts'
import {
  loadCalibration,
  loadDevice,
  loadFade,
  loadSettings,
  type Calibration,
  type Settings,
} from '../storage/local.ts'
import { migrateLegacy, type MigrationReport } from '../storage/migrate.ts'
import { isFirstRun } from '../storage/session.ts'
import { initialRoute, type Route } from './router.ts'

export interface BootDeps {
  /** window.localStorage を返す（参照で SecurityError を投げうる。safeStorage が受ける） */
  readonly openLocal: () => StorageLike | null | undefined
  readonly openSession: () => StorageLike | null | undefined
  /** IndexedDB を開く（失敗は resilientDb がメモリ内へ移す） */
  readonly openDb: () => Promise<HexDb>
  /** 保存の失敗（置き場ごとに最初の 1 回。帯 S7d へ） */
  readonly onFail: FailReport
  /** 今の時刻 ISO 8601（移行の at と storageFail の行の at） */
  readonly iso: () => string
}

export interface Booted {
  readonly local: KvStore
  readonly session: KvStore
  readonly db: ResilientDb
  readonly settings: Settings
  readonly calibration: Calibration
  /** 端末プロファイル（同時押しテストの結果。無ければ null ＝ 診断をやり直す） */
  readonly device: DeviceInfo | null
  /** 足場外しの α（hexnote.fade） */
  readonly fade: FadeState
  readonly migration: MigrationReport
  /** 初回か（isFirstRun。端末プロファイルが無く、このタブで導線を通していない） */
  readonly first: boolean
  readonly route: Route
}

/**
 * 保存層を開く → 旧鍵の移行 → 設定・校正・端末・α を読む → 初回なら S0、でなければ S1。読めない・壊れた記録は各 load が
 * 既定値にし、置き場の失敗は onFail と storageFail の行で知らせてメモリ内で続ける（§4.1「失敗なら既定値＋S7d」）。
 */
export function boot(deps: BootDeps): Booted {
  // IndexedDB を先に作る（localStorage の失敗の行も telemetry に足せるように）。開くのは裏で進む
  let db: ResilientDb | null = null
  const report: FailReport = (f) => {
    deps.onFail(f)
    // resilientDb は切り替えてから知らせるので、IndexedDB の失敗の行もメモリへ入る（#50 (d)）
    db?.appendTelemetry(storageFailRow(f, deps.iso())).catch(() => {})
  }
  db = resilientDb(deps.openDb, report)
  const local = safeStorage('local', deps.openLocal, report)
  const session = safeStorage('session', deps.openSession, report)

  const migration = migrateLegacy(local, deps.iso())
  const first = isFirstRun(local, session)
  return {
    local,
    session,
    db,
    settings: loadSettings(local),
    calibration: loadCalibration(local),
    device: loadDevice(local),
    fade: loadFade(local),
    migration,
    first,
    route: initialRoute(first),
  }
}
