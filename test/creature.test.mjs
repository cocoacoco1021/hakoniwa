// 生きもの（虫）の生態ロジックに対する単体テスト。
// 依存なしで動かすため Node 標準の node:test / node:assert のみを使う。
// 乱数は決定的な関数を注入し、確率的な行動（採餌・繁殖・徘徊・掘削）を再現可能にする。
// 実行: node --test （falling-sand ディレクトリで）
import { test } from "node:test";
import assert from "node:assert/strict";

import { Simulation } from "../src/simulation.js";
import { MAT } from "../src/materials.js";
import { CONFIG } from "../src/config.js";

// 常に同じ値を返す乱数（確率判定を確定させる）
const constRandom = (value) => () => value;

/**
 * テスト用の Simulation を作る。
 * creatures 設定は上書き可能にし、繁殖や餓死などの境界条件を狙って再現する。
 */
function makeSim(cols, rows, { randomValue = 0.5, creatures = {} } = {}) {
  return new Simulation({
    cols,
    rows,
    random: constRandom(randomValue),
    physics: CONFIG.physics,
    creatures: { ...CONFIG.creatures, ...creatures },
  });
}

/** グリッド全体で指定素材のセル数を数える */
function count(sim, id) {
  let n = 0;
  for (let i = 0; i < sim.grid.length; i++) if (sim.grid[i] === id) n++;
  return n;
}

test("虫は下が空なら1セル落ちる（浮かない）", () => {
  const sim = makeSim(3, 3);
  sim.spawn(1, 0, MAT.BUG);
  sim.step();
  assert.equal(sim.get(1, 1), MAT.BUG);
  assert.equal(sim.get(1, 0), MAT.EMPTY);
});

test("虫は隣接する植物を食べて移動し、エネルギーが回復する", () => {
  const sim = makeSim(3, 3);
  sim.spawn(1, 1, MAT.BUG);
  sim.spawn(2, 1, MAT.PLANT); // 右隣に餌
  const before = sim.life[sim.index(1, 1)];
  sim.step();
  assert.equal(sim.get(2, 1), MAT.BUG); // 餌の位置へ移動
  assert.equal(sim.get(1, 1), MAT.EMPTY);
  // 移動で1消費し採餌で bugEatEnergy 回復 → 差し引きで増えている
  assert.ok(sim.life[sim.index(2, 1)] > before);
});

test("虫は火に隣接すると焼けて煙になる", () => {
  const sim = makeSim(3, 3);
  sim.spawn(1, 1, MAT.BUG);
  sim.spawn(2, 1, MAT.FIRE); // 虫の方が先に走査され、隣の火で焼死する
  sim.step();
  assert.equal(sim.get(1, 1), MAT.SMOKE);
});

test("虫は水に囲まれると溺れて消える", () => {
  const sim = makeSim(3, 3);
  sim.spawn(1, 1, MAT.BUG);
  sim.spawn(0, 1, MAT.WATER);
  sim.spawn(2, 1, MAT.WATER);
  sim.spawn(1, 2, MAT.WATER); // 3方向が水
  sim.step();
  assert.equal(sim.get(1, 1), MAT.EMPTY);
});

test("虫はエネルギーが尽きると餓死して消える", () => {
  // 初期エネルギー1 → 1ステップの消費で0になり餓死
  const sim = makeSim(3, 3, { creatures: { bugStartEnergy: 1 } });
  sim.spawn(1, 1, MAT.BUG);
  sim.step();
  assert.equal(sim.get(1, 1), MAT.EMPTY);
});

test("虫はエネルギーが十分だと繁殖して1匹増える", () => {
  // 1x2の縦2セル。下の虫が上の空きへ子を産む（reproChance=1で確定）
  const sim = makeSim(1, 2, {
    randomValue: 0,
    creatures: {
      bugStartEnergy: 400,
      bugReproEnergy: 360,
      bugReproCost: 220,
      bugReproChance: 1,
      bugMoveChance: 0, // 徘徊を止めて配置を固定
    },
  });
  sim.spawn(0, 1, MAT.BUG);
  sim.step();
  assert.equal(count(sim, MAT.BUG), 2);
  assert.equal(sim.get(0, 0), MAT.BUG); // 上に子
  assert.equal(sim.get(0, 1), MAT.BUG); // 親はその場
});

test("虫は近くの火から反対方向へ逃げる", () => {
  // 横一列。右の火（距離2, 感知範囲内）を避けて左へ1歩逃げる
  const sim = makeSim(5, 1);
  sim.spawn(2, 0, MAT.BUG);
  sim.spawn(4, 0, MAT.FIRE);
  sim.step();
  assert.equal(sim.get(1, 0), MAT.BUG);
  assert.equal(sim.get(2, 0), MAT.EMPTY);
});

test("虫は進路上の砂を掘って進む", () => {
  // 2x1。虫が右の砂を掘って入れ替わる（random=0 < digChance）
  const sim = makeSim(2, 1, { randomValue: 0 });
  sim.spawn(0, 0, MAT.BUG);
  sim.spawn(1, 0, MAT.SAND);
  sim.step();
  assert.equal(sim.get(1, 0), MAT.BUG);
  assert.equal(sim.get(0, 0), MAT.SAND);
});

test("酸は虫を溶かす", () => {
  const sim = makeSim(2, 1, { randomValue: 0 });
  sim.spawn(0, 0, MAT.ACID);
  sim.spawn(1, 0, MAT.BUG);
  sim.step();
  assert.equal(sim.get(1, 0), MAT.EMPTY);
});
