-- =============================================================================
-- 3.1 favorites (SCHEMA_V2.md §5.1)
--
-- Private bookmarks: only the owner reads, adds or removes them, and only a
-- published recipe can be added. No update: a favorite is there or it is not.
-- =============================================================================

create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
create index favorites_recipe_id_idx on public.favorites (recipe_id);

revoke all on public.favorites from anon, authenticated;
grant select, delete on public.favorites to authenticated;
grant insert (user_id, recipe_id) on public.favorites to authenticated;

alter table public.favorites enable row level security;

create policy "Owner reads own favorites" on public.favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Owner adds published recipes" on public.favorites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
  );

create policy "Owner removes own favorites" on public.favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));
