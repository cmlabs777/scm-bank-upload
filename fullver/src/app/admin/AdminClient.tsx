"use client";

import { useEffect, useState } from "react";

interface User {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

export default function AdminClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [status, setStatus] = useState("");
  const [resetId, setResetId] = useState<number | null>(null);
  const [newPw, setNewPw] = useState("");

  async function loadUsers() {
    const res = await fetch("/api/users");
    setUsers(await res.json());
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, role }),
    });
    const data = await res.json();
    if (data.ok) {
      setStatus("✓ 계정 생성 완료");
      setEmail(""); setPassword(""); setRole("user");
      loadUsers();
    } else {
      setStatus(data.error || "오류");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 계정을 삭제하시겠습니까?")) return;
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (data.ok) loadUsers();
    else alert(data.error);
  }

  async function handleResetPw(e: React.FormEvent) {
    e.preventDefault();
    if (!resetId || !newPw) return;
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: resetId, password: newPw }),
    });
    const data = await res.json();
    if (data.ok) { setStatus("✓ 비밀번호 변경 완료"); setResetId(null); setNewPw(""); }
    else setStatus(data.error || "오류");
  }

  return (
    <>
      <div className="page-header">
        <h1>관리자 — 계정 관리</h1>
      </div>

      <div className="panel">
        <h2>계정 목록</h2>
        <table>
          <thead>
            <tr>
              <th>이메일</th>
              <th>권한</th>
              <th>생성일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td><span className={`badge ${u.role === "admin" ? "badge-admin" : "badge-user"}`}>{u.role}</span></td>
                <td>{u.created_at.slice(0, 10)}</td>
                <td className="action-cell">
                  <button className="text-button" onClick={() => { setResetId(u.id); setNewPw(""); }}>비밀번호 변경</button>
                  <button className="danger-button" onClick={() => handleDelete(u.id)}>삭제</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {resetId && (
          <form className="inline-form" onSubmit={handleResetPw}>
            <p>ID {resetId} 비밀번호 변경</p>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="새 비밀번호" required />
            <button type="submit" className="small-button">변경</button>
            <button type="button" className="text-button" onClick={() => setResetId(null)}>취소</button>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>새 계정 생성</h2>
        <form className="create-form" onSubmit={handleCreate}>
          <div className="field">
            <label>이메일</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>비밀번호</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="field">
            <label>권한</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          {status && <p className="summary">{status}</p>}
          <button type="submit" className="solid-button">계정 생성</button>
        </form>
      </div>
    </>
  );
}
