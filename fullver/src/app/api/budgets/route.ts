import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

// DDL runs at most once per server instance (cold start).
let tableReady = false;
const ensureTable = async () => {
  if (tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id             SERIAL PRIMARY KEY,
      type_name      VARCHAR(100) NOT NULL,
      kind           VARCHAR(20)  NOT NULL DEFAULT 'expense',
      monthly_amount INT          NOT NULL,
      UNIQUE (type_name, kind)
    )
  `;
  tableReady = true;
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTable();
  const rows = await sql`SELECT * FROM budgets ORDER BY kind, type_name`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type_name, kind = "expense", monthly_amount } = await req.json();
  if (!type_name || !monthly_amount)
    return NextResponse.json({ error: "type_name, monthly_amount required" }, { status: 400 });

  await ensureTable();
  await sql`
    INSERT INTO budgets (type_name, kind, monthly_amount)
    VALUES (${type_name}, ${kind}, ${Number(monthly_amount)})
    ON CONFLICT (type_name, kind) DO UPDATE SET monthly_amount = EXCLUDED.monthly_amount
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  await sql`DELETE FROM budgets WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
