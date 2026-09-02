// 新機能の操作入口と、スマホ向けタッチ寸法がHTML/CSSから失われないことを検証する。
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../style.css", import.meta.url), "utf8");

test("音・重力・風・引力・場消しの操作入口を表示する", () => {
  assert.match(html, /id="toggle-sound"[^>]*aria-pressed="false"[^>]*>音 OFF/);
  assert.match(html, /id="rotate-gravity"/);
  assert.match(html, /data-field-tool="wind"/);
  assert.match(html, /data-field-tool="attractor"/);
  assert.match(html, /data-field-tool="field-eraser"/);
  assert.match(html, /<canvas id="fields"><\/canvas>/);
});

test("巻き戻しスライダーと履歴再生ボタンを表示する", () => {
  assert.match(html, /id="time-scrubber"/);
  assert.match(html, /id="replay-history"[^>]*>履歴再生/);
  assert.match(html, /id="timeline-position"[^>]*>いま/);
});

test("ドラゴン表示サイズのスライダーと現在値を表示する", () => {
  assert.match(html, /id="dragon-size"[^>]*aria-label="ドラゴンの表示サイズ"/);
  assert.match(html, /id="dragon-size-value"/);
});

test("主要操作は44px以上のタッチ領域を持つ", () => {
  assert.match(css, /\.palette__item\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.toolstrip__btn\s*\{[^}]*min-height:\s*44px/s);
  assert.match(
    css,
    /\.controls__brush input\[type="range"\],\s*\.controls__dragon-size input\[type="range"\]\s*\{[^}]*min-height:\s*44px/s
  );
  assert.match(css, /\.timeline__btn\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.controls__btn\s*\{[^}]*min-height:\s*44px/s);
});
