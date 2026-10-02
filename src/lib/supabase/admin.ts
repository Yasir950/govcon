import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Service-role client — bypasses RLS entirely. Only ever used server-side,
// and only where there's no signed-in user/cookie session to scope a write
// to (the Stripe webhook has no request cookies or auth.uid() at all, so
// the normal cookie-based client's RLS-protected "Users can update own
// profile" policy can't apply here). Never import this from a Client
// Component, and never call it from a route that has a real user session
// to work with instead.
export function createAdminClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
