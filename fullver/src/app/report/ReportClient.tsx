"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";

interface MonthData {
  month: string; income: number; expense: number; net: number;
  investmentTotal: number;
  expenseByType: Record<string,number>;
  incomeByType:  Record<string,number>;
}
interface InvestCategory { category: string; total: number; count: number; }
interface InvestKind     { kind: string; total: number; count: number; avg_return: number; }
interface Budget         { id: number; type_name: string; kind: string; monthly_amount: number; }

const PALETTE = ["#c4572a","#d09828","#8b5e3c","#6b8e6b","#5a7a9e","#c4874a","#9e6b8a","#4a8e8e","#a08060","#7a8e4a"];

function fmt(n: number)     { return (n/10000).toFixed(0)+"만"; }
function fmtFull(n: number) { return n.toLocaleString()+"원"; }

function defaultRange() {
  const now = new Date();
  const end   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const s     = new Date(now.getFullYear(), now.getMonth()-5, 1);
  const start = `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}`;
  return { start, end };
}

function genMonthOptions() {
  const opts: string[] = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    opts.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
  }
  return opts;
}

function monthsBetween(start: string, end: string) {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

const MONTH_OPTS = genMonthOptions();

export default function ReportClient() {
  const def = defaultRange();
  const [startMonth, setStartMonth] = useState(def.start);
  const [endMonth,   setEndMonth]   = useState(def.end);
  const [tab,        setTab]        = useState<"cashflow"|"invest">("cashflow");
  const [report,     setReport]     = useState<MonthData[]>([]);
  const [invCat,     setInvCat]     = useState<InvestCategory[]>([]);
  const [invKind,    setInvKind]    = useState<InvestKind[]>([]);
  const [budgets,    setBudgets]    = useState<Budget[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthData|null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/report?startMonth=${startMonth}&endMonth=${endMonth}`)
        .then(r=>r.json())
        .then(d => {
          setReport(d.report || []);
          setInvCat(d.investByCategory || []);
          setInvKind(d.investByKind || []);
          setBudgets(d.budgets || []);
          setSelectedMonth(null);
        })
        .finally(()=>setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [startMonth, endMonth]);

  const totalIncome  = report.reduce((s,d)=>s+d.income,0);
  const totalExpense = report.reduce((s,d)=>s+d.expense,0);
  const totalInvest  = report.reduce((s,d)=>s+d.investmentTotal,0);
  const nMonths      = monthsBetween(startMonth, endMonth);

  const barData = report.map(d=>({
    name: d.month.slice(5),
    수입: d.income, 지출: d.expense, 순수익: d.net, 투자: d.investmentTotal,
  }));

  const expTypeAgg: Record<string,number> = {};
  report.forEach(d=>Object.entries(d.expenseByType).forEach(([k,v])=>{ expTypeAgg[k]=(expTypeAgg[k]||0)+v; }));
  const pieData = Object.entries(expTypeAgg).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));

  const invBarData = report.map(d=>({ name:d.month.slice(5), 투자금액:d.investmentTotal }));

  const expBudgets = budgets.filter(b=>b.kind==="expense");
  const hasBudget  = expBudgets.length > 0;

  return (
    <>
      <div className="page-header">
        <h1>리포트</h1>
        <div className="month-range-picker">
          <select value={startMonth} onChange={e=>setStartMonth(e.target.value)} className="year-select">
            {MONTH_OPTS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <span className="range-sep">~</span>
          <select value={endMonth} onChange={e=>setEndMonth(e.target.value)} className="year-select">
            {MONTH_OPTS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="tab-bar" style={{marginBottom:20}}>
        <button className={`tab-btn${tab==="cashflow"?" active":""}`} onClick={()=>setTab("cashflow")}>💰 수입·지출</button>
        <button className={`tab-btn${tab==="invest"?" active":""}`}   onClick={()=>setTab("invest")}>📈 투자내역</button>
      </div>

      {loading && <p className="loading-hint">불러오는 중…</p>}
      {!loading && report.length===0 && tab==="cashflow" && <p className="empty-hint">해당 기간에 데이터가 없습니다.</p>}

      {/* ── 수입·지출 탭 ── */}
      {!loading && tab==="cashflow" && report.length>0 && (
        <>
          <div className="summary-cards">
            <div className="summary-card income">
              <span className="card-label">수입 합계</span>
              <span className="card-value">{fmtFull(totalIncome)}</span>
            </div>
            <div className="summary-card expense">
              <span className="card-label">지출 합계</span>
              <span className="card-value">{fmtFull(totalExpense)}</span>
            </div>
            <div className={`summary-card ${totalIncome-totalExpense>=0?"income":"expense"}`}>
              <span className="card-label">순수익</span>
              <span className="card-value">{fmtFull(totalIncome-totalExpense)}</span>
            </div>
          </div>

          <div className="chart-panel">
            <h2>월별 수입·지출</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{top:8,right:16,left:8,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5d9cc"/>
                <XAxis dataKey="name" tick={{fontSize:12}}/>
                <YAxis tickFormatter={fmt} tick={{fontSize:11}}/>
                <Tooltip formatter={(v)=>fmtFull(Number(v))}/>
                <Legend/>
                <Bar dataKey="수입" fill="#6b8e6b" radius={[3,3,0,0]}/>
                <Bar dataKey="지출" fill="#c4572a" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-panel">
            <h2>순수익 추이</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={barData} margin={{top:8,right:16,left:8,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5d9cc"/>
                <XAxis dataKey="name" tick={{fontSize:12}}/>
                <YAxis tickFormatter={fmt} tick={{fontSize:11}}/>
                <Tooltip formatter={(v)=>fmtFull(Number(v))}/>
                <Line type="monotone" dataKey="순수익" stroke="#d09828" strokeWidth={2} dot={{r:4,fill:"#d09828"}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {pieData.length>0 && (
            <div className="chart-panel chart-row">
              <div className="chart-col">
                <h2>지출 유형 분포</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                      label={({name,percent})=>`${name} ${((percent??0)*100).toFixed(0)}%`}>
                      {pieData.map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]}/>)}
                    </Pie>
                    <Tooltip formatter={(v)=>fmtFull(Number(v))}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-col type-breakdown">
                <h2>유형별 합계</h2>
                <ul className="type-list">
                  {pieData.map(({name,value},i)=>(
                    <li key={name} className="type-item">
                      <span className="type-dot" style={{background:PALETTE[i%PALETTE.length]}}/>
                      <span className="type-label">{name||"미분류"}</span>
                      <span className="type-amount">{fmtFull(value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── 예산 vs 실적 ── */}
          {hasBudget && (
            <div className="chart-panel">
              <h2>예산 vs 실적 <small style={{fontWeight:400,color:"var(--text-muted)"}}>({nMonths}개월 기준)</small></h2>
              <div className="budget-list">
                {expBudgets.map(b=>{
                  const totalBudget = b.monthly_amount * nMonths;
                  const actual      = expTypeAgg[b.type_name] ?? 0;
                  const pct         = totalBudget > 0 ? Math.min(Math.round(actual / totalBudget * 100), 999) : 0;
                  const over        = pct > 100;
                  return (
                    <div key={b.id} className="budget-row">
                      <div className="budget-meta">
                        <span className="budget-name">{b.type_name}</span>
                        <span className="budget-nums">
                          <span className={over?"expense-text":""}>{fmtFull(actual)}</span>
                          <span style={{color:"var(--text-muted)"}}> / {fmtFull(totalBudget)}</span>
                          <span className={`budget-pct ${over?"over":""}`}>{pct}%</span>
                        </span>
                      </div>
                      <div className="budget-bar-track">
                        <div className={`budget-bar-fill ${over?"over":""}`} style={{width:`${Math.min(pct,100)}%`}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="chart-panel">
            <h2>월별 상세</h2>
            <div className="monthly-table-wrap">
              <table>
                <thead><tr><th>월</th><th>수입</th><th>지출</th><th>순수익</th><th>투자</th><th></th></tr></thead>
                <tbody>
                  {report.map(d=>(
                    <>
                      <tr key={d.month} onClick={()=>setSelectedMonth(selectedMonth?.month===d.month?null:d)} className="clickable-row">
                        <td>{d.month}</td>
                        <td className="amount-cell income-text">{fmtFull(d.income)}</td>
                        <td className="amount-cell expense-text">{fmtFull(d.expense)}</td>
                        <td className={`amount-cell ${d.net>=0?"income-text":"expense-text"}`}>{fmtFull(d.net)}</td>
                        <td className="amount-cell">{d.investmentTotal>0?fmtFull(d.investmentTotal):"-"}</td>
                        <td>{selectedMonth?.month===d.month?"▲":"▼"}</td>
                      </tr>
                      {selectedMonth?.month===d.month && (
                        <tr key={d.month+"-detail"}>
                          <td colSpan={6}>
                            <div className="month-detail">
                              {Object.keys(d.expenseByType).length>0 && (
                                <div><strong>지출 유형별</strong><ul>{Object.entries(d.expenseByType).sort((a,b)=>b[1]-a[1]).map(([k,v])=><li key={k}>{k||"미분류"}: {fmtFull(v)}</li>)}</ul></div>
                              )}
                              {Object.keys(d.incomeByType).length>0 && (
                                <div><strong>수입 유형별</strong><ul>{Object.entries(d.incomeByType).sort((a,b)=>b[1]-a[1]).map(([k,v])=><li key={k}>{k||"미분류"}: {fmtFull(v)}</li>)}</ul></div>
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

      {/* ── 투자내역 탭 ── */}
      {!loading && tab==="invest" && (
        <>
          {invKind.length===0 && invCat.length===0 ? (
            <p className="empty-hint">해당 기간에 투자 데이터가 없습니다.</p>
          ) : (
            <>
              <div className="summary-cards">
                <div className="summary-card">
                  <span className="card-label">총 투자금액</span>
                  <span className="card-value">{fmtFull(totalInvest)}</span>
                </div>
                {invKind.find(k=>k.kind==="매도") && (
                  <div className="summary-card income">
                    <span className="card-label">매도금액</span>
                    <span className="card-value">{fmtFull(invKind.find(k=>k.kind==="매도")!.total)}</span>
                  </div>
                )}
                {invKind.filter(k=>k.kind==="배당"||k.kind==="이자").length>0 && (
                  <div className="summary-card income">
                    <span className="card-label">배당·이자</span>
                    <span className="card-value">{fmtFull(invKind.filter(k=>k.kind==="배당"||k.kind==="이자").reduce((s,k)=>s+k.total,0))}</span>
                  </div>
                )}
              </div>

              {invBarData.some(d=>d.투자금액>0) && (
                <div className="chart-panel">
                  <h2>월별 투자금액</h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={invBarData} margin={{top:8,right:16,left:8,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5d9cc"/>
                      <XAxis dataKey="name" tick={{fontSize:12}}/>
                      <YAxis tickFormatter={fmt} tick={{fontSize:11}}/>
                      <Tooltip formatter={(v)=>fmtFull(Number(v))}/>
                      <Bar dataKey="투자금액" fill="#5a7a9e" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="chart-panel chart-row">
                {invCat.length>0 && (
                  <div className="chart-col">
                    <h2>카테고리별 투자</h2>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie data={invCat} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={90}
                          label={({name,percent})=>`${name||"기타"} ${((percent??0)*100).toFixed(0)}%`}>
                          {invCat.map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]}/>)}
                        </Pie>
                        <Tooltip formatter={(v)=>fmtFull(Number(v))}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="chart-col">
                  <h2>거래구분별 요약</h2>
                  <ul className="type-list" style={{marginTop:8}}>
                    {invKind.map(({kind,total,count,avg_return},i)=>(
                      <li key={kind} className="type-item">
                        <span className="type-dot" style={{background:PALETTE[i%PALETTE.length]}}/>
                        <span className="type-label">{kind} <small style={{color:"var(--text-muted)"}}>({count}건)</small></span>
                        <span className="type-amount">
                          {fmtFull(total)}
                          {avg_return!==0 && <small style={{marginLeft:6,color:avg_return>0?"var(--green)":"var(--red)"}}>{avg_return>0?"+":""}{avg_return.toFixed(2)}%</small>}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {invCat.length>0 && (
                    <>
                      <h2 style={{marginTop:20}}>카테고리별 상세</h2>
                      <ul className="type-list">
                        {invCat.map(({category,total,count},i)=>(
                          <li key={category} className="type-item">
                            <span className="type-dot" style={{background:PALETTE[i%PALETTE.length]}}/>
                            <span className="type-label">{category||"기타"} <small style={{color:"var(--text-muted)"}}>({count}건)</small></span>
                            <span className="type-amount">{fmtFull(total)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
