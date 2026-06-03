"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DDay {
  id: number;
  user_id: number;
  user_email: string;
  title: string;
  target_date: string; // "YYYY-MM-DD"
  emoji: string;
  color: string;
}

interface DailyFortune {
  score: number;
  headline: string;
  summary: string;
  advice: string;
  lucky_color: string;
  lucky_item: string;
}

interface FortuneProfile {
  slot: "me" | "partner";
  display_name: string;
  birth_date: string | null;
  birth_time: string | null;
  calendar_type: "solar" | "lunar";
  gender: "male" | "female" | "unspecified";
  enabled: boolean;
  fortune: DailyFortune | null;
}

const COLORS = [
  "#c4572a", "#1a73e8", "#1e8e3e", "#7c3aed",
  "#dc2626", "#0891b2", "#b45309", "#be185d",
];

const EMOJIS = ["💍","🎂","✈️","🏖️","🎄","🎓","💼","🏠","👶","❤️","🎉","🌸","🎊","🏆","🌙","⭐"];

const SHORTCUTS = [
  { href: "/transactions", label: "가계부", icon: "📒" },
  { href: "/report",       label: "리포트", icon: "📊" },
  { href: "/calendar",     label: "캘린더", icon: "📅" },
  { href: "/posts",        label: "게시판", icon: "📝" },
];

function calcDiff(targetDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function sortDays(items: DDay[]): DDay[] {
  return [...items].sort((a, b) => {
    const da = calcDiff(a.target_date);
    const db = calcDiff(b.target_date);
    if (da === 0) return -1;
    if (db === 0) return 1;
    if (da > 0 && db > 0) return da - db;
    if (da < 0 && db < 0) return db - da;
    return da < 0 ? 1 : -1;
  });
}

function fmtKorDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}

function todayLabel() {
  const d = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 6)  return "밤이 깊었네요 🌙";
  if (h < 12) return "좋은 아침이에요 ☀️";
  if (h < 18) return "좋은 오후에요 🌤️";
  return "좋은 저녁이에요 🌆";
}

function DDayBadge({ diff }: { diff: number }) {
  if (diff === 0)  return <span className="hero-dday-num hero-dday-today">D-DAY</span>;
  if (diff > 0)    return <span className="hero-dday-num">D-{diff}</span>;
  return <span className="hero-dday-num hero-dday-past">D+{Math.abs(diff)}</span>;
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function HeroClient({ currentUserId }: { currentUserId: number }) {
  const [ddays,   setDDays]   = useState<DDay[]>([]);
  const [fortunes, setFortunes] = useState<FortuneProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick,    setTick]    = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<DDay | null>(null);
  const [form, setForm] = useState({ title: "", target_date: "", emoji: "📅", color: COLORS[0] });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch("/api/ddays")
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((d: DDay[]) => { setDDays(d); })
        .catch(() => {})
        .finally(() => setLoading(false));

      fetch("/api/fortune")
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((data: { profiles: FortuneProfile[] }) => { setFortunes(data.profiles || []); })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tick]);

  function openAdd() {
    const today = new Date();
    const ds = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    setEditing(null);
    setForm({ title: "", target_date: ds, emoji: "📅", color: COLORS[0] });
    setStatus("");
    setShowForm(true);
  }

  function openEdit(d: DDay) {
    setEditing(d);
    setForm({ title: d.title, target_date: d.target_date, emoji: d.emoji, color: d.color });
    setStatus("");
    setShowForm(true);
  }

  async function save() {
    if (!form.title.trim() || !form.target_date) { setStatus("제목과 날짜를 입력하세요."); return; }
    setSaving(true); setStatus("");
    try {
      const url    = editing ? `/api/ddays/${editing.id}` : "/api/ddays";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { setStatus("저장 오류"); return; }
      setShowForm(false); setEditing(null);
      setTick(t => t + 1);
    } catch { setStatus("서버 오류"); }
    finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm("이 디데이를 삭제할까요?")) return;
    const res = await fetch(`/api/ddays/${id}`, { method: "DELETE" });
    if (res.ok) setDDays(p => p.filter(d => d.id !== id));
  }

  const sorted = sortDays(ddays);

  return (
    <div className="hero-wrap">
      {/* ── 날짜 + 인사 ── */}
      <div className="hero-greeting">
        <p className="hero-date">{todayLabel()}</p>
        <p className="hero-hello">{greetingText()}</p>
      </div>

      {/* ── 디데이 섹션 ── */}
      <div className="hero-section-hd">
        <span className="hero-section-title">D-DAY</span>
        <button className="hero-add-btn" onClick={openAdd}>+ 추가</button>
      </div>

      {loading && <p className="loading-hint">불러오는 중…</p>}

      {!loading && sorted.length === 0 && (
        <div className="hero-empty">
          <div className="hero-empty-icon">📅</div>
          <p className="hero-empty-text">아직 디데이가 없어요</p>
          <p className="hero-empty-sub">중요한 날을 등록하고<br/>함께 카운트다운해요</p>
          <button className="solid-button" onClick={openAdd}>+ 첫 디데이 추가</button>
        </div>
      )}

      <div className="hero-cards">
        {sorted.map(d => {
          const diff = calcDiff(d.target_date);
          const isMine = d.user_id === currentUserId;
          return (
            <div
              key={d.id}
              className="hero-card"
              style={{
                background: `linear-gradient(135deg, ${d.color}, ${hexToRgba(d.color, 0.72)})`,
              }}
            >
              {/* 카드 상단: 이모지 + 제목 + 작업 버튼 */}
              <div className="hero-card-top">
                <span className="hero-card-emoji">{d.emoji}</span>
                <span className="hero-card-title">{d.title}</span>
                {isMine && (
                  <div className="hero-card-actions">
                    <button className="hero-card-btn" onClick={() => openEdit(d)}>수정</button>
                    <button className="hero-card-btn hero-card-del" onClick={() => remove(d.id)}>삭제</button>
                  </div>
                )}
              </div>

              {/* 디데이 숫자 */}
              <DDayBadge diff={diff} />

              {/* 날짜 */}
              <p className="hero-card-date">{fmtKorDate(d.target_date)}</p>

              {/* D+N이면 메시지 */}
              {diff < 0 && <p className="hero-card-past-msg">이미 지났어요 🌸</p>}
              {diff === 0 && <p className="hero-card-past-msg">오늘이에요! 🎉</p>}
            </div>
          );
        })}
      </div>

      {/* ── 오늘의 운세 섹션 ── */}
      <div className="fortune-section">
        <div className="hero-section-hd">
          <span className="hero-section-title">오늘의 운세</span>
        </div>
        <div className="fortune-grid">
          {fortunes.length === 0 && (
            <div className="fortune-card fortune-card-empty">
              <p className="fortune-name">운세 설정이 필요해요</p>
              <p className="fortune-summary">관리자 화면에서 나와 배우자의 생년월일을 입력하면 매일 운세가 표시됩니다.</p>
            </div>
          )}
          {fortunes.map(profile => (
            <div key={profile.slot} className="fortune-card">
              <div className="fortune-top">
                <div>
                  <p className="fortune-kicker">{profile.slot === "me" ? "나" : "배우자"}</p>
                  <p className="fortune-name">{profile.display_name || (profile.slot === "me" ? "나" : "배우자")}</p>
                </div>
                {profile.fortune && <span className="fortune-score">{profile.fortune.score}</span>}
              </div>

              {profile.fortune ? (
                <>
                  <p className="fortune-headline">{profile.fortune.headline}</p>
                  <p className="fortune-summary">{profile.fortune.summary}</p>
                  <p className="fortune-advice">{profile.fortune.advice}</p>
                  <div className="fortune-lucky">
                    <span>색 {profile.fortune.lucky_color}</span>
                    <span>아이템 {profile.fortune.lucky_item}</span>
                  </div>
                </>
              ) : (
                <p className="fortune-summary">관리자 화면에서 생년월일, 시간, 양음력, 성별을 입력해 주세요.</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 바로가기 ── */}
      {!loading && (
        <div className="hero-shortcuts">
          <p className="hero-section-title" style={{marginBottom:12}}>바로가기</p>
          <div className="hero-shortcut-grid">
            {SHORTCUTS.map(s => (
              <Link key={s.href} href={s.href} className="hero-shortcut">
                <span className="hero-shortcut-icon">{s.icon}</span>
                <span className="hero-shortcut-label">{s.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 폼 모달 ── */}
      {showForm && (
        <div className="cal-overlay" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-hd">
              <span>{editing ? "디데이 수정" : "디데이 추가"}</span>
              <button className="cal-modal-close" onClick={() => { setShowForm(false); setEditing(null); }}>✕</button>
            </div>
            <div className="cal-modal-body">
              {/* 이모지 선택 */}
              <div className="field">
                <label>이모지</label>
                <div className="hero-emoji-grid">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      className={`hero-emoji-btn${form.emoji === e ? " selected" : ""}`}
                      onClick={() => setForm(f => ({...f, emoji: e}))}
                    >{e}</button>
                  ))}
                </div>
              </div>

              {/* 제목 */}
              <div className="field">
                <label>제목 *</label>
                <input
                  type="text" value={form.title}
                  onChange={e => setForm(f => ({...f, title: e.target.value}))}
                  placeholder="예: 결혼기념일, 생일, 여행" autoFocus
                />
              </div>

              {/* 날짜 */}
              <div className="field">
                <label>날짜 *</label>
                <input
                  type="date" value={form.target_date}
                  onChange={e => setForm(f => ({...f, target_date: e.target.value}))}
                />
              </div>

              {/* 색상 */}
              <div className="field">
                <label>카드 색상</label>
                <div className="hero-color-grid">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      className={`hero-color-btn${form.color === c ? " selected" : ""}`}
                      style={{ background: c }}
                      onClick={() => setForm(f => ({...f, color: c}))}
                    />
                  ))}
                </div>
              </div>

              {status && <p className="post-status">{status}</p>}
            </div>
            <div className="cal-modal-foot">
              <button className="ghost-button" onClick={() => { setShowForm(false); setEditing(null); }}>취소</button>
              <button
                className="solid-button"
                disabled={!form.title.trim() || !form.target_date || saving}
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
