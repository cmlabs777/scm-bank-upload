import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import PlinkoClient from "./PlinkoClient";

export const metadata = { title: "공굴리기 — SCM" };

export default async function PlinkoPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <PlinkoClient />
    </AppShell>
  );
}
