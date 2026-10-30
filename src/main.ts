// 入口。M0 では層の部品を揃えるだけで、製品画面は M1 から。
// 開発ページ（src/app/dev/*.html）への導線は開発時（vite dev）だけ出す。build では import.meta.env.DEV が false で
// この塊ごと消え、dev の HTML も入口に入らない（vite の build は index.html だけを読む）。

if (import.meta.env.DEV) {
  const DEV_PAGES: readonly { href: string; label: string }[] = [
    { href: '/src/app/dev/input.html', label: '入力層（手順 5）' },
    { href: '/src/app/dev/play.html', label: '描画層・判定層（手順 6・7・8）' },
    { href: '/src/app/dev/clock.html', label: '時計層（手順 7）' },
    { href: '/src/app/dev/layout.html', label: '配列層（手順 9、U-01 の記録）' },
  ]
  const app = document.getElementById('app')
  if (app !== null) {
    const list = document.createElement('ul')
    for (const p of DEV_PAGES) {
      const a = document.createElement('a')
      a.href = p.href
      a.textContent = p.label
      const li = document.createElement('li')
      li.append(a)
      list.append(li)
    }
    app.append(list)
  }
}

export {}
