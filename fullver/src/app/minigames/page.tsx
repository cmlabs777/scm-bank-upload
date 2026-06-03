import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export const metadata = { title: "미니게임 — SCM" };

const GAMES = [
  {
    href: "/minigames/ladder",
    icon: "🪜",
    title: "사다리",
    desc: "참여자와 당첨 후보를 입력하고 사다리로 저녁 메뉴를 정합니다.",
  },
  {
    href: "/minigames/plinko",
    icon: "⚪",
    title: "공굴리기",
    desc: "공이 먼저 떨어진 순서대로 당첨 항목을 배정합니다.",
  },
  {
    href: "/minigames/tetris",
    icon: "🟦",
    title: "테트리스",
    desc: "SRS 정식 버전 테트리스. 7-bag, 락딜레이, 고스트 피스 포함.",
  },
  {
    href: "/minigames/omok",
    icon: "⚫",
    title: "오목",
    desc: "AI와 1:1 대결. 쉬움·보통·어려움 난이도 선택 가능.",
  },
];

export default async function MiniGamesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell isAdmin={session.role === "admin"}>
      <div className="page-header">
        <h1>미니게임</h1>
      </div>

      <div className="minigame-grid">
        {GAMES.map(game => (
          <Link key={game.href} href={game.href} className="minigame-card">
            <span className="minigame-icon">{game.icon}</span>
            <strong>{game.title}</strong>
            <p>{game.desc}</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
