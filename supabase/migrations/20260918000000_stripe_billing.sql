-- Real Stripe billing needs somewhere to remember which Stripe customer/
-- subscription a profile is tied to, so the webhook (and the billing page)
-- can look a profile up by stripe_customer_id and keep plan_selection in
-- sync with the actual subscription state, instead of the plan being a
-- one-way value only ever set at signup.
alter table public.profiles
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text;

create index profiles_stripe_customer_id_idx on public.profiles (stripe_customer_id);
