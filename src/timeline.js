// シミュレーション・乱数・力場を軽量スナップショットとして保持する時間軸レイヤー。

export class TimelineConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimelineConfigError";
  }
}

export class TimelineStateError extends Error {
  constructor(message) {
    super(message);
    this.name = "TimelineStateError";
  }
}

/**
 * 世界の現在状態を独立したTypedArrayへ複製する。
 * 入力：simulation, random, forceField / 出力：復元可能なスナップショット。
 */
export function captureWorldState({ simulation, random, forceField }) {
  if (typeof random?.getState !== "function") {
    throw new TimelineStateError("乱数源にgetStateがありません");
  }
  return {
    frame: simulation.frame,
    randomState: random.getState(),
    grid: simulation.grid.slice(),
    life: simulation.life.slice(),
    facing: simulation.facing.slice(),
    gravity: { ...forceField.gravity },
    windX: forceField.windX.slice(),
    windY: forceField.windY.slice(),
    attractors: forceField.attractors.map((point) => ({ ...point })),
  };
}

/**
 * 保存状態を既存インスタンスへ戻す。
 * 入力：snapshot, simulation, random, forceField / 出力：なし。
 */
export function restoreWorldState({ snapshot, simulation, random, forceField }) {
  validateSnapshotSize(snapshot, simulation, forceField);
  if (typeof random?.setState !== "function") {
    throw new TimelineStateError("乱数源にsetStateがありません");
  }

  simulation.grid.set(snapshot.grid);
  simulation.life.set(snapshot.life);
  simulation.facing.set(snapshot.facing);
  simulation.moved.fill(0);
  simulation.frame = snapshot.frame;
  random.setState(snapshot.randomState);

  forceField.gravity = { ...snapshot.gravity };
  forceField.windX.set(snapshot.windX);
  forceField.windY.set(snapshot.windY);
  forceField.attractors = snapshot.attractors.map((point) => ({ ...point }));
}

/** スナップショットと復元先の配列寸法が一致することを保証する。 */
function validateSnapshotSize(snapshot, simulation, forceField) {
  const simulationSize = simulation.cols * simulation.rows;
  const forceSize = forceField.cols * forceField.rows;
  if (
    snapshot.grid.length !== simulationSize ||
    snapshot.life.length !== simulationSize ||
    snapshot.facing.length !== simulationSize ||
    snapshot.windX.length !== forceSize ||
    snapshot.windY.length !== forceSize
  ) {
    throw new TimelineStateError("スナップショットと現在の盤面サイズが一致しません");
  }
}

/** 固定容量のリングバッファでスナップショットと現在位置を管理する。 */
export class TimelineHistory {
  constructor(maxSnapshots) {
    if (!Number.isInteger(maxSnapshots) || maxSnapshots < 2) {
      throw new TimelineConfigError("履歴容量は2以上の整数で指定してください");
    }
    this.maxSnapshots = maxSnapshots;
    this.buffer = new Array(maxSnapshots);
    this.start = 0;
    this.size = 0;
    this.cursor = -1;
  }

  /** 新しい状態を末尾へ追加し、容量超過時は最古の状態を上書きする。 */
  record(snapshot) {
    if (!this.isLatest()) this.truncateAfter(this.cursor);
    if (this.size < this.maxSnapshots) {
      this.buffer[this._physicalIndex(this.size)] = snapshot;
      this.size++;
    } else {
      this.buffer[this.start] = snapshot;
      this.start = (this.start + 1) % this.maxSnapshots;
    }
    this.cursor = this.size - 1;
    return this.cursor;
  }

  /** 最新状態を置き換える。履歴が空なら新規追加する。 */
  replaceLatest(snapshot) {
    if (this.size === 0) return this.record(snapshot);
    this.buffer[this._physicalIndex(this.size - 1)] = snapshot;
    this.cursor = this.size - 1;
    return this.cursor;
  }

  /** 指定位置へカーソルを移し、そのスナップショットを返す。 */
  seek(index) {
    this._assertIndex(index);
    this.cursor = index;
    return this.get(index);
  }

  /** カーソルを1つ未来へ進める。末尾なら同じ状態を返す。 */
  advance() {
    if (this.size === 0) return null;
    this.cursor = Math.min(this.size - 1, this.cursor + 1);
    return this.get(this.cursor);
  }

  /** 指定位置より未来の履歴を捨て、分岐可能な末尾にする。 */
  truncateAfter(index) {
    this._assertIndex(index);
    for (let logicalIndex = index + 1; logicalIndex < this.size; logicalIndex++) {
      this.buffer[this._physicalIndex(logicalIndex)] = undefined;
    }
    this.size = index + 1;
    this.cursor = index;
  }

  /** 指定位置のスナップショットを返す。 */
  get(index) {
    this._assertIndex(index);
    return this.buffer[this._physicalIndex(index)];
  }

  /** カーソルが最新状態かを返す。空の履歴も最新として扱う。 */
  isLatest() {
    return this.size === 0 || this.cursor === this.size - 1;
  }

  _physicalIndex(logicalIndex) {
    return (this.start + logicalIndex) % this.maxSnapshots;
  }

  _assertIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.size) {
      throw new TimelineStateError(`履歴位置が範囲外です: ${index}`);
    }
  }
}

/** 世界状態の記録間隔と復元をまとめて扱う。 */
export class WorldTimeline {
  constructor({
    simulation,
    random,
    forceField,
    maxSnapshots,
    captureIntervalSteps,
  }) {
    if (!Number.isInteger(captureIntervalSteps) || captureIntervalSteps < 1) {
      throw new TimelineConfigError("記録間隔は1以上の整数で指定してください");
    }
    this.simulation = simulation;
    this.random = random;
    this.forceField = forceField;
    this.captureIntervalSteps = captureIntervalSteps;
    this.history = new TimelineHistory(maxSnapshots);
    this.lastCapturedFrame = -Infinity;
  }

  get size() {
    return this.history.size;
  }

  get cursor() {
    return this.history.cursor;
  }

  /** 現在世界を履歴末尾へ追加する。 */
  captureNow() {
    const index = this.history.record(this._capture());
    this.lastCapturedFrame = this.simulation.frame;
    return index;
  }

  /** 現在世界で履歴末尾を置き換える。ドラッグ中の連続入力に使う。 */
  replaceLatest() {
    const index = this.history.replaceLatest(this._capture());
    this.lastCapturedFrame = this.simulation.frame;
    return index;
  }

  /** 設定したステップ間隔に達した場合だけ現在世界を記録する。 */
  captureIfDue() {
    if (this.simulation.frame - this.lastCapturedFrame < this.captureIntervalSteps) {
      return false;
    }
    this.captureNow();
    return true;
  }

  /** 指定履歴へ世界を復元する。 */
  seek(index) {
    const snapshot = this.history.seek(index);
    this._restore(snapshot);
    return snapshot;
  }

  /** 1つ未来の履歴へ世界を復元する。 */
  advance() {
    const snapshot = this.history.advance();
    if (snapshot) this._restore(snapshot);
    return snapshot;
  }

  /** 現在位置より未来を破棄する。破棄が起きた場合trueを返す。 */
  branch() {
    if (this.history.isLatest()) return false;
    this.history.truncateAfter(this.history.cursor);
    this.lastCapturedFrame = this.simulation.frame;
    return true;
  }

  isLatest() {
    return this.history.isLatest();
  }

  getSnapshot(index) {
    return this.history.get(index);
  }

  _capture() {
    return captureWorldState({
      simulation: this.simulation,
      random: this.random,
      forceField: this.forceField,
    });
  }

  _restore(snapshot) {
    restoreWorldState({
      snapshot,
      simulation: this.simulation,
      random: this.random,
      forceField: this.forceField,
    });
    this.lastCapturedFrame = this.simulation.frame;
  }
}
