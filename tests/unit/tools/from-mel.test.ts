import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { formatJson } from '../../../tools/charts/mel-fixtures.ts'

// tools/charts/from-mel.ts（フィクスチャの生成）を子プロセスで動かす。出どころ: m0-kickoff.md 手順 3「m1' の 6 曲と
// m5 EXAMPLES を /1 に」、完了条件「tools/charts/validate-charts.ts（strict）でフィクスチャが全て ✓」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const FROM_MEL = path.join(root, 'tools', 'charts', 'from-mel.ts')
const VALIDATE = path.join(root, 'tools', 'charts', 'validate-charts.ts')
const FIXTURES = path.join(root, 'tests', 'fixtures')
const TIMEOUT = 30_000

/** 書く 10 ファイル（tests/fixtures/ からの相対） */
const FILES = [
  ...['twinkle', 'ode', 'canon', 'duet', 'scale', 'chroma'].map((k) => `charts/m1/${k}.hexnote.json`),
  ...['twinkle', 'canon'].flatMap((k) => [`charts/m5/${k}.hexnote.json`, `m5-json/${k}.garage.octave.L2.json`]),
] // prettier-ignore

function run(tool: string, ...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: 'utf8', timeout: TIMEOUT })
  if (r.error) throw r.error
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
} // prettier-ignore

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hexnote-from-mel-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('tools/charts/from-mel.ts', () => {
  it('--check: 入っているフィクスチャは今の生成物と 1 バイトも違わない（10 件 ✓、exit 0）', { timeout: TIMEOUT }, () => {
    const r = run(FROM_MEL, '--check')
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    for (const f of FILES) expect(r.stdout).toContain(`✓ ${f}`)
    expect(r.stdout.trim().split('\n').length).toBe(FILES.length)
  }) // prettier-ignore

  it('別のディレクトリに書くと 10 件ができ、入っている物と同じ。1 件変える・消すと --check が exit 1', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      const w = run(FROM_MEL, dir)
      expect(w.status).toBe(0)
      for (const f of FILES) {
        const a = readFileSync(path.join(dir, ...f.split('/')), 'utf8')
        expect(a, f).toBe(readFileSync(path.join(FIXTURES, ...f.split('/')), 'utf8'))
      }
      expect(run(FROM_MEL, dir, '--check').status).toBe(0)
      const changed = path.join(dir, 'charts', 'm1', 'ode.hexnote.json')
      writeFileSync(changed, readFileSync(changed, 'utf8').replace('"bpm": 112', '"bpm": 113'))
      unlinkSync(path.join(dir, 'm5-json', 'canon.garage.octave.L2.json'))
      const c = run(FROM_MEL, dir, '--check')
      expect(c.status).toBe(1)
      expect(c.stderr).toContain('✗ charts/m1/ode.hexnote.json: 中身が違う')
      expect(c.stderr).toContain('✗ m5-json/canon.garage.octave.L2.json: 無い')
    })
  }) // prettier-ignore

  it('不明な引数・位置引数 2 つは exit 2', { timeout: TIMEOUT }, () => {
    expect(run(FROM_MEL, '--force').status).toBe(2)
    expect(run(FROM_MEL, 'a', 'b').status).toBe(2)
  })

  it('validate-charts（strict）で tests/fixtures/charts の 9 件が全て ✓（手順 3 の完了条件）', { timeout: TIMEOUT }, () => {
    const r = run(VALIDATE, path.join(FIXTURES, 'charts'))
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    const ok = r.stdout.trim().split('\n').filter((l) => l.startsWith('✓ '))
    expect(ok.length).toBe(9)
    for (const f of FILES.filter((f) => f.startsWith('charts/'))) expect(r.stdout).toContain(f)
  }) // prettier-ignore
})

describe('formatJson（フィクスチャの整形）', () => {
  it('素の値だけのオブジェクトと素の値の配列は 1 行、他は 2 字下げ。undefined のキーは書かない', () => {
    const text = formatJson({ a: 1, n: [{ m: 60, b: 0 }], k: ['A', null], o: { x: 1, y: undefined }, e: [], z: undefined })
    expect(text).toBe('{\n  "a": 1,\n  "n": [\n    { "m": 60, "b": 0 }\n  ],\n  "k": ["A", null],\n  "o": { "x": 1 },\n  "e": []\n}')
    expect(JSON.parse(text)).toEqual({ a: 1, n: [{ m: 60, b: 0 }], k: ['A', null], o: { x: 1 }, e: [] })
  }) // prettier-ignore
})
