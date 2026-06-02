import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const month     = p.get("month");           // "2026-06" | null
  const kind      = p.get("kind");            // "expense" | "income" | null
  const search    = p.get("search");          // keyword | null
  const amountMin = p.get("amountMin");
  const amountMax = p.get("amountMax");

  // Keep parameter types concrete for Neon/Postgres. Untyped NULL checks can
  // fail with "could not determine data type of parameter".
  const monthVal      = month || "";
  const kindVal       = kind && kind !== "all" ? kind : "";
  const searchPattern = search ? `%${search}%` : "";
  const minVal        = amountMin ? Number(amountMin) : 0;
  const maxVal        = amountMax ? Number(amountMax) : 0;

  const rows = await sql`
    SELECT * FROM transactions
    WHERE (${monthVal}      = '' OR month      = ${monthVal})
      AND (${kindVal}       = '' OR kind       = ${kindVal})
      AND (${searchPattern} = '' OR note       ILIKE ${searchPattern}
                                    OR type_name  ILIKE ${searchPattern})
      AND (${minVal}        = 0  OR amount >= ${minVal})
      AND (${maxVal}        = 0  OR amount <= ${maxVal})
    ORDER BY traded_at DESC
    LIMIT 500
  `;

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

  const invalid = rows.find((r) =>
    !["income", "expense"].includes(r.kind) ||
    !r.month ||
    !r.traded_at ||
    !Number(r.amount) ||
    !String(r.type_name || "").trim() ||
    !r.upload_key
  );
  if (invalid) {
    return NextResponse.json({ error: "kind, month, traded_at, amount, type_name, upload_key required" }, { status: 400 });
  }

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
