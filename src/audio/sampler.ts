// ピアノ音源 Salamander の遅延読込と鳴らし方（M0-08、手順 10）。出どころ: design.md §2.9（Salamander 30 音は遅延読込し
// 合成音で先に鳴らす）・§4.5（smplr か自前 Sampler。依存を増やさず自前にした）、kickoff 手順 10（A0 から短三度の 30 音、
// manifest に元ファイル名・出典版・速度層）、decisions #46（仮）。音源の帰属は content/samples/salamander/ATTRIBUTION.md。
// 読み込みは fetch → decodeAudioData（読めない音は飛ばし、読めた音の中で最も近い音を使う。全部読めなければ合成音のまま）。
// 計画（最も近い音とピッチ比）は純関数、鳴らすのは playSample。

/** manifest の 1 音 */
export interface SampleEntry {
  /** 録音の音高（pitch_keycenter） */
  readonly midi: number
  /** manifest からの相対パス */
  readonly file: string
  /** 速度層（Salamander は 1〜16） */
  readonly vel: number
  /** 元のファイル名（例 D#1v8.flac） */
  readonly source?: string
}

export interface SamplerManifest {
  readonly source: string
  readonly license: string
  readonly format: string
  readonly files: readonly SampleEntry[]
}

/** 外から来た manifest を確かめる（形が違えば null。files は空でよい＝未同梱） */
export function parseManifest(x: unknown): SamplerManifest | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o['source'] !== 'string' || typeof o['license'] !== 'string') return null
  if (typeof o['format'] !== 'string' || !Array.isArray(o['files'])) return null
  const files: SampleEntry[] = []
  for (const f of o['files'] as unknown[]) {
    if (typeof f !== 'object' || f === null) return null
    const e = f as Record<string, unknown>
    const midi = e['midi']
    const file = e['file']
    const vel = e['vel']
    if (
      !Number.isInteger(midi) ||
      typeof file !== 'string' ||
      file === '' ||
      !Number.isInteger(vel)
    )
      return null
    if (file.includes('..') || file.startsWith('/')) return null
    const src = e['source']
    files.push({
      midi: midi as number,
      file,
      vel: vel as number,
      ...(typeof src === 'string' ? { source: src } : {}),
    })
  }
  return { source: o['source'], license: o['license'], format: o['format'], files }
}

/** 最も近い録音の音高とピッチ比（2^(差/12)）。同じ近さなら低い方を上げる。録音が無ければ null */
export function nearestSample(
  midi: number,
  have: Iterable<number>,
): { readonly midi: number; readonly rate: number } | null {
  let best: number | null = null
  for (const m of have)
    if (
      best === null ||
      Math.abs(m - midi) < Math.abs(best - midi) ||
      (Math.abs(m - midi) === Math.abs(best - midi) && m < best)
    )
      best = m
  return best === null ? null : { midi: best, rate: 2 ** ((midi - best) / 12) }
}

/** 離した後に消す時間 s（仮） */
export const SAMPLE_RELEASE_S = 0.25
/** 振幅（vel 0..1 に比例。仮） */
export function sampleGain(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/** 録音を全部読む（読めない音は飛ばす）。baseUrl は manifest.json のあるディレクトリ（末尾 / 付き） */
export async function loadSampleBuffers(
  ctx: BaseAudioContext,
  baseUrl: string,
  manifest: SamplerManifest,
  fetchFn: typeof fetch = fetch,
): Promise<Map<number, AudioBuffer>> {
  const out = new Map<number, AudioBuffer>()
  await Promise.all(
    manifest.files.map(async (f) => {
      try {
        const res = await fetchFn(baseUrl + f.file)
        if (!res.ok) return
        out.set(f.midi, await ctx.decodeAudioData(await res.arrayBuffer()))
      } catch {
        // 読めない（Opus を復号できない環境など）音は飛ばす。全部読めなければ合成音のまま
      }
    }),
  )
  return out
}

/** 1 音を鳴らす（t は context の秒、holdS は音価の実時間 s。その後 SAMPLE_RELEASE_S で消す） */
export function playSample(
  ctx: BaseAudioContext,
  dest: AudioNode,
  buf: AudioBuffer,
  rate: number,
  t: number,
  holdS: number,
  gain: number,
): AudioScheduledSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = rate
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.setTargetAtTime(0, t + holdS, SAMPLE_RELEASE_S / 3)
  src.connect(g)
  g.connect(dest)
  src.start(t)
  src.stop(t + holdS + SAMPLE_RELEASE_S)
  return src
}
