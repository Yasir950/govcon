-- Files (documents and images) a company attaches when it answers an
-- admin's request for more information on its partner application.
-- Stored in a private bucket, one folder per company and application:
--   partner-application-files/{company_id}/{inquiry_id}/{file}
-- The browser uploads straight to Storage (company admins may write only
-- their own company's folder); respond_partner_info_request then records
-- the files together with the written response.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-application-files', 'partner-application-files', false, 10485760, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp'
])
on conflict (id) do nothing;

create policy "Company admins manage their partner application files"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'partner-application-files'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id::text = (storage.foldername(name))[1]
        and ca.profile_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'partner-application-files'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id::text = (storage.foldername(name))[1]
        and ca.profile_id = (select auth.uid())
    )
  );

create policy "Admins read partner application files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'partner-application-files' and public.is_admin((select auth.uid())));

create table public.partner_inquiry_attachments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.partner_inquiries(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  -- The admin question this file answered (partner_inquiries.info_request
  -- is overwritten by the next request, so keep it with the file).
  info_request text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index partner_inquiry_attachments_inquiry_idx on public.partner_inquiry_attachments(inquiry_id, created_at);

alter table public.partner_inquiry_attachments enable row level security;

-- Rows are only ever written by respond_partner_info_request.
create policy "Company admins view their partner application files"
  on public.partner_inquiry_attachments for select
  to authenticated
  using (public.is_company_admin(company_id, (select auth.uid())));

create policy "Admins view partner application files"
  on public.partner_inquiry_attachments for select
  to authenticated
  using (public.is_admin((select auth.uid())));

-- Replaces the text-only version: the response may now carry files, and
-- files alone (no text) are a valid answer.
-- p_attachments: [{ "path": text, "name": text }, ...] — paths must already
-- be uploaded under {company_id}/{inquiry_id}/.
drop function public.respond_partner_info_request(uuid, text);

create or replace function public.respond_partner_info_request(
  p_inquiry_id uuid,
  p_response text,
  p_attachments jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.partner_inquiries%rowtype;
  v_prefix text;
  v_file jsonb;
  v_object storage.objects%rowtype;
  v_count int := coalesce(jsonb_array_length(p_attachments), 0);
begin
  select * into v_inquiry
  from public.partner_inquiries
  where id = p_inquiry_id and status = 'info_requested'
  for update;
  if v_inquiry.id is null or v_inquiry.company_id is null then
    raise exception 'not_awaiting_response';
  end if;
  if auth.uid() is null or not public.is_company_admin(v_inquiry.company_id, auth.uid()) then
    raise exception 'not_company_admin';
  end if;
  if nullif(btrim(coalesce(p_response, '')), '') is null and v_count = 0 then
    raise exception 'missing_fields';
  end if;
  if v_count > 10 then
    raise exception 'too_many_files';
  end if;

  v_prefix := v_inquiry.company_id::text || '/' || v_inquiry.id::text || '/';
  for v_file in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    if left(v_file->>'path', length(v_prefix)) <> v_prefix then
      raise exception 'invalid_attachment';
    end if;
    select * into v_object
    from storage.objects
    where bucket_id = 'partner-application-files' and name = v_file->>'path';
    if v_object.id is null then
      raise exception 'invalid_attachment';
    end if;
    insert into public.partner_inquiry_attachments(
      inquiry_id, company_id, storage_path, file_name, content_type, size_bytes, info_request, uploaded_by
    )
    values (
      v_inquiry.id,
      v_inquiry.company_id,
      v_object.name,
      left(coalesce(nullif(btrim(v_file->>'name'), ''), split_part(v_object.name, '/', 3)), 255),
      coalesce(v_object.metadata->>'mimetype', 'application/octet-stream'),
      coalesce((v_object.metadata->>'size')::bigint, 0),
      v_inquiry.info_request,
      auth.uid()
    );
  end loop;

  update public.partner_inquiries
  set applicant_response = nullif(left(btrim(coalesce(p_response, '')), 5000), ''),
      responded_at = now(),
      status = 'pending'
  where id = p_inquiry_id;
end;
$$;

revoke execute on function public.respond_partner_info_request(uuid, text, jsonb) from public, anon;
grant execute on function public.respond_partner_info_request(uuid, text, jsonb) to authenticated;
