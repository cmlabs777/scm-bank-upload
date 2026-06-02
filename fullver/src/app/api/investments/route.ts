import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const month = searchParams.get("month");

  let rows;
  if (month) {
    rows = await sql`
      SELECT * FROM investments WHERE LEFT(traded_at, 7) = ${month} ORDER BY traded_at DESC
    `;
  } else {
    rows = await sql`SELECT * FROM investments ORDER BY traded_at DESC LIMIT 500`;
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const rows = Array.isArray(body) ? body : [body];

  let inserted = 0;
  for (const r of rows) {
    await sql`
      INSERT INTO investments (kind, category, product, traded_at, unit_price, quantity, amount, fee, return_rate, note)
      VALUES (${r.kind}, ${r.category}, ${r.product}, ${r.traded_at},
              ${r.unit_price}, ${r.quantity}, ${r.amount}, ${r.fee}, ${r.return_rate}, ${r.note})
    `;
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await sql`DELETE FROM investments WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
