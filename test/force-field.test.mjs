import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ForceField,
  gravityArrow,
  gravityBasis,
  rotateGravityClockwise,
} from "../src/force-field.js";

test("重力は時計回りに90度ずつ回転する", () => {
  let gravity = { dx: 0, dy: 1 };
  const arrows = [];
  for (let i = 0; i < 4; i++) {
    gravity = rotateGravityClockwise(gravity);
    arrows.push(gravityArrow(gravity));
  }

  assert.deepEqual(arrows, ["←", "↑", "→", "↓"]);
});

test("重力基準の右方向は重力を回しても直交する", () => {
  const basis = gravityBasis({ dx: -1, dy: 0 });

  assert.deepEqual(basis.down, { dx: -1, dy: 0 });
  assert.deepEqual(basis.up, { dx: 1, dy: 0 });
  assert.deepEqual(basis.right, { dx: 0, dy: 1 });
});

test("風はドラッグ方向を区間全体へ描く", () => {
  const field = new ForceField(8, 4);

  field.paintWindSegment(1, 2, 5, 2, 0);

  for (let x = 1; x <= 5; x++) {
    assert.deepEqual(field.vectorAt(x, 2), { dx: 1, dy: 0, strength: 1 });
  }
});

test("引力は範囲内のセルを引力点へ向ける", () => {
  const field = new ForceField(20, 10, { attractionRadius: 10 });
  field.addAttractor(10, 5);

  const vector = field.vectorAt(4, 5);

  assert.equal(vector.dx, 1);
  assert.equal(vector.dy, 0);
  assert.ok(vector.strength > 0);
});

test("場消しは指定範囲の風と引力点だけを消す", () => {
  const field = new ForceField(12, 5);
  field.paintWindSegment(1, 2, 8, 2, 0);
  field.addAttractor(3, 2);
  field.addAttractor(9, 2);

  field.erase(3, 2, 1);

  assert.equal(field.windX[field.index(3, 2)], 0);
  assert.deepEqual(field.attractors, [{ x: 9, y: 2 }]);
});
