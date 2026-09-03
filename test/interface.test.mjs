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

test("履歴ができるまで巻き戻し操作を隠す", () => {
  assert.match(html, /class="timeline" id="timeline-controls"[^>]*hidden/);
  assert.match(html, /id="time-scrubber"/);
  assert.match(html, /id="replay-history"[^>]*>履歴再生/);
  assert.match(html, /id="timeline-position"[^>]*>いま/);
});

test("ドラゴン選択時だけ使うサイズ調整を初期状態では隠す", () => {
  assert.match(html, /id="dragon-size-control" hidden/);
  assert.match(html, /id="dragon-size"[^>]*aria-label="ドラゴンの表示サイズ"/);
  assert.match(html, /id="dragon-size-value"/);
});

test("素材と基本操作は常時表示し、追加機能だけを詳細操作へ畳む", () => {
  assert.match(
    html,
    /class="toolbar__details" id="toolbar-content" hidden[\s\S]*?id="field-tools"[\s\S]*?id="timeline-controls"[\s\S]*?<\/div>\s*<\/div>\s*<div class="palette" id="palette"/
  );
  assert.match(
    html,
    /id="brush-size-control"[\s\S]*?id="toggle-pause"[\s\S]*?id="clear"[\s\S]*?id="toggle-toolbar"/
  );
  assert.match(
    html,
    /id="toggle-toolbar"[^>]*aria-expanded="false"[^>]*aria-controls="toolbar-content"/
  );
  assert.match(html, /id="toolbar-toggle-label">詳細操作<\/span>/);
  assert.doesNotMatch(html, /id="toolbar-selection-label"/);
  assert.doesNotMatch(html, /data-field-tool="material"/);
});

test("筆とドラゴンのサイズは用途と現在値を表示する", () => {
  assert.match(html, /<span>筆<\/span>/);
  assert.match(html, /id="brush-size-value"/);
  assert.match(html, /<span>ドラゴン<\/span>/);
  assert.match(html, /id="dragon-size-value"/);
});

test("主要操作は44px以上のタッチ領域を持つ", () => {
  assert.match(css, /\.toolbar__details-toggle\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.palette__item\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.toolstrip__btn\s*\{[^}]*min-height:\s*44px/s);
  assert.match(
    css,
    /\.controls__brush input\[type="range"\],\s*\.controls__dragon-size input\[type="range"\]\s*\{[^}]*min-height:\s*44px/s
  );
  assert.match(css, /\.timeline__btn\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.controls__btn\s*\{[^}]*min-height:\s*44px/s);
});

test("スマホ幅では詳細操作と常時操作を横スクロールなしで配置する", () => {
  assert.match(
    css,
    /@media \(max-width:\s*600px\)[\s\S]*?\.toolstrip\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)[^}]*overflow-x:\s*visible/s
  );
  assert.match(
    css,
    /@media \(max-width:\s*600px\)[\s\S]*?\.controls\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto auto[^}]*overflow-x:\s*visible/s
  );
});

test("詳細操作と無効な時間スライダーの優先度を見分けられる", () => {
  assert.match(
    css,
    /\.toolbar__details\s*\{[^}]*border:\s*1px solid var\(--panel-border\)[^}]*background:\s*var\(--panel\)/s
  );
  assert.match(
    css,
    /\.timeline input\[type="range"\]:disabled\s*\{[^}]*opacity:\s*0\.38/s
  );
});

test("初回版と同じく操作帯を下部、タイトルを左上へ配置する", () => {
  assert.match(
    css,
    /\.toolbar\s*\{[^}]*bottom:\s*0[^}]*padding:\s*10px 12px calc\(10px \+ env\(safe-area-inset-bottom, 0\)\)[^}]*background:\s*linear-gradient\(to top, rgba\(0, 0, 0, 0\.55\), rgba\(0, 0, 0, 0\)\)/s
  );
  assert.match(
    css,
    /\.overlay\s*\{[^}]*top:\s*env\(safe-area-inset-top, 0\)/s
  );
  assert.match(html, /id="toolbar-chevron"[^>]*>▲<\/span>/);
});
