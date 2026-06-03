import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { title, target_date, emoji, color } = await req.json();
  if (!title?.trim() || !target_date)
    return NextResponse.json({ error: "title, target_date required" }, { status: 400 });

  const [row] = await sql`
    UPDATE ddays SET
      title = ${title.trim()}, target_date = ${target_date},
      emoji = ${emoji || "📅"}, color = ${color || "#c4572a"}
    WHERE id = ${Number(id)}
    RETURNING id, user_id, title, target_date::text AS target_date, emoji, color
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await sql`DELETE FROM ddays WHERE id = ${Number(id)}`;
  return NextResponse.json({ ok: true });
}
