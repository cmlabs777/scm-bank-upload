import { NextRequest, NextResponse } from "next/server";
import { sql, query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const month     = p.get("month");
  const kind      = p.get("kind");
  const search    = p.get("search");
  const amountMin = p.get("amountMin");
  const amountMax = p.get("amountMax");

  const conds: string[] = [];
  const vals: unknown[] = [];
  const add = (v: unknown) => { vals.push(v); return vals.length; };

  if (month)                  conds.push(`month = $${add(month)}`);
  if (kind && kind !== "all") conds.push(`kind = $${add(kind)}`);
  if (amountMin)              conds.push(`amount >= $${add(Number(amountMin))}`);
  if (amountMax)              conds.push(`amount <= $${add(Number(amountMax))}`);
  if (search) {
    const n = add(`%${search}%`);
    conds.push(`(note ILIKE $${n} OR type_name ILIKE $${n})`);
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await query(
    `SELECT * FROM transactions ${where} ORDER BY traded_at DESC LIMIT 500`,
    vals,
  );

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows: Array<{
    kind: string; month: string; traded_at: string; amount: number;
    type_name: string; note: string; upload_key: string;
  }> = Array.isArray(body) ? body : [body];

  let inserted = 0;
  for (const r of rows) {
    const res = await sql`
      INSERT INTO transactions (kind, month, traded_at, amount, type_name, note, upload_key)
      VALUES (${r.kind}, ${r.month}, ${r.traded_at}, ${r.amount}, ${r.type_name}, ${r.note}, ${r.upload_key})
      ON CONFLICT (upload_key) DO NOTHING
      RETURNING id
    `;
    if (res.length > 0) inserted++;
  }

  return NextResponse.json({ ok: true, inserted });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await sql`DELETE FROM transactions WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
