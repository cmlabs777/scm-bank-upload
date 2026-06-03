import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { makeDailyFortune, todayInKorea, type FortuneProfile } from "@/lib/fortune";

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS fortune_profiles (
      id            SERIAL PRIMARY KEY,
      slot          TEXT NOT NULL UNIQUE CHECK(slot IN ('me','partner')),
      display_name  TEXT NOT NULL DEFAULT '',
      birth_date    DATE,
      birth_time    TIME,
      calendar_type TEXT NOT NULL DEFAULT 'solar' CHECK(calendar_type IN ('solar','lunar')),
      gender        TEXT NOT NULL DEFAULT 'unspecified' CHECK(gender IN ('male','female','unspecified')),
      enabled       BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO fortune_profiles (slot, display_name)
    VALUES ('me', '나'), ('partner', '배우자')
    ON CONFLICT (slot) DO NOTHING
  `;

  tableReady = true;
}

function normalizeProfile(row: Record<string, unknown>): FortuneProfile {
  return {
    slot: row.slot === "partner" ? "partner" : "me",
    display_name: String(row.display_name || (row.slot === "partner" ? "배우자" : "나")),
    birth_date: row.birth_date ? String(row.birth_date) : null,
    birth_time: row.birth_time ? String(row.birth_time).slice(0, 5) : null,
    calendar_type: row.calendar_type === "lunar" ? "lunar" : "solar",
    gender: row.gender === "male" || row.gender === "female" ? row.gender : "unspecified",
    enabled: row.enabled !== false,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

async function loadProfiles() {
  await ensureTable();

  const rows = await sql`
    SELECT
      slot,
      display_name,
      birth_date::text AS birth_date,
      to_char(birth_time, 'HH24:MI') AS birth_time,
      calendar_type,
      gender,
      enabled,
      updated_at
    FROM fortune_profiles
    ORDER BY CASE WHEN slot = 'me' THEN 0 ELSE 1 END
  `;

  return rows.map(normalizeProfile);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = todayInKorea();
  const profiles = await loadProfiles();

  return NextResponse.json({
    today,
    profiles: profiles.map(profile => ({
      ...profile,
      fortune: makeDailyFortune(profile, today),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const profiles = Array.isArray(body.profiles) ? body.profiles : [];

  await ensureTable();

  for (const item of profiles) {
    const slot = item.slot === "partner" ? "partner" : item.slot === "me" ? "me" : null;
    if (!slot) continue;

    const displayName = String(item.display_name || (slot === "partner" ? "배우자" : "나")).trim();
    const birthDate = item.birth_date ? String(item.birth_date) : null;
    const birthTime = item.birth_time ? String(item.birth_time) : null;
    const calendarType = item.calendar_type === "lunar" ? "lunar" : "solar";
    const gender = item.gender === "male" || item.gender === "female" ? item.gender : "unspecified";
    const enabled = item.enabled !== false;

    await sql`
      INSERT INTO fortune_profiles
        (slot, display_name, birth_date, birth_time, calendar_type, gender, enabled, updated_at)
      VALUES
        (${slot}, ${displayName || (slot === "partner" ? "배우자" : "나")}, ${birthDate}, ${birthTime}, ${calendarType}, ${gender}, ${enabled}, NOW())
      ON CONFLICT (slot) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        birth_date = EXCLUDED.birth_date,
        birth_time = EXCLUDED.birth_time,
        calendar_type = EXCLUDED.calendar_type,
        gender = EXCLUDED.gender,
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
    `;
  }

  return NextResponse.json({ ok: true, profiles: await loadProfiles() });
}
