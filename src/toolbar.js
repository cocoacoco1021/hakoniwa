import { FIELD_TOOL } from "./force-field.js";
import { MAT } from "./materials.js";

/**
 * 選択中の素材と履歴数から、文脈に応じた追加項目の表示可否を返す。
 * 入力：道具・素材ID・履歴数 / 出力：各調整項目の表示可否。
 */
export function getToolbarVisibility(selectedTool, selectedMaterial, timelineSize) {
  const adjustsDragon =
    selectedTool === FIELD_TOOL.MATERIAL && selectedMaterial === MAT.DRAGON;

  return {
    showBrushSize: true,
    showDragonSize: adjustsDragon,
    showTimeline: timelineSize >= 2,
  };
}

/**
 * 詳細操作の開閉を登録し、表示と読み上げ状態を同期する。
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
      expanded ? "詳細操作を閉じる" : "詳細操作を開く"
    );
    toggleLabel.textContent = expanded ? "閉じる" : "詳細操作";
    if (chevron) chevron.textContent = expanded ? "▼" : "▲";
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
