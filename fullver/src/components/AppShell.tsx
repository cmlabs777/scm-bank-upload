"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";

const NAV = [
  { href: "/dashboard",    label: "홈",     icon: "🏠" },
  { href: "/transactions", label: "내역",   icon: "📋" },
  { href: "/report",       label: "리포트", icon: "📊" },
  { href: "/calendar",     label: "캘린더", icon: "📅" },
  { href: "/posts",        label: "게시판", icon: "📝" },
];

// Elements where horizontal swipe should NOT trigger page navigation
const SCROLL_SELECTORS = [
  ".filter-bar", ".tab-bar", ".kind-filter",
  ".table-wrap", ".monthly-table-wrap",
  ".cal-grid", ".cal-nav",
  "input", "textarea", "select",
];

export default function AppShell({ children, isAdmin }: { children: React.ReactNode; isAdmin?: boolean }) {
  const pathname = usePathname();
  const router   = useRouter();
  const txX = useRef(0);
  const txY = useRef(0);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const navItems = [
    ...NAV,
    ...(isAdmin ? [{ href: "/admin", label: "관리자", icon: "⚙️" }] : []),
  ];

  const bottomNavItems = navItems.filter(n => n.href !== "/admin");

  function onTouchStart(e: React.TouchEvent) {
    txX.current = e.touches[0].clientX;
    txY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - txX.current;
    const dy = e.changedTouches[0].clientY - txY.current;

    // Must be a clear horizontal swipe (80px min, 2× dominant axis)
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return;

    // Ignore swipe if it started inside a scrollable/interactive element
    const target = e.target as Element;
    if (SCROLL_SELECTORS.some(sel => target.closest(sel))) return;

    const idx = bottomNavItems.findIndex(n => pathname.startsWith(n.href));
    if (idx === -1) return;

    if (dx < 0 && idx < bottomNavItems.length - 1) {
      router.push(bottomNavItems[idx + 1].href);
    } else if (dx > 0 && idx > 0) {
      router.push(bottomNavItems[idx - 1].href);
    }
  }

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-coin">🪙</span>
          <span className="brand-name">SCM</span>
        </div>
        <ul className="nav-list">
          {navItems.map(({ href, label, icon }) => (
            <li key={href}>
              <Link href={href} className={`nav-item${pathname.startsWith(href) ? " active" : ""}`}>
                <span>{icon}</span>
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <button className="logout-btn" onClick={logout}>로그아웃</button>
      </nav>

      {/* Page content — swipe gesture area */}
      <main
        className="page-content"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </main>

      {/* Mobile bottom navigation — admin tab excluded */}
      <nav className="bottom-nav">
        {bottomNavItems.map(({ href, label, icon }) => (
          <Link key={href} href={href} className={`bnav-item${pathname.startsWith(href) ? " active" : ""}`}>
            <span className="bnav-icon">{icon}</span>
            <span className="bnav-label">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
