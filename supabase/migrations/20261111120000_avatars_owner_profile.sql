-- =============================================================================
-- 1.1 avatars bucket, owner-only writes, owner read of bio (SCHEMA_V2.md §6, §9 O2)
--
-- Clients never see bio through profiles (column grant). The owner reads their
-- own full profile through get_my_profile(), a DEFINER function that only ever
-- returns the caller's row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Storage: avatars (public read by URL, writes only inside <user id>/)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Owner reads own avatar objects" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owner uploads own avatar objects" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owner updates own avatar objects" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Owner deletes own avatar objects" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- -----------------------------------------------------------------------------
-- Owner read of the full profile, including bio
-- -----------------------------------------------------------------------------
create or replace function public.get_my_profile()
returns table (
  id           uuid,
  display_name text,
  avatar_path  text,
  bio          text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_path, p.bio, p.created_at
  from public.profiles p
  where p.id = (select auth.uid());
$$;

revoke all on function public.get_my_profile() from public, anon, authenticated;
grant execute on function public.get_my_profile() to authenticated;
