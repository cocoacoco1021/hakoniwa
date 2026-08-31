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
   * 入力：{ cols, rows, random, physics }
   *   cols/rows … グリッドの列・行数
   *   random   … () => [0,1) の乱数源（省略時 Math.random）。テストで差し替え可能
   *   physics  … CONFIG.physics 相当の確率・寿命設定
   * 役割：グリッドと補助バッファを確保し、シミュレーションの状態を保持する。
   */
  constructor({ cols, rows, random = Math.random, physics }) {
    this.cols = cols;
    this.rows = rows;
    this.random = random;
    this.physics = physics;

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

  /** 火/煙/蒸気の初期寿命を、設定のゆらぎ幅で散らして返す */
  _initialLife(id) {
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
        target === MAT.SAND || target === MAT.WOOD || target === MAT.PLANT;
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

  /** 左右どちらを先に試すかを乱数で決める（横方向の偏りを消す） */
  _randomSides() {
    return this.random() < 0.5 ? [-1, 1] : [1, -1];
  }
}
