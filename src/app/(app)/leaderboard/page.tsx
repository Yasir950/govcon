import { redirect } from "next/navigation";

// "Leaderboard page" from the rewards spec lives on the Rewards page.
export default function LeaderboardPage() {
  redirect("/rewards?tab=leaderboards");
}
