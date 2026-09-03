import assert from "node:assert/strict";
import { test } from "node:test";

import { FIELD_TOOL } from "../src/force-field.js";
import { MAT } from "../src/materials.js";
import { createToolbarDisclosure, getToolbarVisibility } from "../src/toolbar.js";

test("通常素材では筆サイズだけを表示する", () => {
  assert.deepEqual(getToolbarVisibility(FIELD_TOOL.MATERIAL, MAT.SAND, 1), {
    showBrushSize: true,
    showDragonSize: false,
    showTimeline: false,
  });
});

test("ドラゴンでは常設の筆に加えてドラゴンサイズを表示する", () => {
  assert.deepEqual(getToolbarVisibility(FIELD_TOOL.MATERIAL, MAT.DRAGON, 2), {
    showBrushSize: true,
    showDragonSize: true,
    showTimeline: true,
  });
});

test("力場ツールでは効果のあるサイズ調整だけを表示する", () => {
  assert.equal(
    getToolbarVisibility(FIELD_TOOL.WIND, MAT.DRAGON, 1).showBrushSize,
    true
  );
  assert.equal(
    getToolbarVisibility(FIELD_TOOL.ERASER, MAT.DRAGON, 1).showBrushSize,
    true
  );
  assert.deepEqual(getToolbarVisibility(FIELD_TOOL.ATTRACTOR, MAT.SAND, 1), {
    showBrushSize: true,
    showDragonSize: false,
    showTimeline: false,
  });
});

test("詳細操作は閉じて始まり、ボタンで開閉する", () => {
  const listeners = new Map();
  const attributes = new Map();
  const toggleButton = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const toggleLabel = { textContent: "" };
  const chevron = { textContent: "" };
  const content = { hidden: false };
  const disclosure = createToolbarDisclosure({
    toggleButton,
    toggleLabel,
    chevron,
    content,
  });

  assert.equal(content.hidden, true);
  assert.equal(attributes.get("aria-expanded"), "false");
  assert.equal(attributes.get("aria-label"), "詳細操作を開く");
  assert.equal(toggleLabel.textContent, "詳細操作");
  assert.equal(chevron.textContent, "▲");

  listeners.get("click")();
  assert.equal(disclosure.expanded, true);
  assert.equal(content.hidden, false);
  assert.equal(attributes.get("aria-expanded"), "true");
  assert.equal(attributes.get("aria-label"), "詳細操作を閉じる");
  assert.equal(toggleLabel.textContent, "閉じる");
  assert.equal(chevron.textContent, "▼");

  listeners.get("click")();
  assert.equal(disclosure.expanded, false);
  assert.equal(content.hidden, true);
  assert.equal(toggleLabel.textContent, "詳細操作");
  assert.equal(chevron.textContent, "▲");
});
