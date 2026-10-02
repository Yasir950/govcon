import type { Metadata } from "next";
import { PredictionsBoardView } from "@/components/learning/PredictionsBoard";
import { createClient } from "@/lib/supabase/server";
import type { PredictionsBoard } from "@/lib/learning-status-types";

export const metadata: Metadata = { title: "Award predictions · GovConUnited" };
export const dynamic = "force-dynamic";

// Each season, up to 10 featured upcoming awards. Members pick the winner
// before picks lock; admins score them against public award data.
export default async function PredictionsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season } = await searchParams;
  const supabase = await createClient();
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase.rpc("predictions_board", { p_season: season || undefined }),
    supabase.auth.getUser(),
  ]);
  if (error) console.error("predictions_board failed", error);

  return (
    <section className="main">
      <div className="wrap">
        <div className="opps-app compact-btns learn-page">
          {data ? (
            <PredictionsBoardView board={data as unknown as PredictionsBoard} signedIn={Boolean(auth.user)} />
          ) : (
            <p className="meta">Predictions couldn&apos;t load. Please refresh the page.</p>
          )}
        </div>
      </div>
    </section>
  );
}
