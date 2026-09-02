// エントリポイント。入力・UI・描画ループを組み立てる薄い配線層に徹し、
// 物理は simulation、描画は renderer、算出は layout/brush へ委譲する。

import { CONFIG } from "./src/config.js";
import { Simulation } from "./src/simulation.js";
import { createRenderer } from "./src/renderer.js";
import { createCreatureOverlay } from "./src/overlay.js";
import { computeGrid } from "./src/layout.js";
import { forEachBrushCell } from "./src/brush.js";
import { MAT, MATERIALS } from "./src/materials.js";

// 通常フローで console.log は使わない方針。エラー記録だけ軽量ロガーに集約する。
const logger = {
  error: (message, error) => console.error(`[falling-sand] ${message}`, error ?? ""),
};

// パレットに出す素材の並び（EMPTY=消しゴムを先頭に）
const PALETTE_ORDER = [
  MAT.EMPTY, MAT.SAND, MAT.WATER, MAT.OIL, MAT.FIRE,
  MAT.WOOD, MAT.PLANT, MAT.BUG, MAT.DRAGON, MAT.LAVA, MAT.ACID, MAT.WALL,
];

// アプリ全体で共有する状態
let sim;
let renderer;
let overlay; // 虫のドット絵レイヤー（生成に失敗しても本体は動かす）
let selectedMaterial = MAT.SAND;
let brushRadius = CONFIG.brush.radius;
let paused = false;
let painting = false;
let paletteButtons = [];

/**
 * 起動処理。グリッド・シミュレーション・描画器を用意し、UIとループを回す。
 * 入力：なし / 出力：なし
 */
function boot() {
  const canvas = document.getElementById("scene");
  sizeCanvas(canvas);

  const { cols, rows } = computeGrid(window.innerWidth, window.innerHeight, CONFIG.grid);
  sim = new Simulation({
    cols,
    rows,
    random: Math.random,
    physics: CONFIG.physics,
    creatures: CONFIG.creatures,
  });

  try {
    renderer = createRenderer(canvas, cols, rows, CONFIG.render);
    renderer.resize(canvas.width, canvas.height);
  } catch (error) {
    logger.error("描画器の初期化に失敗しました", error);
    document.body.classList.add("no-webgl");
    return;
  }

  // 虫のドット絵レイヤーを重ねる。失敗しても本体描画は継続する（虫は素の色ブロックで見える）。
  try {
    const overlayCanvas = document.getElementById("creatures");
    sizeCanvas(overlayCanvas);
    overlay = createCreatureOverlay(overlayCanvas, cols, rows, CONFIG.render);
    overlay.resize(overlayCanvas.width, overlayCanvas.height);
  } catch (error) {
    logger.error("虫のドット絵レイヤーの初期化に失敗しました", error);
  }

  buildPalette();
  bindControls();
  bindPointer(canvas);
  requestAnimationFrame(loop);
}

/** 表示canvasのバッキング解像度を画面サイズに合わせる（ポインタ座標変換を単純に保つ） */
function sizeCanvas(canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

/**
 * 素材パレットのボタンを生成し、選択状態を管理する。
 * 入力：なし / 出力：なし
 * 各ボタンは色見本とラベルを持ち、押すと描く素材を切り替える。
 */
function buildPalette() {
  const container = document.getElementById("palette");
  paletteButtons = PALETTE_ORDER.map((id) => {
    const material = MATERIALS[id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "palette__item";
    button.dataset.material = String(id);

    const swatch = document.createElement("span");
    swatch.className = "palette__swatch";
    // 消しゴム(空)は透明を示すため枠だけ、それ以外は素材色で塗る
    swatch.style.background = id === MAT.EMPTY ? "transparent" : hexColor(material.color);
    button.appendChild(swatch);
    button.appendChild(document.createTextNode(material.label));

    button.addEventListener("click", () => selectMaterial(id));
    container.appendChild(button);
    return button;
  });
  selectMaterial(selectedMaterial);
}

/** 描く素材を切り替え、パレットの選択強調を更新する */
function selectMaterial(id) {
  selectedMaterial = id;
  paletteButtons.forEach((button) =>
    button.classList.toggle(
      "palette__item--active",
      Number(button.dataset.material) === id
    )
  );
}

/** 0xRRGGBB を CSS の #rrggbb 文字列へ変換する */
function hexColor(value) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

/**
 * ツールバーの操作（筆サイズ・一時停止・クリア）とキー操作を登録する。
 * 入力：なし / 出力：なし
 */
function bindControls() {
  const slider = document.getElementById("brush-size");
  slider.min = String(CONFIG.brush.minRadius);
  slider.max = String(CONFIG.brush.maxRadius);
  slider.value = String(brushRadius);
  slider.addEventListener("input", () => {
    brushRadius = Number(slider.value);
  });

  const pauseButton = document.getElementById("toggle-pause");
  pauseButton.addEventListener("click", () => togglePause(pauseButton));

  document.getElementById("clear").addEventListener("click", () => sim.clear());

  window.addEventListener("keydown", (event) => {
    if (event.key === " ") {
      event.preventDefault();
      togglePause(pauseButton);
    }
    if (event.key.toLowerCase() === "c") sim.clear();
  });

  window.addEventListener("resize", () => {
    // グリッドは作り直さず（描いた内容を保持）、表示サイズだけ追従させる
    sizeCanvas(document.getElementById("scene"));
    renderer.resize(window.innerWidth, window.innerHeight);
    const overlayCanvas = document.getElementById("creatures");
    sizeCanvas(overlayCanvas);
    if (overlay) overlay.resize(overlayCanvas.width, overlayCanvas.height);
  });
}

/** 一時停止のオン/オフを切り替え、ボタン表示を更新する */
function togglePause(button) {
  paused = !paused;
  button.textContent = paused ? "再生" : "停止";
  button.setAttribute("aria-pressed", String(paused));
}

/**
 * ポインタ（マウス/タッチ）で素材を描く操作を登録する。
 * 入力：canvas / 出力：なし
 * 押下中の移動で連続して塗れるようにし、画面外へ出たら描画を止める。
 */
function bindPointer(canvas) {
  const paint = (event) => {
    if (!painting) return;
    paintAt(event.clientX, event.clientY);
  };

  canvas.addEventListener("pointerdown", (event) => {
    painting = true;
    canvas.setPointerCapture(event.pointerId);
    paintAt(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointermove", paint);
  canvas.addEventListener("pointerup", () => (painting = false));
  canvas.addEventListener("pointercancel", () => (painting = false));
  // タッチで描くときに画面がスクロールしないようにする
  canvas.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
}

/**
 * 画面座標を対応するセルへ変換し、筆の円内へ選択素材を配置する。
 * 入力：clientX, clientY（画面座標）/ 出力：なし
 */
function paintAt(clientX, clientY) {
  const cx = Math.floor((clientX / window.innerWidth) * sim.cols);
  const cy = Math.floor((clientY / window.innerHeight) * sim.rows);
  forEachBrushCell(cx, cy, brushRadius, (x, y) => sim.spawn(x, y, selectedMaterial));
}

/** 描画ループ。停止中はシミュレーションを進めず、描画だけ続ける。 */
function loop() {
  if (!paused) sim.step();
  renderer.render(sim.grid);
  if (overlay) overlay.render(sim.grid, sim.heading); // 本体の上へ生きもののドット絵を重ねる
  requestAnimationFrame(loop);
}

boot();
