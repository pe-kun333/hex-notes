// Salamander Grand Piano V3 を 30 音・1 速度層の Opus に間引く（M0-08、手順 10、decisions #46）。
// 使い方: node tools/salamander/thin-salamander.ts --src <FLAC を展開したディレクトリ> [--out content/samples/salamander]
//         [--vel 8] [--trim 6] [--fade 0.5] [--bitrate 96k] [--silence -60] [--date YYYY-MM-DD]
// 元の FLAC は https://archive.org/details/SalamanderGrandPianoV3 の SalamanderGrandPianoV3_44.1khz16bit.tar.bz2（466 MB）を
// 展開した物（リポジトリには入れない）。--src の下を探して A0v8.flac … C8v8.flac の 30 個を ffmpeg（libopus）で変換し、
// --out に *.opus・manifest.json・ATTRIBUTION.md を書く。計画（音の選定・引数・manifest・帰属）は salamander-plan.ts。

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  DEFAULT_THIN,
  attributionOf,
  checkThin,
  ffmpegArgs,
  manifestOf,
  outFile,
  salamanderNotes,
  sourceFile,
  type ThinOptions,
} from './salamander-plan.ts'

const args = process.argv.slice(2)

function opt(name: string): string | undefined {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const src = opt('src') ?? fail('--src（FLAC を展開したディレクトリ）が要る')
const out = opt('out') ?? 'content/samples/salamander'
const date = opt('date') ?? new Date().toISOString().slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`--date は YYYY-MM-DD（${date}）`)
const o: ThinOptions = {
  vel: Number(opt('vel') ?? DEFAULT_THIN.vel),
  trimS: Number(opt('trim') ?? DEFAULT_THIN.trimS),
  fadeS: Number(opt('fade') ?? DEFAULT_THIN.fadeS),
  bitrate: opt('bitrate') ?? DEFAULT_THIN.bitrate,
  silenceDb: Number(opt('silence') ?? DEFAULT_THIN.silenceDb),
}
try {
  checkThin(o)
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
}
if (!existsSync(src) || !statSync(src).isDirectory()) fail(`ディレクトリが無い: ${src}`)

/** --src の下のファイル名 → パス（同じ名前が 2 つあれば止める） */
function index(dir: string, into = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) index(p, into)
    else if (name.toLowerCase().endsWith('.flac')) {
      if (into.has(name)) fail(`同じ名前のファイルが 2 つある: ${name}`)
      into.set(name, p)
    }
  }
  return into
}

const found = index(src)
const notes = salamanderNotes()
const missing = notes.map((n) => sourceFile(n.name, o.vel)).filter((f) => !found.has(f))
if (missing.length > 0) fail(`見つからない: ${missing.join(', ')}`)

const probe = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
if (probe.error || !/libopus/.test(probe.stdout)) fail('ffmpeg（libopus 付き）が PATH に無い')

mkdirSync(out, { recursive: true })
let bytes = 0
for (const n of notes) {
  const input = found.get(sourceFile(n.name, o.vel)) ?? fail(n.name)
  const output = path.join(out, outFile(n.name))
  const r = spawnSync('ffmpeg', ffmpegArgs(input, output, o), { encoding: 'utf8' })
  if (r.status !== 0) fail(`ffmpeg が失敗: ${n.name}\n${r.stderr}`)
  const size = statSync(output).size
  bytes += size
  console.log(
    `  ${outFile(n.name).padEnd(10)} ${String(size).padStart(8)} B  ← ${sourceFile(n.name, o.vel)}`,
  )
}
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifestOf(o, date), null, 2) + '\n')
writeFileSync(path.join(out, 'ATTRIBUTION.md'), attributionOf(o, date))
console.log(
  `✓ 30 音 ${(bytes / 1024 / 1024).toFixed(2)} MB → ${out}（manifest.json・ATTRIBUTION.md を書いた）`,
)
