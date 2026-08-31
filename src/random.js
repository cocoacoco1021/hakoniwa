// 決定的に再現できる軽量PRNG(mulberry32)。
// シミュレーションへ乱数源を注入するために使う。テストでは種を固定して
// 挙動を再現したり、常に特定値を返す関数へ差し替えたりできる。

/**
 * 種から [0,1) の乱数を返す関数を生成する。
 * 入力：seed(整数) / 出力：() => number（呼ぶたびに次の乱数）
 * 同じ種なら常に同じ列を返すため、リプレイやテストに使える。
 */
export function createRandom(seed = 1) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
