// 粉遊び（Falling Sand）のセルオートマトン・エンジン。
// グリッド上の各セルを素材IDで持ち、1ステップで重力・流動・上昇・反応を解く。
// 描画やDOMには一切依存しない純粋なロジックとして分離し、単体テスト可能にする。

import {
  MAT,
  MATERIALS,
  DENSITY,
  FLAMMABLE,
  BEHAVIOR,
  isStatic,
} from "./materials.js";
import { gravityBasis } from "./force-field.js";
import { REACTION } from "./reactions.js";

// 反応で参照する上下左右の隣接オフセット（4近傍で十分かつ軽い）。
const NEIGHBORS4 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

const FIELD_AFFECTED_BEHAVIORS = new Set([
  "powder",
  "liquid",
  "gas",
  "fire",
  "lava",
  "acid",
  "creature",
  "dragon",
]);

// ドラゴンの向きは横移動量と同じ符号にそろえ、移動・火炎・描画で共有する。
export const DRAGON_FACING = Object.freeze({
  LEFT: -1,
  RIGHT: 1,
});

export class Simulation {
  /**
   * 入力：{ cols, rows, random, physics, creatures, forces, reactions }
   *   cols/rows … グリッドの列・行数
   *   random    … () => [0,1) の乱数源（省略時 Math.random）。テストで差し替え可能
   *   physics   … CONFIG.physics 相当の確率・寿命設定
   *   creatures … CONFIG.creatures 相当の生きもの設定（虫を使わないなら省略可）
   * 役割：グリッドと補助バッファを確保し、シミュレーションの状態を保持する。
   */
  constructor({
    cols,
    rows,
    random = Math.random,
    physics,
    creatures = {},
    forces = null,
    reactions = null,
  }) {
    this.cols = cols;
    this.rows = rows;
    this.random = random;
    this.physics = physics;
    this.creatures = creatures;
    this.forces = forces;
    this.reactions = reactions;
    this.gravityFrame = gravityBasis(forces?.gravity);

    const size = cols * rows;
    this.grid = new Uint8Array(size); // 各セルの素材ID
    this.life = new Uint16Array(size); // 火/煙/蒸気の残り寿命
    this.facing = new Int8Array(size); // ドラゴンの向き（左=-1 / 右=1、他素材=0）
    this.moved = new Uint8Array(size); // このステップで確定済みか（二重処理防止）
    this.frame = 0; // 走査方向を交互にするためのフレーム番号
  }

  /** セル座標をグリッド添字へ変換する */
  index(x, y) {
    return y * this.cols + x;
  }

  /** 座標がグリッド内か判定する（範囲外は暗黙の固い壁として扱う） */
  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  /** 指定セルの素材IDを返す（範囲外は WALL 相当＝押しのけ不可） */
  get(x, y) {
    if (!this.inBounds(x, y)) return MAT.WALL;
    return this.grid[this.index(x, y)];
  }

  /**
   * セルへ素材を配置する。火/煙/蒸気は寿命も設定する。
   * 入力：x, y, id（素材ID）/ 出力：なし
   * 筆で描くとき・生成反応のどちらからも使う唯一の書き込み口。
   */
  spawn(x, y, id) {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.grid[i] = id;
    this.life[i] = this._initialLife(id);
    this.facing[i] = id === MAT.DRAGON ? DRAGON_FACING.LEFT : 0;
  }

  /** グリッド全体を空にする */
  clear() {
    this.grid.fill(MAT.EMPTY);
    this.life.fill(0);
    this.facing.fill(0);
  }

  /**
   * 1ステップ進める（全セルを1回走査して更新する）。
   * 入力：なし / 出力：なし
   * 走査順は固定しつつ、重力方向は各移動規則へ注入する。横方向の偏りを
   * 避けるためフレームごとに左右を交互にし、moved で二重処理を防ぐ。
   */
  step() {
    this.moved.fill(0);
    this.gravityFrame = gravityBasis(this.forces?.gravity);
    const leftToRight = (this.frame & 1) === 0;

    for (let y = this.rows - 1; y >= 0; y--) {
      for (let k = 0; k < this.cols; k++) {
        const x = leftToRight ? k : this.cols - 1 - k;
        const i = this.index(x, y);
        if (this.moved[i]) continue;

        const behavior = BEHAVIOR[this.grid[i]];
        if (this._applyFieldForce(x, y, behavior)) continue;

        switch (behavior) {
          case "powder":
            this._updatePowder(x, y);
            break;
          case "liquid":
            this._updateLiquid(x, y);
            break;
          case "gas":
            this._updateGas(x, y);
            break;
          case "fire":
            this._updateFire(x, y);
            break;
          case "lava":
            this._updateLava(x, y);
            break;
          case "acid":
            this._updateAcid(x, y);
            break;
          case "plant":
            this._updatePlant(x, y);
            break;
          case "creature":
            this._updateBug(x, y);
            break;
          case "dragon":
            this._updateDragon(x, y);
            break;
          // empty / static は何もしない（着火は火/溶岩側から作用する）
        }
      }
    }
    this.frame++;
  }

  // ------------------------------------------------------------------
  // 移動の基本部品
  // ------------------------------------------------------------------

  /** from が target のセルへ「落下/沈降」で入れるか（target が軽く、動かせるか） */
  _canSink(fromId, x, y) {
    if (!this.inBounds(x, y)) return false;
    const j = this.index(x, y);
    if (this.moved[j]) return false;
    const targetId = this.grid[j];
    return !isStatic(targetId) && DENSITY[targetId] < DENSITY[fromId];
  }

  /** from が target のセルへ「上昇」で入れるか（target が重く、動かせるか） */
  _canRise(fromId, x, y) {
    if (!this.inBounds(x, y)) return false;
    const j = this.index(x, y);
    if (this.moved[j]) return false;
    const targetId = this.grid[j];
    return !isStatic(targetId) && DENSITY[targetId] > DENSITY[fromId];
  }

  /** (x1,y1) と (x2,y2) の中身を入れ替え、両方を確定済みにする */
  _swap(x1, y1, x2, y2) {
    const a = this.index(x1, y1);
    const b = this.index(x2, y2);
    const tmpGrid = this.grid[a];
    this.grid[a] = this.grid[b];
    this.grid[b] = tmpGrid;
    const tmpLife = this.life[a];
    this.life[a] = this.life[b];
    this.life[b] = tmpLife;
    const tmpFacing = this.facing[a];
    this.facing[a] = this.facing[b];
    this.facing[b] = tmpFacing;
    this.moved[a] = 1;
    this.moved[b] = 1;
  }

  /** セルを別素材へ変え、寿命を再設定して確定済みにする（反応の書き込み口） */
  _convert(x, y, id) {
    const i = this.index(x, y);
    this.grid[i] = id;
    this.life[i] = this._initialLife(id);
    this.facing[i] = id === MAT.DRAGON ? DRAGON_FACING.LEFT : 0;
    this.moved[i] = 1;
  }

  /**
   * 風・引力がある場合、動く素材を空セルへ1歩押す。
   * 入力：セル座標とbehavior / 出力：移動した場合true。
   */
  _applyFieldForce(x, y, behavior) {
    if (!this.forces || !FIELD_AFFECTED_BEHAVIORS.has(behavior)) return false;
    const force = this.forces.vectorAt(x, y);
    if (!force) return false;
    if (this.random() >= this.forces.moveChance * force.strength) return false;

    const candidates = [{ dx: force.dx, dy: force.dy }];
    if (force.dx !== 0 && force.dy !== 0) {
      const axes = this.random() < 0.5
        ? [{ dx: force.dx, dy: 0 }, { dx: 0, dy: force.dy }]
        : [{ dx: 0, dy: force.dy }, { dx: force.dx, dy: 0 }];
      candidates.push(...axes);
    }

    for (const candidate of candidates) {
      const nx = x + candidate.dx;
      const ny = y + candidate.dy;
      if (!this.inBounds(nx, ny)) continue;
      const target = this.index(nx, ny);
      if (this.moved[target] || this.grid[target] !== MAT.EMPTY) continue;
      this._swap(x, y, nx, ny);
      return true;
    }
    return false;
  }

  /** 反応を購読者へ通知する。入力：種類・座標・強度 / 出力：なし。 */
  _emitReaction(type, x, y, intensity = 1) {
    this.reactions?.emit(type, x, y, intensity);
  }

  /** 火/煙/蒸気の初期寿命（＝虫なら初期エネルギー）を、設定のゆらぎ幅で散らして返す */
  _initialLife(id) {
    // 虫は寿命ではなくエネルギーを life に持つ。ゆらぎは付けず一定値で始める。
    if (id === MAT.BUG) return this.creatures.bugStartEnergy ?? 0;
    const { fireLife, smokeLife, steamLife, lifeJitter } = this.physics;
    let base = 0;
    if (id === MAT.FIRE) base = fireLife;
    else if (id === MAT.SMOKE) base = smokeLife;
    else if (id === MAT.STEAM) base = steamLife;
    if (base === 0) return 0;
    const jitter = 1 + (this.random() * 2 - 1) * lifeJitter;
    return Math.max(1, Math.round(base * jitter));
  }

  // ------------------------------------------------------------------
  // 素材ごとの更新
  // ------------------------------------------------------------------

  /** 粉体：真下→斜め下の順に沈む。横流れはせず安息角で積もる。 */
  _updatePowder(x, y) {
    const id = this.grid[this.index(x, y)];
    const { down, right } = this.gravityFrame;
    if (this._canSink(id, x + down.dx, y + down.dy)) {
      return this._swap(x, y, x + down.dx, y + down.dy);
    }

    const [first, second] = this._randomSides();
    const firstX = x + down.dx + right.dx * first;
    const firstY = y + down.dy + right.dy * first;
    if (this._canSink(id, firstX, firstY)) return this._swap(x, y, firstX, firstY);
    const secondX = x + down.dx + right.dx * second;
    const secondY = y + down.dy + right.dy * second;
    if (this._canSink(id, secondX, secondY)) return this._swap(x, y, secondX, secondY);
  }

  /** 液体：真下→斜め下→真横の順に動く。密度差で軽い液体の上へ乗る。 */
  _updateLiquid(x, y) {
    const id = this.grid[this.index(x, y)];
    const { down, right } = this.gravityFrame;
    if (this._canSink(id, x + down.dx, y + down.dy)) {
      return this._swap(x, y, x + down.dx, y + down.dy);
    }

    const [first, second] = this._randomSides();
    const firstDiagonalX = x + down.dx + right.dx * first;
    const firstDiagonalY = y + down.dy + right.dy * first;
    if (this._canSink(id, firstDiagonalX, firstDiagonalY)) {
      return this._swap(x, y, firstDiagonalX, firstDiagonalY);
    }
    const secondDiagonalX = x + down.dx + right.dx * second;
    const secondDiagonalY = y + down.dy + right.dy * second;
    if (this._canSink(id, secondDiagonalX, secondDiagonalY)) {
      return this._swap(x, y, secondDiagonalX, secondDiagonalY);
    }

    // 横流れ：軽い（＝流れ込める）方向へ1セル移動して水平に広がる
    const firstSideX = x + right.dx * first;
    const firstSideY = y + right.dy * first;
    if (this._canSink(id, firstSideX, firstSideY)) {
      return this._swap(x, y, firstSideX, firstSideY);
    }
    const secondSideX = x + right.dx * second;
    const secondSideY = y + right.dy * second;
    if (this._canSink(id, secondSideX, secondSideY)) {
      return this._swap(x, y, secondSideX, secondSideY);
    }
  }

  /** 気体：寿命で消滅（蒸気は稀に凝結）。上→斜め上→横へ上昇・拡散する。 */
  _updateGas(x, y) {
    const i = this.index(x, y);
    const id = this.grid[i];

    if (this.life[i] > 0) this.life[i]--;
    if (this.life[i] <= 0) {
      // 蒸気は一定確率で水へ戻る（結露）。それ以外は消える。
      if (id === MAT.STEAM && this.random() < this.physics.steamCondenseChance) {
        this._convert(x, y, MAT.WATER);
        this._emitReaction(REACTION.CONDENSATION, x, y);
      } else {
        this._convert(x, y, MAT.EMPTY);
      }
      return;
    }

    const { up, right } = this.gravityFrame;
    if (this._canRise(id, x + up.dx, y + up.dy)) {
      return this._swap(x, y, x + up.dx, y + up.dy);
    }
    const [first, second] = this._randomSides();
    const firstDiagonalX = x + up.dx + right.dx * first;
    const firstDiagonalY = y + up.dy + right.dy * first;
    if (this._canRise(id, firstDiagonalX, firstDiagonalY)) {
      return this._swap(x, y, firstDiagonalX, firstDiagonalY);
    }
    const secondDiagonalX = x + up.dx + right.dx * second;
    const secondDiagonalY = y + up.dy + right.dy * second;
    if (this._canRise(id, secondDiagonalX, secondDiagonalY)) {
      return this._swap(x, y, secondDiagonalX, secondDiagonalY);
    }
    const firstSideX = x + right.dx * first;
    const firstSideY = y + right.dy * first;
    if (this._canRise(id, firstSideX, firstSideY)) {
      return this._swap(x, y, firstSideX, firstSideY);
    }
    const secondSideX = x + right.dx * second;
    const secondSideY = y + right.dy * second;
    if (this._canRise(id, secondSideX, secondSideY)) {
      return this._swap(x, y, secondSideX, secondSideY);
    }
  }

  /** 火：寿命管理・可燃物への着火・水での消火を行い、気体のように上昇する。 */
  _updateFire(x, y) {
    const i = this.index(x, y);
    const { igniteChance, fireToSmokeChance, extinguishChance } = this.physics;

    // 隣に水があれば消えやすい（水は蒸気へ）
    for (const [dx, dy] of NEIGHBORS4) {
      if (this.get(x + dx, y + dy) === MAT.WATER && this.random() < extinguishChance) {
        this._convert(x + dx, y + dy, MAT.STEAM);
        this._convert(x, y, MAT.SMOKE);
        return;
      }
    }

    // 隣接する可燃物へ着火する
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && FLAMMABLE[this.grid[this.index(nx, ny)]]) {
        if (this.random() < igniteChance) {
          this._convert(nx, ny, MAT.FIRE);
          this._emitReaction(REACTION.IGNITION, nx, ny);
        }
      }
    }

    if (this.life[i] > 0) this.life[i]--;
    if (this.life[i] <= 0) {
      const next = this.random() < fireToSmokeChance ? MAT.SMOKE : MAT.EMPTY;
      this._convert(x, y, next);
      return;
    }

    // 上昇（気体と同じ動き）
    const { up, right } = this.gravityFrame;
    if (this._canRise(MAT.FIRE, x + up.dx, y + up.dy)) {
      return this._swap(x, y, x + up.dx, y + up.dy);
    }
    const [first, second] = this._randomSides();
    const firstX = x + up.dx + right.dx * first;
    const firstY = y + up.dy + right.dy * first;
    if (this._canRise(MAT.FIRE, firstX, firstY)) return this._swap(x, y, firstX, firstY);
    const secondX = x + up.dx + right.dx * second;
    const secondY = y + up.dy + right.dy * second;
    if (this._canRise(MAT.FIRE, secondX, secondY)) return this._swap(x, y, secondX, secondY);
  }

  /** 溶岩：重い液体として流れつつ、可燃物へ着火し、水に触れると石(壁)へ固化する。 */
  _updateLava(x, y) {
    const { igniteChance, lavaMoveChance, lavaSmokeChance } = this.physics;

    // 水と接触 → 溶岩は固化(壁)、水は蒸気へ
    for (const [dx, dy] of NEIGHBORS4) {
      if (this.get(x + dx, y + dy) === MAT.WATER) {
        this._convert(x + dx, y + dy, MAT.STEAM);
        this._convert(x, y, MAT.WALL);
        return;
      }
    }

    // 可燃物へ着火する
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && FLAMMABLE[this.grid[this.index(nx, ny)]]) {
        if (this.random() < igniteChance) {
          this._convert(nx, ny, MAT.FIRE);
          this._emitReaction(REACTION.IGNITION, nx, ny);
        }
      }
    }

    // 真上が空なら稀に煙を噴く（見た目の演出）
    const { up } = this.gravityFrame;
    if (
      this.get(x + up.dx, y + up.dy) === MAT.EMPTY &&
      this.random() < lavaSmokeChance
    ) {
      this._convert(x + up.dx, y + up.dy, MAT.SMOKE);
    }

    // 粘性表現：一定確率でしか動かさない
    if (this.random() > lavaMoveChance) return;
    this._updateLiquid(x, y);
  }

  /** 植物：静止したまま、隣接する水へ稀に成長して広がる。可燃。 */
  _updatePlant(x, y) {
    if (this.random() >= this.physics.plantGrowChance) return;
    const [dx, dy] = NEIGHBORS4[Math.floor(this.random() * NEIGHBORS4.length)];
    if (this.get(x + dx, y + dy) === MAT.WATER) this._convert(x + dx, y + dy, MAT.PLANT);
  }

  /** 酸：液体として流れつつ、隣接する可溶物(砂/木/植物)を溶かし、自身も消費される。 */
  _updateAcid(x, y) {
    const { acidDissolveChance, acidConsumeChance } = this.physics;
    for (const [dx, dy] of NEIGHBORS4) {
      const target = this.get(x + dx, y + dy);
      const dissolvable =
        target === MAT.SAND ||
        target === MAT.WOOD ||
        target === MAT.PLANT ||
        target === MAT.BUG;
      if (dissolvable && this.random() < acidDissolveChance) {
        this._convert(x + dx, y + dy, MAT.EMPTY);
        this._emitReaction(REACTION.DISSOLUTION, x + dx, y + dy);
        if (this.random() < acidConsumeChance) {
          this._convert(x, y, MAT.EMPTY);
          return;
        }
      }
    }
    this._updateLiquid(x, y);
  }

  // ------------------------------------------------------------------
  // 生きもの（虫）：意思を持って動く個体。他素材と違い「探して・避けて・
  // 食べて・増えて・死ぬ」。エネルギー(life)を軸に生態系ループを作る。
  // ------------------------------------------------------------------

  /**
   * 虫1個体を1ステップ更新する。
   * 入力：x, y（虫セルの座標）/ 出力：なし
   * 優先度: 餓死 → 焼死/溺死 → 危険回避 → 採餌 → 繁殖 → 索餌 → 落下 → 徘徊。
   * 生存に関わる行動を先に解き、いずれか成立したらそのステップは終える。
   */
  _updateBug(x, y) {
    const i = this.index(x, y);
    const c = this.creatures;

    // 生存コストでエネルギーを1消費。尽きたら餓死して消える。
    const energy = this.life[i] - 1;
    this.life[i] = energy;
    if (energy <= 0) return this._convert(x, y, MAT.EMPTY);

    // 隣に火/溶岩があれば焼死して煙になる。
    if (this._hasNeighbor(x, y, (id) => id === MAT.FIRE || id === MAT.LAVA)) {
      return this._convert(x, y, MAT.SMOKE);
    }

    // 水に3方向以上囲まれたら溺死する（潜ってしまった状態）。
    if (this._countNeighbors(x, y, (id) => id === MAT.WATER) >= 3) {
      return this._convert(x, y, MAT.EMPTY);
    }

    // 危険（火/溶岩）を感知したら反対方向へ逃げる（生存優先）。
    const danger = this._senseDir(x, y, (id) => id === MAT.FIRE || id === MAT.LAVA);
    if (danger && this._bugStep(x, y, -Math.sign(danger.dx), -Math.sign(danger.dy))) {
      return;
    }

    // 隣接する植物を食べる（そのセルへ移動しエネルギーを回復）。
    for (const [dx, dy] of NEIGHBORS4) {
      if (this.get(x + dx, y + dy) === MAT.PLANT) {
        return this._moveBug(x, y, x + dx, y + dy, c.bugEatEnergy);
      }
    }

    // エネルギーが十分なら繁殖する（空き隣接へ子を産み、自身は消耗する）。
    if (energy >= c.bugReproEnergy && this.random() < c.bugReproChance) {
      const spot = this._firstEmptyNeighbor(x, y);
      if (spot) {
        this.life[i] = energy - c.bugReproCost;
        return this._convert(spot.x, spot.y, MAT.BUG);
      }
    }

    // 餌（植物）を感知したらその方向へ寄る（斜め→水平→垂直の順に試す）。
    const food = this._senseDir(x, y, (id) => id === MAT.PLANT);
    if (food) {
      const sx = Math.sign(food.dx);
      const sy = Math.sign(food.dy);
      if (this._bugStep(x, y, sx, sy)) return;
      if (sx && this._bugStep(x, y, sx, 0)) return;
      if (sy && this._bugStep(x, y, 0, sy)) return;
    }

    // 下が空なら落下する（浮かせない）。
    const { down, right } = this.gravityFrame;
    if (this.get(x + down.dx, y + down.dy) === MAT.EMPTY) {
      return this._moveBug(x, y, x + down.dx, y + down.dy, 0);
    }

    // 徘徊：確率で左右どちらかへ1歩進む（空きへ、または砂を掘って）。
    if (this.random() < c.bugMoveChance) {
      const [first, second] = this._randomSides();
      if (this._bugStep(x, y, right.dx * first, right.dy * first)) return;
      this._bugStep(x, y, right.dx * second, right.dy * second);
    }
  }

  /**
   * 虫を(dx,dy)方向へ1歩動かそうと試みる。
   * 入力：x, y（現在地）, dx, dy（進む向き。各-1/0/1）/ 出力：動けたら true
   * 空セルへは移動、植物へは移動して採餌、砂へは確率で掘って進む。それ以外は不可。
   */
  _bugStep(x, y, dx, dy) {
    if (dx === 0 && dy === 0) return false;
    const nx = x + dx;
    const ny = y + dy;
    if (!this.inBounds(nx, ny)) return false;

    const target = this.grid[this.index(nx, ny)];
    if (target === MAT.EMPTY) {
      this._moveBug(x, y, nx, ny, 0);
      return true;
    }
    if (target === MAT.PLANT) {
      this._moveBug(x, y, nx, ny, this.creatures.bugEatEnergy);
      return true;
    }
    if (target === MAT.SAND && this.random() < this.creatures.bugDigChance) {
      this._swap(x, y, nx, ny); // 砂を掘る＝押しのけて入れ替わる（エネルギーも一緒に運ばれる）
      return true;
    }
    return false;
  }

  /**
   * 虫を(nx,ny)へ移動させ、移動先の中身は消費する（空/植物へ入る唯一の口）。
   * 入力：x, y（元の座標）, nx, ny（移動先）, gain（回復エネルギー。採餌時に正）
   * 出力：なし。エネルギーは上限で頭打ちにし、元セルは空にする。
   */
  _moveBug(x, y, nx, ny, gain) {
    const from = this.index(x, y);
    const to = this.index(nx, ny);
    const energy = Math.min(this.creatures.bugMaxEnergy, this.life[from] + gain);
    this.grid[to] = MAT.BUG;
    this.life[to] = energy;
    this.facing[to] = 0;
    this.moved[to] = 1;
    this.grid[from] = MAT.EMPTY;
    this.life[from] = 0;
    this.facing[from] = 0;
    this.moved[from] = 1;
  }

  // ------------------------------------------------------------------
  // ドラゴン：大きな見た目を1セルで管理し、地上を歩いて向いている方へ火を吐く。
  // 火・溶岩は素材定義で非可燃として扱うため、接触しても燃えない。
  // ------------------------------------------------------------------

  /**
   * ドラゴン1体を1ステップ更新する。
   * 入力：x, y（ドラゴンセルの座標）/ 出力：なし
   * 空中では落下し、接地中は火炎、低確率の左右移動の順で行動する。
   */
  _updateDragon(x, y) {
    const c = this.creatures;
    const { down, right } = this.gravityFrame;

    if (this.get(x + down.dx, y + down.dy) === MAT.EMPTY) {
      this._moveDragon(x, y, x + down.dx, y + down.dy);
      return;
    }

    if (this.random() < c.dragonFireChance) {
      this._breatheDragonFire(x, y);
      return;
    }

    if (this.random() >= c.dragonMoveChance) return;
    const [first, second] = this._randomSides();
    if (this.get(x + right.dx * first, y + right.dy * first) === MAT.EMPTY) {
      this._moveDragon(x, y, x + right.dx * first, y + right.dy * first);
      return;
    }
    if (this.get(x + right.dx * second, y + right.dy * second) === MAT.EMPTY) {
      this._moveDragon(x, y, x + right.dx * second, y + right.dy * second);
    }
  }

  /**
   * ドラゴンが向いている方向へ火炎を伸ばす。
   * 入力：x, y（ドラゴンセルの座標）/ 出力：なし
   * 空気・可燃物・虫を火へ変え、水は蒸気へ変える。不燃物で火炎を止める。
   */
  _breatheDragonFire(x, y) {
    const facing = this.facing[this.index(x, y)] || DRAGON_FACING.LEFT;
    const { right } = this.gravityFrame;
    for (let distance = 1; distance <= this.creatures.dragonFireRange; distance++) {
      const fireX = x + right.dx * facing * distance;
      const fireY = y + right.dy * facing * distance;
      const target = this.get(fireX, fireY);
      if (target === MAT.WATER) {
        this._convert(fireX, fireY, MAT.STEAM);
        return;
      }
      if (
        target === MAT.EMPTY ||
        target === MAT.FIRE ||
        target === MAT.SMOKE ||
        target === MAT.BUG ||
        FLAMMABLE[target]
      ) {
        this._convert(fireX, fireY, MAT.FIRE);
        if (target === MAT.BUG || FLAMMABLE[target]) {
          this._emitReaction(REACTION.IGNITION, fireX, fireY);
        }
        continue;
      }
      return;
    }
  }

  /**
   * ドラゴンを空セルへ移動する。
   * 入力：x, y（元の座標）, nx, ny（移動先）/ 出力：なし
   * 水平移動なら進行方向へ向きを更新し、落下なら現在の向きを保つ。
   */
  _moveDragon(x, y, nx, ny) {
    const from = this.index(x, y);
    const to = this.index(nx, ny);
    const { right } = this.gravityFrame;
    const tangentDirection = Math.sign((nx - x) * right.dx + (ny - y) * right.dy);
    const facing = tangentDirection || this.facing[from] || DRAGON_FACING.LEFT;
    this.grid[to] = MAT.DRAGON;
    this.life[to] = 0;
    this.facing[to] = facing;
    this.moved[to] = 1;
    this.grid[from] = MAT.EMPTY;
    this.life[from] = 0;
    this.facing[from] = 0;
    this.moved[from] = 1;
  }

  /** 感知範囲内で predicate に合う最も近いセルへの方向 {dx,dy} を返す（無ければ null） */
  _senseDir(x, y, predicate) {
    const radius = this.creatures.bugSenseRadius;
    let best = null;
    let bestDist = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (!predicate(this.grid[this.index(nx, ny)])) continue;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = { dx, dy };
        }
      }
    }
    return best;
  }

  /** 4近傍のいずれかが predicate を満たすか */
  _hasNeighbor(x, y, predicate) {
    for (const [dx, dy] of NEIGHBORS4) {
      if (predicate(this.get(x + dx, y + dy))) return true;
    }
    return false;
  }

  /** 4近傍のうち predicate を満たすセル数 */
  _countNeighbors(x, y, predicate) {
    let count = 0;
    for (const [dx, dy] of NEIGHBORS4) {
      if (predicate(this.get(x + dx, y + dy))) count++;
    }
    return count;
  }

  /** 4近傍で最初に見つかる空セルの座標を返す（無ければ null） */
  _firstEmptyNeighbor(x, y) {
    for (const [dx, dy] of NEIGHBORS4) {
      if (this.get(x + dx, y + dy) === MAT.EMPTY) return { x: x + dx, y: y + dy };
    }
    return null;
  }

  /** 左右どちらを先に試すかを乱数で決める（横方向の偏りを消す） */
  _randomSides() {
    return this.random() < 0.5 ? [-1, 1] : [1, -1];
  }
}
