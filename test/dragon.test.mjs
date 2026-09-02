// ドラゴン（火を吐く生きもの）のロジックとドット絵展開に対する単体テスト。
// 依存なしで動かすため Node 標準の node:test / node:assert のみを使う。
// 乱数は決定的な関数を注入し、確率的な行動（火吐き・徘徊）を再現可能にする。
// 実行: node --test （falling-sand ディレクトリで）
import { test } from "node:test";
import assert from "node:assert/strict";

import { Simulation } from "../src/simulation.js";
import { MAT } from "../src/materials.js";
import { CONFIG } from "../src/config.js";
import { DRAGON_SPRITE, spriteLayers } from "../src/sprites.js";

// 常に同じ値を返す乱数（確率判定を確定させる）
const constRandom = (value) => () => value;

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

test("ドラゴンは下が空なら1セル落ちる（浮かない）", () => {
  const sim = makeSim(3, 3, { randomValue: 0.99 }); // 火吐き・徘徊は起こさない
  sim.spawn(1, 0, MAT.DRAGON);
  sim.step();
  assert.equal(sim.get(1, 1), MAT.DRAGON);
  assert.equal(sim.get(1, 0), MAT.EMPTY);
});

test("ドラゴンは火に隣接しても焼けない（炎に強い）", () => {
  // 虫は焼けて煙になるが、ドラゴンはその場に残る。
  const sim = makeSim(3, 1, { randomValue: 0.99 }); // 火吐き・徘徊は起こさない
  sim.spawn(1, 0, MAT.DRAGON);
  sim.spawn(2, 0, MAT.FIRE);
  sim.step();
  assert.equal(sim.get(1, 0), MAT.DRAGON);
});

test("ドラゴンは進行方向（左）へ火炎ブレスを吐く", () => {
  // 左向きの既定で、口元から左へ reach 分の空セルが炎になる。
  const sim = makeSim(6, 1, {
    randomValue: 0, // breatheChance を必ず満たす
    creatures: { dragonMoveChance: 0 }, // 徘徊で位置がブレないよう固定
  });
  sim.spawn(3, 0, MAT.DRAGON); // 既定で左向き
  sim.step();
  assert.equal(sim.get(3, 0), MAT.DRAGON); // その場に残る
  assert.equal(sim.get(2, 0), MAT.FIRE); // 1つ左が炎
  assert.equal(sim.get(1, 0), MAT.FIRE); // 2つ左も炎（reach=3）
});

test("ドラゴンは炎に囲まれても燃え尽きず、火吐き後も存在する", () => {
  const sim = makeSim(6, 1, { randomValue: 0, creatures: { dragonMoveChance: 0 } });
  sim.spawn(3, 0, MAT.DRAGON);
  sim.step();
  assert.equal(count(sim, MAT.DRAGON), 1);
});

test("ドラゴンは隣の虫を捕食して移動する", () => {
  const sim = makeSim(2, 1, { randomValue: 0.99 }); // 火吐き・徘徊は起こさない（捕食は無条件）
  sim.spawn(0, 0, MAT.DRAGON);
  sim.spawn(1, 0, MAT.BUG);
  sim.step();
  assert.equal(sim.get(1, 0), MAT.DRAGON); // 餌の位置へ移動
  assert.equal(sim.get(0, 0), MAT.EMPTY);
  assert.equal(count(sim, MAT.BUG), 0); // 虫は食べられて消える
});

test("ドラゴンはエネルギーが尽きると消える", () => {
  const sim = makeSim(3, 3, { randomValue: 0.99, creatures: { dragonStartEnergy: 1 } });
  sim.spawn(1, 1, MAT.DRAGON);
  sim.step();
  assert.equal(sim.get(1, 1), MAT.EMPTY);
});

test("ドラゴンは向きに応じて heading を更新する（右へ歩くと +1）", () => {
  // 左が壁(範囲外)、右が空。左へ進めず右へ反転して進む。
  const sim = makeSim(3, 1, { randomValue: 0, creatures: { dragonBreatheChance: 0 } });
  sim.spawn(0, 0, MAT.DRAGON); // 既定で左向き。左は範囲外
  sim.step();
  assert.equal(sim.get(1, 0), MAT.DRAGON); // 右へ1歩
  assert.equal(sim.heading[sim.index(1, 0)], 1); // 右向きに更新
});

test("spriteLayers はドラゴンの寸法をそのまま返す", () => {
  const px = spriteLayers(DRAGON_SPRITE);
  assert.equal(px.width, 16);
  assert.equal(px.height, 14);
});

test("DRAGON_SPRITE の各行は width と同じ長さ（描き崩れ防止）", () => {
  for (const row of DRAGON_SPRITE.rows) {
    assert.equal(row.length, DRAGON_SPRITE.width);
  }
});

test("spriteLayers は色ごとに分け、透明('.')を含めない", () => {
  const px = spriteLayers({
    width: 3,
    height: 2,
    palette: { A: 0x111111, B: 0x222222 },
    rows: ["A.B", ".A."],
  });
  // 総ピクセル数は非透明セルの数（A×2 + B×1 = 3）
  const total = px.layers.reduce((n, l) => n + l.pixels.length, 0);
  assert.equal(total, 3);
  // 色 A のレイヤーには2ピクセル、B には1ピクセル
  const layerA = px.layers.find((l) => l.color === 0x111111);
  const layerB = px.layers.find((l) => l.color === 0x222222);
  assert.equal(layerA.pixels.length, 2);
  assert.equal(layerB.pixels.length, 1);
});
