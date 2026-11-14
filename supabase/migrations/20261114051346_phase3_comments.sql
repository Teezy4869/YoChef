-- =============================================================================
-- 3.4 comments (SCHEMA_V2.md §5.4)
--
-- Written feedback on a recipe. Every new comment waits for review: clients have
-- no privilege on status, so it always starts at its default 'pending' and only
-- the moderation RPC (3.6) changes it. Editing an approved comment sends it back
-- to review. Rejected comments are hidden from their author and frozen.
-- =============================================================================

-- Shared with cooking_photos (3.5): TG_ARGV[0] names the column whose change
-- needs a new review.
create or replace function private.reset_status_on_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'approved'
     and (to_jsonb(new) -> tg_argv[0]) is distinct from (to_jsonb(old) -> tg_argv[0]) then
    new.status := 'pending';
  end if;
  return new;
end;
$$;
revoke all on function private.reset_status_on_edit() from public, anon, authenticated;

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  -- At most 1000 characters, and not only whitespace.
  content    text not null check (char_length(content) <= 1000 and content ~ '\S'),
  status     text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_recipe_id_created_at_idx on public.comments (recipe_id, created_at desc);
create index comments_user_id_idx on public.comments (user_id);

create trigger reset_status_on_edit before update on public.comments
  for each row execute function private.reset_status_on_edit('content');
create trigger set_updated_at before update on public.comments
  for each row execute function private.set_updated_at();

revoke all on public.comments from anon, authenticated;
grant select on public.comments to anon, authenticated;
-- No privilege on status: a client can neither choose nor change it.
grant insert (user_id, recipe_id, content) on public.comments to authenticated;
grant update (content) on public.comments to authenticated;
grant delete on public.comments to authenticated;

alter table public.comments enable row level security;

-- No helper call here, so anon needs no privilege on schema private.
create policy "Public reads approved comments of published recipes" on public.comments
  for select to anon, authenticated
  using (
    status = 'approved'
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
  );

create policy "Authors read their own comments unless rejected" on public.comments
  for select to authenticated
  using (user_id = (select auth.uid()) and status <> 'rejected');

create policy "Moderators read every comment" on public.comments
  for select to authenticated
  using ((select private.is_moderator()));

create policy "Users comment on published recipes as themselves" on public.comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
  );

create policy "Authors edit their own comments unless rejected" on public.comments
  for update to authenticated
  using (user_id = (select auth.uid()) and status <> 'rejected')
  with check (user_id = (select auth.uid()));

create policy "Authors or super admins remove a comment" on public.comments
  for delete to authenticated
  using ((user_id = (select auth.uid()) and status <> 'rejected') or (select private.is_super_admin()));
