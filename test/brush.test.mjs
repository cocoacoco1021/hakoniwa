// forEachBrushCell の当たり判定に対する単体テスト。
// 実行: node --test （falling-sand ディレクトリで）
import { test } from "node:test";
import assert from "node:assert/strict";

import { forEachBrushCell } from "../src/brush.js";

/** コールバックで列挙されたセル座標を配列に集める補助 */
function collect(cx, cy, radius) {
  const cells = [];
  forEachBrushCell(cx, cy, radius, (x, y) => cells.push([x, y]));
  return cells;
}

test("半径0では中心1セルだけを列挙する", () => {
  const cells = collect(5, 5, 0);
  assert.deepEqual(cells, [[5, 5]]);
});

test("半径1では十字（中心＋上下左右）の5セルを列挙する", () => {
  const cells = collect(0, 0, 1);
  assert.equal(cells.length, 5);
  // 角(±1,±1)は距離√2で半径1の外側なので含まれない
  assert.ok(!cells.some(([x, y]) => Math.abs(x) === 1 && Math.abs(y) === 1));
});

test("列挙されるセルはすべて中心からの距離が半径以内", () => {
  const radius = 4;
  const cells = collect(10, 10, radius);
  for (const [x, y] of cells) {
    const dx = x - 10;
    const dy = y - 10;
    assert.ok(dx * dx + dy * dy <= radius * radius);
  }
  // 円なので中心は必ず含む
  assert.ok(cells.some(([x, y]) => x === 10 && y === 10));
});
