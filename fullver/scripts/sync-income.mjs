/**
 * 구글 시트 입금내역 신규 동기화
 * 실행: node scripts/sync-income.mjs
 */
import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const lines = readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n");
  for (const line of lines) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  }
} catch {}

const GAS_URL = "https://script.google.com/macros/s/AKfycbwcNeBJ1O0jvJ2rpxMsWKRQBhds5088RSVtFlHBSljHICo5C376gB2OWCmavV2oT9Vr/exec";

console.log("입금내역 조회 중...");
const res = await fetch(`${GAS_URL}?action=getIncomeHistory`);
const json = await res.json();
if (!json.ok) throw new Error("getIncomeHistory 오류: " + json.error);

const rows = json.data;
console.log(`GAS에서 ${rows.length}건 조회됨`);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();

const existing = await client.query(`SELECT COUNT(*) as cnt FROM transactions WHERE kind = 'income'`);
console.log(`DB 현재 입금 건수: ${existing.rows[0].cnt}건`);

let inserted = 0, skipped = 0;
for (const r of rows) {
  if (!r.upload_key || !r.traded_at || !r.month) { skipped++; continue; }
  const result = await client.query(
    `INSERT INTO transactions (kind, month, traded_at, amount, type_name, note, upload_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (upload_key) DO NOTHING`,
    ["income", r.month, r.traded_at, r.amount || 0, r.type_name || "", r.note || "", r.upload_key],
  );
  if (result.rowCount > 0) inserted++; else skipped++;
}

console.log(`✓ 완료 — 신규 ${inserted}건 삽입, ${skipped}건 건너뜀 (기존 포함)`);

const after = await client.query(`SELECT COUNT(*) as cnt FROM transactions WHERE kind = 'income'`);
console.log(`DB 입금 총 건수: ${after.rows[0].cnt}건`);

await client.end();
