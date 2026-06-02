import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql`SELECT * FROM classification_rules ORDER BY keyword`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { keyword, type_name, description } = await req.json();
  if (!keyword || !type_name) return NextResponse.json({ error: "keyword, type_name required" }, { status: 400 });

  const result = await sql`
    INSERT INTO classification_rules (keyword, type_name, description)
    VALUES (${keyword}, ${type_name}, ${description ?? ""})
    ON CONFLICT (keyword) DO UPDATE SET type_name = EXCLUDED.type_name, description = EXCLUDED.description
    RETURNING id
  `;
  return NextResponse.json({ ok: true, id: result[0]?.id ?? null });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await sql`DELETE FROM classification_rules WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
