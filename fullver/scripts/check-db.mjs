/**
 * DB 진단 스크립트 — 저장된 month 값 분포와 샘플 조회
 * 실행: node scripts/check-db.mjs
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

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();

// 1. month 값 분포
const dist = await client.query(`
  SELECT month, kind, COUNT(*) as cnt
  FROM transactions
  GROUP BY month, kind
  ORDER BY month, kind
`);
console.log("\n[month 분포]");
console.table(dist.rows);

// 2. 총 건수
const total = await client.query(`SELECT COUNT(*) as total FROM transactions`);
console.log(`\n총 거래 수: ${total.rows[0].total}건`);

// 3. month 포맷이 의심스러운 것 (YYYY-M 형태, zero-pad 없음)
const bad = await client.query(`
  SELECT month, COUNT(*) as cnt
  FROM transactions
  WHERE month NOT LIKE '____-__'
  GROUP BY month
  ORDER BY month
`);
if (bad.rows.length) {
  console.log("\n[⚠️ 포맷 불량 month 값]");
  console.table(bad.rows);
} else {
  console.log("\n[✓ 모든 month 값이 YYYY-MM 포맷]");
}

// 4. traded_at 샘플 (가장 오래된 10건)
const sample = await client.query(`
  SELECT id, month, traded_at, amount, kind, type_name
  FROM transactions
  ORDER BY traded_at ASC
  LIMIT 10
`);
console.log("\n[가장 오래된 10건]");
console.table(sample.rows);

await client.end();
