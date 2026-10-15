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

export function validatePrizeData(prizeData, serialConfig = DEFAULT_SERIAL_CONFIG) {
  const status = prizeData?.status;
  if (!['announced', 'not_announced'].includes(status)) {
    throw new Error('中獎名單狀態必須是 announced 或 not_announced。');
  }

  const prizes = prizeData?.prizes;
  if (!Array.isArray(prizes)) {
    throw new Error('中獎名單 prizes 必須是陣列。');
  }

  if (status === 'announced') {
    if (!prizes.length) throw new Error('已公布狀態不能使用空白中獎名單。');
    if (!prizeData.updatedAt || Number.isNaN(new Date(prizeData.updatedAt).getTime())) {
      throw new Error('已公布狀態必須提供有效的 updatedAt。');
    }
  }

  const seen = new Map();
  for (const [prizeIndex, prize] of prizes.entries()) {
    const name = String(prize?.name ?? '').trim();
    if (!name) throw new Error(`第 ${prizeIndex + 1} 個獎項缺少名稱。`);
    if (!Array.isArray(prize.codes) || !prize.codes.length) {
      throw new Error(`獎項「${name}」沒有任何序號。`);
    }

    for (const rawCode of prize.codes) {
      const result = validateSerial(rawCode, serialConfig);
      if (!result.valid) throw new Error(`獎項「${name}」的序號「${rawCode}」格式不符。`);
      if (seen.has(result.code)) {
        throw new Error(`序號「${result.code}」同時出現在「${seen.get(result.code)}」與「${name}」。`);
      }
      seen.set(result.code, name);
    }
  }

  return true;
}

export function parseWinnerSheetCsv(csvText, serialConfig = DEFAULT_SERIAL_CONFIG) {
  const rows = parseCsvRows(csvText);
  if (!rows.length) throw new Error('Google Sheet 沒有欄位標題。');

  const headers = rows[0].map(normalizeSheetHeader);
  const column = (aliases) => headers.findIndex((header) => aliases.includes(header));
  const serialColumn = column(['序號', '開獎序號', '中獎序號', 'serial', 'code']);
  const prizeColumn = column(['獎項', '獎品', 'prize', 'prizename']);
  const noteColumn = column(['備註', 'note']);
  const statusColumn = column(['狀態', 'status']);
  const updatedAtColumn = column(['更新時間', 'updatedat', 'updated']);

  if (serialColumn < 0 || prizeColumn < 0) {
    throw new Error('Google Sheet 必須包含「開獎序號」與「獎項」欄位。');
  }

  const dataRows = rows.slice(1);
  const firstValue = (columnIndex) => {
    if (columnIndex < 0) return '';
    return dataRows.map((row) => String(row[columnIndex] ?? '').trim()).find(Boolean) ?? '';
  };
  const status = normalizeSheetStatus(firstValue(statusColumn));
  const updatedAt = firstValue(updatedAtColumn) || null;
  const prizeGroups = new Map();
  let previousPrizeName = '';

  dataRows.forEach((row, index) => {
    const rawCode = String(row[serialColumn] ?? '').trim();
    if (!rawCode) return;
    const rowPrizeName = String(row[prizeColumn] ?? '').trim();
    if (rowPrizeName) previousPrizeName = rowPrizeName;
    const prizeName = rowPrizeName || previousPrizeName;
    if (!prizeName) throw new Error(`Google Sheet 第 ${index + 2} 列缺少獎項名稱。`);
    const note = noteColumn >= 0 ? String(row[noteColumn] ?? '').trim() : '';
    const key = `${prizeName}\u0000${note}`;
    if (!prizeGroups.has(key)) prizeGroups.set(key, { name: prizeName, note, codes: [] });
    prizeGroups.get(key).codes.push(rawCode);
  });

  const prizeData = { status, updatedAt, prizes: [...prizeGroups.values()] };
  validatePrizeData(prizeData, serialConfig);
  return prizeData;
}

function parseCsvRows(csvText) {
  const text = String(csvText ?? '').replace(/^\uFEFF/u, '');
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error('Google Sheet CSV 含有未閉合的引號。');
  row.push(value);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  return rows;
}

function normalizeSheetHeader(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('zh-Hant-TW')
    .replace(/[\s_-]+/gu, '');
}

function normalizeSheetStatus(value) {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('zh-Hant-TW');
  if (['announced', 'published', 'true', '1', '已公布', '公布'].includes(normalized)) {
    return 'announced';
  }
  if (!normalized || ['draft', 'notannounced', 'false', '0', '未公布', '草稿'].includes(normalized)) {
    return 'not_announced';
  }
  throw new Error(`無法識別 Google Sheet 狀態「${value}」。`);
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

export function removeHistoryCode(existingHistory, codeToRemove) {
  const normalizedCode = normalizeSerial(codeToRemove);
  if (!Array.isArray(existingHistory) || !normalizedCode) return [];
  return existingHistory.filter((entry) => normalizeSerial(entry?.code) !== normalizedCode);
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
