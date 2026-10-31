import { describe, expect, it } from 'vitest'
import { boot, type BootDeps } from '../../../src/app/boot.ts'
import { initialFade } from '../../../src/judge/self-rate.ts'
import {
  memoryDb,
  memoryStorage,
  type StorageFailure,
  type StorageLike,
} from '../../../src/storage/fallback.ts'
import { LOCAL_KEYS, defaultSettings } from '../../../src/storage/local.ts'
import { LEGACY_KEYS } from '../../../src/storage/migrate.ts'
import { BOOTED_KEY } from '../../../src/storage/session.ts'

// src/app/boot.ts（M1-13、M1 の手順 2）。出どころ: design.md §4.1「流れ: 起動（保存層→設定・校正・上限・透明度。失敗なら
// 既定値＋S7d）」・§1.2（初回なら S0）、decisions #50・#52 (e)(f)、tests-inventory「M1 手順 2 Pause メニューと起動」
// （isFirstRun は device か booted があれば偽。手順 11 で検算済の物を起動の流れで確かめる）。

const AT = '2026-10-31T12:00:00.000Z'

function deps(over: Partial<BootDeps> & { fails?: StorageFailure[] } = {}): BootDeps {
  const fails = over.fails ?? []
  return {
    openLocal: () => memoryStorage(),
    openSession: () => memoryStorage(),
    openDb: async () => memoryDb(),
    onFail: (f) => fails.push(f),
    iso: () => AT,
    ...over,
  }
}

const denied = (): never => {
  throw new DOMException('遮断', 'SecurityError')
}

describe('起動の行き先（初回の判定）', () => {
  it('何も無い端末 → 初回（S0）。設定・校正・端末・α は既定値', () => {
    const b = boot(deps())
    expect(b.first).toBe(true)
    expect(b.route).toEqual({ screen: 'S0', back: null })
    expect(b.settings).toEqual(defaultSettings())
    expect(b.calibration).toEqual({ v: 1 })
    expect(b.device).toBe(null)
    expect(b.fade).toEqual(initialFade())
  })

  it('端末プロファイルがあれば S1（2 回目以降）', () => {
    const local = memoryStorage()
    local.setItem(LOCAL_KEYS.device, JSON.stringify({ limit: 3, at: AT, layoutMapOk: true }))
    const b = boot(deps({ openLocal: () => local }))
    expect(b.first).toBe(false)
    expect(b.route.screen).toBe('S1')
    expect(b.device).toEqual({ limit: 3, at: AT, layoutMapOk: true })
  })

  it('保存してある設定・校正・α を読む（§4.1「設定・校正・上限・透明度」）', () => {
    const local = memoryStorage()
    local.setItem(LOCAL_KEYS.settings, JSON.stringify({ v: 1, layout: 'vmpk', imeStop: true }))
    local.setItem(
      LOCAL_KEYS.calibration,
      JSON.stringify({ v: 1, audio: { offsetMs: 12, at: AT, via: 'tap' } }),
    )
    local.setItem(
      LOCAL_KEYS.fade,
      JSON.stringify({ v: 1, mode: 'manual', manual: 0.5, alpha: { 60: 0.25 } }),
    )
    const b = boot(deps({ openLocal: () => local }))
    expect(b.settings).toEqual({ ...defaultSettings(), layout: 'vmpk', imeStop: true })
    expect(b.calibration).toEqual({ v: 1, audio: { offsetMs: 12, at: AT, via: 'tap' } })
    expect(b.fade).toEqual({ mode: 'manual', manual: 0.5, alpha: { 60: 0.25 } })
  })

  it('このタブで導線を通した（booted）なら端末プロファイルが無くても S1', () => {
    const session = memoryStorage()
    session.setItem(BOOTED_KEY, '1')
    expect(boot(deps({ openSession: () => session })).route.screen).toBe('S1')
  })
})

describe('旧鍵の移行（起動時に 1 回）', () => {
  it('hexnote.limit・hexnote.m6 を運び、運んだ値で読む（端末があるので S1）', () => {
    const local = memoryStorage()
    local.setItem(LEGACY_KEYS.limit, '3')
    local.setItem(LEGACY_KEYS.m6, JSON.stringify({ profile: 'gamer', first: 'again' }))
    const b = boot(deps({ openLocal: () => local }))
    expect([...b.migration.wrote].sort()).toEqual(['device', 'settings'])
    expect([...b.migration.removed].sort()).toEqual([LEGACY_KEYS.limit, LEGACY_KEYS.m6].sort())
    expect(b.device?.limit).toBe(3)
    expect(b.settings.profile).toBe('gamer')
    expect(b.route.screen).toBe('S1')
    expect(local.getItem(LEGACY_KEYS.limit)).toBe(null)
  })
})

describe('保存できない端末（失敗なら既定値＋S7d、#50）', () => {
  it('localStorage・sessionStorage・IndexedDB が全て遮断: 置き場ごとに 1 回知らせ、既定値で S0 に入る', async () => {
    const fails: StorageFailure[] = []
    const b = boot(
      deps({
        fails,
        openLocal: denied,
        openSession: denied,
        openDb: async () => {
          throw new DOMException('遮断', 'InvalidStateError')
        },
      }),
    )
    expect(b.first).toBe(true)
    expect(b.settings).toEqual(defaultSettings())
    expect(await b.db.mode()).toBe('memory')
    expect(fails.map((f) => `${f.area}:${f.op}:${f.reason}`).sort()).toEqual([
      'idb:open:unavailable',
      'local:open:denied',
      'session:open:denied',
    ])
    // storageFail の行（§4.6）は telemetry に足す（IndexedDB はメモリ内）
    const rows = await b.db.listTelemetry()
    expect(rows.map((r) => (r.kind === 'storageFail' ? r.where : r.kind)).sort()).toEqual([
      'idb.open:*',
      'local.open:*',
      'session.open:*',
    ])
    expect(rows.every((r) => r.at === AT)).toBe(true)
  })

  it('壊れた JSON は置き場の失敗ではない（知らせず既定値。#50 (f)）', () => {
    const fails: StorageFailure[] = []
    const local = memoryStorage()
    local.setItem(LOCAL_KEYS.settings, '{broken')
    local.setItem(LOCAL_KEYS.device, '[]')
    const b = boot(deps({ fails, openLocal: () => local }))
    expect(fails).toEqual([])
    expect(b.settings).toEqual(defaultSettings())
    expect(b.first).toBe(true)
  })

  it('保存できない端末でも、このタブで「あとで」を押せば（booted がメモリにあれば）S0 へ戻らない', () => {
    const fails: StorageFailure[] = []
    const b = boot(deps({ fails, openLocal: denied, openSession: denied }))
    expect(b.first).toBe(true)
    expect(b.session.set(BOOTED_KEY, '1')).toBe(false)
    // 同じページの中で起動の判定をやり直す（同じ置き場を渡す）
    const again = boot(
      deps({
        openLocal: denied,
        openSession: (): StorageLike => ({
          getItem: (k) => b.session.get(k),
          setItem: () => {},
          removeItem: () => {},
        }),
      }),
    )
    expect(again.first).toBe(false)
  })
})
