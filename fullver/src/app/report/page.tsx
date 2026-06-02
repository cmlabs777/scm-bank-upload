import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ReportClient from "./ReportClient";

export default async function ReportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <ReportClient />
    </AppShell>
  );
}
