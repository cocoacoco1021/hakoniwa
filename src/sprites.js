// 生きもの（虫）のドット絵（ビットマップ）定義と、その展開ロジック。
// シミュレーションでは虫は1セルだが、見た目は「粉の1ドット」ではなく
// 数セル分に拡大したドット絵の甲虫として描く。ここは描画(DOM)から切り離し、
// ビットマップ→ピクセル座標への展開だけを純粋関数として単体テスト可能にする。

// 上から見た甲虫のドット絵。'.'=透明 / 'B'=主色(体) / 'D'=副色(頭・脚・斑)。
// 左右対称なので個体の向き（ヘディング）を持たなくても自然に見える。
export const BUG_SPRITE = {
  width: 7,
  height: 7,
  rows: [
    "..DDD..",
    ".BBBBB.",
    "DBDBDBD",
    ".BBBBB.",
    "DBDBDBD",
    ".BBBBB.",
    "..BBB..",
  ],
};

/**
 * ドット絵ビットマップを、色種別ごとのピクセル座標リストへ展開する純粋関数。
 * 入力：sprite { width, height, rows: string[] }（'B'=主色 / 'D'=副色 / それ以外=透明）
 * 出力：{ width, height, body: [{x,y}], dark: [{x,y}] }
 * 役割：描画層（overlay）が色を塗る対象を、DOM非依存で組み立て可能にする。
 */
export function spritePixels(sprite) {
  const body = [];
  const dark = [];
  for (let y = 0; y < sprite.height; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.width; x++) {
      const cell = row[x];
      if (cell === "B") body.push({ x, y });
      else if (cell === "D") dark.push({ x, y });
      // それ以外（'.'）は透明としてスキップ
    }
  }
  return { width: sprite.width, height: sprite.height, body, dark };
}
