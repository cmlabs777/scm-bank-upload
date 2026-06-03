"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/",             label: "홈",     icon: "🏡" },
  { href: "/transactions", label: "가계부", icon: "📒" },
  { href: "/report",       label: "리포트", icon: "📊" },
  { href: "/calendar",     label: "캘린더", icon: "📅" },
  { href: "/posts",        label: "게시판", icon: "📝" },
  { href: "/dashboard",    label: "입력",   icon: "📤" },
  { href: "/ladder",       label: "사다리", icon: "🪜" },
  { href: "/plinko",       label: "공굴리기", icon: "⚪" },
];

export default function AppShell({ children, isAdmin }: { children: React.ReactNode; isAdmin?: boolean }) {
  const pathname = usePathname();
  const router   = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const navItems = [
    ...NAV,
    ...(isAdmin ? [{ href: "/admin", label: "관리자", icon: "⚙️" }] : []),
  ];

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
              <Link href={href} className={`nav-item${(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? " active" : ""}`}>
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

      {/* Mobile bottom nav — horizontally scrollable, all tabs visible */}
      <nav className="bottom-nav">
        {navItems.map(({ href, label, icon }) => (
          <Link key={href} href={href} className={`bnav-item${(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? " active" : ""}`}>
            <span className="bnav-icon">{icon}</span>
            <span className="bnav-label">{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
