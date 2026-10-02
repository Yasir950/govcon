-- resources/testimonials already have sort_order; add the remaining
-- publish/schedule/feature/archive lifecycle columns for admin management.
alter table public.resources
  add column status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column featured boolean not null default false,
  add column scheduled_at timestamptz,
  add column archived_at timestamptz;

alter table public.testimonials
  add column status text not null default 'published' check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column featured boolean not null default false,
  add column scheduled_at timestamptz,
  add column archived_at timestamptz;

create policy "Admins manage all resources" on public.resources for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "Admins manage all testimonials" on public.testimonials for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
