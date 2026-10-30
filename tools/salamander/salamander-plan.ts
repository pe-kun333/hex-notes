// Salamander Grand Piano V3 の間引きの計画（M0-08、手順 10）。thin-salamander.ts と試験が使う純関数だけ。
// 出どころ: archive.org の SalamanderGrandPianoV3（Alexander Holm、CC BY 3.0。48 kHz・24 bit の録音、16 速度層、
// 最低音の A から短三度ごと。配布は 44.1 kHz・16 bit の FLAC 版 466.1 MB ほか。2026-10-31 確認）、sfzinstruments の
// Data/region.txt（30 音 A0〜C8、ファイル名は「音名＋オクターブ＋v速度層.flac」、♯ は「#」、例 D#1v8.flac、各音は
// 中心 ±1 鍵を受け持つ）、design.md §2.9、decisions #46（仮）。

/** 出典（ATTRIBUTION.md の題名・作者・出典 URL・ライセンス名と URL） */
export const SALAMANDER = Object.freeze({
  title: 'Salamander Grand Piano V3',
  author: 'Alexander Holm',
  sourceUrl: 'https://archive.org/details/SalamanderGrandPianoV3',
  archive: 'SalamanderGrandPianoV3_44.1khz16bit.tar.bz2',
  licenseName: 'CC BY 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
})

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** 音名（Salamander の書き方。60 ＝ C4、♯ は #） */
export function salamanderName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12] ?? '?'}${Math.floor(midi / 12) - 1}`
}

/** 30 音（A0 ＝ 21 から短三度ごと、C8 ＝ 108 まで） */
export function salamanderNotes(): { midi: number; name: string }[] {
  return Array.from({ length: 30 }, (_, k) => {
    const midi = 21 + 3 * k
    return { midi, name: salamanderName(midi) }
  })
}

/** 元のファイル名（例 D#1v8.flac） */
export function sourceFile(name: string, vel: number): string {
  return `${name}v${vel}.flac`
}

/** 出力のファイル名（URL に # を入れないので s にする。例 Ds1.opus） */
export function outFile(name: string): string {
  return `${name.replace('#', 's')}.opus`
}

export interface ThinOptions {
  /** 速度層 1〜16（既定 8 ＝ 中くらい） */
  readonly vel: number
  /** 頭の無音を切る線 dB（録音の頭には打鍵の前の間がある。sfz は offset で飛ばす） */
  readonly silenceDb: number
  /** 切り詰める長さ s と、終わりのフェード s */
  readonly trimS: number
  readonly fadeS: number
  /** Opus の目標ビットレート（ffmpeg の -b:a） */
  readonly bitrate: string
}

export const DEFAULT_THIN: ThinOptions = Object.freeze({
  vel: 8,
  silenceDb: -60,
  trimS: 6,
  fadeS: 0.5,
  bitrate: '96k',
})

/** 速度層・長さの範囲を確かめる（外れたら RangeError） */
export function checkThin(o: ThinOptions): void {
  if (!(Number.isInteger(o.vel) && o.vel >= 1 && o.vel <= 16))
    throw new RangeError(`速度層は 1〜16（${o.vel}）`)
  if (!(o.trimS > o.fadeS && o.fadeS >= 0))
    throw new RangeError(`長さ ${o.trimS} とフェード ${o.fadeS}`)
  if (!(o.silenceDb < 0)) throw new RangeError(`無音の線は負の dB（${o.silenceDb}）`)
  if (!/^\d+k$/.test(o.bitrate)) throw new RangeError(`ビットレートは 96k の形（${o.bitrate}）`)
}

/** ffmpeg の引数（頭の無音を切る → 長さを切る → 終わりをフェード → Opus 48 kHz） */
export function ffmpegArgs(input: string, output: string, o: ThinOptions): string[] {
  const filter = [
    `silenceremove=start_periods=1:start_threshold=${o.silenceDb}dB`,
    `atrim=0:${o.trimS}`,
    `afade=t=out:st=${o.trimS - o.fadeS}:d=${o.fadeS}`,
  ].join(',')
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-af',
    filter,
    '-ar',
    '48000',
    '-c:a',
    'libopus',
    '-b:a',
    o.bitrate,
    output,
  ]
}

/** content/samples/salamander/manifest.json（src/audio/sampler.ts の parseManifest が読む） */
export function manifestOf(o: ThinOptions, date: string): Record<string, unknown> {
  return {
    source: SALAMANDER.title,
    license: 'CC-BY-3.0',
    format: 'opus',
    origin: `${SALAMANDER.sourceUrl} (${SALAMANDER.archive})`,
    velocityLayer: o.vel,
    trimS: o.trimS,
    bitrate: o.bitrate,
    converted: date,
    files: salamanderNotes().map((n) => ({
      midi: n.midi,
      file: outFile(n.name),
      vel: o.vel,
      source: sourceFile(n.name, o.vel),
    })),
  }
}

/** ATTRIBUTION.md（CC BY 3.0 §4(b) の帰属。tools/licenses/attribution.ts の必須 6 項目） */
export function attributionOf(o: ThinOptions, date: string): string {
  const change =
    `全 88 鍵（短三度ごとの 30 音）× 16 速度層から 30 音（A0〜C8）・速度層 v${o.vel} の 1 層を選んだ。` +
    `頭の無音を ${o.silenceDb} dB で切り、${o.trimS} s に切り詰めて終わりの ${o.fadeS} s をフェード、` +
    `FLAC（44.1 kHz・16 bit）を Ogg Opus（48 kHz・${o.bitrate}bps）に再符号化。音量の正規化はしない`
  return [
    `# 帰属: ${SALAMANDER.title}`,
    '',
    'CC BY 3.0 の帰属表示。必須 6 項目は CI（`npm run licenses:files`）が検査する。tools/salamander/thin-salamander.ts が書く。',
    '',
    '| 項目 | 内容 |',
    '|---|---|',
    `| 題名 | ${SALAMANDER.title} |`,
    `| 作者 | ${SALAMANDER.author} |`,
    `| 出典 URL | ${SALAMANDER.sourceUrl}（${SALAMANDER.archive}） |`,
    `| ライセンス名と URL | ${SALAMANDER.licenseName} — ${SALAMANDER.licenseUrl} |`,
    `| 改変内容 | ${change} |`,
    `| 変換日 | ${date} |`,
    '',
    'アプリ内の表示: 設定画面（S6）のクレジットと README の「帰属」。',
    '',
  ].join('\n')
}
