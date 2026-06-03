import pg from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local if present
try {
  const envPath = join(__dirname, "..", ".env.local");
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  }
} catch { /* no .env.local in production, env vars set directly */ }

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });

await client.connect();
console.log("Connected to Neon PostgreSQL");

await client.query(`
  CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS transaction_types (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'expense'
  );

  CREATE TABLE IF NOT EXISTS classification_rules (
    id          SERIAL PRIMARY KEY,
    keyword     TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'expense',
    type_name   TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id         SERIAL PRIMARY KEY,
    kind       TEXT NOT NULL CHECK(kind IN ('income','expense')),
    month      TEXT NOT NULL,
    traded_at  TEXT NOT NULL,
    amount     INTEGER NOT NULL,
    type_name  TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    upload_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month);
  CREATE INDEX IF NOT EXISTS idx_transactions_kind  ON transactions(kind);

  CREATE TABLE IF NOT EXISTS investments (
    id          SERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '',
    product     TEXT NOT NULL DEFAULT '',
    traded_at   TEXT NOT NULL,
    unit_price  DOUBLE PRECISION NOT NULL DEFAULT 0,
    quantity    DOUBLE PRECISION NOT NULL DEFAULT 0,
    amount      DOUBLE PRECISION NOT NULL DEFAULT 0,
    fee         DOUBLE PRECISION NOT NULL DEFAULT 0,
    return_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    note        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_investments_traded ON investments(traded_at);
`);

await client.query(`
  ALTER TABLE transaction_types
    DROP CONSTRAINT IF EXISTS transaction_types_name_key;

  CREATE UNIQUE INDEX IF NOT EXISTS transaction_types_name_kind_key
    ON transaction_types(name, kind);

  ALTER TABLE classification_rules
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'expense';

  ALTER TABLE classification_rules
    DROP CONSTRAINT IF EXISTS classification_rules_keyword_key;

  CREATE UNIQUE INDEX IF NOT EXISTS classification_rules_keyword_kind_key
    ON classification_rules(keyword, kind);
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS calendar_events (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    start_date  DATE NOT NULL,
    end_date    DATE,
    start_time  TIME,
    end_time    TIME,
    is_shared   BOOLEAN NOT NULL DEFAULT FALSE,
    note        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_date);
  CREATE INDEX IF NOT EXISTS idx_calendar_uid   ON calendar_events(user_id);
`);

await client.query(`
  CREATE TABLE IF NOT EXISTS posts (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
`);

console.log("✓ Tables created (or already exist)");
await client.end();
