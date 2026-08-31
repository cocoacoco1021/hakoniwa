// computeGrid の解像度算出に対する単体テスト。
// 実行: node --test （falling-sand ディレクトリで）
import { test } from "node:test";
import assert from "node:assert/strict";

import { computeGrid } from "../src/layout.js";

const options = { targetCellPx: 5, minCols: 90, maxCells: 48000 };

test("目標セルサイズから列数を出し、画面比で行数を決める", () => {
  const { cols, rows } = computeGrid(1000, 500, options);
  assert.equal(cols, 200); // 1000 / 5
  assert.equal(rows, 100); // 200 * (500/1000)
});

test("最低列数を下回らない", () => {
  const { cols } = computeGrid(200, 400, options);
  assert.ok(cols >= options.minCols);
});

test("総セル数の上限を超えない（超える場合は縦横を等倍縮小）", () => {
  const { cols, rows } = computeGrid(4000, 2000, options);
  assert.ok(cols * rows <= options.maxCells);
  // アスペクト比（縦/横）が概ね保たれている（2:1 → 約0.5）
  assert.ok(Math.abs(rows / cols - 0.5) < 0.05);
});

test("縦長（スマホ）でも行数が列数を上回る", () => {
  const { cols, rows } = computeGrid(400, 800, options);
  assert.ok(rows > cols);
});
