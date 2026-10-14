export const DEFAULT_SERIAL_CONFIG = Object.freeze({
  minLength: 4,
  maxLength: 32,
  allowedPattern: "^[A-Z0-9-]+$",
});

export function normalizeSerial(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
}

export function validateSerial(value, serialConfig = DEFAULT_SERIAL_CONFIG) {
  const code = normalizeSerial(value);
  const minLength = Number(serialConfig.minLength ?? DEFAULT_SERIAL_CONFIG.minLength);
  const maxLength = Number(serialConfig.maxLength ?? DEFAULT_SERIAL_CONFIG.maxLength);
  const allowedPattern = serialConfig.allowedPattern ?? DEFAULT_SERIAL_CONFIG.allowedPattern;

  if (!code) {
    return { code, valid: false, reason: "empty" };
  }

  if (code.length < minLength || code.length > maxLength) {
    return { code, valid: false, reason: "length" };
  }

  try {
    if (!new RegExp(allowedPattern, "u").test(code)) {
      return { code, valid: false, reason: "format" };
    }
  } catch {
    return { code, valid: false, reason: "config" };
  }

  return { code, valid: true, reason: null };
}

export function parseSerials(text, serialConfig = DEFAULT_SERIAL_CONFIG) {
  const chunks = String(text ?? "")
    .split(/[\s,，;；、|]+/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const valid = [];
  const invalid = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const result = validateSerial(chunk, serialConfig);
    if (!result.valid) {
      invalid.push({ input: chunk, ...result });
      continue;
    }

    if (!seen.has(result.code)) {
      seen.add(result.code);
      valid.push(result.code);
    }
  }

  return { valid, invalid, totalChunks: chunks.length };
}

export function buildPrizeIndex(prizes = []) {
  const index = new Map();

  for (const prize of prizes) {
    if (!prize || !Array.isArray(prize.codes)) continue;

    for (const rawCode of prize.codes) {
      const code = normalizeSerial(rawCode);
      if (!code || index.has(code)) continue;
      index.set(code, {
        name: String(prize.name || "中獎"),
        note: String(prize.note || ""),
      });
    }
  }

  return index;
}

export function checkSerial(code, prizeData, prizeIndex = buildPrizeIndex(prizeData?.prizes)) {
  const normalizedCode = normalizeSerial(code);
  if (prizeData?.status !== "announced") {
    return {
      code: normalizedCode,
      state: "pending",
      label: "中獎名單尚未公布",
      prize: null,
    };
  }

  const prize = prizeIndex.get(normalizedCode) ?? null;
  if (prize) {
    return {
      code: normalizedCode,
      state: "winner",
      label: prize.name,
      prize,
    };
  }

  return {
    code: normalizedCode,
    state: "not-winner",
    label: "未在中獎名單中",
    prize: null,
  };
}

export function mergeHistory(existingHistory, codes, checkedAt, maxItems = 1000) {
  const codeSet = new Set(codes.map(normalizeSerial));
  const nextEntries = [...codeSet]
    .filter(Boolean)
    .map((code) => ({ code, checkedAt }));
  const oldEntries = Array.isArray(existingHistory)
    ? existingHistory.filter((entry) => entry?.code && !codeSet.has(normalizeSerial(entry.code)))
    : [];

  return [...nextEntries, ...oldEntries].slice(0, maxItems);
}

export function historyToCsv(history, resultForCode) {
  const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["序號", "查詢結果", "查詢時間"]];

  for (const entry of history) {
    const result = resultForCode(entry.code);
    rows.push([entry.code, result.label, entry.checkedAt]);
  }

  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
