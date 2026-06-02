import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql`SELECT upload_key FROM transactions` as { upload_key: string }[];
  return NextResponse.json(rows.map((r) => r.upload_key));
}
