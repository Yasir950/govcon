-- Points & Rewards follow-up: members submit resources for admin review
-- (status 'draft' + submitted_by). Publishing one from /admin/resources pays
-- the submitter 50 XP ("Resource submitted and approved by an admin")
-- through the points_on_resource trigger.
create or replace function public.submit_member_resource(p_title text, p_type text, p_description text, p_url text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slug text;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Give the resource a title.'; end if;
  if coalesce(btrim(p_url), '') !~* '^https?://' then raise exception 'Add a link starting with http:// or https://.'; end if;
  if (select count(*) from public.resources where submitted_by = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can submit up to 5 resources a day.';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_title), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
  insert into public.resources (slug, title, type, format, description, url, is_pro, status, submitted_by)
  values (v_slug, btrim(p_title), coalesce(nullif(btrim(p_type), ''), 'Guide'), 'Link', coalesce(btrim(p_description), ''), btrim(p_url), false, 'draft', v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_member_resource(text, text, text, text) from public, anon;
grant execute on function public.submit_member_resource(text, text, text, text) to authenticated;
