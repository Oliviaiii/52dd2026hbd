import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gallery = JSON.parse(readFileSync(resolve(projectRoot, "data/gallery.json"), "utf8"));

test("gallery items use unique local image paths", () => {
  assert.ok(Array.isArray(gallery.items));
  assert.equal(gallery.items.length, 18);
  assert.equal(gallery.items[0].src, "img/S__71237641_0.jpg");

  const paths = gallery.items.map((item) => item.src);
  assert.equal(new Set(paths).size, paths.length);
  paths.forEach((path) => assert.ok(existsSync(resolve(projectRoot, path)), `Missing image: ${path}`));
});

test("gallery items include accessible labels", () => {
  gallery.items.forEach((item) => {
    assert.ok(item.title?.trim(), `Missing title for ${item.src}`);
    assert.ok(item.alt?.trim(), `Missing alt text for ${item.src}`);
    assert.ok(item.crop?.top >= 0, `Missing crop top for ${item.src}`);
    assert.ok(item.crop?.bottom > item.crop?.top, `Invalid crop bottom for ${item.src}`);
    assert.ok(item.crop?.height >= item.crop?.bottom, `Crop exceeds image for ${item.src}`);
  });
});
