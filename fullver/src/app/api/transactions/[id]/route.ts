import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { kind, date, amount, type_name, note } = await req.json();
  if (!["income", "expense"].includes(kind) || !date || !Number(amount) || !String(type_name || "").trim()) {
    return NextResponse.json({ error: "kind, date, amount, type_name required" }, { status: 400 });
  }

  // date input gives "YYYY-MM-DD" → store as "YYYY.MM.DD 00:00:00"
  const [y, mo, d] = String(date).split("-");
  const traded_at = `${y}.${mo}.${d} 00:00:00`;
  const month = `${y}-${mo}`;

  await sql`
    UPDATE transactions
    SET kind=${kind}, traded_at=${traded_at}, month=${month},
        amount=${Number(amount)}, type_name=${type_name}, note=${note}
    WHERE id=${Number(id)}
  `;

  return NextResponse.json({ ok: true });
}
