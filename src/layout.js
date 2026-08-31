// 画面サイズから論理グリッドの列数・行数を決める純粋関数。
// 表示解像度に応じて解像度を上げつつ、総セル数の上限で負荷を抑える。

/**
 * 画面サイズと設定から {cols, rows} を算出する。
 * 入力：viewportW, viewportH（px）, options{ targetCellPx, minCols, maxCells }
 * 出力：{ cols, rows }（ともに1以上の整数）
 * 画面比を保ったまま、目標セルサイズで列数を決め、総セル数が上限を超えたら
 * 縦横を等倍で縮めて上限に収める（アスペクト比は維持）。
 */
export function computeGrid(viewportW, viewportH, options) {
  const { targetCellPx, minCols, maxCells } = options;

  // 目標セルサイズから列数を出し、下限を割らないようにする
  const rawCols = Math.max(minCols, Math.round(viewportW / targetCellPx));
  // 画面比から行数を出す（0除算と0行を防ぐため下限1）
  const aspect = viewportH / Math.max(1, viewportW);
  let cols = rawCols;
  let rows = Math.max(1, Math.round(cols * aspect));

  // 総セル数が上限を超えたら、面積比の平方根で縦横を等倍縮小する
  const total = cols * rows;
  if (total > maxCells) {
    const scale = Math.sqrt(maxCells / total);
    cols = Math.max(1, Math.floor(cols * scale));
    rows = Math.max(1, Math.floor(rows * scale));
  }

  return { cols, rows };
}
