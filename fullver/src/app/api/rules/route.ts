import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql`SELECT * FROM classification_rules ORDER BY kind, keyword`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { keyword, kind = "expense", type_name, description } = await req.json();
  if (!keyword || !kind || !type_name) return NextResponse.json({ error: "keyword, kind, type_name required" }, { status: 400 });

  const result = await sql`
    INSERT INTO classification_rules (keyword, kind, type_name, description)
    VALUES (${keyword}, ${kind}, ${type_name}, ${description ?? ""})
    ON CONFLICT (keyword, kind) DO UPDATE SET type_name = EXCLUDED.type_name, description = EXCLUDED.description
    RETURNING id
  `;
  return NextResponse.json({ ok: true, id: result[0]?.id ?? null });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  await sql`DELETE FROM classification_rules WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
