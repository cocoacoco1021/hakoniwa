// グリッドを画面へ描画する層。WebGL2があれば発光(グロー)付きで描き、
// 非対応なら Canvas2D にフォールバックする。シミュレーション本体からは独立させ、
// 「見せ方」の責務だけをここに閉じ込める。

import { MATERIALS } from "./materials.js";

// 素材ID → [r, g, b, emissive] の参照表を作る（0xRRGGBB を分解）。
// emissive は発光の強さ(0-255)。火/溶岩だけが正の値を持つ。
const COLOR_LUT = MATERIALS.map((m) => [
  (m.color >> 16) & 0xff,
  (m.color >> 8) & 0xff,
  m.color & 0xff,
  m.emissive,
]);

/** 添字から [0,1) の擬似乱数を返す（セルごとの明度ゆらぎ用の安価なハッシュ） */
function hash01(i) {
  return (Math.imul(i ^ (i >>> 15), 2654435761) >>> 0) / 4294967296;
}

/**
 * 描画器を生成する。WebGL2優先・失敗時はCanvas2D。
 * 入力：canvas, cols, rows, options{ background, glowStrength, glowRadius, cellJitter }
 * 出力：{ mode, render(grid), resize(w, h) }
 * mode は "webgl2" | "canvas2d"。呼び出し側は毎フレーム render(grid) を呼ぶ。
 */
export function createRenderer(canvas, cols, rows, options) {
  try {
    return new WebGLRenderer(canvas, cols, rows, options);
  } catch (error) {
    // WebGL2初期化に失敗しても止めない。2Dへ退避する。
    console.error("[falling-sand] WebGL2非対応のためCanvas2Dへ退避", error);
    return new Canvas2DRenderer(canvas, cols, rows, options);
  }
}

/**
 * グリッドをRGBAピクセル列へ変換して buffer へ書き込む。
 * 入力：grid(Uint8Array), buffer(Uint8ClampedArray), opaque(bool)
 * 出力：なし
 * opaque=true なら不透明表示用に alpha=255、false なら alpha に emissive を入れる
 * （WebGL側でグローのマスクに使う）。非発光セルは添字ハッシュで微妙に明度を散らす。
 */
function fillPixels(grid, buffer, opaque, background, cellJitter) {
  const bg = [
    (background >> 16) & 0xff,
    (background >> 8) & 0xff,
    background & 0xff,
  ];
  for (let i = 0; i < grid.length; i++) {
    const id = grid[i];
    const p = i * 4;
    const lut = COLOR_LUT[id];
    if (id === 0) {
      // 空セルは背景色で塗る（Canvas2Dで透けないようにする）
      buffer[p] = bg[0];
      buffer[p + 1] = bg[1];
      buffer[p + 2] = bg[2];
      buffer[p + 3] = opaque ? 255 : 0;
      continue;
    }
    const emissive = lut[3];
    // 発光素材はそのまま、それ以外はセルごとに明度を少し散らす
    const jitter = emissive > 0 ? 1 : 1 + (hash01(i) - 0.5) * cellJitter;
    buffer[p] = lut[0] * jitter;
    buffer[p + 1] = lut[1] * jitter;
    buffer[p + 2] = lut[2] * jitter;
    buffer[p + 3] = opaque ? 255 : emissive;
  }
}

// ---------------------------------------------------------------------------
// WebGL2 経路：テクスチャ＋全画面三角形。フラグメントで簡易グローを足す。
// ---------------------------------------------------------------------------

const VERT_SRC = `#version 300 es
out vec2 vUv;
const vec2 verts[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){
  vec2 p = verts[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uTexel;        // 1テクセルのUVサイズ
uniform float uGlowStrength;
uniform float uGlowRadius;
in vec2 vUv;
out vec4 frag;
void main(){
  // グリッド行0を画面上端へ合わせるためY反転してサンプルする
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 c = texture(uTex, uv);
  vec3 col = c.rgb;
  // 近傍8方向の発光(alpha)を集めて安価なにじみを作る
  vec3 glow = vec3(0.0);
  for(int i = 0; i < 8; i++){
    float a = float(i) / 8.0 * 6.2831853;
    vec2 o = vec2(cos(a), sin(a)) * uTexel * uGlowRadius;
    vec4 s = texture(uTex, uv + o);
    glow += s.rgb * s.a;
  }
  glow /= 8.0;
  col += glow * uGlowStrength;   // 周囲へのにじみ
  col += c.rgb * c.a * 0.4;      // 発光セル自身の増光
  frag = vec4(col, 1.0);
}`;

class WebGLRenderer {
  constructor(canvas, cols, rows, options) {
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) throw new Error("webgl2 context unavailable");

    this.gl = gl;
    this.cols = cols;
    this.rows = rows;
    this.options = options;
    this.mode = "webgl2";
    this.pixels = new Uint8ClampedArray(cols * rows * 4);

    this.program = this._buildProgram();
    this.vao = gl.createVertexArray(); // 属性なしの空VAO（gl_VertexIDで頂点生成）
    this.texture = this._buildTexture();

    this.uTexel = gl.getUniformLocation(this.program, "uTexel");
    this.uGlowStrength = gl.getUniformLocation(this.program, "uGlowStrength");
    this.uGlowRadius = gl.getUniformLocation(this.program, "uGlowRadius");
  }

  _compile(type, src) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  _buildProgram() {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, this._compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(program, this._compile(gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }

  _buildTexture() {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // セルをくっきり見せるため拡大は最近傍。端はクランプ。
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  resize(width, height) {
    this.gl.viewport(0, 0, width, height);
  }

  render(grid) {
    const gl = this.gl;
    fillPixels(grid, this.pixels, false, this.options.background, this.options.cellJitter);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, this.cols, this.rows, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, this.pixels
    );

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uTexel, 1 / this.cols, 1 / this.rows);
    gl.uniform1f(this.uGlowStrength, this.options.glowStrength);
    gl.uniform1f(this.uGlowRadius, this.options.glowRadius);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

// ---------------------------------------------------------------------------
// Canvas2D 経路：オフスクリーンに等倍で描き、表示canvasへ拡大転写する。
// ---------------------------------------------------------------------------

class Canvas2DRenderer {
  constructor(canvas, cols, rows, options) {
    this.ctx = canvas.getContext("2d");
    this.canvas = canvas;
    this.cols = cols;
    this.rows = rows;
    this.options = options;
    this.mode = "canvas2d";

    // 論理解像度のオフスクリーンへ描いてから拡大する（ピクセルアート調）
    this.offscreen = document.createElement("canvas");
    this.offscreen.width = cols;
    this.offscreen.height = rows;
    this.offctx = this.offscreen.getContext("2d");
    this.imageData = this.offctx.createImageData(cols, rows);
  }

  resize() {
    // 拡大時にぼかさず、くっきり見せる
    this.ctx.imageSmoothingEnabled = false;
  }

  render(grid) {
    fillPixels(grid, this.imageData.data, true, this.options.background, this.options.cellJitter);
    this.offctx.putImageData(this.imageData, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
  }
}
