import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// neon v1 only supports tagged-template syntax — use the IS-NULL pattern
// for optional WHERE conditions instead of dynamic string queries.
export const sql = neon(process.env.DATABASE_URL);
