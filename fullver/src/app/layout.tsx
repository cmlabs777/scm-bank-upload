import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SCM 가계부",
  description: "SCM 가계부 관리 시스템",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
