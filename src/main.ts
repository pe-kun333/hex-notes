// 製品の入口（M1 の手順 2）。起動（保存層を開く → 旧鍵の移行 → 記録を読む → 初回なら S0、でなければ S1）の後、殻に
// 画面を渡す。開発ページ（src/app/dev/*.html）への導線は開発時（vite dev）だけ S1 に出す。build では import.meta.env.DEV が
// false で一覧ごと消え、dev の HTML も入口に入らない（vite の build は index.html だけを読む）。
// M3 の手順 2: 開発時の曲（フィクスチャ 6 曲とクリック譜面の 6 行）・ダミー動画の口・pane から読む口 __hexnoteDev は
// src/app/dev/ を DEV 分岐で動的に読む（build では分岐ごと消え、束に入らない。m3-kickoff §7-13・§7-39）。

import './app/styles.css'
import { boot } from './app/boot.ts'
import type { ScreenId } from './app/router.ts'
import { homeScreen } from './app/screens/home.ts'
import { importScreen } from './app/screens/import.ts'
import { practiceScreen } from './app/screens/practice.ts'
import { onboardScreen } from './app/screens/onboard.ts'
import { playScreen } from './app/screens/play.ts'
import { resultScreen } from './app/screens/result.ts'
import { settingsScreen } from './app/screens/settings.ts'
import { startShell, type DevPage, type ScreenFactory, type Shell } from './app/shell.ts'
import { BUNDLED_SONGS, type SongEntry } from './app/songs.ts'
import { registerUpdates } from './app/sw-register.ts'
import type { StorageFailure } from './storage/fallback.ts'
import { openIdb } from './storage/idb.ts'

const DEV_PAGES: readonly DevPage[] = import.meta.env.DEV
  ? [
      { href: '/src/app/dev/input.html', label: '入力層（手順 5）' },
      { href: '/src/app/dev/play.html', label: '描画層・判定層・計測（手順 6・7・8・12）' },
      { href: '/src/app/dev/clock.html', label: '時計層（手順 7）' },
      { href: '/src/app/dev/layout.html', label: '配列層（手順 9、U-01 の記録）' },
      { href: '/src/app/dev/audio.html', label: '音源層（手順 10）' },
      { href: '/src/app/dev/storage.html', label: '保存層（手順 11）' },
      { href: '/src/app/dev/telemetry.html', label: '計測層（手順 12）' },
      { href: '/src/app/dev/sync.html', label: '同期タップ（M2 手順 3）' },
      { href: '/src/app/dev/youtube.html', label: 'YouTube の実プレイヤー（M3 手順 1）' },
    ]
  : []

// 開発時だけの差し口（曲・ダミー動画の口・pane の観測口）。build では null（分岐ごと消える）
const dev = import.meta.env.DEV
  ? await Promise.all([import('./app/dev/dev-songs.ts'), import('./app/dev/dummy-port.ts')])
  : null

// 同梱曲（M1 の手順 6）。dev ではフィクスチャ 6 曲とクリック譜面の 6 行（vite dev が tests/ を配る）を「試験:」付きで後ろに足す
const SONGS: readonly SongEntry[] = [...BUNDLED_SONGS, ...(dev?.[0].DEV_SONGS ?? [])]

const SCREENS: Readonly<Record<ScreenId, ScreenFactory>> = {
  S0: onboardScreen,
  S1: homeScreen,
  S2: playScreen,
  S3: resultScreen,
  S4: practiceScreen,
  S5: importScreen,
  S6: settingsScreen,
}

// 起動の間に起きた保存の失敗は、殻ができてから帯にする
const early: StorageFailure[] = []
let shell: Shell | null = null
const booted = boot({
  openLocal: () => window.localStorage,
  openSession: () => window.sessionStorage,
  openDb: () => openIdb(globalThis.indexedDB),
  onFail: (f) => {
    if (shell === null) early.push(f)
    else shell.band({ kind: 'storageFail', area: f.area })
  },
  iso: () => new Date().toISOString(),
})

// Service Worker（M1 の手順 13。殻＋同梱曲の precache と、S6・S3 の「更新する」）
const updates = registerUpdates(() => shell?.updated())

const host = document.getElementById('app')
if (host === null) throw new Error('#app が無い')
shell = startShell({
  doc: document,
  host,
  booted,
  screens: SCREENS,
  devPages: DEV_PAGES,
  songs: SONGS,
  updates,
  ...(dev === null ? {} : { videoPort: dev[1].devVideoPort, devProbe: dev[1].installDevProbe() }),
})
for (const f of early) shell.band({ kind: 'storageFail', area: f.area })
