"use client";

import { useEffect, useState } from "react";

interface User   { id: number; email: string; role: string; created_at: string; }
interface Rule   { id: number; keyword: string; type_name: string; description: string; }
interface Budget { id: number; type_name: string; kind: string; monthly_amount: number; }
interface TxType { id: number; name: string; kind: string; }

type AdminTab = "accounts" | "rules" | "budget";

export default function AdminClient() {
  const [adminTab, setAdminTab] = useState<AdminTab>("accounts");

  // ── accounts ──
  const [users,   setUsers]   = useState<User[]>([]);
  const [email,   setEmail]   = useState("");
  const [password,setPassword]= useState("");
  const [role,    setRole]    = useState("user");
  const [resetId, setResetId] = useState<number|null>(null);
  const [newPw,   setNewPw]   = useState("");

  // ── rules ──
  const [rules,    setRules]    = useState<Rule[]>([]);
  const [rkeyword, setRkeyword] = useState("");
  const [rtype,    setRtype]    = useState("");
  const [rdesc,    setRdesc]    = useState("");

  // ── budget ──
  const [budgets,   setBudgets]   = useState<Budget[]>([]);
  const [types,     setTypes]     = useState<TxType[]>([]);
  const [btype,     setBtype]     = useState("");
  const [bkind,     setBkind]     = useState("expense");
  const [bamount,   setBamount]   = useState("");

  const [status, setStatus] = useState("");

  // ── loaders ──
  async function loadUsers()   { setUsers(await fetch("/api/users").then(r=>r.json())); }
  async function loadRules()   { setRules(await fetch("/api/rules").then(r=>r.json())); }
  async function loadBudgets() { setBudgets(await fetch("/api/budgets").then(r=>r.json())); }
  async function loadTypes()   { setTypes(await fetch("/api/types").then(r=>r.json())); }

  useEffect(() => {
    loadUsers(); loadRules(); loadBudgets(); loadTypes();
  }, []);

  // ── account actions ──
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setStatus("");
    const res  = await fetch("/api/users", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email:email.trim(), password, role }) });
    const data = await res.json();
    if (data.ok) { setStatus("✓ 계정 생성 완료"); setEmail(""); setPassword(""); setRole("user"); loadUsers(); }
    else setStatus(data.error || "오류");
  }

  async function handleDeleteUser(id: number) {
    if (!confirm("이 계정을 삭제하시겠습니까?")) return;
    const data = await fetch("/api/users", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) }).then(r=>r.json());
    if (data.ok) loadUsers(); else alert(data.error);
  }

  async function handleResetPw(e: React.FormEvent) {
    e.preventDefault();
    if (!resetId || !newPw) return;
    const data = await fetch("/api/users", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id:resetId, password:newPw }) }).then(r=>r.json());
    if (data.ok) { setStatus("✓ 비밀번호 변경 완료"); setResetId(null); setNewPw(""); }
    else setStatus(data.error || "오류");
  }

  // ── rule actions ──
  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault(); setStatus("");
    if (!rkeyword.trim() || !rtype.trim()) { setStatus("키워드와 유형은 필수입니다."); return; }
    const data = await fetch("/api/rules", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ keyword:rkeyword.trim(), type_name:rtype.trim(), description:rdesc }) }).then(r=>r.json());
    if (data.ok) { setStatus("✓ 저장"); setRkeyword(""); setRtype(""); setRdesc(""); loadRules(); }
    else setStatus(data.error || "오류");
  }

  async function handleDeleteRule(id: number) {
    if (!confirm("이 규칙을 삭제하시겠습니까?")) return;
    await fetch("/api/rules", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) });
    loadRules();
  }

  // ── budget actions ──
  async function handleAddBudget(e: React.FormEvent) {
    e.preventDefault(); setStatus("");
    if (!btype || !bamount) { setStatus("유형과 금액은 필수입니다."); return; }
    const data = await fetch("/api/budgets", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ type_name:btype, kind:bkind, monthly_amount:Number(bamount) }) }).then(r=>r.json());
    if (data.ok) { setStatus("✓ 저장"); setBtype(""); setBamount(""); loadBudgets(); }
    else setStatus(data.error || "오류");
  }

  async function handleDeleteBudget(id: number) {
    await fetch("/api/budgets", { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id}) });
    loadBudgets();
  }

  const expTypes = types.filter(t=>t.kind==="expense");
  const incTypes = types.filter(t=>t.kind==="income");

  return (
    <>
      <div className="page-header"><h1>관리자</h1></div>

      <div className="tab-bar" style={{marginBottom:20}}>
        <button className={`tab-btn${adminTab==="accounts"?" active":""}`} onClick={()=>{ setAdminTab("accounts"); setStatus(""); }}>👤 계정 관리</button>
        <button className={`tab-btn${adminTab==="rules"?" active":""}`}    onClick={()=>{ setAdminTab("rules");    setStatus(""); }}>🔖 분류 규칙</button>
        <button className={`tab-btn${adminTab==="budget"?" active":""}`}   onClick={()=>{ setAdminTab("budget");   setStatus(""); }}>🎯 예산 설정</button>
      </div>

      {status && <p className="summary" style={{marginBottom:12}}>{status}</p>}

      {/* ── 계정 관리 ── */}
      {adminTab==="accounts" && (
        <>
          <div className="panel">
            <h2>계정 목록</h2>
            <table>
              <thead><tr><th>이메일</th><th>권한</th><th>생성일</th><th></th></tr></thead>
              <tbody>
                {users.map(u=>(
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td><span className={`badge ${u.role==="admin"?"badge-admin":"badge-user"}`}>{u.role}</span></td>
                    <td>{u.created_at.slice(0,10)}</td>
                    <td className="action-cell">
                      <button className="text-button" onClick={()=>{ setResetId(u.id); setNewPw(""); }}>비밀번호 변경</button>
                      <button className="danger-button" onClick={()=>handleDeleteUser(u.id)}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resetId && (
              <form className="inline-form" onSubmit={handleResetPw}>
                <p>ID {resetId} 비밀번호 변경</p>
                <input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="새 비밀번호" required />
                <button type="submit" className="small-button">변경</button>
                <button type="button" className="text-button" onClick={()=>setResetId(null)}>취소</button>
              </form>
            )}
          </div>

          <div className="panel">
            <h2>새 계정 생성</h2>
            <form className="create-form" onSubmit={handleCreate}>
              <div className="field"><label>이메일</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
              <div className="field"><label>비밀번호</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} /></div>
              <div className="field"><label>권한</label>
                <select value={role} onChange={e=>setRole(e.target.value)}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <button type="submit" className="solid-button">계정 생성</button>
            </form>
          </div>
        </>
      )}

      {/* ── 분류 규칙 ── */}
      {adminTab==="rules" && (
        <>
          <div className="panel">
            <h2>분류 규칙</h2>
            <p className="hint-text">엑셀 업로드 시 내용·메모에 키워드가 포함되면 해당 유형으로 자동 분류됩니다.</p>
            {rules.length===0
              ? <p className="empty-hint">등록된 규칙이 없습니다.</p>
              : (
                <table>
                  <thead><tr><th>키워드</th><th>유형</th><th>설명</th><th></th></tr></thead>
                  <tbody>
                    {rules.map(r=>(
                      <tr key={r.id}>
                        <td><code className="keyword-chip">{r.keyword}</code></td>
                        <td>{r.type_name}</td>
                        <td className="note-cell">{r.description}</td>
                        <td className="action-cell"><button className="danger-button" onClick={()=>handleDeleteRule(r.id)}>삭제</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>

          <div className="panel">
            <h2>규칙 추가</h2>
            <form className="create-form" onSubmit={handleAddRule}>
              <div className="field"><label>키워드</label><input value={rkeyword} onChange={e=>setRkeyword(e.target.value)} placeholder="예: 스타벅스" required /></div>
              <div className="field"><label>유형 (type_name)</label><input value={rtype} onChange={e=>setRtype(e.target.value)} placeholder="예: 카페" list="type-list-dl" required />
                <datalist id="type-list-dl">{types.map(t=><option key={t.id} value={t.name}/>)}</datalist>
              </div>
              <div className="field"><label>설명 (선택)</label><input value={rdesc} onChange={e=>setRdesc(e.target.value)} placeholder="간단 설명" /></div>
              <button type="submit" className="solid-button">규칙 추가</button>
            </form>
          </div>
        </>
      )}

      {/* ── 예산 설정 ── */}
      {adminTab==="budget" && (
        <>
          <div className="panel">
            <h2>월 예산 설정</h2>
            <p className="hint-text">유형별 월 예산을 설정하면 리포트에서 실적과 비교할 수 있습니다.</p>
            {budgets.length===0
              ? <p className="empty-hint">등록된 예산이 없습니다.</p>
              : (
                <table>
                  <thead><tr><th>구분</th><th>유형</th><th>월 예산</th><th></th></tr></thead>
                  <tbody>
                    {budgets.map(b=>(
                      <tr key={b.id}>
                        <td><span className={`badge ${b.kind==="income"?"badge-income":"badge-expense"}`}>{b.kind==="income"?"입금":"출금"}</span></td>
                        <td>{b.type_name}</td>
                        <td className="amount-cell">{b.monthly_amount.toLocaleString()}원</td>
                        <td className="action-cell"><button className="danger-button" onClick={()=>handleDeleteBudget(b.id)}>삭제</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>

          <div className="panel">
            <h2>예산 추가 / 수정</h2>
            <p className="hint-text">동일 유형+구분이 이미 있으면 금액을 덮어씁니다.</p>
            <form className="create-form" onSubmit={handleAddBudget}>
              <div className="field"><label>구분</label>
                <select value={bkind} onChange={e=>{ setBkind(e.target.value); setBtype(""); }}>
                  <option value="expense">출금</option>
                  <option value="income">입금</option>
                </select>
              </div>
              <div className="field"><label>유형</label>
                <select value={btype} onChange={e=>setBtype(e.target.value)} required>
                  <option value="">-- 유형 선택 --</option>
                  {(bkind==="expense"?expTypes:incTypes).map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div className="field"><label>월 예산 (원)</label><input type="number" value={bamount} onChange={e=>setBamount(e.target.value)} placeholder="0" required /></div>
              <button type="submit" className="solid-button">저장</button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
