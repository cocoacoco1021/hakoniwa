import { test } from "node:test";
import assert from "node:assert/strict";

import { createRandom, InvalidRandomStateError } from "../src/random.js";

test("同じ種は同じ乱数列を返す", () => {
  const first = createRandom(1234);
  const second = createRandom(1234);

  assert.deepEqual(
    [first(), first(), first(), first()],
    [second(), second(), second(), second()]
  );
});

test("保存した状態へ戻すと同じ続きの乱数列を再生する", () => {
  const random = createRandom(42);
  random();
  const savedState = random.getState();
  const expected = [random(), random(), random()];

  random.setState(savedState);

  assert.deepEqual([random(), random(), random()], expected);
});

test("32bit整数ではない乱数状態を拒否する", () => {
  const random = createRandom(1);

  assert.throws(() => random.setState(-1), InvalidRandomStateError);
  assert.throws(() => random.setState(1.5), InvalidRandomStateError);
});
