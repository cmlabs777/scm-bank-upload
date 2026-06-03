import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import HeroClient from "./HeroClient";

export const metadata = { title: "SCM 홈" };

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <HeroClient currentUserId={session.sub} />
    </AppShell>
  );
}
