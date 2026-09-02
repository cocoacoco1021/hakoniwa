// 物理反応と音響モジュールの境界で、必要な3種類のイベントが通知されることを検証する。
import { test } from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/config.js";
import { MAT } from "../src/materials.js";
import { REACTION } from "../src/reactions.js";
import { Simulation } from "../src/simulation.js";

/**
 * 反応記録付きのテスト用Simulationを作る。
 * 入力：グリッド寸法 / 出力：{ sim, events }。
 */
function makeReactionSim(cols, rows) {
  const events = [];
  const reactions = {
    emit: (type, x, y, intensity) => events.push({ type, x, y, intensity }),
  };
  const sim = new Simulation({
    cols,
    rows,
    random: () => 0,
    physics: CONFIG.physics,
    creatures: CONFIG.creatures,
    reactions,
  });
  return { sim, events };
}

test("火が油へ着火すると着火イベントを通知する", () => {
  const { sim, events } = makeReactionSim(2, 1);
  sim.spawn(0, 0, MAT.FIRE);
  sim.spawn(1, 0, MAT.OIL);

  sim.step();

  assert.deepEqual(events, [
    { type: REACTION.IGNITION, x: 1, y: 0, intensity: 1 },
  ]);
});

test("蒸気が水へ戻ると結露イベントを通知する", () => {
  const { sim, events } = makeReactionSim(1, 1);
  sim.spawn(0, 0, MAT.STEAM);
  sim.life[sim.index(0, 0)] = 1;

  sim.step();

  assert.equal(sim.get(0, 0), MAT.WATER);
  assert.deepEqual(events, [
    { type: REACTION.CONDENSATION, x: 0, y: 0, intensity: 1 },
  ]);
});

test("酸が砂を溶かすと溶解イベントを通知する", () => {
  const { sim, events } = makeReactionSim(2, 1);
  sim.spawn(0, 0, MAT.ACID);
  sim.spawn(1, 0, MAT.SAND);

  sim.step();

  assert.deepEqual(events, [
    { type: REACTION.DISSOLUTION, x: 1, y: 0, intensity: 1 },
  ]);
});
