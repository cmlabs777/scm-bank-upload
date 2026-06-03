import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import CalendarClient from "./CalendarClient";

export const metadata = { title: "캘린더 — SCM" };

export default async function CalendarPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <CalendarClient currentUserId={session.sub} />
    </AppShell>
  );
}
