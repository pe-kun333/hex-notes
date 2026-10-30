// 時計層の型（M0-05、手順 7）。出どころ: design.md §2.6・§4.1、decisions #11・#32〜#34（仮）、相談 C（案 A-2・C-2）。
// M3 の YouTube 連携層と開発ページ・ダミー動画がここから import する。時刻は全て ms（動画の秒は標本を作る側で ms にする）。

/** 動画の状態（IFrame の PlayerState を小文字にした物。ダミー動画も同じ値を返す） */
export type VideoState = 'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended' | 'cued'

/**
 * 動画の 1 回の読み（毎フレーム 1 つ。動画が無い・まだ作られていないときは null を渡す）。
 * timeMs は getCurrentTime() × 1000 を丸めずに（動画の軸。拍 0 の換算は map.ts の toChartMs）。rate は再生レート
 * （テンポ段。getPlaybackRate）。visible は文書が表示中か（非表示中は停止検知しない、§2.6）。pauseFailed は
 * 時計の pauseVideo 要求を YouTube 層が呼べなかった（例外・プレイヤーが無い）ときだけ true（相談 C の ok:false）。
 * timeMs と rate は有限の値（rate は正）。そうでない標本（getCurrentTime が準備前に undefined を返した等）は、読みの無い
 * tick（null）と同じに扱う。
 */
export interface VideoSample {
  state: VideoState
  timeMs: number
  rate: number
  visible: boolean
  pauseFailed?: boolean
}

/** 時計の源。video ＝ 動画の読みで補正する、novideo ＝ performance.now 単独（S2A・S7c の後） */
export type ClockMode = 'video' | 'novideo'

/**
 * 時計の相（decisions #33）。stopped ＝ 利用者の一時停止・開始前（t は止まる）、held ＝ 動画が PLAYING でない
 * （止まる。PLAYING で再アンカー）、grace ＝ 再アンカーから 300 ms（判定を保留）、locked ＝ 通常、pauseReq ＝ 停止検知で
 * pauseVideo を要求して結果を待つ 500 ms、ad ＝ 要求が効かず広告中とみなす（t は止まる）。novideo の時計は
 * stopped・grace・locked だけを通る。
 */
export type ClockPhase = 'stopped' | 'held' | 'grace' | 'locked' | 'pauseReq' | 'ad'

/**
 * 再アンカーの理由。start・resume・seek・return は命令、rate は再生レートの変更（動画の onPlaybackRateChange か
 * 動画なしのテンポ段）、jump は飛び、unheld は PAUSED・BUFFERING から PLAYING への復帰、adEnd は広告明け、fallback は
 * 止めていた t（広告中・held）から動画なしで走り出した（S7c）。再アンカーの直後（読みがまだ変わらない間）に
 * BUFFERING を挟んだときは、PLAYING での再アンカーも同じ理由にする。計測の再同期回数（resyncCount）は動画の側の
 * 飛び・復帰・広告明け（jump・unheld・adEnd）だけを数え、rate と fallback は数えない（動画のレートの変更はテンポ段の
 * 切替と区別できない。fallback は計測の fallback で数える。decisions #32 (f)、仮）。
 */
export type ResyncReason =
  'start' | 'resume' | 'seek' | 'rate' | 'return' | 'jump' | 'unheld' | 'adEnd' | 'fallback'

/** t ＝ a·perf ＋ b（ms）。a ＝ 0 は止まった時計（t ＝ b） */
export interface ClockMap {
  a: number
  b: number
}

/** 時計の事象（1 tick・1 命令に 0 個以上） */
export type ClockEvent =
  /** 再アンカー。t はその時の値、nominal は猶予の間の名目の写像（傾き ＝ 再生レート。skipped の判定に使う） */
  | {
      kind: 'resync'
      reason: ResyncReason
      t: number
      graceUntil: number
      nominal: ClockMap
      /** jump のときの期待値との差 */
      devMs?: number
    }
  | { kind: 'graceEnd' }
  /** 停止検知（可視・PLAYING で 2 秒凍結）。requests に pauseVideo が載る */
  | { kind: 'stall'; t: number }
  | { kind: 'adSuspected'; t: number }
  /** 動画なしへ切り替えた（S7c）。t はその時の値（動画の軸） */
  | { kind: 'novideo'; t: number }
  /**
   * 動画が PLAYING でなくなった（held の間に状態が変わったときも出す）。late ＝ 停止検知の要求を待つ間（pauseReq・
   * 広告中）に、要求から 500 ms を過ぎて来た PAUSED（相談 C の遅い PAUSED）
   */
  | { kind: 'held'; state: VideoState; late: boolean }

/** 動画への要求（YouTube 連携層が呼ぶ。プログラムからの pause／seek／play は 3 用途だけ、decisions #11・#35） */
export type VideoRequest =
  | { kind: 'pauseVideo'; why: 'user' | 'stall' }
  | { kind: 'playVideo' }
  | { kind: 'seekTo'; t: number }

/** 時計への命令（decisions #32 (b)。tick とは別の関数で、入力のハンドラの now で効かせる） */
export type ClockCommand =
  | { kind: 'start' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'seek'; t: number }
  | { kind: 'setRate'; rate: number }
  | { kind: 'return' }

/** tick・命令の出力 */
export interface ClockOutput {
  /** この now での値（動画の軸の ms。単調の床・β·q̂ を含む） */
  t: number
  /** 次の tick まで有効な写像（床を含まない。songAt・perfAt で過去・未来を行き来する） */
  map: ClockMap
  mode: ClockMode
  phase: ClockPhase
  events: ClockEvent[]
  requests: VideoRequest[]
  /** 「戻す」が押せるか（novideo で、動画の読みが 2,000 ms 未満の間に変わった） */
  canReturn: boolean
  /** この tick に受け入れた標本の、更新前の当てはめの線との差（ms）。無ければ null（計測の時計残差） */
  dev: number | null
  /**
   * 量子化の補正に使う実効の刻み（ms。√12·残差 SD で、読みの刻みと「tick の間隔×再生レート」の小さい方に近い。
   * 0 は補正なし。decisions #33 (c)）
   */
  qHat: number
}
