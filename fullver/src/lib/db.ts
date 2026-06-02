import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const sql = neon(process.env.DATABASE_URL);

// Raw parameterised query for dynamic WHERE clauses that can't use tagged templates.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const query = (text: string, params: unknown[] = []): Promise<any[]> =>
  (sql as unknown as (t: string, p: unknown[]) => Promise<unknown[]>)(text, params) as Promise<any[]>;
