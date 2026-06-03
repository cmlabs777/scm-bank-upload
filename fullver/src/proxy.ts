import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const DEV_SECRET = "scm-dev-secret-change-in-production";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/marble-roulette"];

function getSecret() {
  const secret = process.env.JWT_SECRET || "";
  if (!secret || (process.env.NODE_ENV === "production" && secret === DEV_SECRET)) {
    throw new Error("JWT_SECRET environment variable must be set to a strong production value");
  }
  return new TextEncoder().encode(secret);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("scm_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("scm_token");
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
