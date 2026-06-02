import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import TransactionsClient from "./TransactionsClient";

export default async function TransactionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <AppShell isAdmin={session.role === "admin"}>
      <TransactionsClient />
    </AppShell>
  );
}
