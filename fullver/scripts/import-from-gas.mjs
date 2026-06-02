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

console.log("GAS에서 출금내역 전체 조회 중...");
const res = await fetch(`${GAS_URL}?action=getAllWithdrawals`);
const json = await res.json();
if (!json.ok) throw new Error("GAS 오류: " + json.error);

const rows = json.data;
console.log(`총 ${rows.length}건 조회됨`);

if (!rows.length) { console.log("데이터 없음"); process.exit(0); }

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();

let inserted = 0, skipped = 0;
const BATCH = 100;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  for (const r of batch) {
    if (!r.upload_key || !r.traded_at || !r.month) { skipped++; continue; }
    const result = await client.query(
      `INSERT INTO transactions (kind, month, traded_at, amount, type_name, note, upload_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (upload_key) DO NOTHING`,
      [r.kind || "expense", r.month, r.traded_at, r.amount || 0, r.type_name || "", r.note || "", r.upload_key]
    );
    if (result.rowCount > 0) inserted++; else skipped++;
  }
  process.stdout.write(`\r${Math.min(i + BATCH, rows.length)}/${rows.length} 처리 중...`);
}

console.log(`\n✓ 완료 — 신규 ${inserted}건 삽입, ${skipped}건 건너뜀 (중복 포함)`);
await client.end();
