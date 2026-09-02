import { test } from "node:test";
import assert from "node:assert/strict";

import { REACTION } from "../src/reactions.js";
import { createSonifier } from "../src/sonification.js";

/** 再生・停止操作を記録するテスト用音響エンジンを作る。 */
function makeEngine() {
  const calls = [];
  return {
    calls,
    engine: {
      resume: async () => calls.push(["resume"]),
      suspend: async () => calls.push(["suspend"]),
      play: (event) => calls.push(["play", event]),
    },
  };
}

test("初期状態は無音で、明示的に有効化した後だけ反応を再生する", async () => {
  const { calls, engine } = makeEngine();
  const sonifier = createSonifier({ createEngine: () => engine });

  sonifier.enqueue({ type: REACTION.IGNITION, x: 1, y: 2 });
  assert.equal(sonifier.flush(0), 0);

  await sonifier.setEnabled(true);
  sonifier.enqueue({ type: REACTION.IGNITION, x: 1, y: 2 });
  assert.equal(sonifier.flush(0), 1);
  assert.deepEqual(calls[0], ["resume"]);
  assert.equal(calls[1][0], "play");
});

test("同種反応を集約し、短時間の連続発音を間引く", async () => {
  const { calls, engine } = makeEngine();
  const sonifier = createSonifier({
    createEngine: () => engine,
    minIntervalMs: 100,
  });
  await sonifier.setEnabled(true);

  sonifier.enqueue({ type: REACTION.DISSOLUTION, x: 2, y: 3 });
  sonifier.enqueue({ type: REACTION.DISSOLUTION, x: 4, y: 5 });
  assert.equal(sonifier.flush(0), 1);
  assert.equal(calls[1][1].count, 2);

  sonifier.enqueue({ type: REACTION.DISSOLUTION, x: 6, y: 7 });
  assert.equal(sonifier.flush(50), 0);
  assert.equal(sonifier.flush(100), 1);
});

test("無効化すると保留中の反応を破棄して音響エンジンを停止する", async () => {
  const { calls, engine } = makeEngine();
  const sonifier = createSonifier({ createEngine: () => engine });
  await sonifier.setEnabled(true);
  sonifier.enqueue({ type: REACTION.CONDENSATION, x: 1, y: 1 });

  await sonifier.setEnabled(false);

  assert.equal(sonifier.flush(1000), 0);
  assert.deepEqual(calls.at(-1), ["suspend"]);
});
