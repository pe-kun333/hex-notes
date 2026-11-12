// クリックトラックを書き出す CLI（M3 の手順 2、仮）。中身は clicktrack.ts の純関数。
// 使い方: node tools/clicktrack/run.ts [--out <dir>] [--video-id <id>] [--chart <file>] [--check]
// <dir> に click.wav（48 kHz・16 bit・モノラル）・click.mid（S5 段 1 用）を書き、ffmpeg があれば静止画（黒）の click.mp4 も
// 作る（U-02 の見本の動画の素。上げ方は m3-kickoff §7-7・§7-19）。音と動画は --out を渡したとき（--video-id が無ければ既定
// 今のディレクトリ）だけ書く。--video-id があれば sync 付きの譜面を --chart（既定 <dir>/click.hexnote.json）に書く（動画 ID は
// 置かない。DEV のフィクスチャはダミーの ID で作る: --video-id hexDmyPlain --chart tests/fixtures/charts/m3/click.hexnote.json。
// このときは音と動画を書かない）。--check は譜面を書かずに今のファイルと比べる。
// 引数の誤りは exit 2、比べて違えば exit 1。

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { formatJson } from '../charts/mel-fixtures.ts'
import { clickChart, clickLengthS, clickSamples, clickSmf, wavBytes } from './clicktrack.ts'

const USAGE =
  '使い方: node tools/clicktrack/run.ts [--out <dir>] [--video-id <id>] [--chart <file>] [--check]'
const VALUED = ['--out', '--video-id', '--chart']

function fail(msg: string): never {
  console.error(`${USAGE}（${msg}）`)
  process.exit(2)
}

const args = process.argv.slice(2)
const opts = new Map<string, string>()
let check = false
for (let i = 0; i < args.length; i++) {
  const a = args[i] as string
  if (a === '--check') check = true
  else if (!VALUED.includes(a)) fail(`不明な引数: ${a}`)
  else if (args[i + 1] === undefined) fail(`${a} に値が無い`)
  else opts.set(a, args[++i] as string)
}
const out = opts.get('--out') ?? '.'
const videoId = opts.get('--video-id')
const chartPath = opts.get('--chart') ?? path.join(out, 'click.hexnote.json')

if (videoId !== undefined) {
  const text = `${formatJson(await clickChart(videoId))}\n`
  if (check) {
    const cur = existsSync(chartPath) ? readFileSync(chartPath, 'utf8') : null
    if (cur !== text) {
      console.error(`✗ ${chartPath}（作り直すと違う）`)
      process.exit(1)
    }
    console.log(`✓ ${chartPath}`)
    process.exit(0)
  }
  mkdirSync(path.dirname(chartPath), { recursive: true })
  writeFileSync(chartPath, text)
  console.log(`譜面: ${chartPath}`)
}
if (check) fail('--check は --video-id と使う')
// 譜面だけ作り直すとき（--video-id があり --out が無い）は音と動画を書かない
if (videoId !== undefined && !opts.has('--out')) process.exit(0)

mkdirSync(out, { recursive: true })
const wav = path.join(out, 'click.wav')
writeFileSync(wav, wavBytes(clickSamples()))
writeFileSync(path.join(out, 'click.mid'), clickSmf())
console.log(`WAV: ${wav}`)
console.log(`SMF: ${path.join(out, 'click.mid')}`)

// 静止画（黒 1280×720・30 fps）の MP4（長さは WAV と同じ。-shortest は無限の lavfi で長くなる）。ffmpeg が無ければ作らない
const mp4 = path.join(out, 'click.mp4')
const ff = spawnSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30', '-i', wav, '-t', String(clickLengthS()), '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', mp4],
  { stdio: 'inherit' },
) // prettier-ignore
if (ff.error !== undefined) console.log('ffmpeg が無いので MP4 は作りません')
else if (ff.status !== 0) console.error(`ffmpeg が失敗しました（exit ${ff.status}）`)
else console.log(`MP4: ${mp4}`)
