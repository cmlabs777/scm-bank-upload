import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import PostsClient from "./PostsClient";

export const metadata = { title: "게시판 — SCM" };

export default async function PostsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <PostsClient currentUserId={session.sub} />
    </AppShell>
  );
}
