// ドラゴン画像の埋め込み形式と、黒背景の透明化処理を検証する。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DRAGON_IMAGE_DATA_URL,
  makeDarkPixelsTransparent,
} from "../src/dragon-image.js";

test("添付画像は外部通信不要なJPEGデータURLとして保持される", () => {
  const prefix = "data:image/jpeg;base64,";
  assert.ok(DRAGON_IMAGE_DATA_URL.startsWith(prefix));

  const jpegBytes = Buffer.from(DRAGON_IMAGE_DATA_URL.slice(prefix.length), "base64");
  assert.ok(jpegBytes.length > 5_000);
  assert.deepEqual([...jpegBytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
});

test("黒に近い背景だけを透明にし、元の画素配列は変更しない", () => {
  const sourcePixels = new Uint8ClampedArray([
    0, 0, 0, 255,
    24, 20, 12, 200,
    25, 20, 12, 180,
    0, 180, 70, 255,
  ]);

  const transparentPixels = makeDarkPixelsTransparent(sourcePixels, 24);

  assert.deepEqual([...transparentPixels], [
    0, 0, 0, 0,
    24, 20, 12, 0,
    25, 20, 12, 180,
    0, 180, 70, 255,
  ]);
  assert.equal(sourcePixels[3], 255);
  assert.equal(sourcePixels[7], 200);
});
