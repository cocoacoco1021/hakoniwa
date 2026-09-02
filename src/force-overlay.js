// 風ベクトルと引力点を盤面上へ薄く重ね描画する表示専用モジュール。

/**
 * 力場オーバーレイを生成する。
 * 入力：canvas, グリッド寸法, options / 出力：{ render, resize }。
 */
export function createForceOverlay(canvas, cols, rows, options) {
  return new ForceOverlay(canvas, cols, rows, options);
}

class ForceOverlay {
  constructor(canvas, cols, rows, options) {
    this.ctx = canvas.getContext("2d");
    this.cols = cols;
    this.rows = rows;
    this.width = canvas.width;
    this.height = canvas.height;
    this.sampleStride = options.sampleStride;
    this.windColor = options.windColor;
    this.attractorColor = options.attractorColor;
    this.reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  /** 表示キャンバスの寸法を更新する。 */
  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * 現在の風と引力点を描く。
   * 入力：ForceField, 時刻(ms) / 出力：なし。
   */
  render(forceField, nowMs) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    const cellW = this.width / this.cols;
    const cellH = this.height / this.rows;
    const arrowSize = Math.max(5, Math.min(cellW, cellH) * this.sampleStride * 0.55);

    ctx.strokeStyle = this.windColor;
    ctx.fillStyle = this.windColor;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 1.5;
    forceField.forEachWindSample(this.sampleStride, (x, y, dx, dy) => {
      drawArrow(
        ctx,
        (x + 0.5) * cellW,
        (y + 0.5) * cellH,
        dx,
        dy,
        arrowSize
      );
    });

    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(nowMs * 0.004) * 0.12;
    ctx.strokeStyle = this.attractorColor;
    ctx.fillStyle = this.attractorColor;
    ctx.globalAlpha = 0.68;
    for (const point of forceField.attractors) {
      const x = (point.x + 0.5) * cellW;
      const y = (point.y + 0.5) * cellH;
      const radius = Math.max(8, Math.min(cellW, cellH) * 2.4 * pulse);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** 方向付きの短い矢印を描く。 */
function drawArrow(ctx, x, y, dx, dy, size) {
  const length = Math.hypot(dx, dy) || 1;
  const unitX = dx / length;
  const unitY = dy / length;
  const startX = x - unitX * size * 0.45;
  const startY = y - unitY * size * 0.45;
  const endX = x + unitX * size * 0.45;
  const endY = y + unitY * size * 0.45;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
  const sideX = -unitY;
  const sideY = unitX;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - unitX * size * 0.28 + sideX * size * 0.16,
    endY - unitY * size * 0.28 + sideY * size * 0.16
  );
  ctx.lineTo(
    endX - unitX * size * 0.28 - sideX * size * 0.16,
    endY - unitY * size * 0.28 - sideY * size * 0.16
  );
  ctx.closePath();
  ctx.fill();
}
