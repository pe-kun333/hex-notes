// 同意の門（M3 の手順 1、decisions #100、仮）。iframe_api の読込と iframe を作る前に必ず通す口。
// 今は常に通す（同意の画面と保存は公開先を決める時、U-08）。門を先に置くので、同意の画面を足しても iframe を作る時機は
// 作り直さない。製品の束の門 VIDEO_FEATURE（手順 2〜12、門を外す PR で外した）とは別物。DOM に触れない。

export function embedGate(): boolean {
  return true
}
