// 物理反応の通知を、シミュレーションと音響表現から分離するイベント境界。

export const REACTION = Object.freeze({
  IGNITION: "ignition",
  CONDENSATION: "condensation",
  DISSOLUTION: "dissolution",
});

export class ReactionBus {
  constructor() {
    this.listeners = new Set();
  }

  /**
   * 反応の購読を開始する。
   * 入力：listener(event) / 出力：購読解除関数。
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 反応を購読者へ通知する。
   * 入力：type, x, y, intensity / 出力：なし。
   */
  emit(type, x, y, intensity = 1) {
    const event = { type, x, y, intensity };
    for (const listener of this.listeners) listener(event);
  }
}
