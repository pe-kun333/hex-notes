// ファイルの書き出し（ダウンロード。M0-09、手順 11）。出どころ: m5 download L435（Blob → a[download] → 2 s 後に
// revoke）。中身とファイル名は src/storage/file.ts が作る。DOM に触れるので app/ に置く。

/** テキストをファイルとしてダウンロードさせる。できなければ false（呼ぶ側がコピーなどを出す） */
export function downloadText(doc: Document, fileName: string, text: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = doc.createElement('a')
    a.href = url
    a.download = fileName
    doc.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return true
  } catch {
    return false
  }
}
