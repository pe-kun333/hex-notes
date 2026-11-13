// S5 曲の持ち込み（M2-01 後半、M2 の手順 2）。段の状態機械と文言は import-view.ts（純関数）、譜面づくりは chart/import.ts。
// 出どころ: design.md §1.3 S5（段ごとに戻れる縦積み。M2 は段 1・2・3・5、段 4 は M3-03 #79）、m6 S5 L454–518・renderS5
// L893–905・ACT L990–998、m5 の段 1（ドロップ領域・handleFile L568–577）、m2-kickoff 手順 2・§7-6・§7-18・§7-26（歯車なし）。
// 保存 ＝ chartFromSmf → putChart。保存層が本物の IndexedDB に書けずメモリへ移ったら（resilientDb の mode が memory）、
// 帯（殻が出す storageFail）に加えて、この画面で「*.hexnote.json を書き出す」を出す。試験の外（DOM）なので手で確かめる。
// M3 の手順 4（M3-03 後半、m3-kickoff 手順 4・§7-23・§7-25）: 段 4（同期）。段 5 の「動画を付ける」から入る。
// ID の欄 → プレイヤー（ctx.videoPort、480×270。開始は利用者の ▶）→ 規約のリンクの行 → 同期タップの部品。毎フレームの
// 標本を video の時計に流し、resync で走り出し・held で捨てる。止める要求は流さない（要求 0 件）。やり直し・中止・8 拍の後は
// 口を作り直して ▶ を待つ（§7-3）。保存は withSync。同じ MIDI の持ち込み直しは前の sync を引き継ぎ、段 5 に「同期をやり直す」
// 「動画を外す」。

import { playScheduled, resumeAudio, cancelFrom } from '../../audio/context.ts'
import { chartFromSmf, smfParts, type ChartParts } from '../../chart/import.ts'
import { parseSmf } from '../../chart/smf.ts'
import { buildVariant } from '../../chart/variants.ts'
import { clockRead, clockTick, initialClock, type ClockState } from '../../clock/clock-source.ts'
import { SYNC_TAP_BEATS, syncTapPlan, type SyncTapResult } from '../../clock/sync-tap.ts'
import type { ClockMap, VideoPort } from '../../clock/types.ts'
import { lateEdge, PROFILES } from '../../judge/windows.ts'
import type { Chart, SyncSource } from '../../shared/types.ts'
import { syncRow } from '../../telemetry/rows.ts'
import { videoIdOf } from '../../youtube/video-id.ts'
import { songSeconds } from '../home-view.ts'
import { withSync } from '../library-view.ts'
import { syncPanel, type SyncPanel } from '../sync-panel.ts'
import { termsLine } from '../terms.ts'
import { embedFailPlan, isEmbedFail, syncFailText } from '../embed-view.ts'
import { chartFileName, chartFileText } from '../../storage/file.ts'
import { downloadText } from '../file-io.ts'
import {
  RIGHTS_NOTE,
  SYNC_NARROW_TEXT,
  SYNC_TEMPO_NOTE,
  ROLE_TEXT,
  SAVE_FAIL_DETAIL,
  SAVE_FAIL_EXPORT,
  SAVE_FAIL_TITLE,
  TRACKS_NOTE,
  canEmbedSync,
  canNext,
  canSave,
  collapsedText,
  duplicateText,
  foldCards,
  headRoom,
  importStep,
  importSteps,
  initialImport,
  loadErrorText,
  previewItems,
  resetAccomp,
  saveSummary,
  songInfo,
  syncSourceOf,
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
  4: '段 4 同期',
  5: '段 5 保存',
}

/** 段 4 の部品と口（段 4 にいる間だけ。iframe を DOM の中で動かすと読み直すので、要素は作り直さずに残す） */
interface SyncStage {
  readonly el: HTMLElement
  readonly navSlot: HTMLElement
  readonly host: HTMLElement
  readonly panel: SyncPanel
  readonly msg: HTMLElement
  readonly head: HTMLElement
  /** 箱の内寸がプレイヤーの幅以上（未満なら iframe を作らない） */
  readonly wide: boolean
}

export function importScreen(ctx: ScreenContext): ScreenView {
  const { doc, booted } = ctx
  const f = frame(ctx, '曲の持ち込み', { gear: false })
  const settings = ctx.settings()
  let s: ImportState = initialImport(settings.fold)
  let alive = true
  // 段 3 の素（弾く・伴奏が変わったら作り直す）と、段 5 の譜面（fold・トラックが変わったら作り直す）
  let parts: { key: string; value: ChartParts } | null = null
  let built: { key: string; chart: Chart; dup: Duplicate; prevSync: SyncSource | null } | null = null
  // 段 4 の部品・口・時計（段 4 を離れると外す）
  let sync: SyncStage | null = null
  let port: VideoPort | null = null
  let clock: ClockState | null = null
  let raf: number | null = null
  // この iframe で embedError 行を書いた（iframe 1 つに 1 回。M3 の手順 5）
  let failWritten = false
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
        const prev = bundled.includes(chart.id) ? undefined : await booted.db.getChart(chart.id).catch(() => undefined)
        const dup: Duplicate = bundled.includes(chart.id) ? 'bundled' : prev !== undefined ? 'local' : 'none'
        const ps = prev?.sync?.sources[0]
        built = { key, chart, dup, prevSync: ps?.kind === 'youtube' ? ps : null }
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
      // 持ち込み直し: 前の譜面の sync を 1 度写す（何もしなければ引き継ぐ、§7-25）
      if (s.step === 5 && built.prevSync !== null && !s.inheritSeen && s.sync === null) send({ kind: 'inherit', source: built.prevSync })
    })()
    const kv = h(doc, 'dl', { className: 'kv' },
      h(doc, 'dt', { text: '曲名' }), h(doc, 'dd', {}, nameIn),
      h(doc, 'dt', { text: '作者' }), h(doc, 'dd', {}, composerIn),
      h(doc, 'dt', { text: '難度 4 軸' }), summary,
      h(doc, 'dt', { text: '運指の警告' }), warns,
      h(doc, 'dt', { text: '権利印' }), h(doc, 'dd', {}, h(doc, 'span', { className: 'pill', text: 'private' }), ` ${RIGHTS_NOTE}`),
      h(doc, 'dt', { text: '生成する版' }), h(doc, 'dd', { text: variantsNote(s.fold) }),
    )
    return [kv, ...videoBox(), dupLine, nav(save)]
  }

  /** 段 5 の動画の箱: 付ける／やり直す・外す */
  function videoBox(): HTMLElement[] {
    const src = s.sync
    if (src === null)
      return [h(doc, 'p', { className: 'note' }, 'この曲は動画を使いません（自前音源）。', button(doc, '動画を付ける（段 4 へ）', () => send({ kind: 'attachVideo' }), 'small'))]
    return [h(doc, 'p', { className: 'note' },
      `動画: ${src.videoId ?? '?'} ・ offset ${src.offset.toFixed(3)} s${s.inherited ? '（前の譜面の同期を引き継ぎます）' : ''}。`,
      button(doc, '同期をやり直す（段 4 へ）', () => send({ kind: 'attachVideo' }), 'small'),
      button(doc, '動画を外す', () => send({ kind: 'removeVideo' }), 'small'),
    )]
  } // prettier-ignore

  // ---------- 段 4（同期。門の内） ----------
  /** 口と時計を外す（rAF も止める） */
  function stopPlayer(): void {
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
    port?.dispose()
    port = null
    clock = null
  }

  /** 1 回読み、時計の事象を部品へ（PLAYING の再アンカーで走り出し、PLAYING でなくなったらその回を捨てる）。写像を返す */
  function feedClock(now: number): ClockMap | null {
    if (port === null || clock === null) return null
    const step = clockTick(clock, now, port.sample(now))
    clock = step.state
    for (const ev of step.out.events)
      if (ev.kind === 'resync') sync?.panel.videoStarted(now)
      else if (ev.kind === 'held' || ev.kind === 'stall' || ev.kind === 'novideo') sync?.panel.videoStopped()
    return step.out.map
  }

  const frameSync = (): void => {
    if (!alive) return
    feedClock(performance.now())
    raf = requestAnimationFrame(frameSync)
  }

  /** 口を作る・作り直す（ID を替えた・やり直し・中止・8 拍の後。利用者の ▶ を待つ、§7-3） */
  function mountSyncPlayer(): void {
    stopPlayer()
    const st = sync
    if (st === null || !st.wide || s.videoId === '') return
    failWritten = false
    clock = initialClock({ mode: 'video', t0: 0 })
    port = ctx.videoPort({
      host: st.host,
      videoId: s.videoId,
      onEvent: (e) => {
        // 読込の失敗・応答なし・onError: S2 と同じ行と印、iframe を外して表の見出し＋「動画なしで保存できます。」（M3 の手順 5、
        // §7-26・§7-38。やり直しは ID の欄から）
        if (!alive || !isEmbedFail(e)) return
        const plan = embedFailPlan(e, s.videoId, ctx.noEmbed(), failWritten, new Date().toISOString())
        if (plan.row !== null) {
          failWritten = true
          void booted.db.appendTelemetry(plan.row).catch(() => {})
        }
        ctx.setNoEmbed(plan.list)
        stopPlayer()
        st.msg.textContent = syncFailText(plan.view)
      },
    })
    raf = requestAnimationFrame(frameSync)
    ctx.layoutChanged()
  }

  /** 8 拍の結果（保存できて頭の余白が 0 以上なら保存する sync に） */
  function accept(r: SyncTapResult | null): void {
    const p = partsOf()
    const st = sync
    if (p === null || st === null) return
    if (r === null || !r.verdict.savable || s.videoId === '') {
      st.head.replaceChildren()
      send({ kind: 'synced', source: null })
      return
    }
    const src = syncSourceOf(s.videoId, r.fit)
    const room = headRoom(p, src)
    st.head.replaceChildren(...room.notes.map((t) => h(doc, 'p', { className: 'note caution', text: t })))
    send({ kind: 'synced', source: room.savable ? src : null })
  }

  /** sync 行（8 拍そろった回ごと。chartId は保存する譜面の id ＝ 旋律とテンポだけで決まる、§7-38） */
  async function writeSyncRow(r: SyncTapResult, attempts: number): Promise<void> {
    const file = s.file
    if (file === null) return
    const chart = built?.chart ?? (await chartFromSmf({ smf: file.smf, play: s.play, accomp: s.accomp, fold: s.fold, name: s.name || 'x' }))
    await booted.db.appendTelemetry(syncRow(chart.id, r, attempts, new Date().toISOString())).catch(() => {})
  }

  /** ID の欄の値を当てる（URL も受け、通れば焦点を外して Space を部品へ） */
  function applyId(text: string, st: SyncStage, idIn: HTMLInputElement): void {
    const id = videoIdOf(text)
    if (id === null) {
      st.msg.textContent = 'YouTube の動画 ID（11 文字）か URL を入れてください。'
      return
    }
    idIn.value = id
    idIn.blur()
    st.msg.textContent = ''
    st.head.replaceChildren()
    send({ kind: 'videoId', id })
    mountSyncPlayer()
  }

  /** 段 4 の部品を作る（段 4 に入った時に 1 回） */
  function openSync(): SyncStage | null {
    const p = partsOf()
    if (p === null) return null
    const host = h(doc, 'div', { className: 'player video sync-player' })
    host.style.cssText = 'width:480px;height:270px'
    const msg = h(doc, 'p', { className: 'note' })
    const head = h(doc, 'div')
    // 持ち込み直しで写した同期は、新しい結果が来るまで残る（そのまま「次へ」で引き継ぐ）
    const prev = s.inherited ? s.sync : null
    if (prev !== null) head.append(h(doc, 'p', { className: 'note', text: `前の譜面の同期（offset ${prev.offset.toFixed(3)} s）が残っています。タップし直すと置き換わります。` }))
    const navSlot = h(doc, 'div')
    const wide = canEmbedSync(body.clientWidth)
    const panel = syncPanel({
      doc,
      planOf: (start) => syncTapPlan(p.pulse, SYNC_TAP_BEATS, start),
      // 写像はタップのたびにも読む（画面の onInput が先に 1 回 tick する。#85 (e)）
      clockMap: () => (clock === null ? { a: 0, b: 0 } : clockRead(clock, performance.now()).map),
      now: () => performance.now(),
      drift: { songMs: songSeconds(p) * 1000, windowMs: lateEdge(PROFILES.beginner.windows) },
      onResult: (r, n) => void writeSyncRow(r, n),
      onChange: (r) => accept(r),
      onRetry: () => mountSyncPlayer(),
    })
    const idIn = h(doc, 'input')
    idIn.type = 'text'
    idIn.value = s.videoId
    idIn.placeholder = '動画 ID（11 文字）か YouTube の URL'
    idIn.setAttribute('aria-label', '動画 ID')
    const st: SyncStage = { el: h(doc, 'div'), navSlot, host, panel, msg, head, wide }
    idIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyId(idIn.value, st, idIn)
    })
    const dev = ctx.devProbe
    const idRow = h(doc, 'div', { className: 'btnrow' }, h(doc, 'span', { className: 'note', text: '動画 ID' }), idIn,
      button(doc, '読み込む', () => applyId(idIn.value, st, idIn), 'small'),
      // DEV だけ: DEV の表のダミーの ID を入れる（ctx.videoPort がダミーの口を返す。import.meta.env.DEV で build から文字ごと消す）
      ...(!import.meta.env.DEV || dev === null ? [] : [button(doc, 'ダミー動画で試す', () => applyId(dev.dummyVideoId, st, idIn), 'small')]))
    st.el.append(
      h(doc, 'p', { className: 'note', text: SYNC_TEMPO_NOTE }),
      idRow, msg,
      ...(wide ? [host, termsLine(doc)] : [h(doc, 'p', { className: 'note caution', text: SYNC_NARROW_TEXT })]),
      panel.el, head,
    )
    return st
  } // prettier-ignore

  /** 段 4 を離れる（口・rAF を止め、部品を捨てる） */
  function closeSync(): void {
    if (sync === null) return
    stopPlayer()
    sync.panel.unmount()
    sync = null
  }

  /** 段 4 の行（次へ ＝ 保存できる結果があるとき、戻る、動画を使わない） */
  function nav4(): HTMLElement {
    const next = button(doc, '次へ', () => send({ kind: 'next' }), 'primary')
    next.disabled = !canNext(s)
    return h(doc, 'div', { className: 'btnrow' }, next, button(doc, '戻る', () => send({ kind: 'back' })), button(doc, '動画を使わない', () => send({ kind: 'skipVideo' }), 'ghost'))
  } // prettier-ignore

  async function doSave(): Promise<void> {
    const file = s.file
    if (file === null || !canSave(s) || built?.dup === 'bundled') return
    // 同期は withSync で載せる・外す（id と版は変わらない。動画を使わない回は sources 空）
    const chart = withSync(await chartFromSmf({ smf: file.smf, play: s.play, accomp: s.accomp, fold: s.fold, name: s.name, composer: s.composer, created: new Date().toISOString() }), s.sync)
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
    steps.replaceChildren(...importSteps(s).map((n) => h(doc, 'li', { className: n === s.step ? 'on' : n < s.step ? 'done' : '', text: STEP_NAMES[n] ?? '' })))
    if (s.step !== 4) closeSync()
    if (s.step === 4) {
      // 段 4 の部品は作り直さない（iframe を DOM の中で動かすと読み直す）。行だけ描き直す
      const st = sync ?? (sync = openSync())
      if (st === null) {
        body.replaceChildren(nav4())
        return
      }
      if (body.firstChild !== st.el) {
        body.replaceChildren(st.el, st.navSlot)
        if (s.videoId !== '' && port === null) mountSyncPlayer()
      }
      st.navSlot.replaceChildren(nav4())
      return
    }
    body.replaceChildren(...(s.step === 1 ? step1() : s.step === 2 ? step2() : s.step === 3 ? step3() : step5()))
  }

  render()
  return {
    root: f.root,
    bandSlot: f.bandSlot,
    // 段 4 の矩形を手順 3 の dev の assert へ（段 4 で iframe を置いている間だけ）
    get player() {
      return sync !== null && sync.wide ? sync.host : undefined
    },
    // 段 4 の Space（タップ）・Escape（中止）。タップの前に 1 回読み、時計の事象を先に部品へ
    onInput: (events) => {
      const st = sync
      if (s.step !== 4 || st === null) return
      if (events.some((e) => e.kind === 'role' && e.role === 'primary')) feedClock(performance.now())
      st.panel.onInput(events)
    },
    unmount: () => {
      alive = false
      stopPreview()
      closeSync()
    },
  }
} // prettier-ignore
