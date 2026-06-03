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

  function onNavTouchStart(e: React.TouchEvent) {
    txX.current = e.touches[0].clientX;
    txY.current = e.touches[0].clientY;
  }

  function onNavTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - txX.current;
    const dy = e.changedTouches[0].clientY - txY.current;

    // 수평 스와이프 판단: 60px 이상, 수직 움직임의 1.5배 이상
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

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

      {/* Page content */}
      <main className="page-content">{children}</main>

      {/* Mobile bottom nav — swipe left/right to navigate, admin excluded */}
      <nav
        className="bottom-nav"
        onTouchStart={onNavTouchStart}
        onTouchEnd={onNavTouchEnd}
      >
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
