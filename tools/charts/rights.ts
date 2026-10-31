// 権利表の検査の中身（M0-01 の check-rights.ts から切り出した。M1 の手順 6 で単体試験を足すため）。欄は
// content/charts/RIGHTS.md（ADR 0005）: 主の 6 欄 title・composerDied・arrangerDied・source・license・checkedOn
// （design.md §5.6 U-03）＋追加欄 file・owner。同梱曲の譜面ごとに rights.json の行が要る。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const FIELDS = [
  'title',
  'composerDied',
  'arrangerDied',
  'source',
  'license',
  'checkedOn',
  'owner',
] as const
export const ALLOWED_LICENSES = ['PD', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'own']
const YEAR = /^\d{4}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
/** 没後 70 年（design.md §2.9。仮） */
export const PD_YEARS = 70

function str(e: Record<string, unknown>, k: string): string {
  const v = e[k]
  return typeof v === 'string' ? v.trim() : ''
}

/** 1 行の問題（無ければ空） */
export function checkEntry(e: Record<string, unknown>): string[] {
  const out: string[] = []
  const missing = FIELDS.filter((k) => str(e, k) === '')
  if (missing.length > 0) {
    out.push(`欄が空 ${missing.join(', ')}`)
    return out
  }
  const license = str(e, 'license')
  if (!ALLOWED_LICENSES.includes(license)) {
    out.push(`license が一覧に無い: ${license}（${ALLOWED_LICENSES.join('／')}）`)
  }
  const checkedOn = str(e, 'checkedOn')
  if (!DATE.test(checkedOn)) out.push(`checkedOn が YYYY-MM-DD でない: ${checkedOn}`)
  const checkedYear = Number(checkedOn.slice(0, 4))

  for (const k of ['composerDied', 'arrangerDied'] as const) {
    const v = str(e, k)
    if (v === '-' || v === 'anonymous' || YEAR.test(v)) continue
    out.push(`${k} は西暦 4 桁か anonymous か -: ${v}`)
  }
  if (license === 'PD') {
    for (const k of ['composerDied', 'arrangerDied'] as const) {
      const v = str(e, k)
      if (YEAR.test(v) && checkedYear - Number(v) <= PD_YEARS) {
        out.push(`${k} ${v} は没後 ${PD_YEARS} 年を過ぎていない（確認日 ${checkedOn}）`)
      }
    }
    if (str(e, 'composerDied') === '-')
      out.push('PD なのに composerDied が -（自作なら license を own に）')
  }
  if (license === 'own' && str(e, 'composerDied') !== '-' && !YEAR.test(str(e, 'composerDied'))) {
    out.push('own の composerDied は - か西暦')
  }
  return out
}

/** 譜面ごとの問題（file は dir からの相対、区切り /）。rights.json が無ければ譜面ごとに「権利表に無い」 */
export function checkRights(
  charts: readonly string[],
  rights: { entries?: Array<Record<string, unknown> & { file?: unknown }> } | null,
): { file: string; problems: string[] }[] {
  const byFile = new Map<string, Record<string, unknown>>()
  for (const e of rights?.entries ?? []) if (typeof e.file === 'string') byFile.set(e.file, e)
  return charts.map((file) => {
    const e = byFile.get(file)
    return { file, problems: e === undefined ? ['権利表に無い'] : checkEntry(e) }
  })
}

/** dir の下の譜面（rights.json を除く *.json。dir からの相対、区切り /） */
export function listCharts(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.json') && !(d === dir && name === 'rights.json'))
        out.push(path.relative(dir, p).split(path.sep).join('/'))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out.sort()
}

/** dir の rights.json を読む（無ければ null） */
export function readRights(dir: string): Parameters<typeof checkRights>[1] {
  const p = path.join(dir, 'rights.json')
  return existsSync(p)
    ? (JSON.parse(readFileSync(p, 'utf8')) as Parameters<typeof checkRights>[1])
    : null
}
