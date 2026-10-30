// 種付きの乱数（M0-05、手順 7。手順 13 の人工ジッタも使う）。出どころ: m3 `mulberry32` L244・`gauss` L245 をそのまま写した。
// 同じ種なら同じ列を返す（ダミー動画の逆行・回帰ハーネスのジッタを再現するため）。Math.random は使わない。
// DOM・Node のどちらにも触れない（tools/ からも import する）。

/** 0 以上 1 未満の一様乱数を返す関数 */
export type Rng = () => number

/** mulberry32（32 ビットの種）。m3 L244 と同じ列 */
export function mulberry32(seed: number): Rng {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 標準正規乱数（Box–Muller の cos 側。m3 L245 と同じく 0 を引き直す） */
export function gauss(rng: Rng): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
