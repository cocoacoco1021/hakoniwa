// 生きもの（虫）をドット絵で描く重ね描画層。
// グリッド本体（renderer.js）の上に透明なキャンバスを重ね、虫セルの位置へ
// 拡大したドット絵スプライトを描く。物理・シミュレーションには一切依存させず、
// 「虫の見せ方」だけをここへ閉じ込める（renderer と同じく描画の責務分離）。

import { MAT, MATERIALS } from "./materials.js";
import { BUG_SPRITE, spritePixels } from "./sprites.js";

/** 0xRRGGBB を CSS の #rrggbb 文字列へ変換する */
function hexColor(value) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

/**
 * 虫のドット絵オーバーレイを生成する。
 * 入力：canvas（重ね描き用の透明キャンバス）, cols, rows（論理グリッド寸法）,
 *       options{ bugSpriteCells, bugSpriteDark }
 * 出力：{ render(grid), resize(w, h) }
 * 呼び出し側は毎フレーム、本体描画のあとに render(grid) を呼ぶ。
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
    this.spriteCells = options.bugSpriteCells;
    // 虫のドット絵を実寸(ビットマップ解像度)のオフスクリーンへ一度だけ焼いておき、
    // 毎フレームは drawImage で拡大転写する（描画コストを抑える）。
    this.sprite = this._bakeSprite(
      BUG_SPRITE,
      MATERIALS[MAT.BUG].color,
      options.bugSpriteDark
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

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * 虫セルを走査し、各位置へドット絵を拡大描画する。
   * 入力：grid(Uint8Array)（素材IDの並び）/ 出力：なし
   * 拡大時にぼかさず（ドット絵らしく）、個体の中心へスプライトを置く。
   */
  render(grid) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = false; // ドット絵をくっきり拡大する

    const cellW = this.width / this.cols;
    const cellH = this.height / this.rows;
    const spriteW = cellW * this.spriteCells;
    const spriteH = cellH * this.spriteCells;

    for (let i = 0; i < grid.length; i++) {
      if (grid[i] !== MAT.BUG) continue;
      const cx = i % this.cols;
      const cy = (i / this.cols) | 0;
      // セル中心にスプライトの中心を合わせる（1セルの個体を数セル分へ拡大）
      const dx = (cx + 0.5) * cellW - spriteW / 2;
      const dy = (cy + 0.5) * cellH - spriteH / 2;
      ctx.drawImage(this.sprite, dx, dy, spriteW, spriteH);
    }
  }
}
