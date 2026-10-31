import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import type { Chart } from '../../../src/shared/types.ts'
import { format1ThreeTracks } from '../../fixtures/smf/build.ts'

// tools/charts/smf-import.ts（CLI charts:smf、M2-01 前半、M2 の手順 1）を子プロセスで動かす。出どころ: m2-kickoff 手順 1 の
// 期待値「CLI: フィクスチャの形式 1 → *.hexnote.json が 4 版で validate-charts が ok」、tests-inventory「M2 手順 1」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const CLI = path.join(root, 'tools', 'charts', 'smf-import.ts')
const VALIDATE = path.join(root, 'tools', 'charts', 'validate-charts.ts')
const TIMEOUT = 30_000

function run(tool: string, ...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: 'utf8', timeout: TIMEOUT })
  if (r.error) throw r.error
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
} // prettier-ignore

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hexnote-smf-import-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('tools/charts/smf-import.ts', () => {
  it('形式 1 の 3 トラック → three.hexnote.json が 4 版、既定のトラック、validate-charts が ok', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      const mid = path.join(dir, 'three.mid')
      writeFileSync(mid, format1ThreeTracks())
      const out = path.join(dir, 'out')
      const r = run(CLI, mid, '--out', out)
      expect(r.stderr).toBe('')
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('[0] 弾く  Melody')
      expect(r.stdout).toContain('[1] 伴奏  Chords')
      expect(r.stdout).toContain('[2] —  Drums（ch 10・ドラム、4 音）')
      const c = JSON.parse(readFileSync(path.join(out, 'three.hexnote.json'), 'utf8')) as Chart
      expect(c.name).toBe('three')
      expect(c.variants?.map((v) => v.id)).toEqual(['ableton/2/octave', 'ableton/3/octave', 'vmpk/2/octave', 'vmpk/3/octave'])
      expect(c.accompaniment).toHaveLength(6)
      expect(c.source).toEqual({ kind: 'midi', rights: 'private', title: 'three' })
      const v = run(VALIDATE, out)
      expect(v.status).toBe(0)
      expect(v.stdout).toContain('three.hexnote.json')
    })
  }) // prettier-ignore

  it('--play・--accomp none・--fold を渡せる。引数の誤りは exit 2、読めない MIDI は exit 1', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      const mid = path.join(dir, 'three.mid')
      writeFileSync(mid, format1ThreeTracks())
      const r = run(CLI, mid, '--play', '1', '--accomp', 'none', '--fold', 'cut', '--out', dir)
      expect(r.status).toBe(0)
      const c = JSON.parse(readFileSync(path.join(dir, 'three.hexnote.json'), 'utf8')) as Chart
      expect(c.notes).toHaveLength(6)
      expect(c.accompaniment).toBeUndefined()
      expect(c.variants?.every((v) => v.fold === 'cut')).toBe(true)
      // --play だけ: 伴奏の既定は元の弾くトラック（Melody 8 音）を含み、ドラムは除く
      expect(run(CLI, mid, '--play', '1', '--out', dir).stdout).toContain('[0] 伴奏  Melody')
      const d = JSON.parse(readFileSync(path.join(dir, 'three.hexnote.json'), 'utf8')) as Chart
      expect(d.accompaniment).toHaveLength(8)
      expect(run(CLI).status).toBe(2)
      expect(run(CLI, mid, '--fold', 'zigzag').status).toBe(2)
      expect(run(CLI, mid, '--play', '-1').status).toBe(2)
      expect(run(CLI, mid, '--bogus', 'x').status).toBe(2)
      const bad = path.join(dir, 'bad.mid')
      writeFileSync(bad, 'not midi')
      const b = run(CLI, bad)
      expect(b.status).toBe(1)
      expect(b.stderr).toContain('MThd')
      expect(run(CLI, mid, '--play', '9').status).toBe(1)
    })
  }) // prettier-ignore
})
