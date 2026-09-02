// 選択素材ごとの描画規則を、DOMイベントから分離してテスト可能にする。

import { forEachBrushCell } from "./brush.js";
import { MAT } from "./materials.js";

/**
 * 押した位置へ選択素材を配置する。
 * 入力：Simulation互換オブジェクト、中心座標、筆半径、素材ID / 出力：なし
 * ドラゴンは筆サイズにかかわらず、中心へ1体だけ配置する。
 */
export function paintMaterial(simulation, centerX, centerY, radius, materialId) {
  if (materialId === MAT.DRAGON) {
    simulation.spawn(centerX, centerY, MAT.DRAGON);
    return;
  }
  forEachBrushCell(centerX, centerY, radius, (x, y) => {
    simulation.spawn(x, y, materialId);
  });
}

/**
 * ドラッグ中も連続配置する素材か判定する。
 * 入力：素材ID / 出力：連続配置する場合true。
 */
export function supportsContinuousPaint(materialId) {
  return materialId !== MAT.DRAGON;
}
