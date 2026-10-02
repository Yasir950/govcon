"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LearningCatalog, QuizResult } from "@/lib/learning-status-types";

// Learning paths. learning_quiz_submit enforces the reading time, grades
// the quiz and pays the points; its error messages are member-facing.

export type LearnResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function submitQuizAction(lessonId: string, answers: number[]): Promise<LearnResult<QuizResult>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_quiz_submit", { p_lesson: lessonId, p_answers: answers });
  if (error || !data) return { ok: false, error: error?.message?.trim() || "Something went wrong. Please try again." };
  const result = data as unknown as QuizResult;
  if (result.passed) revalidatePath("/learn", "layout");
  return { ok: true, data: result };
}

// Home rail: the member's learning paths (also pays any lesson XP that was
// waiting on yesterday's daily cap).
export async function fetchLearningCatalogAction(): Promise<LearningCatalog | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("learning_catalog");
  if (error) {
    console.error("fetchLearningCatalogAction failed", error);
    return null;
  }
  return data as unknown as LearningCatalog;
}
