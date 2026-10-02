-- Gives partner_inquiries (previously insert-only, no admin read path at
-- all -- see its own creation comment) a real review workflow (spec 8.4:
-- approved/rejected/waitlisted/suspended).
alter table public.partner_inquiries
  add column status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'waitlisted', 'suspended')),
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text;

create policy "Admins can view all partner inquiries"
  on public.partner_inquiries for select
  to authenticated
  using (public.is_admin((select auth.uid())));

create policy "Admins can update partner inquiries"
  on public.partner_inquiries for update
  to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));
