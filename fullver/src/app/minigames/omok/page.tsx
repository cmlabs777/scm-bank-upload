import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import OmokClient from "./OmokClient";

export const metadata = { title: "오목 — SCM" };

export default async function OmokPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <OmokClient />
    </AppShell>
  );
}
