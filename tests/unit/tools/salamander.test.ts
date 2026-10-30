import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseManifest } from '../../../src/audio/sampler.ts'
import { checkAttribution } from '../../../tools/licenses/attribution.ts'
import {
  DEFAULT_THIN,
  SALAMANDER,
  attributionOf,
  checkThin,
  ffmpegArgs,
  manifestOf,
  outFile,
  salamanderName,
  salamanderNotes,
  sourceFile,
} from '../../../tools/salamander/salamander-plan.ts'

// tools/salamander/{salamander-plan,thin-salamander}.ts。出どころ: archive.org の SalamanderGrandPianoV3（30 音・16 速度層・
// CC BY 3.0）、sfzinstruments の Data/region.txt（A0〜C8、D#1v8.flac の書き方）、kickoff 手順 10、decisions #46（仮）。
// 道具そのものは、ffmpeg（libopus）があるときだけ合成した 30 個の FLAC で通しで動かす（CI に無ければ飛ばす）。

const root = fileURLToPath(new URL('../../../', import.meta.url))
const TOOL = path.join(root, 'tools', 'salamander', 'thin-salamander.ts')

const ffmpegOk = ((): boolean => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
  return !r.error && /libopus/.test(r.stdout) && /flac/.test(r.stdout)
})()

describe('間引きの計画', () => {
  it('30 音: A0（21）から短三度ごとに C8（108）まで。名前は Salamander の書き方（D#1・F#1）', () => {
    const n = salamanderNotes()
    expect(n.length).toBe(30)
    expect(n[0]).toEqual({ midi: 21, name: 'A0' })
    expect(n.slice(1, 4).map((x) => x.name)).toEqual(['C1', 'D#1', 'F#1'])
    expect(n[29]).toEqual({ midi: 108, name: 'C8' })
    expect(salamanderName(60)).toBe('C4')
    expect(sourceFile('D#1', 8)).toBe('D#1v8.flac')
    expect(outFile('D#1')).toBe('Ds1.opus')
    expect(outFile('A0')).toBe('A0.opus')
  })

  it('ffmpeg の引数: 頭の無音を −60 dB で切り、6 s に切り詰め、終わり 0.5 s をフェード、Opus 48 kHz 96k', () => {
    const a = ffmpegArgs('in.flac', 'out.opus', DEFAULT_THIN)
    expect(a.slice(a.indexOf('-af'), a.indexOf('-af') + 2)).toEqual([
      '-af',
      'silenceremove=start_periods=1:start_threshold=-60dB,atrim=0:6,afade=t=out:st=5.5:d=0.5',
    ])
    expect(a.slice(-7)).toEqual(['-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', 'out.opus'])
    expect(a).toContain('in.flac')
  })

  it('範囲の外は止める（速度層 0・17・小数、フェード ≥ 長さ、無音の線 ≥ 0、ビットレートの形）', () => {
    for (const bad of [
      { vel: 0 },
      { vel: 17 },
      { vel: 8.5 },
      { trimS: 0.5, fadeS: 0.5 },
      { silenceDb: 0 },
      { bitrate: '96000' },
    ])
      expect(() => checkThin({ ...DEFAULT_THIN, ...bad }), JSON.stringify(bad)).toThrow(RangeError)
    expect(() => checkThin(DEFAULT_THIN)).not.toThrow()
  })

  it('manifest は sampler の parseManifest が読め、30 音に元ファイル名と速度層が付く', () => {
    const m = parseManifest(manifestOf(DEFAULT_THIN, '2026-10-31'))
    expect(m?.files.length).toBe(30)
    expect(m?.files[2]).toEqual({ midi: 27, file: 'Ds1.opus', vel: 8, source: 'D#1v8.flac' })
    expect(m?.license).toBe('CC-BY-3.0')
  })

  it('ATTRIBUTION.md は必須 6 項目の検査を通り、出典 URL と変換日と改変内容を書く', () => {
    const text = attributionOf(DEFAULT_THIN, '2026-10-31')
    expect(checkAttribution(text)).toEqual([])
    expect(text).toContain(SALAMANDER.sourceUrl)
    expect(text).toContain('| 変換日 | 2026-10-31 |')
    expect(text).toContain('速度層 v8')
    expect(text).toContain('正規化はしない')
  })
})

describe.skipIf(!ffmpegOk)('道具を通しで動かす（合成した 30 個の FLAC）', () => {
  it('30 個の Opus・manifest・ATTRIBUTION を書き、頭の無音（50 ms）を切る', () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'hexnote-salamander-'))
    try {
      const src = path.join(tmp, 'src', 'nested')
      const out = path.join(tmp, 'out')
      mkdirSync(src, { recursive: true })
      for (const n of salamanderNotes()) {
        const hz = 440 * 2 ** ((n.midi - 69) / 12)
        const r = spawnSync('ffmpeg', [
          '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
          '-i', `aevalsrc=if(lt(t\\,0.05)\\,0\\,0.5*sin(2*PI*${hz.toFixed(3)}*t)):s=44100:d=1.2`,
          '-c:a', 'flac', path.join(src, sourceFile(n.name, 8)),
        ]) // prettier-ignore
        expect(r.status, String(r.stderr)).toBe(0)
      }
      const r = spawnSync(
        process.execPath,
        [
          TOOL,
          '--src',
          path.join(tmp, 'src'),
          '--out',
          out,
          '--trim',
          '1',
          '--fade',
          '0.2',
          '--date',
          '2026-10-31',
        ],
        { cwd: root, encoding: 'utf8', timeout: 120_000 },
      )
      expect(r.status, r.stderr).toBe(0)
      const files = readdirSync(out)
      expect(files.filter((f) => f.endsWith('.opus')).length).toBe(30)
      const m = parseManifest(JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8')))
      expect(m?.files.every((f) => existsSync(path.join(out, f.file)))).toBe(true)
      expect(checkAttribution(readFileSync(path.join(out, 'ATTRIBUTION.md'), 'utf8'))).toEqual([])
      // A4（69、440 Hz）を 48 kHz の生の標本に戻し、最初に振幅 0.05 を超える標本が 10 ms より前にある（頭の 50 ms を切った）
      const pcm = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path.join(out, 'A4.opus'), '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], { maxBuffer: 1 << 24 }) // prettier-ignore
      expect(pcm.status).toBe(0)
      const f = new Float32Array(
        pcm.stdout.buffer,
        pcm.stdout.byteOffset,
        pcm.stdout.byteLength >> 2,
      )
      const first = f.findIndex((x) => Math.abs(x) > 0.05)
      expect(first).toBeGreaterThanOrEqual(0)
      expect(first).toBeLessThan(480)
      // 長さは 1 s ほど（Opus の前後の詰め物を見込む）
      expect(f.length / 48000).toBeGreaterThan(0.9)
      expect(f.length / 48000).toBeLessThan(1.1)
      // 元の FLAC が無ければ止める
      const bad = spawnSync(process.execPath, [TOOL, '--src', out, '--out', path.join(tmp, 'o2')], {
        cwd: root,
        encoding: 'utf8',
      })
      expect(bad.status).toBe(1)
      expect(bad.stderr).toContain('見つからない')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }, 180_000)
})
