import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePrizeData } from "../assets/js/core.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(projectRoot, "data/config.json"), "utf8"));
const prizeData = JSON.parse(readFileSync(resolve(projectRoot, "data/prizes.json"), "utf8"));

test("published prize data is safe to deploy", () => {
  assert.equal(validatePrizeData(prizeData, config.serial), true);
});
