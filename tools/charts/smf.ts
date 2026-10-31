// SMF の読み取りは src/chart/smf.ts に移した（M2-01 前半、M2 の手順 1）。tools/ の既存の import のために re-export だけ残す。
export { decodeText, DRUM_CH, parseSmf } from '../../src/chart/smf.ts'
export type { Smf, SmfNote, SmfTrack } from '../../src/chart/smf.ts'
