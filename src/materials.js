// 素材の定義表。挙動(behavior)と密度(density)、色、可燃性などをここへ集約する。
// シミュレーションの物理・化学はこの表を参照して分岐するので、
// 新素材の追加は原則この配列へ1要素足すだけで済む（拡張の一点化）。
//
// density（密度）の意味:
//   - 大きいほど「下へ沈む/上のものを押しのける」。
//   - EMPTY(空気)=1 を基準に、気体=0（軽くて上昇）、液体/粉体はそれ以上。
//   - 静的固体(壁/木/植物)は Infinity として絶対に押しのけられないようにする。

// 素材ID（数値）。グリッドは Uint8Array にこのIDを詰める。
export const MAT = {
  EMPTY: 0,
  WALL: 1,
  SAND: 2,
  WATER: 3,
  OIL: 4,
  FIRE: 5,
  SMOKE: 6,
  STEAM: 7,
  WOOD: 8,
  PLANT: 9,
  LAVA: 10,
  ACID: 11,
  BUG: 12,
  DRAGON: 13,
};

// behavior はステップ処理の分岐キー。physics 側はこれで挙動を選ぶ。
//   empty  : 何もしない空セル
//   static : 動かない固体（壁/木）。可燃なら火に着火される側
//   powder : 粉体（落下＋斜め崩れ。横流れはしない）
//   liquid : 液体（落下＋横流れ）
//   gas    : 気体（上昇＋拡散＋寿命で消滅）
//   fire   : 火（上昇＋着火＋寿命）
//   lava   : 溶岩（重い液体＋着火＋水で固化）
//   acid   : 酸（液体＋可溶物を溶かす）
//   plant  : 植物（静止＋水へ成長。可燃）
//   creature: 生きもの（虫）。意思を持って動く個体。採餌・繁殖・逃避・餓死する
//   dragon : 火を吐く生きもの。歩き回り、炎に強く、進行方向へ火炎を放つ
export const MATERIALS = [
  { id: MAT.EMPTY, key: "empty", label: "消しゴム", behavior: "empty", density: 1, color: 0x0b0d12, emissive: 0, flammable: false },
  { id: MAT.WALL, key: "wall", label: "壁", behavior: "static", density: Infinity, color: 0x6b7280, emissive: 0, flammable: false },
  { id: MAT.SAND, key: "sand", label: "砂", behavior: "powder", density: 5, color: 0xe6c66e, emissive: 0, flammable: false },
  { id: MAT.WATER, key: "water", label: "水", behavior: "liquid", density: 4, color: 0x3b82f6, emissive: 0, flammable: false },
  { id: MAT.OIL, key: "oil", label: "油", behavior: "liquid", density: 3, color: 0x6b4a2b, emissive: 0, flammable: true },
  { id: MAT.FIRE, key: "fire", label: "火", behavior: "fire", density: 0, color: 0xff5a1f, emissive: 255, flammable: false },
  { id: MAT.SMOKE, key: "smoke", label: "煙", behavior: "gas", density: 0, color: 0x565b64, emissive: 0, flammable: false },
  { id: MAT.STEAM, key: "steam", label: "蒸気", behavior: "gas", density: 0, color: 0xb8c4d0, emissive: 0, flammable: false },
  { id: MAT.WOOD, key: "wood", label: "木", behavior: "static", density: Infinity, color: 0x7a4a24, emissive: 0, flammable: true },
  { id: MAT.PLANT, key: "plant", label: "植物", behavior: "plant", density: Infinity, color: 0x2fbf4f, emissive: 0, flammable: true },
  { id: MAT.LAVA, key: "lava", label: "溶岩", behavior: "lava", density: 6, color: 0xff6a00, emissive: 220, flammable: false },
  { id: MAT.ACID, key: "acid", label: "酸", behavior: "acid", density: 4, color: 0x9be600, emissive: 0, flammable: false },
  // 虫は密度Infinity＝他素材から押し流されない（＝isStatic扱い）。移動は creature ロジックが担う。
  { id: MAT.BUG, key: "bug", label: "虫", behavior: "creature", density: Infinity, color: 0xff2d95, emissive: 0, flammable: false },
  // ドラゴンも密度Infinity。移動・火吐きは dragon ロジックが担う。炎に強く flammable=false。
  { id: MAT.DRAGON, key: "dragon", label: "ドラゴン", behavior: "dragon", density: Infinity, color: 0x35a34a, emissive: 0, flammable: false },
];

// ID から素材定義を引くための添字表（配列添字＝ID なのでそのまま使える）。
export const DENSITY = MATERIALS.map((m) => m.density);
export const FLAMMABLE = MATERIALS.map((m) => m.flammable);
export const BEHAVIOR = MATERIALS.map((m) => m.behavior);

/**
 * 素材IDが「静的固体」か判定する（壁/木/植物など密度Infinity）。
 * 入力：id / 出力：boolean
 * 落下・押しのけの対象から外すために使う。
 */
export function isStatic(id) {
  return DENSITY[id] === Infinity;
}
