import { test } from "node:test";
import assert from "node:assert/strict";

import { REACTION, ReactionBus } from "../src/reactions.js";

test("ReactionBusは反応の種類・位置・強度を購読者へ渡す", () => {
  const bus = new ReactionBus();
  const events = [];
  bus.subscribe((event) => events.push(event));

  bus.emit(REACTION.IGNITION, 3, 4, 0.8);

  assert.deepEqual(events, [
    { type: REACTION.IGNITION, x: 3, y: 4, intensity: 0.8 },
  ]);
});

test("購読解除後は反応を受け取らない", () => {
  const bus = new ReactionBus();
  const events = [];
  const unsubscribe = bus.subscribe((event) => events.push(event));
  unsubscribe();

  bus.emit(REACTION.CONDENSATION, 1, 2);

  assert.deepEqual(events, []);
});
