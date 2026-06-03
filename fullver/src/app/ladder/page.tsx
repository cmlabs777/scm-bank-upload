import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import LadderClient from "./LadderClient";

export const metadata = { title: "사다리 — SCM" };

export default async function LadderPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <LadderClient />
    </AppShell>
  );
}
