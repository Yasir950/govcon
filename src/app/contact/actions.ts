"use server";

import { createClient } from "@/lib/supabase/server";

export type ContactActionResult = { error?: string; success?: boolean };

export async function submitContactMessageAction(
  _prevState: ContactActionResult,
  formData: FormData,
): Promise<ContactActionResult> {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!name || !email || !message) {
    return { error: "Please fill in your name, email, and message." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("contact_messages").insert({
    name,
    email,
    message,
    submitted_by: user?.id ?? null,
  });
  if (error) return { error: "Couldn't send your message. Please try again." };

  return { success: true };
}
