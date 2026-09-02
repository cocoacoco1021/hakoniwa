// 生きもの画像の通常描画と右向き反転を、Canvasへ依存せず検証する。
import { test } from "node:test";
import assert from "node:assert/strict";

import { drawCreatureSprite } from "../src/overlay.js";

/**
 * 描画APIの呼び出しを記録するテスト用コンテキストを作る。
 * 入力：なし / 出力：{ ctx, calls }
 */
function makeRecordingContext() {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    ctx: {
      drawImage: record("drawImage"),
      restore: record("restore"),
      save: record("save"),
      scale: record("scale"),
      translate: record("translate"),
    },
  };
}

test("左向きは元画像をそのまま描く", () => {
  const { ctx, calls } = makeRecordingContext();
  const sprite = {};

  drawCreatureSprite(ctx, sprite, 10, 20, 6, 8);

  assert.deepEqual(calls, [["drawImage", sprite, 10, 20, 6, 8]]);
});

test("右向きは表示位置を保ったまま画像を左右反転する", () => {
  const { ctx, calls } = makeRecordingContext();
  const sprite = {};

  drawCreatureSprite(ctx, sprite, 10, 20, 6, 8, true);

  assert.deepEqual(calls, [
    ["save"],
    ["translate", 16, 20],
    ["scale", -1, 1],
    ["drawImage", sprite, 0, 0, 6, 8],
    ["restore"],
  ]);
});
