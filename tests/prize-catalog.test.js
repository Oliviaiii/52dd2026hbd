import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(readFileSync(resolve(projectRoot, "data/prize-catalog.json"), "utf8"));

test("prize catalog covers every published poster", () => {
  const posterGroups = catalog.groups.filter((group) => Number.isInteger(group.page));
  assert.equal(posterGroups.length, 18);
  assert.deepEqual(
    posterGroups.map((group) => group.page),
    Array.from({ length: 18 }, (_, index) => index + 1),
  );
});

test("prize catalog has valid names and quantities", () => {
  const items = catalog.groups.flatMap((group) => group.items);
  assert.equal(items.length, 240);
  assert.equal(
    items.reduce((sum, item) => sum + item.quantity, 0),
    2853,
  );
  assert.deepEqual(
    items.find((item) => item.name === "現金一萬"),
    { quantity: 150, name: "現金一萬" },
  );
  assert.deepEqual(
    items.filter((item) =>
      [
        "亞洲線商務艙來回機票 (朵璽)",
        "榛榛峇里島行程兩人同行",
        "石展豪摩托車兜風",
        "不老松腳底指壓券",
        "不老松全身指壓券",
      ].includes(item.name),
    ),
    [
      { quantity: 1, name: "亞洲線商務艙來回機票 (朵璽)" },
      { quantity: 1, name: "榛榛峇里島行程兩人同行" },
      { quantity: 1, name: "石展豪摩托車兜風" },
      { quantity: 10, name: "不老松腳底指壓券" },
      { quantity: 10, name: "不老松全身指壓券" },
    ],
  );
  items.forEach((item) => {
    assert.ok(item.name?.trim());
    assert.ok(Number.isInteger(item.quantity) && item.quantity > 0, item.name);
  });
});
