import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { JwtPayload, Role } from "@/types";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "scm-dev-secret-change-in-production"
);
const COOKIE = "scm_token";
const EXPIRES = "7d";

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.sub))
    .setIssuedAt()
    .setExpirationTime(EXPIRES)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      sub: Number(payload.sub),
      email: payload.email as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export { COOKIE };
