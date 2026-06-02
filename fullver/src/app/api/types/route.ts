import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql`SELECT * FROM transaction_types ORDER BY kind, name`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, kind } = await req.json();
  if (!name || !kind) return NextResponse.json({ error: "name, kind required" }, { status: 400 });

  const result = await sql`
    INSERT INTO transaction_types (name, kind) VALUES (${name}, ${kind})
    ON CONFLICT (name, kind) DO NOTHING
    RETURNING id
  `;
  return NextResponse.json({ ok: true, id: result[0]?.id ?? null });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await sql`DELETE FROM transaction_types WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
