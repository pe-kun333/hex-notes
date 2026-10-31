// SMF → 持ち込みの譜面を書く CLI（M2-01 前半、M2 の手順 1）。中身は src/chart/import.ts（S5 と同じ関数）。
// 使い方: node tools/charts/smf-import.ts <file.mid> [--play n] [--accomp a,b|none] [--fold octave|cut|nearest] [--out <dir>]
// 既定: 弾く・伴奏は trackDefaults（ドラム以外で音数が最大を弾く、残りでドラムを除く物を伴奏）、fold は octave、out は今の
// ディレクトリ。曲名はファイル名から（m5 L313）。書くのは <曲名>.hexnote.json（storage/file.ts の chartFileName）。日時は書かない。
// トラックの一覧・失われる音・運指の警告・難度の注意を標準出力に出す。読めない・組めないは exit 1、引数の誤りは exit 2。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  cautions,
  chartFromSmf,
  defaultAccomp,
  fingeringWarnings,
  foldPreview,
  smfParts,
  trackDefaults,
} from '../../src/chart/import.ts'
import { buildMsTable } from '../../src/chart/mstable.ts'
import { parseSmf } from '../../src/chart/smf.ts'
import { FOLD_IDS, type FoldId } from '../../src/shared/types.ts'
import { chartFileName } from '../../src/storage/file.ts'
import { formatJson } from './mel-fixtures.ts'

const USAGE =
  '使い方: node tools/charts/smf-import.ts <file.mid> [--play n] [--accomp a,b|none] [--fold octave|cut|nearest] [--out <dir>]'
const VALUED = ['--play', '--accomp', '--fold', '--out']

function fail(msg: string, code: number): never {
  console.error(code === 2 ? `${USAGE}（${msg}）` : msg)
  process.exit(code)
}

const args = process.argv.slice(2)
const opts = new Map<string, string>()
const positional: string[] = []
for (let i = 0; i < args.length; i++) {
  const a = args[i] as string
  if (!a.startsWith('--')) positional.push(a)
  else if (!VALUED.includes(a)) fail(`不明な引数: ${a}`, 2)
  else if (args[i + 1] === undefined) fail(`${a} に値が無い`, 2)
  else opts.set(a, args[++i] as string)
}
const file = positional[0]
if (file === undefined || positional.length > 1) fail('MIDI ファイルを 1 つ渡す', 2)

const fold = (opts.get('--fold') ?? 'octave') as FoldId
if (!FOLD_IDS.includes(fold)) fail(`--fold は ${FOLD_IDS.join('|')}`, 2)
const index = (s: string): number => {
  if (!/^\d+$/.test(s)) fail(`トラックの番号は 0 以上の整数: ${s}`, 2)
  return Number(s)
}

let smf
try {
  smf = parseSmf(new Uint8Array(readFileSync(file)))
} catch (e) {
  fail(`${file}: ${(e as Error).message}`, 1)
}
const def = trackDefaults(smf)
const play = opts.has('--play') ? index(opts.get('--play') as string) : def.play
const accompOpt = opts.get('--accomp')
const accomp =
  accompOpt === undefined
    ? defaultAccomp(smf, play)
    : accompOpt === 'none'
      ? []
      : accompOpt.split(',').map(index)
const name = path.basename(file).replace(/\.(mid|midi)$/i, '')

console.log(`${name}（形式 ${smf.format}・分解能 ${smf.division}・テンポ ${smf.tempo.length} 点）`)
smf.tracks.forEach((t, i) => {
  const role = i === play ? '弾く' : accomp.includes(i) ? '伴奏' : '—'
  console.log(
    `  [${i}] ${role}  ${t.name}（ch ${t.ch + 1}${t.drum ? '・ドラム' : ''}、${t.notes.length} 音）`,
  )
})

let chart
let parts
try {
  parts = smfParts(smf, play, accomp)
  chart = await chartFromSmf({ smf, play, accomp, fold, name })
} catch (e) {
  fail(`${file}: ${(e as Error).message}`, 1)
}
const preview = foldPreview(parts, fold)
if (preview.collapsed > 0) console.log(`  1/240 拍に丸めて潰れた音: ${preview.collapsed}`)
const ms = buildMsTable(chart.pulse)
for (const v of chart.variants ?? []) {
  const r = preview.rows.find((x) => x.id === v.id)
  const warns = fingeringWarnings(chart, ms, v)
  const caution = cautions(v.metrics).map((c) =>
    c.kind === 'density' ? `密度 ${c.value}` : `最大跳躍 ${c.value}`,
  )
  console.log(
    `  ${v.id}: 残る ${r?.kept ?? 0}／${r?.srcNotes ?? 0} 音（落とし ${r?.droppedFold ?? 0}・寄せ ${r?.movedFold ?? 0}・間引き ${r?.droppedThin ?? 0}）、` +
      `運指の警告 ${warns.length} 件${caution.length > 0 ? `、注意: ${caution.join('・')}` : ''}`,
  )
  for (const w of warns.slice(0, 3)) console.log(`    ${w.text}`)
}

const outDir = opts.get('--out') ?? '.'
const target = path.join(outDir, chartFileName(chart))
mkdirSync(outDir, { recursive: true })
writeFileSync(target, formatJson(chart) + '\n')
console.log(`書いた ${target}`)
