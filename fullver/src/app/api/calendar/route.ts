import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const year  = p.get("year")  || String(new Date().getFullYear());
  const month = p.get("month") || String(new Date().getMonth() + 1);

  const y = Number(year);
  const m = Number(month);
  const ym = `${year}-${String(m).padStart(2, "0")}`;
  const firstDay   = `${ym}-01`;
  // new Date(y, m, 0) = last day of month m (1-indexed) — avoids invalid dates like "06-31"
  const lastDayNum = new Date(y, m, 0).getDate();
  const lastDay    = `${ym}-${String(lastDayNum).padStart(2, "0")}`;

  const rows = await sql`
    SELECT
      e.id, e.user_id, e.title,
      e.start_date::text AS start_date,
      e.end_date::text   AS end_date,
      e.start_time::text AS start_time,
      e.end_time::text   AS end_time,
      e.is_shared, e.note,
      u.email            AS user_email
    FROM calendar_events e
    JOIN users u ON u.id = e.user_id
    WHERE
      e.start_date <= ${lastDay}::date
      AND (
        (e.end_date IS NULL AND e.start_date >= ${firstDay}::date)
        OR e.end_date >= ${firstDay}::date
      )
    ORDER BY e.start_date, e.start_time NULLS LAST
  `;

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, start_date, end_date, start_time, end_time, is_shared, note } = body;

  if (!title?.trim() || !start_date) {
    return NextResponse.json({ error: "title, start_date required" }, { status: 400 });
  }
  if (end_date && end_date < start_date) {
    return NextResponse.json({ error: "end_date must be >= start_date" }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO calendar_events
      (user_id, title, start_date, end_date, start_time, end_time, is_shared, note)
    VALUES (
      ${session.sub},
      ${title.trim()},
      ${start_date},
      ${end_date || null},
      ${start_time || null},
      ${end_time   || null},
      ${!!is_shared},
      ${note || ""}
    )
    RETURNING
      id, user_id, title,
      start_date::text AS start_date,
      end_date::text   AS end_date,
      start_time::text AS start_time,
      end_time::text   AS end_time,
      is_shared, note
  `;

  return NextResponse.json(row, { status: 201 });
}
