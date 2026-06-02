import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const year = searchParams.get("year");
  const yearPattern = year ? `${year}-%` : null;

  const [monthlyRows, typeRows, investRows] = await Promise.all([
    yearPattern
      ? sql`SELECT month, kind, SUM(amount)::int as total FROM transactions WHERE month LIKE ${yearPattern} GROUP BY month, kind ORDER BY month`
      : sql`SELECT month, kind, SUM(amount)::int as total FROM transactions GROUP BY month, kind ORDER BY month`,

    yearPattern
      ? sql`SELECT month, type_name, kind, SUM(amount)::int as total FROM transactions WHERE month LIKE ${yearPattern} GROUP BY month, type_name, kind ORDER BY month, total DESC`
      : sql`SELECT month, type_name, kind, SUM(amount)::int as total FROM transactions GROUP BY month, type_name, kind ORDER BY month, total DESC`,

    yearPattern
      ? sql`SELECT LEFT(traded_at, 7) as month, SUM(amount)::numeric as total, COUNT(*)::int as count FROM investments WHERE traded_at LIKE ${yearPattern} GROUP BY LEFT(traded_at, 7) ORDER BY month`
      : sql`SELECT LEFT(traded_at, 7) as month, SUM(amount)::numeric as total, COUNT(*)::int as count FROM investments GROUP BY LEFT(traded_at, 7) ORDER BY month`,
  ]) as [
    Array<{ month: string; kind: string; total: number }>,
    Array<{ month: string; type_name: string; kind: string; total: number }>,
    Array<{ month: string; total: number; count: number }>,
  ];

  const months = new Set<string>([
    ...monthlyRows.map((r) => r.month),
    ...investRows.map((r) => r.month),
  ]);

  const report = Array.from(months).sort().map((month) => {
    const incomeRow = monthlyRows.find((r) => r.month === month && r.kind === "income");
    const expenseRow = monthlyRows.find((r) => r.month === month && r.kind === "expense");
    const investRow = investRows.find((r) => r.month === month);

    const expenseByType: Record<string, number> = {};
    const incomeByType: Record<string, number> = {};
    typeRows
      .filter((r) => r.month === month)
      .forEach((r) => {
        if (r.kind === "expense") expenseByType[r.type_name || "미분류"] = r.total;
        else incomeByType[r.type_name || "미분류"] = r.total;
      });

    return {
      month,
      income: incomeRow?.total ?? 0,
      expense: expenseRow?.total ?? 0,
      net: (incomeRow?.total ?? 0) - (expenseRow?.total ?? 0),
      investmentTotal: investRow?.total ?? 0,
      expenseByType,
      incomeByType,
    };
  });

  return NextResponse.json(report);
}
