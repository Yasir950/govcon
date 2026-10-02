-- Logo/cover (public) and internal documents (private) storage for
-- companies. New folder-scoping pattern vs. every prior bucket in this
-- app: the first path segment is a company_id, not a profile_id, so
-- write access is checked via company_admins membership rather than a
-- simple auth.uid() folder match.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-media', 'company-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "company-media publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'company-media');

create policy "Company admins upload their company's media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'company-media'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id = (storage.foldername(name))[1]::uuid
        and ca.profile_id = (select auth.uid())
    )
  );

create policy "Company admins replace their company's media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'company-media'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id = (storage.foldername(name))[1]::uuid
        and ca.profile_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'company-media'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id = (storage.foldername(name))[1]::uuid
        and ca.profile_id = (select auth.uid())
    )
  );

create policy "Company admins delete their company's media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-media'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id = (storage.foldername(name))[1]::uuid
        and ca.profile_id = (select auth.uid())
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-documents',
  'company-documents',
  false,
  10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy "Company admins manage their company's documents"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'company-documents'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id = (storage.foldername(name))[1]::uuid
        and ca.profile_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'company-documents'
    and exists (
      select 1 from public.company_admins ca
      where ca.company_id = (storage.foldername(name))[1]::uuid
        and ca.profile_id = (select auth.uid())
    )
  );
