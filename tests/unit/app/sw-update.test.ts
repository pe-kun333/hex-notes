import { describe, expect, it } from 'vitest'
import {
  INITIAL_UPDATE,
  updateStep,
  updateView,
  type UpdateEvent,
  type UpdateState,
} from '../../../src/app/sw-update.ts'

// src/app/sw-update.ts（M1-09、M1 の手順 13）。出どころ: ADR 0004（prompt。更新は S6 か結果画面で利用者が押したときだけ、
// プレイ中は入れ替えない）、m1-kickoff 手順 13（needRefresh を S6 と S3 の「更新」ボタンに）、decisions #64・#76。

const run = (...evs: UpdateEvent[]): UpdateState => evs.reduce(updateStep, INITIAL_UPDATE)

describe('更新の状態 updateStep', () => {
  it('初めの保存 → オフラインで遊べる。新しい版 → 待っている（保存は済んでいる）', () => {
    expect(run({ kind: 'offlineReady' })).toEqual({
      needRefresh: false,
      offlineReady: true,
      off: null,
    })
    expect(run({ kind: 'needRefresh' })).toEqual({
      needRefresh: true,
      offlineReady: true,
      off: null,
    })
    expect(run({ kind: 'offlineReady' }, { kind: 'needRefresh' })).toEqual(
      run({ kind: 'needRefresh' }),
    )
  })

  it('同じ事象は同じ物を返す（画面を描き直さない）。SW が動いた後の失敗の知らせは無視', () => {
    const a = run({ kind: 'offlineReady' })
    expect(updateStep(a, { kind: 'offlineReady' })).toBe(a)
    const w = run({ kind: 'needRefresh' })
    expect(updateStep(w, { kind: 'needRefresh' })).toBe(w)
    expect(updateStep(w, { kind: 'offlineReady' })).toBe(w)
    expect(updateStep(a, { kind: 'off', why: 'error' })).toBe(a)
    const off = run({ kind: 'off', why: 'dev' })
    expect(off.off).toBe('dev')
    expect(updateStep(off, { kind: 'off', why: 'dev' })).toBe(off)
    // 失敗の後に動けばそちらを正とする
    expect(updateStep(run({ kind: 'off', why: 'error' }), { kind: 'offlineReady' })).toEqual({
      needRefresh: false,
      offlineReady: true,
      off: null,
    })
  })
})

describe('画面の行 updateView', () => {
  it('新しい版: S6 と S3 の両方に「更新する」', () => {
    const s = run({ kind: 'needRefresh' })
    for (const where of ['S6', 'S3'] as const)
      expect(updateView(s, where)).toEqual({
        text: '新しい版があります。更新するとページを読み直します（記録と設定はそのまま）。',
        action: '更新する',
      })
  })

  it('新しい版が無いとき: S3 は出さず、S6 は今の状態だけ（釦なし）', () => {
    const cases: [UpdateState, string][] = [
      [INITIAL_UPDATE, 'オフライン用に保存しています…'],
      [run({ kind: 'offlineReady' }), 'オフラインで遊べます（同梱曲は端末に保存済み）。'],
      [run({ kind: 'off', why: 'dev' }), '開発サーバーでは Service Worker を使いません（オフラインと更新は build で確かめます）。'],
      [run({ kind: 'off', why: 'unsupported' }), 'このブラウザは Service Worker を使えないので、オフラインでは遊べません。'],
      [run({ kind: 'off', why: 'error' }), 'オフライン用の保存を始められませんでした（ブラウザの設定か、プライベートウィンドウ）。'],
    ]
    for (const [s, text] of cases) {
      expect(updateView(s, 'S3')).toBe(null)
      expect(updateView(s, 'S6')).toEqual({ text, action: null })
    }
  }) // prettier-ignore
})
