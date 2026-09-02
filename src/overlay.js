// 生きもの（虫・ドラゴン）をドット絵で描く重ね描画層。
// グリッド本体（renderer.js）の上に透明なキャンバスを重ね、生きものセルの位置へ
// 拡大したドット絵スプライトを描く。物理・シミュレーションには一切依存させず、
// 「生きものの見せ方」だけをここへ閉じ込める（renderer と同じく描画の責務分離）。

import { MAT, MATERIALS } from "./materials.js";
import { BUG_SPRITE, DRAGON_SPRITE, spritePixels, spriteLayers } from "./sprites.js";

/** 0xRRGGBB を CSS の #rrggbb 文字列へ変換する */
function hexColor(value) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

/**
 * 生きもののドット絵オーバーレイを生成する。
 * 入力：canvas（重ね描き用の透明キャンバス）, cols, rows（論理グリッド寸法）,
 *       options{ bugSpriteCells, bugSpriteDark, dragonSpriteCells }
 * 出力：{ render(grid, headings), resize(w, h) }
 * 呼び出し側は毎フレーム、本体描画のあとに render(grid, headings) を呼ぶ。
 */
export function createCreatureOverlay(canvas, cols, rows, options) {
  return new CreatureOverlay(canvas, cols, rows, options);
}

class CreatureOverlay {
  constructor(canvas, cols, rows, options) {
    this.ctx = canvas.getContext("2d");
    this.cols = cols;
    this.rows = rows;
    this.width = canvas.width;
    this.height = canvas.height;
    this.bugCells = options.bugSpriteCells;
    this.dragonCells = options.dragonSpriteCells;
    // ドット絵を実寸(ビットマップ解像度)のオフスクリーンへ一度だけ焼いておき、
    // 毎フレームは drawImage で拡大転写する（描画コストを抑える）。
    this.bugSprite = this._bakeBug(
      BUG_SPRITE,
      MATERIALS[MAT.BUG].color,
      options.bugSpriteDark
    );
    this.dragonSprite = this._bakeMulti(DRAGON_SPRITE);
  }

  /** 虫（2色）のビットマップを実寸オフスクリーンへ塗る（主色=体、副色=頭/脚/斑） */
  _bakeBug(bitmap, bodyColor, darkColor) {
    const { width, height, body, dark } = spritePixels(bitmap);
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const ctx = off.getContext("2d");
    ctx.fillStyle = hexColor(bodyColor);
    for (const p of body) ctx.fillRect(p.x, p.y, 1, 1);
    ctx.fillStyle = hexColor(darkColor);
    for (const p of dark) ctx.fillRect(p.x, p.y, 1, 1);
    return { canvas: off, width, height };
  }

  /** 多色（ドラゴン等）のビットマップを実寸オフスクリーンへ色ごとに塗る */
  _bakeMulti(sprite) {
    const { width, height, layers } = spriteLayers(sprite);
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const ctx = off.getContext("2d");
    for (const layer of layers) {
      ctx.fillStyle = hexColor(layer.color);
      for (const p of layer.pixels) ctx.fillRect(p.x, p.y, 1, 1);
    }
    return { canvas: off, width, height };
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * 生きものセルを走査し、各位置へドット絵を拡大描画する。
   * 入力：grid(Uint8Array)（素材IDの並び）, headings(Int8Array|undefined ドラゴンの向き)
   * 出力：なし。拡大時はぼかさず（ドット絵らしく）、個体の中心へスプライトを置く。
   */
  render(grid, headings) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = false; // ドット絵をくっきり拡大する

    const cellW = this.width / this.cols;
    const cellH = this.height / this.rows;
    const bugW = cellW * this.bugCells;
    const bugH = cellH * this.bugCells;
    // ドラゴンは絵柄の縦横比を保って拡大する（横幅をセル数で決め、高さは比率で従属）
    const dragonW = cellW * this.dragonCells;
    const dragonH = dragonW * (this.dragonSprite.height / this.dragonSprite.width);

    for (let i = 0; i < grid.length; i++) {
      const id = grid[i];
      if (id !== MAT.BUG && id !== MAT.DRAGON) continue;
      const cx = i % this.cols;
      const cy = (i / this.cols) | 0;

      if (id === MAT.BUG) {
        // セル中心にスプライトの中心を合わせる（1セルの個体を数セル分へ拡大）
        const dx = (cx + 0.5) * cellW - bugW / 2;
        const dy = (cy + 0.5) * cellH - bugH / 2;
        ctx.drawImage(this.bugSprite.canvas, dx, dy, bugW, bugH);
        continue;
      }

      // ドラゴン：セル中心へ拡大描画。右向き(heading>0)のときは左右反転して見せる。
      const dx = (cx + 0.5) * cellW - dragonW / 2;
      const dy = (cy + 0.5) * cellH - dragonH / 2;
      const facingRight = headings && headings[i] > 0;
      if (facingRight) {
        ctx.save();
        ctx.translate(dx + dragonW, dy);
        ctx.scale(-1, 1); // 水平反転（スプライトは左向きなので右向きのとき反転）
        ctx.drawImage(this.dragonSprite.canvas, 0, 0, dragonW, dragonH);
        ctx.restore();
      } else {
        ctx.drawImage(this.dragonSprite.canvas, dx, dy, dragonW, dragonH);
      }
    }
  }
}
