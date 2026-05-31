(function initParser(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ScmParser = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function createParser() {
  const HEADER_ROW_INDEX = 10;
  const REQUIRED_HEADERS = ["거래일시", "구분", "거래금액", "거래 후 잔액", "거래구분", "내용", "메모"];

  function parseBankRows(rows, options = {}) {
    const headers = rows[HEADER_ROW_INDEX] || [];
    const indexes = mapHeaderIndexes(headers);
    const existingKeys = new Set(options.existingKeys || []);
    const types = options.types || [];
    const rules = options.rules || [];

    return rows
      .slice(HEADER_ROW_INDEX + 1)
      .map((row, sourceIndex) => normalizeBankRow(row, indexes, sourceIndex + HEADER_ROW_INDEX + 2))
      .filter((row) => row && row.amount < 0)
      .map((row) => {
        const uploadKey = makeUploadKey(row);
        const duplicated = existingKeys.has(uploadKey);
        const selectedType = guessType(row, types, rules);
        return {
          ...row,
          uploadKey,
          duplicated,
          include: !duplicated,
          selectedType,
          uploadPayload: toUploadPayload(row, selectedType, uploadKey),
        };
      });
  }

  function mapHeaderIndexes(headers) {
    const normalizedHeaders = headers.map((header) => normalizeText(header));
    const indexes = {};

    REQUIRED_HEADERS.forEach((name) => {
      indexes[headerKey(name)] = normalizedHeaders.indexOf(name);
    });

    const missing = REQUIRED_HEADERS.filter((name) => indexes[headerKey(name)] === -1);
    if (missing.length) {
      throw new Error("엑셀 헤더를 찾을 수 없습니다: " + missing.join(", "));
    }

    return {
      tradedAt: indexes[headerKey("거래일시")],
      direction: indexes[headerKey("구분")],
      amount: indexes[headerKey("거래금액")],
      balance: indexes[headerKey("거래 후 잔액")],
      method: indexes[headerKey("거래구분")],
      description: indexes[headerKey("내용")],
      memo: indexes[headerKey("메모")],
    };
  }

  function normalizeBankRow(row, indexes, sourceRowNumber) {
    const tradedAtRaw = row[indexes.tradedAt];
    const amount = parseAmount(row[indexes.amount]);
    const tradedAt = parseTradeDate(tradedAtRaw);
    if (!tradedAt || Number.isNaN(amount)) return null;

    return {
      sourceRowNumber,
      tradedAt: tradedAt.displayDateTime,
      date: tradedAt.sheetDate,
      month: tradedAt.month,
      direction: normalizeText(row[indexes.direction]),
      amount,
      absoluteAmount: Math.abs(amount),
      balance: normalizeText(row[indexes.balance]),
      method: normalizeText(row[indexes.method]),
      description: normalizeText(row[indexes.description]),
      memo: normalizeText(row[indexes.memo]),
    };
  }

  function parseAmount(value) {
    const normalized = normalizeText(value)
      .replace(/[−–—]/g, "-")
      .replace(/[^\d.-]/g, "");
    if (!normalized) return NaN;
    return Number(normalized);
  }

  function parseTradeDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return buildDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate(), value.getHours(), value.getMinutes(), value.getSeconds());
    }

    const text = normalizeText(value);
    const match = text.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})(?:[일\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!match) return null;

    return buildDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0),
      Number(match[6] || 0)
    );
  }

  function buildDateParts(year, month, day, hour, minute, second) {
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isNaN(date.getTime())) return null;

    const mm = pad2(month);
    const dd = pad2(day);
    const hh = pad2(hour);
    const mi = pad2(minute);
    const ss = pad2(second);

    return {
      month: `${year}-${mm}`,
      sheetDate: `${year}. ${month}. ${day}`,
      isoDate: `${year}-${mm}-${dd}`,
      displayDateTime: `${year}.${mm}.${dd} ${hh}:${mi}:${ss}`,
    };
  }

  function makeUploadKey(row) {
    return [row.tradedAt, row.absoluteAmount, row.description, row.memo].map(normalizeText).join("|");
  }

  function guessType(row, types, rules) {
    const text = `${row.description} ${row.memo} ${row.method}`;
    const matched = rules.find((rule) => rule.keyword && text.includes(rule.keyword));
    return matched?.type || types[0] || "";
  }

  function toUploadPayload(row, selectedType, uploadKey) {
    return {
      month: row.month,
      date: row.date,
      amount: row.absoluteAmount,
      type: selectedType,
      note: buildNote(row),
      uploadKey,
      original: {
        tradedAt: row.tradedAt,
        method: row.method,
        description: row.description,
        memo: row.memo,
        sourceRowNumber: row.sourceRowNumber,
      },
    };
  }

  function buildNote(row) {
    return [row.description, row.memo].filter(Boolean).join(" / ");
  }

  function headerKey(name) {
    return name.replace(/\s/g, "");
  }

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  return {
    HEADER_ROW_INDEX,
    parseBankRows,
    mapHeaderIndexes,
    normalizeBankRow,
    parseAmount,
    parseTradeDate,
    makeUploadKey,
    guessType,
    toUploadPayload,
    buildNote,
  };
});
