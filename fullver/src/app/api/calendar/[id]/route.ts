import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, start_date, end_date, start_time, end_time, is_shared, note } = body;

  if (!title?.trim() || !start_date) {
    return NextResponse.json({ error: "title, start_date required" }, { status: 400 });
  }

  const [row] = await sql`
    UPDATE calendar_events SET
      title      = ${title.trim()},
      start_date = ${start_date},
      end_date   = ${end_date   || null},
      start_time = ${start_time || null},
      end_time   = ${end_time   || null},
      is_shared  = ${!!is_shared},
      note       = ${note || ""}
    WHERE id = ${Number(id)}
    RETURNING
      id, user_id, title,
      start_date::text AS start_date,
      end_date::text   AS end_date,
      start_time::text AS start_time,
      end_time::text   AS end_time,
      is_shared, note
  `;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await sql`DELETE FROM calendar_events WHERE id = ${Number(id)}`;
  return NextResponse.json({ ok: true });
}
