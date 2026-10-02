-- Company deletion requests never reached an admin. requestCompanyDeletionAction
-- wrote deletion_requested_at with a plain .update(), but company owners have
-- no UPDATE policy on companies (only platform admins do), so RLS matched
-- zero rows and the "request submitted" UI was a lie. The reason was also
-- stuffed into review_note, which belongs to member-submission review.
--
-- This moves the request behind an owner-checked security-definer RPC (the
-- same pattern as request_company_verification) and gives the reason its
-- own column. Platform admins decide from Companies → Deletion Requests.
alter table public.companies add column deletion_reason text;

-- Requests that did land (a platform admin who is also the owner) kept
-- their reason in review_note.
update public.companies
set deletion_reason = review_note, review_note = null
where deletion_requested_at is not null and status <> 'pending_review';

create index companies_deletion_requested_idx
  on public.companies (deletion_requested_at)
  where deletion_requested_at is not null;
create index companies_deletion_requested_by_idx on public.companies (deletion_requested_by);

create or replace function public.request_company_deletion(target_company_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.company_admins
    where company_id = target_company_id and profile_id = (select auth.uid()) and role = 'owner'
  ) then
    raise exception 'Only this company''s owner can request deletion.';
  end if;

  update public.companies
  set deletion_requested_at = now(),
      deletion_requested_by = (select auth.uid()),
      deletion_reason = nullif(left(btrim(coalesce(reason, '')), 2000), '')
  where id = target_company_id
    and deletion_requested_at is null
    and status <> 'archived';
  if not found then
    raise exception 'A deletion request is already pending for this company.';
  end if;
end;
$$;

revoke execute on function public.request_company_deletion(uuid, text) from public, anon;
grant execute on function public.request_company_deletion(uuid, text) to authenticated;
