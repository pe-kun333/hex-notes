import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

describe('骨格（M0-01）', () => {
  it('package.json は MIT・private・ESM', () => {
    const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8')) as Record<string, unknown>
    expect(pkg['license']).toBe('MIT')
    expect(pkg['private']).toBe(true)
    expect(pkg['type']).toBe('module')
  })

  it('ライセンスと帰属のファイルがある', () => {
    for (const f of [
      'LICENSE',
      'content/samples/salamander/LICENSE',
      'content/samples/salamander/ATTRIBUTION.md',
      'content/charts/RIGHTS.md',
      'content/charts/rights.json',
      'docs/adr/0003-content-delivery.md',
      'docs/adr/0004-service-worker.md',
      'docs/adr/0005-rights-table-columns.md',
    ]) {
      expect(existsSync(root + f), f).toBe(true)
    }
  })

  it('PWA の icons は 192・512 の PNG と SVG（m0-kickoff.md §1.4）', () => {
    const m = JSON.parse(readFileSync(root + 'public/manifest.webmanifest', 'utf8')) as {
      icons: Array<{ src: string; sizes: string }>
    }
    const sizes = m.icons.map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    for (const i of m.icons) expect(existsSync(root + 'public' + i.src), i.src).toBe(true)
  })
})
