// S5 曲の持ち込み（M2-01 後半、M2 の手順 2）。段の状態機械と文言は import-view.ts（純関数）、譜面づくりは chart/import.ts。
// 出どころ: design.md §1.3 S5（段ごとに戻れる縦積み。M2 は段 1・2・3・5、段 4 は M3-03 #79）、m6 S5 L454–518・renderS5
// L893–905・ACT L990–998、m5 の段 1（ドロップ領域・handleFile L568–577）、m2-kickoff 手順 2・§7-6・§7-18・§7-26（歯車なし）。
// 保存 ＝ chartFromSmf → putChart。保存層が本物の IndexedDB に書けずメモリへ移ったら（resilientDb の mode が memory）、
// 帯（殻が出す storageFail）に加えて、この画面で「*.hexnote.json を書き出す」を出す。試験の外（DOM）なので手で確かめる。

import { playScheduled, resumeAudio, cancelFrom } from '../../audio/context.ts'
import { chartFromSmf, smfParts, type ChartParts } from '../../chart/import.ts'
import { parseSmf } from '../../chart/smf.ts'
import { buildVariant } from '../../chart/variants.ts'
import type { Chart } from '../../shared/types.ts'
import { chartFileName, chartFileText } from '../../storage/file.ts'
import { downloadText } from '../file-io.ts'
import {
  IMPORT_STEPS,
  RIGHTS_NOTE,
  ROLE_TEXT,
  SAVE_FAIL_DETAIL,
  SAVE_FAIL_EXPORT,
  SAVE_FAIL_TITLE,
  TRACKS_NOTE,
  canNext,
  canSave,
  collapsedText,
  duplicateText,
  foldCards,
  importStep,
  initialImport,
  loadErrorText,
  previewItems,
  resetAccomp,
  saveSummary,
  songInfo,
  trackRows,
  variantsNote,
  type Duplicate,
  type ImportEvent,
  type ImportState,
} from '../import-view.ts'
import type { ScreenContext, ScreenView } from '../shell.ts'
import { localSong } from '../songs.ts'
import { button, frame, h } from './frame.ts'

const STEP_NAMES: Readonly<Record<number, string>> = {
  1: '段 1 MIDI ファイル',
  2: '段 2 トラック',
  3: '段 3 折り畳み',
  5: '段 5 保存',
}

export function importScreen(ctx: ScreenContext): ScreenView {
  const { doc, booted } = ctx
  const f = frame(ctx, '曲の持ち込み', { gear: false })
  const settings = ctx.settings()
  let s: ImportState = initialImport(settings.fold)
  let alive = true
  // 段 3 の素（弾く・伴奏が変わったら作り直す）と、段 5 の譜面（fold・トラックが変わったら作り直す）
  let parts: { key: string; value: ChartParts } | null = null
  let built: { key: string; chart: Chart; dup: Duplicate } | null = null
  let previewUntil = 0

  const steps = h(doc, 'ol', { className: 'steps' })
  const failBox = h(doc, 'div', { className: 'card soft' })
  failBox.hidden = true
  const body = h(doc, 'div')
  f.body.append(steps, failBox, body)

  const send = (ev: ImportEvent): void => {
    const next = importStep(s, ev)
    if (next === 'exit') {
      stopPreview()
      ctx.go('S1')
      return
    }
    const moved = next.step !== s.step
    s = next
    if (moved) stopPreview()
    render()
  }

  const partsOf = (): ChartParts | null => {
    if (s.file === null) return null
    const key = `${s.play}|${s.accomp.join(',')}`
    if (parts?.key !== key) parts = { key, value: smfParts(s.file.smf, s.play, s.accomp) }
    return parts.value
  }

  // ---------- 試聴（段 3。折り畳み後の旋律＋伴奏の 8 小節。m5 の加算合成・交互再生は移さない、仮） ----------
  const previewBtn = button(doc, '試聴（8 小節）', () => togglePreview(), 'small')
  function stopPreview(): void {
    if (previewUntil === 0) return
    previewUntil = 0
    const out = ctx.audio()
    cancelFrom(out, 0)
    previewBtn.textContent = '試聴（8 小節）'
  }
  function togglePreview(): void {
    if (previewUntil > 0) return stopPreview()
    const p = partsOf()
    if (p === null) return
    const out = ctx.audio()
    void resumeAudio(out)
    const v = buildVariant(p, { layout: settings.layout, limit: 2, fold: s.fold })
    const t0 = out.ctx.currentTime + 0.15
    let end = 0
    for (const item of previewItems(p, v)) {
      playScheduled(out, { item, ctxSec: t0 + item.tMs / 1000, holdS: item.durMs / 1000, lateMs: 0 })
      end = Math.max(end, item.tMs + item.durMs)
    }
    previewUntil = performance.now() + end + 300
    previewBtn.textContent = '試聴を止める'
    const until = previewUntil
    setTimeout(() => {
      if (previewUntil === until) {
        previewUntil = 0
        previewBtn.textContent = '試聴（8 小節）'
      }
    }, end + 300)
  }

  // ---------- 段 1 ----------
  const fileIn = h(doc, 'input')
  fileIn.type = 'file'
  fileIn.accept = '.mid,.midi,audio/midi'
  fileIn.setAttribute('aria-label', 'MIDI ファイル')
  const readFile = (file: File): void => {
    void (async () => {
      let ev: ImportEvent
      try {
        ev = { kind: 'loaded', file: { fileName: file.name, smf: parseSmf(new Uint8Array(await file.arrayBuffer())) } }
      } catch (e) {
        ev = { kind: 'failed', why: loadErrorText(e) }
      }
      if (!alive) return
      parts = null
      built = null
      send(ev)
    })()
  }
  fileIn.addEventListener('change', () => {
    const file = fileIn.files?.[0]
    fileIn.value = ''
    if (file !== undefined) readFile(file)
  })
  const drop = h(doc, 'div', { className: 'card soft drop' }, h(doc, 'p', { text: 'MIDI ファイル（SMF 形式 0／1）をここへドロップするか、選びます。' }), fileIn)
  drop.addEventListener('dragover', (e) => {
    e.preventDefault()
    drop.classList.add('over')
  })
  drop.addEventListener('dragleave', () => drop.classList.remove('over'))
  drop.addEventListener('drop', (e) => {
    e.preventDefault()
    drop.classList.remove('over')
    const file = e.dataTransfer?.files[0]
    if (file !== undefined) readFile(file)
  })

  const nav = (...extra: HTMLElement[]): HTMLElement => {
    const next = button(doc, '次へ', () => send({ kind: 'next' }), 'primary')
    next.disabled = !canNext(s)
    const back = s.step === 1 ? button(doc, 'やめる', () => send({ kind: 'cancel' })) : button(doc, '戻る', () => send({ kind: 'back' }))
    return h(doc, 'div', { className: 'btnrow' }, ...(s.step === 5 ? [] : [next]), ...extra, back, ...(s.step === 1 ? [] : [button(doc, 'やめる', () => send({ kind: 'cancel' }), 'ghost')]))
  }

  function step1(): HTMLElement[] {
    const info = s.file === null ? [] : [h(doc, 'div', { className: 'card soft' }, h(doc, 'p', {}, h(doc, 'b', { text: songInfo(s.file) })), h(doc, 'p', { className: 'note', text: 'テンポ変化は拍のパルス表（pulse.tempo）に写します。' }))]
    const err = s.error === null ? [] : [h(doc, 'p', { className: 'note caution', text: s.error })]
    return [drop, ...err, ...info, nav()]
  }

  function step2(): HTMLElement[] {
    const rows = trackRows(s)
    const table = h(doc, 'table', { className: 't tracks' })
    table.append(h(doc, 'tr', {}, ...['弾く', '伴奏', 'トラック', 'ch', '音数', '音域', '長さ（拍）', ''].map((t) => h(doc, 'th', { text: t }))))
    for (const r of rows) {
      const radio = h(doc, 'input')
      radio.type = 'radio'
      radio.name = 'play'
      radio.checked = r.role === 'play'
      radio.setAttribute('aria-label', `${r.name} を弾く`)
      radio.addEventListener('change', () => send({ kind: 'play', track: r.index }))
      const check = h(doc, 'input')
      check.type = 'checkbox'
      check.checked = r.role === 'accomp'
      check.disabled = r.role === 'play'
      check.setAttribute('aria-label', `${r.name} を伴奏にする`)
      check.addEventListener('change', () => send({ kind: 'accomp', track: r.index, on: check.checked }))
      const pill = h(doc, 'span', { className: `pill${r.role === 'play' ? ' good' : ''}`, text: ROLE_TEXT[r.role] })
      table.append(h(doc, 'tr', {},
        h(doc, 'td', {}, radio), h(doc, 'td', {}, check),
        h(doc, 'td', {}, r.name, ...(r.drum ? [' ', h(doc, 'span', { className: 'pill', text: 'ch10 ドラム' })] : [])),
        h(doc, 'td', { text: String(r.ch) }), h(doc, 'td', { text: String(r.notes) }), h(doc, 'td', { text: r.range }), h(doc, 'td', { text: r.beats }),
        h(doc, 'td', {}, pill),
      ))
    }
    const reset = button(doc, '伴奏を既定に戻す', () => {
      s = resetAccomp(s)
      render()
    }, 'small')
    return [h(doc, 'div', { className: 'scroll' }, table), h(doc, 'p', { className: 'note', text: TRACKS_NOTE }), nav(reset)]
  }

  function step3(): HTMLElement[] {
    const p = partsOf()
    if (p === null) return [nav()]
    const grid = h(doc, 'div', { className: 'grid3' })
    for (const c of foldCards(p)) {
      const b = button(doc, '', () => send({ kind: 'fold', fold: c.fold }), `card fold${c.fold === s.fold ? ' sel' : ''}`)
      b.setAttribute('aria-pressed', String(c.fold === s.fold))
      b.append(h(doc, 'b', { text: c.title }), h(doc, 'span', { className: 'note', text: c.desc }), ...c.lines.map((l) => h(doc, 'span', { className: 'note', text: l })), h(doc, 'span', { className: 'note', text: c.thin }))
      grid.append(b)
    }
    const col = collapsedText(p.collapsed)
    const chosen = foldCards(p).find((c) => c.fold === s.fold)
    return [grid, ...(col === null ? [] : [h(doc, 'p', { className: 'note', text: col })]), h(doc, 'p', { className: 'note' }, `選択: ${chosen?.title ?? ''}。`, previewBtn), nav()]
  }

  function step5(): HTMLElement[] {
    const file = s.file
    if (file === null) return [nav()]
    const nameIn = h(doc, 'input')
    nameIn.type = 'text'
    nameIn.value = s.name
    nameIn.setAttribute('aria-label', '曲名')
    const composerIn = h(doc, 'input')
    composerIn.type = 'text'
    composerIn.value = s.composer
    composerIn.placeholder = '任意'
    composerIn.setAttribute('aria-label', '作者')
    const save = button(doc, '保存 → ホーム', () => void doSave(), 'primary')
    const refresh = (): void => {
      save.disabled = !canSave(s) || built?.dup === 'bundled'
    }
    nameIn.addEventListener('input', () => {
      s = importStep(s, { kind: 'name', text: nameIn.value }) as ImportState
      refresh()
    })
    composerIn.addEventListener('input', () => {
      s = importStep(s, { kind: 'composer', text: composerIn.value }) as ImportState
    })
    const summary = h(doc, 'dd', { text: '計算中…' })
    const warns = h(doc, 'dd', { text: '計算中…' })
    const dupLine = h(doc, 'p', { className: 'note' })
    dupLine.hidden = true
    refresh()
    // 曲名・作者は id にも版にも効かないので、トラックと fold だけで作り直す
    const key = `${s.play}|${s.accomp.join(',')}|${s.fold}`
    void (async () => {
      if (built?.key !== key) {
        const chart = await chartFromSmf({ smf: file.smf, play: s.play, accomp: s.accomp, fold: s.fold, name: s.name || 'x' })
        const bundled = await ctx.bundledIds()
        const dup: Duplicate = bundled.includes(chart.id) ? 'bundled' : (await booted.db.getChart(chart.id).catch(() => undefined)) !== undefined ? 'local' : 'none'
        built = { key, chart, dup }
      }
      if (!alive || built.key !== key) return
      const sum = saveSummary(built.chart, settings.layout)
      summary.textContent = sum === null ? '—' : `${sum.axes}（${sum.variant}）`
      if (sum !== null && sum.cautions.length > 0) summary.append(' ', h(doc, 'span', { className: 'pill', text: `注意: ${sum.cautions.join('・')}` }))
      warns.replaceChildren(sum === null || sum.warnCount === 0 ? '無し' : `${sum.warnCount} 件`)
      if (sum !== null && sum.warnings.length > 0) warns.append(h(doc, 'ul', {}, ...sum.warnings.map((w) => h(doc, 'li', { text: w }))))
      const d = duplicateText(built.dup)
      dupLine.hidden = d === null
      dupLine.textContent = d ?? ''
      refresh()
    })()
    const kv = h(doc, 'dl', { className: 'kv' },
      h(doc, 'dt', { text: '曲名' }), h(doc, 'dd', {}, nameIn),
      h(doc, 'dt', { text: '作者' }), h(doc, 'dd', {}, composerIn),
      h(doc, 'dt', { text: '難度 4 軸' }), summary,
      h(doc, 'dt', { text: '運指の警告' }), warns,
      h(doc, 'dt', { text: '権利印' }), h(doc, 'dd', {}, h(doc, 'span', { className: 'pill', text: 'private' }), ` ${RIGHTS_NOTE}`),
      h(doc, 'dt', { text: '生成する版' }), h(doc, 'dd', { text: variantsNote(s.fold) }),
    )
    return [kv, dupLine, nav(save)]
  }

  async function doSave(): Promise<void> {
    const file = s.file
    if (file === null || !canSave(s) || built?.dup === 'bundled') return
    const chart = await chartFromSmf({ smf: file.smf, play: s.play, accomp: s.accomp, fold: s.fold, name: s.name, composer: s.composer, created: new Date().toISOString() })
    let stored = true
    try {
      await booted.db.putChart(chart)
      stored = (await booted.db.mode()) === 'idb'
    } catch {
      // resilientDb は投げずにメモリへ移る（帯は殻が出す）。包んでいない置き場が投げたときもここで知らせる
      stored = false
      ctx.band({ kind: 'storageFail', area: 'idb' })
    }
    if (!alive) return
    ctx.pickSong(localSong(chart))
    if (stored) {
      stopPreview()
      ctx.go('S1')
      return
    }
    // 端末に残らない（このタブの間だけ遊べる）。書き出しを勧める（m6 L457・S7d「S5 では書き出しを即座に勧めます」L941）
    failBox.hidden = false
    failBox.replaceChildren(
      h(doc, 'p', {}, h(doc, 'b', { text: SAVE_FAIL_TITLE }), ` ${SAVE_FAIL_DETAIL}`),
      h(doc, 'div', { className: 'btnrow' },
        button(doc, SAVE_FAIL_EXPORT, () => {
          if (!downloadText(doc, chartFileName(chart), chartFileText(chart))) failBox.append(h(doc, 'p', { className: 'note', text: '書き出せませんでした。' }))
        }, 'small primary'),
        button(doc, '閉じる → ホーム', () => ctx.go('S1'), 'small'),
      ),
    )
  }

  function render(): void {
    steps.replaceChildren(...IMPORT_STEPS.map((n) => h(doc, 'li', { className: n === s.step ? 'on' : n < s.step ? 'done' : '', text: STEP_NAMES[n] ?? '' })))
    // 段 4（同期）は M2 では出さない（§7-2、#79）
    body.replaceChildren(...(s.step === 1 ? step1() : s.step === 2 ? step2() : s.step === 3 ? step3() : step5()))
  }

  render()
  return {
    root: f.root,
    bandSlot: f.bandSlot,
    unmount: () => {
      alive = false
      stopPreview()
    },
  }
} // prettier-ignore
