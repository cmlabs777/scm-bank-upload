const SPREADSHEET_ID = "1XVJWlIeyo3zvugaJxMJcRxZPkqfxNadDROKwB3xDd-4";
const SHEETS = {
  withdrawal: {
    kindLabel: "출금",
    ledgerName: "출금내역",
    typeName: "gas 유형",
  },
  income: {
    kindLabel: "입금",
    ledgerName: "입금내역",
    typeName: "gas 입금유형",
  },
};
const INVESTMENT_RAW_SHEET_NAME = "투자raw";

function doGet(event) {
  const action = event.parameter.action || "";
  const callback = event.parameter.callback || "";
  const result = routeAction_(action, event.parameter);

  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(result) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  const payload = parsePayload_(event);
  const result = routeAction_(payload.action || "", payload);

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorize() {
  return health_();
}

function routeAction_(action, payload) {
  try {
    if (action === "health") return { ok: true, data: health_() };
    if (action === "getTypes") return { ok: true, data: getTypes_(payload.kind) };
    if (action === "saveTypes") return { ok: true, data: saveTypes_(payload.kind, payload.types || []) };
    if (action === "getRules") return { ok: true, data: getRules_(payload.kind) };
    if (action === "saveRules") return { ok: true, data: saveRules_(payload.kind, payload.rules || []) };
    if (action === "getExistingKeys") return { ok: true, data: getExistingKeys_(payload.kind) };
    if (action === "appendTransactions") return { ok: true, data: appendTransactions_(payload.kind, payload.rows || []) };
    if (action === "appendInvestments") return { ok: true, data: appendInvestments_(payload.rows || []) };

    // Backward-compatible action names for the current withdrawal-only version.
    if (action === "getExistingWithdrawalKeys") return { ok: true, data: getExistingKeys_("withdrawal") };
    if (action === "appendWithdrawals") return { ok: true, data: appendTransactions_("withdrawal", payload.rows || []) };
    if (action === "repairWithdrawalDates") return { ok: true, data: repairLedgerDates_("withdrawal") };
    if (action === "inspectMonth") return { ok: true, data: inspectMonth_("withdrawal") };

    return { ok: false, error: "Unknown action: " + action };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getConfig_(kind) {
  return SHEETS[kind] || SHEETS.withdrawal;
}

function health_() {
  const spreadsheet = getSpreadsheet_();
  const data = {
    spreadsheetName: spreadsheet.getName(),
    investmentRawSheetExists: Boolean(spreadsheet.getSheetByName(INVESTMENT_RAW_SHEET_NAME)),
  };

  Object.keys(SHEETS).forEach(function(kind) {
    const config = getConfig_(kind);
    const typeSheet = spreadsheet.getSheetByName(config.typeName);
    const ledgerSheet = spreadsheet.getSheetByName(config.ledgerName);
    let ledgerTable = null;
    if (ledgerSheet) ledgerTable = findLedgerTable_(ledgerSheet, config.ledgerName);
    data[kind] = {
      typeSheetExists: Boolean(typeSheet),
      ledgerSheetExists: Boolean(ledgerSheet),
      ledgerHeaderRow: ledgerTable ? ledgerTable.headerRow : null,
      ledgerColumns: ledgerTable ? ledgerTable.columns : null,
    };
  });

  return data;
}

function getTypeSheet_(kind) {
  const config = getConfig_(kind);
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(config.typeName);
  if (!sheet) sheet = spreadsheet.insertSheet(config.typeName);

  if (sheet.getRange("A1").getValue() !== "유형") sheet.getRange("A1").setValue("유형");
  if (sheet.getRange("B1").getValue()) sheet.getRange("B1").clearContent();
  if (sheet.getRange("C1").getValue() !== "키워드") sheet.getRange("C1:E1").setValues([["키워드", "추천유형", "설명"]]);
  return sheet;
}

function getTypes_(kind) {
  const sheet = getTypeSheet_(kind);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  return sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .flat()
    .map(function(value) { return String(value).trim(); })
    .filter(Boolean);
}

function saveTypes_(kind, types) {
  const sheet = getTypeSheet_(kind);
  const cleaned = normalizeArray_(types);
  const maxRows = Math.max(sheet.getLastRow() - 1, 1);
  sheet.getRange(2, 1, maxRows, 1).clearContent();
  if (cleaned.length) sheet.getRange(2, 1, cleaned.length, 1).setValues(cleaned.map(function(type) { return [type]; }));
  return { count: cleaned.length };
}

function getRules_(kind) {
  const sheet = getTypeSheet_(kind);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  return sheet
    .getRange(2, 3, lastRow - 1, 3)
    .getValues()
    .map(function(row) {
      return {
        keyword: String(row[0] || "").trim(),
        type: String(row[1] || "").trim(),
        note: String(row[2] || "").trim(),
      };
    })
    .filter(function(rule) { return rule.keyword && rule.type; });
}

function saveRules_(kind, rules) {
  const sheet = getTypeSheet_(kind);
  const typeSet = new Set(getTypes_(kind));
  const cleaned = (Array.isArray(rules) ? rules : [])
    .map(function(rule) {
      return {
        keyword: String(rule.keyword || "").trim(),
        type: String(rule.type || "").trim(),
        note: String(rule.note || "").trim(),
      };
    })
    .filter(function(rule) { return rule.keyword && rule.type && typeSet.has(rule.type); });

  const maxRows = Math.max(sheet.getLastRow() - 1, 1);
  sheet.getRange(2, 3, maxRows, 3).clearContent();
  if (cleaned.length) {
    sheet.getRange(2, 3, cleaned.length, 3).setValues(cleaned.map(function(rule) {
      return [rule.keyword, rule.type, rule.note];
    }));
  }
  return { count: cleaned.length };
}

function getLedgerSheet_(kind) {
  const config = getConfig_(kind);
  const sheet = getSpreadsheet_().getSheetByName(config.ledgerName);
  if (!sheet) throw new Error(config.ledgerName + " 탭을 찾을 수 없습니다.");
  return sheet;
}

function getExistingKeys_(kind) {
  const sheet = getLedgerSheet_(kind);
  const table = findLedgerTable_(sheet, getConfig_(kind).ledgerName);
  const keyColumn = ensureUploadKeyColumn_(sheet, table);
  const lastRow = sheet.getLastRow();
  if (lastRow <= table.headerRow) return [];

  return sheet
    .getRange(table.headerRow + 1, keyColumn, lastRow - table.headerRow, 1)
    .getValues()
    .flat()
    .map(function(value) { return String(value).trim(); })
    .filter(function(value) { return value.indexOf("|") !== -1; })
    .filter(Boolean);
}

function appendTransactions_(kind, rows) {
  const config = getConfig_(kind);
  const sheet = getLedgerSheet_(kind);
  const table = findLedgerTable_(sheet, config.ledgerName);
  const keyColumn = ensureUploadKeyColumn_(sheet, table);
  const existingKeys = new Set(getExistingKeys_(kind));
  const typeSet = new Set(getTypes_(kind));
  const inputRows = Array.isArray(rows) ? rows : [];
  const normalizedRows = inputRows.map(normalizeLedgerRow_);
  const validRows = normalizedRows.filter(function(row) {
    return row.uploadKey && row.dateValue && row.type && typeSet.has(row.type) && row.amount > 0;
  });
  const cleaned = validRows.filter(function(row) { return !existingKeys.has(row.uploadKey); });
  if (!cleaned.length) {
    return {
      appended: 0,
      skipped: inputRows.length,
      duplicate: validRows.length,
      invalid: inputRows.length - validRows.length,
    };
  }

  const values = cleaned.map(function(row) {
    const line = Array(Math.max(keyColumn, table.maxColumn)).fill("");
    line[table.columns.kind - 1] = config.kindLabel;
    line[table.columns.month - 1] = "";
    line[table.columns.date - 1] = row.dateValue;
    line[table.columns.amount - 1] = row.amount;
    line[table.columns.content - 1] = row.type;
    line[table.columns.note - 1] = row.note;
    line[keyColumn - 1] = row.uploadKey;
    return line;
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, values.length, Math.max(keyColumn, table.maxColumn)).setValues(values);
  applyLedgerDateFormulas_(sheet, table, startRow, values.length);
  return {
    appended: values.length,
    skipped: inputRows.length - values.length,
    duplicate: validRows.length - values.length,
    invalid: inputRows.length - validRows.length,
  };
}

function repairLedgerDates_(kind) {
  const sheet = getLedgerSheet_(kind);
  const table = findLedgerTable_(sheet, getConfig_(kind).ledgerName);
  const startRow = table.headerRow + 1;
  const rowCount = sheet.getLastRow() - table.headerRow;
  if (rowCount <= 0) return { repaired: 0 };

  const dateRange = sheet.getRange(startRow, table.columns.date, rowCount, 1);
  const dateValues = dateRange.getValues();
  const repairedDateValues = dateValues.map(function(row) { return [parseSheetDate_(row[0]) || row[0]]; });
  dateRange.setValues(repairedDateValues);
  applyLedgerDateFormulas_(sheet, table, startRow, rowCount);
  return { repaired: rowCount };
}

function findLedgerTable_(sheet, label) {
  const values = sheet.getDataRange().getValues();
  for (let row = 0; row < values.length; row += 1) {
    const headers = values[row].map(function(value) { return String(value || "").trim(); });
    const columns = {
      kind: headers.indexOf("입출금구분") + 1,
      month: headers.indexOf("월구분") + 1,
      date: headers.indexOf("일자") + 1,
      amount: headers.indexOf("금액") + 1,
      content: headers.indexOf("내용") + 1,
      note: headers.indexOf("비고") + 1,
    };

    if (columns.kind && columns.month && columns.date && columns.amount && columns.content && columns.note) {
      return {
        headerRow: row + 1,
        columns: columns,
        maxColumn: headers.length,
      };
    }
  }
  throw new Error(label + " raw data 헤더를 찾을 수 없습니다.");
}

function ensureUploadKeyColumn_(sheet, table) {
  const width = Math.max(sheet.getLastColumn(), 8);
  const headers = sheet.getRange(table.headerRow, 1, 1, width).getValues()[0];
  const existingIndexes = headers
    .map(function(header, index) { return String(header || "").trim() === "업로드키" ? index + 1 : null; })
    .filter(Boolean);

  for (let i = 0; i < existingIndexes.length; i += 1) {
    const column = existingIndexes[i];
    if (isUploadKeyColumnSafe_(sheet, table.headerRow, column)) return column;
  }

  const column = width + 1;
  sheet.getRange(table.headerRow, column).setValue("업로드키");
  return column;
}

function isUploadKeyColumnSafe_(sheet, headerRow, column) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) return true;

  const values = sheet
    .getRange(headerRow + 1, column, lastRow - headerRow, 1)
    .getValues()
    .flat()
    .map(function(value) { return String(value || "").trim(); })
    .filter(Boolean);

  return values.every(function(value) { return value.indexOf("|") !== -1; });
}

function normalizeLedgerRow_(row) {
  const dateValue = parseSheetDate_(row.date);
  return {
    dateValue: dateValue,
    amount: Math.abs(Number(row.amount || 0)),
    type: String(row.type || "").trim(),
    note: String(row.note || "").trim(),
    uploadKey: String(row.uploadKey || "").trim(),
  };
}

function applyLedgerDateFormulas_(sheet, table, startRow, rowCount) {
  if (rowCount <= 0) return;

  const dateCol = columnToLetter_(table.columns.date);
  const formulas = [];
  for (let offset = 0; offset < rowCount; offset += 1) {
    const r = startRow + offset;
    formulas.push([`=YEAR(${dateCol}${r})&"-"&TEXT(MONTH(${dateCol}${r}),"00")`]);
  }
  sheet.getRange(startRow, table.columns.month, rowCount, 1).setNumberFormat("@");
  sheet.getRange(startRow, table.columns.month, rowCount, 1).setFormulas(formulas);
  sheet.getRange(startRow, table.columns.date, rowCount, 1).setNumberFormat("yyyy. m. d");
}

function getInvestmentRawSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(INVESTMENT_RAW_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(INVESTMENT_RAW_SHEET_NAME);

  const headers = ["거래구분", "종류", "상품", "거래일", "단가", "수량", "금액", "수수료/세금", "실현손익", "비고", "업로드키"];
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(function(value) { return String(value || "").trim(); });
  const needsHeader = headers.some(function(header, index) { return current[index] !== header; });
  if (needsHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function appendInvestments_(rows) {
  const sheet = getInvestmentRawSheet_();
  const inputRows = Array.isArray(rows) ? rows : [];
  const existingKeys = new Set(getInvestmentKeys_(sheet));
  const normalized = inputRows.map(normalizeInvestmentRow_).filter(function(row) {
    return row.tradeKind && row.product && row.dateValue && row.amount > 0 && row.uploadKey;
  });
  const cleaned = normalized.filter(function(row) { return !existingKeys.has(row.uploadKey); });

  if (!cleaned.length) {
    return {
      appended: 0,
      skipped: inputRows.length,
      duplicate: normalized.length,
      invalid: inputRows.length - normalized.length,
    };
  }

  const values = cleaned.map(function(row) {
    return [
      row.tradeKind,
      row.category,
      row.product,
      row.dateValue,
      row.price,
      row.quantity,
      row.amount,
      row.fee,
      row.profit,
      row.note,
      row.uploadKey,
    ];
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, values.length, 11).setValues(values);
  sheet.getRange(startRow, 4, values.length, 1).setNumberFormat("yyyy. m. d");
  sheet.getRange(startRow, 5, values.length, 5).setNumberFormat("#,##0.######");
  return {
    appended: values.length,
    skipped: inputRows.length - values.length,
    duplicate: normalized.length - values.length,
    invalid: inputRows.length - normalized.length,
  };
}

function getInvestmentKeys_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet
    .getRange(2, 11, lastRow - 1, 1)
    .getValues()
    .flat()
    .map(function(value) { return String(value || "").trim(); })
    .filter(function(value) { return value.indexOf("|") !== -1; });
}

function normalizeInvestmentRow_(row) {
  return {
    tradeKind: String(row.tradeKind || "").trim(),
    category: String(row.category || "").trim(),
    product: String(row.product || "").trim(),
    dateValue: parseSheetDate_(row.date),
    price: Number(row.price || 0),
    quantity: Number(row.quantity || 0),
    amount: Number(row.amount || 0),
    fee: Number(row.fee || 0),
    profit: Number(row.profit || 0),
    note: String(row.note || "").trim(),
    uploadKey: String(row.uploadKey || "").trim(),
  };
}

function parseSheetDate_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || "").trim();
  const match = text.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function columnToLetter_(column) {
  let letter = "";
  let number = column;
  while (number > 0) {
    const mod = (number - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    number = Math.floor((number - mod) / 26);
  }
  return letter;
}

function parsePayload_(event) {
  const raw = event.postData && event.postData.contents ? event.postData.contents : "{}";
  try {
    return JSON.parse(raw);
  } catch (error) {
    const parameter = event.parameter || {};
    if (parameter.payload) {
      try {
        return JSON.parse(parameter.payload);
      } catch (payloadError) {
        return parameter;
      }
    }
    return parameter;
  }
}

function inspectMonth_(kind) {
  const sheet = getLedgerSheet_(kind);
  const table = findLedgerTable_(sheet, getConfig_(kind).ledgerName);
  const lastRow = sheet.getLastRow();
  const n = Math.min(10, lastRow - table.headerRow);
  if (n <= 0) return [];

  const startRow = lastRow - n + 1;
  const monthRange = sheet.getRange(startRow, table.columns.month, n, 1);
  const values = monthRange.getValues();
  const formats = monthRange.getNumberFormats();
  const formulas = monthRange.getFormulas();

  return values.map(function(row, i) {
    const value = row[0];
    return {
      sheetRow: startRow + i,
      isDate: value instanceof Date,
      value: value instanceof Date
        ? ("DATE:" + value.getFullYear() + "-" + String(value.getMonth() + 1).padStart(2, "0") + "-" + String(value.getDate()).padStart(2, "0"))
        : String(value),
      format: formats[i][0],
      formula: formulas[i][0],
    };
  });
}

function normalizeArray_(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(function(value) { return String(value).trim(); })
    .filter(Boolean)));
}
