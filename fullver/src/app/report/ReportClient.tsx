"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

interface MonthData {
  month: string;
  income: number;
  expense: number;
  net: number;
  investmentTotal: number;
  expenseByType: Record<string, number>;
  incomeByType: Record<string, number>;
}

const PALETTE = [
  "#c4572a", "#d09828", "#8b5e3c", "#6b8e6b", "#5a7a9e",
  "#c4874a", "#9e6b8a", "#4a8e8e", "#a08060", "#7a8e4a",
];

function fmt(n: number): string {
  return (n / 10000).toFixed(0) + "만";
}

function fmtFull(n: number): string {
  return n.toLocaleString() + "원";
}

export default function ReportClient() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthData | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/report?year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setSelectedMonth(null);
      })
      .finally(() => setLoading(false));
  }, [year]);

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const barData = data.map((d) => ({
    name: d.month.slice(5),
    수입: d.income,
    지출: d.expense,
    순수익: d.net,
    투자: d.investmentTotal,
  }));

  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);
  const totalNet = totalIncome - totalExpense;

  const expenseTypeAgg: Record<string, number> = {};
  data.forEach((d) => {
    Object.entries(d.expenseByType).forEach(([k, v]) => {
      expenseTypeAgg[k] = (expenseTypeAgg[k] || 0) + v;
    });
  });
  const pieData = Object.entries(expenseTypeAgg)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  return (
    <>
      <div className="page-header">
        <h1>리포트</h1>
        <select className="year-select" value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>

      {loading && <p className="loading-hint">불러오는 중…</p>}

      {!loading && data.length === 0 && (
        <p className="empty-hint">해당 연도의 데이터가 없습니다.</p>
      )}

      {!loading && data.length > 0 && (
        <>
          <div className="summary-cards">
            <div className="summary-card income">
              <span className="card-label">연간 수입</span>
              <span className="card-value">{fmtFull(totalIncome)}</span>
            </div>
            <div className="summary-card expense">
              <span className="card-label">연간 지출</span>
              <span className="card-value">{fmtFull(totalExpense)}</span>
            </div>
            <div className={`summary-card ${totalNet >= 0 ? "income" : "expense"}`}>
              <span className="card-label">순수익</span>
              <span className="card-value">{fmtFull(totalNet)}</span>
            </div>
          </div>

          <div className="chart-panel">
            <h2>월별 수입·지출</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5d9cc" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmtFull(Number(v))} />
                <Legend />
                <Bar dataKey="수입" fill="#6b8e6b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="지출" fill="#c4572a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-panel">
            <h2>순수익 추이</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={barData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5d9cc" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmtFull(Number(v))} />
                <Line type="monotone" dataKey="순수익" stroke="#d09828" strokeWidth={2} dot={{ r: 4, fill: "#d09828" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {pieData.length > 0 && (
            <div className="chart-panel chart-row">
              <div className="chart-col">
                <h2>지출 유형 분포</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtFull(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-col type-breakdown">
                <h2>유형별 합계</h2>
                <ul className="type-list">
                  {pieData.map(({ name, value }, i) => (
                    <li key={name} className="type-item">
                      <span className="type-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="type-label">{name || "미분류"}</span>
                      <span className="type-amount">{fmtFull(value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="chart-panel">
            <h2>월별 상세</h2>
            <div className="monthly-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>월</th>
                    <th>수입</th>
                    <th>지출</th>
                    <th>순수익</th>
                    <th>투자</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <>
                      <tr key={d.month} onClick={() => setSelectedMonth(selectedMonth?.month === d.month ? null : d)} className="clickable-row">
                        <td>{d.month}</td>
                        <td className="amount-cell income-text">{fmtFull(d.income)}</td>
                        <td className="amount-cell expense-text">{fmtFull(d.expense)}</td>
                        <td className={`amount-cell ${d.net >= 0 ? "income-text" : "expense-text"}`}>{fmtFull(d.net)}</td>
                        <td className="amount-cell">{d.investmentTotal > 0 ? fmtFull(d.investmentTotal) : "-"}</td>
                        <td>{selectedMonth?.month === d.month ? "▲" : "▼"}</td>
                      </tr>
                      {selectedMonth?.month === d.month && (
                        <tr key={d.month + "-detail"}>
                          <td colSpan={6}>
                            <div className="month-detail">
                              <div>
                                <strong>지출 유형별</strong>
                                <ul>
                                  {Object.entries(d.expenseByType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                                    <li key={k}>{k || "미분류"}: {fmtFull(v)}</li>
                                  ))}
                                </ul>
                              </div>
                              {Object.keys(d.incomeByType).length > 0 && (
                                <div>
                                  <strong>수입 유형별</strong>
                                  <ul>
                                    {Object.entries(d.incomeByType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                                      <li key={k}>{k || "미분류"}: {fmtFull(v)}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
