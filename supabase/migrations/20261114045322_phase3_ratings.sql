-- =============================================================================
-- 3.3 ratings (SCHEMA_V2.md §5.3, §9 O3)
--
-- One 1-5 score per user and recipe. Scores of published recipes are public;
-- only the author changes or removes their score (a super admin may remove one).
-- There is no review text: written feedback is a comment (app-in4 §6.7).
-- The average is a view, not a stored number, so it can never drift (O3).
-- =============================================================================

create table public.ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  score      smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);
create index ratings_recipe_id_idx on public.ratings (recipe_id);

create trigger set_updated_at before update on public.ratings
  for each row execute function private.set_updated_at();

revoke all on public.ratings from anon, authenticated;
grant select on public.ratings to anon, authenticated;
grant insert (user_id, recipe_id, score) on public.ratings to authenticated;
grant update (score) on public.ratings to authenticated;
grant delete on public.ratings to authenticated;

alter table public.ratings enable row level security;

create policy "Public reads ratings of published recipes" on public.ratings
  for select to anon, authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published'));

create policy "Users rate published recipes as themselves" on public.ratings
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.status = 'published')
  );

create policy "Users change their own score" on public.ratings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users or super admins remove a score" on public.ratings
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_super_admin()));

-- security_invoker: the view sees exactly the rating rows the caller may see.
-- A recipe without ratings has no row: its average is unknown, never 0 (C5).
create view public.recipe_rating_summary
with (security_invoker = true) as
  select recipe_id,
         count(*)::int as rating_count,
         round(avg(score), 1) as avg_score
  from public.ratings
  group by recipe_id;

revoke all on public.recipe_rating_summary from anon, authenticated;
grant select on public.recipe_rating_summary to anon, authenticated;
