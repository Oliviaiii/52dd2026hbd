import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(resolve(projectRoot, "data/prize-catalog.json"), "utf8"));

test("prize catalog covers every published poster", () => {
  assert.equal(catalog.groups.length, 18);
  assert.deepEqual(
    catalog.groups.map((group) => group.page),
    Array.from({ length: 18 }, (_, index) => index + 1),
  );
});

test("prize catalog has valid names and quantities", () => {
  const items = catalog.groups.flatMap((group) => group.items);
  assert.equal(items.length, 239);
  assert.equal(
    items.reduce((sum, item) => sum + item.quantity, 0),
    2703,
  );
  items.forEach((item) => {
    assert.ok(item.name?.trim());
    assert.ok(Number.isInteger(item.quantity) && item.quantity > 0, item.name);
  });
});
