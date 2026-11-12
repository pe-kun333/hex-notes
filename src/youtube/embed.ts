// 埋め込みの src と自前の iframe の属性（M3 の手順 1、仮。design §2.9 L149、m3-kickoff §7-10）。
// playerVars は enablejsapi・playsinline・disablekb・origin の 4 つだけ（rel・controls は書かない。controls は既定）。
// 全画面は右列を隠すので M3 では許さない（allowfullscreen を付けない。照合は手順 10）。寸法は host が持つ。DOM に触れない。

/** 埋め込みの URL（ホストは www.youtube.com。nocookie は使わない） */
export function embedSrc(id: string, origin: string): string {
  const q = `enablejsapi=1&playsinline=1&disablekb=1&origin=${encodeURIComponent(origin)}`
  return `https://www.youtube.com/embed/${encodeURIComponent(id)}?${q}`
}

/**
 * 自前の iframe に明示する属性（spike の allow に referrerpolicy と title を足した。API Client Identity は Referer が要る、
 * onError 153）。幅・高さ・allowfullscreen は持たない。
 */
export const EMBED_ATTRS: Readonly<Record<'referrerpolicy' | 'allow' | 'title', string>> = {
  referrerpolicy: 'strict-origin-when-cross-origin',
  allow: 'autoplay; encrypted-media',
  title: 'YouTube の動画プレイヤー',
}
