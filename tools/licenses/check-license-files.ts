// 同梱ファイルのライセンスと帰属の検査（M0-01）。
// - ルートの LICENSE があること
// - content/samples/salamander/ に LICENSE と ATTRIBUTION.md があり、音源ファイルを置いた後
//   （音源の拡張子を持つファイルがあるか、manifest.json の files が空でない）は
//   ATTRIBUTION.md の表（| 項目 | 内容 |）に必須 6 項目（題名・作者・出典 URL・ライセンス名と URL・
//   改変内容・変換日）の行があり、値が空でなく、「未同梱」「未記入」を含まず、
//   「出典 URL」と「ライセンス名と URL」の値に https?:// があること（CC BY 3.0 §4(b)）。
// 見出し語の有無だけでは欄が空でも通ってしまうので、行ごとに値を見る。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { checkAttribution } from './attribution.ts'

const root = process.cwd()
const problems: string[] = []

function must(file: string): void {
  if (!existsSync(path.join(root, file))) problems.push(`無い: ${file}`)
}

must('LICENSE')

const samplesDir = path.join(root, 'content', 'samples', 'salamander')
if (existsSync(samplesDir)) {
  must('content/samples/salamander/LICENSE')
  must('content/samples/salamander/ATTRIBUTION.md')
  const audio = listFiles(samplesDir).filter((f) => /\.(opus|mp3|ogg|wav|flac)$/i.test(f))
  if (audio.length > 0 || manifestHasFiles(path.join(samplesDir, 'manifest.json'))) {
    const attr = path.join(samplesDir, 'ATTRIBUTION.md')
    const text = existsSync(attr) ? readFileSync(attr, 'utf8') : ''
    for (const p of checkAttribution(text)) problems.push(`ATTRIBUTION.md: ${p}`)
  }
} else {
  problems.push('無い: content/samples/salamander/')
}

function manifestHasFiles(file: string): boolean {
  if (!existsSync(file)) return false
  try {
    const m = JSON.parse(readFileSync(file, 'utf8')) as { files?: unknown }
    return Array.isArray(m.files) && m.files.length > 0
  } catch {
    problems.push('manifest.json が読めない')
    return false
  }
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listFiles(p))
    else out.push(p)
  }
  return out
}

if (problems.length > 0) {
  for (const p of problems) console.error('✗ ' + p)
  process.exit(1)
}
console.log('✓ ライセンスと帰属のファイルは揃っている')
