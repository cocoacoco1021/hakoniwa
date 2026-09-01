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

// 反応で参照する上下左右の隣接オフセット（4近傍で十分かつ軽い）。
const NEIGHBORS4 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

export class Simulation {
  /**
   * 入力：{ cols, rows, random, physics, creatures }
   *   cols/rows … グリッドの列・行数
   *   random    … () => [0,1) の乱数源（省略時 Math.random）。テストで差し替え可能
   *   physics   … CONFIG.physics 相当の確率・寿命設定
   *   creatures … CONFIG.creatures 相当の生きもの設定（虫を使わないなら省略可）
   * 役割：グリッドと補助バッファを確保し、シミュレーションの状態を保持する。
   */
  constructor({ cols, rows, random = Math.random, physics, creatures = {} }) {
    this.cols = cols;
    this.rows = rows;
    this.random = random;
    this.physics = physics;
    this.creatures = creatures;

    const size = cols * rows;
    this.grid = new Uint8Array(size); // 各セルの素材ID
    this.life = new Uint16Array(size); // 火/煙/蒸気の残り寿命
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
  }

  /** グリッド全体を空にする */
  clear() {
    this.grid.fill(MAT.EMPTY);
    this.life.fill(0);
  }

  /**
   * 1ステップ進める（全セルを1回走査して更新する）。
   * 入力：なし / 出力：なし
   * 重力を正しく解くため下の行から上へ走査し、横方向の偏りを避けるため
   * フレームごとに左右の走査向きを交互にする。moved で二重処理を防ぐ。
   */
  step() {
    this.moved.fill(0);
    const leftToRight = (this.frame & 1) === 0;

    for (let y = this.rows - 1; y >= 0; y--) {
      for (let k = 0; k < this.cols; k++) {
        const x = leftToRight ? k : this.cols - 1 - k;
        const i = this.index(x, y);
        if (this.moved[i]) continue;

        switch (BEHAVIOR[this.grid[i]]) {
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
    this.moved[a] = 1;
    this.moved[b] = 1;
  }

  /** セルを別素材へ変え、寿命を再設定して確定済みにする（反応の書き込み口） */
  _convert(x, y, id) {
    const i = this.index(x, y);
    this.grid[i] = id;
    this.life[i] = this._initialLife(id);
    this.moved[i] = 1;
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
    if (this._canSink(id, x, y + 1)) return this._swap(x, y, x, y + 1);

    const [first, second] = this._randomSides();
    if (this._canSink(id, x + first, y + 1)) return this._swap(x, y, x + first, y + 1);
    if (this._canSink(id, x + second, y + 1)) return this._swap(x, y, x + second, y + 1);
  }

  /** 液体：真下→斜め下→真横の順に動く。密度差で軽い液体の上へ乗る。 */
  _updateLiquid(x, y) {
    const id = this.grid[this.index(x, y)];
    if (this._canSink(id, x, y + 1)) return this._swap(x, y, x, y + 1);

    const [first, second] = this._randomSides();
    if (this._canSink(id, x + first, y + 1)) return this._swap(x, y, x + first, y + 1);
    if (this._canSink(id, x + second, y + 1)) return this._swap(x, y, x + second, y + 1);

    // 横流れ：軽い（＝流れ込める）方向へ1セル移動して水平に広がる
    if (this._canSink(id, x + first, y)) return this._swap(x, y, x + first, y);
    if (this._canSink(id, x + second, y)) return this._swap(x, y, x + second, y);
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
      } else {
        this._convert(x, y, MAT.EMPTY);
      }
      return;
    }

    if (this._canRise(id, x, y - 1)) return this._swap(x, y, x, y - 1);
    const [first, second] = this._randomSides();
    if (this._canRise(id, x + first, y - 1)) return this._swap(x, y, x + first, y - 1);
    if (this._canRise(id, x + second, y - 1)) return this._swap(x, y, x + second, y - 1);
    if (this._canRise(id, x + first, y)) return this._swap(x, y, x + first, y);
    if (this._canRise(id, x + second, y)) return this._swap(x, y, x + second, y);
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
        if (this.random() < igniteChance) this._convert(nx, ny, MAT.FIRE);
      }
    }

    if (this.life[i] > 0) this.life[i]--;
    if (this.life[i] <= 0) {
      const next = this.random() < fireToSmokeChance ? MAT.SMOKE : MAT.EMPTY;
      this._convert(x, y, next);
      return;
    }

    // 上昇（気体と同じ動き）
    if (this._canRise(MAT.FIRE, x, y - 1)) return this._swap(x, y, x, y - 1);
    const [first, second] = this._randomSides();
    if (this._canRise(MAT.FIRE, x + first, y - 1)) return this._swap(x, y, x + first, y - 1);
    if (this._canRise(MAT.FIRE, x + second, y - 1)) return this._swap(x, y, x + second, y - 1);
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
        if (this.random() < igniteChance) this._convert(nx, ny, MAT.FIRE);
      }
    }

    // 真上が空なら稀に煙を噴く（見た目の演出）
    if (this.get(x, y - 1) === MAT.EMPTY && this.random() < lavaSmokeChance) {
      this._convert(x, y - 1, MAT.SMOKE);
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
    if (this.get(x, y + 1) === MAT.EMPTY) return this._moveBug(x, y, x, y + 1, 0);

    // 徘徊：確率で左右どちらかへ1歩進む（空きへ、または砂を掘って）。
    if (this.random() < c.bugMoveChance) {
      const [first, second] = this._randomSides();
      if (this._bugStep(x, y, first, 0)) return;
      this._bugStep(x, y, second, 0);
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
    this.moved[to] = 1;
    this.grid[from] = MAT.EMPTY;
    this.life[from] = 0;
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
