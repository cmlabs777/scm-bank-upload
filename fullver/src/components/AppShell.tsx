"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard",    label: "대시보드", icon: "🏠" },
  { href: "/transactions", label: "거래내역", icon: "📋" },
  { href: "/report",       label: "리포트",   icon: "📊" },
];

export default function AppShell({ children, isAdmin }: { children: React.ReactNode; isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-coin">🪙</span>
          <span className="brand-name">SCM</span>
        </div>
        <ul className="nav-list">
          {NAV.map(({ href, label, icon }) => (
            <li key={href}>
              <Link href={href} className={`nav-item${pathname.startsWith(href) ? " active" : ""}`}>
                <span>{icon}</span>
                <span>{label}</span>
              </Link>
            </li>
          ))}
          {isAdmin && (
            <li>
              <Link href="/admin" className={`nav-item${pathname.startsWith("/admin") ? " active" : ""}`}>
                <span>⚙️</span>
                <span>관리자</span>
              </Link>
            </li>
          )}
        </ul>
        <button className="logout-btn" onClick={logout}>로그아웃</button>
      </nav>
      <main className="page-content">{children}</main>
    </div>
  );
}
