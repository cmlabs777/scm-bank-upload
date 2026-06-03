"use client";

import { useEffect, useState } from "react";

interface CalEvent {
  id: number;
  user_id: number;
  user_email: string;
  title: string;
  start_date: string; // "YYYY-MM-DD"
  end_date: string | null;
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
  is_shared: boolean;
  note: string;
}

interface FormState {
  title: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  is_shared: boolean;
  note: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS_KO = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const COLOR_ME      = "#1a73e8";
const COLOR_PARTNER = "#d93025";
const COLOR_SHARED  = "#1e8e3e";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtDate(s: string) {
  const parts = s.split("-");
  return `${Number(parts[1])}월 ${Number(parts[2])}일`;
}

function fmtTime(t: string | null) {
  if (!t) return "";
  return t.slice(0, 5);
}

function daysBetween(start: string, end: string | null): string[] {
  if (!end || end === start) return [start];
  const days: string[] = [];
  const cur  = new Date(start + "T00:00:00");
  const last = new Date(end   + "T00:00:00");
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function emptyForm(date = ""): FormState {
  return { title: "", start_date: date, end_date: "", start_time: "", end_time: "", is_shared: false, note: "" };
}

export default function CalendarClient({ currentUserId }: { currentUserId: number }) {
  const now   = new Date();
  const today = todayStr();

  const [year,    setYear]    = useState(now.getFullYear());
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [events,  setEvents]  = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selDate, setSelDate] = useState<string | null>(null);
  const [showForm,  setShowForm]  = useState(false);
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null);
  const [form, setForm]           = useState<FormState>(emptyForm());
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/calendar?year=${year}&month=${month}`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setEvents(d); })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [year, month]);

  function refresh() {
    fetch(`/api/calendar?year=${year}&month=${month}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setEvents(d); });
  }

  // ── Navigation ────────────────────────────────────
  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
    setSelDate(null);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
    setSelDate(null);
  }
  function goToday() {
    const d = new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelDate(today);
  }

  // ── Grid ─────────────────────────────────────────
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth  = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function dateStr(day: number) {
    return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }

  function eventsOnDate(ds: string): CalEvent[] {
    return events.filter(e => daysBetween(e.start_date, e.end_date).includes(ds));
  }

  function eventColor(e: CalEvent) {
    if (e.is_shared) return COLOR_SHARED;
    return e.user_id === currentUserId ? COLOR_ME : COLOR_PARTNER;
  }

  // ── Form helpers ──────────────────────────────────
  function openAdd(date: string) {
    setEditEvent(null);
    setForm(emptyForm(date));
    setShowForm(true);
  }
  function openEdit(e: CalEvent) {
    setEditEvent(e);
    setForm({
      title:      e.title,
      start_date: e.start_date,
      end_date:   e.end_date   || "",
      start_time: fmtTime(e.start_time),
      end_time:   fmtTime(e.end_time),
      is_shared:  e.is_shared,
      note:       e.note,
    });
    setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditEvent(null); }

  async function saveEvent() {
    if (!form.title.trim() || !form.start_date) return;
    setSaving(true);
    try {
      const url    = editEvent ? `/api/calendar/${editEvent.id}` : "/api/calendar";
      const method = editEvent ? "PATCH" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          end_date:   form.end_date   || null,
          start_time: form.start_time || null,
          end_time:   form.end_time   || null,
        }),
      });
      closeForm();
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(id: number) {
    if (!confirm("이 일정을 삭제할까요?")) return;
    await fetch(`/api/calendar/${id}`, { method: "DELETE" });
    setEvents(ev => ev.filter(e => e.id !== id));
  }

  const selEvents = selDate ? eventsOnDate(selDate) : [];

  // ── Render ────────────────────────────────────────
  return (
    <div className="cal-wrap">
      <div className="page-header" style={{marginBottom:16}}>
        <h1>캘린더</h1>
      </div>

      <div className="cal-container">
        {/* Month nav */}
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={prevMonth}>‹</button>
          <span className="cal-nav-title">{year}년 {MONTHS_KO[month-1]}</span>
          <button className="cal-nav-btn" onClick={nextMonth}>›</button>
          <button className="cal-today-btn" onClick={goToday}>오늘</button>
        </div>

        {/* Legend */}
        <div className="cal-legend">
          <span className="cal-legend-item">
            <span className="cal-legend-dot" style={{background: COLOR_ME}}/>
            내 일정
          </span>
          <span className="cal-legend-item">
            <span className="cal-legend-dot" style={{background: COLOR_PARTNER}}/>
            배우자
          </span>
          <span className="cal-legend-item">
            <span className="cal-legend-dot" style={{background: COLOR_SHARED}}/>
            공통
          </span>
        </div>

        {/* Weekday header */}
        <div className="cal-weekdays">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className={`cal-weekday${i===0?" cal-sun":i===6?" cal-sat":""}`}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        {loading
          ? <div className="loading-hint">불러오는 중…</div>
          : (
            <div className="cal-grid">
              {cells.map((day, i) => {
                if (!day) return <div key={i} className="cal-cell cal-cell-empty"/>;
                const ds     = dateStr(day);
                const dayEvs = eventsOnDate(ds);
                const isToday = ds === today;
                const isSel   = ds === selDate;
                const isSun   = i % 7 === 0;
                const isSat   = i % 7 === 6;
                return (
                  <div
                    key={i}
                    className={["cal-cell", isToday?"cal-cell-today":"", isSel?"cal-cell-sel":""].join(" ")}
                    onClick={() => setSelDate(isSel ? null : ds)}
                  >
                    <div className={`cal-day-num${isSun?" cal-sun":isSat?" cal-sat":""}`}>{day}</div>
                    {dayEvs.slice(0, 3).map(e => {
                      const isStart  = e.start_date === ds;
                      const isEnd    = !e.end_date || e.end_date === ds;
                      const multiDay = e.end_date && e.end_date !== e.start_date;
                      return (
                        <div
                          key={e.id}
                          className="cal-chip"
                          style={{
                            background: eventColor(e),
                            borderRadius: multiDay
                              ? `${isStart?"3px":"0"} ${isEnd?"3px":"0"} ${isEnd?"3px":"0"} ${isStart?"3px":"0"}`
                              : "3px",
                          }}
                          onClick={ev => { ev.stopPropagation(); openEdit(e); }}
                        >
                          {(isStart || ds.endsWith("-01")) ? e.title : " "}
                        </div>
                      );
                    })}
                    {dayEvs.length > 3 && <div className="cal-more">+{dayEvs.length-3}개</div>}
                  </div>
                );
              })}
            </div>
          )
        }

        {/* Day detail panel */}
        {selDate && (
          <div className="cal-day-panel">
            <div className="cal-day-panel-hd">
              <span className="cal-day-panel-title">{fmtDate(selDate)}</span>
              <button className="solid-button" style={{padding:"6px 14px",fontSize:13}} onClick={() => openAdd(selDate)}>
                + 추가
              </button>
            </div>
            {selEvents.length === 0
              ? <p className="empty-hint" style={{padding:"24px 0",textAlign:"left"}}>일정이 없습니다.</p>
              : selEvents.map(e => (
                <div key={e.id} className="cal-event-row" style={{borderLeftColor: eventColor(e)}}>
                  <div className="cal-event-row-main">
                    <span className="cal-event-row-title">{e.title}</span>
                    <div className="cal-event-row-meta">
                      {fmtTime(e.start_time) && (
                        <span>{fmtTime(e.start_time)}{fmtTime(e.end_time) && ` ~ ${fmtTime(e.end_time)}`}</span>
                      )}
                      {e.end_date && e.end_date !== e.start_date && (
                        <span>~ {fmtDate(e.end_date)}</span>
                      )}
                      {e.is_shared && <span className="cal-badge-shared">공통</span>}
                      {e.user_id === currentUserId
                        ? <span className="cal-badge-me">내 일정</span>
                        : <span className="cal-badge-partner">배우자</span>
                      }
                      {e.note && <span className="cal-event-note">{e.note}</span>}
                    </div>
                  </div>
                  <div className="cal-event-row-actions">
                    <button className="ghost-button" style={{padding:"4px 10px",fontSize:12}} onClick={() => openEdit(e)}>수정</button>
                    <button className="danger-button" style={{padding:"4px 10px",fontSize:12}} onClick={() => deleteEvent(e.id)}>삭제</button>
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* FAB */}
      <button className="cal-fab" onClick={() => openAdd(today)}>+</button>

      {/* Form Modal */}
      {showForm && (
        <div className="cal-overlay" onClick={closeForm}>
          <div className="cal-modal" onClick={e => e.stopPropagation()}>
            <div className="cal-modal-hd">
              <span>{editEvent ? "일정 수정" : "일정 추가"}</span>
              <button className="cal-modal-close" onClick={closeForm}>✕</button>
            </div>
            <div className="cal-modal-body">
              <div className="field">
                <label>제목 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({...f, title: e.target.value}))}
                  placeholder="일정 제목"
                  autoFocus
                />
              </div>
              <div className="form-row">
                <div className="field">
                  <label>시작일 *</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({...f, start_date: e.target.value}))}
                  />
                </div>
                <div className="field">
                  <label>종료일 (복수일)</label>
                  <input
                    type="date"
                    value={form.end_date}
                    min={form.start_date}
                    onChange={e => setForm(f => ({...f, end_date: e.target.value}))}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="field">
                  <label>시작 시간</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setForm(f => ({...f, start_time: e.target.value}))}
                  />
                </div>
                <div className="field">
                  <label>종료 시간</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setForm(f => ({...f, end_time: e.target.value}))}
                  />
                </div>
              </div>
              <div className="field">
                <label>메모</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={e => setForm(f => ({...f, note: e.target.value}))}
                  placeholder="메모 (선택)"
                />
              </div>
              <label className="cal-toggle-row">
                <input
                  type="checkbox"
                  checked={form.is_shared}
                  onChange={e => setForm(f => ({...f, is_shared: e.target.checked}))}
                />
                <span className="cal-toggle-label">
                  <span className="cal-legend-dot" style={{background: COLOR_SHARED, display:"inline-block"}}/>
                  공통 일정 (부부 함께하는 일정)
                </span>
              </label>
            </div>
            <div className="cal-modal-foot">
              <button className="ghost-button" onClick={closeForm}>취소</button>
              <button
                className="solid-button"
                disabled={!form.title.trim() || !form.start_date || saving}
                onClick={saveEvent}
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
