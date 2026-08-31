// Simulation の物理・化学ルールに対する単体テスト。
// 依存なしで動かすため Node 標準の node:test / node:assert のみを使う。
// 乱数は決定的な関数を注入し、確率的な反応を再現可能にする。
// 実行: node --test （falling-sand ディレクトリで）
import { test } from "node:test";
import assert from "node:assert/strict";

import { Simulation } from "../src/simulation.js";
import { MAT } from "../src/materials.js";
import { CONFIG } from "../src/config.js";

// 常に同じ値を返す乱数（確率判定を確定させる）
const constRandom = (value) => () => value;

/** テスト用の Simulation を作る（乱数は固定値、physics は本番設定を流用） */
function makeSim(cols, rows, randomValue = 0.5) {
  return new Simulation({
    cols,
    rows,
    random: constRandom(randomValue),
    physics: CONFIG.physics,
  });
}

test("砂は下が空なら1セル落ちる", () => {
  const sim = makeSim(3, 3);
  sim.spawn(1, 0, MAT.SAND);
  sim.step();
  assert.equal(sim.get(1, 1), MAT.SAND);
  assert.equal(sim.get(1, 0), MAT.EMPTY);
});

test("砂は床（グリッド下端）で止まる", () => {
  const sim = makeSim(3, 3);
  sim.spawn(1, 2, MAT.SAND); // 最下行
  sim.step();
  assert.equal(sim.get(1, 2), MAT.SAND);
});

test("砂は壁を貫通しない", () => {
  const sim = makeSim(1, 2);
  sim.spawn(0, 0, MAT.SAND);
  sim.spawn(0, 1, MAT.WALL);
  sim.step();
  assert.equal(sim.get(0, 0), MAT.SAND);
  assert.equal(sim.get(0, 1), MAT.WALL);
});

test("砂は水より重いので水中へ沈む（密度で入れ替わる）", () => {
  const sim = makeSim(1, 2);
  sim.spawn(0, 0, MAT.SAND);
  sim.spawn(0, 1, MAT.WATER);
  sim.step();
  assert.equal(sim.get(0, 1), MAT.SAND);
  assert.equal(sim.get(0, 0), MAT.WATER);
});

test("油は水より軽いので水の上へ浮く（密度分離）", () => {
  const sim = makeSim(1, 2);
  sim.spawn(0, 0, MAT.WATER);
  sim.spawn(0, 1, MAT.OIL);
  sim.step();
  assert.equal(sim.get(0, 1), MAT.WATER);
  assert.equal(sim.get(0, 0), MAT.OIL);
});

test("水は行き場がなければ横へ広がる", () => {
  // 3x2。最下行中央に水を置くと、下・斜め下が塞がり横流れする
  const sim = makeSim(3, 2, 0.4); // 0.4<0.5 → まず左を試す
  sim.spawn(1, 1, MAT.WATER);
  sim.step();
  assert.equal(sim.get(1, 1), MAT.EMPTY);
  assert.equal(sim.get(0, 1), MAT.WATER);
});

test("火は隣接する油へ着火する", () => {
  const sim = makeSim(3, 3, 0); // 0 < igniteChance → 必ず着火
  sim.spawn(0, 0, MAT.FIRE);
  sim.spawn(1, 0, MAT.OIL);
  sim.step();
  assert.equal(sim.get(1, 0), MAT.FIRE);
});

test("火は隣の水で消え、水は蒸気になる", () => {
  const sim = makeSim(3, 3, 0); // 0 < extinguishChance → 必ず消火
  sim.spawn(0, 0, MAT.FIRE);
  sim.spawn(1, 0, MAT.WATER);
  sim.step();
  assert.equal(sim.get(1, 0), MAT.STEAM);
  assert.equal(sim.get(0, 0), MAT.SMOKE);
});

test("溶岩は水に触れると固化し（壁）、水は蒸気になる", () => {
  const sim = makeSim(3, 3, 0);
  sim.spawn(0, 0, MAT.LAVA);
  sim.spawn(1, 0, MAT.WATER);
  sim.step();
  assert.equal(sim.get(0, 0), MAT.WALL);
  assert.equal(sim.get(1, 0), MAT.STEAM);
});

test("気体（煙）は上昇する", () => {
  const sim = makeSim(3, 3, 0.5);
  sim.spawn(1, 2, MAT.SMOKE);
  sim.step();
  assert.equal(sim.get(1, 1), MAT.SMOKE);
  assert.equal(sim.get(1, 2), MAT.EMPTY);
});

test("植物は隣接する水へ成長する", () => {
  // 乱数0 → 成長判定を通し、近傍index0（上）を選ぶ。上に水を置く。
  const sim = makeSim(1, 2, 0);
  sim.spawn(0, 0, MAT.WATER);
  sim.spawn(0, 1, MAT.PLANT);
  sim.step();
  assert.equal(sim.get(0, 0), MAT.PLANT);
});

test("酸は隣接する砂を溶かし、自身も消費される", () => {
  const sim = makeSim(3, 3, 0);
  sim.spawn(0, 0, MAT.ACID);
  sim.spawn(1, 0, MAT.SAND);
  sim.step();
  assert.equal(sim.get(1, 0), MAT.EMPTY);
});

test("clear で全セルが空になる", () => {
  const sim = makeSim(4, 4);
  sim.spawn(1, 1, MAT.SAND);
  sim.spawn(2, 2, MAT.WATER);
  sim.clear();
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) assert.equal(sim.get(x, y), MAT.EMPTY);
  }
});
