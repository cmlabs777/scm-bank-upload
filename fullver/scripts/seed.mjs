import pg from "pg";
import { hashSync } from "bcryptjs";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const envPath = join(__dirname, "..", ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  }
} catch { /* env vars set directly in CI/Vercel */ }

const [,, email, password] = process.argv;
if (!email || !password) {
  console.log("Usage: node scripts/seed.mjs <email> <password>");
  process.exit(0);
}

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();

const existing = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
if (existing.rows.length > 0) {
  console.log("Admin account already exists.");
  await client.end();
  process.exit(0);
}

const hashed = hashSync(password.trim(), 10);
await client.query("INSERT INTO users (email, password, role) VALUES ($1, $2, 'admin')", [email.trim(), hashed]);
console.log(`✓ Admin account created: ${email.trim()}`);
await client.end();
