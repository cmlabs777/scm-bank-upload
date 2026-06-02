import { neon } from "@neondatabase/serverless";

type NeonSql = ReturnType<typeof neon>;

let client: NeonSql | null = null;

function getSql(): NeonSql {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  if (!client) {
    client = neon(process.env.DATABASE_URL);
  }

  return client;
}

// neon v1 only supports tagged-template syntax — use the IS-NULL pattern
// for optional WHERE conditions instead of dynamic string queries.
export function sql<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
  return getSql()(strings, ...values) as Promise<T[]>;
}
