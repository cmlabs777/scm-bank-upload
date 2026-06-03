"use client";

import { useEffect, useState } from "react";

interface Post {
  id: number;
  user_id: number;
  user_email: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const COLOR_ME      = "#1a73e8";
const COLOR_PARTNER = "#d93025";

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function preview(content: string, len = 80) {
  const stripped = content.replace(/\n/g, " ");
  return stripped.length > len ? stripped.slice(0, len) + "…" : stripped;
}

export default function PostsClient({ currentUserId }: { currentUserId: number }) {
  const [posts,    setPosts]   = useState<Post[]>([]);
  const [loading,  setLoading] = useState(false);
  const [tick,     setTick]    = useState(0); // 저장/삭제 후 +1 → useEffect 재실행
  const [filter,   setFilter]  = useState<"all"|"mine"|"partner">("all");
  const [search,   setSearch]  = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<Post | null>(null);
  const [form,     setForm]     = useState({ title: "", content: "" });
  const [saving,   setSaving]   = useState(false);
  const [status,   setStatus]   = useState("");

  // tick 이 바뀔 때마다 게시글 다시 로드
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch("/api/posts")
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then((data: Post[]) => { setPosts(data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tick]);

  const filtered = posts.filter(p => {
    if (filter === "mine"    && p.user_id !== currentUserId) return false;
    if (filter === "partner" && p.user_id === currentUserId) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function openWrite() {
    setEditing(null);
    setForm({ title: "", content: "" });
    setStatus("");
    setShowForm(true);
  }

  function openEdit(p: Post) {
    setEditing(p);
    setForm({ title: p.title, content: p.content });
    setStatus("");
    setShowForm(true);
  }

  async function save() {
    if (!form.title.trim()) { setStatus("제목을 입력하세요."); return; }
    setSaving(true); setStatus("");
    try {
      const url    = editing ? `/api/posts/${editing.id}` : "/api/posts";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { setStatus("저장 오류가 발생했습니다."); return; }
      // 모달 닫고 목록 새로고침
      setShowForm(false);
      setEditing(null);
      setTick(t => t + 1);
    } catch { setStatus("서버 오류"); }
    finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm("이 글을 삭제할까요?")) return;
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPosts(p => p.filter(x => x.id !== id));
      if (expanded === id) setExpanded(null);
    }
  }

  function authorColor(p: Post) { return p.user_id === currentUserId ? COLOR_ME : COLOR_PARTNER; }
  function authorLabel(p: Post) { return p.user_id === currentUserId ? "내 글" : "배우자"; }

  return (
    <div className="posts-wrap">
      <div className="page-header">
        <h1>게시판</h1>
        <button className="solid-button" onClick={openWrite}>+ 글쓰기</button>
      </div>

      <div className="posts-toolbar">
        <div className="kind-filter">
          {(["all","mine","partner"] as const).map(f => (
            <button key={f} className={`filter-btn${filter===f?" active":""}`} onClick={() => setFilter(f)}>
              {f==="all"?"전체":f==="mine"?"내 글":"배우자"}
            </button>
          ))}
        </div>
        <input
          className="search-input posts-search"
          type="text" placeholder="제목·내용 검색…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="loading-hint">불러오는 중…</p>}
      {!loading && filtered.length === 0 && (
        <p className="empty-hint">
          {search ? "검색 결과가 없습니다." : "아직 게시글이 없습니다."}
        </p>
      )}

      <div className="posts-list">
        {filtered.map(p => {
          const isOpen = expanded === p.id;
          const isMine = p.user_id === currentUserId;
          return (
            <div key={p.id} className={`post-card${isOpen?" post-card-open":""}`}>
              <div className="post-card-hd" onClick={() => setExpanded(isOpen ? null : p.id)}>
                <div className="post-card-main">
                  <div className="post-card-title-row">
                    <span className="post-badge" style={{background: authorColor(p), color:"#fff"}}>
                      {authorLabel(p)}
                    </span>
                    <span className="post-title">{p.title}</span>
                  </div>
                  {!isOpen && p.content && (
                    <p className="post-preview">{preview(p.content)}</p>
                  )}
                </div>
                <div className="post-card-meta">
                  <span className="post-date">{fmtDate(p.created_at)}</span>
                  <span className="post-chevron">{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {isOpen && (
                <div className="post-card-body">
                  <pre className="post-content">{p.content || <span style={{color:"var(--text-muted)"}}>내용 없음</span>}</pre>
                  {p.updated_at !== p.created_at && (
                    <p className="post-edited">수정됨 · {fmtDate(p.updated_at)}</p>
                  )}
                  {isMine && (
                    <div className="post-actions">
                      <button className="ghost-button" onClick={() => openEdit(p)}>수정</button>
                      <button className="danger-button" onClick={() => remove(p.id)}>삭제</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="cal-overlay" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-hd">
              <span>{editing ? "글 수정" : "글쓰기"}</span>
              <button className="cal-modal-close" onClick={() => { setShowForm(false); setEditing(null); }}>✕</button>
            </div>
            <div className="cal-modal-body">
              <div className="field">
                <label>제목 *</label>
                <input
                  type="text" value={form.title}
                  onChange={e => setForm(f => ({...f, title: e.target.value}))}
                  placeholder="제목을 입력하세요" autoFocus
                />
              </div>
              <div className="field">
                <label>내용</label>
                <textarea
                  className="post-textarea" value={form.content}
                  onChange={e => setForm(f => ({...f, content: e.target.value}))}
                  placeholder="내용을 입력하세요" rows={8}
                />
              </div>
              {status && <p className="post-status">{status}</p>}
            </div>
            <div className="cal-modal-foot">
              <button className="ghost-button" onClick={() => { setShowForm(false); setEditing(null); }}>취소</button>
              <button
                className="solid-button"
                disabled={!form.title.trim() || saving}
                onClick={save}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
