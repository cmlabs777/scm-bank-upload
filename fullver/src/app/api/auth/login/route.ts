import { NextRequest, NextResponse } from "next/server";
import { compareSync } from "bcryptjs";
import { sql } from "@/lib/db";
import { signToken, COOKIE } from "@/lib/auth";
import type { JwtPayload, Role } from "@/types";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "이메일과 비밀번호를 입력하세요." }, { status: 400 });
  }

  const rows = await sql`
    SELECT id, email, password, role FROM users WHERE email = ${email.trim()} LIMIT 1
  `;
  const user = rows[0] as { id: number; email: string; password: string; role: Role } | undefined;

  if (!user || !compareSync(password, user.password)) {
    return NextResponse.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const token = await signToken(payload);

  const res = NextResponse.json({ ok: true, role: user.role });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
