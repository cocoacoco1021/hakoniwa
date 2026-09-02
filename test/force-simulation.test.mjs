// 回転重力と描画した力場が、動的素材へ作用し静的素材を動かさないことを検証する。
import { test } from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/config.js";
import { ForceField } from "../src/force-field.js";
import { MAT } from "../src/materials.js";
import { Simulation } from "../src/simulation.js";

/**
 * 力場付きのテスト用Simulationを作る。
 * 入力：グリッド寸法・ForceField / 出力：確率判定が必ず通るSimulation。
 */
function makeSim(cols, rows, forces) {
  return new Simulation({
    cols,
    rows,
    forces,
    random: () => 0,
    physics: CONFIG.physics,
    creatures: CONFIG.creatures,
  });
}

test("重力を左へ回すと砂は左へ落ちる", () => {
  const forces = new ForceField(4, 3);
  forces.gravity = { dx: -1, dy: 0 };
  const sim = makeSim(4, 3, forces);
  sim.spawn(2, 1, MAT.SAND);

  sim.step();

  assert.equal(sim.get(1, 1), MAT.SAND);
  assert.equal(sim.get(2, 1), MAT.EMPTY);
});

test("重力を左へ回すと煙は反対の右へ昇る", () => {
  const forces = new ForceField(3, 1);
  forces.gravity = { dx: -1, dy: 0 };
  const sim = makeSim(3, 1, forces);
  sim.spawn(1, 0, MAT.SMOKE);

  sim.step();

  assert.equal(sim.get(2, 0), MAT.SMOKE);
  assert.equal(sim.get(1, 0), MAT.EMPTY);
});

test("描いた風は砂・虫・ドラゴンを風下へ動かす", () => {
  for (const material of [MAT.SAND, MAT.BUG, MAT.DRAGON]) {
    const forces = new ForceField(3, 1, { moveChance: 1 });
    forces.paintWindSegment(0, 0, 1, 0, 0);
    const sim = makeSim(3, 1, forces);
    sim.spawn(0, 0, material);

    sim.step();

    assert.equal(sim.get(1, 0), material);
    assert.equal(sim.get(0, 0), MAT.EMPTY);
  }
});

test("描いた風は壁・木・植物を動かさない", () => {
  for (const material of [MAT.WALL, MAT.WOOD, MAT.PLANT]) {
    const forces = new ForceField(3, 1, { moveChance: 1 });
    forces.paintWindSegment(0, 0, 1, 0, 0);
    const sim = makeSim(3, 1, forces);
    sim.spawn(0, 0, material);

    sim.step();

    assert.equal(sim.get(0, 0), material);
    assert.equal(sim.get(1, 0), MAT.EMPTY);
  }
});

test("引力点は範囲内の水を引力点へ近づける", () => {
  const forces = new ForceField(5, 1, {
    moveChance: 1,
    attractionRadius: 5,
  });
  forces.addAttractor(4, 0);
  const sim = makeSim(5, 1, forces);
  sim.spawn(0, 0, MAT.WATER);

  sim.step();

  assert.equal(sim.get(1, 0), MAT.WATER);
  assert.equal(sim.get(0, 0), MAT.EMPTY);
});
