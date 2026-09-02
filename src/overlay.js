// 生きもの（虫・ドラゴン）を画像で描く重ね描画層。
// グリッド本体（renderer.js）の上に透明なキャンバスを重ね、生きものセルの位置へ
// 拡大したスプライトを描く。物理・シミュレーションには一切依存させず、
// 「生きものの見せ方」だけをここへ閉じ込める（renderer と同じく描画の責務分離）。

import {
  DRAGON_IMAGE_DATA_URL,
  makeDarkPixelsTransparent,
} from "./dragon-image.js";
import { DEFAULT_GRAVITY, gravityRotation } from "./force-field.js";
import { MAT, MATERIALS } from "./materials.js";
import { BUG_SPRITE, spritePixels } from "./sprites.js";

/** 0xRRGGBB を CSS の #rrggbb 文字列へ変換する */
function hexColor(value) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

/**
 * 生きものの画像オーバーレイを生成する。
 * 入力：canvas（重ね描き用の透明キャンバス）, cols, rows（論理グリッド寸法）,
 *       options（虫・ドラゴンの表示設定）
 * 出力：{ render(grid, facing, gravity), resize(w, h) }
 * 呼び出し側は毎フレーム、本体描画のあとに render を呼ぶ。
 */
export function createCreatureOverlay(canvas, cols, rows, options) {
  return new CreatureOverlay(canvas, cols, rows, options);
}

/**
 * 生きもの画像を指定位置へ描く。
 * 入力：ctx, sprite, dx/dy（左上）, width/height, facesRight, rotation
 * 出力：なし。足元を固定し、向き反転と重力方向への回転を適用する。
 */
export function drawCreatureSprite(
  ctx,
  sprite,
  dx,
  dy,
  width,
  height,
  facesRight = false,
  rotation = 0
) {
  if (!facesRight && rotation === 0) {
    ctx.drawImage(sprite, dx, dy, width, height);
    return;
  }

  ctx.save();
  try {
    ctx.translate(dx + width / 2, dy + height);
    ctx.rotate(rotation);
    ctx.scale(facesRight ? -1 : 1, 1);
    ctx.drawImage(sprite, -width / 2, -height, width, height);
  } finally {
    ctx.restore();
  }
}

/**
 * 重力面へ足元を合わせるドラゴン画像の左上座標を返す。
 * 入力：セル位置・セル寸法・画像寸法・重力 / 出力：{ dx, dy }。
 */
export function dragonSpriteOrigin(
  cellX,
  cellY,
  cellWidth,
  cellHeight,
  spriteWidth,
  spriteHeight,
  gravity = DEFAULT_GRAVITY
) {
  const centerX = (cellX + 0.5) * cellWidth;
  const centerY = (cellY + 0.5) * cellHeight;
  const anchorX = centerX + gravity.dx * cellWidth * 0.5;
  const anchorY = centerY + gravity.dy * cellHeight * 0.5;
  return {
    dx: anchorX - spriteWidth / 2,
    dy: anchorY - spriteHeight,
  };
}

class CreatureOverlay {
  constructor(canvas, cols, rows, options) {
    this.ctx = canvas.getContext("2d");
    this.cols = cols;
    this.rows = rows;
    this.width = canvas.width;
    this.height = canvas.height;
    this.bugSpriteCells = options.bugSpriteCells;
    this.dragonSpriteCells = options.dragonSpriteCells;
    // 虫のドット絵を実寸(ビットマップ解像度)のオフスクリーンへ一度だけ焼いておき、
    // 毎フレームは drawImage で拡大転写する（描画コストを抑える）。
    this.bugSprite = this._bakeSprite(
      BUG_SPRITE,
      MATERIALS[MAT.BUG].color,
      options.bugSpriteDark
    );
    this.dragonSprite = this._loadDragonSprite(
      DRAGON_IMAGE_DATA_URL,
      options.dragonBackgroundThreshold
    );
  }

  /** ビットマップを実寸のオフスクリーンcanvasへ塗る（主色=体、副色=頭/脚/斑） */
  _bakeSprite(bitmap, bodyColor, darkColor) {
    const { width, height, body, dark } = spritePixels(bitmap);
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const ctx = off.getContext("2d");
    ctx.fillStyle = hexColor(bodyColor);
    for (const p of body) ctx.fillRect(p.x, p.y, 1, 1);
    ctx.fillStyle = hexColor(darkColor);
    for (const p of dark) ctx.fillRect(p.x, p.y, 1, 1);
    return off;
  }

  /**
   * 添付画像を読み込み、黒背景を透明にしたオフスクリーンcanvasを返す。
   * 入力：dataUrl（画像データ）, threshold（黒背景とみなすRGB上限）
   * 出力：読み込み完了後に画像が描かれるcanvas。
   */
  _loadDragonSprite(dataUrl, threshold) {
    const off = document.createElement("canvas");
    const image = new Image();
    image.addEventListener("load", () => {
      off.width = image.naturalWidth;
      off.height = image.naturalHeight;
      const ctx = off.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(0, 0, off.width, off.height);
      imageData.data.set(makeDarkPixelsTransparent(imageData.data, threshold));
      ctx.putImageData(imageData, 0, 0);
    });
    image.src = dataUrl;
    return off;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * 生きものセルを走査し、各位置へ画像を拡大描画する。
   * 入力：grid（素材ID）, facing（ドラゴンの向き）, gravity（重力方向）
   * 出力：なし
   * 拡大時にぼかさず（ドット絵らしく）、個体の中心へスプライトを置く。
   */
  render(grid, facing, gravity = DEFAULT_GRAVITY) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = false; // ドット絵をくっきり拡大する

    const cellW = this.width / this.cols;
    const cellH = this.height / this.rows;

    for (let i = 0; i < grid.length; i++) {
      const id = grid[i];
      if (id !== MAT.BUG && id !== MAT.DRAGON) continue;
      const cx = i % this.cols;
      const cy = (i / this.cols) | 0;
      const sprite = id === MAT.DRAGON ? this.dragonSprite : this.bugSprite;
      const spriteCells = id === MAT.DRAGON
        ? this.dragonSpriteCells
        : this.bugSpriteCells;
      const spriteW = cellW * spriteCells;
      const spriteH = cellH * spriteCells;
      const origin = id === MAT.DRAGON
        ? dragonSpriteOrigin(
          cx,
          cy,
          cellW,
          cellH,
          spriteW,
          spriteH,
          gravity
        )
        : {
          dx: (cx + 0.5) * cellW - spriteW / 2,
          dy: (cy + 0.5) * cellH - spriteH / 2,
        };
      const facesRight = id === MAT.DRAGON && (facing?.[i] ?? 0) > 0;
      const rotation = id === MAT.DRAGON ? gravityRotation(gravity) : 0;
      drawCreatureSprite(
        ctx,
        sprite,
        origin.dx,
        origin.dy,
        spriteW,
        spriteH,
        facesRight,
        rotation
      );
    }
  }
}
