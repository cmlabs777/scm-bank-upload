const path = require("path");
const XLSX = require("xlsx");
const parser = require("../parser");

const DEFAULT_TYPES = ["생활비", "외식비", "인터넷TV", "차량비", "정기구독", "아파트 관리비"];
const DEFAULT_RULES = [
  { keyword: "커피", type: "외식비", note: "카페 결제" },
  { keyword: "쿠팡", type: "생활비", note: "쿠팡 일반 결제" },
  { keyword: "인터넷", type: "인터넷TV", note: "통신/인터넷 결제" },
  { keyword: "주차", type: "차량비", note: "차량 관련 결제" },
];

const workbookPath = process.argv[2];

if (!workbookPath) {
  console.error("Usage: npm run verify:excel -- <xlsx-path>");
  process.exit(1);
}

const absolutePath = path.resolve(workbookPath);
const workbook = XLSX.readFile(absolutePath, { cellDates: true });
const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true, defval: "" });
const parsedRows = parser.parseBankRows(rows, {
  types: DEFAULT_TYPES,
  rules: DEFAULT_RULES,
  existingKeys: [],
});

const totalAmount = parsedRows.reduce((sum, row) => sum + row.absoluteAmount, 0);
const monthCounts = parsedRows.reduce((acc, row) => {
  acc[row.month] = (acc[row.month] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  file: absolutePath,
  sheet: workbook.SheetNames[0],
  parsedWithdrawals: parsedRows.length,
  totalWithdrawalAmount: totalAmount,
  monthCounts,
  firstRows: parsedRows.slice(0, 5).map((row) => ({
    sourceRowNumber: row.sourceRowNumber,
    tradedAt: row.tradedAt,
    month: row.month,
    date: row.date,
    amount: row.absoluteAmount,
    method: row.method,
    description: row.description,
    memo: row.memo,
    selectedType: row.selectedType,
    uploadKey: row.uploadKey,
    uploadPayload: row.uploadPayload,
  })),
}, null, 2));
