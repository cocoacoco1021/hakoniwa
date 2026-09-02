// 回転重力・風・引力を保持し、シミュレーションへ力ベクトルを提供する独立モジュール。

import { forEachBrushCell } from "./brush.js";

export const FIELD_TOOL = Object.freeze({
  MATERIAL: "material",
  WIND: "wind",
  ATTRACTOR: "attractor",
  ERASER: "field-eraser",
});

export const DEFAULT_GRAVITY = Object.freeze({ dx: 0, dy: 1 });

/** 回転計算で生じる-0を通常の0へ正規化する。 */
function normalizeAxis(axis) {
  return axis === 0 ? 0 : axis;
}

/**
 * 画面座標系で重力を時計回りに90度回す。
 * 入力：{dx,dy} / 出力：回転後の単位ベクトル。
 */
export function rotateGravityClockwise(gravity) {
  return {
    dx: normalizeAxis(-gravity.dy),
    dy: normalizeAxis(gravity.dx),
  };
}

/**
 * 重力方向を基準に上下左右の単位ベクトルを作る。
 * 入力：gravity / 出力：{ down, up, right, left }。
 */
export function gravityBasis(gravity = DEFAULT_GRAVITY) {
  const down = {
    dx: normalizeAxis(gravity.dx),
    dy: normalizeAxis(gravity.dy),
  };
  const up = {
    dx: normalizeAxis(-down.dx),
    dy: normalizeAxis(-down.dy),
  };
  const right = {
    dx: normalizeAxis(down.dy),
    dy: normalizeAxis(-down.dx),
  };
  const left = {
    dx: normalizeAxis(-right.dx),
    dy: normalizeAxis(-right.dy),
  };
  return { down, up, right, left };
}

/** 重力ベクトルを画面表示用の矢印へ変換する。 */
export function gravityArrow(gravity) {
  if (gravity.dx === 1) return "→";
  if (gravity.dx === -1) return "←";
  if (gravity.dy === -1) return "↑";
  return "↓";
}

/** 元画像の下向きを現在の重力へ合わせるCanvas回転角を返す。 */
export function gravityRotation(gravity = DEFAULT_GRAVITY) {
  return Math.atan2(-gravity.dx, gravity.dy);
}

export class ForceField {
  /**
   * 力場を生成する。
   * 入力：cols, rows, options / 出力：回転重力・風・引力を保持するForceField。
   */
  constructor(cols, rows, options = {}) {
    this.cols = cols;
    this.rows = rows;
    this.moveChance = options.moveChance ?? 0.55;
    this.attractionRadius = options.attractionRadius ?? 24;
    this.maxAttractors = options.maxAttractors ?? 8;
    this.gravity = { ...DEFAULT_GRAVITY };
    this.windX = new Int8Array(cols * rows);
    this.windY = new Int8Array(cols * rows);
    this.attractors = [];
  }

  /** 現在の重力を時計回りに90度回し、回転後を返す。 */
  rotateGravity() {
    this.gravity = rotateGravityClockwise(this.gravity);
    return this.gravity;
  }

  /**
   * ドラッグ区間へ風向きを円形ブラシで描く。
   * 入力：始点・終点セル、半径 / 出力：なし。
   */
  paintWindSegment(fromX, fromY, toX, toY, radius) {
    const direction = quantizeDirection(toX - fromX, toY - fromY);
    if (!direction) return;
    const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY), 1);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = Math.round(fromX + (toX - fromX) * t);
      const y = Math.round(fromY + (toY - fromY) * t);
      forEachBrushCell(x, y, radius, (brushX, brushY) => {
        if (!this.inBounds(brushX, brushY)) return;
        const index = this.index(brushX, brushY);
        this.windX[index] = direction.dx;
        this.windY[index] = direction.dy;
      });
    }
  }

  /** タップ地点へ引力点を追加する。上限超過時は最古の点を外す。 */
  addAttractor(x, y) {
    if (!this.inBounds(x, y)) return;
    this.attractors = this.attractors.filter(
      (point) => point.x !== x || point.y !== y
    );
    this.attractors.push({ x, y });
    if (this.attractors.length > this.maxAttractors) this.attractors.shift();
  }

  /** 指定円内の風と引力点を消す。 */
  erase(x, y, radius) {
    forEachBrushCell(x, y, radius, (brushX, brushY) => {
      if (!this.inBounds(brushX, brushY)) return;
      const index = this.index(brushX, brushY);
      this.windX[index] = 0;
      this.windY[index] = 0;
    });
    const radiusSquared = radius * radius;
    this.attractors = this.attractors.filter((point) => {
      const dx = point.x - x;
      const dy = point.y - y;
      return dx * dx + dy * dy > radiusSquared;
    });
  }

  /** 風と引力点をすべて消す。重力方向は維持する。 */
  clear() {
    this.windX.fill(0);
    this.windY.fill(0);
    this.attractors = [];
  }

  /**
   * 指定セルへ作用する風＋最寄り引力の合成ベクトルを返す。
   * 入力：x, y / 出力：{dx,dy,strength} または力なしならnull。
   */
  vectorAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    const index = this.index(x, y);
    let forceX = this.windX[index];
    let forceY = this.windY[index];
    let strength = forceX || forceY ? 1 : 0;
    let nearest = null;
    let nearestDistance = Infinity;

    for (const point of this.attractors) {
      const dx = point.x - x;
      const dy = point.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance <= this.attractionRadius && distance < nearestDistance) {
        nearest = { dx, dy, distance };
        nearestDistance = distance;
      }
    }

    if (nearest) {
      const attractionStrength = Math.max(
        0.2,
        1 - nearest.distance / this.attractionRadius
      );
      forceX += (nearest.dx / nearest.distance) * attractionStrength;
      forceY += (nearest.dy / nearest.distance) * attractionStrength;
      strength = Math.max(strength, attractionStrength);
    }

    const direction = quantizeDirection(forceX, forceY);
    if (!direction) return null;
    return { ...direction, strength: Math.min(1, strength) };
  }

  /** 描画用に風があるブロックから代表セルを1つずつ列挙する。 */
  forEachWindSample(stride, callback) {
    const size = Math.max(1, Math.floor(stride));
    for (let blockY = 0; blockY < this.rows; blockY += size) {
      for (let blockX = 0; blockX < this.cols; blockX += size) {
        let found = false;
        for (let y = blockY; y < Math.min(this.rows, blockY + size) && !found; y++) {
          for (let x = blockX; x < Math.min(this.cols, blockX + size); x++) {
            const index = this.index(x, y);
            if (this.windX[index] === 0 && this.windY[index] === 0) continue;
            callback(x, y, this.windX[index], this.windY[index]);
            found = true;
            break;
          }
        }
      }
    }
  }

  index(x, y) {
    return y * this.cols + x;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }
}

/** ドラッグ量を8方向の単位ベクトルへ量子化する。 */
function quantizeDirection(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  return {
    dx: absX >= absY * 0.45 ? Math.sign(dx) : 0,
    dy: absY >= absX * 0.45 ? Math.sign(dy) : 0,
  };
}
