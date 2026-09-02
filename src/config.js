// 調整用の定数を一箇所に集約する（マジックナンバーのハードコードを避ける）。
// 挙動・見た目のチューニングは基本ここだけ触れば済むようにしている。
export const CONFIG = {
  // 論理グリッドの解像度は起動時の画面サイズから layout.js で算出する。
  // ここでは「1セルあたり何px相当を狙うか」と安全上限だけを持つ。
  grid: {
    targetCellPx: 5, // 1セルの目標表示サイズ(px)。小さいほど高精細だが重くなる
    minCols: 90, // 最低列数（極端に粗くならない下限）
    maxCells: 48000, // 総セル数の上限（CPUシミュレーションの負荷天井）
  },
  // 筆（ブラシ）の設定。ポインタでセルを塗る半径など。
  brush: {
    radius: 4, // 既定の筆半径（セル数）
    minRadius: 1,
    maxRadius: 20,
  },
  // 各反応の発生確率・寿命。すべて1フレーム(1ステップ)あたりの値。
  // 乱数は simulation に注入するので、テストでは決定的に差し替えられる。
  physics: {
    fireLife: 70, // 火の寿命（フレーム）。0になると煙/消滅へ
    smokeLife: 90, // 煙の寿命
    steamLife: 130, // 蒸気の寿命
    lifeJitter: 0.4, // 寿命の±ゆらぎ割合（生成時に見た目を散らす）
    igniteChance: 0.22, // 火/溶岩が隣接する可燃物へ着火する確率
    fireToSmokeChance: 0.35, // 火が寿命を終えたとき煙になる確率（残りは消滅）
    steamCondenseChance: 0.02, // 蒸気が寿命を終えたとき水に戻る確率
    plantGrowChance: 0.05, // 植物が隣接する水へ成長する確率
    acidDissolveChance: 0.25, // 酸が隣接する可溶物を溶かす確率
    acidConsumeChance: 0.35, // 溶かした酸自身が消費されて消える確率
    lavaMoveChance: 0.35, // 溶岩が動く確率（1未満で粘性の高い流れに見せる）
    lavaSmokeChance: 0.04, // 溶岩が真上へ煙を噴く確率
    extinguishChance: 0.5, // 火が隣の水で消える確率（水は蒸気になる）
  },
  // 生きもの（虫）の生態パラメータ。エネルギーは life 配列に格納する（単位はフレーム相当）。
  // 生態系ループ（植物→採餌→繁殖→餌枯れ→餓死→植物再生）のバランスをここで調整する。
  creatures: {
    bugStartEnergy: 240, // 生成時／出生時のエネルギー。0になると餓死する
    bugMaxEnergy: 480, // エネルギー上限（食べ過ぎの頭打ち）
    bugEatEnergy: 160, // 植物を1つ食べて回復する量
    bugReproEnergy: 360, // これ以上のエネルギーで繁殖を試みる
    bugReproCost: 220, // 繁殖で親が失うエネルギー
    bugReproChance: 0.1, // 条件を満たしたとき実際に繁殖する確率
    bugSenseRadius: 6, // 餌・危険を感知する範囲（セル）
    bugDigChance: 0.3, // 進路上の砂を掘って進む確率（粘りの表現）
    bugMoveChance: 0.65, // 徘徊で実際に1歩動く確率（せかせか感の調整）
    dragonMoveChance: 0.08, // ドラゴンが接地中に左右へ1歩動く確率（ゆっくり歩かせる）
    dragonFireChance: 0.006, // 左方向へ火を吐く確率（平均数秒に1回程度）
    dragonFireRange: 4, // 火炎が届くセル数。壁や不燃素材で止まる
  },
  render: {
    background: 0x0b0d12, // 空セル（背景）の色
    glowStrength: 0.9, // 発光素材(火/溶岩)のにじみ強度（WebGL2経路のみ）
    glowRadius: 1.7, // グローのサンプル半径（テクセル単位）
    cellJitter: 0.14, // 非発光素材の明度ゆらぎ（のっぺり感を抑える）
    bugSpriteCells: 3, // 虫のドット絵が占める画面上のセル数（1セルの個体を数セル分へ拡大表示）
    bugSpriteDark: 0x7a0f3d, // 虫のドット絵の副色（頭・脚・斑）。体色より暗い赤紫で、体上でも背景上でも視認できる
    dragonSpriteCells: 12, // 添付画像のドラゴンを大きな1個体として表示するセル数
    dragonBackgroundThreshold: 24, // JPEGの黒背景を透明とみなすRGB上限
  },
};
