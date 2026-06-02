import { NextRequest, NextResponse } from "next/server";
import { hashSync } from "bcryptjs";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql`SELECT id, email, role, created_at FROM users ORDER BY created_at`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { email, password, role } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "email, password required" }, { status: 400 });
  }

  const hashed = hashSync(password, 10);
  const userRole = role === "admin" ? "admin" : "user";
  try {
    const result = await sql`
      INSERT INTO users (email, password, role) VALUES (${email.trim()}, ${hashed}, ${userRole})
      RETURNING id
    `;
    return NextResponse.json({ ok: true, id: result[0].id });
  } catch {
    return NextResponse.json({ error: "이미 존재하는 이메일입니다." }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json();
  if (id === session.sub) {
    return NextResponse.json({ error: "자신의 계정은 삭제할 수 없습니다." }, { status: 400 });
  }

  await sql`DELETE FROM users WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, password } = await req.json();
  if (!id || !password) return NextResponse.json({ error: "id, password required" }, { status: 400 });

  const hashed = hashSync(password, 10);
  await sql`UPDATE users SET password = ${hashed} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
