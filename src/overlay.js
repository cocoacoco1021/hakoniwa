// 生きもの（虫・ドラゴン）を画像で描く重ね描画層。
// グリッド本体（renderer.js）の上に透明なキャンバスを重ね、生きものセルの位置へ
// 拡大したスプライトを描く。物理・シミュレーションには一切依存させず、
// 「生きものの見せ方」だけをここへ閉じ込める（renderer と同じく描画の責務分離）。

import {
  DRAGON_IMAGE_DATA_URL,
  makeDarkPixelsTransparent,
} from "./dragon-image.js";
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
 * 出力：{ render(grid), resize(w, h) }
 * 呼び出し側は毎フレーム、本体描画のあとに render(grid) を呼ぶ。
 */
export function createCreatureOverlay(canvas, cols, rows, options) {
  return new CreatureOverlay(canvas, cols, rows, options);
}

/**
 * 生きもの画像を指定位置へ描く。
 * 入力：ctx, sprite, dx/dy（左上）, width/height, facesRight（右向きならtrue）
 * 出力：なし。右向きだけ画像の中心を保ったまま左右反転する。
 */
export function drawCreatureSprite(
  ctx,
  sprite,
  dx,
  dy,
  width,
  height,
  facesRight = false
) {
  if (!facesRight) {
    ctx.drawImage(sprite, dx, dy, width, height);
    return;
  }

  ctx.save();
  try {
    ctx.translate(dx + width, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0, width, height);
  } finally {
    ctx.restore();
  }
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
   * 入力：grid(Uint8Array)（素材ID）, facing(Int8Array)（ドラゴンの向き）
   * 出力：なし
   * 拡大時にぼかさず（ドット絵らしく）、個体の中心へスプライトを置く。
   */
  render(grid, facing) {
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
      const dx = (cx + 0.5) * cellW - spriteW / 2;
      // ドラゴンは足元を論理セルへ合わせ、地面に立って見えるよう上向きに描く。
      const dy = id === MAT.DRAGON
        ? (cy + 1) * cellH - spriteH
        : (cy + 0.5) * cellH - spriteH / 2;
      const facesRight = id === MAT.DRAGON && (facing?.[i] ?? 0) > 0;
      drawCreatureSprite(ctx, sprite, dx, dy, spriteW, spriteH, facesRight);
    }
  }
}
