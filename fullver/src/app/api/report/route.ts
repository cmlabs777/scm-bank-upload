import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const startMonth = searchParams.get("startMonth");
  const endMonth   = searchParams.get("endMonth");

  const [monthlyRows, typeRows, investRows, investByCategory, investByKind, budgets] = await Promise.all([
    startMonth && endMonth
      ? sql`SELECT month, kind, SUM(amount)::int as total FROM transactions WHERE month >= ${startMonth} AND month <= ${endMonth} GROUP BY month, kind ORDER BY month`
      : sql`SELECT month, kind, SUM(amount)::int as total FROM transactions GROUP BY month, kind ORDER BY month`,

    startMonth && endMonth
      ? sql`SELECT month, type_name, kind, SUM(amount)::int as total FROM transactions WHERE month >= ${startMonth} AND month <= ${endMonth} GROUP BY month, type_name, kind ORDER BY month, total DESC`
      : sql`SELECT month, type_name, kind, SUM(amount)::int as total FROM transactions GROUP BY month, type_name, kind ORDER BY month, total DESC`,

    startMonth && endMonth
      ? sql`SELECT LEFT(traded_at,7) as month, SUM(amount)::numeric as total, COUNT(*)::int as count FROM investments WHERE LEFT(traded_at,7) >= ${startMonth} AND LEFT(traded_at,7) <= ${endMonth} GROUP BY LEFT(traded_at,7) ORDER BY month`
      : sql`SELECT LEFT(traded_at,7) as month, SUM(amount)::numeric as total, COUNT(*)::int as count FROM investments GROUP BY LEFT(traded_at,7) ORDER BY month`,

    startMonth && endMonth
      ? sql`SELECT category, SUM(amount)::numeric as total, COUNT(*)::int as count FROM investments WHERE LEFT(traded_at,7) >= ${startMonth} AND LEFT(traded_at,7) <= ${endMonth} GROUP BY category ORDER BY total DESC`
      : sql`SELECT category, SUM(amount)::numeric as total, COUNT(*)::int as count FROM investments GROUP BY category ORDER BY total DESC`,

    startMonth && endMonth
      ? sql`SELECT kind, SUM(amount)::numeric as total, COUNT(*)::int as count, AVG(return_rate)::numeric as avg_return FROM investments WHERE LEFT(traded_at,7) >= ${startMonth} AND LEFT(traded_at,7) <= ${endMonth} GROUP BY kind ORDER BY total DESC`
      : sql`SELECT kind, SUM(amount)::numeric as total, COUNT(*)::int as count, AVG(return_rate)::numeric as avg_return FROM investments GROUP BY kind ORDER BY total DESC`,

    sql`SELECT id, type_name, kind, monthly_amount FROM budgets ORDER BY kind, type_name`.catch(() => [] as unknown[]),
  ]) as [
    Array<{ month: string; kind: string; total: number }>,
    Array<{ month: string; type_name: string; kind: string; total: number }>,
    Array<{ month: string; total: number; count: number }>,
    Array<{ category: string; total: number; count: number }>,
    Array<{ kind: string; total: number; count: number; avg_return: number }>,
    Array<{ id: number; type_name: string; kind: string; monthly_amount: number }>,
  ];

  const months = new Set<string>([
    ...monthlyRows.map(r=>r.month),
    ...investRows.map(r=>r.month),
  ]);

  const report = Array.from(months).sort().map(month => {
    const incomeRow  = monthlyRows.find(r=>r.month===month && r.kind==="income");
    const expenseRow = monthlyRows.find(r=>r.month===month && r.kind==="expense");
    const investRow  = investRows.find(r=>r.month===month);
    const expenseByType: Record<string,number> = {};
    const incomeByType:  Record<string,number> = {};
    typeRows.filter(r=>r.month===month).forEach(r=>{
      if (r.kind==="expense") expenseByType[r.type_name||"미분류"] = r.total;
      else incomeByType[r.type_name||"미분류"] = r.total;
    });
    return {
      month,
      income:  incomeRow?.total  ?? 0,
      expense: expenseRow?.total ?? 0,
      net: (incomeRow?.total ?? 0) - (expenseRow?.total ?? 0),
      investmentTotal: Number(investRow?.total ?? 0),
      expenseByType, incomeByType,
    };
  });

  return NextResponse.json({
    report,
    investByCategory: investByCategory.map(r=>({...r, total:Number(r.total)})),
    investByKind:     investByKind.map(r=>({...r, total:Number(r.total), avg_return:Number(r.avg_return)})),
    budgets,
  });
}
