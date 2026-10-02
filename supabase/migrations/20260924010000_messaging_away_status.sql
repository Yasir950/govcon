-- "Set away message" (the Messaging dock's "..." menu) — Pro-only, so a
-- real column rather than reusing an existing free-tier field. Disabling
-- is always allowed regardless of plan (in case someone downgrades while
-- it's on); only turning it on / editing the text while on is gated,
-- enforced server-side in setAwayMessageAction, not just hidden in the UI.
alter table public.profiles
  add column away_message text,
  add column away_message_enabled boolean not null default false;
