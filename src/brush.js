// 筆（ブラシ）の当たり判定を担う純粋関数。
// 円形の内側にあるセル座標を列挙するだけに責務を絞る（塗る操作自体は呼び出し側）。

/**
 * 中心(cx,cy)・半径radius の円内にあるセル座標をコールバックへ渡す。
 * 入力：cx, cy（中心セル座標）, radius（セル数, 0以上）, callback(x, y)
 * 出力：なし
 * 円の内側判定は「中心からの距離の二乗 <= 半径の二乗」。範囲外セルも渡すため、
 * 実際に書き込むかどうか（境界チェック）は呼び出し側の責務とする。
 */
export function forEachBrushCell(cx, cy, radius, callback) {
  const r = Math.max(0, Math.floor(radius));
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r2) callback(cx + dx, cy + dy);
    }
  }
}
