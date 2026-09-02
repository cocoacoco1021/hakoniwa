// ドラゴンの移動・火炎・耐火性を、決定的な乱数で検証する。
import { test } from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/config.js";
import { MATERIALS, MAT } from "../src/materials.js";
import { DRAGON_FACING, Simulation } from "../src/simulation.js";

/**
 * テスト用のドラゴン設定を持つSimulationを作る。
 * 入力：グリッド寸法・設定・乱数の上書き / 出力：決定的に動かせるSimulation。
 */
function makeDragonSim(cols, rows, creatures = {}, physics = {}, random = () => 0) {
  return new Simulation({
    cols,
    rows,
    random,
    physics: { ...CONFIG.physics, ...physics },
    creatures: {
      ...CONFIG.creatures,
      dragonMoveChance: 0,
      dragonFireChance: 0,
      ...creatures,
    },
  });
}

test("ドラゴンは空中から1セル落下する", () => {
  const sim = makeDragonSim(3, 3);
  sim.spawn(1, 0, MAT.DRAGON);

  sim.step();

  assert.equal(sim.get(1, 0), MAT.EMPTY);
  assert.equal(sim.get(1, 1), MAT.DRAGON);
});

test("ドラゴンは接地中に左へ設定距離の火を吐く", () => {
  const sim = makeDragonSim(5, 1, {
    dragonFireChance: 1,
    dragonFireRange: 3,
  });
  sim.spawn(4, 0, MAT.DRAGON);

  sim.step();

  assert.equal(sim.get(4, 0), MAT.DRAGON);
  assert.equal(sim.get(3, 0), MAT.FIRE);
  assert.equal(sim.get(2, 0), MAT.FIRE);
  assert.equal(sim.get(1, 0), MAT.FIRE);
  assert.equal(sim.get(0, 0), MAT.EMPTY);
  assert.equal(sim.facing[sim.index(4, 0)], DRAGON_FACING.LEFT);
});

test("ドラゴンは右へ歩くと右を向き、次の火炎も右へ吐く", () => {
  const sim = makeDragonSim(
    5,
    1,
    { dragonMoveChance: 1 },
    {},
    () => 0.75
  );
  sim.spawn(1, 0, MAT.DRAGON);

  sim.step();

  assert.equal(sim.get(2, 0), MAT.DRAGON);
  assert.equal(sim.facing[sim.index(2, 0)], DRAGON_FACING.RIGHT);

  sim.creatures.dragonMoveChance = 0;
  sim.creatures.dragonFireChance = 1;
  sim.creatures.dragonFireRange = 2;
  sim.random = () => 0;
  sim.step();

  assert.equal(sim.get(3, 0), MAT.FIRE);
  assert.equal(sim.get(4, 0), MAT.FIRE);
  assert.equal(sim.get(1, 0), MAT.EMPTY);
});

test("ドラゴンの火炎は壁を貫通しない", () => {
  const sim = makeDragonSim(5, 1, {
    dragonFireChance: 1,
    dragonFireRange: 4,
  });
  sim.spawn(4, 0, MAT.DRAGON);
  sim.spawn(2, 0, MAT.WALL);

  sim.step();

  assert.equal(sim.get(3, 0), MAT.FIRE);
  assert.equal(sim.get(2, 0), MAT.WALL);
  assert.equal(sim.get(1, 0), MAT.EMPTY);
});

test("ドラゴンの火炎は水を蒸気に変えて止まる", () => {
  const sim = makeDragonSim(4, 1, {
    dragonFireChance: 1,
    dragonFireRange: 3,
  });
  sim.spawn(3, 0, MAT.DRAGON);
  sim.spawn(2, 0, MAT.WATER);
  sim.spawn(1, 0, MAT.WALL);

  sim.step();

  assert.equal(sim.get(2, 0), MAT.STEAM);
  assert.equal(sim.get(1, 0), MAT.WALL);
  assert.equal(sim.get(0, 0), MAT.EMPTY);
});

test("ドラゴンは火と溶岩に触れても残る", () => {
  const sim = makeDragonSim(3, 1, {}, {
    igniteChance: 1,
    lavaMoveChance: 0,
    lavaSmokeChance: 0,
  });
  sim.spawn(0, 0, MAT.FIRE);
  sim.spawn(1, 0, MAT.DRAGON);
  sim.spawn(2, 0, MAT.LAVA);

  sim.step();

  assert.equal(sim.get(1, 0), MAT.DRAGON);
  assert.equal(MATERIALS[MAT.DRAGON].flammable, false);
});
