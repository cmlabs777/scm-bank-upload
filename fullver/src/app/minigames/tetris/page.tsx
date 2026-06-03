import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import TetrisClient from "./TetrisClient";

export const metadata = { title: "테트리스 — SCM" };

export default async function TetrisPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <TetrisClient />
    </AppShell>
  );
}
