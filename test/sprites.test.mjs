// 虫のドット絵ビットマップ展開（純粋関数）に対する単体テスト。
// 描画(DOM)には触れず、ビットマップ→色種別ごとの座標リストへの変換だけを検証する。
// 実行: node --test （falling-sand ディレクトリで）
import { test } from "node:test";
import assert from "node:assert/strict";

import { BUG_SPRITE, spritePixels } from "../src/sprites.js";

test("spritePixels は寸法をそのまま返す", () => {
  const px = spritePixels(BUG_SPRITE);
  assert.equal(px.width, 7);
  assert.equal(px.height, 7);
});

test("spritePixels は主色(B)と副色(D)を正しい数だけ拾う", () => {
  const px = spritePixels(BUG_SPRITE);
  // ビットマップ上の 'B' と 'D' の総数（透明 '.' は含めない）
  assert.equal(px.body.length, 24);
  assert.equal(px.dark.length, 11);
});

test("spritePixels は透明セルを座標に含めない", () => {
  const px = spritePixels(BUG_SPRITE);
  const has = (list, x, y) => list.some((p) => p.x === x && p.y === y);
  // (0,0) は '.'（透明）→ どちらのリストにも無い
  assert.ok(!has(px.body, 0, 0));
  assert.ok(!has(px.dark, 0, 0));
  // (2,0) は 'D'（頭）、(1,1) は 'B'（体）
  assert.ok(has(px.dark, 2, 0));
  assert.ok(has(px.body, 1, 1));
});

test("任意のビットマップでも B/D/透明を分類できる", () => {
  const px = spritePixels({ width: 3, height: 2, rows: ["B.D", ".B."] });
  assert.equal(px.width, 3);
  assert.equal(px.height, 2);
  assert.deepEqual(px.body, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(px.dark, [{ x: 2, y: 0 }]);
});
