import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "SCM 가계부",
  description: "수입·지출·투자를 한 곳에서 관리하는 가계부",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SCM",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#c4572a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
