import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql`
    SELECT d.id, d.user_id, d.title,
           d.target_date::text AS target_date,
           d.emoji, d.color, d.created_at,
           u.email AS user_email
    FROM ddays d
    JOIN users u ON u.id = d.user_id
    ORDER BY d.target_date ASC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, target_date, emoji, color } = await req.json();
  if (!title?.trim() || !target_date)
    return NextResponse.json({ error: "title, target_date required" }, { status: 400 });

  const [row] = await sql`
    INSERT INTO ddays (user_id, title, target_date, emoji, color)
    VALUES (${session.sub}, ${title.trim()}, ${target_date}, ${emoji || "📅"}, ${color || "#c4572a"})
    RETURNING id, user_id, title, target_date::text AS target_date, emoji, color
  `;
  return NextResponse.json(row, { status: 201 });
}
