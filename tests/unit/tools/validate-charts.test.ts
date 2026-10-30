import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// tools/charts/validate-charts.ts を子プロセス（node の型剥がし）で動かし、exit code と出力を見る。
// 出どころ: m0-kickoff.md §1.6（CI の並び）と手順 2「tools/charts/validate-charts.ts の本体」。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TOOL = path.join(root, 'tools', 'charts', 'validate-charts.ts')
const FIXTURES = path.join(root, 'tests', 'fixtures', 'charts')
const FIXTURE = path.join(FIXTURES, 'minimal.hexnote.json')
/** node の起動を含むので余裕を持つ。spawnSync 自体にも渡す（vitest の timeout は同期の子を止められない） */
const TIMEOUT = 30_000

function run(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: TIMEOUT,
  })
  if (r.error) throw r.error
  return { status: r.status, stdout: r.stdout, stderr: r.stderr }
}

/** フィクスチャを読み、fn で書き換えた写しを dir に置く */
function writeVariant(
  dir: string,
  name: string,
  fn: (chart: Record<string, unknown>) => void,
): void {
  const chart = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>
  fn(chart)
  writeFileSync(path.join(dir, name), JSON.stringify(chart))
}

/** os.tmpdir 配下に一時ディレクトリを作り、fn の後で消す */
function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hexnote-validate-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** id の末尾 1 文字を別の 16 進に変える（形は保つので、落ちるのは id の照合だけ） */
function tamperId(json: string): string {
  const chart = JSON.parse(json) as { id: string }
  const last = chart.id.slice(-1)
  chart.id = chart.id.slice(0, -1) + (last === '0' ? '1' : '0')
  return JSON.stringify(chart)
}

describe('tools/charts/validate-charts.ts', () => {
  it('フィクスチャのディレクトリで exit 0、✓ の行が出る', { timeout: TIMEOUT }, () => {
    const r = run(FIXTURES)
    // stderr 空は Node 24 以上（型剥がしの ExperimentalWarning が出ない。.nvmrc・engines で固定）
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('✓ ')
    expect(r.stdout).toContain('minimal.hexnote.json')
  })

  it('id を 1 文字変えた写しで exit 1、✗ の行に id が出る', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      writeFileSync(
        path.join(dir, 'tampered.hexnote.json'),
        tamperId(readFileSync(FIXTURE, 'utf8')),
      )
      const r = run(dir)
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/✗ .*tampered\.hexnote\.json: id /)
      expect(r.stderr).toContain('sha256:')
      expect(r.stdout).not.toContain('✓ ')
    })
  })

  it('--no-verify-id なら id の照合を飛ばして exit 0', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      writeFileSync(
        path.join(dir, 'tampered.hexnote.json'),
        tamperId(readFileSync(FIXTURE, 'utf8')),
      )
      const r = run(dir, '--no-verify-id')
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('✓ ')
    })
  })

  it('空ディレクトリで exit 0、"charts: 0 件（検査なし）"', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      const r = run(dir)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('charts: 0 件（検査なし）')
    })
  })

  it('rights.json は対象外、サブディレクトリは再帰して読む', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      mkdirSync(path.join(dir, 'sub'))
      copyFileSync(FIXTURE, path.join(dir, 'sub', 'minimal.hexnote.json'))
      writeFileSync(path.join(dir, 'rights.json'), '{"entries":[]}')
      const r = run(dir)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('sub/minimal.hexnote.json')
      expect(r.stdout).not.toContain('rights.json')
    })
  })

  it('構造の問題と JSON の構文エラーを全部列挙して exit 1', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      const chart = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>
      delete chart['notes']
      delete chart['source']
      writeFileSync(path.join(dir, 'broken.hexnote.json'), JSON.stringify(chart))
      writeFileSync(path.join(dir, 'syntax.hexnote.json'), '{"format": ')
      const r = run(dir)
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/✗ .*broken\.hexnote\.json: notes /)
      expect(r.stderr).toMatch(/✗ .*broken\.hexnote\.json: source /)
      expect(r.stderr).toMatch(/✗ .*syntax\.hexnote\.json: JSON として読めない/)
    })
  })

  it(
    'strict（既定）: notes が未ソートのファイルは order で exit 1、--lenient なら通る',
    { timeout: TIMEOUT },
    () => {
      withTempDir((dir) => {
        writeVariant(dir, 'unsorted.hexnote.json', (c) => {
          const notes = c['notes'] as unknown[]
          notes.reverse()
          const v = (c['variants'] as Record<string, unknown>[])[0]!
          ;(v['keys'] as unknown[]).reverse()
        })
        const r = run(dir)
        expect(r.status).toBe(1)
        expect(r.stderr).toMatch(/✗ .*unsorted\.hexnote\.json: notes\[1\]\.beat /)
        const l = run(dir, '--lenient')
        expect(l.status).toBe(0)
        expect(l.stdout).toContain('✓ ')
      })
    },
  )

  it(
    'strict: 許容内で未丸めの beat・別名 layout は not_normalized で exit 1',
    { timeout: TIMEOUT },
    () => {
      withTempDir((dir) => {
        writeVariant(dir, 'unrounded.hexnote.json', (c) => {
          const notes = c['notes'] as Record<string, unknown>[]
          notes[1]!['beat'] = 1 + 1e-9
        })
        writeVariant(dir, 'alias.hexnote.json', (c) => {
          const v = (c['variants'] as Record<string, unknown>[])[0]!
          v['layout'] = 'garage'
          v['id'] = 'garage/2/octave'
        })
        const r = run(dir)
        expect(r.status).toBe(1)
        expect(r.stderr).toMatch(/✗ .*unrounded\.hexnote\.json: notes 正規化で/)
        expect(r.stderr).toMatch(/✗ .*alias\.hexnote\.json: variants\[0\]\.layout /)
        const l = run(dir, '--lenient')
        expect(l.status).toBe(0)
      })
    },
  )

  it('variants[].keys が配列表に無い鍵なら unknown_key で exit 1', { timeout: TIMEOUT }, () => {
    withTempDir((dir) => {
      writeVariant(dir, 'badkey.hexnote.json', (c) => {
        const v = (c['variants'] as Record<string, unknown>[])[0]!
        ;(v['keys'] as unknown[])[0] = 'KeyZ' // ableton に KeyZ は無い
        ;(v['keys'] as unknown[])[1] = 'constructor'
      })
      const r = run(dir)
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/✗ .*badkey\.hexnote\.json: variants\[0\]\.keys\[0\] .*KeyZ/)
      expect(r.stderr).toMatch(/✗ .*badkey\.hexnote\.json: variants\[0\]\.keys\[1\] .*constructor/)
    })
  })

  it('dir がファイルなら使い方を出して exit 2。-h も不明な引数', { timeout: TIMEOUT }, () => {
    const r = run(FIXTURE)
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('使い方')
    const h = run('-h')
    expect(h.status).toBe(2)
    expect(h.stderr).toContain('-h')
  })
})
