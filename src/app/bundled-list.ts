// 同梱曲の一覧（生成物。手で書かない: npm run charts:bundle が tools/charts/bundle-songs.ts の BUNDLE_SONGS から書き、
// charts:bundle:check が照合する。M4 の手順 3、decisions #122）。file は content/charts/ からの相対（.json なし）、
// name は譜面の name。src/app/songs.ts の BUNDLED_SONGS が読む。

export const BUNDLED_LIST: readonly (readonly [string, string])[] = [
  ['tutorial/hajime', 'はじめの六角'],
  ['pd/twinkle', 'きらきら星'],
  ['pd/ode', '歓喜の歌'],
]
