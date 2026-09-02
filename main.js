// エントリポイント。入力・UI・描画ループを組み立てる薄い配線層に徹し、
// 物理は simulation、描画は renderer、算出は layout/brush へ委譲する。

import { CONFIG } from "./src/config.js";
import { Simulation } from "./src/simulation.js";
import { createRenderer } from "./src/renderer.js";
import { createCreatureOverlay } from "./src/overlay.js";
import { computeGrid } from "./src/layout.js";
import { MAT, MATERIALS } from "./src/materials.js";
import { paintMaterial, supportsContinuousPaint } from "./src/painting.js";
import { FIELD_TOOL, ForceField, gravityArrow } from "./src/force-field.js";
import { createForceOverlay } from "./src/force-overlay.js";
import { ReactionBus } from "./src/reactions.js";
import { createRandom } from "./src/random.js";
import { createSonifier } from "./src/sonification.js";
import { WorldTimeline } from "./src/timeline.js";
import { createToolbarDisclosure, getToolbarVisibility } from "./src/toolbar.js";

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
let overlay; // 生きもの画像レイヤー（生成に失敗しても本体は動かす）
let forceOverlay; // 力場表示レイヤー（失敗しても物理効果は維持する）
let forceField;
let sonifier;
let randomSource;
let timeline;
let selectedMaterial = MAT.SAND;
let selectedTool = FIELD_TOOL.MATERIAL;
let brushRadius = CONFIG.brush.radius;
let paused = false;
let painting = false;
let timelineGestureActive = false;
let previousPointerCell = null;
let replayingHistory = false;
let lastReplayAtMs = 0;
let paletteButtons = [];
let fieldToolButtons = [];

const TOOL_HINTS = {
  [FIELD_TOOL.MATERIAL]: "素材を選んで画面をなぞる",
  [FIELD_TOOL.WIND]: "流したい方向へドラッグして風を描く",
  [FIELD_TOOL.ATTRACTOR]: "吸い寄せたい場所をタップする",
  [FIELD_TOOL.ERASER]: "画面をなぞって風と引力を消す",
};

/**
 * 起動処理。グリッド・シミュレーション・描画器を用意し、UIとループを回す。
 * 入力：なし / 出力：なし
 */
function boot() {
  const canvas = document.getElementById("scene");
  sizeCanvas(canvas);

  const { cols, rows } = computeGrid(window.innerWidth, window.innerHeight, CONFIG.grid);
  randomSource = createRandom(CONFIG.timeline.seed);
  forceField = new ForceField(cols, rows, CONFIG.forces);
  const reactionBus = new ReactionBus();
  sonifier = createSonifier({ ...CONFIG.sonification, cols });
  reactionBus.subscribe((event) => sonifier.enqueue(event));
  sim = new Simulation({
    cols,
    rows,
    random: randomSource,
    physics: CONFIG.physics,
    creatures: CONFIG.creatures,
    forces: forceField,
    reactions: reactionBus,
  });
  timeline = new WorldTimeline({
    simulation: sim,
    random: randomSource,
    forceField,
    maxSnapshots: CONFIG.timeline.maxSnapshots,
    captureIntervalSteps: CONFIG.timeline.captureIntervalSteps,
  });
  timeline.captureNow();

  try {
    renderer = createRenderer(canvas, cols, rows, CONFIG.render);
    renderer.resize(canvas.width, canvas.height);
  } catch (error) {
    logger.error("描画器の初期化に失敗しました", error);
    document.body.classList.add("no-webgl");
    return;
  }

  try {
    const fieldCanvas = document.getElementById("fields");
    sizeCanvas(fieldCanvas);
    forceOverlay = createForceOverlay(fieldCanvas, cols, rows, CONFIG.forces);
    forceOverlay.resize(fieldCanvas.width, fieldCanvas.height);
  } catch (error) {
    logger.error("力場レイヤーの初期化に失敗しました", error);
  }

  // 生きもの画像レイヤーを重ねる。失敗しても本体描画は継続する。
  try {
    const overlayCanvas = document.getElementById("creatures");
    sizeCanvas(overlayCanvas);
    overlay = createCreatureOverlay(overlayCanvas, cols, rows, CONFIG.render);
    overlay.resize(overlayCanvas.width, overlayCanvas.height);
  } catch (error) {
    logger.error("生きもの画像レイヤーの初期化に失敗しました", error);
  }

  bindToolbarDisclosure();
  buildPalette();
  bindFieldControls();
  bindTimelineControls();
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
  selectTool(FIELD_TOOL.MATERIAL);
  paletteButtons.forEach((button) =>
    button.classList.toggle(
      "palette__item--active",
      Number(button.dataset.material) === id
    )
  );
}

/**
 * 力場ツール・重力・音の操作を登録する。
 * 入力：なし / 出力：なし。
 */
function bindFieldControls() {
  fieldToolButtons = [...document.querySelectorAll("[data-field-tool]")];
  for (const button of fieldToolButtons) {
    button.addEventListener("click", () => selectTool(button.dataset.fieldTool));
  }
  selectTool(selectedTool);

  const gravityButton = document.getElementById("rotate-gravity");
  gravityButton.addEventListener("click", () => {
    commitTimelineMutation(() => forceField.rotateGravity());
  });

  const soundButton = document.getElementById("toggle-sound");
  soundButton.addEventListener("click", async () => {
    try {
      await sonifier.setEnabled(!sonifier.enabled);
      soundButton.textContent = sonifier.enabled ? "音 ON" : "音 OFF";
      soundButton.setAttribute("aria-pressed", String(sonifier.enabled));
      soundButton.classList.toggle("toolstrip__btn--sound-on", sonifier.enabled);
    } catch (error) {
      logger.error("音ボタン操作でWebAudioを開始できませんでした", error);
      soundButton.textContent = "音 非対応";
      soundButton.disabled = true;
    }
  });

  document.getElementById("clear-fields").addEventListener("click", () => {
    commitTimelineMutation(() => forceField.clear());
  });
}

/** 選択中の描画ツールと案内文を更新する。 */
function selectTool(tool) {
  selectedTool = tool;
  for (const button of fieldToolButtons) {
    const selected = button.dataset.fieldTool === tool;
    button.classList.toggle("toolstrip__btn--active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  const hint = document.getElementById("mode-hint");
  if (hint) hint.textContent = TOOL_HINTS[tool];
  syncToolbarContext();
}

/**
 * 下部操作パネルの開閉を登録する。
 * 入力：なし / 出力：なし。
 */
function bindToolbarDisclosure() {
  createToolbarDisclosure({
    toggleButton: document.getElementById("toggle-toolbar"),
    toggleLabel: document.getElementById("toolbar-toggle-label"),
    chevron: document.getElementById("toolbar-chevron"),
    content: document.getElementById("toolbar-content"),
  });
}

/**
 * 選択中の道具を要約し、関係するスライダーだけを表示する。
 * 入力：なし / 出力：なし。
 */
function syncToolbarContext() {
  const brushControl = document.getElementById("brush-size-control");
  const dragonControl = document.getElementById("dragon-size-control");
  const timelineControls = document.getElementById("timeline-controls");
  const selectionLabel = document.getElementById("toolbar-selection-label");
  const selectionSwatch = document.getElementById("toolbar-selection-swatch");
  if (!brushControl || !dragonControl || !timelineControls || !selectionLabel) return;

  const visibility = getToolbarVisibility(
    selectedTool,
    selectedMaterial,
    timeline?.size ?? 0
  );
  brushControl.hidden = !visibility.showBrushSize;
  dragonControl.hidden = !visibility.showDragonSize;
  timelineControls.hidden = !visibility.showTimeline;

  if (selectedTool === FIELD_TOOL.MATERIAL) {
    const material = MATERIALS[selectedMaterial];
    selectionLabel.textContent = `選択: ${material.label}`;
    if (selectionSwatch) {
      selectionSwatch.style.background =
        selectedMaterial === MAT.EMPTY ? "transparent" : hexColor(material.color);
    }
    return;
  }

  const toolSummary = {
    [FIELD_TOOL.WIND]: ["風", "var(--wind)"],
    [FIELD_TOOL.ATTRACTOR]: ["引力", "var(--attractor)"],
    [FIELD_TOOL.ERASER]: ["場消し", "transparent"],
  }[selectedTool];
  if (!toolSummary) return;
  selectionLabel.textContent = `選択: ${toolSummary[0]}`;
  if (selectionSwatch) selectionSwatch.style.background = toolSummary[1];
}

/**
 * 時間スライダーと履歴再生ボタンを登録する。
 * 入力：なし / 出力：なし。
 */
function bindTimelineControls() {
  const scrubber = document.getElementById("time-scrubber");
  scrubber.addEventListener("input", () => {
    stopHistoryReplay();
    setPaused(true);
    timeline.seek(Number(scrubber.value));
    sonifier.discardPending();
    syncTimelineControls();
  });

  document.getElementById("replay-history").addEventListener("click", () => {
    if (replayingHistory) {
      stopHistoryReplay();
      syncTimelineControls();
      return;
    }
    startHistoryReplay();
  });
  syncTimelineControls();
}

/** 履歴の現在位置・相対秒・再生状態をUIへ反映する。 */
function syncTimelineControls() {
  const scrubber = document.getElementById("time-scrubber");
  const replayButton = document.getElementById("replay-history");
  const position = document.getElementById("timeline-position");
  if (!scrubber || !replayButton || !position || timeline.size === 0) return;

  scrubber.max = String(Math.max(0, timeline.size - 1));
  scrubber.value = String(Math.max(0, timeline.cursor));
  scrubber.disabled = timeline.size < 2;
  replayButton.disabled = timeline.size < 2;
  replayButton.textContent = replayingHistory ? "履歴停止" : "履歴再生";
  replayButton.setAttribute("aria-pressed", String(replayingHistory));
  replayButton.classList.toggle("timeline__btn--active", replayingHistory);

  const current = timeline.getSnapshot(timeline.cursor);
  const latest = timeline.getSnapshot(timeline.size - 1);
  const framesBehind = Math.max(0, latest.frame - current.frame);
  const secondsBehind = framesBehind / CONFIG.timeline.stepsPerSecond;
  const positionsBehind = timeline.size - 1 - timeline.cursor;
  const positionLabel = timeline.isLatest()
    ? "いま"
    : framesBehind > 0
      ? `-${secondsBehind.toFixed(1)}秒`
      : `${positionsBehind}手前`;
  position.textContent = positionLabel;
  scrubber.setAttribute("aria-valuetext", positionLabel);

  const gravityButton = document.getElementById("rotate-gravity");
  if (gravityButton) gravityButton.textContent = `重力 ${gravityArrow(forceField.gravity)}`;
  syncToolbarContext();
}

/** 最新なら先頭へ、過去なら現在位置から履歴再生を始める。 */
function startHistoryReplay() {
  if (timeline.size < 2) return;
  setPaused(true);
  if (timeline.isLatest()) timeline.seek(0);
  replayingHistory = timeline.cursor < timeline.size - 1;
  lastReplayAtMs = performance.now();
  sonifier.discardPending();
  syncTimelineControls();
}

/** 履歴再生を止める。世界状態とカーソルは現在位置に保つ。 */
function stopHistoryReplay() {
  replayingHistory = false;
  lastReplayAtMs = 0;
}

/** 再生間隔を満たしたら履歴を1状態だけ進める。 */
function updateHistoryReplay(nowMs) {
  if (!replayingHistory) return;
  if (nowMs - lastReplayAtMs < CONFIG.timeline.replayIntervalMs) return;
  lastReplayAtMs = nowMs;
  timeline.advance();
  if (timeline.isLatest()) stopHistoryReplay();
  syncTimelineControls();
}

/** 過去の未来を破棄し、次の入力を新しい分岐にする準備を行う。 */
function prepareTimelineMutation() {
  stopHistoryReplay();
  timeline.branch();
  sonifier.discardPending();
}

/** 現在の入力結果を新規履歴または最新履歴の置換として保存する。 */
function recordTimelineMutation(replaceLatest = false) {
  if (replaceLatest) timeline.replaceLatest();
  else timeline.captureNow();
  syncTimelineControls();
}

/** 単発操作を分岐可能な履歴として実行・保存する。 */
function commitTimelineMutation(mutation) {
  prepareTimelineMutation();
  mutation();
  recordTimelineMutation();
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
  const brushSizeValue = document.getElementById("brush-size-value");
  slider.min = String(CONFIG.brush.minRadius);
  slider.max = String(CONFIG.brush.maxRadius);
  slider.value = String(brushRadius);
  brushSizeValue.textContent = String(brushRadius);
  slider.addEventListener("input", () => {
    brushRadius = Number(slider.value);
    brushSizeValue.textContent = String(brushRadius);
  });

  const dragonSizeSlider = document.getElementById("dragon-size");
  const dragonSizeValue = document.getElementById("dragon-size-value");
  dragonSizeSlider.min = String(CONFIG.render.dragonSpriteMinCells);
  dragonSizeSlider.max = String(CONFIG.render.dragonSpriteMaxCells);
  dragonSizeSlider.step = "1";
  dragonSizeSlider.value = String(CONFIG.render.dragonSpriteCells);
  if (overlay) {
    dragonSizeValue.textContent = String(
      overlay.setDragonSpriteCells(dragonSizeSlider.value)
    );
    dragonSizeSlider.addEventListener("input", () => {
      dragonSizeValue.textContent = String(
        overlay.setDragonSpriteCells(dragonSizeSlider.value)
      );
    });
  } else {
    dragonSizeSlider.disabled = true;
  }

  const pauseButton = document.getElementById("toggle-pause");
  pauseButton.addEventListener("click", () => togglePause());

  document.getElementById("clear").addEventListener("click", () => {
    commitTimelineMutation(() => sim.clear());
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === " ") {
      event.preventDefault();
      togglePause();
    }
    if (event.key.toLowerCase() === "c") {
      commitTimelineMutation(() => sim.clear());
    }
  });

  window.addEventListener("resize", () => {
    // グリッドは作り直さず（描いた内容を保持）、表示サイズだけ追従させる
    sizeCanvas(document.getElementById("scene"));
    renderer.resize(window.innerWidth, window.innerHeight);
    const overlayCanvas = document.getElementById("creatures");
    sizeCanvas(overlayCanvas);
    if (overlay) overlay.resize(overlayCanvas.width, overlayCanvas.height);
    const fieldCanvas = document.getElementById("fields");
    sizeCanvas(fieldCanvas);
    if (forceOverlay) forceOverlay.resize(fieldCanvas.width, fieldCanvas.height);
  });
}

/** 一時停止状態を設定し、ボタン表示を更新する。 */
function setPaused(nextPaused) {
  paused = nextPaused;
  const button = document.getElementById("toggle-pause");
  button.textContent = paused ? "再生" : "停止";
  button.setAttribute("aria-pressed", String(paused));
}

/** 一時停止を切り替える。過去から再開するときは未来を破棄して分岐する。 */
function togglePause() {
  if (paused) {
    stopHistoryReplay();
    timeline.branch();
    setPaused(false);
  } else {
    setPaused(true);
  }
  syncTimelineControls();
}

/**
 * ポインタ（マウス/タッチ）で素材・風・引力を描く操作を登録する。
 * 入力：canvas / 出力：なし
 * 押下中の移動で連続して塗れるようにし、画面外へ出たら描画を止める。
 */
function bindPointer(canvas) {
  canvas.addEventListener("pointerdown", (event) => {
    painting = true;
    timelineGestureActive = false;
    canvas.setPointerCapture(event.pointerId);
    const cell = cellAt(event.clientX, event.clientY);
    previousPointerCell = cell;
    if (toolMutatesOnStart()) {
      prepareTimelineMutation();
      if (applyToolStart(cell)) {
        recordTimelineMutation();
        timelineGestureActive = true;
      }
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!painting) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (toolMutatesOnMove(previousPointerCell, cell)) {
      if (!timelineGestureActive) prepareTimelineMutation();
      if (applyToolMove(previousPointerCell, cell)) {
        recordTimelineMutation(timelineGestureActive);
        timelineGestureActive = true;
      }
    }
    previousPointerCell = cell;
  });
  const stopPainting = () => {
    painting = false;
    timelineGestureActive = false;
    previousPointerCell = null;
  };
  canvas.addEventListener("pointerup", stopPainting);
  canvas.addEventListener("pointercancel", stopPainting);
  // タッチで描くときに画面がスクロールしないようにする
  canvas.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
  canvas.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
}

/** 選択ツールが押下直後に世界を変更するかを返す。 */
function toolMutatesOnStart() {
  return selectedTool !== FIELD_TOOL.WIND;
}

/** 選択ツールが今回のドラッグ移動で世界を変更するかを返す。 */
function toolMutatesOnMove(previousCell, cell) {
  if (selectedTool === FIELD_TOOL.MATERIAL) {
    return supportsContinuousPaint(selectedMaterial);
  }
  if (selectedTool === FIELD_TOOL.WIND) {
    return previousCell.x !== cell.x || previousCell.y !== cell.y;
  }
  return selectedTool === FIELD_TOOL.ERASER;
}

/** 画面座標を論理セル座標へ変換する。 */
function cellAt(clientX, clientY) {
  return {
    x: Math.min(
      sim.cols - 1,
      Math.max(0, Math.floor((clientX / window.innerWidth) * sim.cols))
    ),
    y: Math.min(
      sim.rows - 1,
      Math.max(0, Math.floor((clientY / window.innerHeight) * sim.rows))
    ),
  };
}

/** 押し始めの1回だけ必要なツール操作を適用し、変更の有無を返す。 */
function applyToolStart(cell) {
  if (selectedTool === FIELD_TOOL.MATERIAL) {
    paintMaterial(sim, cell.x, cell.y, brushRadius, selectedMaterial);
    return true;
  } else if (selectedTool === FIELD_TOOL.ATTRACTOR) {
    forceField.addAttractor(cell.x, cell.y);
    return true;
  } else if (selectedTool === FIELD_TOOL.ERASER) {
    forceField.erase(cell.x, cell.y, brushRadius);
    return true;
  }
  return false;
}

/** ドラッグ中の素材・風・場消し操作を適用し、変更の有無を返す。 */
function applyToolMove(previousCell, cell) {
  if (selectedTool === FIELD_TOOL.MATERIAL) {
    if (supportsContinuousPaint(selectedMaterial)) {
      paintMaterial(sim, cell.x, cell.y, brushRadius, selectedMaterial);
      return true;
    }
  } else if (selectedTool === FIELD_TOOL.WIND) {
    forceField.paintWindSegment(
      previousCell.x,
      previousCell.y,
      cell.x,
      cell.y,
      brushRadius
    );
    return true;
  } else if (selectedTool === FIELD_TOOL.ERASER) {
    forceField.erase(cell.x, cell.y, brushRadius);
    return true;
  }
  return false;
}

/** 描画ループ。停止中はシミュレーションを進めず、描画だけ続ける。 */
function loop() {
  const nowMs = performance.now();
  if (replayingHistory) {
    updateHistoryReplay(nowMs);
  } else if (!paused) {
    sim.step();
    if (timeline.captureIfDue()) syncTimelineControls();
  }
  renderer.render(sim.grid);
  if (forceOverlay) forceOverlay.render(forceField, nowMs);
  if (overlay) overlay.render(sim.grid, sim.facing, forceField.gravity);
  sonifier.flush(nowMs);
  requestAnimationFrame(loop);
}

boot();
