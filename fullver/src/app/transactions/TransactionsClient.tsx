"use client";

import { useEffect, useState, useCallback } from "react";

interface Transaction {
  id: number; kind: string; month: string; traded_at: string;
  amount: number; type_name: string; note: string; created_at: string;
}

interface TxType { id: number; name: string; kind: string; }

interface EditState {
  kind: string; date: string; amount: string; type_name: string; note: string;
}

const MONTHS: string[] = [];
const now = new Date();
for (let i = 0; i < 24; i++) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
  MONTHS.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
}

function tradedAtToDateInput(t: string): string {
  // "2026.05.02 00:00:00" → "2026-05-02"
  const m = t.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : t.slice(0,10);
}

export default function TransactionsClient() {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [types, setTypes] = useState<TxType[]>([]);
  const [loading, setLoading] = useState(false);
  const [monthFilter, setMonthFilter] = useState(MONTHS[0]);
  const [kindFilter, setKindFilter] = useState("all");
  const [editId, setEditId] = useState<number|null>(null);
  const [editForm, setEditForm] = useState<EditState|null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/types").then(r=>r.json()).then(setTypes);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (monthFilter) params.set("month", monthFilter);
    if (kindFilter !== "all") params.set("kind", kindFilter);
    const data = await fetch(`/api/transactions?${params}`).then(r=>r.json());
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
    setEditId(null); setEditForm(null);
  }, [monthFilter, kindFilter]);

  useEffect(() => { load(); }, [load]);

  function startEdit(row: Transaction) {
    setEditId(row.id);
    setEditForm({ kind: row.kind, date: tradedAtToDateInput(row.traded_at), amount: String(row.amount), type_name: row.type_name, note: row.note });
  }

  async function saveEdit(id: number) {
    if (!editForm) return;
    setSaving(true);
    await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setSaving(false);
    await load();
  }

  async function handleDelete(id: number) {
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    await fetch("/api/transactions", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) });
    setRows(p=>p.filter(r=>r.id!==id));
  }

  const totalIncome  = rows.filter(r=>r.kind==="income").reduce((s,r)=>s+r.amount, 0);
  const totalExpense = rows.filter(r=>r.kind==="expense").reduce((s,r)=>s+r.amount, 0);
  const expTypes = types.filter(t=>t.kind==="expense");
  const incTypes = types.filter(t=>t.kind==="income");

  return (
    <>
      <div className="page-header"><h1>거래내역</h1></div>

      <div className="filter-bar">
        <select className="year-select" value={monthFilter} onChange={e=>setMonthFilter(e.target.value)}>
          <option value="">전체 기간</option>
          {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <div className="kind-filter">
          {(["all","expense","income"] as const).map(k=>(
            <button key={k} className={`filter-btn${kindFilter===k?" active":""}`} onClick={()=>setKindFilter(k)}>
              {k==="all"?"전체":k==="expense"?"출금":"입금"}
            </button>
          ))}
        </div>
        <button className="ghost-button" onClick={load}>새로고침</button>
      </div>

      {!loading && rows.length>0 && (
        <div className="summary-cards" style={{gridTemplateColumns:"repeat(3,1fr)",marginBottom:16}}>
          <div className="summary-card"><span className="card-label">건수</span><span className="card-value">{rows.length}건</span></div>
          <div className="summary-card income"><span className="card-label">입금 합계</span><span className="card-value">{totalIncome.toLocaleString()}원</span></div>
          <div className="summary-card expense"><span className="card-label">출금 합계</span><span className="card-value">{totalExpense.toLocaleString()}원</span></div>
        </div>
      )}

      {loading && <p className="loading-hint">불러오는 중…</p>}
      {!loading && rows.length===0 && <p className="empty-hint">해당 기간에 데이터가 없습니다.</p>}

      {!loading && rows.length>0 && (
        <div className="panel" style={{padding:0}}>
          <div className="table-wrap" style={{border:"none"}}>
            <table>
              <thead>
                <tr><th>구분</th><th>날짜</th><th>금액</th><th>유형</th><th>메모</th><th style={{width:120}}>관리</th></tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isEditing = editId===row.id;
                  const typeList = (isEditing ? editForm!.kind : row.kind)==="expense" ? expTypes : incTypes;

                  return isEditing && editForm ? (
                    <tr key={row.id} className="row-editing">
                      <td>
                        <select value={editForm.kind} onChange={e=>setEditForm(f=>f?{...f,kind:e.target.value,type_name:""}:f)} className="type-select">
                          <option value="expense">출금</option>
                          <option value="income">입금</option>
                        </select>
                      </td>
                      <td><input type="date" value={editForm.date} onChange={e=>setEditForm(f=>f?{...f,date:e.target.value}:f)} className="edit-input"/></td>
                      <td><input type="number" value={editForm.amount} onChange={e=>setEditForm(f=>f?{...f,amount:e.target.value}:f)} className="edit-input amount-input"/></td>
                      <td>
                        <select value={editForm.type_name} onChange={e=>setEditForm(f=>f?{...f,type_name:e.target.value}:f)} className="type-select">
                          <option value="">-- 유형 --</option>
                          {typeList.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                      </td>
                      <td><input value={editForm.note} onChange={e=>setEditForm(f=>f?{...f,note:e.target.value}:f)} className="edit-input"/></td>
                      <td className="action-cell">
                        <button className="small-button" disabled={saving} onClick={()=>saveEdit(row.id)}>{saving?"저장중":"저장"}</button>
                        <button className="text-button" onClick={()=>{setEditId(null);setEditForm(null);}}>취소</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td><span className={`badge ${row.kind==="income"?"badge-income":"badge-expense"}`}>{row.kind==="income"?"입금":"출금"}</span></td>
                      <td>{tradedAtToDateInput(row.traded_at)}</td>
                      <td className="amount-cell">{row.amount.toLocaleString()}</td>
                      <td>{row.type_name||<span style={{color:"var(--text-muted)"}}>미분류</span>}</td>
                      <td className="note-cell">{row.note}</td>
                      <td className="action-cell">
                        <button className="ghost-button" style={{padding:"3px 10px",fontSize:12}} onClick={()=>startEdit(row)}>수정</button>
                        <button className="danger-button" onClick={()=>handleDelete(row.id)}>삭제</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
