import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(projectRoot, "index.html"), "utf8");

test("site includes share metadata and a canonical URL", () => {
  assert.match(html, /rel="canonical" href="https:\/\/oliviaiii\.github\.io\/52dd2026hbd\/"/u);
  assert.match(html, /property="og:image"/u);
  assert.match(html, /name="twitter:card" content="summary_large_image"/u);
});

test("primary controls expose accessible labels and relationships", () => {
  assert.match(html, /aria-label="搜尋獎品"/u);
  assert.match(html, /id="catalog-toggle"[\s\S]*aria-controls="prize-catalog"/u);
  assert.match(html, /id="input-summary" aria-live="polite"/u);
});
