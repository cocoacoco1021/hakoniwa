// ドラゴンだけが1タップ1体になる入力規則を検証する。
import { test } from "node:test";
import assert from "node:assert/strict";

import { MAT } from "../src/materials.js";
import {
  paintMaterial,
  supportsContinuousPaint,
} from "../src/painting.js";

/** 配置座標を記録するSimulation互換オブジェクトを返す。 */
function makeSpawnRecorder() {
  const spawns = [];
  return {
    spawns,
    spawn: (x, y, materialId) => spawns.push({ x, y, materialId }),
  };
}

test("ドラゴンは筆半径に関係なく中心へ1体だけ配置する", () => {
  const recorder = makeSpawnRecorder();

  paintMaterial(recorder, 12, 8, 20, MAT.DRAGON);

  assert.deepEqual(recorder.spawns, [{ x: 12, y: 8, materialId: MAT.DRAGON }]);
});

test("通常素材は筆の範囲へ複数セル配置する", () => {
  const recorder = makeSpawnRecorder();

  paintMaterial(recorder, 2, 3, 1, MAT.SAND);

  assert.equal(recorder.spawns.length, 5);
});

test("ドラゴンだけはドラッグ中に連続配置しない", () => {
  assert.equal(supportsContinuousPaint(MAT.DRAGON), false);
  assert.equal(supportsContinuousPaint(MAT.SAND), true);
});
