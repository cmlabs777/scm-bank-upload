import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql`
    SELECT p.id, p.user_id, p.title, p.content,
           p.created_at, p.updated_at, u.email AS user_email
    FROM posts p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, content } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

  const [row] = await sql`
    INSERT INTO posts (user_id, title, content)
    VALUES (${session.sub}, ${title.trim()}, ${content || ""})
    RETURNING id, user_id, title, content, created_at, updated_at
  `;
  return NextResponse.json(row, { status: 201 });
}
