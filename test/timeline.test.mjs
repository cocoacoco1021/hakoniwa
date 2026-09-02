import { test } from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/config.js";
import { ForceField } from "../src/force-field.js";
import { MAT } from "../src/materials.js";
import { createRandom } from "../src/random.js";
import { Simulation } from "../src/simulation.js";
import {
  captureWorldState,
  restoreWorldState,
  TimelineHistory,
  TimelineStateError,
  WorldTimeline,
} from "../src/timeline.js";

/**
 * 決定的な盤面一式を作る。
 * 入力：盤面寸法と種 / 出力：simulation, random, forceField。
 */
function makeWorld(cols = 4, rows = 3, seed = 123) {
  const random = createRandom(seed);
  const forceField = new ForceField(cols, rows, {
    ...CONFIG.forces,
    moveChance: 1,
  });
  const simulation = new Simulation({
    cols,
    rows,
    random,
    physics: CONFIG.physics,
    creatures: CONFIG.creatures,
    forces: forceField,
  });
  return { simulation, random, forceField };
}

test("リングバッファは容量を超えると最古の履歴を上書きする", () => {
  const history = new TimelineHistory(3);
  history.record("A");
  history.record("B");
  history.record("C");
  history.record("D");

  assert.equal(history.size, 3);
  assert.deepEqual([history.get(0), history.get(1), history.get(2)], ["B", "C", "D"]);
  assert.equal(history.cursor, 2);
});

test("過去から記録すると未来を破棄して分岐する", () => {
  const history = new TimelineHistory(5);
  history.record("A");
  history.record("B");
  history.record("C");
  history.seek(1);

  history.record("B2");

  assert.equal(history.size, 3);
  assert.deepEqual([history.get(0), history.get(1), history.get(2)], ["A", "B", "B2"]);
});

test("盤面・乱数・重力・風・引力をまとめて復元する", () => {
  const world = makeWorld();
  world.simulation.spawn(1, 0, MAT.FIRE);
  world.forceField.gravity = { dx: -1, dy: 0 };
  world.forceField.paintWindSegment(0, 1, 2, 1, 0);
  world.forceField.addAttractor(3, 2);
  const snapshot = captureWorldState(world);

  world.simulation.clear();
  world.simulation.frame = 99;
  world.random();
  world.forceField.clear();
  world.forceField.gravity = { dx: 0, dy: -1 };
  restoreWorldState({ snapshot, ...world });

  assert.deepEqual(world.simulation.grid, snapshot.grid);
  assert.deepEqual(world.simulation.life, snapshot.life);
  assert.equal(world.simulation.frame, snapshot.frame);
  assert.equal(world.random.getState(), snapshot.randomState);
  assert.deepEqual(world.forceField.gravity, { dx: -1, dy: 0 });
  assert.deepEqual(world.forceField.attractors, [{ x: 3, y: 2 }]);
  assert.deepEqual(world.forceField.windX, snapshot.windX);
});

test("巻き戻し後は同じ未来を決定的に再計算できる", () => {
  const world = makeWorld(5, 5, 9876);
  world.simulation.spawn(2, 0, MAT.SAND);
  world.simulation.spawn(1, 4, MAT.WATER);
  world.simulation.spawn(3, 4, MAT.OIL);
  const snapshot = captureWorldState(world);

  for (let step = 0; step < 12; step++) world.simulation.step();
  const expected = captureWorldState(world);

  restoreWorldState({ snapshot, ...world });
  for (let step = 0; step < 12; step++) world.simulation.step();
  const replayed = captureWorldState(world);

  assert.deepEqual(replayed.grid, expected.grid);
  assert.deepEqual(replayed.life, expected.life);
  assert.deepEqual(replayed.facing, expected.facing);
  assert.equal(replayed.frame, expected.frame);
  assert.equal(replayed.randomState, expected.randomState);
});

test("異なる盤面サイズへの復元を拒否する", () => {
  const source = makeWorld(3, 3);
  const target = makeWorld(4, 4);
  const snapshot = captureWorldState(source);

  assert.throws(
    () => restoreWorldState({ snapshot, ...target }),
    TimelineStateError
  );
});

test("WorldTimelineは設定間隔ごとに記録し過去へ戻せる", () => {
  const world = makeWorld(3, 3);
  const timeline = new WorldTimeline({
    ...world,
    maxSnapshots: 4,
    captureIntervalSteps: 2,
  });
  timeline.captureNow();
  world.simulation.spawn(1, 0, MAT.SAND);
  world.simulation.step();
  assert.equal(timeline.captureIfDue(), false);
  world.simulation.step();
  assert.equal(timeline.captureIfDue(), true);

  timeline.seek(0);

  assert.equal(world.simulation.get(1, 0), MAT.EMPTY);
  assert.equal(timeline.isLatest(), false);
  assert.equal(timeline.branch(), true);
  assert.equal(timeline.size, 1);
});
