/**
 * 구글 시트 출금내역 탭 전체 임포트 (upload_key 없는 구 데이터 포함)
 * 실행: node scripts/import-historical.mjs
 *
 * 선행: clasp push + clasp deploy 로 GAS 업데이트 필요
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

// ── 1. 시트 목록 확인 ──────────────────────────────────
console.log("시트 목록 확인 중...");
const sheetsRes = await fetch(`${GAS_URL}?action=listSheets`);
const sheetsJson = await sheetsRes.json();
if (!sheetsJson.ok) throw new Error("listSheets 오류: " + sheetsJson.error);
console.log("시트 목록:", sheetsJson.data.join(", "));

// ── 2. 전체 출금내역 가져오기 ──────────────────────────
console.log("\n출금내역 전체 조회 중 (구 데이터 포함)...");
const res = await fetch(`${GAS_URL}?action=getAllHistory`);
const json = await res.json();
if (!json.ok) throw new Error("getAllHistory 오류: " + json.error);

const rows = json.data;
console.log(`총 ${rows.length}건 조회됨`);

// 월별 분포 확인
const byMonth = {};
for (const r of rows) {
  byMonth[r.month] = (byMonth[r.month] || 0) + 1;
}
console.log("\n[월별 분포 (GAS)]");
Object.keys(byMonth).sort().forEach(m => console.log(`  ${m}: ${byMonth[m]}건`));

if (!rows.length) { console.log("\n데이터 없음 — GAS가 업데이트되지 않았을 수 있습니다."); process.exit(0); }

// ── 3. Neon DB에 삽입 ────────────────────────────────
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();

let inserted = 0, skipped = 0;
for (const r of rows) {
  if (!r.upload_key || !r.traded_at || !r.month) { skipped++; continue; }
  const result = await client.query(
    `INSERT INTO transactions (kind, month, traded_at, amount, type_name, note, upload_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (upload_key) DO NOTHING`,
    [r.kind || "expense", r.month, r.traded_at, r.amount || 0, r.type_name || "", r.note || "", r.upload_key],
  );
  if (result.rowCount > 0) inserted++; else skipped++;
  if ((inserted + skipped) % 50 === 0) process.stdout.write(`\r${inserted + skipped}/${rows.length} 처리 중...`);
}

console.log(`\n✓ 완료 — 신규 ${inserted}건 삽입, ${skipped}건 건너뜀 (중복 포함)`);

// ── 4. 삽입 후 DB 분포 확인 ────────────────────────────
const after = await client.query(`
  SELECT month, kind, COUNT(*) as cnt
  FROM transactions
  GROUP BY month, kind
  ORDER BY month, kind
`);
console.log("\n[삽입 후 DB 월별 분포]");
console.table(after.rows);

await client.end();
