import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPrizeIndex,
  checkSerial,
  historyToCsv,
  mergeHistory,
  normalizeSerial,
  parseSerials,
  parseWinnerSheetCsv,
  removeHistoryCode,
  validatePrizeData,
  validateSerial,
} from "../assets/js/core.js";

const serialConfig = {
  minLength: 4,
  maxLength: 12,
  allowedPattern: "^[A-Z0-9-]+$",
};

test("normalizeSerial converts full-width text, case and dash variants", () => {
  assert.equal(normalizeSerial(" ａｂ１２－cd34 "), "AB12-CD34");
});

test("validateSerial enforces configurable length and characters", () => {
  assert.equal(validateSerial("AB12-CD", serialConfig).valid, true);
  assert.equal(validateSerial("A2", serialConfig).reason, "length");
  assert.equal(validateSerial("AB_123", serialConfig).reason, "format");
});

test("parseSerials accepts common separators and removes duplicates", () => {
  const parsed = parseSerials("ab12, CD34\nＡＢ１２；EF-56", serialConfig);
  assert.deepEqual(parsed.valid, ["AB12", "CD34", "EF-56"]);
  assert.equal(parsed.invalid.length, 0);
});

test("buildPrizeIndex and checkSerial return announced result", () => {
  const prizeData = {
    status: "announced",
    prizes: [
      { name: "頭獎", codes: ["A001"] },
      { name: "二獎", codes: ["B002", "B003"] },
    ],
  };
  const index = buildPrizeIndex(prizeData.prizes);

  assert.equal(checkSerial("a001", prizeData, index).label, "頭獎");
  assert.equal(checkSerial("C999", prizeData, index).state, "not-winner");
});

test("checkSerial stays pending before the official list is announced", () => {
  const prizeData = { status: "not_announced", prizes: [] };
  assert.equal(checkSerial("A001", prizeData).state, "pending");
});

test("mergeHistory moves rechecked codes to the front without duplicates", () => {
  const existing = [
    { code: "OLD1", checkedAt: "2026-01-01T00:00:00.000Z" },
    { code: "AB12", checkedAt: "2026-01-01T00:00:00.000Z" },
  ];
  const next = mergeHistory(existing, ["AB12", "NEW2"], "2026-02-01T00:00:00.000Z");
  assert.deepEqual(
    next.map((entry) => entry.code),
    ["AB12", "NEW2", "OLD1"],
  );
});

test("removeHistoryCode removes only the selected serial", () => {
  const history = [
    { code: "AB12", checkedAt: "2026-01-01T00:00:00.000Z" },
    { code: "CD34", checkedAt: "2026-01-02T00:00:00.000Z" },
  ];
  const next = removeHistoryCode(history, "ab12");
  assert.deepEqual(next, [{ code: "CD34", checkedAt: "2026-01-02T00:00:00.000Z" }]);
});

test("historyToCsv escapes commas and quotes", () => {
  const csv = historyToCsv(
    [{ code: "AB12", checkedAt: "2026-01-01" }],
    () => ({ label: '中獎："生日,禮物"' }),
  );
  assert.match(csv, /"中獎：""生日,禮物"""/);
});

test("parseWinnerSheetCsv groups serials by prize and reads publish state", () => {
  const csv = [
    "狀態,更新時間,獎項,序號,備註",
    'announced,2026-10-20T12:00:00+08:00,"頭獎,特別版",AB12,第一批',
    ",,,CD34,第一批",
    ",,二獎,EF56,",
  ].join("\n");
  const result = parseWinnerSheetCsv(csv, serialConfig);
  assert.equal(result.status, "announced");
  assert.deepEqual(result.prizes, [
    { name: "頭獎,特別版", note: "第一批", codes: ["AB12", "CD34"] },
    { name: "二獎", note: "", codes: ["EF56"] },
  ]);
});

test("parseWinnerSheetCsv accepts the 開獎序號 column used by the managed sheet", () => {
  const csv = [
    "狀態,更新時間,獎項,開獎序號,備註",
    "announced,2026-10-20T12:00:00+08:00,現金 31 萬,AB12,",
  ].join("\n");
  const result = parseWinnerSheetCsv(csv, serialConfig);
  assert.deepEqual(result.prizes, [{ name: "現金 31 萬", note: "", codes: ["AB12"] }]);
});

test("validatePrizeData blocks duplicate codes and incomplete announced data", () => {
  assert.throws(
    () =>
      validatePrizeData(
        {
          status: "announced",
          updatedAt: "2026-10-20T12:00:00+08:00",
          prizes: [
            { name: "頭獎", codes: ["AB12"] },
            { name: "二獎", codes: ["ab12"] },
          ],
        },
        serialConfig,
      ),
    /同時出現/,
  );
  assert.throws(
    () => validatePrizeData({ status: "announced", updatedAt: null, prizes: [] }, serialConfig),
    /空白中獎名單/,
  );
});
