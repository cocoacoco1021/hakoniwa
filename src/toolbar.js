import { FIELD_TOOL } from "./force-field.js";
import { MAT } from "./materials.js";

/**
 * 選択中の道具と履歴数から、必要な調整項目だけを返す。
 * 入力：道具・素材ID・履歴数 / 出力：各調整項目の表示可否。
 */
export function getToolbarVisibility(selectedTool, selectedMaterial, timelineSize) {
  const adjustsDragon =
    selectedTool === FIELD_TOOL.MATERIAL && selectedMaterial === MAT.DRAGON;
  const adjustsBrush =
    selectedTool === FIELD_TOOL.WIND ||
    selectedTool === FIELD_TOOL.ERASER ||
    (selectedTool === FIELD_TOOL.MATERIAL && selectedMaterial !== MAT.DRAGON);

  return {
    showBrushSize: adjustsBrush,
    showDragonSize: adjustsDragon,
    showTimeline: timelineSize >= 2,
  };
}

/**
 * 操作パネルの開閉を登録し、表示と読み上げ状態を同期する。
 * 入力：開閉ボタン・文言・内容要素・初期状態 / 出力：開閉制御オブジェクト。
 */
export function createToolbarDisclosure({
  toggleButton,
  toggleLabel,
  chevron,
  content,
  initiallyExpanded = false,
}) {
  let expanded = initiallyExpanded;

  const setExpanded = (nextExpanded) => {
    expanded = Boolean(nextExpanded);
    content.hidden = !expanded;
    toggleButton.setAttribute("aria-expanded", String(expanded));
    toggleButton.setAttribute(
      "aria-label",
      expanded ? "操作パネルを閉じる" : "操作パネルを開く"
    );
    toggleLabel.textContent = expanded ? "操作を閉じる" : "操作を開く";
    if (chevron) chevron.textContent = expanded ? "▲" : "▼";
    return expanded;
  };

  toggleButton.addEventListener("click", () => setExpanded(!expanded));
  setExpanded(initiallyExpanded);

  return {
    setExpanded,
    get expanded() {
      return expanded;
    },
  };
}
