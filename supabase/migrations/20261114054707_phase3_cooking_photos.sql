-- =============================================================================
-- 3.5 cooking photos (SCHEMA_V2.md §5.4, §6)
--
-- A user's photo of a recipe they cooked. The file lives in the private bucket
-- cooking-photos under <user id>/; the row carries the review status, exactly
-- like comments (3.4): clients cannot write status, and editing the caption of
-- an approved photo sends it back to review. Who may read a file follows the
-- status of its row; nobody may overwrite a file (no UPDATE policy), so the
-- picture behind an approved photo can never be swapped.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cooking-photos', 'cooking-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create table public.cooking_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  recipe_id    uuid not null references public.recipes (id) on delete cascade,
  -- <user id>/<file name>.<jpg|png|webp>, always inside the author's own folder.
  storage_path text not null unique
               check (split_part(storage_path, '/', 1) = user_id::text
                      and storage_path ~ '^[^/]+/[A-Za-z0-9_-]+\.(jpg|png|webp)$'),
  -- Unknown is NULL: at most 250 characters, and not only whitespace.
  caption      text check (caption is null or (char_length(caption) <= 250 and caption ~ '\S')),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index cooking_photos_recipe_id_created_at_idx on public.cooking_photos (recipe_id, created_at desc);
create index cooking_photos_user_id_idx on public.cooking_photos (user_id);

create trigger reset_status_on_edit before update on public.cooking_photos
  for each row execute function private.reset_status_on_edit('caption');
create trigger set_updated_at before update on public.cooking_photos
  for each row execute function private.set_updated_at();

revoke all on public.cooking_photos from anon, authenticated;
grant select on public.cooking_photos to anon, authenticated;
-- No privilege on status: a client can neither choose nor change it. The file
-- path is fixed once written.
grant insert (user_id, recipe_id, storage_path, caption) on public.cooking_photos to authenticated;
grant update (caption) on public.cooking_photos to authenticated;
grant delete on public.cooking_photos to authenticated;

alter table public.cooking_photos enable row level security;

create policy "Public reads approved photos of published recipes" on public.cooking_photos
  for select to anon, authenticated
  using (
    status = 'approved'
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
  );

create policy "Authors read their own photos unless rejected" on public.cooking_photos
  for select to authenticated
  using (user_id = (select auth.uid()) and status <> 'rejected');

create policy "Moderators read every photo" on public.cooking_photos
  for select to authenticated
  using ((select private.is_moderator()));

create policy "Users add photos of published recipes as themselves" on public.cooking_photos
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
  );

create policy "Authors edit their own photos unless rejected" on public.cooking_photos
  for update to authenticated
  using (user_id = (select auth.uid()) and status <> 'rejected')
  with check (user_id = (select auth.uid()));

create policy "Authors or super admins remove a photo" on public.cooking_photos
  for delete to authenticated
  using ((user_id = (select auth.uid()) and status <> 'rejected') or (select private.is_super_admin()));

-- -----------------------------------------------------------------------------
-- Storage helpers. They must be SECURITY DEFINER: under the caller's RLS a
-- rejected row is invisible to its author, so "no row" would wrongly look like
-- an upload in flight.
-- -----------------------------------------------------------------------------
create or replace function private.can_read_cooking_photo_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_owner uuid;
  v_recipe_status text;
begin
  if v_uid is null then
    return false;
  end if;
  if private.is_moderator() then
    return true;
  end if;

  select p.status, p.user_id, r.status
    into v_status, v_owner, v_recipe_status
  from public.cooking_photos p
  join public.recipes r on r.id = p.recipe_id
  where p.storage_path = p_name;

  if not found then
    -- Upload in flight, the row does not exist yet: only the folder owner.
    return split_part(p_name, '/', 1) = v_uid::text;
  end if;
  if v_status = 'rejected' then
    return false;
  end if;
  if v_owner = v_uid then
    return true;
  end if;
  return v_status = 'approved' and v_recipe_status = 'published';
end;
$$;

create or replace function private.can_delete_cooking_photo_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  if private.is_super_admin() then
    return true;
  end if;
  -- The folder owner removes a file only once no row points at it: the row goes
  -- first, then the file; a failed upload is cleaned up the same way; and a
  -- rejected photo cannot be destroyed by its author.
  return split_part(p_name, '/', 1) = (select auth.uid())::text
    and not exists (select 1 from public.cooking_photos p where p.storage_path = p_name);
end;
$$;

revoke all on function private.can_read_cooking_photo_object(text) from public, anon, authenticated;
revoke all on function private.can_delete_cooking_photo_object(text) from public, anon, authenticated;
grant execute on function private.can_read_cooking_photo_object(text) to authenticated;
grant execute on function private.can_delete_cooking_photo_object(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage policies: cooking-photos
-- -----------------------------------------------------------------------------
create policy "Owner uploads cooking photos to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cooking-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Runs under anon's own RLS on cooking_photos and recipes, so anon calls no helper.
create policy "Public reads approved cooking photos" on storage.objects
  for select to anon
  using (
    bucket_id = 'cooking-photos'
    and exists (
      select 1
      from public.cooking_photos p
      join public.recipes r on r.id = p.recipe_id
      where p.storage_path = storage.objects.name
        and p.status = 'approved'
        and r.status = 'published'
    )
  );

create policy "Authorized read of cooking photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'cooking-photos' and private.can_read_cooking_photo_object(name));

create policy "Authorized delete of cooking photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cooking-photos' and private.can_delete_cooking_photo_object(name));
