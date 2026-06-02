const SPREADSHEET_ID = "1XVJWlIeyo3zvugaJxMJcRxZPkqfxNadDROKwB3xDd-4";
const TYPE_SHEET_NAME = "gas 유형";
const WITHDRAWAL_SHEET_NAME = "출금내역";

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
    if (action === "getTypes") return { ok: true, data: getTypes_() };
    if (action === "saveTypes") return { ok: true, data: saveTypes_(payload.types || []) };
    if (action === "getRules") return { ok: true, data: getRules_() };
    if (action === "saveRules") return { ok: true, data: saveRules_(payload.rules || []) };
    if (action === "getExistingWithdrawalKeys") return { ok: true, data: getExistingWithdrawalKeys_() };
    if (action === "appendWithdrawals") return { ok: true, data: appendWithdrawals_(payload.rows || []) };
    if (action === "repairWithdrawalDates") return { ok: true, data: repairWithdrawalDates_() };
    if (action === "inspectMonth") return { ok: true, data: inspectMonth_() };
    if (action === "getAllWithdrawals") return { ok: true, data: getAllWithdrawals_() };
    return { ok: false, error: "Unknown action: " + action };
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) };
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function health_() {
  const spreadsheet = getSpreadsheet_();
  const typeSheet = spreadsheet.getSheetByName(TYPE_SHEET_NAME);
  const withdrawalSheet = spreadsheet.getSheetByName(WITHDRAWAL_SHEET_NAME);
  let withdrawalTable = null;
  if (withdrawalSheet) {
    withdrawalTable = findWithdrawalTable_(withdrawalSheet);
  }

  return {
    spreadsheetName: spreadsheet.getName(),
    typeSheetExists: Boolean(typeSheet),
    withdrawalSheetExists: Boolean(withdrawalSheet),
    withdrawalHeaderRow: withdrawalTable ? withdrawalTable.headerRow : null,
    withdrawalColumns: withdrawalTable ? withdrawalTable.columns : null,
  };
}

function getTypeSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(TYPE_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(TYPE_SHEET_NAME);

  if (sheet.getRange("A1").getValue() !== "유형") sheet.getRange("A1").setValue("유형");
  if (sheet.getRange("B1").getValue()) sheet.getRange("B1").clearContent();
  if (sheet.getRange("C1").getValue() !== "키워드") sheet.getRange("C1:E1").setValues([["키워드", "추천유형", "설명"]]);
  return sheet;
}

function getTypes_() {
  const sheet = getTypeSheet_();
  const lastRow = Math.max(sheet.getLastRow(), 2);
  return sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getValues()
    .flat()
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function saveTypes_(types) {
  const sheet = getTypeSheet_();
  const cleaned = normalizeArray_(types);
  const maxRows = Math.max(sheet.getLastRow() - 1, 1);
  sheet.getRange(2, 1, maxRows, 1).clearContent();
  if (cleaned.length) sheet.getRange(2, 1, cleaned.length, 1).setValues(cleaned.map((type) => [type]));
  return { count: cleaned.length };
}

function getRules_() {
  const sheet = getTypeSheet_();
  const lastRow = Math.max(sheet.getLastRow(), 2);
  return sheet
    .getRange(2, 3, lastRow - 1, 3)
    .getValues()
    .map((row) => ({
      keyword: String(row[0] || "").trim(),
      type: String(row[1] || "").trim(),
      note: String(row[2] || "").trim(),
    }))
    .filter((rule) => rule.keyword && rule.type);
}

function saveRules_(rules) {
  const sheet = getTypeSheet_();
  const typeSet = new Set(getTypes_());
  const cleaned = (Array.isArray(rules) ? rules : [])
    .map((rule) => ({
      keyword: String(rule.keyword || "").trim(),
      type: String(rule.type || "").trim(),
      note: String(rule.note || "").trim(),
    }))
    .filter((rule) => rule.keyword && rule.type && typeSet.has(rule.type));

  const maxRows = Math.max(sheet.getLastRow() - 1, 1);
  sheet.getRange(2, 3, maxRows, 3).clearContent();
  if (cleaned.length) {
    sheet.getRange(2, 3, cleaned.length, 3).setValues(cleaned.map((rule) => [rule.keyword, rule.type, rule.note]));
  }
  return { count: cleaned.length };
}

function getExistingWithdrawalKeys_() {
  const sheet = getSpreadsheet_().getSheetByName(WITHDRAWAL_SHEET_NAME);
  if (!sheet) throw new Error("출금내역 탭을 찾을 수 없습니다.");

  const table = findWithdrawalTable_(sheet);
  const keyColumn = ensureUploadKeyColumn_(sheet, table);
  const lastRow = sheet.getLastRow();
  if (lastRow <= table.headerRow) return [];

  return sheet
    .getRange(table.headerRow + 1, keyColumn, lastRow - table.headerRow, 1)
    .getValues()
    .flat()
    .map((value) => String(value).trim())
    .filter((value) => value.indexOf("|") !== -1)
    .filter(Boolean);
}

function appendWithdrawals_(rows) {
  const sheet = getSpreadsheet_().getSheetByName(WITHDRAWAL_SHEET_NAME);
  if (!sheet) throw new Error("출금내역 탭을 찾을 수 없습니다.");

  const table = findWithdrawalTable_(sheet);
  const keyColumn = ensureUploadKeyColumn_(sheet, table);
  const existingKeys = new Set(getExistingWithdrawalKeys_());
  const typeSet = new Set(getTypes_());
  const inputRows = Array.isArray(rows) ? rows : [];
  const normalizedRows = inputRows.map(normalizeWithdrawalRow_);
  const validRows = normalizedRows.filter((row) => row.uploadKey && row.dateValue && row.type && typeSet.has(row.type) && row.amount > 0);
  const cleaned = validRows.filter((row) => !existingKeys.has(row.uploadKey));
  if (!cleaned.length) {
    return {
      appended: 0,
      skipped: inputRows.length,
      duplicate: validRows.length,
      invalid: inputRows.length - validRows.length,
    };
  }

  const values = cleaned.map((row) => {
    const line = Array(Math.max(keyColumn, table.maxColumn)).fill("");
    line[table.columns.kind - 1] = "출금";
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
  applyWithdrawalDateFormulas_(sheet, table, startRow, values.length);
  return {
    appended: values.length,
    skipped: inputRows.length - values.length,
    duplicate: validRows.length - values.length,
    invalid: inputRows.length - validRows.length,
  };
}

function repairWithdrawalDates_() {
  const sheet = getSpreadsheet_().getSheetByName(WITHDRAWAL_SHEET_NAME);
  if (!sheet) throw new Error("출금내역 탭을 찾을 수 없습니다.");

  const table = findWithdrawalTable_(sheet);
  const startRow = table.headerRow + 1;
  const rowCount = sheet.getLastRow() - table.headerRow;
  if (rowCount <= 0) return { repaired: 0 };

  const dateRange = sheet.getRange(startRow, table.columns.date, rowCount, 1);
  const dateValues = dateRange.getValues();
  const repairedDateValues = dateValues.map((row) => [parseSheetDate_(row[0]) || row[0]]);
  dateRange.setValues(repairedDateValues);
  applyWithdrawalDateFormulas_(sheet, table, startRow, rowCount);
  return { repaired: rowCount };
}

function findWithdrawalTable_(sheet) {
  const values = sheet.getDataRange().getValues();
  for (let row = 0; row < values.length; row += 1) {
    const headers = values[row].map((value) => String(value || "").trim());
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
        columns,
        maxColumn: headers.length,
      };
    }
  }
  throw new Error("출금내역 raw data 헤더를 찾을 수 없습니다.");
}

function ensureUploadKeyColumn_(sheet, table) {
  const width = Math.max(sheet.getLastColumn(), 8);
  const headers = sheet.getRange(table.headerRow, 1, 1, width).getValues()[0];
  const existingIndexes = headers
    .map((header, index) => String(header || "").trim() === "업로드키" ? index + 1 : null)
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
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return values.every((value) => value.indexOf("|") !== -1);
}

function normalizeWithdrawalRow_(row) {
  const dateValue = parseSheetDate_(row.date);
  return {
    month: String(row.month || "").trim(),
    date: String(row.date || "").trim(),
    dateValue,
    amount: Math.abs(Number(row.amount || 0)),
    type: String(row.type || "").trim(),
    note: String(row.note || "").trim(),
    uploadKey: String(row.uploadKey || "").trim(),
  };
}

function applyWithdrawalDateFormulas_(sheet, table, startRow, rowCount) {
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

function inspectMonth_() {
  const sheet = getSpreadsheet_().getSheetByName(WITHDRAWAL_SHEET_NAME);
  if (!sheet) throw new Error("출금내역 탭을 찾을 수 없습니다.");

  const table = findWithdrawalTable_(sheet);
  const lastRow = sheet.getLastRow();
  const n = Math.min(10, lastRow - table.headerRow);
  if (n <= 0) return [];

  const startRow = lastRow - n + 1;
  const monthRange = sheet.getRange(startRow, table.columns.month, n, 1);
  const values = monthRange.getValues();
  const formats = monthRange.getNumberFormats();
  const formulas = monthRange.getFormulas();

  return values.map(function(row, i) {
    var v = row[0];
    return {
      sheetRow: startRow + i,
      isDate: v instanceof Date,
      value: v instanceof Date ? ("DATE:" + v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0")) : String(v),
      format: formats[i][0],
      formula: formulas[i][0],
    };
  });
}

function getAllWithdrawals_() {
  var sheet = getSpreadsheet_().getSheetByName(WITHDRAWAL_SHEET_NAME);
  if (!sheet) throw new Error("출금내역 탭을 찾을 수 없습니다.");

  var table = findWithdrawalTable_(sheet);
  var keyColumn = ensureUploadKeyColumn_(sheet, table);
  var lastRow = sheet.getLastRow();
  if (lastRow <= table.headerRow) return [];

  var rowCount = lastRow - table.headerRow;
  var colCount = Math.max(keyColumn, table.maxColumn);
  var data = sheet.getRange(table.headerRow + 1, 1, rowCount, colCount).getValues();

  return data.map(function(row) {
    var rawDate = row[table.columns.date - 1];
    var dateObj = rawDate instanceof Date ? rawDate : parseSheetDate_(rawDate);
    var tradedAt = "";
    if (dateObj) {
      var y = dateObj.getFullYear();
      var mo = ("0" + (dateObj.getMonth() + 1)).slice(-2);
      var d = ("0" + dateObj.getDate()).slice(-2);
      tradedAt = y + "." + mo + "." + d + " 00:00:00";
    }
    var amount = Math.abs(Number(row[table.columns.amount - 1]) || 0);
    var month = String(row[table.columns.month - 1] || "").trim();
    if (!month && dateObj) {
      var y2 = dateObj.getFullYear();
      var mo2 = String(dateObj.getMonth() + 1).padStart("0", 2);
      month = y2 + "-" + mo2;
    }
    return {
      kind: "expense",
      month: month,
      traded_at: tradedAt,
      amount: amount,
      type_name: String(row[table.columns.content - 1] || "").trim(),
      note: String(row[table.columns.note - 1] || "").trim(),
      upload_key: String(row[keyColumn - 1] || "").trim(),
    };
  }).filter(function(r) { return r.upload_key && r.upload_key.indexOf("|") !== -1 && r.amount > 0 && r.traded_at; });
}

function normalizeArray_(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value).trim())
    .filter(Boolean)));
}
